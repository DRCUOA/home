import { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { createContactSchema, updateContactSchema } from "@hcc/shared";
import { createCrudService } from "../services/crud.js";

const service = createCrudService({
  table: schema.contacts,
  userIdColumn: schema.contacts.user_id,
  index: {
    sourceType: "contact",
    fields: ["name", "email", "phone", "organisation", "role_tags", "notes"],
  },
});

export default async function contactRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/contacts", async (req) => {
    return service.list(req.userId, req.query as any);
  });

  app.get("/api/v1/contacts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.getById(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });

    const links = await db
      .select()
      .from(schema.contactProjects)
      .where(eq(schema.contactProjects.contact_id, id));

    return { data: { ...row, project_ids: links.map((l) => l.project_id) } };
  });

  app.post("/api/v1/contacts", async (req, reply) => {
    const { project_ids, ...data } = createContactSchema.parse(req.body);
    const row = await service.create(data, req.userId);

    if (project_ids.length > 0) {
      await db.insert(schema.contactProjects).values(
        project_ids.map((project_id) => ({
          contact_id: row.id,
          project_id,
        }))
      );
    }

    return reply
      .status(201)
      .send({ data: { ...row, project_ids } });
  });

  app.patch("/api/v1/contacts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { project_ids, ...data } = updateContactSchema.parse(req.body);
    const row = await service.update(id, data, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });

    if (project_ids !== undefined) {
      await db
        .delete(schema.contactProjects)
        .where(eq(schema.contactProjects.contact_id, id));

      if (project_ids.length > 0) {
        await db.insert(schema.contactProjects).values(
          project_ids.map((project_id) => ({
            contact_id: id,
            project_id,
          }))
        );
      }
    }

    return { data: { ...row, project_ids } };
  });

  app.delete("/api/v1/contacts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.remove(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });
}
