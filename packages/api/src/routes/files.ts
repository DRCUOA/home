import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { mkdir, rm, stat } from "fs/promises";
import { createWriteStream, createReadStream } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { updateFileSchema, FILE_CATEGORIES } from "@hcc/shared";
import { createCrudService } from "../services/crud.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

const service = createCrudService({
  table: schema.files,
  userIdColumn: schema.files.user_id,
});

export default async function fileRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/files", async (req) => {
    return service.list(req.userId, req.query as any);
  });

  app.get("/api/v1/files/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.getById(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/files/upload", async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ error: "No file provided" });
    }

    const fields: Record<string, string> = {};
    for (const [key, field] of Object.entries(data.fields)) {
      if (field && typeof field === "object" && "value" in field) {
        fields[key] = (field as any).value;
      }
    }

    const filename = data.filename;
    const mimeType = data.mimetype || "application/octet-stream";
    const category = fields.category && FILE_CATEGORIES.includes(fields.category as any)
      ? fields.category
      : "other";

    const fileId = randomUUID();
    const storagePath = path.join(req.userId, fileId, filename);
    const fullDir = path.join(UPLOADS_DIR, req.userId, fileId);
    const fullPath = path.join(fullDir, filename);

    await mkdir(fullDir, { recursive: true });
    await pipeline(data.file, createWriteStream(fullPath));

    const fileStat = await stat(fullPath);

    const [row] = await db
      .insert(schema.files)
      .values({
        user_id: req.userId,
        filename,
        s3_key: storagePath,
        mime_type: mimeType,
        size_bytes: fileStat.size,
        category,
        project_id: fields.project_id || undefined,
        property_id: fields.property_id || undefined,
        contact_id: fields.contact_id || undefined,
        communication_id: fields.communication_id || undefined,
        is_pinned: fields.is_pinned === "true",
      })
      .returning();

    return reply.status(201).send({ data: row });
  });

  app.get("/api/v1/files/:id/download", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.getById(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });

    const filePath = path.join(UPLOADS_DIR, (row as any).s3_key);

    try {
      await stat(filePath);
    } catch {
      return reply.status(404).send({ error: "File not found on disk" });
    }

    const stream = createReadStream(filePath);
    return reply
      .header("Content-Type", (row as any).mime_type)
      .header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent((row as any).filename)}"`
      )
      .send(stream);
  });

  app.patch("/api/v1/files/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateFileSchema.parse(req.body);
    const row = await service.update(id, body, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.delete("/api/v1/files/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.getById(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });

    try {
      const filePath = path.join(UPLOADS_DIR, (row as any).s3_key);
      const dir = path.dirname(filePath);
      await rm(dir, { recursive: true, force: true });
    } catch {
      // Disk deletion failure is non-fatal
    }

    await service.remove(id, req.userId);
    return { data: row };
  });
}
