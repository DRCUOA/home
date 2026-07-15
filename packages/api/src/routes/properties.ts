import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { mkdir, stat } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import { eq, and, inArray } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import {
  createPropertySchema,
  updatePropertySchema,
  setPropertyCustomTypesSchema,
} from "@hcc/shared";
import { indexRecord } from "../agents/embeddings.js";
import { enrichPropertyWorkflow } from "../agents/workflows/enrich-property.js";
import { geocodeAddress } from "../services/geocoding.js";
import {
  scrapeListingPhotoUrls,
  photoUrlHash,
  MAX_LISTING_PHOTOS,
} from "../services/listing-photos.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

const PROPERTY_INDEX_FIELDS = [
  "address", "suburb", "city", "property_type", "listing_method",
  "listing_description", "watchlist_status",
] as const;

async function downloadPhoto(
  url: string,
  userId: string,
  propertyId: string,
  projectId: string,
): Promise<{ id: string; filename: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HCC/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok || !res.body) return null;

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const ext =
      contentType.includes("png") ? ".png" :
      contentType.includes("webp") ? ".webp" :
      ".jpg";
    // Name derives from the source URL so re-enrich runs can tell which
    // photos they already have.
    const filename = `listing-photo-${photoUrlHash(url)}${ext}`;
    const fileId = randomUUID();
    const storagePath = path.join(userId, fileId, filename);
    const fullDir = path.join(UPLOADS_DIR, userId, fileId);
    const fullPath = path.join(fullDir, filename);

    await mkdir(fullDir, { recursive: true });

    const nodeStream = Readable.fromWeb(res.body as any);
    await pipeline(nodeStream, createWriteStream(fullPath));

    const fileStat = await stat(fullPath);
    const sizeBytes = fileStat.size;

    const [row] = await db
      .insert(schema.files)
      .values({
        user_id: userId,
        filename,
        s3_key: storagePath,
        mime_type: contentType.split(";")[0],
        size_bytes: sizeBytes,
        category: "photo",
        project_id: projectId,
        property_id: propertyId,
        is_pinned: false,
      })
      .returning();

    return { id: row.id, filename };
  } catch (err) {
    console.error(`[Enrich] Failed to download photo ${url}:`, (err as Error).message);
    return null;
  }
}

// Properties don't carry user_id directly (they're owned via project_id),
// so we resolve the owning user via the project before indexing. Without
// this the embedding row would be unscoped and visible to every user's
// assistant search.
//
// Always fire-and-forget: returns a promise that resolves silently after
// logging any errors, so the route handler doesn't have to await.
function indexProperty(row: Record<string, any>): Promise<void> {
  const fields: Record<string, any> = {};
  for (const f of PROPERTY_INDEX_FIELDS) {
    if (row[f] != null) fields[f] = row[f];
  }
  if (row.bedrooms) fields.bedrooms = `${row.bedrooms} bedrooms`;
  if (row.bathrooms) fields.bathrooms = `${row.bathrooms} bathrooms`;
  if (row.price_asking) fields.price_asking = `$${row.price_asking}`;

  return (async () => {
    try {
      const [project] = await db
        .select({ user_id: schema.projects.user_id })
        .from(schema.projects)
        .where(eq(schema.projects.id, row.project_id))
        .limit(1);
      if (!project?.user_id) {
        console.error(
          `[Embeddings] Skipping property/${row.id}: could not resolve owning user via project/${row.project_id}.`
        );
        return;
      }
      await indexRecord(
        "property",
        row.id,
        fields,
        project.user_id,
        row.project_id
      );
    } catch (err: any) {
      console.error(
        `[Embeddings] Failed to index property/${row.id}:`,
        err.message
      );
    }
  })();
}

// Properties carry their assigned custom-type ids on the wire so the web app
// can render chips and filter without a second round-trip per property.
async function attachCustomTypeIds<T extends { id: string }>(
  rows: T[]
): Promise<(T & { custom_type_ids: string[] })[]> {
  if (rows.length === 0) return [];
  const links = await db
    .select({
      property_id: schema.propertyCustomTypeLinks.property_id,
      custom_type_id: schema.propertyCustomTypeLinks.custom_type_id,
    })
    .from(schema.propertyCustomTypeLinks)
    .where(
      inArray(
        schema.propertyCustomTypeLinks.property_id,
        rows.map((r) => r.id)
      )
    );
  const byProperty = new Map<string, string[]>();
  for (const link of links) {
    const list = byProperty.get(link.property_id) ?? [];
    list.push(link.custom_type_id);
    byProperty.set(link.property_id, list);
  }
  return rows.map((r) => ({ ...r, custom_type_ids: byProperty.get(r.id) ?? [] }));
}

export default async function propertyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.post("/api/v1/properties/enrich-preview", async (req, reply) => {
    const { listing_url, address } = req.body as { listing_url?: string; address?: string };
    if (!listing_url && !address) {
      return reply.status(400).send({ error: "Provide a listing_url or address" });
    }

    try {
      const result = await enrichPropertyWorkflow.invoke({
        listing_url: listing_url ?? "",
        address: address ?? "",
        suburb: "",
        city: "",
      });

      const extracted = result.extracted ?? {};
      if (Object.keys(extracted).length === 0) {
        return reply.status(422).send({ error: "Could not extract listing details" });
      }

      return { data: extracted };
    } catch (err: any) {
      app.log.error(err, "[Enrich] Preview enrichment failed");
      return reply.status(500).send({ error: "Enrichment failed: " + err.message });
    }
  });

  app.get("/api/v1/properties", async (req) => {
    const { project_id, watchlist_status, custom_type_id } = req.query as any;

    const userProjects = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.user_id, req.userId));
    const userProjectIds = userProjects.map((p) => p.id);
    if (userProjectIds.length === 0) return { data: [], total: 0 };

    const conditions = [inArray(schema.properties.project_id, userProjectIds)];
    if (project_id) {
      if (!userProjectIds.includes(project_id)) return { data: [], total: 0 };
      conditions.push(eq(schema.properties.project_id, project_id));
    }
    if (watchlist_status) {
      conditions.push(eq(schema.properties.watchlist_status, watchlist_status));
    }
    if (custom_type_id) {
      const linked = await db
        .select({ property_id: schema.propertyCustomTypeLinks.property_id })
        .from(schema.propertyCustomTypeLinks)
        .where(eq(schema.propertyCustomTypeLinks.custom_type_id, custom_type_id));
      if (linked.length === 0) return { data: [], total: 0 };
      conditions.push(
        inArray(
          schema.properties.id,
          linked.map((l) => l.property_id)
        )
      );
    }

    const rows = await db
      .select()
      .from(schema.properties)
      .where(and(...conditions));

    const data = await attachCustomTypeIds(rows);
    return { data, total: data.length };
  });

  app.get("/api/v1/properties/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.id, id))
      .limit(1);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    const [data] = await attachCustomTypeIds([row]);
    return { data };
  });

  app.put("/api/v1/properties/:id/custom-types", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { custom_type_ids } = setPropertyCustomTypesSchema.parse(req.body);

    // The property must belong to one of the caller's projects, and every
    // custom type must belong to the caller — no cross-user assignments.
    const [property] = await db
      .select({ id: schema.properties.id })
      .from(schema.properties)
      .innerJoin(
        schema.projects,
        eq(schema.properties.project_id, schema.projects.id)
      )
      .where(
        and(
          eq(schema.properties.id, id),
          eq(schema.projects.user_id, req.userId)
        )
      )
      .limit(1);
    if (!property) return reply.status(404).send({ error: "Not Found" });

    const uniqueIds = [...new Set(custom_type_ids)];
    if (uniqueIds.length > 0) {
      const owned = await db
        .select({ id: schema.propertyCustomTypes.id })
        .from(schema.propertyCustomTypes)
        .where(
          and(
            eq(schema.propertyCustomTypes.user_id, req.userId),
            inArray(schema.propertyCustomTypes.id, uniqueIds)
          )
        );
      if (owned.length !== uniqueIds.length) {
        return reply
          .status(400)
          .send({ error: "One or more custom types were not found" });
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(schema.propertyCustomTypeLinks)
        .where(eq(schema.propertyCustomTypeLinks.property_id, id));
      if (uniqueIds.length > 0) {
        await tx.insert(schema.propertyCustomTypeLinks).values(
          uniqueIds.map((custom_type_id) => ({
            property_id: id,
            custom_type_id,
          }))
        );
      }
    });

    return { data: { property_id: id, custom_type_ids: uniqueIds } };
  });

  app.post("/api/v1/properties", async (req, reply) => {
    const body = createPropertySchema.parse(req.body);
    const [row] = await db
      .insert(schema.properties)
      .values(body)
      .returning();
    indexProperty(row);

    if (!row.latitude && row.address) {
      geocodeAddress(row.address, row.suburb ?? undefined, row.city ?? undefined)
        .then(async (geo) => {
          if (geo) {
            await db
              .update(schema.properties)
              .set({ latitude: geo.latitude, longitude: geo.longitude, updated_at: new Date() })
              .where(eq(schema.properties.id, row.id));
          }
        })
        .catch((err) => console.error("[Geocode] Auto-geocode failed:", err.message));
    }

    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/properties/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updatePropertySchema.parse(req.body);
    const [row] = await db
      .update(schema.properties)
      .set({ ...body, updated_at: new Date() })
      .where(eq(schema.properties.id, id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Not Found" });
    indexProperty(row);

    const addressChanged = body.address || body.suburb || body.city;
    if (addressChanged && !row.latitude && row.address) {
      geocodeAddress(row.address, row.suburb ?? undefined, row.city ?? undefined)
        .then(async (geo) => {
          if (geo) {
            await db
              .update(schema.properties)
              .set({ latitude: geo.latitude, longitude: geo.longitude, updated_at: new Date() })
              .where(eq(schema.properties.id, row.id));
          }
        })
        .catch((err) => console.error("[Geocode] Auto-geocode failed:", err.message));
    }

    return { data: row };
  });

  app.delete("/api/v1/properties/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db.transaction(async (tx) => {
      await tx.delete(schema.offers).where(eq(schema.offers.property_id, id));

      await tx.update(schema.financialScenarios).set({ property_id: null }).where(eq(schema.financialScenarios.property_id, id));
      await tx.update(schema.communicationLogs).set({ property_id: null }).where(eq(schema.communicationLogs.property_id, id));
      await tx.update(schema.notes).set({ property_id: null }).where(eq(schema.notes.property_id, id));
      await tx.update(schema.files).set({ property_id: null }).where(eq(schema.files.property_id, id));
      await tx.update(schema.tasks).set({ property_id: null }).where(eq(schema.tasks.property_id, id));
      await tx.update(schema.checklistItems).set({ property_id: null }).where(eq(schema.checklistItems.property_id, id));
      await tx.update(schema.decisions).set({ property_id: null }).where(eq(schema.decisions.property_id, id));
      await tx.update(schema.researchItems).set({ property_id: null }).where(eq(schema.researchItems.property_id, id));
      await tx.update(schema.agentRuns).set({ property_id: null }).where(eq(schema.agentRuns.property_id, id));

      return tx.delete(schema.properties).where(eq(schema.properties.id, id)).returning();
    });
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/properties/:id/enrich", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [property] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.id, id))
      .limit(1);
    if (!property) return reply.status(404).send({ error: "Not Found" });

    if (!property.listing_url && !property.address) {
      return reply
        .status(400)
        .send({ error: "Property needs a listing URL or address to enrich" });
    }

    try {
      app.log.info(
        { propertyId: id, listing_url: property.listing_url, address: property.address },
        "[Enrich] Starting enrichment"
      );

      let extracted: Record<string, any> = {};
      try {
        const result = await enrichPropertyWorkflow.invoke({
          listing_url: property.listing_url ?? "",
          address: property.address ?? "",
          suburb: property.suburb ?? "",
          city: property.city ?? "",
        });
        extracted = result.extracted ?? {};
        app.log.info({ propertyId: id, extracted }, "[Enrich] Workflow returned");
      } catch (err: any) {
        // Photo scraping doesn't depend on the AI extraction, so a failed
        // LLM call shouldn't abort the whole enrich.
        app.log.error(err, "[Enrich] Field extraction workflow failed");
      }

      const updates: Record<string, any> = {};
      const enrichable = [
        "suburb",
        "city",
        "price_asking",
        "price_guide_low",
        "price_guide_high",
        "bedrooms",
        "bathrooms",
        "parking",
        "land_area_sqm",
        "floor_area_sqm",
        "property_type",
        "listing_method",
        "listing_description",
      ] as const;

      for (const field of enrichable) {
        if (extracted[field] != null) {
          updates[field] = extracted[field];
        }
      }

      if (extracted.address) {
        updates.address = extracted.address;
      }

      let updated = property;
      let enrichedFields: string[] = [];
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date();
        [updated] = await db
          .update(schema.properties)
          .set(updates)
          .where(eq(schema.properties.id, id))
          .returning();

        indexProperty(updated);

        enrichedFields = Object.keys(updates).filter((k) => k !== "updated_at");
        app.log.info({ propertyId: id, enrichedFields }, "[Enrich] Property updated");
      } else {
        app.log.info({ propertyId: id }, "[Enrich] No usable fields in extracted data");
      }

      // Photos come from scraping the listing page directly, not from the AI
      // extraction — so attempt them even when no fields could be extracted.
      let photosDownloaded = 0;
      if (property.listing_url) {
        const photoUrls = await scrapeListingPhotoUrls(property.listing_url);
        if (photoUrls.length > 0) {
          // Skip photos a previous enrich run already saved (matched by the
          // source-URL hash in the filename) and only top up to the cap.
          const existingFiles = await db
            .select({ filename: schema.files.filename })
            .from(schema.files)
            .where(
              and(
                eq(schema.files.property_id, id),
                eq(schema.files.category, "photo")
              )
            );
          const existingNames = existingFiles.map((f) => f.filename);
          const existingListingPhotos = existingNames.filter((n) =>
            n.startsWith("listing-photo-")
          ).length;
          const remaining = Math.max(0, MAX_LISTING_PHOTOS - existingListingPhotos);
          const toDownload = photoUrls
            .filter((url) => {
              const prefix = `listing-photo-${photoUrlHash(url)}`;
              return !existingNames.some((n) => n.startsWith(prefix));
            })
            .slice(0, remaining);

          app.log.info(
            { propertyId: id, found: photoUrls.length, downloading: toDownload.length },
            "[Enrich] Downloading listing photos"
          );
          const downloads = await Promise.allSettled(
            toDownload.map((url) =>
              downloadPhoto(url, req.userId, id, property.project_id)
            )
          );
          photosDownloaded = downloads.filter(
            (d) => d.status === "fulfilled" && d.value != null
          ).length;
          app.log.info({ propertyId: id, photosDownloaded }, "[Enrich] Photos saved");
        } else {
          app.log.info({ propertyId: id }, "[Enrich] No photos found on listing page");
        }
      }

      if (Object.keys(extracted).length === 0 && photosDownloaded === 0) {
        return reply
          .status(422)
          .send({ error: "Could not extract listing details" });
      }

      return { data: updated, enriched_fields: enrichedFields, photos_downloaded: photosDownloaded, extracted };
    } catch (err: any) {
      app.log.error(err, "[Enrich] Property enrichment failed");
      return reply.status(500).send({ error: "Enrichment failed: " + err.message });
    }
  });

  app.get("/api/v1/properties/:id/evaluations", async (req) => {
    const { id } = req.params as { id: string };
    const rows = await db
      .select()
      .from(schema.propertyEvaluations)
      .where(eq(schema.propertyEvaluations.property_id, id));
    return { data: rows };
  });

  app.get("/api/v1/properties/:id/offers", async (req) => {
    const { id } = req.params as { id: string };
    const rows = await db
      .select()
      .from(schema.offers)
      .where(eq(schema.offers.property_id, id));
    return { data: rows };
  });
}
