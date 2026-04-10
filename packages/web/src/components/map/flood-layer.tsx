import { Source, Layer, useMap } from "react-map-gl/maplibre";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useCallback, useRef } from "react";
import { apiGet } from "@/lib/api";

export function FloodLayer() {
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

  const { data } = useQuery({
    queryKey: ["flood-geojson", bbox],
    queryFn: () =>
      apiGet<{ data: GeoJSON.FeatureCollection }>(
        `/map/layers/flood?bbox=${bbox}`
      ),
    enabled: !!bbox,
    staleTime: 60 * 60 * 1000,
  });

  const geojson = data?.data;
  if (!geojson || geojson.features.length === 0) return null;

  return (
    <Source id="flood-source" type="geojson" data={geojson}>
      <Layer
        id="flood-fill"
        type="fill"
        paint={{
          "fill-color": "#3b82f6",
          "fill-opacity": 0.3,
        }}
      />
      <Layer
        id="flood-line"
        type="line"
        paint={{
          "line-color": "#2563eb",
          "line-width": 2,
          "line-opacity": 0.85,
        }}
      />
      <Layer
        id="flood-outline"
        type="line"
        paint={{
          "line-color": "#1d4ed8",
          "line-width": 1,
          "line-opacity": 0.5,
        }}
      />
    </Source>
  );
}
