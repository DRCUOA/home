import { FastifyInstance } from "fastify";
import { eq, and, inArray } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import {
  createMoveSchema,
  updateMoveSchema,
  createMoveRoomSchema,
  updateMoveRoomSchema,
  createMoveItemSchema,
  updateMoveItemSchema,
  createMoveBoxSchema,
  updateMoveBoxSchema,
  createMoveStickerSchema,
  updateMoveStickerSchema,
  assignItemsRoomSchema,
  createMoveWallSchema,
  updateMoveWallSchema,
  createMoveOpeningSchema,
  updateMoveOpeningSchema,
  createMoveAnnotationSchema,
  updateMoveAnnotationSchema,
  createMoveLayerSchema,
  updateMoveLayerSchema,
} from "@hcc/shared";

/** Default layer seed — applied the first time the client GETs the layer
 *  list for a move that has no layer rows yet. Mirrors
 *  FLOOR_PLAN_DEFAULT_LAYERS on the client so ids align. */
const DEFAULT_LAYER_SEED = [
  { id: "walls", name: "Walls", visible: true, locked: false, sort_order: 10 },
  { id: "furniture", name: "Furniture", visible: true, locked: false, sort_order: 20 },
  { id: "annotations", name: "Annotations", visible: true, locked: false, sort_order: 30 },
  { id: "electrical", name: "Electrical", visible: false, locked: false, sort_order: 40 },
  { id: "plumbing", name: "Plumbing", visible: false, locked: false, sort_order: 50 },
] as const;

/**
 * Guard: every write goes through the user's own moves. We verify
 * ownership either by user_id on the move row, or by joining items/
 * rooms/boxes back to a move owned by the user.
 */
async function assertOwnsMove(userId: string, moveId: string) {
  const [row] = await db
    .select({ id: schema.moves.id })
    .from(schema.moves)
    .where(
      and(eq(schema.moves.id, moveId), eq(schema.moves.user_id, userId))
    )
    .limit(1);
  return !!row;
}

export default async function movingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  /* ---------- Moves ---------- */

  app.get("/api/v1/moves", async (req) => {
    const { project_id } = req.query as { project_id?: string };
    const conditions = [eq(schema.moves.user_id, req.userId)];
    if (project_id) conditions.push(eq(schema.moves.project_id, project_id));

    const rows = await db
      .select()
      .from(schema.moves)
      .where(and(...conditions));
    return { data: rows, total: rows.length };
  });

  app.get("/api/v1/moves/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(schema.moves)
      .where(
        and(eq(schema.moves.id, id), eq(schema.moves.user_id, req.userId))
      )
      .limit(1);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/moves", async (req, reply) => {
    const body = createMoveSchema.parse(req.body);

    // Ownership: confirm project belongs to user.
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, body.project_id),
          eq(schema.projects.user_id, req.userId)
        )
      )
      .limit(1);
    if (!project) {
      return reply.status(403).send({ error: "Project not owned by user" });
    }

    const [row] = await db
      .insert(schema.moves)
      .values({ ...body, user_id: req.userId })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/moves/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await assertOwnsMove(req.userId, id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const body = updateMoveSchema.parse(req.body);
    const [row] = await db
      .update(schema.moves)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.moves.id, id))
      .returning();
    return { data: row };
  });

  app.delete("/api/v1/moves/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await assertOwnsMove(req.userId, id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const [row] = await db
      .delete(schema.moves)
      .where(eq(schema.moves.id, id))
      .returning();
    return { data: row };
  });

  /* ---------- Move Rooms ---------- */

  app.get("/api/v1/moves/:moveId/rooms", async (req, reply) => {
    const { moveId } = req.params as { moveId: string };
    if (!(await assertOwnsMove(req.userId, moveId))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const rows = await db
      .select()
      .from(schema.moveRooms)
      .where(eq(schema.moveRooms.move_id, moveId));
    return { data: rows, total: rows.length };
  });

  app.post("/api/v1/move-rooms", async (req, reply) => {
    const body = createMoveRoomSchema.parse(req.body);
    if (!(await assertOwnsMove(req.userId, body.move_id))) {
      return reply.status(403).send({ error: "Move not owned by user" });
    }
    const [row] = await db
      .insert(schema.moveRooms)
      .values({
        move_id: body.move_id,
        side: body.side,
        name: body.name,
        color: body.color ?? "#8b5cf6",
        polygon: body.polygon ?? [],
        sort_order: body.sort_order ?? 0,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/move-rooms/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMoveRoomSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(schema.moveRooms)
      .where(eq(schema.moveRooms.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }

    const [row] = await db
      .update(schema.moveRooms)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.moveRooms.id, id))
      .returning();
    return { data: row };
  });

  app.delete("/api/v1/move-rooms/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(schema.moveRooms)
      .where(eq(schema.moveRooms.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const [row] = await db
      .delete(schema.moveRooms)
      .where(eq(schema.moveRooms.id, id))
      .returning();
    return { data: row };
  });

  /* ---------- Move Items ---------- */

  app.get("/api/v1/moves/:moveId/items", async (req, reply) => {
    const { moveId } = req.params as { moveId: string };
    if (!(await assertOwnsMove(req.userId, moveId))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const rows = await db
      .select()
      .from(schema.moveItems)
      .where(eq(schema.moveItems.move_id, moveId));
    return { data: rows, total: rows.length };
  });

  app.post("/api/v1/move-items", async (req, reply) => {
    const body = createMoveItemSchema.parse(req.body);
    if (!(await assertOwnsMove(req.userId, body.move_id))) {
      return reply.status(403).send({ error: "Move not owned by user" });
    }
    const [row] = await db
      .insert(schema.moveItems)
      .values({
        move_id: body.move_id,
        name: body.name,
        quantity: body.quantity ?? 1,
        origin_room_id: body.origin_room_id,
        destination_room_id: body.destination_room_id,
        box_id: body.box_id,
        status: body.status ?? "unpacked",
        category: body.category,
        value_estimate: body.value_estimate,
        fragile: body.fragile ?? false,
        photo_file_id: body.photo_file_id,
        notes: body.notes,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/move-items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMoveItemSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(schema.moveItems)
      .where(eq(schema.moveItems.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }

    const [row] = await db
      .update(schema.moveItems)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.moveItems.id, id))
      .returning();
    return { data: row };
  });

  app.delete("/api/v1/move-items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(schema.moveItems)
      .where(eq(schema.moveItems.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const [row] = await db
      .delete(schema.moveItems)
      .where(eq(schema.moveItems.id, id))
      .returning();
    return { data: row };
  });

  /**
   * HERO endpoint: bulk-reassign items to a destination room on the new
   * floor plan. Called when the user drag-drops one or more items from
   * the origin plan onto a room on the destination plan.
   */
  app.post("/api/v1/moves/:moveId/assign-destination", async (req, reply) => {
    const { moveId } = req.params as { moveId: string };
    if (!(await assertOwnsMove(req.userId, moveId))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const body = assignItemsRoomSchema.parse(req.body);

    // Verify all items belong to this move (defence in depth).
    const items = await db
      .select({ id: schema.moveItems.id, move_id: schema.moveItems.move_id })
      .from(schema.moveItems)
      .where(inArray(schema.moveItems.id, body.item_ids));
    const validIds = items.filter((i) => i.move_id === moveId).map((i) => i.id);
    if (validIds.length === 0) {
      return reply.status(400).send({ error: "No items belong to this move" });
    }

    await db
      .update(schema.moveItems)
      .set({
        destination_room_id: body.destination_room_id,
        updated_at: new Date(),
      })
      .where(inArray(schema.moveItems.id, validIds));

    return { data: { updated: validIds.length } };
  });

  /* ---------- Move Boxes ---------- */

  app.get("/api/v1/moves/:moveId/boxes", async (req, reply) => {
    const { moveId } = req.params as { moveId: string };
    if (!(await assertOwnsMove(req.userId, moveId))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const rows = await db
      .select()
      .from(schema.moveBoxes)
      .where(eq(schema.moveBoxes.move_id, moveId));
    return { data: rows, total: rows.length };
  });

  // Look up a box by its scanned barcode (scoped to user's moves).
  app.get("/api/v1/move-boxes/by-barcode/:code", async (req, reply) => {
    const { code } = req.params as { code: string };
    const rows = await db
      .select({
        box: schema.moveBoxes,
        move: schema.moves,
      })
      .from(schema.moveBoxes)
      .innerJoin(schema.moves, eq(schema.moveBoxes.move_id, schema.moves.id))
      .where(
        and(
          eq(schema.moveBoxes.barcode, code),
          eq(schema.moves.user_id, req.userId)
        )
      )
      .limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: "Not Found" });
    return { data: rows[0].box };
  });

  app.post("/api/v1/move-boxes", async (req, reply) => {
    const body = createMoveBoxSchema.parse(req.body);
    if (!(await assertOwnsMove(req.userId, body.move_id))) {
      return reply.status(403).send({ error: "Move not owned by user" });
    }
    const [row] = await db
      .insert(schema.moveBoxes)
      .values({
        move_id: body.move_id,
        barcode: body.barcode,
        label: body.label,
        destination_room_id: body.destination_room_id,
        fragile: body.fragile ?? false,
        priority: body.priority ?? "normal",
        notes: body.notes,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/move-boxes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMoveBoxSchema.parse(req.body);
    const [existing] = await db
      .select()
      .from(schema.moveBoxes)
      .where(eq(schema.moveBoxes.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const [row] = await db
      .update(schema.moveBoxes)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.moveBoxes.id, id))
      .returning();
    return { data: row };
  });

  app.delete("/api/v1/move-boxes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(schema.moveBoxes)
      .where(eq(schema.moveBoxes.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const [row] = await db
      .delete(schema.moveBoxes)
      .where(eq(schema.moveBoxes.id, id))
      .returning();
    return { data: row };
  });

  /* ---------- Move Stickers ---------- */

  app.get("/api/v1/moves/:moveId/stickers", async (req, reply) => {
    const { moveId } = req.params as { moveId: string };
    if (!(await assertOwnsMove(req.userId, moveId))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const rows = await db
      .select()
      .from(schema.moveStickers)
      .where(eq(schema.moveStickers.move_id, moveId));
    return { data: rows, total: rows.length };
  });

  app.post("/api/v1/move-stickers", async (req, reply) => {
    const body = createMoveStickerSchema.parse(req.body);
    if (!(await assertOwnsMove(req.userId, body.move_id))) {
      return reply.status(403).send({ error: "Move not owned by user" });
    }
    const [row] = await db
      .insert(schema.moveStickers)
      .values({
        move_id: body.move_id,
        side: body.side,
        kind: body.kind,
        x: body.x ?? 0.4,
        y: body.y ?? 0.4,
        width: body.width ?? 0.2,
        height: body.height ?? 0.1,
        rotation: body.rotation ?? 0,
        color: body.color,
        label: body.label,
        sort_order: body.sort_order ?? 0,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/move-stickers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMoveStickerSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(schema.moveStickers)
      .where(eq(schema.moveStickers.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }

    const [row] = await db
      .update(schema.moveStickers)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.moveStickers.id, id))
      .returning();
    return { data: row };
  });

  app.delete("/api/v1/move-stickers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(schema.moveStickers)
      .where(eq(schema.moveStickers.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const [row] = await db
      .delete(schema.moveStickers)
      .where(eq(schema.moveStickers.id, id))
      .returning();
    return { data: row };
  });

  /* ---------- Move Layers (floor plan designer, phase 2) ---------- */

  // List + auto-seed. Layers are per-move (not per-side) — seeded the
  // first time the editor asks for them so existing moves created before
  // phase 2 don't need a backfill migration.
  app.get("/api/v1/moves/:moveId/layers", async (req, reply) => {
    const { moveId } = req.params as { moveId: string };
    if (!(await assertOwnsMove(req.userId, moveId))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    let rows = await db
      .select()
      .from(schema.moveLayers)
      .where(eq(schema.moveLayers.move_id, moveId));
    if (rows.length === 0) {
      rows = await db
        .insert(schema.moveLayers)
        .values(
          DEFAULT_LAYER_SEED.map((l) => ({
            id: l.id,
            move_id: moveId,
            name: l.name,
            visible: l.visible,
            locked: l.locked,
            sort_order: l.sort_order,
          }))
        )
        .returning();
    }
    return { data: rows, total: rows.length };
  });

  app.post("/api/v1/move-layers", async (req, reply) => {
    const body = createMoveLayerSchema.parse(req.body);
    if (!(await assertOwnsMove(req.userId, body.move_id))) {
      return reply.status(403).send({ error: "Move not owned by user" });
    }
    const [row] = await db
      .insert(schema.moveLayers)
      .values({
        id: body.id,
        move_id: body.move_id,
        name: body.name,
        visible: body.visible ?? true,
        locked: body.locked ?? false,
        sort_order: body.sort_order ?? 0,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/moves/:moveId/layers/:id", async (req, reply) => {
    const { moveId, id } = req.params as { moveId: string; id: string };
    if (!(await assertOwnsMove(req.userId, moveId))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const body = updateMoveLayerSchema.parse(req.body);
    const [row] = await db
      .update(schema.moveLayers)
      .set({ ...body, updated_at: new Date() })
      .where(
        and(
          eq(schema.moveLayers.move_id, moveId),
          eq(schema.moveLayers.id, id)
        )
      )
      .returning();
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.delete("/api/v1/moves/:moveId/layers/:id", async (req, reply) => {
    const { moveId, id } = req.params as { moveId: string; id: string };
    if (!(await assertOwnsMove(req.userId, moveId))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    // Refuse to delete the last layer — editor needs at least one.
    const remaining = await db
      .select({ id: schema.moveLayers.id })
      .from(schema.moveLayers)
      .where(eq(schema.moveLayers.move_id, moveId));
    if (remaining.length <= 1) {
      return reply.status(409).send({ error: "Cannot delete the last layer" });
    }
    const [row] = await db
      .delete(schema.moveLayers)
      .where(
        and(
          eq(schema.moveLayers.move_id, moveId),
          eq(schema.moveLayers.id, id)
        )
      )
      .returning();
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  /* ---------- Move Walls ---------- */

  app.get("/api/v1/moves/:moveId/walls", async (req, reply) => {
    const { moveId } = req.params as { moveId: string };
    if (!(await assertOwnsMove(req.userId, moveId))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const rows = await db
      .select()
      .from(schema.moveWalls)
      .where(eq(schema.moveWalls.move_id, moveId));
    return { data: rows, total: rows.length };
  });

  app.post("/api/v1/move-walls", async (req, reply) => {
    const body = createMoveWallSchema.parse(req.body);
    if (!(await assertOwnsMove(req.userId, body.move_id))) {
      return reply.status(403).send({ error: "Move not owned by user" });
    }
    const [row] = await db
      .insert(schema.moveWalls)
      .values({
        move_id: body.move_id,
        side: body.side,
        x1: body.x1,
        y1: body.y1,
        x2: body.x2,
        y2: body.y2,
        thickness: body.thickness ?? 0.012,
        line_style: body.line_style ?? "solid",
        color: body.color ?? "#0f172a",
        layer_id: body.layer_id ?? "walls",
        locked: body.locked ?? false,
        hidden: body.hidden ?? false,
        label: body.label,
        sort_order: body.sort_order ?? 0,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/move-walls/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMoveWallSchema.parse(req.body);
    const [existing] = await db
      .select()
      .from(schema.moveWalls)
      .where(eq(schema.moveWalls.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const [row] = await db
      .update(schema.moveWalls)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.moveWalls.id, id))
      .returning();
    return { data: row };
  });

  app.delete("/api/v1/move-walls/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(schema.moveWalls)
      .where(eq(schema.moveWalls.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    // DB cascade drops attached openings; nothing extra to do here.
    const [row] = await db
      .delete(schema.moveWalls)
      .where(eq(schema.moveWalls.id, id))
      .returning();
    return { data: row };
  });

  /* ---------- Move Openings (doors / windows) ---------- */

  app.get("/api/v1/moves/:moveId/openings", async (req, reply) => {
    const { moveId } = req.params as { moveId: string };
    if (!(await assertOwnsMove(req.userId, moveId))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const rows = await db
      .select()
      .from(schema.moveOpenings)
      .where(eq(schema.moveOpenings.move_id, moveId));
    return { data: rows, total: rows.length };
  });

  app.post("/api/v1/move-openings", async (req, reply) => {
    const body = createMoveOpeningSchema.parse(req.body);
    if (!(await assertOwnsMove(req.userId, body.move_id))) {
      return reply.status(403).send({ error: "Move not owned by user" });
    }
    // Guard: wall must belong to the same move + side.
    const [wall] = await db
      .select({
        id: schema.moveWalls.id,
        move_id: schema.moveWalls.move_id,
        side: schema.moveWalls.side,
      })
      .from(schema.moveWalls)
      .where(eq(schema.moveWalls.id, body.wall_id))
      .limit(1);
    if (!wall || wall.move_id !== body.move_id || wall.side !== body.side) {
      return reply.status(400).send({ error: "wall_id does not belong to move/side" });
    }
    const [row] = await db
      .insert(schema.moveOpenings)
      .values({
        move_id: body.move_id,
        side: body.side,
        wall_id: body.wall_id,
        kind: body.kind,
        t: body.t ?? 0.5,
        width: body.width ?? 0.15,
        swing: body.swing ?? (body.kind === "window" ? "none" : "right"),
        layer_id: body.layer_id ?? "walls",
        locked: body.locked ?? false,
        hidden: body.hidden ?? false,
        label: body.label,
        sort_order: body.sort_order ?? 0,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/move-openings/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMoveOpeningSchema.parse(req.body);
    const [existing] = await db
      .select()
      .from(schema.moveOpenings)
      .where(eq(schema.moveOpenings.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    // If wall_id changes, make sure the new wall is on the same move+side.
    if (body.wall_id && body.wall_id !== existing.wall_id) {
      const [wall] = await db
        .select({
          id: schema.moveWalls.id,
          move_id: schema.moveWalls.move_id,
          side: schema.moveWalls.side,
        })
        .from(schema.moveWalls)
        .where(eq(schema.moveWalls.id, body.wall_id))
        .limit(1);
      if (!wall || wall.move_id !== existing.move_id || wall.side !== existing.side) {
        return reply.status(400).send({ error: "wall_id mismatch" });
      }
    }
    const [row] = await db
      .update(schema.moveOpenings)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.moveOpenings.id, id))
      .returning();
    return { data: row };
  });

  app.delete("/api/v1/move-openings/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(schema.moveOpenings)
      .where(eq(schema.moveOpenings.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const [row] = await db
      .delete(schema.moveOpenings)
      .where(eq(schema.moveOpenings.id, id))
      .returning();
    return { data: row };
  });

  /* ---------- Move Annotations ---------- */

  app.get("/api/v1/moves/:moveId/annotations", async (req, reply) => {
    const { moveId } = req.params as { moveId: string };
    if (!(await assertOwnsMove(req.userId, moveId))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const rows = await db
      .select()
      .from(schema.moveAnnotations)
      .where(eq(schema.moveAnnotations.move_id, moveId));
    return { data: rows, total: rows.length };
  });

  app.post("/api/v1/move-annotations", async (req, reply) => {
    const body = createMoveAnnotationSchema.parse(req.body);
    if (!(await assertOwnsMove(req.userId, body.move_id))) {
      return reply.status(403).send({ error: "Move not owned by user" });
    }
    const [row] = await db
      .insert(schema.moveAnnotations)
      .values({
        move_id: body.move_id,
        side: body.side,
        kind: body.kind,
        x: body.x,
        y: body.y,
        width: body.width,
        height: body.height,
        x2: body.x2,
        y2: body.y2,
        text: body.text,
        font_size_px: body.font_size_px ?? 12,
        bold: body.bold ?? false,
        color: body.color ?? "#0f172a",
        layer_id: body.layer_id ?? "annotations",
        locked: body.locked ?? false,
        hidden: body.hidden ?? false,
        sort_order: body.sort_order ?? 0,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/move-annotations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMoveAnnotationSchema.parse(req.body);
    const [existing] = await db
      .select()
      .from(schema.moveAnnotations)
      .where(eq(schema.moveAnnotations.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const [row] = await db
      .update(schema.moveAnnotations)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.moveAnnotations.id, id))
      .returning();
    return { data: row };
  });

  app.delete("/api/v1/move-annotations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(schema.moveAnnotations)
      .where(eq(schema.moveAnnotations.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not Found" });
    if (!(await assertOwnsMove(req.userId, existing.move_id))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    const [row] = await db
      .delete(schema.moveAnnotations)
      .where(eq(schema.moveAnnotations.id, id))
      .returning();
    return { data: row };
  });
}
