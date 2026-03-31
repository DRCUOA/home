import { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";

export default async function auditLogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/audit-logs", async (req) => {
    const { entity_type, entity_id } = req.query as {
      entity_type?: string;
      entity_id?: string;
    };

    const conditions = [eq(schema.auditLogs.user_id, req.userId)];
    if (entity_type) conditions.push(eq(schema.auditLogs.entity_type, entity_type));
    if (entity_id) conditions.push(eq(schema.auditLogs.entity_id, entity_id));

    const rows = await db
      .select()
      .from(schema.auditLogs)
      .where(and(...conditions))
      .orderBy(desc(schema.auditLogs.created_at))
      .limit(100);

    return { data: rows, total: rows.length };
  });
}
