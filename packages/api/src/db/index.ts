import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const sslEnabled =
  process.env.DATABASE_SSL === "true" ||
  /sslmode=require/.test(process.env.DATABASE_URL ?? "");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export { schema };
