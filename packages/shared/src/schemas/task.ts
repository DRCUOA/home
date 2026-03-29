import { z } from "zod";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  CHECKLIST_TYPES,
  CHECKLIST_STATES,
} from "../constants/enums.js";

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  due_date: z.string().optional(),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  status: z.enum(TASK_STATUSES).default("todo"),
  project_id: z.string().uuid().optional(),
  property_id: z.string().uuid().optional(),
  template_source: z.enum(CHECKLIST_TYPES).optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const createChecklistItemSchema = z.object({
  task_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  property_id: z.string().uuid().optional(),
  label: z.string().min(1).max(500),
  state: z.enum(CHECKLIST_STATES).default("not_started"),
  checklist_type: z.enum(CHECKLIST_TYPES),
  sort_order: z.number().int().default(0),
});

export const updateChecklistItemSchema = createChecklistItemSchema.partial();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
