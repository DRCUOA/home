import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";

const SummariseState = Annotation.Root({
  input: Annotation<string>,
  summary: Annotation<string>,
  keyPoints: Annotation<string[]>,
  risks: Annotation<string[]>,
  actionItems: Annotation<string[]>,
});

async function summariseNode(state: typeof SummariseState.State) {
  const llm = getLLM();
  const response = await llm.invoke([
    {
      role: "system",
      content: `You are an expert assistant helping someone buy or sell a home in New Zealand. Summarise the provided document or content.

You should:
- Extract facts directly from the provided text (primary source)
- Where relevant, add context from your general knowledge of NZ property law, real estate processes, or finance — prefix any such additions with [General] so the user can distinguish them from facts in the document

Return a JSON object with these fields:
- summary: A clear 2-4 sentence summary
- keyPoints: Array of key facts/findings (3-8 items). Prefix any general-knowledge additions with [General]
- risks: Array of potential risks or concerns — both those mentioned in the text AND any you identify from general NZ property knowledge. Prefix general knowledge items with [General] (0-5 items)
- actionItems: Array of follow-up actions suggested by the content or recommended from general best practice. Prefix general knowledge items with [General] (0-5 items)

Return ONLY valid JSON, no markdown.`,
    },
    { role: "user", content: state.input },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return {
      summary: parsed.summary || "",
      keyPoints: parsed.keyPoints || [],
      risks: parsed.risks || [],
      actionItems: parsed.actionItems || [],
    };
  } catch {
    return {
      summary: response.content as string,
      keyPoints: [],
      risks: [],
      actionItems: [],
    };
  }
}

const graph = new StateGraph(SummariseState)
  .addNode("summarise", summariseNode)
  .addEdge(START, "summarise")
  .addEdge("summarise", END);

export const summariseWorkflow = graph.compile();
