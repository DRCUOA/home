import { Source, Layer } from "react-map-gl/maplibre";
import { useMemo } from "react";

export interface AmenityPoi {
  name: string;
  type: string;
  lat: number;
  lng: number;
}

const TYPE_COLORS: Record<string, string> = {
  school: "#8b5cf6",
  supermarket: "#22c55e",
  park: "#16a34a",
  cafe: "#f59e0b",
  medical: "#ef4444",
  transit: "#3b82f6",
};

interface AmenityDotsProps {
  pois: AmenityPoi[];
  activeTypes: Set<string>;
}

export function AmenityDots({ pois, activeTypes }: AmenityDotsProps) {
  const geojson = useMemo(() => {
    const features = pois
      .filter((p) => activeTypes.has(p.type))
      .map((p) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [p.lng, p.lat],
        },
        properties: {
          name: p.name,
          type: p.type,
          color: TYPE_COLORS[p.type] || "#6b7280",
        },
      }));
    return { type: "FeatureCollection" as const, features };
  }, [pois, activeTypes]);

  if (geojson.features.length === 0) return null;

  return (
    <Source id="amenity-dots" type="geojson" data={geojson}>
      <Layer
        id="amenity-dots-circle"
        type="circle"
        paint={{
          "circle-radius": 6,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.85,
        }}
      />
      <Layer
        id="amenity-dots-label"
        type="symbol"
        layout={{
          "text-field": ["get", "name"],
          "text-size": 10,
          "text-anchor": "top",
          "text-offset": [0, 0.8],
          "text-max-width": 12,
        }}
        paint={{
          "text-color": ["get", "color"],
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        }}
        minzoom={13}
      />
    </Source>
  );
}
