import { eq, and, ilike, or, desc, SQL } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { db } from "../db/index.js";
import { indexRecord } from "../agents/embeddings.js";
import { writeAuditLog, diffRecord } from "./audit.js";

type AnyColumn = any;

interface IndexConfig {
  sourceType: string;
  fields: string[];
}

interface AuditConfig {
  entityType: string;
}

interface CrudOptions {
  table: PgTable;
  userIdColumn?: AnyColumn;
  orderBy?: AnyColumn;
  index?: IndexConfig;
  audit?: AuditConfig;
}

function tryIndex(config: IndexConfig | undefined, row: Record<string, any>) {
  if (!config || !row) return;
  const fieldData: Record<string, any> = {};
  for (const f of config.fields) {
    if (row[f] != null) fieldData[f] = row[f];
  }
  indexRecord(config.sourceType, row.id, fieldData).catch((err) =>
    console.error(`[Embeddings] Failed to index ${config.sourceType}/${row.id}:`, err.message)
  );
}

function tryAudit(
  config: AuditConfig | undefined,
  action: "create" | "update" | "delete",
  entityId: string,
  userId: string,
  changes: Record<string, unknown>
) {
  if (!config || !userId) return;
  writeAuditLog({
    entityType: config.entityType,
    entityId,
    action,
    userId,
    changes,
  }).catch((err) =>
    console.error(`[Audit] Failed to write ${config.entityType}/${entityId}:`, err.message)
  );
}

export function createCrudService({ table, userIdColumn, orderBy, index, audit }: CrudOptions) {
  const cols = (table as any);

  return {
    async list(userId: string, filters?: Record<string, any>) {
      const conditions: SQL[] = [];
      if (userIdColumn) conditions.push(eq(userIdColumn, userId));

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined && value !== "" && key in cols) {
            conditions.push(eq(cols[key], value));
          }
        }
      }

      const query = db
        .select()
        .from(table)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderBy ? desc(orderBy) : desc(cols.created_at));

      const rows = await query;
      return { data: rows, total: rows.length };
    },

    async getById(id: string, userId?: string) {
      const conditions: SQL[] = [eq(cols.id, id)];
      if (userIdColumn && userId) conditions.push(eq(userIdColumn, userId));

      const [row] = await db
        .select()
        .from(table)
        .where(and(...conditions))
        .limit(1);

      return row || null;
    },

    async create(data: Record<string, any>, userId?: string) {
      const values = userId && userIdColumn ? { ...data, user_id: userId } : data;
      const [row] = await (db.insert(table).values(values) as any).returning();
      tryIndex(index, row);
      if (userId) tryAudit(audit, "create", row.id, userId, row);
      return row;
    },

    async update(id: string, data: Record<string, any>, userId?: string) {
      const conditions: SQL[] = [eq(cols.id, id)];
      if (userIdColumn && userId) conditions.push(eq(userIdColumn, userId));

      let oldRow: Record<string, any> | null = null;
      if (audit) {
        const [existing] = await db
          .select()
          .from(table)
          .where(and(...conditions))
          .limit(1);
        oldRow = existing || null;
      }

      const [row] = await (
        db
          .update(table)
          .set({ ...data, updated_at: new Date() })
          .where(and(...conditions)) as any
      ).returning();

      if (row) {
        tryIndex(index, row);
        if (userId && oldRow) {
          tryAudit(audit, "update", row.id, userId, diffRecord(oldRow, row));
        }
      }
      return row || null;
    },

    async remove(id: string, userId?: string) {
      const conditions: SQL[] = [eq(cols.id, id)];
      if (userIdColumn && userId) conditions.push(eq(userIdColumn, userId));

      const [row] = await (
        db.delete(table).where(and(...conditions)) as any
      ).returning();

      if (row && userId) {
        tryAudit(audit, "delete", row.id, userId, row);
      }
      return row || null;
    },
  };
}
