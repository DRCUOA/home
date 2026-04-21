import { z } from "zod";
import {
  MOVE_STATUSES,
  MOVE_SIDES,
  MOVE_ITEM_STATUSES,
  MOVE_ITEM_CATEGORIES,
  MOVE_BOX_PRIORITIES,
} from "../constants/enums.js";

/* ---------- Move ---------- */

export const createMoveSchema = z.object({
  project_id: z.string().uuid(),
  origin_property_id: z.string().uuid().optional(),
  destination_property_id: z.string().uuid().optional(),
  origin_floor_plan_file_id: z.string().uuid().optional(),
  destination_floor_plan_file_id: z.string().uuid().optional(),
  move_date: z.string().max(20).optional(),
  status: z.enum(MOVE_STATUSES).optional(),
  notes: z.string().optional(),
});
export const updateMoveSchema = createMoveSchema.partial();

export type CreateMoveInput = z.infer<typeof createMoveSchema>;
export type UpdateMoveInput = z.infer<typeof updateMoveSchema>;

/* ---------- Move Room ---------- */

const polygonPoint = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const createMoveRoomSchema = z.object({
  move_id: z.string().uuid(),
  side: z.enum(MOVE_SIDES),
  name: z.string().min(1).max(120),
  color: z.string().max(20).optional(),
  polygon: z.array(polygonPoint).optional(),
  sort_order: z.number().int().optional(),
});
export const updateMoveRoomSchema = createMoveRoomSchema.partial();

export type CreateMoveRoomInput = z.infer<typeof createMoveRoomSchema>;
export type UpdateMoveRoomInput = z.infer<typeof updateMoveRoomSchema>;

/* ---------- Move Box ---------- */

export const createMoveBoxSchema = z.object({
  move_id: z.string().uuid(),
  barcode: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  destination_room_id: z.string().uuid().optional(),
  fragile: z.boolean().optional(),
  priority: z.enum(MOVE_BOX_PRIORITIES).optional(),
  notes: z.string().optional(),
});
export const updateMoveBoxSchema = createMoveBoxSchema.partial();

export type CreateMoveBoxInput = z.infer<typeof createMoveBoxSchema>;
export type UpdateMoveBoxInput = z.infer<typeof updateMoveBoxSchema>;

/* ---------- Move Item ---------- */

export const createMoveItemSchema = z.object({
  move_id: z.string().uuid(),
  name: z.string().min(1).max(300),
  quantity: z.number().int().min(1).optional(),
  origin_room_id: z.string().uuid().optional(),
  destination_room_id: z.string().uuid().optional(),
  box_id: z.string().uuid().optional(),
  status: z.enum(MOVE_ITEM_STATUSES).optional(),
  category: z.enum(MOVE_ITEM_CATEGORIES).optional(),
  value_estimate: z.number().positive().optional(),
  fragile: z.boolean().optional(),
  photo_file_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});
export const updateMoveItemSchema = createMoveItemSchema.partial();

export type CreateMoveItemInput = z.infer<typeof createMoveItemSchema>;
export type UpdateMoveItemInput = z.infer<typeof updateMoveItemSchema>;

/* ---------- Bulk room assignment (drag-drop hero) ---------- */

export const assignItemsRoomSchema = z.object({
  item_ids: z.array(z.string().uuid()).min(1),
  destination_room_id: z.string().uuid().nullable(),
});
export type AssignItemsRoomInput = z.infer<typeof assignItemsRoomSchema>;
