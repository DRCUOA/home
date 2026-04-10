import { useState } from "react";
import { Popup } from "react-map-gl/maplibre";
import {
  ExternalLink,
  Navigation,
  X,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import type { MapPin } from "@hcc/shared";
import type { MapProperty } from "./types";
import { getStatusColor, getPrice } from "./types";
import { formatCurrency, capitalize } from "@/lib/format";
import { StatusBadge } from "@/components/ui/status-badge";
import { LocationInsights, type AmenityPoi } from "./location-insights";

interface PropertyPopupProps {
  property: MapProperty;
  properties: MapProperty[];
  customPins: MapPin[];
  onClose: () => void;
  onShowInsights: (property: MapProperty) => void;
}

export function PropertyPopup({
  property,
  properties,
  customPins,
  onClose,
  onShowInsights,
}: PropertyPopupProps) {
  const price = getPrice(property);

  return (
    <Popup
      longitude={property.longitude}
      latitude={property.latitude}
      anchor="bottom"
      offset={40}
      closeOnClick={false}
      onClose={onClose}
      closeButton={false}
      className="map-popup"
      maxWidth="280px"
    >
      <div className="rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden min-w-[240px]">
        <div className="px-3 py-2 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 leading-snug truncate">
              {property.address}
            </p>
            {(property.suburb || property.city) && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {[property.suburb, property.city].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1 -m-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 pb-2">
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(price)}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-600 dark:text-slate-400">
            <span>
              {property.bedrooms != null
                ? `${property.bedrooms} bed`
                : "-- bed"}
            </span>
            <span>·</span>
            <span>
              {property.bathrooms != null
                ? `${property.bathrooms} bath`
                : "-- bath"}
            </span>
            {property.property_type && (
              <>
                <span>·</span>
                <span>{capitalize(property.property_type)}</span>
              </>
            )}
          </div>
          {property.watchlist_status && (
            <div className="mt-2">
              <StatusBadge status={property.watchlist_status} />
            </div>
          )}
        </div>

        <div className="flex border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => onShowInsights(property)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Insights
          </button>
          {property.listing_url && (
            <a
              href={property.listing_url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-l border-slate-100 dark:border-slate-800"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Listing
            </a>
          )}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${property.latitude},${property.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-l border-slate-100 dark:border-slate-800"
          >
            <Navigation className="h-3.5 w-3.5" />
            Directions
          </a>
        </div>
      </div>
    </Popup>
  );
}

interface PropertyInsightsPanelProps {
  property: MapProperty;
  properties: MapProperty[];
  customPins: MapPin[];
  activeAmenityTypes: Set<string>;
  onAmenityToggle: (type: string, pois: AmenityPoi[]) => void;
  onClose: () => void;
}

export function PropertyInsightsPanel({
  property,
  properties,
  customPins,
  activeAmenityTypes,
  onAmenityToggle,
  onClose,
}: PropertyInsightsPanelProps) {
  const price = getPrice(property);

  return (
    <div className="rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-xl border border-slate-200 dark:border-slate-700 w-80 overflow-hidden max-h-[calc(100vh-10rem)] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary-600 dark:text-primary-400 shrink-0" />
            {property.address}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
              {formatCurrency(price)}
            </p>
            <span className="text-xs text-slate-400">·</span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {property.bedrooms ?? "?"} bed /{" "}
              {property.bathrooms ?? "?"} bath
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <LocationInsights
          latitude={property.latitude}
          longitude={property.longitude}
          properties={properties}
          customPins={customPins}
          excludePropertyId={property.id}
          activeAmenityTypes={activeAmenityTypes}
          onAmenityToggle={onAmenityToggle}
        />
      </div>
    </div>
  );
}
