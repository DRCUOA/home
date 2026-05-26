// Deletes `files` rows whose bytes are missing from disk (orphaned after a
// Railway deploy that wiped the ephemeral container fs). Dry-run by default;
// pass --apply to actually delete.
//
//   node packages/api/dist/cleanup-orphaned-files.js
//   node packages/api/dist/cleanup-orphaned-files.js --apply

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { inArray } from "drizzle-orm";
import pg from "pg";
import { stat } from "fs/promises";
import path from "path";
import * as schema from "./db/schema.js";

const apply = process.argv.includes("--apply");
const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "uploads");

const sslEnabled =
  process.env.DATABASE_SSL === "true" ||
  /sslmode=require/.test(process.env.DATABASE_URL ?? "");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
});
const db = drizzle(pool, { schema });

console.log(`Mode:        ${apply ? "APPLY (will delete)" : "dry-run"}`);
console.log(`Uploads dir: ${UPLOADS_DIR}`);

const rows = await db
  .select({
    id: schema.files.id,
    s3_key: schema.files.s3_key,
    filename: schema.files.filename,
    user_id: schema.files.user_id,
  })
  .from(schema.files);

console.log(`Scanning ${rows.length} file rows...`);

const orphanIds: string[] = [];
for (const row of rows) {
  const fullPath = path.join(UPLOADS_DIR, row.s3_key);
  try {
    await stat(fullPath);
  } catch {
    orphanIds.push(row.id);
    console.log(`  orphan: ${row.id}  ${row.s3_key}`);
  }
}

console.log(
  `Found ${orphanIds.length} orphaned row(s) out of ${rows.length} total.`
);

if (orphanIds.length === 0) {
  await pool.end();
  process.exit(0);
}

if (!apply) {
  console.log("Dry-run only. Re-run with --apply to delete these rows.");
  await pool.end();
  process.exit(0);
}

const BATCH = 500;
let deleted = 0;
for (let i = 0; i < orphanIds.length; i += BATCH) {
  const batch = orphanIds.slice(i, i + BATCH);
  const result = await db
    .delete(schema.files)
    .where(inArray(schema.files.id, batch));
  deleted += result.rowCount ?? batch.length;
}

console.log(`Deleted ${deleted} row(s).`);
await pool.end();
