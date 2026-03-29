import { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { createPropertySchema, updatePropertySchema } from "@hcc/shared";

export default async function propertyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/properties", async (req) => {
    const { project_id, watchlist_status } = req.query as any;
    const conditions = [];

    if (project_id) conditions.push(eq(schema.properties.project_id, project_id));
    if (watchlist_status) conditions.push(eq(schema.properties.watchlist_status, watchlist_status));

    const userProjects = db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.user_id, req.userId));

    const rows = await db
      .select()
      .from(schema.properties)
      .where(
        conditions.length > 0
          ? and(...conditions)
          : undefined
      );

    return { data: rows, total: rows.length };
  });

  app.get("/api/v1/properties/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.id, id))
      .limit(1);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/properties", async (req, reply) => {
    const body = createPropertySchema.parse(req.body);
    const [row] = await db
      .insert(schema.properties)
      .values(body)
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/properties/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updatePropertySchema.parse(req.body);
    const [row] = await db
      .update(schema.properties)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.properties.id, id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.delete("/api/v1/properties/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(schema.properties)
      .where(eq(schema.properties.id, id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.get("/api/v1/properties/:id/evaluations", async (req) => {
    const { id } = req.params as { id: string };
    const rows = await db
      .select()
      .from(schema.propertyEvaluations)
      .where(eq(schema.propertyEvaluations.property_id, id));
    return { data: rows };
  });

  app.get("/api/v1/properties/:id/offers", async (req) => {
    const { id } = req.params as { id: string };
    const rows = await db
      .select()
      .from(schema.offers)
      .where(eq(schema.offers.property_id, id));
    return { data: rows };
  });
}
