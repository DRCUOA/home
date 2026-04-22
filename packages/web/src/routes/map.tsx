import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  MapPinPlus,
  Undo2,
  Route as RouteIcon,
  Bird,
  Footprints,
  Car,
  Plus,
  X,
  Lock,
  LockOpen,
  Info,
  Fuel,
  Sparkles,
  Repeat,
  ArrowRight,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project, MapPin } from "@hcc/shared";
import { useMapConfig } from "@/hooks/use-map-config";
import { MapView, type MapViewHandle } from "@/components/map/map-view";
import { MapSearch } from "@/components/map/map-search";
import { LayerControl } from "@/components/map/layer-control";
import { LegendPanel } from "@/components/map/legend-panel";
import { PropertyListSheet } from "@/components/map/property-list-sheet";
import { PropertyInsightsPanel } from "@/components/map/property-popup";
import { PinForm } from "@/components/map/pin-form";
import {
  MeasureTotalEnhanced,
  buildStraightSegments,
  type MeasurePathMode,
  type MeasurePoint,
  type MeasureSegment,
} from "@/components/map/measure-line";
import type { MapProperty } from "@/components/map/types";
import { useList } from "@/hooks/use-query-helpers";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { optimizeStopOrder } from "@/components/map/geo-utils";
import { Button } from "@/components/ui/button";

type ListResponse<T> = { data: T[]; total: number };
type RouteSegmentResponse = {
  data: {
    coordinates: [number, number][];
    distance_km: number;
    duration_s: number;
    mode: "walking" | "driving";
  };
};
type MeasureSelectionPoint = {
  id: string;
  label: string;
  lng: number;
  lat: number;
  cityTown: string;
};
type QuickGotoPoint = {
  id: string;
  label: string;
  lng: number;
  lat: number;
  zoom: number;
  cityTown: string;
};

type GroupedLocationOptions<T extends { cityTown: string }> = {
  cityTown: string;
  items: T[];
};

function estimateDurationMinutesForMode(
  distanceKm: number,
  mode: "walking" | "driving"
): number {
  const speedKmh = mode === "walking" ? 4.8 : 45;
  return (distanceKm / speedKmh) * 60;
}

function cityTownLabel(city?: string, suburb?: string): string {
  return (city?.trim() || suburb?.trim() || "Unknown location");
}

function measureLabelFromSelection(point: MeasureSelectionPoint): string {
  return point.label
    .replace(/\s*\(Property\)\s*$/i, "")
    .replace(/\s*\(Pin\)\s*$/i, "")
    .trim();
}

function groupByCityTown<T extends { cityTown: string; label: string }>(
  items: T[]
): GroupedLocationOptions<T>[] {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = item.cityTown || "Unknown location";
    const existing = grouped.get(key);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cityTown, groupItems]) => ({
      cityTown,
      items: [...groupItems].sort((a, b) => a.label.localeCompare(b.label)),
    }));
}

export const Route = createFileRoute("/map")({
  component: MapPage,
});

function MapPage() {
  const qc = useQueryClient();
  const configQuery = useMapConfig();
  const config = configQuery.data?.data;

  const projectsQuery = useList<Project>("projects", "/projects");
  const allProjects = projectsQuery.data?.data ?? [];

  const projectIds = useMemo(
    () => allProjects.map((p) => p.id),
    [allProjects]
  );

  const propertiesQuery = useQuery({
    queryKey: ["map-properties", projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return { data: [], total: 0 };
      const results = await Promise.all(
        projectIds.map((pid) =>
          apiGet<ListResponse<MapProperty>>(
            `/map/properties?project_id=${encodeURIComponent(pid)}`
          )
        )
      );
      const all = results.flatMap((r) => r.data);
      return { data: all, total: all.length };
    },
    enabled: projectIds.length > 0,
  });

  const properties = propertiesQuery.data?.data ?? [];

  const totalPropertiesQuery = useList<{ id: string }>(
    "properties",
    "/properties"
  );
  const totalPropertyCount = totalPropertiesQuery.data?.total ?? 0;
  const ungeocodedCount = totalPropertyCount - properties.length;

  const geocodeMutation = useMutation({
    mutationFn: () =>
      apiPost<{ data: { geocoded: number; failed: number; total: number } }>(
        "/map/geocode-all",
        {}
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["map-properties"] });
    },
  });

  // ── Custom pins ──
  const pinsQuery = useQuery({
    queryKey: ["map-pins"],
    queryFn: () => apiGet<ListResponse<MapPin>>("/map/pins"),
  });
  const customPins = pinsQuery.data?.data ?? [];

  const createPin = useMutation({
    mutationFn: (data: {
      label: string;
      color: string;
      notes?: string;
      latitude: number;
      longitude: number;
    }) => apiPost<{ data: MapPin }>("/map/pins", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["map-pins"] }),
  });

  const updatePin = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Record<string, unknown>;
    }) => apiPatch<{ data: MapPin }>(`/map/pins/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["map-pins"] }),
  });

  const deletePin = useMutation({
    mutationFn: (id: string) => apiDelete(`/map/pins/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["map-pins"] }),
  });

  const [insightsProperty, setInsightsProperty] = useState<MapProperty | null>(
    null
  );

  const [pinDropMode, setPinDropMode] = useState(false);
  const [pendingPinCoords, setPendingPinCoords] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [editingPin, setEditingPin] = useState<MapPin | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [quickGotoId, setQuickGotoId] = useState("");

  // ── Amenity dots on map ──
  const [amenityPois, setAmenityPois] = useState<
    { name: string; type: string; lat: number; lng: number }[]
  >([]);
  const [activeAmenityTypes, setActiveAmenityTypes] = useState<Set<string>>(
    () => new Set()
  );

  const handleAmenityToggle = useCallback(
    (type: string, pois: { name: string; type: string; lat: number; lng: number }[]) => {
      setAmenityPois(pois);
      setActiveAmenityTypes((prev) => {
        const next = new Set(prev);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        return next;
      });
    },
    []
  );

  // ── Measure tool ──
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);
  const [measurePathMode, setMeasurePathMode] = useState<MeasurePathMode>("driving");
  const [measureSegments, setMeasureSegments] = useState<MeasureSegment[]>([]);
  const [measureRoutingLoading, setMeasureRoutingLoading] = useState(false);
  const [measureFromId, setMeasureFromId] = useState("");
  const [measureToId, setMeasureToId] = useState("");
  const [measureStopIds, setMeasureStopIds] = useState<string[]>([]);
  const [measureAutoScaleEnabled, setMeasureAutoScaleEnabled] = useState(true);
  const [measureRoundTrip, setMeasureRoundTrip] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [preOptimizeDistanceKm, setPreOptimizeDistanceKm] = useState<number | null>(null);
  const [preOptimizeNonRushMin, setPreOptimizeNonRushMin] = useState<number | null>(null);
  const [preOptimizeRushMin, setPreOptimizeRushMin] = useState<number | null>(null);

  const clearPreOptimize = useCallback(() => {
    setPreOptimizeDistanceKm(null);
    setPreOptimizeNonRushMin(null);
    setPreOptimizeRushMin(null);
  }, []);

  const measureSelectionPoints = useMemo<MeasureSelectionPoint[]>(() => {
    const propertyPoints = properties.map((property) => ({
      id: `property:${property.id}`,
      label: `${property.address}${property.suburb ? `, ${property.suburb}` : ""} (Property)`,
      lng: property.longitude,
      lat: property.latitude,
      cityTown: cityTownLabel(property.city, property.suburb),
    }));

    const pinPoints = customPins.map((pin) => {
      const nearestProperty = properties.reduce<MapProperty | null>((nearest, property) => {
        if (!nearest) return property;
        const currentDist =
          (property.latitude - pin.latitude) ** 2 +
          (property.longitude - pin.longitude) ** 2;
        const nearestDist =
          (nearest.latitude - pin.latitude) ** 2 +
          (nearest.longitude - pin.longitude) ** 2;
        return currentDist < nearestDist ? property : nearest;
      }, null);

      return {
        id: `pin:${pin.id}`,
        label: `${pin.label} (Pin)`,
        lng: pin.longitude,
        lat: pin.latitude,
        cityTown: cityTownLabel(nearestProperty?.city, nearestProperty?.suburb),
      };
    });

    return [...propertyPoints, ...pinPoints].sort((a, b) => {
      if (a.cityTown === b.cityTown) return a.label.localeCompare(b.label);
      return a.cityTown.localeCompare(b.cityTown);
    });
  }, [properties, customPins]);

  const groupedMeasureSelectionPoints = useMemo(
    () => groupByCityTown(measureSelectionPoints),
    [measureSelectionPoints]
  );

  const measureSelectionLookup = useMemo(
    () =>
      new Map(
        measureSelectionPoints.map((point) => [point.id, point] as const)
      ),
    [measureSelectionPoints]
  );

  const quickGotoPoints = useMemo<QuickGotoPoint[]>(
    () => [
      ...properties.map((property) => ({
        id: `property:${property.id}`,
        label: `${property.address}${property.suburb ? `, ${property.suburb}` : ""}`,
        lng: property.longitude,
        lat: property.latitude,
        zoom: 15,
        cityTown: cityTownLabel(property.city, property.suburb),
      })),
      ...customPins.map((pin) => {
        const nearestProperty = properties.reduce<MapProperty | null>((nearest, property) => {
          if (!nearest) return property;
          const currentDist =
            (property.latitude - pin.latitude) ** 2 +
            (property.longitude - pin.longitude) ** 2;
          const nearestDist =
            (nearest.latitude - pin.latitude) ** 2 +
            (nearest.longitude - pin.longitude) ** 2;
          return currentDist < nearestDist ? property : nearest;
        }, null);

        return {
          id: `pin:${pin.id}`,
          label: pin.label,
          lng: pin.longitude,
          lat: pin.latitude,
          zoom: 16,
          cityTown: cityTownLabel(nearestProperty?.city, nearestProperty?.suburb),
        };
      }),
    ],
    [properties, customPins]
  );

  const groupedQuickGotoPoints = useMemo(
    () => groupByCityTown(quickGotoPoints),
    [quickGotoPoints]
  );

  const handleMeasureClick = useCallback((lng: number, lat: number) => {
    setMeasurePoints((prev) => [...prev, { lng, lat }]);
  }, []);

  const handleMeasurePointMove = useCallback(
    (pointIndex: number, lng: number, lat: number) => {
      setMeasurePoints((prev) =>
        prev.map((point, idx) =>
          idx === pointIndex ? { ...point, lng, lat } : point
        )
      );
    },
    []
  );

  const handleMeasureSegmentTranslate = useCallback(
    (segmentIndex: number, deltaLng: number, deltaLat: number) => {
      setMeasurePoints((prev) => {
        if (segmentIndex < 0 || segmentIndex >= prev.length - 1) return prev;

        const next = [...prev];
        const start = next[segmentIndex];
        const end = next[segmentIndex + 1];
        if (!start || !end) return prev;

        next[segmentIndex] = {
          ...start,
          lng: start.lng + deltaLng,
          lat: start.lat + deltaLat,
        };
        next[segmentIndex + 1] = {
          ...end,
          lng: end.lng + deltaLng,
          lat: end.lat + deltaLat,
        };

        return next;
      });
    },
    []
  );

  const handleMeasureDeleteSegment = useCallback((segmentIndex: number) => {
    setMeasurePoints((prev) => {
      if (prev.length < 2) return prev;
      if (segmentIndex < 0 || segmentIndex >= prev.length - 1) return prev;

      if (prev.length === 2) return [];

      // Preserve path continuity while removing the chosen segment.
      if (segmentIndex === 0) {
        return prev.slice(1);
      }
      if (segmentIndex === prev.length - 2) {
        return prev.slice(0, -1);
      }

      return prev.filter((_, idx) => idx !== segmentIndex + 1);
    });
  }, []);

  useEffect(() => {
    if (measurePoints.length < 2) {
      setMeasureSegments([]);
      setMeasureRoutingLoading(false);
      return;
    }

    if (measurePathMode === "straight") {
      setMeasureSegments(buildStraightSegments(measurePoints));
      setMeasureRoutingLoading(false);
      return;
    }

    let cancelled = false;
    setMeasureRoutingLoading(true);

    const loadRoutedSegments = async () => {
      const straightSegments = buildStraightSegments(measurePoints);
      const segmentPromises = measurePoints.slice(0, -1).map(async (point, index) => {
        const next = measurePoints[index + 1];
        const fallback = straightSegments[index];

        try {
          const response = await apiGet<RouteSegmentResponse>(
            `/map/route?from_lng=${encodeURIComponent(point.lng)}&from_lat=${encodeURIComponent(
              point.lat
            )}&to_lng=${encodeURIComponent(next.lng)}&to_lat=${encodeURIComponent(
              next.lat
            )}&mode=${measurePathMode}`
          );
          return {
            coordinates: response.data.coordinates,
            distanceKm: response.data.distance_km,
            durationMin: response.data.duration_s / 60,
          } satisfies MeasureSegment;
        } catch {
          return {
            ...fallback,
            fallback: true,
            durationMin: estimateDurationMinutesForMode(
              fallback.distanceKm,
              measurePathMode
            ),
          } satisfies MeasureSegment;
        }
      });

      const routedSegments = await Promise.all(segmentPromises);
      if (!cancelled) {
        setMeasureSegments(routedSegments);
        setMeasureRoutingLoading(false);
      }
    };

    loadRoutedSegments().catch(() => {
      if (!cancelled) {
        setMeasureSegments(
          buildStraightSegments(measurePoints).map((segment) => ({
            ...segment,
            fallback: true,
            durationMin: estimateDurationMinutesForMode(
              segment.distanceKm,
              measurePathMode
            ),
          }))
        );
        setMeasureRoutingLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [measurePoints, measurePathMode]);

  useEffect(() => {
    if (!measureMode) return;
    if (!measureFromId || !measureToId) return;
    const fromPoint = measureSelectionLookup.get(measureFromId);
    const toPoint = measureSelectionLookup.get(measureToId);
    if (!fromPoint || !toPoint) return;
    const stopPoints = measureStopIds
      .map((stopId) => measureSelectionLookup.get(stopId))
      .filter((point): point is MeasureSelectionPoint => Boolean(point));

    const orderedPoints = measureRoundTrip
      ? [fromPoint, ...stopPoints, toPoint, fromPoint]
      : [fromPoint, ...stopPoints, toPoint];
    setMeasurePoints(
      orderedPoints.map((point) => ({
        lng: point.lng,
        lat: point.lat,
        label: measureLabelFromSelection(point),
      }))
    );

    if (measureAutoScaleEnabled) {
      const lngs = orderedPoints.map((point) => point.lng);
      const lats = orderedPoints.map((point) => point.lat);
      mapHandle.current?.fitBounds(
        Math.min(...lngs),
        Math.min(...lats),
        Math.max(...lngs),
        Math.max(...lats),
        120
      );
    }
  }, [
    measureMode,
    measureFromId,
    measureToId,
    measureStopIds,
    measureSelectionLookup,
    measureAutoScaleEnabled,
    measureRoundTrip,
  ]);

  const handleOptimizeRoute = useCallback(() => {
    const from = measureSelectionLookup.get(measureFromId);
    const to = measureSelectionLookup.get(measureToId);
    const stops = measureStopIds
      .map((id) => measureSelectionLookup.get(id))
      .filter((p): p is MeasureSelectionPoint => Boolean(p));

    if (!from || !to || stops.length < 2) return;

    const currentTotal = measureSegments.reduce((s, seg) => s + seg.distanceKm, 0);
    if (currentTotal > 0) {
      setPreOptimizeDistanceKm(currentTotal);

      const nonRush = measureSegments.reduce(
        (s, seg) => s + (seg.durationMin ?? (currentTotal > 0 ? (seg.distanceKm / 45) * 60 : 0)),
        0
      );
      const rushMult = measurePathMode === "driving" ? 1.55 : 1.1;
      setPreOptimizeNonRushMin(nonRush);
      setPreOptimizeRushMin(nonRush * rushMult);
    }

    setOptimizing(true);

    requestAnimationFrame(() => {
      const optimizedIndices = optimizeStopOrder(
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng },
        stops.map((s) => ({ lat: s.lat, lng: s.lng }))
      );

      const currentIds = measureStopIds.filter((id) =>
        measureSelectionLookup.has(id)
      );
      const reorderedIds = optimizedIndices.map((i) => currentIds[i]);

      setMeasureStopIds(reorderedIds);
      setOptimizing(false);
    });
  }, [measureFromId, measureToId, measureStopIds, measureSelectionLookup, measureSegments, measurePathMode]);

  // ── Map state ──
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(
    () => new Set(["property-pins"])
  );

  const [selectedProperty, setSelectedProperty] = useState<MapProperty | null>(
    null
  );

  const mapHandle = useRef<MapViewHandle>(null);

  const handleToggleLayer = useCallback((layerId: string) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

  const handleFlyTo = useCallback((lng: number, lat: number, zoom = 14) => {
    mapHandle.current?.flyTo(lng, lat, zoom);
  }, []);

  const handleQuickGotoChange = useCallback(
    (value: string) => {
      setQuickGotoId(value);
      const target = quickGotoPoints.find((point) => point.id === value);
      if (!target) return;
      handleFlyTo(target.lng, target.lat, target.zoom);
    },
    [quickGotoPoints, handleFlyTo]
  );

  const handleMapClick = useCallback(
    (lng: number, lat: number) => {
      if (pinDropMode) {
        setPendingPinCoords({ lng, lat });
        setPinDropMode(false);
      }
    },
    [pinDropMode]
  );

  const handleSavePin = useCallback(
    (data: {
      label: string;
      color: string;
      notes?: string;
      latitude: number;
      longitude: number;
    }) => {
      if (editingPin) {
        updatePin.mutate(
          { id: editingPin.id, data },
          {
            onSuccess: () => {
              setEditingPin(null);
              setPendingPinCoords(null);
              setActivePinId(null);
            },
          }
        );
      } else {
        createPin.mutate(data, {
          onSuccess: () => {
            setPendingPinCoords(null);
          },
        });
      }
    },
    [editingPin, createPin, updatePin]
  );

  const handlePinClick = useCallback((pin: MapPin) => {
    setActivePinId(pin.id);
    setSelectedProperty(null);
  }, []);

  const handleEditPinFromPopup = useCallback(
    (pin: MapPin) => {
      setEditingPin(pin);
      setPendingPinCoords({ lng: pin.longitude, lat: pin.latitude });
      setActivePinId(null);
    },
    []
  );

  const loading = configQuery.isLoading || projectsQuery.isLoading;

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
          <p className="text-sm">Loading map...</p>
        </div>
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 max-w-md">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Could not load map configuration</p>
            <p className="mt-1 text-xs opacity-80">
              Check your connection and try refreshing the page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!config) return null;

  const showPinForm = pendingPinCoords != null;

  return (
    <div
      className="fixed bottom-0 right-0 flex flex-col"
      style={{
        // Anchor the map overlay to the area *inside* AppShell's chrome:
        // below the sticky TopBar and to the right of the Sidebar. Falling
        // back to 0 keeps this route sensible if ever rendered outside
        // AppShell (e.g. tests, storybook).
        top: "var(--ds-topbar-height, 0px)",
        left: "var(--ds-current-sidebar-width, 0px)",
      }}
    >
      {/* Search + quick goto */}
      <div className="absolute top-0 left-0 right-0 z-20 p-3 pointer-events-none">
        <div className="pointer-events-auto max-w-2xl mx-auto sm:mx-0 sm:ml-3">
          <div className="flex items-center gap-2 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg border border-slate-200 dark:border-slate-700 px-2 py-1">
            <div className="flex-1 min-w-[12rem]">
              <MapSearch onFlyTo={handleFlyTo} compact chrome="embedded" />
            </div>
            <span className="text-slate-300 dark:text-slate-600 select-none">|</span>
            <div className="w-44">
              <select
                value={quickGotoId}
                onChange={(e) => handleQuickGotoChange(e.target.value)}
                className="w-full rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-1 text-xs text-slate-800 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700"
              >
                <option value="">Quick go to...</option>
                {groupedQuickGotoPoints.map((group) => (
                  <optgroup key={`quick-goto-group-${group.cityTown}`} label={group.cityTown}>
                    {group.items.map((point) => (
                      <option key={`quick-goto-${point.id}`} value={point.id}>
                        {point.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Geocode banner */}
      {ungeocodedCount > 0 && !geocodeMutation.isSuccess && (
        <div className="absolute top-16 left-0 right-0 z-20 px-3 pointer-events-none">
          <div className="pointer-events-auto max-w-md mx-auto sm:mx-0 sm:ml-3">
            <div className="flex items-center gap-2 rounded-xl bg-amber-50/95 dark:bg-amber-900/80 backdrop-blur-sm border border-amber-200 dark:border-amber-700 px-3 py-2 shadow-lg">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-200 flex-1">
                {ungeocodedCount}{" "}
                {ungeocodedCount === 1
                  ? "property needs"
                  : "properties need"}{" "}
                geocoding to appear on the map.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="min-h-8 text-xs shrink-0"
                disabled={geocodeMutation.isPending}
                onClick={() => geocodeMutation.mutate()}
                title="Geocode properties"
              >
                {geocodeMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pin-drop mode banner */}
      {pinDropMode && (
        <div className="absolute top-16 left-0 right-0 z-20 px-3 pointer-events-none">
          <div className="pointer-events-auto max-w-md mx-auto sm:mx-0 sm:ml-3">
            <div className="flex items-center gap-2 rounded-xl bg-primary-50/95 dark:bg-primary-900/80 backdrop-blur-sm border border-primary-200 dark:border-primary-700 px-3 py-2.5 shadow-lg">
              <MapPinPlus className="h-4 w-4 text-primary-600 dark:text-primary-400 shrink-0" />
              <p className="text-xs text-primary-800 dark:text-primary-200 flex-1">
                Tap anywhere on the map to drop a pin
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="min-h-8 shrink-0"
                onClick={() => setPinDropMode(false)}
                title="Cancel pin drop"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Route toolbar */}
      {measureMode && (
        <div className="absolute top-16 left-0 right-0 z-20 px-3 pointer-events-none">
          <div className="pointer-events-auto max-w-sm mx-auto sm:mx-0 sm:ml-3">
            <div className="flex items-center gap-1 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 px-1.5 py-1 shadow-lg">
              <div className="flex items-center gap-0.5 shrink-0">
                <RouteIcon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                <div className="relative group shrink-0">
                  <Info className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 cursor-help" />
                  <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-44 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-[10px] leading-snug px-2.5 py-2 shadow-lg z-50">
                    Tap points on the map to add waypoints. Use the panel to pick saved locations. Click undo to remove the last point.
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-slate-800 dark:bg-slate-700" />
                  </div>
                </div>
                <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                {measurePoints.length > 0 && (
                  <button
                    type="button"
                    className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Undo last point"
                    onClick={() =>
                      setMeasurePoints((prev) => prev.slice(0, -1))
                    }
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Exit route planner"
                  onClick={() => {
                    setMeasureMode(false);
                    setMeasurePoints([]);
                    setMeasureSegments([]);
                    setMeasurePathMode("driving");
                    setMeasureFromId("");
                    setMeasureToId("");
                    setMeasureStopIds([]);
                    setMeasureAutoScaleEnabled(true);
                    setMeasureRoundTrip(false);
                    clearPreOptimize();
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 shrink-0" />
              <div className="flex items-center gap-0.5 min-w-0 flex-1 justify-end">
                {(["straight", "walking", "driving"] as MeasurePathMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMeasurePathMode(mode)}
                    title={
                      mode === "straight"
                        ? "Straight line"
                        : mode === "walking"
                          ? "Walkable path"
                          : "Drivable path"
                    }
                    aria-label={
                      mode === "straight"
                        ? "Straight line"
                        : mode === "walking"
                          ? "Walkable path"
                          : "Drivable path"
                    }
                    className={`rounded-md px-1.5 py-0.5 transition-colors shrink-0 ${
                      measurePathMode === mode
                        ? "bg-slate-700 dark:bg-slate-300 text-white dark:text-slate-900"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    {mode === "straight" ? (
                      <Bird className="h-3.5 w-3.5" />
                    ) : mode === "walking" ? (
                      <Footprints className="h-3.5 w-3.5" />
                    ) : (
                      <Car className="h-3.5 w-3.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            {measurePoints.length >= 2 && (
              <div className="mt-1.5">
                <MeasureTotalEnhanced
                  points={measurePoints}
                  segments={measureSegments}
                  mode={measurePathMode}
                  loading={measureRoutingLoading}
                  preOptimizeDistanceKm={preOptimizeDistanceKm}
                  preOptimizeNonRushMin={preOptimizeNonRushMin}
                  preOptimizeRushMin={preOptimizeRushMin}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {measureMode && (
        <div className="absolute top-16 right-3 z-30 pointer-events-none">
          <div className="pointer-events-auto w-[19rem] rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg border border-slate-200 dark:border-slate-700 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Plan Route
              </p>
              <button
                type="button"
                onClick={() => setMeasureAutoScaleEnabled((prev) => !prev)}
                className="rounded-md border border-slate-200 dark:border-slate-700 p-1 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                title={measureAutoScaleEnabled ? "Auto scale enabled" : "Auto scale disabled"}
                aria-label={measureAutoScaleEnabled ? "Disable auto scale" : "Enable auto scale"}
              >
                {measureAutoScaleEnabled ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <LockOpen className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] text-slate-500 dark:text-slate-400">
                From
                <select
                  className="measure-location-select mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] leading-snug text-slate-800 dark:text-slate-200"
                  value={measureFromId}
                  onChange={(e) => { setMeasureFromId(e.target.value); clearPreOptimize(); }}
                >
                  <option value="">Select origin...</option>
                  {groupedMeasureSelectionPoints.map((group) => (
                    <optgroup key={`from-group-${group.cityTown}`} label={group.cityTown}>
                      {group.items.map((point) => (
                        <option key={`from-${point.id}`} value={point.id}>
                          {point.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <div className="block text-[10px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center justify-between">
                  <span>To</span>
                  <button
                    type="button"
                    onClick={() => { setMeasureRoundTrip((prev) => !prev); clearPreOptimize(); }}
                    title={measureRoundTrip ? "Round trip — returns to origin" : "One-way"}
                    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors ${
                      measureRoundTrip
                        ? "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700"
                        : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 border border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {measureRoundTrip ? (
                      <Repeat className="h-3 w-3" />
                    ) : (
                      <ArrowRight className="h-3 w-3" />
                    )}
                    <span className="text-[9px] font-medium">
                      {measureRoundTrip ? "Round trip" : "One-way"}
                    </span>
                  </button>
                </div>
                <select
                  className="measure-location-select mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] leading-snug text-slate-800 dark:text-slate-200"
                  value={measureToId}
                  onChange={(e) => { setMeasureToId(e.target.value); clearPreOptimize(); }}
                >
                  <option value="">Select destination...</option>
                  {groupedMeasureSelectionPoints.map((group) => (
                    <optgroup key={`to-group-${group.cityTown}`} label={group.cityTown}>
                      {group.items.map((point) => (
                        <option key={`to-${point.id}`} value={point.id}>
                          {point.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {measureStopIds.map((stopId, index) => (
                <label
                  key={`stop-${index}`}
                  className="block text-[10px] text-slate-500 dark:text-slate-400"
                >
                  Stop {index + 1}
                  <div className="mt-1 flex items-center gap-1.5">
                    <select
                      className="measure-location-select w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] leading-snug text-slate-800 dark:text-slate-200"
                      value={stopId}
                      onChange={(e) => {
                        setMeasureStopIds((prev) =>
                          prev.map((id, idx) => (idx === index ? e.target.value : id))
                        );
                        clearPreOptimize();
                      }}
                    >
                      <option value="">Select stop...</option>
                      {groupedMeasureSelectionPoints.map((group) => (
                        <optgroup key={`stop-${index}-group-${group.cityTown}`} label={group.cityTown}>
                          {group.items.map((point) => (
                            <option key={`stop-${index}-${point.id}`} value={point.id}>
                              {point.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                      onClick={() => {
                        setMeasureStopIds((prev) => prev.filter((_, idx) => idx !== index));
                        clearPreOptimize();
                      }}
                      aria-label={`Remove stop ${index + 1}`}
                      title="Remove stop"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </label>
              ))}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  title="Add stop"
                  className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5"
                  onClick={() => { setMeasureStopIds((prev) => [...prev, ""]); clearPreOptimize(); }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                {measureStopIds.filter((id) => measureSelectionLookup.has(id)).length >= 2 && (
                  <button
                    type="button"
                    disabled={optimizing}
                    onClick={handleOptimizeRoute}
                    title="Optimise route order for fuel & time efficiency"
                    className="flex-1 rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/40 px-2 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800/60 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {optimizing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <span className="relative inline-flex items-center">
                        <Fuel className="h-3.5 w-3.5" />
                        <Sparkles className="h-2.5 w-2.5 absolute -top-1 -right-1.5 text-amber-500 dark:text-amber-400" />
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 relative">
        <MapView
          ref={mapHandle}
          config={config}
          properties={properties}
          customPins={customPins}
          visibleLayers={visibleLayers}
          selectedProperty={selectedProperty}
          activePinId={activePinId}
          pinDropMode={pinDropMode}
          onPropertyClick={(p) => {
            setSelectedProperty(p);
            setActivePinId(null);
            setInsightsProperty(null);
          }}
          onPropertyDeselect={() => setSelectedProperty(null)}
          onPropertyInsights={(p) => {
            setInsightsProperty(p);
            setSelectedProperty(null);
          }}
          onPinClick={handlePinClick}
          onPinEdit={handleEditPinFromPopup}
          onPinPopupClose={() => setActivePinId(null)}
          onPinDelete={(id) => deletePin.mutate(id)}
          onMapClick={handleMapClick}
          amenityPois={amenityPois}
          activeAmenityTypes={activeAmenityTypes}
          measureMode={measureMode}
          measurePoints={measurePoints}
          measureSegments={measureSegments}
          onMeasureClick={handleMeasureClick}
          onMeasurePointMove={handleMeasurePointMove}
          onMeasureSegmentTranslate={handleMeasureSegmentTranslate}
          onMeasureDeleteSegment={handleMeasureDeleteSegment}
        />

        {/* Property insights panel */}
        {insightsProperty && !showPinForm && (
          <div className="absolute top-16 right-3 z-30">
            <PropertyInsightsPanel
              property={insightsProperty}
              properties={properties}
              customPins={customPins}
              activeAmenityTypes={activeAmenityTypes}
              onAmenityToggle={handleAmenityToggle}
              onClose={() => {
                setInsightsProperty(null);
                setActiveAmenityTypes(new Set());
                setAmenityPois([]);
              }}
            />
          </div>
        )}

        {/* Pin form overlay */}
        {showPinForm && (
          <div className="absolute top-16 right-3 z-30">
            <PinForm
              latitude={pendingPinCoords.lat}
              longitude={pendingPinCoords.lng}
              existing={editingPin ?? undefined}
              properties={properties}
              customPins={customPins}
              activeAmenityTypes={activeAmenityTypes}
              onAmenityToggle={handleAmenityToggle}
              saving={createPin.isPending || updatePin.isPending}
              onSave={handleSavePin}
              onCancel={() => {
                setPendingPinCoords(null);
                setEditingPin(null);
                setActiveAmenityTypes(new Set());
                setAmenityPois([]);
              }}
            />
          </div>
        )}

        {/* Tool buttons + layer control */}
        {!pinDropMode && !measureMode && !showPinForm && (
          <div className="absolute bottom-4 right-3 z-10 flex flex-col gap-2 items-end">
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  setMeasureMode(true);
                  setMeasurePoints([]);
                  setMeasureSegments([]);
                  setMeasurePathMode("driving");
                  setMeasureFromId("");
                  setMeasureToId("");
                  setMeasureStopIds([]);
                  setMeasureAutoScaleEnabled(true);
                  setMeasureRoundTrip(false);
                  clearPreOptimize();
                  setSelectedProperty(null);
                  setActivePinId(null);
                }}
                title="Plan Route"
                className="rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg border border-slate-200 dark:border-slate-700 p-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <RouteIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => {
                  setPinDropMode(true);
                  setSelectedProperty(null);
                  setActivePinId(null);
                }}
                title="Drop pin"
                className="rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg border border-slate-200 dark:border-slate-700 p-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <MapPinPlus className="h-5 w-5" />
              </button>
            </div>
            <LayerControl
              layers={config.layers}
              visibleLayers={visibleLayers}
              onToggle={handleToggleLayer}
            />
          </div>
        )}

        {/* Layer control when in a mode */}
        {(pinDropMode || measureMode || showPinForm) && (
          <div className="absolute bottom-4 right-3 z-10">
            <LayerControl
              layers={config.layers}
              visibleLayers={visibleLayers}
              onToggle={handleToggleLayer}
            />
          </div>
        )}

        <div className="absolute bottom-12 left-3 z-10 hidden sm:block">
          <LegendPanel visibleLayers={visibleLayers} />
        </div>

        <div className="sm:hidden">
          <PropertyListSheet
            properties={properties}
            onSelectProperty={(p) => {
              setSelectedProperty(p);
              handleFlyTo(p.longitude, p.latitude, 15);
            }}
          />
        </div>
      </div>
    </div>
  );
}
