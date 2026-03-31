import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

export async function writeAuditLog(opts: {
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete";
  userId: string;
  changes: Record<string, unknown>;
}) {
  const [user] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, opts.userId))
    .limit(1);

  await db.insert(schema.auditLogs).values({
    entity_type: opts.entityType,
    entity_id: opts.entityId,
    action: opts.action,
    user_id: opts.userId,
    user_name: user?.name ?? "Unknown",
    changes: opts.changes,
  });
}

export function diffRecord(
  oldRec: Record<string, unknown>,
  newRec: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  const skip = new Set(["id", "user_id", "created_at", "updated_at"]);

  for (const key of Object.keys(newRec)) {
    if (skip.has(key)) continue;
    const o = oldRec[key] ?? null;
    const n = newRec[key] ?? null;
    if (JSON.stringify(o) !== JSON.stringify(n)) {
      diff[key] = { old: o, new: n };
    }
  }
  return diff;
}
