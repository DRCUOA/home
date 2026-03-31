import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";
import { semanticSearch } from "../embeddings.js";

const QAState = Annotation.Root({
  input: Annotation<string>,
  image_base64: Annotation<string>,
  answer: Annotation<string>,
  citations: Annotation<Array<{ source_type: string; source_id: string; excerpt: string }>>,
  confidence: Annotation<string>,
  knowledge_sources: Annotation<string[]>,
  general_knowledge_note: Annotation<string>,
});

async function retrieveAndAnswer(state: typeof QAState.State) {
  const searchResults = await semanticSearch(state.input, 8);

  const context = searchResults
    .map(
      (r, i) =>
        `[Source ${i + 1}: ${r.source_type}/${r.source_id}]\n${r.content_preview}`
    )
    .join("\n\n");

  const hasContext = searchResults.length > 0;

  const llm = getLLM();

  const hasImage = state.image_base64 && state.image_base64.length > 0;

  const systemPrompt = `You are an expert assistant helping someone buy or sell a home in New Zealand. You have two knowledge sources:

1. **App data** (PRIMARY): The user's own records provided below as context — projects, properties, notes, tasks, contacts, financials, etc. This is the authoritative source of truth about their specific situation.
2. **General knowledge** (SUPPLEMENTARY): Your training knowledge about NZ property law, real estate processes, market practices, finance, and home buying/selling. Use this to enrich answers, explain concepts, or answer when app data is insufficient.

Rules:
- Always prioritise app data when it exists. Cite it with [Source N] references.
- You MAY supplement with general knowledge about NZ property, real estate, and finance.
- Clearly distinguish between facts from the user's records and general knowledge.
- When using general knowledge, prefix those parts with "[General]" so the user knows.
- Never invent facts about the user's specific situation — if their data doesn't say it, don't assume it.
${hasImage ? "- The user has attached a photo. Analyse it and incorporate what you see into your answer." : ""}

Return JSON:
- answer: Your answer in plain English. Use [Source N] for app data citations. Prefix general knowledge statements with [General].
- citations: Array of { source_type, source_id, excerpt } for each app data source you referenced
- confidence: "high" if well-supported by app data, "medium" if partially supported or supplemented with general knowledge, "low" if mostly general knowledge
- knowledge_sources: Array containing "app_data" and/or "general_knowledge" indicating which sources contributed
- general_knowledge_note: Brief note about what general knowledge was used (empty string if none)

Return ONLY valid JSON.`;

  const userText = `Context from your records:\n${hasContext ? context : "No relevant data found in your records."}\n\nQuestion: ${state.input}`;

  const userContent: any = hasImage
    ? [
        { type: "text", text: userText },
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${state.image_base64}` },
        },
      ]
    : userText;

  const response = await llm.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return {
      answer: parsed.answer || "",
      citations: parsed.citations || [],
      confidence: parsed.confidence || "low",
      knowledge_sources: parsed.knowledge_sources || (hasContext ? ["app_data"] : ["general_knowledge"]),
      general_knowledge_note: parsed.general_knowledge_note || "",
    };
  } catch {
    return {
      answer: response.content as string,
      citations: [],
      confidence: "low",
      knowledge_sources: ["general_knowledge"],
      general_knowledge_note: "",
    };
  }
}

const graph = new StateGraph(QAState)
  .addNode("retrieveAndAnswer", retrieveAndAnswer)
  .addEdge(START, "retrieveAndAnswer")
  .addEdge("retrieveAndAnswer", END);

export const qaWorkflow = graph.compile();
