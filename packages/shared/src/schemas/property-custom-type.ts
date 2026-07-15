import { z } from "zod";
import { CUSTOM_TYPE_COLORS } from "../constants/enums.js";

export const createPropertyCustomTypeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.enum(CUSTOM_TYPE_COLORS).default("default"),
});

export const updatePropertyCustomTypeSchema =
  createPropertyCustomTypeSchema.partial();

export const setPropertyCustomTypesSchema = z.object({
  custom_type_ids: z.array(z.string().uuid()).max(100),
});

export type CreatePropertyCustomTypeInput = z.infer<
  typeof createPropertyCustomTypeSchema
>;
export type UpdatePropertyCustomTypeInput = z.infer<
  typeof updatePropertyCustomTypeSchema
>;
export type SetPropertyCustomTypesInput = z.infer<
  typeof setPropertyCustomTypesSchema
>;
