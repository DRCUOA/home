import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";

const QuestionState = Annotation.Root({
  input: Annotation<string>,
  questionsForAgent: Annotation<string[]>,
  questionsForSolicitor: Annotation<string[]>,
  questionsForBroker: Annotation<string[]>,
  generalQuestions: Annotation<string[]>,
});

async function suggestNode(state: typeof QuestionState.State) {
  const llm = getLLM();
  const response = await llm.invoke([
    {
      role: "system",
      content: `You are an expert NZ property advisor. Based on the context provided (could be a communication log, inspection notes, or document summary), suggest follow-up questions the home buyer/seller should ask.

Draw on both the specific details in the text AND your general knowledge of NZ property transactions, common pitfalls, and best practices. Questions derived from general knowledge should be prefixed with [General].

Return JSON:
- questionsForAgent: Questions for the real estate agent (0-5)
- questionsForSolicitor: Questions for the solicitor/lawyer (0-3)
- questionsForBroker: Questions for the mortgage broker (0-3)
- generalQuestions: Other important questions to research or ask, including NZ-specific considerations (0-3)

Return ONLY valid JSON.`,
    },
    { role: "user", content: state.input },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return {
      questionsForAgent: parsed.questionsForAgent || [],
      questionsForSolicitor: parsed.questionsForSolicitor || [],
      questionsForBroker: parsed.questionsForBroker || [],
      generalQuestions: parsed.generalQuestions || [],
    };
  } catch {
    return {
      questionsForAgent: [],
      questionsForSolicitor: [],
      questionsForBroker: [],
      generalQuestions: [],
    };
  }
}

const graph = new StateGraph(QuestionState)
  .addNode("suggest", suggestNode)
  .addEdge(START, "suggest")
  .addEdge("suggest", END);

export const suggestQuestionsWorkflow = graph.compile();
