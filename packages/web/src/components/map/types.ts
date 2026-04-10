export interface MapProperty {
  id: string;
  project_id: string;
  address: string;
  suburb?: string;
  city?: string;
  latitude: number;
  longitude: number;
  price_asking?: number;
  price_guide_low?: number;
  price_guide_high?: number;
  bedrooms?: number;
  bathrooms?: number;
  property_type?: string;
  watchlist_status?: string;
  is_own_home: boolean;
  favourite_rank?: number;
  listing_url?: string;
}

export const STATUS_COLORS: Record<string, string> = {
  researching: "#3b82f6",
  shortlisted: "#22c55e",
  offer_candidate: "#f59e0b",
  rejected: "#ef4444",
  viewing_booked: "#8b5cf6",
  under_offer: "#06b6d4",
  purchased: "#10b981",
};

export function getStatusColor(status?: string): string {
  return STATUS_COLORS[status || ""] || "#3b82f6";
}

export function getPrice(p: MapProperty): number | undefined {
  return p.price_asking ?? p.price_guide_high ?? p.price_guide_low;
}
