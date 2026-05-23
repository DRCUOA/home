-- Scope semantic-search results to a single user (and optionally a single
-- project). Before this migration the embeddings table had no ownership
-- columns, so the assistant's semanticSearch query returned the nearest
-- vectors across the entire table — one user's notes/criteria/comms could
-- surface as "[Source N]" citations in another user's assistant answer.
--
-- This migration:
--   1. Adds nullable user_id and project_id columns.
--   2. Backfills both by joining each row to its source table (resolving
--      property_criteria's user_id transitively via projects).
--   3. Leaves the columns nullable so the deploy can run before all
--      writer code is updated; once the new writer code lands the
--      indexer will start populating them on every insert/update. A
--      follow-up migration can ALTER ... SET NOT NULL once the table
--      is fully backfilled in every environment.

ALTER TABLE "embeddings"
  ADD COLUMN IF NOT EXISTS "user_id" uuid;
--> statement-breakpoint
ALTER TABLE "embeddings"
  ADD COLUMN IF NOT EXISTS "project_id" uuid;
--> statement-breakpoint

-- Backfill. Each block runs only against rows where the column is still
-- NULL so re-applying the migration is a no-op. The joins reach the
-- source rows by (source_type, source_id) — the embeddings table's
-- existing unique key — so each statement is bounded and safe.

UPDATE "embeddings" e
SET "user_id" = p.user_id
FROM "projects" p
WHERE e."source_type" = 'project'
  AND e."source_id" = p.id
  AND e."user_id" IS NULL;
--> statement-breakpoint

UPDATE "embeddings" e
SET "user_id" = pr_project.user_id,
    "project_id" = pr.project_id
FROM "properties" pr
JOIN "projects" pr_project ON pr_project.id = pr.project_id
WHERE e."source_type" = 'property'
  AND e."source_id" = pr.id
  AND e."user_id" IS NULL;
--> statement-breakpoint

-- property_criteria has only project_id; resolve user_id via projects.
UPDATE "embeddings" e
SET "user_id" = p.user_id,
    "project_id" = pc.project_id
FROM "property_criteria" pc
JOIN "projects" p ON p.id = pc.project_id
WHERE e."source_type" = 'property_criteria'
  AND e."source_id" = pc.id
  AND e."user_id" IS NULL;
--> statement-breakpoint

UPDATE "embeddings" e
SET "user_id" = n.user_id,
    "project_id" = n.project_id
FROM "notes" n
WHERE e."source_type" = 'note'
  AND e."source_id" = n.id
  AND e."user_id" IS NULL;
--> statement-breakpoint

UPDATE "embeddings" e
SET "user_id" = t.user_id,
    "project_id" = t.project_id
FROM "tasks" t
WHERE e."source_type" = 'task'
  AND e."source_id" = t.id
  AND e."user_id" IS NULL;
--> statement-breakpoint

UPDATE "embeddings" e
SET "user_id" = c.user_id
FROM "contacts" c
WHERE e."source_type" = 'contact'
  AND e."source_id" = c.id
  AND e."user_id" IS NULL;
--> statement-breakpoint

UPDATE "embeddings" e
SET "user_id" = cl.user_id,
    "project_id" = cl.project_id
FROM "communication_logs" cl
WHERE e."source_type" = 'communication'
  AND e."source_id" = cl.id
  AND e."user_id" IS NULL;
--> statement-breakpoint

UPDATE "embeddings" e
SET "user_id" = d.user_id,
    "project_id" = d.project_id
FROM "decisions" d
WHERE e."source_type" = 'decision'
  AND e."source_id" = d.id
  AND e."user_id" IS NULL;
--> statement-breakpoint

UPDATE "embeddings" e
SET "user_id" = ri.user_id,
    "project_id" = ri.project_id
FROM "research_items" ri
WHERE e."source_type" = 'research'
  AND e."source_id" = ri.id
  AND e."user_id" IS NULL;
--> statement-breakpoint

UPDATE "embeddings" e
SET "user_id" = o.user_id,
    "project_id" = o.project_id
FROM "offers" o
WHERE e."source_type" = 'offer'
  AND e."source_id" = o.id
  AND e."user_id" IS NULL;
--> statement-breakpoint

UPDATE "embeddings" e
SET "user_id" = fs.user_id,
    "project_id" = fs.project_id
FROM "financial_scenarios" fs
WHERE e."source_type" = 'financial_scenario'
  AND e."source_id" = fs.id
  AND e."user_id" IS NULL;
--> statement-breakpoint

-- Drop any rows that still don't have a user_id after backfill. These
-- correspond to source rows that no longer exist (or to source_types
-- we don't index any more) and can't be safely scoped — better to
-- delete than leave around as a quiet leak vector.
DELETE FROM "embeddings" WHERE "user_id" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "embeddings_user_idx" ON "embeddings"("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddings_user_project_idx"
  ON "embeddings"("user_id", "project_id");
