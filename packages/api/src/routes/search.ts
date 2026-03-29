import { FastifyInstance } from "fastify";
import { eq, ilike, or, and, SQL } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";

export default async function searchRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/search", async (req, reply) => {
    const { q } = req.query as { q?: string };
    if (!q || q.trim().length === 0) {
      return reply
        .status(400)
        .send({ error: "Bad Request", message: "q query parameter required" });
    }

    const pattern = `%${q}%`;

    const [notes, communications, properties, contacts, research] =
      await Promise.all([
        db
          .select()
          .from(schema.notes)
          .where(
            and(
              eq(schema.notes.user_id, req.userId),
              ilike(schema.notes.body, pattern)
            )
          )
          .limit(20),

        db
          .select()
          .from(schema.communicationLogs)
          .where(
            and(
              eq(schema.communicationLogs.user_id, req.userId),
              or(
                ilike(schema.communicationLogs.subject, pattern),
                ilike(schema.communicationLogs.body, pattern)
              )
            )
          )
          .limit(20),

        db
          .select()
          .from(schema.properties)
          .where(
            or(
              ilike(schema.properties.address, pattern),
              ilike(schema.properties.suburb, pattern),
              ilike(schema.properties.city, pattern)
            )
          )
          .limit(20),

        db
          .select()
          .from(schema.contacts)
          .where(
            and(
              eq(schema.contacts.user_id, req.userId),
              or(
                ilike(schema.contacts.name, pattern),
                ilike(schema.contacts.organisation, pattern)
              )
            )
          )
          .limit(20),

        db
          .select()
          .from(schema.researchItems)
          .where(
            and(
              eq(schema.researchItems.user_id, req.userId),
              or(
                ilike(schema.researchItems.title, pattern),
                ilike(schema.researchItems.notes, pattern)
              )
            )
          )
          .limit(20),
      ]);

    return {
      data: {
        notes: notes.map((r) => ({ ...r, _type: "note" })),
        communications: communications.map((r) => ({
          ...r,
          _type: "communication",
        })),
        properties: properties.map((r) => ({ ...r, _type: "property" })),
        contacts: contacts.map((r) => ({ ...r, _type: "contact" })),
        research: research.map((r) => ({ ...r, _type: "research" })),
      },
      total:
        notes.length +
        communications.length +
        properties.length +
        contacts.length +
        research.length,
    };
  });
}
