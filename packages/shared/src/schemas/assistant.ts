import { z } from "zod";
import { AGENT_WORKFLOW_TYPES } from "../constants/enums.js";

export const runAssistantSchema = z.object({
  workflow_type: z.enum(AGENT_WORKFLOW_TYPES),
  input: z.string().min(1),
  project_id: z.string().uuid().optional(),
  property_id: z.string().uuid().optional(),
  source_ids: z.array(z.string().uuid()).default([]),
});

export type RunAssistantInput = z.infer<typeof runAssistantSchema>;
