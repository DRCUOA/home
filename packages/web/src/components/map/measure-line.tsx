import { Source, Layer } from "react-map-gl/maplibre";
import { useMemo, useState } from "react";
import { haversineKm, formatDistance } from "./geo-utils";

export interface MeasurePoint {
  lng: number;
  lat: number;
  /** Pin/property name from saved locations; omitted for map-tapped points → shown as stop n */
  label?: string;
}

export type MeasurePathMode = "straight" | "walking" | "driving";

export interface MeasureSegment {
  coordinates: [number, number][];
  distanceKm: number;
  durationMin?: number;
  fallback?: boolean;
}

interface MeasureLineProps {
  points: MeasurePoint[];
  segments: MeasureSegment[];
}

function midpointOfSegment(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  return coords[Math.floor(coords.length / 2)];
}

export function MeasureLine({ points, segments }: MeasureLineProps) {
  const geojson = useMemo(() => {
    if (segments.length === 0) return null;

    const features: GeoJSON.Feature[] = [];

    // Line segments
    for (const segment of segments) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: segment.coordinates,
        },
        properties: {},
      });
    }

    // Midpoint labels with distance
    for (const segment of segments) {
      const mid = midpointOfSegment(segment.coordinates);
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: mid,
        },
        properties: {
          label: formatDistance(segment.distanceKm),
          kind: "label",
        },
      });
    }

    // Vertex dots
    for (const p of points) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [p.lng, p.lat],
        },
        properties: { kind: "vertex" },
      });
    }

    return { type: "FeatureCollection" as const, features };
  }, [points, segments]);

  if (!geojson) return null;

  return (
    <Source id="measure-line" type="geojson" data={geojson}>
      <Layer
        id="measure-line-stroke"
        type="line"
        filter={["==", "$type", "LineString"]}
        paint={{
          "line-color": "#ef4444",
          "line-width": 3,
          "line-dasharray": [3, 2],
        }}
      />
      <Layer
        id="measure-vertex"
        type="circle"
        filter={["==", ["get", "kind"], "vertex"]}
        paint={{
          "circle-radius": 5,
          "circle-color": "#ef4444",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        }}
      />
      <Layer
        id="measure-label"
        type="symbol"
        filter={["==", ["get", "kind"], "label"]}
        layout={{
          "text-field": ["get", "label"],
          "text-size": 13,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-anchor": "bottom",
          "text-offset": [0, -0.8],
          "text-allow-overlap": true,
        }}
        paint={{
          "text-color": "#ef4444",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        }}
      />
    </Source>
  );
}

export function MeasureTotal({ points }: { points: MeasurePoint[] }) {
  if (points.length < 2) return null;

  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineKm(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }

  return (
    <div className="rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs flex items-center gap-2">
      <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
        {formatDistance(total)}
      </span>
      {points.length > 2 && (
        <span className="text-slate-400 dark:text-slate-500">
          ({points.length - 1} segments)
        </span>
      )}
    </div>
  );
}

export function buildStraightSegments(points: MeasurePoint[]): MeasureSegment[] {
  if (points.length < 2) return [];

  const segments: MeasureSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    segments.push({
      coordinates: [
        [a.lng, a.lat],
        [b.lng, b.lat],
      ],
      distanceKm: haversineKm(a.lat, a.lng, b.lat, b.lng),
    });
  }
  return segments;
}

interface MeasureTotalProps {
  points: MeasurePoint[];
  segments: MeasureSegment[];
  mode: MeasurePathMode;
  loading?: boolean;
  /** Snapshot before route optimisation — used to show savings */
  preOptimizeDistanceKm?: number | null;
  preOptimizeNonRushMin?: number | null;
  preOptimizeRushMin?: number | null;
}

const AVG_FUEL_L_PER_100KM = 9.2; // NZ average family petrol car (2.0L sedan/SUV)
const NZ_FUEL_PRICE_PER_LITRE = 2.89; // NZD, approximate national average 91 unleaded

function fuelLitres(km: number): number {
  return (km / 100) * AVG_FUEL_L_PER_100KM;
}

function fuelCost(km: number, pricePerLitre: number): number {
  return fuelLitres(km) * pricePerLitre;
}

function estimateDurationMinutes(
  distanceKm: number,
  mode: "walking" | "driving"
): number {
  const speedKmh = mode === "walking" ? 4.8 : 45;
  return (distanceKm / speedKmh) * 60;
}

function formatDuration(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

function vertexDisplayName(points: MeasurePoint[], index: number): string {
  const raw = points[index]?.label?.trim();
  if (raw) return raw;
  return `stop${index + 1}`;
}

export function MeasureTotalEnhanced({
  points,
  segments,
  mode,
  loading = false,
  preOptimizeDistanceKm = null,
  preOptimizeNonRushMin = null,
  preOptimizeRushMin = null,
}: MeasureTotalProps) {
  const [fuelPrice, setFuelPrice] = useState(NZ_FUEL_PRICE_PER_LITRE);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(NZ_FUEL_PRICE_PER_LITRE.toFixed(2));

  if (points.length < 2) return null;

  const total = segments.reduce((sum, segment) => sum + segment.distanceKm, 0);
  const fallbackCount = segments.filter((segment) => segment.fallback).length;
  const hasEta = mode === "walking" || mode === "driving";
  const nonRushMinutes = hasEta
    ? segments.reduce(
        (sum, segment) =>
          sum +
          (segment.durationMin ??
            estimateDurationMinutes(segment.distanceKm, mode)),
        0
      )
    : 0;
  const rushMultiplier = mode === "driving" ? 1.55 : mode === "walking" ? 1.1 : 1;
  const rushMinutes = nonRushMinutes * rushMultiplier;

  return (
    <div className="rounded-xl bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
          {formatDistance(total)}
        </span>
        <span className="text-slate-600 dark:text-slate-300 capitalize">
          ({points.length - 1}{" "}
          {points.length - 1 === 1 ? "segment" : "segments"}, {mode})
        </span>
      </div>
      {segments.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {segments.map((segment, index) => {
            const segmentNonRush = segment.durationMin ??
              (mode === "walking" || mode === "driving"
                ? estimateDurationMinutes(segment.distanceKm, mode)
                : 0);
            const segmentRush = segmentNonRush * rushMultiplier;

            const startName = vertexDisplayName(points, index);
            const endName = vertexDisplayName(points, index + 1);

            return (
              <div
                key={`segment-summary-${index}`}
                className="flex items-start justify-between gap-2 text-[10px] text-slate-700 dark:text-slate-300"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-slate-600 dark:text-slate-400">
                    Seg {index + 1}:
                  </span>{" "}
                  <span className="break-words">
                    {startName} → {endName}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                  <span className="tabular-nums">{formatDistance(segment.distanceKm)}</span>
                  {hasEta && (
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">
                      {formatDuration(segmentNonRush)} / {formatDuration(segmentRush)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {loading && (
        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
          Calculating routed distance...
        </p>
      )}
      {hasEta && !loading && (
        <div className="mt-1 text-[10px] text-slate-600 dark:text-slate-300 space-y-0.5">
          <p>
            Non-rush ETA: <span className="font-medium">{formatDuration(nonRushMinutes)}</span>
          </p>
          <p>
            Rush-hour ETA: <span className="font-medium">{formatDuration(rushMinutes)}</span>
          </p>
        </div>
      )}
      {mode === "driving" && !loading && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-300">
              Est. fuel
            </span>
            <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">
              {fuelLitres(total).toFixed(1)} L · ${fuelCost(total, fuelPrice).toFixed(2)}
            </span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mt-0.5 flex items-center gap-1 flex-wrap">
            <span>{AVG_FUEL_L_PER_100KM} L/100 km ·</span>
            {editingPrice ? (
              <span className="inline-flex items-center gap-0.5">
                $<input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={priceInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPriceInput(raw);
                    const parsed = parseFloat(raw);
                    if (!isNaN(parsed) && parsed > 0) setFuelPrice(parsed);
                  }}
                  onBlur={() => {
                    const parsed = parseFloat(priceInput);
                    if (isNaN(parsed) || parsed <= 0) {
                      setFuelPrice(NZ_FUEL_PRICE_PER_LITRE);
                      setPriceInput(NZ_FUEL_PRICE_PER_LITRE.toFixed(2));
                    } else {
                      setPriceInput(parsed.toFixed(2));
                    }
                    setEditingPrice(false);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-12 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1 py-0 text-[10px] tabular-nums text-slate-800 dark:text-slate-200 outline-none focus:border-primary-500"
                />/L
              </span>
            ) : (
              <button
                type="button"
                onClick={() => { setPriceInput(fuelPrice.toFixed(2)); setEditingPrice(true); }}
                className="underline decoration-dotted underline-offset-2 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition-colors tabular-nums"
                title="Click to edit fuel price"
              >
                ${fuelPrice.toFixed(2)}/L
              </button>
            )}
          </p>
          {preOptimizeDistanceKm !== null && preOptimizeDistanceKm > total && (() => {
            const savedKm = preOptimizeDistanceKm - total;
            const savedLitres = fuelLitres(savedKm);
            const savedDollars = savedLitres * fuelPrice;
            const savedNonRushMin = (preOptimizeNonRushMin ?? 0) - nonRushMinutes;
            const savedRushMin = (preOptimizeRushMin ?? 0) - rushMinutes;
            return (
              <div className="mt-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-2 py-1.5 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                    Optimised saving
                  </span>
                  <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatDistance(savedKm)} less
                  </span>
                </div>
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 tabular-nums">
                  <span>−{savedLitres.toFixed(1)} L</span>
                  <span>−${savedDollars.toFixed(2)}</span>
                </div>
                {(savedNonRushMin > 0 || savedRushMin > 0) && (
                  <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {savedNonRushMin > 0 && <span>−{formatDuration(savedNonRushMin)} off-peak</span>}
                    {savedRushMin > 0 && <span>−{formatDuration(savedRushMin)} rush</span>}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
      {fallbackCount > 0 && mode !== "straight" && (
        <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
          {fallbackCount} segment
          {fallbackCount === 1 ? "" : "s"} used straight-line fallback.
        </p>
      )}
    </div>
  );
}
