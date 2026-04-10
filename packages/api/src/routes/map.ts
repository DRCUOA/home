import { FastifyInstance } from "fastify";
import { eq, and, isNull } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import {
  geocodeAddress,
  addressAutocomplete,
  getAddressMetadata,
} from "../services/geocoding.js";

const LINZ_BASEMAP_API_KEY = process.env.LINZ_BASEMAP_API_KEY || "";
const OSRM_BASE_URL =
  process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

const LAYER_DEFINITIONS = [
  {
    id: "property-pins",
    label: "Property pins",
    category: "My Properties",
    type: "symbol",
    defaultVisible: true,
  },
  {
    id: "value-heatmap",
    label: "Value heatmap",
    category: "My Properties",
    type: "heatmap",
    defaultVisible: false,
  },
  {
    id: "flood-coastal",
    label: "Flood / coastal inundation",
    category: "Risk & Hazards",
    type: "raster",
    defaultVisible: false,
  },
  {
    id: "earthquake-faults",
    label: "Earthquake faults",
    category: "Risk & Hazards",
    type: "line",
    defaultVisible: false,
  },
  {
    id: "tsunami-zones",
    label: "Tsunami zones",
    category: "Risk & Hazards",
    type: "raster",
    defaultVisible: false,
  },
  {
    id: "liquefaction",
    label: "Liquefaction risk",
    category: "Risk & Hazards",
    type: "raster",
    defaultVisible: false,
  },
  {
    id: "school-zones",
    label: "School zones",
    category: "Neighbourhood",
    type: "fill",
    defaultVisible: false,
  },
];

interface CouncilEndpoint {
  name: string;
  bbox: [number, number, number, number]; // [west, south, east, north]
  url: string;
  layers?: string;
}

const FLOOD_ENDPOINTS: CouncilEndpoint[] = [
  {
    name: "Auckland",
    bbox: [174.0, -37.5, 175.5, -36.0],
    url: "https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Flood_Prone_Areas/FeatureServer/0",
  },
  {
    name: "Wellington",
    bbox: [174.5, -41.5, 175.5, -40.8],
    url: "https://mapping.gw.govt.nz/arcgis/rest/services/GW/Flood_Hazards_Areas/MapServer",
    layers: "0",
  },
  {
    name: "Canterbury",
    bbox: [170.5, -44.5, 173.5, -42.0],
    url: "https://gis.ecan.govt.nz/arcgis/rest/services/Public/Flood_Hazard/MapServer",
    layers: "0",
  },
];

const GNS_FAULTS_URL =
  "https://gis.gns.cri.nz/server/rest/services/Active_Faults/NZActiveFaultDatasets/MapServer";

const geojsonCache = new Map<string, { data: any; timestamp: number }>();
const GEOJSON_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function getCachedGeoJSON(key: string): any | null {
  const entry = geojsonCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > GEOJSON_CACHE_TTL) {
    geojsonCache.delete(key);
    return null;
  }
  return entry.data;
}

function bboxOverlaps(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

async function queryArcGISFeatures(
  url: string,
  bbox: string,
  layerIndex?: string
): Promise<any[]> {
  const isFeatureServer = url.includes("FeatureServer");
  const queryBase = isFeatureServer ? url : `${url}/${layerIndex || "0"}`;

  const params = new URLSearchParams({
    where: "1=1",
    geometry: bbox,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    returnGeometry: "true",
    outFields: "OBJECTID",
    f: "geojson",
    resultRecordCount: "2000",
  });

  const res = await fetch(`${queryBase}/query?${params}`, {
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) return [];

  const data = await res.json();
  return data.features || [];
}

async function fetchRouteSegment(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
  mode: "walking" | "driving"
): Promise<{
  coordinates: [number, number][];
  distanceKm: number;
  durationSeconds: number;
} | null> {
  const profile = mode === "walking" ? "foot" : "driving";
  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
  });

  const res = await fetch(
    `${OSRM_BASE_URL}/route/v1/${profile}/${fromLng},${fromLat};${toLng},${toLat}?${params}`,
    { signal: AbortSignal.timeout(12000) }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const route = data?.routes?.[0];
  if (
    !route?.geometry?.coordinates ||
    typeof route.distance !== "number" ||
    typeof route.duration !== "number"
  ) {
    return null;
  }

  return {
    coordinates: route.geometry.coordinates,
    distanceKm: route.distance / 1000,
    durationSeconds: route.duration,
  };
}

let schoolZoneCacheEntry: { data: any; timestamp: number } | null = null;
const SCHOOL_ZONE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export default async function mapRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/map/config",
    { preHandler: authGuard },
    async (_request, _reply) => {
      const linzStyleUrl = LINZ_BASEMAP_API_KEY
        ? `https://basemaps.linz.govt.nz/v1/tiles/topographic/WebMercatorQuad/style/topographic.json?api=${LINZ_BASEMAP_API_KEY}`
        : null;

      const linzAerialUrl = LINZ_BASEMAP_API_KEY
        ? `https://basemaps.linz.govt.nz/v1/tiles/aerial/WebMercatorQuad/{z}/{x}/{y}.webp?api=${LINZ_BASEMAP_API_KEY}`
        : null;

      return {
        data: {
          linzStyleUrl,
          linzAerialUrl,
          linzApiKey: LINZ_BASEMAP_API_KEY || null,
          layers: LAYER_DEFINITIONS,
        },
      };
    }
  );

  app.get(
    "/api/v1/map/route",
    { preHandler: authGuard },
    async (request, reply) => {
      const { from_lng, from_lat, to_lng, to_lat, mode } = request.query as {
        from_lng?: string;
        from_lat?: string;
        to_lng?: string;
        to_lat?: string;
        mode?: string;
      };

      const fromLng = Number(from_lng);
      const fromLat = Number(from_lat);
      const toLng = Number(to_lng);
      const toLat = Number(to_lat);
      const resolvedMode = mode === "walking" ? "walking" : mode === "driving" ? "driving" : null;

      if (
        !Number.isFinite(fromLng) ||
        !Number.isFinite(fromLat) ||
        !Number.isFinite(toLng) ||
        !Number.isFinite(toLat)
      ) {
        return reply
          .status(400)
          .send({ error: "from_lng, from_lat, to_lng, to_lat are required numbers" });
      }

      if (!resolvedMode) {
        return reply.status(400).send({ error: "mode must be 'walking' or 'driving'" });
      }

      try {
        const segment = await fetchRouteSegment(
          fromLng,
          fromLat,
          toLng,
          toLat,
          resolvedMode
        );
        if (!segment) {
          return reply.status(404).send({ error: "No route found for this segment" });
        }
        return {
          data: {
            coordinates: segment.coordinates,
            distance_km: segment.distanceKm,
            duration_s: segment.durationSeconds,
            mode: resolvedMode,
          },
        };
      } catch {
        return reply.status(502).send({ error: "Route lookup failed" });
      }
    }
  );

  app.get(
    "/api/v1/map/properties",
    { preHandler: authGuard },
    async (request, _reply) => {
      const { project_id } = request.query as { project_id?: string };

      const userProjects = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.user_id, request.userId));

      const projectIds = new Set(userProjects.map((p) => p.id));

      let rows = await db
        .select()
        .from(schema.properties)
        .where(
          project_id
            ? eq(schema.properties.project_id, project_id)
            : undefined
        );

      rows = rows.filter((r) => projectIds.has(r.project_id));

      const mapped = rows
        .filter((r) => r.latitude != null && r.longitude != null)
        .map((r) => ({
          id: r.id,
          project_id: r.project_id,
          address: r.address,
          suburb: r.suburb,
          city: r.city,
          latitude: r.latitude,
          longitude: r.longitude,
          price_asking: r.price_asking,
          price_guide_low: r.price_guide_low,
          price_guide_high: r.price_guide_high,
          bedrooms: r.bedrooms,
          bathrooms: r.bathrooms,
          property_type: r.property_type,
          watchlist_status: r.watchlist_status,
          is_own_home: r.is_own_home,
          favourite_rank: r.favourite_rank,
          listing_url: r.listing_url,
        }));

      return { data: mapped, total: mapped.length };
    }
  );

  app.post(
    "/api/v1/map/geocode",
    { preHandler: authGuard },
    async (request, reply) => {
      const { address, suburb, city } = request.body as {
        address: string;
        suburb?: string;
        city?: string;
      };

      if (!address) {
        return reply.status(400).send({ error: "address is required" });
      }

      const result = await geocodeAddress(address, suburb, city);
      if (!result) {
        return reply
          .status(404)
          .send({ error: "Could not geocode this address" });
      }

      return { data: result };
    }
  );

  app.get(
    "/api/v1/map/address-autocomplete",
    { preHandler: authGuard },
    async (request, _reply) => {
      const { q } = request.query as { q?: string };
      if (!q) return { data: [] };

      const results = await addressAutocomplete(q);
      return { data: results };
    }
  );

  app.get(
    "/api/v1/map/address-metadata",
    { preHandler: authGuard },
    async (request, reply) => {
      const { pxid } = request.query as { pxid?: string };
      if (!pxid) {
        return reply.status(400).send({ error: "pxid is required" });
      }

      const meta = await getAddressMetadata(pxid);
      if (!meta) {
        return reply.status(404).send({ error: "Address not found" });
      }

      return { data: meta };
    }
  );

  app.get(
    "/api/v1/map/layers/flood",
    { preHandler: authGuard },
    async (request, reply) => {
      const { bbox } = request.query as { bbox?: string };
      if (!bbox) {
        return { data: { type: "FeatureCollection", features: [] } };
      }

      const roundedBbox = bbox
        .split(",")
        .map((v) => Math.round(parseFloat(v) * 100) / 100)
        .join(",");
      const cacheKey = `flood:${roundedBbox}`;
      const cached = getCachedGeoJSON(cacheKey);
      if (cached) return { data: cached };

      const [west, south, east, north] = bbox.split(",").map(Number);
      const viewBbox: [number, number, number, number] = [
        west,
        south,
        east,
        north,
      ];

      const allFeatures: any[] = [];

      for (const endpoint of FLOOD_ENDPOINTS) {
        if (!bboxOverlaps(viewBbox, endpoint.bbox)) continue;

        try {
          const features = await queryArcGISFeatures(
            endpoint.url,
            bbox,
            endpoint.layers
          );
          allFeatures.push(...features);
        } catch {
          // skip failing endpoints
        }
      }

      const result = { type: "FeatureCollection", features: allFeatures };
      geojsonCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return { data: result };
    }
  );

  app.get(
    "/api/v1/map/layers/faults",
    { preHandler: authGuard },
    async (request, reply) => {
      const { bbox } = request.query as { bbox?: string };
      if (!bbox) {
        return { data: { type: "FeatureCollection", features: [] } };
      }

      const roundedBbox = bbox
        .split(",")
        .map((v) => Math.round(parseFloat(v) * 100) / 100)
        .join(",");
      const cacheKey = `faults:${roundedBbox}`;
      const cached = getCachedGeoJSON(cacheKey);
      if (cached) return { data: cached };

      const params = new URLSearchParams({
        where: "1=1",
        geometry: bbox,
        geometryType: "esriGeometryEnvelope",
        inSR: "4326",
        outSR: "4326",
        returnGeometry: "true",
        outFields: "objectid,name",
        f: "geojson",
        resultRecordCount: "2000",
      });

      try {
        const res = await fetch(
          `${GNS_FAULTS_URL}/0/query?${params}`,
          { signal: AbortSignal.timeout(30000) }
        );

        if (!res.ok) {
          return reply.status(502).send({ error: "Upstream fault query failed" });
        }

        const data = await res.json();
        const result = {
          type: "FeatureCollection",
          features: data.features || [],
        };

        geojsonCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return { data: result };
      } catch {
        return reply.status(502).send({ error: "Fault data fetch error" });
      }
    }
  );

  app.get(
    "/api/v1/map/layers/fault-zones",
    { preHandler: authGuard },
    async (request, reply) => {
      const { bbox } = request.query as { bbox?: string };
      if (!bbox) {
        return { data: { type: "FeatureCollection", features: [] } };
      }

      const roundedBbox = bbox
        .split(",")
        .map((v) => Math.round(parseFloat(v) * 100) / 100)
        .join(",");
      const cacheKey = `fault-zones:${roundedBbox}`;
      const cached = getCachedGeoJSON(cacheKey);
      if (cached) return { data: cached };

      const allFeatures: any[] = [];

      for (const layerIdx of ["7", "8"]) {
        const params = new URLSearchParams({
          where: "1=1",
          geometry: bbox,
          geometryType: "esriGeometryEnvelope",
          inSR: "4326",
          outSR: "4326",
          returnGeometry: "true",
          outFields: "OBJECTID",
          f: "geojson",
          resultRecordCount: "1000",
        });

        try {
          const res = await fetch(
            `${GNS_FAULTS_URL}/${layerIdx}/query?${params}`,
            { signal: AbortSignal.timeout(30000) }
          );

          if (res.ok) {
            const data = await res.json();
            if (data.features) allFeatures.push(...data.features);
          }
        } catch {
          // skip
        }
      }

      const result = { type: "FeatureCollection", features: allFeatures };
      geojsonCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return { data: result };
    }
  );

  app.get(
    "/api/v1/map/layers/school-zones",
    { preHandler: authGuard },
    async (_request, reply) => {
      if (
        schoolZoneCacheEntry &&
        Date.now() - schoolZoneCacheEntry.timestamp < SCHOOL_ZONE_TTL
      ) {
        return { data: schoolZoneCacheEntry.data };
      }

      try {
        const dataGovtUrl =
          "https://koordinates.com/services/query/v1/vector.json?key=YOUR_KOORDINATES_KEY&layer=4118&geom=true&max_results=5000";
        // Placeholder: In production, replace with a valid koordinates/data.govt.nz API key
        // For now, return an empty FeatureCollection
        const emptyCollection = {
          type: "FeatureCollection",
          features: [],
        };

        schoolZoneCacheEntry = {
          data: emptyCollection,
          timestamp: Date.now(),
        };

        return { data: emptyCollection };
      } catch {
        return reply.status(502).send({ error: "Failed to fetch school zones" });
      }
    }
  );

  // ── Nearby amenities (Nominatim viewbox search) ──

  const nearbyCache = new Map<
    string,
    { data: any; timestamp: number }
  >();
  const NEARBY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h — amenities rarely change

  app.get(
    "/api/v1/map/nearby",
    { preHandler: authGuard },
    async (request, reply) => {
      const { lat, lng, radius } = request.query as {
        lat?: string;
        lng?: string;
        radius?: string;
      };

      if (!lat || !lng) {
        return reply.status(400).send({ error: "lat and lng are required" });
      }

      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      const radiusM = parseInt(radius || "1000", 10);

      // Round to ~100m grid for cache efficiency
      const cacheKey = `${latitude.toFixed(3)}:${longitude.toFixed(3)}:${radiusM}`;
      const cached = nearbyCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < NEARBY_CACHE_TTL) {
        return { data: cached.data };
      }

      // Convert radius in meters to degrees for viewbox
      // 1 degree latitude ~= 111km; longitude varies by cos(lat)
      const dLat = radiusM / 111_000;
      const dLng = radiusM / (111_000 * Math.cos((latitude * Math.PI) / 180));

      const west = (longitude - dLng).toFixed(6);
      const south = (latitude - dLat).toFixed(6);
      const east = (longitude + dLng).toFixed(6);
      const north = (latitude + dLat).toFixed(6);
      const viewbox = `${west},${south},${east},${north}`;

      // Use simple single-term queries — Nominatim handles these far more
      // reliably than compound OR expressions. Multiple queries for the same
      // category are merged by countKey.
      const categories: {
        query: string;
        type: string;
        countKey: string;
      }[] = [
        { query: "school", type: "school", countKey: "schools" },
        { query: "supermarket", type: "supermarket", countKey: "supermarkets" },
        { query: "park", type: "park", countKey: "parks" },
        { query: "cafe", type: "cafe", countKey: "cafes" },
        { query: "pharmacy", type: "medical", countKey: "medical" },
        { query: "bus stop", type: "transit", countKey: "transit" },
      ];

      const counts: Record<string, number> = {
        schools: 0,
        supermarkets: 0,
        parks: 0,
        cafes: 0,
        medical: 0,
        transit: 0,
      };

      const pois: { name: string; type: string; lat: number; lng: number }[] = [];

      // Nominatim usage policy: max 1 request/second. Run sequentially
      // with a delay between each call.
      for (const cat of categories) {
        try {
          const params = new URLSearchParams({
            format: "json",
            q: cat.query,
            viewbox,
            bounded: "1",
            limit: "10",
            countrycodes: "nz",
          });

          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?${params}`,
            {
              headers: {
                "User-Agent": "Homelhar/1.0 (home-buying-app; contact@homelhar.co.nz)",
              },
              signal: AbortSignal.timeout(8000),
            }
          );

          if (res.ok) {
            const items: any[] = await res.json();
            counts[cat.countKey] = (counts[cat.countKey] || 0) + items.length;
            for (const item of items) {
              pois.push({
                name: item.display_name?.split(",")[0] || cat.type,
                type: cat.type,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
              });
            }
          }
        } catch {
          // Skip this category on failure
        }

        await new Promise((r) => setTimeout(r, 1100));
      }

      const result = {
        counts: {
          schools: counts.schools,
          supermarkets: counts.supermarkets,
          parks: counts.parks,
          cafes: counts.cafes,
          medical: counts.medical,
          transit: counts.transit,
        },
        pois: pois.slice(0, 30),
        radius: radiusM,
      };

      nearbyCache.set(cacheKey, { data: result, timestamp: Date.now() });

      return { data: result };
    }
  );

  // ── Custom pins CRUD ──

  app.get(
    "/api/v1/map/pins",
    { preHandler: authGuard },
    async (request, _reply) => {
      const rows = await db
        .select()
        .from(schema.mapPins)
        .where(eq(schema.mapPins.user_id, request.userId));
      return { data: rows, total: rows.length };
    }
  );

  app.post(
    "/api/v1/map/pins",
    { preHandler: authGuard },
    async (request, reply) => {
      const { label, latitude, longitude, color, icon, notes } = request.body as {
        label: string;
        latitude: number;
        longitude: number;
        color?: string;
        icon?: string;
        notes?: string;
      };

      if (!label || latitude == null || longitude == null) {
        return reply.status(400).send({ error: "label, latitude and longitude are required" });
      }

      const [row] = await db
        .insert(schema.mapPins)
        .values({
          user_id: request.userId,
          label: label.slice(0, 200),
          latitude,
          longitude,
          color: color || "#8b5cf6",
          icon: icon || "pin",
          notes: notes || undefined,
        })
        .returning();

      return reply.status(201).send({ data: row });
    }
  );

  app.patch(
    "/api/v1/map/pins/:id",
    { preHandler: authGuard },
    async (request, reply) => {
      const { id: pinId } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (typeof body.label === "string") updates.label = body.label.slice(0, 200);
      if (typeof body.color === "string") updates.color = body.color;
      if (typeof body.icon === "string") updates.icon = body.icon;
      if (typeof body.notes === "string") updates.notes = body.notes;
      if (typeof body.latitude === "number") updates.latitude = body.latitude;
      if (typeof body.longitude === "number") updates.longitude = body.longitude;

      const [row] = await db
        .update(schema.mapPins)
        .set(updates)
        .where(
          and(
            eq(schema.mapPins.id, pinId),
            eq(schema.mapPins.user_id, request.userId)
          )
        )
        .returning();

      if (!row) return reply.status(404).send({ error: "Not Found" });
      return { data: row };
    }
  );

  app.delete(
    "/api/v1/map/pins/:id",
    { preHandler: authGuard },
    async (request, reply) => {
      const { id: pinId } = request.params as { id: string };
      const [row] = await db
        .delete(schema.mapPins)
        .where(
          and(
            eq(schema.mapPins.id, pinId),
            eq(schema.mapPins.user_id, request.userId)
          )
        )
        .returning();

      if (!row) return reply.status(404).send({ error: "Not Found" });
      return { data: row };
    }
  );

  app.post(
    "/api/v1/map/geocode-all",
    { preHandler: authGuard },
    async (request, _reply) => {
      const userProjects = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.user_id, request.userId));

      const projectIds = userProjects.map((p) => p.id);
      if (projectIds.length === 0) return { data: { geocoded: 0, failed: 0 } };

      const ungeocodedProperties = await db
        .select()
        .from(schema.properties)
        .where(isNull(schema.properties.latitude));

      const userProperties = ungeocodedProperties.filter((p) =>
        projectIds.includes(p.project_id)
      );

      let geocoded = 0;
      let failed = 0;

      for (const prop of userProperties) {
        if (!prop.address) {
          failed++;
          continue;
        }

        try {
          const result = await geocodeAddress(
            prop.address,
            prop.suburb ?? undefined,
            prop.city ?? undefined
          );

          if (result) {
            await db
              .update(schema.properties)
              .set({
                latitude: result.latitude,
                longitude: result.longitude,
                updated_at: new Date(),
              })
              .where(eq(schema.properties.id, prop.id));
            geocoded++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }

        // Rate limit: 200ms between calls
        await new Promise((r) => setTimeout(r, 200));
      }

      return { data: { geocoded, failed, total: userProperties.length } };
    }
  );
}
