import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";

const RecommendState = Annotation.Root({
  input: Annotation<string>,
  topActions: Annotation<string[]>,
  reasoning: Annotation<string>,
  stalledItems: Annotation<string[]>,
  upcomingDeadlines: Annotation<string[]>,
});

async function recommendNode(state: typeof RecommendState.State) {
  const llm = getLLM();
  const response = await llm.invoke([
    {
      role: "system",
      content: `You are a project manager helping someone manage their home sale and purchase. Based on all the open tasks, recent activity, and project status, recommend the 3 highest-value actions they should take next. Return JSON:
- topActions: The 3 most important things to do right now, in priority order
- reasoning: A brief explanation of why these are the priorities (2-3 sentences)
- stalledItems: Tasks or items that appear stuck or overdue (0-4 items)
- upcomingDeadlines: Important deadlines coming up soon (0-4 items)

Focus on what moves the needle most. Be specific and actionable.
Return ONLY valid JSON.`,
    },
    { role: "user", content: state.input },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return {
      topActions: parsed.topActions || [],
      reasoning: parsed.reasoning || "",
      stalledItems: parsed.stalledItems || [],
      upcomingDeadlines: parsed.upcomingDeadlines || [],
    };
  } catch {
    return {
      topActions: [],
      reasoning: response.content as string,
      stalledItems: [],
      upcomingDeadlines: [],
    };
  }
}

const graph = new StateGraph(RecommendState)
  .addNode("recommend", recommendNode)
  .addEdge(START, "recommend")
  .addEdge("recommend", END);

export const recommendActionsWorkflow = graph.compile();
