const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

const PLACES_BASE = "https://places.googleapis.com/v1";
const GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";
const REGION = "nz";

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

export interface AutocompleteResult {
  address: string;
  place_id: string;
}

export interface AutocompleteMetadata {
  latitude: number;
  longitude: number;
  address: string;
  suburb?: string;
  city?: string;
}

function extractComponent(
  components: any[] | undefined,
  types: string[]
): string | undefined {
  if (!components) return undefined;
  for (const c of components) {
    const cTypes: string[] = c.types || [];
    if (types.some((t) => cTypes.includes(t))) {
      return c.longText || c.long_name || undefined;
    }
  }
  return undefined;
}

async function geocodeViaGoogle(query: string): Promise<GeocodingResult | null> {
  try {
    const params = new URLSearchParams({
      address: query,
      components: `country:${REGION.toUpperCase()}`,
      key: GOOGLE_MAPS_API_KEY,
    });
    const res = await fetch(`${GEOCODE_BASE}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) return null;

    const hit = data.results[0];
    const loc = hit.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
      return null;
    }
    return {
      latitude: loc.lat,
      longitude: loc.lng,
      formatted_address: hit.formatted_address || query,
    };
  } catch {
    return null;
  }
}

export async function geocodeAddress(
  address: string,
  suburb?: string,
  city?: string
): Promise<GeocodingResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("[Geocoding] GOOGLE_MAPS_API_KEY not set, skipping");
    return null;
  }

  const queries: string[] = [];
  if (suburb) queries.push([address, suburb].join(", "));
  queries.push([address, suburb, city].filter(Boolean).join(", "));
  if (city && city !== suburb) queries.push([address, city].join(", "));
  queries.push(address);

  for (const q of queries) {
    const result = await geocodeViaGoogle(q);
    if (result) return result;
  }

  console.warn(`[Geocoding] All attempts failed for: ${address}, ${suburb}, ${city}`);
  return null;
}

export async function addressAutocomplete(
  query: string,
  sessionToken?: string,
  max = 8
): Promise<AutocompleteResult[]> {
  if (!GOOGLE_MAPS_API_KEY || !query.trim()) return [];

  try {
    const body: Record<string, unknown> = {
      input: query.trim(),
      includedRegionCodes: [REGION],
    };
    if (sessionToken) body.sessionToken = sessionToken;

    const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const suggestions = data.suggestions || [];
    return suggestions
      .slice(0, max)
      .map((s: any) => {
        const p = s.placePrediction;
        if (!p?.placeId) return null;
        return {
          address: p.text?.text || p.structuredFormat?.mainText?.text || "",
          place_id: p.placeId,
        };
      })
      .filter((r: AutocompleteResult | null): r is AutocompleteResult => r !== null);
  } catch {
    return [];
  }
}

export async function getAddressMetadata(
  placeId: string,
  sessionToken?: string
): Promise<AutocompleteMetadata | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const url = new URL(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`);
    if (sessionToken) url.searchParams.set("sessionToken", sessionToken);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "location,formattedAddress,addressComponents",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const meta = await res.json();
    const lat = meta.location?.latitude;
    const lng = meta.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return null;

    const components = meta.addressComponents;
    return {
      latitude: lat,
      longitude: lng,
      address: meta.formattedAddress || "",
      suburb: extractComponent(components, ["sublocality", "sublocality_level_1", "neighborhood"]),
      city: extractComponent(components, ["locality", "postal_town", "administrative_area_level_1"]),
    };
  } catch {
    return null;
  }
}
