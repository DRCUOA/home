import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";

const CompareState = Annotation.Root({
  input: Annotation<string>,
  comparisonSummary: Annotation<string>,
  tradeoffs: Annotation<string[]>,
  recommendation: Annotation<string>,
  missingInfo: Annotation<string[]>,
});

async function compareNode(state: typeof CompareState.State) {
  const llm = getLLM();
  const response = await llm.invoke([
    {
      role: "system",
      content: `You are helping a home buyer compare shortlisted properties. Given the property details, evaluations, pros, cons, and red flags for each, generate a structured comparison. Return JSON:
- comparisonSummary: A clear 2-3 paragraph comparison in plain English
- tradeoffs: Key trade-offs between the properties (3-6 items)
- recommendation: Which property seems strongest based on the data provided, and why (1-2 sentences)
- missingInfo: Information gaps that should be resolved before deciding (0-4 items)

Be honest about limitations. If data is incomplete, say so. Do not make up facts.
Return ONLY valid JSON.`,
    },
    { role: "user", content: state.input },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return {
      comparisonSummary: parsed.comparisonSummary || "",
      tradeoffs: parsed.tradeoffs || [],
      recommendation: parsed.recommendation || "",
      missingInfo: parsed.missingInfo || [],
    };
  } catch {
    return {
      comparisonSummary: response.content as string,
      tradeoffs: [],
      recommendation: "",
      missingInfo: [],
    };
  }
}

const graph = new StateGraph(CompareState)
  .addNode("compare", compareNode)
  .addEdge(START, "compare")
  .addEdge("compare", END);

export const comparePropertiesWorkflow = graph.compile();
