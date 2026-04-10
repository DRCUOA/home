import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, Home, Star } from "lucide-react";
import type { MapProperty } from "./types";
import { getStatusColor, getPrice } from "./types";
import { formatCurrency, capitalize } from "@/lib/format";
import { StatusBadge } from "@/components/ui/status-badge";

interface PropertyListSheetProps {
  properties: MapProperty[];
  onSelectProperty: (property: MapProperty) => void;
}

export function PropertyListSheet({
  properties,
  onSelectProperty,
}: PropertyListSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const sorted = useMemo(() => {
    return [...properties].sort((a, b) => {
      const aFav = a.favourite_rank ?? 999;
      const bFav = b.favourite_rank ?? 999;
      if (aFav !== bFav) return aFav - bFav;
      return a.address.localeCompare(b.address);
    });
  }, [properties]);

  if (properties.length === 0) return null;

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-30 transition-transform duration-300 ${
        isExpanded ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]"
      }`}
    >
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)] border-t border-slate-200 dark:border-slate-700">
        {/* Handle bar */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          <div className="w-8 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
        </button>

        <div className="flex items-center justify-between px-4 pb-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {properties.length} {properties.length === 1 ? "property" : "properties"} on map
          </p>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Property list */}
        <div className="max-h-64 overflow-y-auto px-3 pb-3 space-y-2">
          {sorted.map((p) => {
            const price = getPrice(p);
            const color = getStatusColor(p.watchlist_status);

            return (
              <button
                key={p.id}
                onClick={() => {
                  onSelectProperty(p);
                  setIsExpanded(false);
                }}
                className="w-full flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[3.5rem]"
              >
                <div
                  className="w-1 h-8 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {p.address}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                      {formatCurrency(price)}
                    </span>
                    {p.bedrooms != null && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {p.bedrooms} bed
                      </span>
                    )}
                  </div>
                </div>
                {p.favourite_rank != null && p.favourite_rank > 0 && (
                  <Star className="h-4 w-4 fill-amber-400 text-amber-500 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
