import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { upsertPropertyCriteriaSchema } from "@hcc/shared";

export default async function propertyCriteriaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/property-criteria", async (req) => {
    const { project_id } = req.query as { project_id?: string };
    if (!project_id) {
      const rows = await db.select().from(schema.propertyCriteria);
      return { data: rows, total: rows.length };
    }

    const [row] = await db
      .select()
      .from(schema.propertyCriteria)
      .where(eq(schema.propertyCriteria.project_id, project_id))
      .limit(1);

    return { data: row || null };
  });

  app.get("/api/v1/property-criteria/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const [row] = await db
      .select()
      .from(schema.propertyCriteria)
      .where(eq(schema.propertyCriteria.project_id, projectId))
      .limit(1);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.put("/api/v1/property-criteria", async (req, reply) => {
    const body = upsertPropertyCriteriaSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(schema.propertyCriteria)
      .where(eq(schema.propertyCriteria.project_id, body.project_id))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(schema.propertyCriteria)
        .set({ ...body, updated_at: new Date() })
        .where(eq(schema.propertyCriteria.project_id, body.project_id))
        .returning();
      return { data: row };
    }

    const [row] = await db
      .insert(schema.propertyCriteria)
      .values(body)
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.delete("/api/v1/property-criteria/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const [row] = await db
      .delete(schema.propertyCriteria)
      .where(eq(schema.propertyCriteria.project_id, projectId))
      .returning();
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });
}
