import { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import {
  createProjectSchema,
  updateProjectSchema,
  DEFAULT_SELL_CHECKLIST_ITEMS,
} from "@hcc/shared";
import { createCrudService } from "../services/crud.js";

const service = createCrudService({
  table: schema.projects,
  userIdColumn: schema.projects.user_id,
  index: {
    sourceType: "project",
    fields: ["name", "type", "sale_strategy", "sell_milestone", "buy_milestone"],
  },
});

/**
 * Seed the default sell checklist items for a newly-created sell project.
 * Fire-and-forget semantics: if the insert fails we log and continue so
 * the project-create response is not held up by a downstream problem.
 */
async function seedDefaultSellChecklist(projectId: string, userId: string) {
  try {
    await db.insert(schema.checklistItems).values(
      DEFAULT_SELL_CHECKLIST_ITEMS.map((item) => ({
        user_id: userId,
        project_id: projectId,
        label: item.label,
        checklist_type: item.checklist_type,
        state: "not_started",
        sort_order: item.sort_order,
      }))
    );
  } catch (err) {
    console.error(
      `[Projects] Failed to seed default sell checklist for ${projectId}:`,
      (err as Error).message
    );
  }
}

export default async function projectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/projects", async (req) => {
    return service.list(req.userId, req.query as any);
  });

  app.get("/api/v1/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.getById(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/projects", async (req, reply) => {
    const body = createProjectSchema.parse(req.body);
    const row = await service.create(body, req.userId);
    if (row?.type === "sell") {
      await seedDefaultSellChecklist(row.id, req.userId);
    }
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateProjectSchema.parse(req.body);
    const row = await service.update(id, body, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.delete("/api/v1/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.remove(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  /**
   * Load the default sell checklist items into an existing sell project.
   * Skips any item whose (label, checklist_type) already exists for this
   * project/user so the button is safe to press repeatedly.
   */
  app.post("/api/v1/projects/:id/load-default-checklist", async (req, reply) => {
    const { id } = req.params as { id: string };

    const project = await service.getById(id, req.userId);
    if (!project) return reply.status(404).send({ error: "Not Found" });
    if (project.type !== "sell") {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Default checklist is only available for sell projects.",
      });
    }

    const existing = await db
      .select({
        label: schema.checklistItems.label,
        checklist_type: schema.checklistItems.checklist_type,
      })
      .from(schema.checklistItems)
      .where(
        and(
          eq(schema.checklistItems.user_id, req.userId),
          eq(schema.checklistItems.project_id, id)
        )
      );

    const have = new Set(existing.map((e) => `${e.checklist_type}::${e.label}`));
    const toInsert = DEFAULT_SELL_CHECKLIST_ITEMS.filter(
      (d) => !have.has(`${d.checklist_type}::${d.label}`)
    );

    if (toInsert.length === 0) {
      return reply.send({ data: [], total: 0 });
    }

    const inserted = await db
      .insert(schema.checklistItems)
      .values(
        toInsert.map((item) => ({
          user_id: req.userId,
          project_id: id,
          label: item.label,
          checklist_type: item.checklist_type,
          state: "not_started",
          sort_order: item.sort_order,
        }))
      )
      .returning();

    return reply.status(201).send({ data: inserted, total: inserted.length });
  });
}
