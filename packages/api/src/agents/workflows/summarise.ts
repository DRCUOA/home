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
      content: `You are an assistant helping someone buy or sell a home. Summarise the provided document or content. Return a JSON object with these fields:
- summary: A clear 2-4 sentence summary
- keyPoints: Array of key facts/findings (3-8 items)
- risks: Array of potential risks or concerns mentioned (0-5 items)
- actionItems: Array of follow-up actions suggested by the content (0-5 items)

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
