import { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { upsertPropertyCriteriaSchema } from "@hcc/shared";
import { indexRecord } from "../agents/embeddings.js";

// Fields the embedding indexer should read off a criteria row — mirrors the
// REINDEX_CONFIG entry in routes/assistant.ts so reindex output matches what
// gets indexed on write.
const CRITERIA_INDEX_FIELDS = [
  "must_haves",
  "nice_to_haves",
  "exclusions",
  "property_types",
  "locations",
  "budget_ceiling",
  "timing_window_start",
  "timing_window_end",
  "financing_assumptions",
] as const;

// Resolve the owning user_id for a project, returning null if the project
// doesn't exist or doesn't belong to the requesting user. Used as the
// ownership check on every criteria endpoint — criteria rows have only a
// project_id, so we always have to go through projects to enforce scope.
async function getProjectOwner(
  projectId: string,
  userId: string
): Promise<{ user_id: string } | null> {
  const [project] = await db
    .select({ user_id: schema.projects.user_id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.user_id, userId)
      )
    )
    .limit(1);
  return project ?? null;
}

// Fire-and-forget indexer. Resolves the owning user via the criteria row's
// project_id so the embedding lands with the correct scope.
function indexCriteria(row: Record<string, any>): Promise<void> {
  if (!row) return Promise.resolve();
  const fields: Record<string, any> = {};
  for (const f of CRITERIA_INDEX_FIELDS) {
    if (row[f] != null) fields[f] = row[f];
  }
  return (async () => {
    try {
      const [project] = await db
        .select({ user_id: schema.projects.user_id })
        .from(schema.projects)
        .where(eq(schema.projects.id, row.project_id))
        .limit(1);
      if (!project?.user_id) {
        console.error(
          `[Embeddings] Skipping property_criteria/${row.id}: could not resolve owning user via project/${row.project_id}.`
        );
        return;
      }
      await indexRecord(
        "property_criteria",
        row.id,
        fields,
        project.user_id,
        row.project_id
      );
    } catch (err: any) {
      console.error(
        `[Embeddings] Failed to index property_criteria/${row.id}:`,
        err.message
      );
    }
  })();
}

export default async function propertyCriteriaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // List endpoint. The legacy version returned the entire property_criteria
  // table when no project_id query was given — that's a clear cross-user
  // leak. Now: list all criteria rows belonging to the requesting user, or
  // a single project's criteria if project_id is supplied (with ownership
  // check).
  app.get("/api/v1/property-criteria", async (req, reply) => {
    const { project_id } = req.query as { project_id?: string };
    if (!project_id) {
      // Scope to the user's own projects via inArray on their project ids.
      const userProjects = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.user_id, req.userId));
      const ids = userProjects.map((p) => p.id);
      if (ids.length === 0) return { data: [], total: 0 };
      const rows = await db
        .select()
        .from(schema.propertyCriteria)
        .where(inArray(schema.propertyCriteria.project_id, ids));
      return { data: rows, total: rows.length };
    }

    const owner = await getProjectOwner(project_id, req.userId);
    if (!owner) return reply.status(404).send({ error: "Not Found" });

    const [row] = await db
      .select()
      .from(schema.propertyCriteria)
      .where(eq(schema.propertyCriteria.project_id, project_id))
      .limit(1);

    return { data: row || null };
  });

  app.get("/api/v1/property-criteria/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const owner = await getProjectOwner(projectId, req.userId);
    if (!owner) return reply.status(404).send({ error: "Not Found" });

    const [row] = await db
      .select()
      .from(schema.propertyCriteria)
      .where(eq(schema.propertyCriteria.project_id, projectId))
      .limit(1);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.put("/api/v1/property-criteria", async (req, reply) => {
    const body = upsertPropertyCriteriaSchema.parse(req.body);

    // Verify the caller owns the project they're writing criteria for.
    // Without this, anyone authenticated could attach criteria to another
    // user's project by guessing the project id.
    const owner = await getProjectOwner(body.project_id, req.userId);
    if (!owner) return reply.status(404).send({ error: "Not Found" });

    const [existing] = await db
      .select()
      .from(schema.propertyCriteria)
      .where(eq(schema.propertyCriteria.project_id, body.project_id))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(schema.propertyCriteria)
        .set({ ...body, updated_at: new Date() })
        .where(eq(schema.propertyCriteria.project_id, body.project_id))
        .returning();
      indexCriteria(row);
      return { data: row };
    }

    const [row] = await db
      .insert(schema.propertyCriteria)
      .values(body)
      .returning();
    indexCriteria(row);
    return reply.status(201).send({ data: row });
  });

  app.delete("/api/v1/property-criteria/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const owner = await getProjectOwner(projectId, req.userId);
    if (!owner) return reply.status(404).send({ error: "Not Found" });

    const [row] = await db
      .delete(schema.propertyCriteria)
      .where(eq(schema.propertyCriteria.project_id, projectId))
      .returning();
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });
}
