import { AsyncLocalStorage } from "node:async_hooks";
import { ChatOpenAI } from "@langchain/openai";

interface LLMContext {
  model: string;
}

const llmStore = new AsyncLocalStorage<LLMContext>();
const llmCache = new Map<string, ChatOpenAI>();

export function getLLM(modelOverride?: string): ChatOpenAI {
  const ctx = llmStore.getStore();
  const model =
    modelOverride ?? ctx?.model ?? process.env.LLM_MODEL ?? "gpt-4o-mini";

  let llm = llmCache.get(model);
  if (!llm) {
    llm = new ChatOpenAI({
      model,
      temperature: 0.3,
      apiKey: process.env.OPENAI_API_KEY,
    });
    llmCache.set(model, llm);
  }
  return llm;
}

export function withModel<T>(model: string, fn: () => Promise<T>): Promise<T> {
  return llmStore.run({ model }, fn);
}
