import { FastifyInstance } from "fastify";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { createProjectSchema, updateProjectSchema } from "@hcc/shared";
import { createCrudService } from "../services/crud.js";

const service = createCrudService({
  table: schema.projects,
  userIdColumn: schema.projects.user_id,
});

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
}
