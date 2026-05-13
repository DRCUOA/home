import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { PROJECT_TYPES } from "@hcc/shared";

const querySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  project_type: z.enum([...PROJECT_TYPES, "all"]).default("all"),
});

export default async function calendarRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/calendar/events", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation Error",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      });
    }

    const { from, to, project_type } = parsed.data;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return reply.status(400).send({
        error: "Validation Error",
        message: "Invalid date range",
      });
    }

    const userProjects = await db
      .select({
        id: schema.projects.id,
        type: schema.projects.type,
      })
      .from(schema.projects)
      .where(eq(schema.projects.user_id, req.userId));

    const projectTypeById = new Map<string, string>();
    for (const p of userProjects) projectTypeById.set(p.id, p.type);

    const baseConditions = [
      eq(schema.tasks.user_id, req.userId),
      gte(schema.tasks.due_date, fromDate),
      lte(schema.tasks.due_date, toDate),
    ];

    if (project_type === "sell" || project_type === "buy") {
      const matchingIds = userProjects
        .filter((p) => p.type === project_type)
        .map((p) => p.id);
      if (matchingIds.length === 0) return { data: [], total: 0 };
      baseConditions.push(inArray(schema.tasks.project_id, matchingIds));
    }

    const rows = await db
      .select()
      .from(schema.tasks)
      .where(and(...baseConditions))
      .orderBy(schema.tasks.due_date);

    const events = rows.map((row) => ({
      ...row,
      project_type: row.project_id
        ? projectTypeById.get(row.project_id) ?? null
        : null,
    }));

    return { data: events, total: events.length };
  });
}
