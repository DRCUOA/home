import {
  useRef,
  useCallback,
  useEffect,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import Map, {
  NavigationControl,
  GeolocateControl,
  ScaleControl,
  Marker,
  Popup,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Camera } from "lucide-react";
import type { MapConfig } from "@/hooks/use-map-config";
import type { MapPin } from "@hcc/shared";
import { getAccessToken } from "@/lib/api";
import type { MapProperty } from "./types";
import { PropertyPins } from "./property-pin";
import { PropertyPopup } from "./property-popup";
import { CustomPins } from "./custom-pins";
import { HeatmapLayer } from "./heatmap-layer";
import { FloodLayer } from "./flood-layer";
import { HazardLayer } from "./hazard-layer";
import { SchoolZoneLayer } from "./school-zone-layer";
import { AmenityDots, type AmenityPoi } from "./amenity-dots";
import {
  MeasureLine,
  type MeasurePoint,
  type MeasureSegment,
} from "./measure-line";
import { StreetViewModal } from "./street-view";
import { useThemeStore } from "@/stores/theme";

export interface MapViewHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  fitBounds: (
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
    padding?: number
  ) => void;
}

interface MapViewProps {
  config: MapConfig;
  /** Fit all properties into view on first load (default). Disable when the
   * caller positions the camera itself, e.g. a ?property= deep link. */
  autoFit?: boolean;
  properties: MapProperty[];
  customPins: MapPin[];
  visibleLayers: Set<string>;
  selectedProperty: MapProperty | null;
  activePinId: string | null;
  pinDropMode: boolean;
  onPropertyClick: (property: MapProperty) => void;
  onPropertyDeselect: () => void;
  onPropertyInsights: (property: MapProperty) => void;
  onPinClick: (pin: MapPin) => void;
  onPinEdit: (pin: MapPin) => void;
  onPinPopupClose: () => void;
  onPinDelete: (id: string) => void;
  onMapClick: (lng: number, lat: number) => void;
  amenityPois: AmenityPoi[];
  activeAmenityTypes: Set<string>;
  measureMode: boolean;
  measurePoints: MeasurePoint[];
  measureSegments: MeasureSegment[];
  onMeasureClick: (lng: number, lat: number) => void;
  onMeasurePointMove: (pointIndex: number, lng: number, lat: number) => void;
  onMeasureSegmentTranslate: (
    segmentIndex: number,
    deltaLng: number,
    deltaLat: number
  ) => void;
  onMeasureDeleteSegment: (segmentIndex: number) => void;
}

const NZ_CENTER = { longitude: 174.7633, latitude: -41.2865, zoom: 5.5 };

const FALLBACK_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const FALLBACK_DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export const MapView = forwardRef<MapViewHandle, MapViewProps>(
  function MapView(
    {
      config,
      autoFit = true,
      properties,
      customPins,
      visibleLayers,
      selectedProperty,
      activePinId,
      pinDropMode,
      onPropertyClick,
      onPropertyDeselect,
      onPropertyInsights,
      onPinClick,
      onPinEdit,
      onPinPopupClose,
      onPinDelete,
      onMapClick,
      amenityPois,
      activeAmenityTypes,
      measureMode,
      measurePoints,
      measureSegments,
      onMeasureClick,
      onMeasurePointMove,
      onMeasureSegmentTranslate,
      onMeasureDeleteSegment,
    },
    ref
  ) {
    const mapRef = useRef<MapRef>(null);
    const { theme } = useThemeStore();
    const isDark =
      theme === "dark" ||
      (theme === "system" &&
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const [viewState, setViewState] = useState(NZ_CENTER);
    const initialFitDone = useRef(false);
    const segmentDragStartRef = useRef<Record<number, { lng: number; lat: number }>>({});
    const [contextMenu, setContextMenu] = useState<{
      lng: number;
      lat: number;
    } | null>(null);
    const [streetView, setStreetView] = useState<{
      lng: number;
      lat: number;
    } | null>(null);

    const mapStyle =
      config.linzStyleUrl || (isDark ? FALLBACK_DARK_STYLE : FALLBACK_STYLE);
    const hazardLayersActive =
      visibleLayers.has("flood-coastal") ||
      visibleLayers.has("earthquake-faults") ||
      visibleLayers.has("tsunami-zones") ||
      visibleLayers.has("liquefaction") ||
      visibleLayers.has("school-zones");

    const transformRequest = useCallback(
      (url: string, _resourceType?: maplibregl.ResourceType) => {
        if (url.startsWith("/api/") || url.startsWith(window.location.origin + "/api/")) {
          const token = getAccessToken();
          if (token) {
            return {
              url,
              headers: { Authorization: `Bearer ${token}` },
            };
          }
        }
        return { url };
      },
      []
    );

    useImperativeHandle(ref, () => ({
      flyTo(lng: number, lat: number, zoom = 14) {
        mapRef.current?.flyTo({
          center: [lng, lat],
          zoom,
          duration: 1200,
        });
      },
      fitBounds(fromLng: number, fromLat: number, toLng: number, toLat: number, padding = 100) {
        const west = Math.min(fromLng, toLng);
        const east = Math.max(fromLng, toLng);
        const south = Math.min(fromLat, toLat);
        const north = Math.max(fromLat, toLat);
        mapRef.current?.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          { padding, duration: 1200, maxZoom: 16 }
        );
      },
    }));

    useEffect(() => {
      if (
        !autoFit ||
        properties.length === 0 ||
        !mapRef.current ||
        initialFitDone.current
      )
        return;

      initialFitDone.current = true;

      const lngs = properties.map((p) => p.longitude);
      const lats = properties.map((p) => p.latitude);
      const west = Math.min(...lngs);
      const east = Math.max(...lngs);
      const south = Math.min(...lats);
      const north = Math.max(...lats);

      if (properties.length === 1) {
        mapRef.current.flyTo({
          center: [lngs[0], lats[0]],
          zoom: 14,
          duration: 1200,
        });
      } else {
        mapRef.current.fitBounds(
          [
            [west - 0.01, south - 0.01],
            [east + 0.01, north + 0.01],
          ],
          { padding: 60, duration: 1200 }
        );
      }
    }, [properties, autoFit]);

    const handleMove = useCallback((e: ViewStateChangeEvent) => {
      setViewState(e.viewState);
    }, []);

    const handleClick = useCallback(
      (e: maplibregl.MapMouseEvent) => {
        if (contextMenu) setContextMenu(null);
        if (measureMode) {
          onMeasureClick(e.lngLat.lng, e.lngLat.lat);
        } else if (pinDropMode) {
          onMapClick(e.lngLat.lng, e.lngLat.lat);
        }
      },
      [pinDropMode, measureMode, onMapClick, onMeasureClick, contextMenu]
    );

    const handleContextMenu = useCallback(
      (e: maplibregl.MapMouseEvent) => {
        if (measureMode || pinDropMode) return;
        e.preventDefault?.();
        setContextMenu({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      },
      [measureMode, pinDropMode]
    );

    const segmentMidpoints = useMemo(
      () =>
        measureSegments.map((segment) => {
          const coords = segment.coordinates;
          if (coords.length === 0) return [0, 0] as [number, number];
          return coords[Math.floor(coords.length / 2)] as [number, number];
        }),
      [measureSegments]
    );

    return (
      <>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        mapStyle={mapStyle}
        transformRequest={transformRequest}
        style={{
          width: "100%",
          height: "100%",
          cursor: measureMode ? "crosshair" : pinDropMode ? "crosshair" : undefined,
        }}
        attributionControl={{ compact: true }}
        maxZoom={18}
        minZoom={4}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <GeolocateControl position="top-right" />
        <ScaleControl position="bottom-left" maxWidth={150} unit="metric" />

        {visibleLayers.has("property-pins") && (
          <PropertyPins
            properties={properties}
            onClick={onPropertyClick}
            dimmed={hazardLayersActive}
            interactive={!measureMode}
          />
        )}

        {visibleLayers.has("value-heatmap") && (
          <HeatmapLayer properties={properties} />
        )}

        {visibleLayers.has("flood-coastal") && <FloodLayer />}

        {(visibleLayers.has("earthquake-faults") ||
          visibleLayers.has("tsunami-zones") ||
          visibleLayers.has("liquefaction")) && (
          <HazardLayer
            showFaults={visibleLayers.has("earthquake-faults")}
            showTsunami={visibleLayers.has("tsunami-zones")}
            showLiquefaction={visibleLayers.has("liquefaction")}
          />
        )}

        {visibleLayers.has("school-zones") && <SchoolZoneLayer />}

        <AmenityDots pois={amenityPois} activeTypes={activeAmenityTypes} />

        <CustomPins
          pins={customPins}
          editingPinId={activePinId}
          onSelect={onPinClick}
          onEdit={onPinEdit}
          onDelete={onPinDelete}
          onClosePopup={onPinPopupClose}
          interactive={!measureMode}
        />

        {selectedProperty && (
          <PropertyPopup
            property={selectedProperty}
            properties={properties}
            customPins={customPins}
            onClose={onPropertyDeselect}
            onShowInsights={onPropertyInsights}
          />
        )}

        <MeasureLine points={measurePoints} segments={measureSegments} />

        {measureMode &&
          measurePoints.map((point, pointIndex) => (
            <Marker
              key={`measure-point-handle-${pointIndex}`}
              longitude={point.lng}
              latitude={point.lat}
              anchor="center"
              draggable
              onDragEnd={(e) => {
                onMeasurePointMove(pointIndex, e.lngLat.lng, e.lngLat.lat);
              }}
            >
              <div
                title="Drag point"
                className="h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500 shadow-md"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </Marker>
          ))}

        {measureMode &&
          segmentMidpoints.map((midpoint, segmentIndex) => (
            <Marker
              key={`measure-segment-drag-${segmentIndex}`}
              longitude={midpoint[0]}
              latitude={midpoint[1]}
              anchor="center"
              draggable
              onDragStart={(e) => {
                segmentDragStartRef.current[segmentIndex] = {
                  lng: e.lngLat.lng,
                  lat: e.lngLat.lat,
                };
              }}
              onDragEnd={(e) => {
                const start = segmentDragStartRef.current[segmentIndex];
                delete segmentDragStartRef.current[segmentIndex];
                if (!start) return;

                onMeasureSegmentTranslate(
                  segmentIndex,
                  e.lngLat.lng - start.lng,
                  e.lngLat.lat - start.lat
                );
              }}
            >
              <div
                title="Drag segment"
                className="h-4 w-4 rounded-full border border-white bg-amber-500/90 shadow-md"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </Marker>
          ))}

        {measureMode &&
          segmentMidpoints.map((midpoint, segmentIndex) => (
            <Marker
              key={`measure-segment-delete-${segmentIndex}`}
              longitude={midpoint[0]}
              latitude={midpoint[1]}
              anchor="center"
            >
              <button
                type="button"
                title="Delete segment"
                className="ml-4 -mt-4 h-5 w-5 rounded-full border border-white bg-red-600 text-white text-[10px] leading-none shadow-md hover:bg-red-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onMeasureDeleteSegment(segmentIndex);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                x
              </button>
            </Marker>
          ))}

        {contextMenu && (
          <Popup
            longitude={contextMenu.lng}
            latitude={contextMenu.lat}
            anchor="top"
            offset={8}
            closeOnClick={false}
            onClose={() => setContextMenu(null)}
            closeButton={false}
            className="map-context-popup"
            maxWidth="220px"
          >
            <div className="rounded-lg bg-white dark:bg-slate-900 shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setStreetView({ lng: contextMenu.lng, lat: contextMenu.lat });
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
              >
                <Camera className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                Street View here
              </button>
              <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-1.5 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                {contextMenu.lat.toFixed(5)}, {contextMenu.lng.toFixed(5)}
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {streetView && (
        <StreetViewModal
          open
          latitude={streetView.lat}
          longitude={streetView.lng}
          onClose={() => setStreetView(null)}
        />
      )}
    </>
    );
  }
);
