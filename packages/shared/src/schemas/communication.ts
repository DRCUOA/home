import { z } from "zod";
import { COMMUNICATION_TYPES } from "../constants/enums.js";

export const createCommunicationSchema = z.object({
  contact_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  property_id: z.string().uuid().optional(),
  type: z.enum(COMMUNICATION_TYPES),
  subject: z.string().max(500).optional(),
  body: z.string(),
  occurred_at: z.string(),
  follow_up_date: z.string().optional(),
  task_id: z.string().uuid().optional(),
  decision_id: z.string().uuid().optional(),
});

export const updateCommunicationSchema = createCommunicationSchema.partial();

export type CreateCommunicationInput = z.infer<typeof createCommunicationSchema>;
export type UpdateCommunicationInput = z.infer<typeof updateCommunicationSchema>;
