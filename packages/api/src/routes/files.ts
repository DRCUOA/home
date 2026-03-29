import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { createFileSchema, updateFileSchema } from "@hcc/shared";
import { createCrudService } from "../services/crud.js";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET || "hcc-files";
const PRESIGN_EXPIRY = 3600; // 1 hour

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

  app.post("/api/v1/files/upload-url", async (req, reply) => {
    const body = createFileSchema.parse(req.body);
    const s3Key = `${req.userId}/${randomUUID()}/${body.filename}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: body.mime_type,
    });
    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: PRESIGN_EXPIRY,
    });

    const [row] = await db
      .insert(schema.files)
      .values({
        user_id: req.userId,
        filename: body.filename,
        s3_key: s3Key,
        mime_type: body.mime_type,
        size_bytes: body.size_bytes,
        category: body.category,
        project_id: body.project_id,
        property_id: body.property_id,
        contact_id: body.contact_id,
        communication_id: body.communication_id,
        is_pinned: body.is_pinned,
      })
      .returning();

    return reply.status(201).send({ data: { ...row, uploadUrl } });
  });

  app.get("/api/v1/files/:id/download-url", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.getById(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: (row as any).s3_key,
    });
    const downloadUrl = await getSignedUrl(s3, command, {
      expiresIn: PRESIGN_EXPIRY,
    });

    return { data: { downloadUrl } };
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
      await s3.send(
        new DeleteObjectCommand({
          Bucket: BUCKET,
          Key: (row as any).s3_key,
        })
      );
    } catch {
      // S3 deletion failure is non-fatal; record still removed from DB
    }

    await service.remove(id, req.userId);
    return { data: row };
  });
}
