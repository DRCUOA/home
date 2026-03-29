import { z } from "zod";
import { AGENT_SELL_STATUSES, SALE_STRATEGIES } from "../constants/enums.js";

export const createSellAgentSchema = z.object({
  project_id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  agency: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  appraisal_low: z.number().positive().optional(),
  appraisal_high: z.number().positive().optional(),
  commission_rate: z.number().min(0).max(100).optional(),
  marketing_estimate: z.number().positive().optional(),
  recommended_method: z.enum(SALE_STRATEGIES).optional(),
  notes: z.string().optional(),
  status: z.enum(AGENT_SELL_STATUSES).default("shortlisted"),
  rejection_reason: z.string().optional(),
});

export const updateSellAgentSchema = createSellAgentSchema.partial();

export type CreateSellAgentInput = z.infer<typeof createSellAgentSchema>;
export type UpdateSellAgentInput = z.infer<typeof updateSellAgentSchema>;
