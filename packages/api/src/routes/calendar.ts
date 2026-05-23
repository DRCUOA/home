import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, gte, lte, inArray, asc, sql } from "drizzle-orm";
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

    // A task overlaps the window if it starts on or before `to` and its
    // last day (end_date, or due_date when end_date is null) lands on or
    // after `from`. This is what makes multi-day spans whose start sits
    // outside the visible window still show up on the days they cover.
    const baseConditions = [
      eq(schema.tasks.user_id, req.userId),
      lte(schema.tasks.due_date, toDate),
      gte(
        sql`COALESCE(${schema.tasks.end_date}, ${schema.tasks.due_date})`,
        fromDate
      ),
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
      .orderBy(
        asc(schema.tasks.due_date),
        sql`${schema.tasks.start_time} ASC NULLS LAST`,
        asc(schema.tasks.title)
      );

    const events = rows.map((row) => ({
      ...row,
      project_type: row.project_id
        ? projectTypeById.get(row.project_id) ?? null
        : null,
    }));

    return { data: events, total: events.length };
  });
}
