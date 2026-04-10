import { useState, useMemo } from "react";
import {
  Car,
  Footprints,
  Bike,
  Compass,
  Sun,
  GraduationCap,
  ShoppingCart,
  Trees,
  Coffee,
  Stethoscope,
  Bus,
  Loader2,
  ArrowRight,
  Ruler,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Select } from "@/components/ui/select";
import type { MapPin } from "@hcc/shared";
import type { MapProperty } from "./types";
import { getPrice } from "./types";
import { formatCurrency } from "@/lib/format";
import {
  haversineKm,
  formatDistance,
  estimateDriveMinutes,
  estimateWalkMinutes,
  estimateCycleMinutes,
  bearingDeg,
  bearingLabel,
  sunExposureNote,
  walkabilityScore,
  type AmenityCount,
} from "./geo-utils";
import { apiGet } from "@/lib/api";

interface NearbyData {
  counts: AmenityCount;
  pois: { name: string; type: string; lat: number; lng: number }[];
  radius: number;
}

export interface AmenityPoi {
  name: string;
  type: string;
  lat: number;
  lng: number;
}

interface LocationInsightsProps {
  latitude: number;
  longitude: number;
  properties: MapProperty[];
  customPins: MapPin[];
  excludePropertyId?: string;
  excludePinId?: string;
  activeAmenityTypes?: Set<string>;
  onAmenityToggle?: (type: string, pois: AmenityPoi[]) => void;
}

const RADIUS_OPTIONS = [
  { value: 500, label: "500 m" },
  { value: 1000, label: "1 km" },
  { value: 2000, label: "2 km" },
  { value: 3000, label: "3 km" },
];

export function LocationInsights({
  latitude,
  longitude,
  properties,
  customPins,
  excludePropertyId,
  excludePinId,
  activeAmenityTypes,
  onAmenityToggle,
}: LocationInsightsProps) {
  const [compareTarget, setCompareTarget] = useState("");
  const [radiusM, setRadiusM] = useState(1000);

  const nearbyQuery = useQuery({
    queryKey: ["map-nearby", latitude, longitude, radiusM],
    queryFn: () =>
      apiGet<{ data: NearbyData }>(
        `/map/nearby?lat=${latitude}&lng=${longitude}&radius=${radiusM}`
      ),
    staleTime: 5 * 60 * 1000,
  });

  const nearbyData = nearbyQuery.data?.data;

  const targetOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (const p of properties) {
      if (p.id === excludePropertyId) continue;
      const price = getPrice(p);
      const suffix = price ? ` (${formatCurrency(price)})` : "";
      opts.push({
        value: `prop:${p.id}`,
        label: `${p.address}${suffix}`,
      });
    }
    for (const pin of customPins) {
      if (pin.id === excludePinId) continue;
      opts.push({
        value: `pin:${pin.id}`,
        label: `📍 ${pin.label}`,
      });
    }
    return opts;
  }, [properties, customPins, excludePropertyId, excludePinId]);

  const comparison = useMemo(() => {
    if (!compareTarget) return null;

    let targetLat: number | undefined;
    let targetLng: number | undefined;
    let targetLabel = "";

    if (compareTarget.startsWith("prop:")) {
      const prop = properties.find(
        (p) => p.id === compareTarget.replace("prop:", "")
      );
      if (!prop) return null;
      targetLat = prop.latitude;
      targetLng = prop.longitude;
      targetLabel = prop.address;
    } else if (compareTarget.startsWith("pin:")) {
      const pin = customPins.find(
        (p) => p.id === compareTarget.replace("pin:", "")
      );
      if (!pin) return null;
      targetLat = pin.latitude;
      targetLng = pin.longitude;
      targetLabel = pin.label;
    }

    if (targetLat == null || targetLng == null) return null;

    const km = haversineKm(latitude, longitude, targetLat, targetLng);
    const bearing = bearingDeg(latitude, longitude, targetLat, targetLng);

    return {
      label: targetLabel,
      distanceKm: km,
      distance: formatDistance(km),
      driveMin: estimateDriveMinutes(km),
      walkMin: estimateWalkMinutes(km),
      cycleMin: estimateCycleMinutes(km),
      bearing: bearingLabel(bearing),
      bearingDeg: Math.round(bearing),
    };
  }, [compareTarget, latitude, longitude, properties, customPins]);

  const walkScore = useMemo(() => {
    if (!nearbyData) return null;
    return walkabilityScore(nearbyData.counts);
  }, [nearbyData]);

  const sunNote = sunExposureNote(latitude);

  return (
    <div className="space-y-4">
      {/* ── Distance & commute ── */}
      <section>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
          Distance & commute
        </p>
        <Select
          label="Compare to"
          value={compareTarget}
          onChange={(e) => setCompareTarget(e.target.value)}
          options={targetOptions}
          placeholder="Select a property or pin..."
        />

        {comparison && (
          <div className="mt-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 p-2.5 space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <Ruler className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold tabular-nums">
                {comparison.distance}
              </span>
              <span className="text-slate-400">·</span>
              <Compass className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>
                {comparison.bearing} ({comparison.bearingDeg}°)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <CommuteChip
                icon={Car}
                value={`${comparison.driveMin} min`}
                label="Drive"
              />
              <CommuteChip
                icon={Bike}
                value={`${comparison.cycleMin} min`}
                label="Cycle"
              />
              <CommuteChip
                icon={Footprints}
                value={`${comparison.walkMin} min`}
                label="Walk"
              />
            </div>

            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
              <ArrowRight className="h-3 w-3 inline -mt-0.5 mr-0.5" />
              {comparison.label}
            </p>
          </div>
        )}
      </section>

      {/* ── Walkability score ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Walkability
          </p>
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {RADIUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRadiusM(opt.value)}
                className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                  radiusM === opt.value
                    ? "bg-primary-600 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {nearbyQuery.isLoading && (
          <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning nearby amenities...
          </div>
        )}

        {walkScore && nearbyData && (
          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {walkScore.score}
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                / 100 · {walkScore.label}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${walkScore.score}%`,
                  backgroundColor:
                    walkScore.score >= 60
                      ? "#22c55e"
                      : walkScore.score >= 30
                        ? "#f59e0b"
                        : "#ef4444",
                }}
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <AmenityChip
                icon={GraduationCap}
                count={nearbyData.counts.schools}
                label="Schools"
                type="school"
                active={activeAmenityTypes?.has("school")}
                onClick={() => onAmenityToggle?.("school", nearbyData.pois)}
              />
              <AmenityChip
                icon={ShoppingCart}
                count={nearbyData.counts.supermarkets}
                label="Shops"
                type="supermarket"
                active={activeAmenityTypes?.has("supermarket")}
                onClick={() => onAmenityToggle?.("supermarket", nearbyData.pois)}
              />
              <AmenityChip
                icon={Trees}
                count={nearbyData.counts.parks}
                label="Parks"
                type="park"
                active={activeAmenityTypes?.has("park")}
                onClick={() => onAmenityToggle?.("park", nearbyData.pois)}
              />
              <AmenityChip
                icon={Coffee}
                count={nearbyData.counts.cafes}
                label="Cafes"
                type="cafe"
                active={activeAmenityTypes?.has("cafe")}
                onClick={() => onAmenityToggle?.("cafe", nearbyData.pois)}
              />
              <AmenityChip
                icon={Stethoscope}
                count={nearbyData.counts.medical}
                label="Medical"
                type="medical"
                active={activeAmenityTypes?.has("medical")}
                onClick={() => onAmenityToggle?.("medical", nearbyData.pois)}
              />
              <AmenityChip
                icon={Bus}
                count={nearbyData.counts.transit}
                label="Transit"
                type="transit"
                active={activeAmenityTypes?.has("transit")}
                onClick={() => onAmenityToggle?.("transit", nearbyData.pois)}
              />
            </div>
            {activeAmenityTypes && activeAmenityTypes.size > 0 && (
              <p className="text-[10px] text-primary-600 dark:text-primary-400">
                Showing {activeAmenityTypes.size} {activeAmenityTypes.size === 1 ? "category" : "categories"} on map. Tap again to hide.
              </p>
            )}
          </div>
        )}

        {nearbyQuery.isError && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Could not load amenity data.
          </p>
        )}
      </section>

      {/* ── Sun & orientation ── */}
      <section>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
          Sun & orientation
        </p>
        <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 p-2.5 flex gap-2.5">
          <Sun className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {sunNote}
            </p>
            {comparison && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                {comparison.label} is{" "}
                <span className="font-semibold">{comparison.bearing}</span> of
                this location —{" "}
                {comparison.bearing === "N"
                  ? "faces the sun"
                  : comparison.bearing === "S"
                    ? "away from sun"
                    : `${comparison.bearingDeg}° bearing`}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Coordinates ── */}
      <section>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
          Location
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
          <span>
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(
                `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
              );
            }}
            className="text-primary-600 dark:text-primary-400 hover:underline text-[10px]"
          >
            Copy
          </button>
        </div>
        <a
          href={`https://www.google.com/maps/@${latitude},${longitude},17z`}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-1 text-[10px] text-primary-600 dark:text-primary-400 hover:underline"
        >
          Open in Google Maps
        </a>
      </section>
    </div>
  );
}

function CommuteChip({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Car;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-center">
      <Icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 mx-auto mb-0.5" />
      <p className="text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
        {value}
      </p>
      <p className="text-[9px] text-slate-400 dark:text-slate-500">{label}</p>
    </div>
  );
}

function AmenityChip({
  icon: Icon,
  count,
  label,
  type,
  active,
  onClick,
}: {
  icon: typeof GraduationCap;
  count: number;
  label: string;
  type?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const clickable = onClick && count > 0;
  const Wrapper = clickable ? "button" : "div";

  return (
    <Wrapper
      type={clickable ? "button" : undefined}
      onClick={clickable ? onClick : undefined}
      className={`rounded-lg border px-2 py-1.5 text-center transition-all ${
        active
          ? "border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-500/30"
          : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900"
      } ${clickable ? "cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 active:scale-95" : ""}`}
    >
      <Icon
        className={`h-3.5 w-3.5 mx-auto mb-0.5 ${
          active
            ? "text-primary-600 dark:text-primary-400"
            : count > 0
              ? "text-primary-600 dark:text-primary-400"
              : "text-slate-300 dark:text-slate-600"
        }`}
      />
      <p className="text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
        {count}
      </p>
      <p className="text-[9px] text-slate-400 dark:text-slate-500">{label}</p>
    </Wrapper>
  );
}
