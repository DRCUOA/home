import { eq, and, ilike, or, desc, SQL } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { db } from "../db/index.js";

type AnyColumn = any;

interface CrudOptions {
  table: PgTable;
  userIdColumn?: AnyColumn;
  orderBy?: AnyColumn;
}

export function createCrudService({ table, userIdColumn, orderBy }: CrudOptions) {
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
      return row;
    },

    async update(id: string, data: Record<string, any>, userId?: string) {
      const conditions: SQL[] = [eq(cols.id, id)];
      if (userIdColumn && userId) conditions.push(eq(userIdColumn, userId));

      const [row] = await (
        db
          .update(table)
          .set({ ...data, updated_at: new Date() })
          .where(and(...conditions)) as any
      ).returning();

      return row || null;
    },

    async remove(id: string, userId?: string) {
      const conditions: SQL[] = [eq(cols.id, id)];
      if (userIdColumn && userId) conditions.push(eq(userIdColumn, userId));

      const [row] = await (
        db.delete(table).where(and(...conditions)) as any
      ).returning();

      return row || null;
    },
  };
}
