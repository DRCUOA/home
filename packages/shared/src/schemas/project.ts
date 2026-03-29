import { z } from "zod";
import {
  PROJECT_TYPES,
  SELL_MILESTONES,
  BUY_MILESTONES,
  SALE_STRATEGIES,
} from "../constants/enums.js";

export const createProjectSchema = z.object({
  type: z.enum(PROJECT_TYPES),
  name: z.string().min(1).max(200),
  sale_strategy: z.enum(SALE_STRATEGIES).optional(),
  target_sale_price_low: z.number().positive().optional(),
  target_sale_price_high: z.number().positive().optional(),
  minimum_acceptable_price: z.number().positive().optional(),
  sale_timing_start: z.string().optional(),
  sale_timing_end: z.string().optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  sell_milestone: z.enum(SELL_MILESTONES).optional(),
  buy_milestone: z.enum(BUY_MILESTONES).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
