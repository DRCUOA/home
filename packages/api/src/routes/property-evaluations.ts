import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import {
  createPropertyEvaluationSchema,
  updatePropertyEvaluationSchema,
} from "@hcc/shared";

export default async function propertyEvaluationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/property-evaluations", async (req) => {
    const { property_id } = req.query as { property_id?: string };
    const conditions = [];
    if (property_id)
      conditions.push(
        eq(schema.propertyEvaluations.property_id, property_id)
      );

    const rows = await db
      .select()
      .from(schema.propertyEvaluations)
      .where(conditions.length > 0 ? conditions[0] : undefined);

    return { data: rows, total: rows.length };
  });

  app.get("/api/v1/property-evaluations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(schema.propertyEvaluations)
      .where(eq(schema.propertyEvaluations.id, id))
      .limit(1);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/property-evaluations", async (req, reply) => {
    const body = createPropertyEvaluationSchema.parse(req.body);
    const [row] = await db
      .insert(schema.propertyEvaluations)
      .values(body)
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/property-evaluations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updatePropertyEvaluationSchema.parse(req.body);
    const [row] = await db
      .update(schema.propertyEvaluations)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.propertyEvaluations.id, id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.delete("/api/v1/property-evaluations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(schema.propertyEvaluations)
      .where(eq(schema.propertyEvaluations.id, id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });
}
