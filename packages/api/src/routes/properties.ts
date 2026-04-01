import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { mkdir, stat } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import { eq, and } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { createPropertySchema, updatePropertySchema } from "@hcc/shared";
import { indexRecord } from "../agents/embeddings.js";
import { enrichPropertyWorkflow } from "../agents/workflows/enrich-property.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

const PROPERTY_INDEX_FIELDS = [
  "address", "suburb", "city", "property_type", "listing_method",
  "listing_description", "watchlist_status",
] as const;

async function scrapePhotoUrls(listingUrl: string): Promise<string[]> {
  try {
    const res = await fetch(listingUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) {
      console.log(`[Enrich] Listing fetch failed: ${res.status} ${res.statusText}`);
      return [];
    }

    const html = await res.text();
    const urls = new Set<string>();

    const ogImages = html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi);
    for (const m of ogImages) urls.add(m[1]);

    const ogImagesAlt = html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi);
    for (const m of ogImagesAlt) urls.add(m[1]);

    const jsonLdBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const block of jsonLdBlocks) {
      try {
        const data = JSON.parse(block[1]);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (Array.isArray(item.photo)) {
            for (const p of item.photo) {
              const imgUrl = typeof p === "string" ? p : p?.contentUrl ?? p?.url;
              if (imgUrl) urls.add(imgUrl);
            }
          }
          if (Array.isArray(item.image)) {
            for (const img of item.image) {
              const imgUrl = typeof img === "string" ? img : img?.url ?? img?.contentUrl;
              if (imgUrl) urls.add(imgUrl);
            }
          } else if (typeof item.image === "string") {
            urls.add(item.image);
          }
        }
      } catch { /* skip malformed JSON-LD */ }
    }

    const imgTags = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*/gi);
    for (const m of imgTags) {
      const src = m[1];
      const tag = m[0].toLowerCase();
      const isListing =
        tag.includes("gallery") || tag.includes("carousel") || tag.includes("slider") ||
        tag.includes("property") || tag.includes("listing") || tag.includes("hero") ||
        tag.includes("photo") || tag.includes("main-image");
      const isLargeEnough =
        !src.includes("thumb") && !src.includes("icon") && !src.includes("logo") &&
        !src.includes("avatar") && !src.includes("favicon") && !src.includes("1x1");
      if (isListing && isLargeEnough) urls.add(src);
    }

    const srcsets = html.matchAll(/["'](https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)[^"'\s]*)["']/gi);
    for (const m of srcsets) {
      const src = m[1];
      if (!src.includes("thumb") && !src.includes("icon") && !src.includes("logo") && !src.includes("avatar")) {
        if (src.includes("property") || src.includes("listing") || src.includes("photo") ||
            src.includes("gallery") || src.includes("image") || src.includes("media")) {
          urls.add(src);
        }
      }
    }

    const cleaned: string[] = [];
    for (let url of urls) {
      if (url.startsWith("//")) url = "https:" + url;
      if (!url.startsWith("http")) continue;
      if (url.includes("logo") || url.includes("icon") || url.includes("avatar") ||
          url.includes("favicon") || url.includes("placeholder") || url.includes("1x1") ||
          url.includes(".svg") || url.includes(".gif")) continue;
      cleaned.push(url);
    }

    console.log(`[Enrich] Scraped ${cleaned.length} photo URLs from listing page`);
    return cleaned;
  } catch (err) {
    console.error("[Enrich] Failed to scrape listing page:", (err as Error).message);
    return [];
  }
}

async function downloadPhoto(
  url: string,
  userId: string,
  propertyId: string,
  projectId: string,
  index: number,
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
    const filename = `listing-photo-${index + 1}${ext}`;
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

function indexProperty(row: Record<string, any>) {
  const fields: Record<string, any> = {};
  for (const f of PROPERTY_INDEX_FIELDS) {
    if (row[f] != null) fields[f] = row[f];
  }
  if (row.bedrooms) fields.bedrooms = `${row.bedrooms} bedrooms`;
  if (row.bathrooms) fields.bathrooms = `${row.bathrooms} bathrooms`;
  if (row.price_asking) fields.price_asking = `$${row.price_asking}`;
  indexRecord("property", row.id, fields).catch((err) =>
    console.error(`[Embeddings] Failed to index property/${row.id}:`, err.message)
  );
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
    const { project_id, watchlist_status } = req.query as any;
    const conditions = [];

    if (project_id) conditions.push(eq(schema.properties.project_id, project_id));
    if (watchlist_status) conditions.push(eq(schema.properties.watchlist_status, watchlist_status));

    const userProjects = db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.user_id, req.userId));

    const rows = await db
      .select()
      .from(schema.properties)
      .where(
        conditions.length > 0
          ? and(...conditions)
          : undefined
      );

    return { data: rows, total: rows.length };
  });

  app.get("/api/v1/properties/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.id, id))
      .limit(1);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/properties", async (req, reply) => {
    const body = createPropertySchema.parse(req.body);
    const [row] = await db
      .insert(schema.properties)
      .values(body)
      .returning();
    indexProperty(row);
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
    return { data: row };
  });

  app.delete("/api/v1/properties/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(schema.properties)
      .where(eq(schema.properties.id, id))
      .returning();
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

      const result = await enrichPropertyWorkflow.invoke({
        listing_url: property.listing_url ?? "",
        address: property.address ?? "",
        suburb: property.suburb ?? "",
        city: property.city ?? "",
      });

      const extracted = result.extracted ?? {};
      app.log.info({ propertyId: id, extracted }, "[Enrich] Workflow returned");

      if (Object.keys(extracted).length === 0) {
        return reply
          .status(422)
          .send({ error: "Could not extract listing details" });
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

      if (Object.keys(updates).length === 0) {
        app.log.info({ propertyId: id }, "[Enrich] No usable fields in extracted data");
        return { data: property, enriched_fields: [], extracted };
      }

      updates.updated_at = new Date();
      const [updated] = await db
        .update(schema.properties)
        .set(updates)
        .where(eq(schema.properties.id, id))
        .returning();

      indexProperty(updated);

      const enrichedFields = Object.keys(updates).filter((k) => k !== "updated_at");
      app.log.info({ propertyId: id, enrichedFields }, "[Enrich] Property updated");

      let photosDownloaded = 0;
      if (property.listing_url) {
        const photoUrls = await scrapePhotoUrls(property.listing_url);
        if (photoUrls.length > 0) {
          app.log.info({ propertyId: id, count: photoUrls.length }, "[Enrich] Downloading listing photos");
          const downloads = await Promise.allSettled(
            photoUrls.slice(0, 20).map((url, i) =>
              downloadPhoto(url, req.userId, id, property.project_id, i)
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

      return { data: updated, enriched_fields: enrichedFields, photos_downloaded: photosDownloaded };
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
