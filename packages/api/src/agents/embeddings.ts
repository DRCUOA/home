import { OpenAIEmbeddings } from "@langchain/openai";
import { db, schema } from "../db/index.js";
import { eq, and, sql, desc } from "drizzle-orm";

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

export async function embedAndStore(
  sourceType: string,
  sourceId: string,
  content: string
): Promise<void> {
  const embedding = await getEmbeddings().embedQuery(content);
  const vectorStr = `[${embedding.join(",")}]`;

  await db.execute(
    sql`INSERT INTO embeddings (source_type, source_id, embedding, content_preview)
        VALUES (${sourceType}, ${sourceId}, ${vectorStr}::vector, ${content.slice(0, 500)})
        ON CONFLICT (source_type, source_id) DO UPDATE SET
          embedding = ${vectorStr}::vector,
          content_preview = ${content.slice(0, 500)},
          updated_at = NOW()`
  );
}

export async function semanticSearch(
  query: string,
  limit: number = 10,
  projectId?: string
): Promise<Array<{ source_type: string; source_id: string; content_preview: string; similarity: number }>> {
  const queryEmbedding = await getEmbeddings().embedQuery(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const results = await db.execute(
    sql`SELECT source_type, source_id, content_preview,
               1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM embeddings
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}`
  );

  return (results as any).rows || [];
}

export async function indexRecord(
  sourceType: string,
  sourceId: string,
  fields: Record<string, any>
): Promise<void> {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value && typeof value === "string" && value.trim()) {
      parts.push(`${key}: ${value}`);
    } else if (Array.isArray(value) && value.length > 0) {
      parts.push(`${key}: ${value.join(", ")}`);
    }
  }

  if (parts.length === 0) return;

  const content = parts.join("\n");
  await embedAndStore(sourceType, sourceId, content);
}
