import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface LayerDefinition {
  id: string;
  label: string;
  category: string;
  type: string;
  defaultVisible: boolean;
}

export interface MapConfig {
  linzStyleUrl: string | null;
  linzAerialUrl: string | null;
  linzApiKey: string | null;
  layers: LayerDefinition[];
}

export function useMapConfig() {
  return useQuery({
    queryKey: ["map-config"],
    queryFn: () => apiGet<{ data: MapConfig }>("/map/config"),
    staleTime: 30 * 60 * 1000,
  });
}
