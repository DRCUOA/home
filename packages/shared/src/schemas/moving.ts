import { z } from "zod";
import {
  MOVE_STATUSES,
  MOVE_SIDES,
  MOVE_ITEM_STATUSES,
  MOVE_ITEM_CATEGORIES,
  MOVE_BOX_PRIORITIES,
  MOVE_STICKER_KINDS,
  MOVE_OPENING_KINDS,
  MOVE_OPENING_SWINGS,
  MOVE_ANNOTATION_KINDS,
  FLOOR_PLAN_LINE_STYLE_VALUES,
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

/* ---------- Floor Plan Designer primitives (phase 2) ---------- */

/** Normalized 0..1 coordinate with a tiny bit of slack so a drag can sit a
 *  touch beyond the image edge mid-gesture. Mirrors the sticker bounds. */
const normCoord = z.number().min(-0.2).max(1.2);
/** Normalized size/width/height along one axis. */
const normSize = z.number().min(0).max(2);

/* -- move_layers -- */

export const createMoveLayerSchema = z.object({
  move_id: z.string().uuid(),
  /** Stable id — seeded layers use "walls"/"furniture"/etc; custom layers
   *  pass a client-generated token (safe chars + up to 40 chars). */
  id: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "layer id must be [A-Za-z0-9_-]"),
  name: z.string().min(1).max(120),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});
export const updateMoveLayerSchema = createMoveLayerSchema
  .omit({ move_id: true, id: true })
  .partial();

export type CreateMoveLayerInput = z.infer<typeof createMoveLayerSchema>;
export type UpdateMoveLayerInput = z.infer<typeof updateMoveLayerSchema>;

/* -- move_walls -- */

export const createMoveWallSchema = z.object({
  move_id: z.string().uuid(),
  side: z.enum(MOVE_SIDES),
  x1: normCoord,
  y1: normCoord,
  x2: normCoord,
  y2: normCoord,
  thickness: z.number().min(0.001).max(0.1).optional(),
  line_style: z.enum(FLOOR_PLAN_LINE_STYLE_VALUES).optional(),
  color: z.string().max(20).optional(),
  layer_id: z.string().max(40).optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  label: z.string().max(120).optional(),
  sort_order: z.number().int().optional(),
});
export const updateMoveWallSchema = createMoveWallSchema
  .omit({ move_id: true, side: true })
  .partial();

export type CreateMoveWallInput = z.infer<typeof createMoveWallSchema>;
export type UpdateMoveWallInput = z.infer<typeof updateMoveWallSchema>;

/* -- move_openings -- */

export const createMoveOpeningSchema = z.object({
  move_id: z.string().uuid(),
  side: z.enum(MOVE_SIDES),
  wall_id: z.string().uuid(),
  kind: z.enum(MOVE_OPENING_KINDS),
  t: z.number().min(0).max(1).optional(),
  width: z.number().min(0).max(1).optional(),
  swing: z.enum(MOVE_OPENING_SWINGS).optional(),
  layer_id: z.string().max(40).optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  label: z.string().max(120).optional(),
  sort_order: z.number().int().optional(),
});
export const updateMoveOpeningSchema = createMoveOpeningSchema
  .omit({ move_id: true, side: true })
  .partial();

export type CreateMoveOpeningInput = z.infer<typeof createMoveOpeningSchema>;
export type UpdateMoveOpeningInput = z.infer<typeof updateMoveOpeningSchema>;

/* -- move_annotations -- */

export const createMoveAnnotationSchema = z.object({
  move_id: z.string().uuid(),
  side: z.enum(MOVE_SIDES),
  kind: z.enum(MOVE_ANNOTATION_KINDS),
  x: normCoord,
  y: normCoord,
  width: normSize.optional(),
  height: normSize.optional(),
  x2: normCoord.optional(),
  y2: normCoord.optional(),
  text: z.string().max(2000).optional(),
  font_size_px: z.number().min(6).max(72).optional(),
  bold: z.boolean().optional(),
  color: z.string().max(20).optional(),
  layer_id: z.string().max(40).optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});
export const updateMoveAnnotationSchema = createMoveAnnotationSchema
  .omit({ move_id: true, side: true })
  .partial();

export type CreateMoveAnnotationInput = z.infer<typeof createMoveAnnotationSchema>;
export type UpdateMoveAnnotationInput = z.infer<typeof updateMoveAnnotationSchema>;
