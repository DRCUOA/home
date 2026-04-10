const ADDRESSFINDER_API_KEY = process.env.ADDRESSFINDER_API_KEY || "";
const ADDRESSFINDER_API_SECRET = process.env.ADDRESSFINDER_API_SECRET || "";
const AF_BASE = "https://api.addressfinder.io/api/nz";

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
  linz_address_id?: string;
}

export interface AutocompleteResult {
  address: string;
  pxid: string;
}

export interface AutocompleteMetadata {
  latitude: number;
  longitude: number;
  address: string;
  suburb?: string;
  city?: string;
  linz_address_id?: string;
}

function afParams(extra: Record<string, string>): URLSearchParams {
  return new URLSearchParams({
    key: ADDRESSFINDER_API_KEY,
    secret: ADDRESSFINDER_API_SECRET,
    format: "json",
    ...extra,
  });
}

async function tryGeocode(query: string): Promise<GeocodingResult | null> {
  try {
    const params = afParams({ q: query, max: "1" });
    const res = await fetch(`${AF_BASE}/address?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const completions = data.completions;
    if (!completions || completions.length === 0) return null;

    const pxid = completions[0].pxid;
    const metaParams = afParams({ pxid });
    const metaRes = await fetch(`${AF_BASE}/address/info?${metaParams}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!metaRes.ok) return null;

    const meta = await metaRes.json();
    const lat = parseFloat(meta.y);
    const lng = parseFloat(meta.x);
    if (isNaN(lat) || isNaN(lng)) return null;

    return {
      latitude: lat,
      longitude: lng,
      formatted_address: meta.a || completions[0].a || query,
      linz_address_id: meta.linz_address_id || undefined,
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
  if (!ADDRESSFINDER_API_KEY) {
    console.warn("[Geocoding] ADDRESSFINDER_API_KEY not set, skipping");
    return null;
  }

  // Try progressively simpler queries until one matches.
  // NZ district names (e.g. "Waimakariri") often confuse the geocoder
  // when used as city, so we try without city first if suburb is present.
  const queries: string[] = [];

  if (suburb) {
    queries.push([address, suburb].join(", "));
  }
  queries.push([address, suburb, city].filter(Boolean).join(", "));
  if (city && city !== suburb) {
    queries.push([address, city].join(", "));
  }
  queries.push(address);

  for (const q of queries) {
    const result = await tryGeocode(q);
    if (result) return result;
  }

  console.warn(`[Geocoding] All attempts failed for: ${address}, ${suburb}, ${city}`);
  return null;
}

export async function addressAutocomplete(
  query: string,
  max = 8
): Promise<AutocompleteResult[]> {
  if (!ADDRESSFINDER_API_KEY || !query.trim()) return [];

  try {
    const params = afParams({ q: query.trim(), max: String(max) });
    const res = await fetch(`${AF_BASE}/address?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    return (data.completions || []).map((c: any) => ({
      address: c.a,
      pxid: c.pxid,
    }));
  } catch {
    return [];
  }
}

export async function getAddressMetadata(
  pxid: string
): Promise<AutocompleteMetadata | null> {
  if (!ADDRESSFINDER_API_KEY) return null;

  try {
    const params = afParams({ pxid });
    const res = await fetch(`${AF_BASE}/address/info?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const meta = await res.json();
    const lat = parseFloat(meta.y);
    const lng = parseFloat(meta.x);
    if (isNaN(lat) || isNaN(lng)) return null;

    return {
      latitude: lat,
      longitude: lng,
      address: meta.a || "",
      suburb: meta.suburb || undefined,
      city: meta.city || undefined,
      linz_address_id: meta.linz_address_id || undefined,
    };
  } catch {
    return null;
  }
}
