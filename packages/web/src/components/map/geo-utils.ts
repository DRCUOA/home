const R = 6371;

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function estimateDriveMinutes(km: number): number {
  if (km < 2) return Math.max(1, Math.round(km / 0.5));
  if (km < 10) return Math.round(km / 0.7);
  return Math.round(km / 0.9);
}

export function estimateWalkMinutes(km: number): number {
  return Math.round(km / (5 / 60));
}

export function estimateCycleMinutes(km: number): number {
  return Math.round(km / (15 / 60));
}

export function bearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function bearingLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

export function sunExposureNote(latitude: number): string {
  if (latitude < 0) {
    return "In the Southern Hemisphere, north-facing aspects receive the most sun — ideal for warmth and natural light.";
  }
  return "In the Northern Hemisphere, south-facing aspects receive the most sun.";
}

export function coastProximityNote(
  distToCoastKm: number | null
): string | null {
  if (distToCoastKm == null) return null;
  if (distToCoastKm < 0.5) return "Very close to coast — check tsunami and storm surge risk";
  if (distToCoastKm < 2) return "Near coast — sea breeze, salt air exposure likely";
  if (distToCoastKm < 5) return "Moderate coastal proximity — some maritime weather influence";
  return null;
}

/**
 * Optimizes stop ordering between fixed start/end points for minimal total
 * haversine distance. Uses exact permutation search for ≤8 stops,
 * nearest-neighbor heuristic for larger sets.
 *
 * @returns indices into the `stops` array in optimized visit order
 */
export function optimizeStopOrder(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  stops: { lat: number; lng: number }[]
): number[] {
  if (stops.length <= 1) return stops.map((_, i) => i);

  const n = stops.length;
  const allPoints = [start, ...stops, end];

  const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    haversineKm(a.lat, a.lng, b.lat, b.lng);

  if (n <= 8) {
    return tspExact(allPoints, dist);
  }
  return tspNearestNeighbor(allPoints, dist, n);
}

function tspExact(
  allPoints: { lat: number; lng: number }[],
  dist: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number
): number[] {
  const n = allPoints.length - 2; // stops count (exclude start index 0 and end index n+1)
  const indices = Array.from({ length: n }, (_, i) => i);
  let bestOrder = [...indices];
  let bestCost = Infinity;

  const permute = (arr: number[], l: number) => {
    if (l === arr.length) {
      let cost = dist(allPoints[0], allPoints[arr[0] + 1]);
      for (let i = 0; i < arr.length - 1; i++) {
        cost += dist(allPoints[arr[i] + 1], allPoints[arr[i + 1] + 1]);
      }
      cost += dist(allPoints[arr[arr.length - 1] + 1], allPoints[allPoints.length - 1]);
      if (cost < bestCost) {
        bestCost = cost;
        bestOrder = [...arr];
      }
      return;
    }
    for (let i = l; i < arr.length; i++) {
      [arr[l], arr[i]] = [arr[i], arr[l]];
      permute(arr, l + 1);
      [arr[l], arr[i]] = [arr[i], arr[l]];
    }
  };

  permute(indices, 0);
  return bestOrder;
}

function tspNearestNeighbor(
  allPoints: { lat: number; lng: number }[],
  dist: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number,
  n: number
): number[] {
  const visited = new Set<number>();
  const order: number[] = [];
  let current = allPoints[0]; // start

  for (let step = 0; step < n; step++) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue;
      const d = dist(current, allPoints[i + 1]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    visited.add(bestIdx);
    order.push(bestIdx);
    current = allPoints[bestIdx + 1];
  }

  return order;
}

export interface AmenityCount {
  schools: number;
  supermarkets: number;
  parks: number;
  cafes: number;
  medical: number;
  transit: number;
}

export function walkabilityScore(counts: AmenityCount): {
  score: number;
  label: string;
} {
  const raw =
    Math.min(counts.schools, 3) * 15 +
    Math.min(counts.supermarkets, 2) * 15 +
    Math.min(counts.parks, 3) * 10 +
    Math.min(counts.cafes, 5) * 4 +
    Math.min(counts.medical, 2) * 10 +
    Math.min(counts.transit, 4) * 5;

  const score = Math.min(100, raw);
  let label = "Car dependent";
  if (score >= 80) label = "Walker's paradise";
  else if (score >= 60) label = "Very walkable";
  else if (score >= 40) label = "Somewhat walkable";
  else if (score >= 20) label = "Car dependent";

  return { score, label };
}
