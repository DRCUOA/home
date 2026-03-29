import { z } from "zod";
import { PROPERTY_TYPES } from "../constants/enums.js";

export const upsertPropertyCriteriaSchema = z.object({
  project_id: z.string().uuid(),
  must_haves: z.array(z.string()).default([]),
  nice_to_haves: z.array(z.string()).default([]),
  exclusions: z.array(z.string()).default([]),
  property_types: z.array(z.enum(PROPERTY_TYPES)).default([]),
  locations: z.array(z.string()).default([]),
  budget_ceiling: z.number().positive().optional(),
  timing_window_start: z.string().optional(),
  timing_window_end: z.string().optional(),
  financing_assumptions: z
    .object({
      deposit_percent: z.number().optional(),
      interest_rate: z.number().optional(),
      loan_term_years: z.number().optional(),
      pre_approval_amount: z.number().optional(),
    })
    .optional(),
});

export type UpsertPropertyCriteriaInput = z.infer<
  typeof upsertPropertyCriteriaSchema
>;
