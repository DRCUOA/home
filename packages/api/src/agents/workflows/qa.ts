import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { tools as openaiTools } from "@langchain/openai";
import { getLLM } from "../llm.js";
import { semanticSearch } from "../embeddings.js";
import type { AssistantTool, ContextMessage } from "@hcc/shared";

const QAState = Annotation.Root({
  input: Annotation<string>,
  synthesized_input: Annotation<string>,
  image_base64: Annotation<string>,
  tools: Annotation<AssistantTool[]>,
  context_messages: Annotation<ContextMessage[]>,
  answer: Annotation<string>,
  citations: Annotation<Array<{ source_type: string; source_id: string; excerpt: string }>>,
  confidence: Annotation<string>,
  knowledge_sources: Annotation<string[]>,
  general_knowledge_note: Annotation<string>,
});

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === "text" || c.type === "output_text")
      .map((c: any) => c.text)
      .join("");
  }
  return String(content);
}

async function synthesizeContext(state: typeof QAState.State) {
  const ctx = state.context_messages ?? [];
  if (ctx.length === 0) {
    return { synthesized_input: state.input };
  }

  const llm = getLLM();
  const transcript = ctx
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const response = await llm.invoke([
    {
      role: "system",
      content: `You are a query rewriter. The user is continuing a conversation. You will receive prior conversation turns they selected as context, plus their new question.

Your job: produce a single, self-contained question (or instruction) that incorporates the essential context from the prior turns so it can be understood without the conversation history. Keep it concise but complete.

- Preserve specific names, numbers, dates, and details from the conversation
- Include only the context relevant to the new question
- Output ONLY the rewritten question/instruction, nothing else`,
    },
    {
      role: "user",
      content: `Prior conversation:\n${transcript}\n\nNew question: ${state.input}`,
    },
  ]);

  return { synthesized_input: extractTextContent(response.content) };
}

async function retrieveAndAnswer(state: typeof QAState.State) {
  const effectiveInput = state.synthesized_input || state.input;
  const searchResults = await semanticSearch(effectiveInput, 8);

  const context = searchResults
    .map(
      (r, i) =>
        `[Source ${i + 1}: ${r.source_type}/${r.source_id}]\n${r.content_preview}`
    )
    .join("\n\n");

  const hasContext = searchResults.length > 0;
  const hasImage = state.image_base64 && state.image_base64.length > 0;
  const enabledTools = state.tools ?? [];
  const useWebSearch = enabledTools.includes("web_search");

  const llm = getLLM();

  const webSearchBlock = useWebSearch
    ? `3. **Web search** (ACTIVE): You have live web search enabled. You MUST use it to look up current, real-world information relevant to the question — such as market conditions, agent/company reputation, property listings, recent news, legal updates, or anything that benefits from live data. Always include web-sourced findings in your answer and prefix them with "[Web]".`
    : "";

  const systemPrompt = `You are an expert assistant helping someone buy or sell a home in New Zealand. You have ${useWebSearch ? "three" : "two"} knowledge sources:

1. **App data** (PRIMARY): The user's own records provided below as context — projects, properties, notes, tasks, contacts, financials, etc. This is the authoritative source of truth about their specific situation.
2. **General knowledge** (SUPPLEMENTARY): Your training knowledge about NZ property law, real estate processes, market practices, finance, and home buying/selling. Use this to enrich answers, explain concepts, or answer when app data is insufficient.
${webSearchBlock}

Rules:
- Always prioritise app data when it exists. Cite it with [Source N] references.
- You MAY supplement with general knowledge about NZ property, real estate, and finance.
- Clearly distinguish between facts from the user's records and general knowledge.
- When using general knowledge, prefix those parts with "[General]" so the user knows.
${useWebSearch ? '- You MUST search the web and include "[Web]" prefixed information in your answer. The user explicitly enabled web search, so always use it.' : ""}
- Never invent facts about the user's specific situation — if their data doesn't say it, don't assume it.
${hasImage ? "- The user has attached a photo. Analyse it and incorporate what you see into your answer." : ""}

Return JSON:
- answer: Your answer in plain English. Use [Source N] for app data citations. Prefix general knowledge statements with [General].${useWebSearch ? ' Prefix web-sourced info with [Web]. You MUST include at least some [Web] content.' : ""}
- citations: Array of { source_type, source_id, excerpt } for each app data source you referenced
- confidence: "high" if well-supported by app data, "medium" if partially supported or supplemented with general knowledge, "low" if mostly general knowledge
- knowledge_sources: Array containing "app_data" and/or "general_knowledge"${useWebSearch ? ' and/or "web_search"' : ""} indicating which sources contributed${useWebSearch ? '. MUST include "web_search" when web search is enabled.' : ""}
- general_knowledge_note: Brief note about what general knowledge was used (empty string if none)

Return ONLY valid JSON.`;

  const userText = `Context from your records:\n${hasContext ? context : "No relevant data found in your records."}\n\nQuestion: ${effectiveInput}`;

  const userContent: any = hasImage
    ? [
        { type: "text", text: userText },
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${state.image_base64}` },
        },
      ]
    : userText;

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  const invokeOpts: Record<string, any> = {};
  if (useWebSearch) {
    invokeOpts.tools = [
      openaiTools.webSearch({
        search_context_size: "medium",
        userLocation: {
          type: "approximate",
          country: "NZ",
          timezone: "Pacific/Auckland",
        },
      }),
    ];
  }

  const response = await llm.invoke(messages, invokeOpts);
  const text = extractTextContent(response.content);

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    return {
      answer: parsed.answer || "",
      citations: parsed.citations || [],
      confidence: parsed.confidence || "low",
      knowledge_sources: parsed.knowledge_sources || (hasContext ? ["app_data"] : ["general_knowledge"]),
      general_knowledge_note: parsed.general_knowledge_note || "",
    };
  } catch {
    return {
      answer: text,
      citations: [],
      confidence: "low",
      knowledge_sources: useWebSearch ? ["web_search"] : ["general_knowledge"],
      general_knowledge_note: "",
    };
  }
}

const graph = new StateGraph(QAState)
  .addNode("synthesizeContext", synthesizeContext)
  .addNode("retrieveAndAnswer", retrieveAndAnswer)
  .addEdge(START, "synthesizeContext")
  .addEdge("synthesizeContext", "retrieveAndAnswer")
  .addEdge("retrieveAndAnswer", END);

export const qaWorkflow = graph.compile();
