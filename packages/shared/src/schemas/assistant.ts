import { z } from "zod";
import { AGENT_WORKFLOW_TYPES, OPENAI_MODELS, ASSISTANT_TOOLS } from "../constants/enums.js";

export const contextMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type ContextMessage = z.infer<typeof contextMessageSchema>;

export const runAssistantSchema = z.object({
  workflow_type: z.enum(AGENT_WORKFLOW_TYPES),
  input: z.string().min(1),
  model: z.enum(OPENAI_MODELS).optional(),
  tools: z.array(z.enum(ASSISTANT_TOOLS)).default([]),
  context_messages: z.array(contextMessageSchema).default([]),
  project_id: z.string().uuid().optional(),
  property_id: z.string().uuid().optional(),
  source_ids: z.array(z.string().uuid()).default([]),
});

export type RunAssistantInput = z.infer<typeof runAssistantSchema>;
