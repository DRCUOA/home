import { z } from "zod";
import { RESEARCH_CATEGORIES } from "../constants/enums.js";

export const createResearchItemSchema = z.object({
  url: z.string().url().optional(),
  title: z.string().min(1).max(500),
  category: z.enum(RESEARCH_CATEGORIES).default("other"),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
  project_id: z.string().uuid().optional(),
  property_id: z.string().uuid().optional(),
});

export const updateResearchItemSchema = createResearchItemSchema.partial();

export type CreateResearchItemInput = z.infer<typeof createResearchItemSchema>;
export type UpdateResearchItemInput = z.infer<typeof updateResearchItemSchema>;
