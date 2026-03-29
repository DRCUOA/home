import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";

const CleanNotesState = Annotation.Root({
  input: Annotation<string>,
  cleanSummary: Annotation<string>,
  participants: Annotation<string[]>,
  keyOutcomes: Annotation<string[]>,
  nextSteps: Annotation<string[]>,
});

async function cleanNode(state: typeof CleanNotesState.State) {
  const llm = getLLM();
  const response = await llm.invoke([
    {
      role: "system",
      content: `Turn these rough notes from a call, meeting, or inspection into a clean, professional summary. Return JSON:
- cleanSummary: A well-written 2-4 paragraph summary of the conversation/meeting
- participants: Who was involved (if identifiable from the notes)
- keyOutcomes: Main decisions or outcomes (2-5 items)
- nextSteps: Actions to take after this interaction (1-5 items)

Return ONLY valid JSON.`,
    },
    { role: "user", content: state.input },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return {
      cleanSummary: parsed.cleanSummary || "",
      participants: parsed.participants || [],
      keyOutcomes: parsed.keyOutcomes || [],
      nextSteps: parsed.nextSteps || [],
    };
  } catch {
    return {
      cleanSummary: response.content as string,
      participants: [],
      keyOutcomes: [],
      nextSteps: [],
    };
  }
}

const graph = new StateGraph(CleanNotesState)
  .addNode("clean", cleanNode)
  .addEdge(START, "clean")
  .addEdge("clean", END);

export const cleanNotesWorkflow = graph.compile();
