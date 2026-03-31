import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";

const ExplainState = Annotation.Root({
  input: Annotation<string>,
  explanation: Annotation<string>,
  biggestCostDrivers: Annotation<string[]>,
  warnings: Annotation<string[]>,
  suggestions: Annotation<string[]>,
});

async function explainNode(state: typeof ExplainState.State) {
  const llm = getLLM();
  const response = await llm.invoke([
    {
      role: "system",
      content: `You are an expert NZ property financial advisor helping someone understand a home sale + purchase financial scenario. Explain in plain English what the numbers mean.

You should:
- Analyse the specific numbers provided (primary source)
- Supplement with general NZ financial context — typical commission rates, common costs, current market practices, etc. Prefix general knowledge observations with [General]
- Be practical and honest. Use NZD currency.

Return JSON:
- explanation: A clear 2-4 paragraph explanation of the financial position, what the numbers mean, and whether this looks safe or risky. Use [General] prefix for observations based on general NZ market knowledge rather than the user's specific data
- biggestCostDrivers: The 3-5 largest costs or factors affecting the outcome
- warnings: Any concerns or risks, including general NZ-specific financial risks. Prefix general knowledge items with [General] (0-4 items)
- suggestions: Ways to improve the financial position or reduce risk, including NZ-specific strategies. Prefix general knowledge items with [General] (0-4 items)

Return ONLY valid JSON.`,
    },
    { role: "user", content: state.input },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return {
      explanation: parsed.explanation || "",
      biggestCostDrivers: parsed.biggestCostDrivers || [],
      warnings: parsed.warnings || [],
      suggestions: parsed.suggestions || [],
    };
  } catch {
    return {
      explanation: response.content as string,
      biggestCostDrivers: [],
      warnings: [],
      suggestions: [],
    };
  }
}

const graph = new StateGraph(ExplainState)
  .addNode("explain", explainNode)
  .addEdge(START, "explain")
  .addEdge("explain", END);

export const explainScenarioWorkflow = graph.compile();
