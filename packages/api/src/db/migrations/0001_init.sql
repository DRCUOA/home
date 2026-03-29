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
