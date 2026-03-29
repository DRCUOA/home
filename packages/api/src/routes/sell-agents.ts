import { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { createSellAgentSchema, updateSellAgentSchema } from "@hcc/shared";

export default async function sellAgentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/sell-agents", async (req) => {
    const { project_id } = req.query as { project_id?: string };

    const userProjects = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.user_id, req.userId));
    const projectIds = userProjects.map((p) => p.id);

    const conditions = [];
    if (project_id && projectIds.includes(project_id)) {
      conditions.push(eq(schema.sellAgents.project_id, project_id));
    }

    const rows = await db
      .select()
      .from(schema.sellAgents)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const filtered = rows.filter((r) => projectIds.includes(r.project_id));
    return { data: filtered, total: filtered.length };
  });

  app.get("/api/v1/sell-agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(schema.sellAgents)
      .where(eq(schema.sellAgents.id, id))
      .limit(1);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/sell-agents", async (req, reply) => {
    const body = createSellAgentSchema.parse(req.body);
    const [row] = await db
      .insert(schema.sellAgents)
      .values(body)
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/sell-agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateSellAgentSchema.parse(req.body);
    const [row] = await db
      .update(schema.sellAgents)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.sellAgents.id, id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.delete("/api/v1/sell-agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(schema.sellAgents)
      .where(eq(schema.sellAgents.id, id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });
}
