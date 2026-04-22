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
} from "@hcc/shared";

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
}
