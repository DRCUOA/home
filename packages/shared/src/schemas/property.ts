import { z } from "zod";
import {
  PROPERTY_TYPES,
  LISTING_METHODS,
  WATCHLIST_STATUSES,
} from "../constants/enums.js";

export const createPropertySchema = z.object({
  project_id: z.string().uuid(),
  address: z.string().min(1).max(500),
  suburb: z.string().max(200).optional(),
  city: z.string().max(200).optional(),
  price_asking: z.number().positive().optional(),
  price_guide_low: z.number().positive().optional(),
  price_guide_high: z.number().positive().optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  parking: z.number().int().min(0).optional(),
  land_area_sqm: z.number().positive().optional(),
  floor_area_sqm: z.number().positive().optional(),
  property_type: z.enum(PROPERTY_TYPES).optional(),
  listing_method: z.enum(LISTING_METHODS).optional(),
  listing_url: z.string().url().optional(),
  listing_description: z.string().optional(),
  watchlist_status: z.enum(WATCHLIST_STATUSES).optional(),
  rejection_reason: z.string().optional(),
  is_own_home: z.boolean().default(false),
});

export const updatePropertySchema = createPropertySchema.partial();

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
