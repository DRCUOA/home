import { useState, useEffect } from "react";
import { X, MapPinPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MapPin } from "@hcc/shared";
import type { MapProperty } from "./types";
import { LocationInsights, type AmenityPoi } from "./location-insights";

const PIN_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

interface PinFormProps {
  latitude: number;
  longitude: number;
  existing?: MapPin;
  properties: MapProperty[];
  customPins: MapPin[];
  activeAmenityTypes: Set<string>;
  onAmenityToggle: (type: string, pois: AmenityPoi[]) => void;
  onSave: (data: {
    label: string;
    color: string;
    notes?: string;
    latitude: number;
    longitude: number;
  }) => void;
  onCancel: () => void;
  saving: boolean;
}

export function PinForm({
  latitude,
  longitude,
  existing,
  properties,
  customPins,
  activeAmenityTypes,
  onAmenityToggle,
  onSave,
  onCancel,
  saving,
}: PinFormProps) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [color, setColor] = useState(existing?.color ?? "#8b5cf6");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [activeTab, setActiveTab] = useState<"details" | "insights">(
    existing ? "insights" : "details"
  );

  useEffect(() => {
    if (existing) {
      setLabel(existing.label);
      setColor(existing.color);
      setNotes(existing.notes ?? "");
    }
  }, [existing?.id]);

  const handleSave = () => {
    if (!label.trim()) return;
    onSave({
      label: label.trim(),
      color,
      notes: notes.trim() || undefined,
      latitude,
      longitude,
    });
  };

  const tabs = [
    { id: "details" as const, label: "Details" },
    { id: "insights" as const, label: "Insights" },
  ];

  return (
    <div className="rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-xl border border-slate-200 dark:border-slate-700 w-80 overflow-hidden max-h-[calc(100vh-10rem)] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <MapPinPlus className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          {existing ? "Edit pin" : "Drop a pin"}
        </h3>
        <button
          onClick={onCancel}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === t.id
                ? "text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "details" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="p-3 space-y-3"
          >
            <Input
              label="Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. John & Mary live here"
              required
              autoFocus
            />

            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Colour
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PIN_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition-all flex items-center justify-center ${
                      color === c
                        ? "border-slate-900 dark:border-white scale-110"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {color === c && (
                      <Check
                        className="h-3.5 w-3.5 text-white"
                        strokeWidth={3}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note..."
              rows={2}
            />

            <p className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
              {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </p>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 min-h-10"
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 min-h-10"
                disabled={saving || !label.trim()}
              >
                {existing ? "Save" : "Drop pin"}
              </Button>
            </div>
          </form>
        )}

        {activeTab === "insights" && (
          <div className="p-3 space-y-4">
            <LocationInsights
              latitude={latitude}
              longitude={longitude}
              properties={properties}
              customPins={customPins}
              excludePinId={existing?.id}
              activeAmenityTypes={activeAmenityTypes}
              onAmenityToggle={onAmenityToggle}
            />

            <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 min-h-10"
                onClick={onCancel}
              >
                {existing ? "Close" : "Cancel"}
              </Button>
              <Button
                type="button"
                className="flex-1 min-h-10"
                disabled={saving || !label.trim()}
                onClick={handleSave}
              >
                {existing ? "Save" : "Drop pin"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
