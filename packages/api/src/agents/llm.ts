import { ChatOpenAI } from "@langchain/openai";

let _llm: ChatOpenAI | null = null;

export function getLLM(): ChatOpenAI {
  if (!_llm) {
    _llm = new ChatOpenAI({
      model: process.env.LLM_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _llm;
}
