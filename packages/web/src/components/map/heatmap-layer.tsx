import { Source, Layer } from "react-map-gl/maplibre";
import { useMemo } from "react";
import type { MapProperty } from "./types";
import { getPrice } from "./types";

interface HeatmapLayerProps {
  properties: MapProperty[];
}

export function HeatmapLayer({ properties }: HeatmapLayerProps) {
  const geojson = useMemo(() => {
    const features = properties
      .filter((p) => getPrice(p) != null)
      .map((p) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [p.longitude, p.latitude],
        },
        properties: {
          price: getPrice(p)!,
          weight: getPrice(p)! / 1_000_000,
        },
      }));

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [properties]);

  if (geojson.features.length === 0) return null;

  return (
    <Source id="heatmap-source" type="geojson" data={geojson}>
      <Layer
        id="heatmap-layer"
        type="heatmap"
        paint={{
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            0,
            0,
            1,
            0.5,
            2,
            1,
          ],
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            1,
            15,
            3,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(33,102,172,0)",
            0.2,
            "rgb(103,169,207)",
            0.4,
            "rgb(209,229,240)",
            0.6,
            "rgb(253,219,199)",
            0.8,
            "rgb(239,138,98)",
            1,
            "rgb(178,24,43)",
          ],
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            2,
            9,
            20,
            15,
            40,
          ],
          "heatmap-opacity": 0.7,
        }}
      />
    </Source>
  );
}
