import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";
import { semanticSearch } from "../embeddings.js";

const QAState = Annotation.Root({
  input: Annotation<string>,
  answer: Annotation<string>,
  citations: Annotation<Array<{ source_type: string; source_id: string; excerpt: string }>>,
  confidence: Annotation<string>,
});

async function retrieveAndAnswer(state: typeof QAState.State) {
  const searchResults = await semanticSearch(state.input, 8);

  const context = searchResults
    .map(
      (r, i) =>
        `[Source ${i + 1}: ${r.source_type}/${r.source_id}]\n${r.content_preview}`
    )
    .join("\n\n");

  const llm = getLLM();
  const response = await llm.invoke([
    {
      role: "system",
      content: `You are answering a question about a home sale or purchase using the user's stored data. Use ONLY the provided context to answer. Cite sources using [Source N] references. If the context doesn't contain the answer, say so honestly.

Return JSON:
- answer: Your answer in plain English, with [Source N] citations inline
- citations: Array of { source_type, source_id, excerpt } for each source you referenced
- confidence: "high" if answer is well-supported, "medium" if partially, "low" if limited data

Return ONLY valid JSON.`,
    },
    {
      role: "user",
      content: `Context:\n${context || "No relevant data found in your records."}\n\nQuestion: ${state.input}`,
    },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return {
      answer: parsed.answer || "",
      citations: parsed.citations || [],
      confidence: parsed.confidence || "low",
    };
  } catch {
    return {
      answer: response.content as string,
      citations: [],
      confidence: "low",
    };
  }
}

const graph = new StateGraph(QAState)
  .addNode("retrieveAndAnswer", retrieveAndAnswer)
  .addEdge(START, "retrieveAndAnswer")
  .addEdge("retrieveAndAnswer", END);

export const qaWorkflow = graph.compile();
