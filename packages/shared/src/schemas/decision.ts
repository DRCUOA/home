import { z } from "zod";

export const createDecisionSchema = z.object({
  project_id: z.string().uuid().optional(),
  property_id: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  reasoning: z.string().optional(),
  assumptions: z.array(z.string()).default([]),
  risks_accepted: z.string().optional(),
  alternatives_considered: z.string().optional(),
});

export const updateDecisionSchema = createDecisionSchema.partial();

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;
export type UpdateDecisionInput = z.infer<typeof updateDecisionSchema>;
