import { FastifyInstance } from "fastify";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import {
  createCommunicationSchema,
  updateCommunicationSchema,
} from "@hcc/shared";
import { createCrudService } from "../services/crud.js";

const service = createCrudService({
  table: schema.communicationLogs,
  userIdColumn: schema.communicationLogs.user_id,
  index: {
    sourceType: "communication",
    fields: ["type", "subject", "body"],
  },
  audit: {
    entityType: "communication",
  },
});

export default async function communicationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/communications", async (req) => {
    return service.list(req.userId, req.query as any);
  });

  app.get("/api/v1/communications/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.getById(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/communications", async (req, reply) => {
    const body = createCommunicationSchema.parse(req.body);
    const row = await service.create(
      {
        ...body,
        occurred_at: new Date(body.occurred_at),
        follow_up_date: body.follow_up_date
          ? new Date(body.follow_up_date)
          : undefined,
      },
      req.userId
    );
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/communications/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateCommunicationSchema.parse(req.body);
    const updates: Record<string, any> = { ...body };
    if (body.occurred_at) updates.occurred_at = new Date(body.occurred_at);
    if (body.follow_up_date)
      updates.follow_up_date = new Date(body.follow_up_date);
    const row = await service.update(id, updates, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.delete("/api/v1/communications/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.remove(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });
}
