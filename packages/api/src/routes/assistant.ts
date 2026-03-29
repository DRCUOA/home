import { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { runAssistantSchema } from "@hcc/shared";
import { runWorkflow } from "../agents/runner.js";

export default async function assistantRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/assistant/runs", async (req) => {
    const rows = await db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.user_id, req.userId))
      .orderBy(desc(schema.agentRuns.created_at));

    return { data: rows, total: rows.length };
  });

  app.get("/api/v1/assistant/runs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, id))
      .limit(1);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/assistant/run", async (req, reply) => {
    const body = runAssistantSchema.parse(req.body);

    const [run] = await db
      .insert(schema.agentRuns)
      .values({
        user_id: req.userId,
        workflow_type: body.workflow_type,
        input_summary: body.input,
        project_id: body.project_id,
        property_id: body.property_id,
        status: "running",
      })
      .returning();

    runWorkflow(
      run.id,
      body.workflow_type as any,
      body.input,
      req.userId
    ).catch((err) => app.log.error(err, "Agent workflow failed"));

    return reply.status(201).send({ data: run });
  });
}
