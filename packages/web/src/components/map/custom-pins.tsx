import { Marker, Popup } from "react-map-gl/maplibre";
import { Trash2, Pencil, X, GripVertical } from "lucide-react";
import type { MapPin } from "@hcc/shared";
import { Button } from "@/components/ui/button";

interface CustomPinsProps {
  pins: MapPin[];
  editingPinId: string | null;
  onSelect: (pin: MapPin) => void;
  onEdit: (pin: MapPin) => void;
  onDelete: (id: string) => void;
  onClosePopup: () => void;
  interactive?: boolean;
}

export function CustomPins({
  pins,
  editingPinId,
  onSelect,
  onEdit,
  onDelete,
  onClosePopup,
  interactive = true,
}: CustomPinsProps) {
  const activePinPopup = editingPinId
    ? pins.find((p) => p.id === editingPinId)
    : null;

  return (
    <>
      {pins.map((pin) => (
        <Marker
          key={pin.id}
          longitude={pin.longitude}
          latitude={pin.latitude}
          anchor="bottom"
          onClick={(e) => {
            if (!interactive) return;
            e.originalEvent.stopPropagation();
            onSelect(pin);
          }}
        >
          <CustomPinMarker
            label={pin.label}
            color={pin.color}
            interactive={interactive}
          />
        </Marker>
      ))}

      {interactive && activePinPopup && (
        <Popup
          longitude={activePinPopup.longitude}
          latitude={activePinPopup.latitude}
          anchor="bottom"
          offset={44}
          closeOnClick={false}
          onClose={onClosePopup}
          closeButton={false}
          maxWidth="260px"
        >
          <div className="rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden min-w-[200px]">
            <div className="px-3 py-2.5 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: activePinPopup.color }}
                  />
                  <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 leading-snug truncate">
                    {activePinPopup.label}
                  </p>
                </div>
                {activePinPopup.notes && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {activePinPopup.notes}
                  </p>
                )}
              </div>
              <button
                onClick={onClosePopup}
                className="shrink-0 p-1 -m-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => onEdit(activePinPopup)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={() => {
                  onDelete(activePinPopup.id);
                  onClosePopup();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-l border-slate-100 dark:border-slate-800"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

function CustomPinMarker({
  label,
  color,
  interactive,
}: {
  label: string;
  color: string;
  interactive: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center group ${
        interactive ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <div
        className="mb-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-white shadow-md whitespace-nowrap max-w-[140px] truncate"
        style={{ backgroundColor: color }}
      >
        {label}
      </div>
      <svg
        width="20"
        height="26"
        viewBox="0 0 20 26"
        fill="none"
        className="drop-shadow-md transition-transform group-hover:scale-110"
      >
        <path
          d="M10 0C4.477 0 0 4.477 0 10c0 7.5 10 16 10 16s10-8.5 10-16C20 4.477 15.523 0 10 0z"
          fill={color}
        />
        <circle cx="10" cy="9.5" r="4" fill="white" fillOpacity="0.9" />
      </svg>
    </div>
  );
}
