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
      content: `You are an expert assistant helping someone buy or sell a home in New Zealand. Extract structured information from the provided text.

You should:
- Extract facts and data points directly from the text (primary source)
- Supplement with relevant NZ property, legal, or financial knowledge where it adds value — prefix any such additions with [General]

Return a JSON object:
- keyFacts: Array of important facts/data points from the text (3-10 items)
- risks: Array of potential risks, issues, or red flags — both from the text and from your general NZ property knowledge. Prefix general knowledge items with [General] (0-5 items)
- actionItems: Array of things the user should do or follow up on — include best-practice recommendations prefixed with [General] (0-5 items)
- unansweredQuestions: Array of important questions not answered by this content, informed by what a NZ home buyer/seller typically needs to know (0-5 items)

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
