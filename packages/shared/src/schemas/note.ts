import { z } from "zod";

export const createNoteSchema = z.object({
  body: z.string().min(1),
  project_id: z.string().uuid().optional(),
  property_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  communication_id: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
});

export const updateNoteSchema = createNoteSchema.partial();

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
