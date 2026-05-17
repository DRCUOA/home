import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../src/db/migrations");

const sslEnabled =
  process.env.DATABASE_SSL === "true" ||
  /sslmode=require/.test(process.env.DATABASE_URL ?? "");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
});

const db = drizzle(pool);

console.log(`Running migrations from ${migrationsFolder}`);
await migrate(db, { migrationsFolder });
console.log("Migrations complete.");
await pool.end();
