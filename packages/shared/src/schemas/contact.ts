import { z } from "zod";
import { CONTACT_ROLES } from "../constants/enums.js";

export const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  organisation: z.string().max(200).optional(),
  role_tags: z.array(z.enum(CONTACT_ROLES)).default([]),
  notes: z.string().optional(),
  project_ids: z.array(z.string().uuid()).default([]),
});

export const updateContactSchema = createContactSchema.partial();

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
