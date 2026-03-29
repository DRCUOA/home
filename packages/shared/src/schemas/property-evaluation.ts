import { z } from "zod";
import { RISK_SEVERITIES } from "../constants/enums.js";

export const createPropertyEvaluationSchema = z.object({
  property_id: z.string().uuid(),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  red_flags: z.array(z.string()).default([]),
  criteria_fit: z
    .record(z.string(), z.enum(["met", "partial", "not_met", "unknown"]))
    .default({}),
  risk_severity: z.enum(RISK_SEVERITIES).optional(),
  visit_notes: z.string().optional(),
  visit_date: z.string().optional(),
  room_observations: z.record(z.string(), z.string()).default({}),
  questions_for_agent: z.array(z.string()).default([]),
  commute_notes: z.string().optional(),
  neighbourhood_notes: z.string().optional(),
  renovation_notes: z.string().optional(),
  ongoing_cost_notes: z.string().optional(),
});

export const updatePropertyEvaluationSchema =
  createPropertyEvaluationSchema.partial();

export type CreatePropertyEvaluationInput = z.infer<
  typeof createPropertyEvaluationSchema
>;
export type UpdatePropertyEvaluationInput = z.infer<
  typeof updatePropertyEvaluationSchema
>;
