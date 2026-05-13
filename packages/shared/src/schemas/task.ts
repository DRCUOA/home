import { z } from "zod";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_KINDS,
  CHECKLIST_TYPES,
  CHECKLIST_STATES,
} from "../constants/enums.js";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  due_date: z.string().optional(),
  // end_date and start_time accept null as "clear this field" from the
  // calendar's edit modal. Empty string is also normalized to null so the
  // tasks route can write the column without further branching.
  end_date: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null ? null : v)),
  start_time: z
    .union([
      z.string().regex(timeRegex, "Time must be in HH:MM format"),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => (v === "" || v === null ? null : v)),
  kind: z.enum(TASK_KINDS).default("task"),
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
