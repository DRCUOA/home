import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import {
  createPropertyCustomTypeSchema,
  updatePropertyCustomTypeSchema,
} from "@hcc/shared";
import { createCrudService } from "../services/crud.js";

const service = createCrudService({
  table: schema.propertyCustomTypes,
  userIdColumn: schema.propertyCustomTypes.user_id,
});

// Custom types are user-defined labels, so duplicates are almost always a
// typo or a double-submit — reject them instead of creating confusing twins.
async function nameTaken(userId: string, name: string, excludeId?: string) {
  const rows = await db
    .select({ id: schema.propertyCustomTypes.id, name: schema.propertyCustomTypes.name })
    .from(schema.propertyCustomTypes)
    .where(eq(schema.propertyCustomTypes.user_id, userId));
  const lower = name.toLowerCase();
  return rows.some((r) => r.id !== excludeId && r.name.toLowerCase() === lower);
}

export default async function propertyCustomTypeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/property-custom-types", async (req) =>
    service.list(req.userId, req.query as any)
  );

  app.get("/api/v1/property-custom-types/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.getById(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/property-custom-types", async (req, reply) => {
    const body = createPropertyCustomTypeSchema.parse(req.body);
    if (await nameTaken(req.userId, body.name)) {
      return reply
        .status(409)
        .send({ error: `A custom type named "${body.name}" already exists` });
    }
    const row = await service.create(body, req.userId);
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/property-custom-types/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updatePropertyCustomTypeSchema.parse(req.body);
    if (body.name && (await nameTaken(req.userId, body.name, id))) {
      return reply
        .status(409)
        .send({ error: `A custom type named "${body.name}" already exists` });
    }
    const row = await service.update(id, body, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.delete("/api/v1/property-custom-types/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    // Link rows cascade at the DB level, so deleting a type silently
    // unassigns it from every property.
    const row = await service.remove(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });
}
