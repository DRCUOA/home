import { z } from "zod";
import {
  OFFER_DIRECTIONS,
  OFFER_STATUSES,
  OFFER_CONDITIONS,
} from "../constants/enums.js";

export const createOfferSchema = z.object({
  property_id: z.string().uuid(),
  project_id: z.string().uuid(),
  direction: z.enum(OFFER_DIRECTIONS),
  price: z.number().positive(),
  conditions: z.array(z.enum(OFFER_CONDITIONS)).default([]),
  conditions_detail: z.string().optional(),
  settlement_date: z.string().optional(),
  deposit: z.number().positive().optional(),
  status: z.enum(OFFER_STATUSES).default("draft"),
  counter_offer_parent_id: z.string().uuid().optional(),
  decision_reasoning: z.string().optional(),
  notes: z.string().optional(),
});

export const updateOfferSchema = createOfferSchema.partial();

export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
