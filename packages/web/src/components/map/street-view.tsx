import { useEffect, useState } from "react";
import { X, ExternalLink, Camera, AlertCircle } from "lucide-react";
import { useMapConfig } from "@/hooks/use-map-config";

interface StreetViewModalProps {
  open: boolean;
  latitude: number;
  longitude: number;
  label?: string;
  onClose: () => void;
}

const STREETVIEW_HEADING = 0;
const STREETVIEW_PITCH = 0;
const STREETVIEW_FOV = 90;

function buildEmbedUrl(apiKey: string, lat: number, lng: number): string {
  const params = new URLSearchParams({
    key: apiKey,
    location: `${lat},${lng}`,
    heading: String(STREETVIEW_HEADING),
    pitch: String(STREETVIEW_PITCH),
    fov: String(STREETVIEW_FOV),
  });
  return `https://www.google.com/maps/embed/v1/streetview?${params}`;
}

function buildStaticUrl(
  apiKey: string,
  lat: number,
  lng: number,
  width: number,
  height: number
): string {
  const params = new URLSearchParams({
    size: `${width}x${height}`,
    location: `${lat},${lng}`,
    fov: "90",
    heading: "0",
    pitch: "0",
    key: apiKey,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params}`;
}

function buildGoogleMapsStreetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

export function StreetViewModal({
  open,
  latitude,
  longitude,
  label,
  onClose,
}: StreetViewModalProps) {
  const configQuery = useMapConfig();
  const apiKey = configQuery.data?.data.googleMapsApiKey || null;

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const embedUrl = apiKey ? buildEmbedUrl(apiKey, latitude, longitude) : null;
  const fallbackUrl = buildGoogleMapsStreetViewUrl(latitude, longitude);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-6"
      style={{ zIndex: 60 }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden rounded-xl bg-white dark:bg-slate-900"
        style={{ boxShadow: "var(--ds-shadow-xl)" }}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Camera className="h-4 w-4 text-primary-600 dark:text-primary-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                Street View
              </h2>
              {label && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {label}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Open in Google Maps"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Google
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 dark:bg-slate-800">
          {embedUrl ? (
            <iframe
              key={`${latitude}-${longitude}`}
              src={embedUrl}
              title="Street View"
              className="h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allow="fullscreen"
            />
          ) : (
            <NoApiKeyMessage fallbackUrl={fallbackUrl} />
          )}
        </div>
      </div>
    </div>
  );
}

function NoApiKeyMessage({ fallbackUrl }: { fallbackUrl: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertCircle className="h-8 w-8 text-amber-500" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Street View is not configured
      </p>
      <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">
        The Google Maps API key is not set on the server. You can still view this
        location in Google Maps Street View.
      </p>
      <a
        href={fallbackUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white hover:bg-primary-700 transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open in Google Maps
      </a>
    </div>
  );
}

interface StreetViewPreviewProps {
  latitude: number;
  longitude: number;
  onOpen: () => void;
}

export function StreetViewPreview({
  latitude,
  longitude,
  onOpen,
}: StreetViewPreviewProps) {
  const configQuery = useMapConfig();
  const apiKey = configQuery.data?.data.googleMapsApiKey || null;
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [latitude, longitude]);

  const fallbackUrl = buildGoogleMapsStreetViewUrl(latitude, longitude);

  if (!apiKey) {
    return (
      <a
        href={fallbackUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 p-2.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Camera className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="flex-1">Open in Google Street View</span>
        <ExternalLink className="h-3 w-3 text-slate-400" />
      </a>
    );
  }

  const previewUrl = buildStaticUrl(apiKey, latitude, longitude, 600, 200);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative w-full overflow-hidden rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 transition-all hover:border-primary-300 dark:hover:border-primary-600"
    >
      {!imageError ? (
        <img
          src={previewUrl}
          alt="Street View preview"
          loading="lazy"
          onError={() => setImageError(true)}
          className="block h-28 w-full object-cover"
        />
      ) : (
        <div className="flex h-28 w-full items-center justify-center bg-slate-100 dark:bg-slate-800">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            No Street View imagery available
          </p>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-slate-900/80 to-transparent px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-white">
          <Camera className="h-3 w-3" />
          Street View
        </div>
        <span className="text-[10px] text-white/80 group-hover:text-white">
          Tap to explore
        </span>
      </div>
    </button>
  );
}
