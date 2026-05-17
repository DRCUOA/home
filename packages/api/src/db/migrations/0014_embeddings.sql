-- Semantic-search index used by the Assistant + auto-indexed via
-- crud.create / property writes. The original 0001_init.sql file
-- never made it into _journal.json, so this migration is a do-over
-- that lands the embeddings table + pgvector extension in every
-- environment via the runtime migrator. All statements are
-- IF NOT EXISTS so it's safe to re-run on databases that already
-- happen to have the table.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL,
  source_id UUID NOT NULL,
  embedding vector(1536),
  content_preview TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS embeddings_source_idx ON embeddings(source_type, source_id);
