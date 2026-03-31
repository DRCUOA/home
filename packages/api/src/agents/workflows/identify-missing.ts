import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";

const MissingInfoState = Annotation.Root({
  input: Annotation<string>,
  missingDocuments: Annotation<string[]>,
  unresolvedQuestions: Annotation<string[]>,
  risksThatNeedClearing: Annotation<string[]>,
  readinessScore: Annotation<string>,
  recommendation: Annotation<string>,
});

async function identifyNode(state: typeof MissingInfoState.State) {
  const llm = getLLM();
  const response = await llm.invoke([
    {
      role: "system",
      content: `You are an expert NZ property advisor helping a home buyer check if they have everything needed before making an offer on a property.

You should:
- Assess completeness based on the specific data provided (primary source)
- Compare against the standard NZ due diligence checklist from your general knowledge — identify items that are typically required in NZ property transactions even if not mentioned in the data. Prefix general knowledge items with [General]

Based on the property details, due diligence status, evaluations, and checklists provided, identify what's missing. Return JSON:
- missingDocuments: Documents or reports not yet obtained, including standard NZ requirements. Prefix general knowledge items with [General] (0-6 items)
- unresolvedQuestions: Important questions that haven't been answered yet, including standard NZ due diligence questions. Prefix general knowledge items with [General] (0-6 items)
- risksThatNeedClearing: Known risks or red flags that should be resolved before offering (0-4 items)
- readinessScore: One of "ready", "almost_ready", "not_ready"
- recommendation: A 1-2 sentence recommendation on whether to proceed or what to do first

Return ONLY valid JSON.`,
    },
    { role: "user", content: state.input },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return {
      missingDocuments: parsed.missingDocuments || [],
      unresolvedQuestions: parsed.unresolvedQuestions || [],
      risksThatNeedClearing: parsed.risksThatNeedClearing || [],
      readinessScore: parsed.readinessScore || "not_ready",
      recommendation: parsed.recommendation || "",
    };
  } catch {
    return {
      missingDocuments: [],
      unresolvedQuestions: [],
      risksThatNeedClearing: [],
      readinessScore: "not_ready",
      recommendation: response.content as string,
    };
  }
}

const graph = new StateGraph(MissingInfoState)
  .addNode("identify", identifyNode)
  .addEdge(START, "identify")
  .addEdge("identify", END);

export const identifyMissingWorkflow = graph.compile();
