import { FastifyInstance } from "fastify";
import { authGuard } from "../middleware/auth.js";
import { createDecisionSchema, updateDecisionSchema } from "@hcc/shared";
import { createCrudService } from "../services/crud.js";
import { schema } from "../db/index.js";

const service = createCrudService({
  table: schema.decisions,
  userIdColumn: schema.decisions.user_id,
  index: {
    sourceType: "decision",
    fields: ["title", "reasoning", "assumptions", "risks_accepted", "alternatives_considered"],
  },
});

export default async function decisionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/decisions", async (req) => {
    return service.list(req.userId, req.query as any);
  });

  app.get("/api/v1/decisions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.getById(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/decisions", async (req, reply) => {
    const body = createDecisionSchema.parse(req.body);
    const row = await service.create(body, req.userId);
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/decisions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateDecisionSchema.parse(req.body);
    const row = await service.update(id, body, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.delete("/api/v1/decisions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.remove(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });
}
