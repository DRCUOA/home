import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";

const ExtractState = Annotation.Root({
  input: Annotation<string>,
  keyFacts: Annotation<string[]>,
  risks: Annotation<string[]>,
  actionItems: Annotation<string[]>,
  unansweredQuestions: Annotation<string[]>,
});

async function extractNode(state: typeof ExtractState.State) {
  const llm = getLLM();
  const response = await llm.invoke([
    {
      role: "system",
      content: `You are helping someone buy or sell a home. Extract structured information from the provided text. Return a JSON object:
- keyFacts: Array of important facts/data points (3-10 items)
- risks: Array of potential risks, issues, or red flags (0-5 items)
- actionItems: Array of things the user should do or follow up on (0-5 items)
- unansweredQuestions: Array of important questions not answered by this content (0-5 items)

Return ONLY valid JSON.`,
    },
    { role: "user", content: state.input },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return {
      keyFacts: parsed.keyFacts || [],
      risks: parsed.risks || [],
      actionItems: parsed.actionItems || [],
      unansweredQuestions: parsed.unansweredQuestions || [],
    };
  } catch {
    return { keyFacts: [], risks: [], actionItems: [], unansweredQuestions: [] };
  }
}

const graph = new StateGraph(ExtractState)
  .addNode("extract", extractNode)
  .addEdge(START, "extract")
  .addEdge("extract", END);

export const extractKeyPointsWorkflow = graph.compile();
