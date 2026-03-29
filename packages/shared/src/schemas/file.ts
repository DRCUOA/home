import { z } from "zod";
import { FILE_CATEGORIES } from "../constants/enums.js";

export const createFileSchema = z.object({
  filename: z.string().min(1).max(500),
  mime_type: z.string().max(200),
  size_bytes: z.number().int().positive(),
  category: z.enum(FILE_CATEGORIES).default("other"),
  project_id: z.string().uuid().optional(),
  property_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  communication_id: z.string().uuid().optional(),
  is_pinned: z.boolean().default(false),
});

export const updateFileSchema = z.object({
  category: z.enum(FILE_CATEGORIES).optional(),
  project_id: z.string().uuid().optional(),
  property_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  communication_id: z.string().uuid().optional(),
  is_pinned: z.boolean().optional(),
});

export type CreateFileInput = z.infer<typeof createFileSchema>;
export type UpdateFileInput = z.infer<typeof updateFileSchema>;
