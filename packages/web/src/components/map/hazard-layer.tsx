import { Source, Layer, useMap } from "react-map-gl/maplibre";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useCallback, useRef } from "react";
import { apiGet } from "@/lib/api";

interface HazardLayerProps {
  showFaults: boolean;
  showTsunami: boolean;
  showLiquefaction: boolean;
}

function useViewportBbox() {
  const { current: mapRef } = useMap();
  const [bbox, setBbox] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateBbox = useCallback(() => {
    if (!mapRef) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const map = mapRef.getMap();
      const bounds = map.getBounds();
      const b = [
        Math.floor(bounds.getWest() * 100) / 100,
        Math.floor(bounds.getSouth() * 100) / 100,
        Math.ceil(bounds.getEast() * 100) / 100,
        Math.ceil(bounds.getNorth() * 100) / 100,
      ].join(",");
      setBbox(b);
    }, 400);
  }, [mapRef]);

  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();
    updateBbox();
    map.on("moveend", updateBbox);
    return () => {
      map.off("moveend", updateBbox);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mapRef, updateBbox]);

  return bbox;
}

function FaultLines({ bbox }: { bbox: string | null }) {
  const { data } = useQuery({
    queryKey: ["faults-geojson", bbox],
    queryFn: () =>
      apiGet<{ data: GeoJSON.FeatureCollection }>(
        `/map/layers/faults?bbox=${bbox}`
      ),
    enabled: !!bbox,
    staleTime: 60 * 60 * 1000,
  });

  const geojson = data?.data;
  if (!geojson || geojson.features.length === 0) return null;

  return (
    <Source id="faults-source" type="geojson" data={geojson}>
      <Layer
        id="faults-line"
        type="line"
        paint={{
          "line-color": "#dc2626",
          "line-width": 2,
          "line-opacity": 0.8,
        }}
      />
    </Source>
  );
}

function FaultZones({ bbox }: { bbox: string | null }) {
  const { data } = useQuery({
    queryKey: ["fault-zones-geojson", bbox],
    queryFn: () =>
      apiGet<{ data: GeoJSON.FeatureCollection }>(
        `/map/layers/fault-zones?bbox=${bbox}`
      ),
    enabled: !!bbox,
    staleTime: 60 * 60 * 1000,
  });

  const geojson = data?.data;
  if (!geojson || geojson.features.length === 0) return null;

  return (
    <Source id="fault-zones-source" type="geojson" data={geojson}>
      <Layer
        id="fault-zones-fill"
        type="fill"
        paint={{
          "fill-color": "#f59e0b",
          "fill-opacity": 0.25,
        }}
      />
      <Layer
        id="fault-zones-outline"
        type="line"
        paint={{
          "line-color": "#d97706",
          "line-width": 1,
          "line-opacity": 0.6,
        }}
      />
    </Source>
  );
}

export function HazardLayer({
  showFaults,
  showTsunami,
  showLiquefaction,
}: HazardLayerProps) {
  const bbox = useViewportBbox();
  const showZones = showTsunami || showLiquefaction;

  return (
    <>
      {showFaults && <FaultLines bbox={bbox} />}
      {showZones && <FaultZones bbox={bbox} />}
    </>
  );
}
