import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { createTaskSchema, updateTaskSchema } from "@hcc/shared";
import { createCrudService } from "../services/crud.js";

const service = createCrudService({
  table: schema.tasks,
  userIdColumn: schema.tasks.user_id,
});

const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  pre_sale: [
    "Declutter and deep clean entire house",
    "Get property valuation / appraisal",
    "Research and shortlist real estate agents",
    "Review and sign agency agreement",
    "Arrange professional photography",
    "Set listing price and strategy",
    "Prepare property information pack",
    "Review body-corporate / title docs",
  ],
  sell_documents: [
    "Obtain LIM report",
    "Obtain title search",
    "Prepare Sale and Purchase Agreement",
    "Get vendor disclosure statement",
    "Arrange building inspection report",
    "Gather rates and insurance info",
    "Compile warranty / guarantee docs",
  ],
  buy_due_diligence: [
    "Request LIM report from council",
    "Commission building inspection",
    "Get property valuation",
    "Review title and covenants",
    "Check zoning and planned developments",
    "Confirm insurance availability",
    "Review body-corporate minutes (if applicable)",
    "Verify rates and levies",
  ],
  offer_preparation: [
    "Confirm pre-approval with lender",
    "Determine offer price and conditions",
    "Review Sale and Purchase Agreement",
    "Arrange solicitor to review agreement",
    "Confirm deposit availability",
    "Set settlement date preferences",
    "List conditions (finance, builder, LIM)",
  ],
  open_home_visit: [
    "Check structural integrity (walls, floors, roof)",
    "Test taps, showers, and hot water",
    "Check electrical outlets and switches",
    "Inspect for dampness and ventilation",
    "Review natural light and orientation",
    "Check storage and room sizes",
    "Assess neighbourhood noise levels",
    "Note questions for the agent",
  ],
};

const fromTemplateSchema = z.object({
  template: z.enum([
    "pre_sale",
    "sell_documents",
    "buy_due_diligence",
    "offer_preparation",
    "open_home_visit",
  ]),
  project_id: z.string().uuid().optional(),
  property_id: z.string().uuid().optional(),
});

export default async function taskRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/tasks", async (req) => {
    return service.list(req.userId, req.query as any);
  });

  app.get("/api/v1/tasks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.getById(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/tasks", async (req, reply) => {
    const body = createTaskSchema.parse(req.body);
    const row = await service.create(
      {
        ...body,
        due_date: body.due_date ? new Date(body.due_date) : undefined,
      },
      req.userId
    );
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/tasks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateTaskSchema.parse(req.body);
    const updates: Record<string, any> = { ...body };
    if (body.due_date) updates.due_date = new Date(body.due_date);
    const row = await service.update(id, updates, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.delete("/api/v1/tasks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.remove(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/tasks/from-template", async (req, reply) => {
    const { template, project_id, property_id } = fromTemplateSchema.parse(
      req.body
    );
    const items = CHECKLIST_TEMPLATES[template];
    if (!items) {
      return reply
        .status(400)
        .send({ error: "Bad Request", message: `Unknown template: ${template}` });
    }

    const tasks = await db
      .insert(schema.tasks)
      .values(
        items.map((title) => ({
          user_id: req.userId,
          title,
          template_source: template,
          project_id,
          property_id,
        }))
      )
      .returning();

    return reply.status(201).send({ data: tasks, total: tasks.length });
  });
}
