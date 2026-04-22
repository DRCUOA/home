import { z } from "zod";
import {
  MOVE_STATUSES,
  MOVE_SIDES,
  MOVE_ITEM_STATUSES,
  MOVE_ITEM_CATEGORIES,
  MOVE_BOX_PRIORITIES,
  MOVE_STICKER_KINDS,
} from "../constants/enums.js";

/* ---------- Move ---------- */

export const createMoveSchema = z.object({
  project_id: z.string().uuid(),
  origin_property_id: z.string().uuid().optional(),
  destination_property_id: z.string().uuid().optional(),
  // Nullish so a PATCH can explicitly unset the plan ({ field: null })
  // to remove an uploaded floor plan without deleting the underlying file.
  origin_floor_plan_file_id: z.string().uuid().nullish(),
  destination_floor_plan_file_id: z.string().uuid().nullish(),
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
  // Legacy polygon (from the original draw-room tool). Rooms are now
  // also persisted as rectangles so their editor UX mirrors stickers
  // (move/resize/rotate); polygon is kept for backward-compat reading
  // of rows created before the sticker-ification migration.
  polygon: z.array(polygonPoint).optional(),
  // Sticker-compatible rectangle geometry. Optional on create so the
  // server can fall back to a centered default when the caller only
  // wants to stamp a room without positioning. Bounds mirror the sticker
  // validation so a room can briefly sit a little beyond the image edge
  // while the user drags it, same as every other sticker.
  x: z.number().min(-0.2).max(1.2).optional(),
  y: z.number().min(-0.2).max(1.2).optional(),
  width: z.number().min(0.01).max(2).optional(),
  height: z.number().min(0.01).max(2).optional(),
  rotation: z.number().min(-360).max(720).optional(),
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

/* ---------- Move Sticker ---------- */

export const createMoveStickerSchema = z.object({
  move_id: z.string().uuid(),
  side: z.enum(MOVE_SIDES),
  kind: z.enum(MOVE_STICKER_KINDS),
  x: z.number().min(-0.2).max(1.2).optional(),
  y: z.number().min(-0.2).max(1.2).optional(),
  width: z.number().min(0.01).max(2).optional(),
  height: z.number().min(0.01).max(2).optional(),
  rotation: z.number().min(-360).max(720).optional(),
  color: z.string().max(20).optional(),
  label: z.string().max(120).optional(),
  sort_order: z.number().int().optional(),
});
export const updateMoveStickerSchema = createMoveStickerSchema.partial();

export type CreateMoveStickerInput = z.infer<typeof createMoveStickerSchema>;
export type UpdateMoveStickerInput = z.infer<typeof updateMoveStickerSchema>;

/* ---------- Bulk room assignment (drag-drop hero) ---------- */

export const assignItemsRoomSchema = z.object({
  item_ids: z.array(z.string().uuid()).min(1),
  destination_room_id: z.string().uuid().nullable(),
});
export type AssignItemsRoomInput = z.infer<typeof assignItemsRoomSchema>;
