import { z } from "zod";
import {
  AGENT_WORKFLOW_TYPES,
  OPENAI_MODELS,
  ASSISTANT_TOOLS,
  TASK_KINDS,
  TASK_PRIORITIES,
} from "../constants/enums.js";

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

export const proposedActionSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional().default(""),
  kind: z.enum(TASK_KINDS).default("task"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  suggested_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional()
    .nullable(),
});

export type ProposedAction = z.infer<typeof proposedActionSchema>;
