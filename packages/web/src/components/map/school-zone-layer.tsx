import { Source, Layer } from "react-map-gl/maplibre";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export function SchoolZoneLayer() {
  const { data } = useQuery({
    queryKey: ["map-school-zones"],
    queryFn: () => apiGet<{ data: GeoJSON.FeatureCollection }>("/map/layers/school-zones"),
    staleTime: 60 * 60 * 1000,
  });

  const geojson = data?.data;
  if (!geojson || geojson.features.length === 0) return null;

  return (
    <Source id="school-zones-source" type="geojson" data={geojson}>
      <Layer
        id="school-zones-fill"
        type="fill"
        paint={{
          "fill-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "decile"], 5],
            1,
            "#fee5d9",
            3,
            "#fcae91",
            5,
            "#fb6a4a",
            7,
            "#de2d26",
            10,
            "#a50f15",
          ],
          "fill-opacity": 0.25,
        }}
      />
      <Layer
        id="school-zones-line"
        type="line"
        paint={{
          "line-color": "#6366f1",
          "line-width": 1.5,
          "line-opacity": 0.6,
        }}
      />
      <Layer
        id="school-zones-label"
        type="symbol"
        layout={{
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-anchor": "center",
        }}
        paint={{
          "text-color": "#4338ca",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        }}
        minzoom={12}
      />
    </Source>
  );
}
