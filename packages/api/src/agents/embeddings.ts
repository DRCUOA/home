import { OpenAIEmbeddings } from "@langchain/openai";
import { db, schema } from "../db/index.js";
import { eq, and, sql, desc, inArray } from "drizzle-orm";

let _embeddings: OpenAIEmbeddings | null = null;

function getEmbeddings(): OpenAIEmbeddings {
  if (!_embeddings) {
    _embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _embeddings;
}

/**
 * Write or update the embedding vector for a single source row.
 *
 * userId is REQUIRED — without it the row leaks into other users' assistant
 * searches because semanticSearch's WHERE filter has no anchor. projectId
 * is optional but should be supplied whenever the source row belongs to a
 * specific project; the assistant uses it to scope answers when the user
 * has picked a project in the UI.
 */
export async function embedAndStore(
  sourceType: string,
  sourceId: string,
  content: string,
  userId: string,
  projectId?: string | null
): Promise<void> {
  if (!userId) {
    throw new Error(
      `embedAndStore: userId is required (sourceType=${sourceType}, sourceId=${sourceId}). ` +
        `Indexing without a user_id would leak this row into other users' assistant searches.`
    );
  }
  const embedding = await getEmbeddings().embedQuery(content);
  const vectorStr = `[${embedding.join(",")}]`;
  const projectValue = projectId ?? null;

  await db.execute(
    sql`INSERT INTO embeddings (source_type, source_id, embedding, content_preview, user_id, project_id)
        VALUES (${sourceType}, ${sourceId}, ${vectorStr}::vector, ${content.slice(0, 500)}, ${userId}, ${projectValue})
        ON CONFLICT (source_type, source_id) DO UPDATE SET
          embedding = ${vectorStr}::vector,
          content_preview = ${content.slice(0, 500)},
          user_id = ${userId},
          project_id = ${projectValue},
          updated_at = NOW()`
  );
}

/**
 * Run a semantic search scoped to a single user (and optionally a single
 * project). userId is required; semantic results without it would mix
 * different users' records together.
 */
export async function semanticSearch(
  query: string,
  userId: string,
  options: { limit?: number; projectId?: string | null } = {}
): Promise<Array<{ source_type: string; source_id: string; content_preview: string; similarity: number }>> {
  if (!userId) {
    throw new Error(
      "semanticSearch: userId is required. Cross-user retrieval would leak other users' records."
    );
  }
  const limit = options.limit ?? 10;
  const projectId = options.projectId ?? null;
  const queryEmbedding = await getEmbeddings().embedQuery(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // projectId is opportunistic: when supplied, we narrow further; when not,
  // we still scope by user. The CASE form keeps the same statement working
  // both ways without dynamic SQL assembly.
  const results = await db.execute(
    sql`SELECT source_type, source_id, content_preview,
               1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM embeddings
        WHERE user_id = ${userId}
          AND (${projectId}::uuid IS NULL OR project_id = ${projectId}::uuid)
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}`
  );

  return (results as any).rows || [];
}

// Render a single field into a "key: value" line suitable for embedding text.
// Handles strings, numbers, booleans, jsonb arrays of primitives, and jsonb
// objects. Previously only strings and string-arrays survived — numbers (like
// budget_ceiling) and structured criteria payloads silently dropped, which is
// what made the buying-criteria record invisible to the assistant even after
// indexing.
function renderField(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? `${key}: ${trimmed}` : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `${key}: ${value}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const parts = value
      .map((v) => {
        if (v === null || v === undefined) return "";
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          return String(v);
        }
        return JSON.stringify(v);
      })
      .filter(Boolean);
    return parts.length > 0 ? `${key}: ${parts.join(", ")}` : null;
  }
  if (typeof value === "object") {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === "{}") return null;
      return `${key}: ${serialized}`;
    } catch {
      return null;
    }
  }
  return null;
}

export async function indexRecord(
  sourceType: string,
  sourceId: string,
  fields: Record<string, any>,
  userId: string,
  projectId?: string | null
): Promise<void> {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const line = renderField(key, value);
    if (line) parts.push(line);
  }

  if (parts.length === 0) return;

  const content = parts.join("\n");
  await embedAndStore(sourceType, sourceId, content, userId, projectId);
}

function formatMoney(n: number | null | undefined): string | null {
  if (n == null) return null;
  return `$${n.toLocaleString("en-NZ", { maximumFractionDigits: 0 })}`;
}

function formatIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministically pull the structured records that ground an assistant
 * answer about a specific project. Returns a markdown block ready to be
 * pasted into the LLM prompt, or null if the project doesn't exist or
 * doesn't belong to the user.
 *
 * This is the antidote to retrieval-by-embedding-only: when the user has
 * scoped their assistant run to a project, we shouldn't gamble on whether
 * the project's buying-criteria row happens to be in the top-8 similarity
 * results. We just fetch it directly.
 */
export async function gatherProjectContext(
  projectId: string,
  userId: string
): Promise<string | null> {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.user_id, userId)
      )
    )
    .limit(1);
  if (!project) return null;

  const lines: string[] = [];
  lines.push(`## Active project: ${project.name} (${project.type})`);
  const milestone =
    project.type === "buy" ? project.buy_milestone : project.sell_milestone;
  if (milestone) lines.push(`- Milestone: ${milestone}`);
  if (project.type === "sell") {
    const lo = formatMoney(project.target_sale_price_low);
    const hi = formatMoney(project.target_sale_price_high);
    if (lo || hi) lines.push(`- Target sale price: ${lo ?? "?"} – ${hi ?? "?"}`);
    if (project.minimum_acceptable_price != null) {
      lines.push(`- Minimum acceptable: ${formatMoney(project.minimum_acceptable_price)}`);
    }
    if (project.sale_strategy) lines.push(`- Sale strategy: ${project.sale_strategy}`);
    if (project.sale_timing_start || project.sale_timing_end) {
      lines.push(
        `- Sale timing: ${project.sale_timing_start ?? "?"} – ${project.sale_timing_end ?? "?"}`
      );
    }
  }

  // Buying criteria — the most important block for buy projects, and the
  // specific record the assistant has been failing to surface.
  if (project.type === "buy") {
    const [criteria] = await db
      .select()
      .from(schema.propertyCriteria)
      .where(eq(schema.propertyCriteria.project_id, projectId))
      .limit(1);
    lines.push("");
    lines.push("### Saved buying criteria");
    if (criteria) {
      const budget = formatMoney(criteria.budget_ceiling);
      if (budget) lines.push(`- Budget ceiling: ${budget}`);
      const locations = criteria.locations as unknown[];
      if (Array.isArray(locations) && locations.length > 0) {
        lines.push(`- Preferred locations: ${locations.join(", ")}`);
      }
      const propertyTypes = criteria.property_types as unknown[];
      if (Array.isArray(propertyTypes) && propertyTypes.length > 0) {
        lines.push(`- Property types: ${propertyTypes.join(", ")}`);
      }
      const mustHaves = criteria.must_haves as unknown[];
      if (Array.isArray(mustHaves) && mustHaves.length > 0) {
        lines.push(`- Must-haves: ${mustHaves.join(", ")}`);
      }
      const niceToHaves = criteria.nice_to_haves as unknown[];
      if (Array.isArray(niceToHaves) && niceToHaves.length > 0) {
        lines.push(`- Nice-to-haves: ${niceToHaves.join(", ")}`);
      }
      const exclusions = criteria.exclusions as unknown[];
      if (Array.isArray(exclusions) && exclusions.length > 0) {
        lines.push(`- Exclusions / deal-breakers: ${exclusions.join(", ")}`);
      }
      if (criteria.timing_window_start || criteria.timing_window_end) {
        lines.push(
          `- Timing window: ${criteria.timing_window_start ?? "?"} – ${criteria.timing_window_end ?? "?"}`
        );
      }
      const financing = criteria.financing_assumptions;
      if (financing && Object.keys(financing).length > 0) {
        lines.push(`- Financing assumptions: ${JSON.stringify(financing)}`);
      }
    } else {
      lines.push(
        "- No buying criteria saved yet for this project. The assistant should ask the user to fill these in (budget, suburbs, bedrooms, must-haves, etc.) before recommending specific listings."
      );
    }
  }

  // Properties on this project — watchlist for buy projects, the listing
  // record(s) for sell projects.
  const properties = await db
    .select()
    .from(schema.properties)
    .where(eq(schema.properties.project_id, projectId))
    .orderBy(desc(schema.properties.created_at))
    .limit(20);
  if (properties.length > 0) {
    lines.push("");
    lines.push(
      project.type === "buy"
        ? "### Watchlist / properties viewed"
        : "### Property"
    );
    for (const p of properties) {
      const bits: string[] = [p.address];
      if (p.suburb) bits.push(p.suburb);
      if (p.city) bits.push(p.city);
      if (p.bedrooms != null) bits.push(`${p.bedrooms}bd`);
      if (p.bathrooms != null) bits.push(`${p.bathrooms}ba`);
      if (p.parking != null) bits.push(`${p.parking} car`);
      if (p.land_area_sqm) bits.push(`${p.land_area_sqm}m² land`);
      if (p.floor_area_sqm) bits.push(`${p.floor_area_sqm}m² floor`);
      if (p.price_asking) bits.push(`asking ${formatMoney(p.price_asking)}`);
      if (p.listing_method) bits.push(p.listing_method);
      if (p.watchlist_status) bits.push(`status: ${p.watchlist_status}`);
      lines.push(`- ${bits.join(" · ")}`);
      if (p.rejection_reason) {
        lines.push(`  Rejection reason: ${p.rejection_reason}`);
      }
    }
  }

  // Recent tasks for the project — gives the assistant a sense of what's
  // already in flight so it doesn't suggest things already underway.
  const tasks = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.project_id, projectId),
        eq(schema.tasks.user_id, userId)
      )
    )
    .orderBy(desc(schema.tasks.created_at))
    .limit(10);
  if (tasks.length > 0) {
    lines.push("");
    lines.push("### Recent tasks");
    for (const t of tasks) {
      const due = formatIsoDate(t.due_date);
      const dueSuffix = due ? ` (due ${due})` : "";
      lines.push(`- [${t.status}] ${t.title}${dueSuffix}`);
    }
  }

  // Recent decisions are gold for an assistant — they document the user's
  // own reasoning. Pull the latest few so the assistant can refer back.
  const decisions = await db
    .select()
    .from(schema.decisions)
    .where(eq(schema.decisions.project_id, projectId))
    .orderBy(desc(schema.decisions.created_at))
    .limit(5);
  if (decisions.length > 0) {
    lines.push("");
    lines.push("### Recent decisions");
    for (const d of decisions) {
      lines.push(`- ${d.title}`);
      if (d.reasoning) lines.push(`  Reasoning: ${d.reasoning.slice(0, 200)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Always-on user context. Returns a compact markdown summary of EVERY
 * project the user owns plus the buying criteria attached to each one.
 *
 * Why this exists separately from gatherProjectContext: a user can ask the
 * assistant "what's my budget?" or "find me listings matching my criteria"
 * without first picking a project in the scope dropdown. With no project_id
 * on the run, gatherProjectContext bails and the assistant has only the
 * lossy top-N semantic search to lean on — which fails outright if the
 * criteria row has no embedding yet (pre-existing data, new install, etc).
 *
 * This block is small (a user typically has 1-3 projects, each with a
 * single criteria row), bounded in size by hard caps, and contains the
 * actual structured values — so the assistant can always answer questions
 * about the user's projects and criteria regardless of embedding state.
 */
export async function gatherUserContext(userId: string): Promise<string | null> {
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.user_id, userId))
    .orderBy(desc(schema.projects.created_at))
    .limit(10);
  if (projects.length === 0) return null;

  // Single query for all criteria rows belonging to these projects so we
  // don't N+1 the DB. Uses drizzle's inArray helper because the manual
  // ANY(${arr}::uuid[]) form binds the JS array as a Postgres composite
  // record, not a uuid[], and fails with "cannot cast type record to uuid[]".
  const projectIds = projects.map((p) => p.id);
  const criteriaRows =
    projectIds.length > 0
      ? await db
          .select()
          .from(schema.propertyCriteria)
          .where(inArray(schema.propertyCriteria.project_id, projectIds))
      : [];
  const criteriaByProject = new Map<string, (typeof criteriaRows)[number]>();
  for (const c of criteriaRows) criteriaByProject.set(c.project_id, c);

  // Self-heal embeddings for any criteria row that doesn't have one yet.
  // This covers the migration gap: rows saved BEFORE property_criteria was
  // added to REINDEX_CONFIG have no embedding, so semantic search misses
  // them even after the indexer was wired up to PUT. gatherUserContext
  // doesn't depend on embeddings for its own output, but other parts of
  // the QA workflow (and downstream features) do.
  if (criteriaRows.length > 0) {
    const criteriaIds = criteriaRows.map((c) => c.id);
    // Build an explicit IN list with per-value uuid casts. The natural
    // `= ANY(${arr}::uuid[])` form fails with "cannot cast type record to
    // uuid[]" because drizzle's sql tag binds JS arrays as a composite
    // record. The embeddings table isn't in the drizzle schema (raw SQL
    // only — pgvector dependency), so we can't lean on the inArray helper
    // here either.
    const idList = sql.join(
      criteriaIds.map((id) => sql`${id}::uuid`),
      sql`, `
    );
    const existing = await db.execute(
      sql`SELECT source_id FROM embeddings
          WHERE source_type = 'property_criteria'
            AND source_id IN (${idList})`
    );
    const indexed = new Set(
      ((existing as any).rows || []).map((r: any) => r.source_id)
    );
    for (const c of criteriaRows) {
      if (indexed.has(c.id)) continue;
      const fields: Record<string, any> = {};
      for (const key of [
        "must_haves",
        "nice_to_haves",
        "exclusions",
        "property_types",
        "locations",
        "budget_ceiling",
        "timing_window_start",
        "timing_window_end",
        "financing_assumptions",
      ]) {
        const v = (c as any)[key];
        if (v != null) fields[key] = v;
      }
      // Fire-and-forget; failures are non-fatal for the gatherer's purpose.
      indexRecord(
        "property_criteria",
        c.id,
        fields,
        userId,
        c.project_id
      ).catch((err) =>
        console.error(
          `[Embeddings] Lazy reindex failed for property_criteria/${c.id}:`,
          err.message
        )
      );
    }
  }

  const lines: string[] = [];
  lines.push("## Your projects");
  for (const p of projects) {
    const milestone = p.type === "buy" ? p.buy_milestone : p.sell_milestone;
    const header = `### ${p.name} (${p.type}${milestone ? `, ${milestone}` : ""})`;
    lines.push(header);

    if (p.type === "sell") {
      const lo = formatMoney(p.target_sale_price_low);
      const hi = formatMoney(p.target_sale_price_high);
      if (lo || hi) lines.push(`- Target sale price: ${lo ?? "?"} – ${hi ?? "?"}`);
      if (p.minimum_acceptable_price != null) {
        lines.push(`- Minimum acceptable: ${formatMoney(p.minimum_acceptable_price)}`);
      }
      if (p.sale_strategy) lines.push(`- Sale strategy: ${p.sale_strategy}`);
      if (p.sale_timing_start || p.sale_timing_end) {
        lines.push(
          `- Sale timing: ${p.sale_timing_start ?? "?"} – ${p.sale_timing_end ?? "?"}`
        );
      }
    } else {
      // Buy project: inline its criteria. This is the data the assistant
      // has been failing to find via semantic search alone.
      const criteria = criteriaByProject.get(p.id);
      if (criteria) {
        lines.push("- Saved buying criteria:");
        const budget = formatMoney(criteria.budget_ceiling);
        if (budget) lines.push(`  - Budget ceiling: ${budget}`);
        const locations = criteria.locations as unknown[];
        if (Array.isArray(locations) && locations.length > 0) {
          lines.push(`  - Preferred locations: ${locations.join(", ")}`);
        }
        const propertyTypes = criteria.property_types as unknown[];
        if (Array.isArray(propertyTypes) && propertyTypes.length > 0) {
          lines.push(`  - Property types: ${propertyTypes.join(", ")}`);
        }
        const mustHaves = criteria.must_haves as unknown[];
        if (Array.isArray(mustHaves) && mustHaves.length > 0) {
          lines.push(`  - Must-haves: ${mustHaves.join(", ")}`);
        }
        const niceToHaves = criteria.nice_to_haves as unknown[];
        if (Array.isArray(niceToHaves) && niceToHaves.length > 0) {
          lines.push(`  - Nice-to-haves: ${niceToHaves.join(", ")}`);
        }
        const exclusions = criteria.exclusions as unknown[];
        if (Array.isArray(exclusions) && exclusions.length > 0) {
          lines.push(`  - Exclusions / deal-breakers: ${exclusions.join(", ")}`);
        }
        if (criteria.timing_window_start || criteria.timing_window_end) {
          lines.push(
            `  - Timing window: ${criteria.timing_window_start ?? "?"} – ${criteria.timing_window_end ?? "?"}`
          );
        }
        const financing = criteria.financing_assumptions;
        if (financing && Object.keys(financing).length > 0) {
          lines.push(`  - Financing assumptions: ${JSON.stringify(financing)}`);
        }
      } else {
        lines.push(
          "- No buying criteria saved yet. The assistant should ask the user to fill these in (budget, suburbs, bedrooms, must-haves, etc.) before recommending specific listings."
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
