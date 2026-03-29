import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";

const ProjectSummaryState = Annotation.Root({
  input: Annotation<string>,
  overallStatus: Annotation<string>,
  sellSummary: Annotation<string>,
  buySummary: Annotation<string>,
  financialSummary: Annotation<string>,
  keyDecisionsPending: Annotation<string[]>,
  risksSummary: Annotation<string[]>,
});

async function summaryNode(state: typeof ProjectSummaryState.State) {
  const llm = getLLM();
  const response = await llm.invoke([
    {
      role: "system",
      content: `You are summarising the current state of someone's home sale and purchase journey. Based on the project data provided, create a comprehensive status summary. Return JSON:
- overallStatus: A 1-2 sentence executive summary of where things stand
- sellSummary: Current state of the sale (2-3 sentences), or "No active sale" if not applicable
- buySummary: Current state of the purchase search (2-3 sentences), or "No active purchase" if not applicable
- financialSummary: Financial position summary (2-3 sentences)
- keyDecisionsPending: Decisions that need to be made soon (0-4 items)
- risksSummary: Key risks or concerns across the whole project (0-4 items)

Be concise and factual. Base everything on the data provided.
Return ONLY valid JSON.`,
    },
    { role: "user", content: state.input },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return {
      overallStatus: parsed.overallStatus || "",
      sellSummary: parsed.sellSummary || "",
      buySummary: parsed.buySummary || "",
      financialSummary: parsed.financialSummary || "",
      keyDecisionsPending: parsed.keyDecisionsPending || [],
      risksSummary: parsed.risksSummary || [],
    };
  } catch {
    return {
      overallStatus: response.content as string,
      sellSummary: "",
      buySummary: "",
      financialSummary: "",
      keyDecisionsPending: [],
      risksSummary: [],
    };
  }
}

const graph = new StateGraph(ProjectSummaryState)
  .addNode("summary", summaryNode)
  .addEdge(START, "summary")
  .addEdge("summary", END);

export const projectSummaryWorkflow = graph.compile();
