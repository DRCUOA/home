import { useState, useMemo } from "react";
import {
  Layers,
  X,
  MapPin,
  Flame,
  Droplets,
  Mountain,
  Waves,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import type { LayerDefinition } from "@/hooks/use-map-config";

interface LayerControlProps {
  layers: LayerDefinition[];
  visibleLayers: Set<string>;
  onToggle: (layerId: string) => void;
}

const LAYER_ICONS: Record<string, typeof MapPin> = {
  "property-pins": MapPin,
  "value-heatmap": Flame,
  "flood-coastal": Droplets,
  "earthquake-faults": Mountain,
  "tsunami-zones": Waves,
  liquefaction: AlertTriangle,
  "school-zones": GraduationCap,
};

const CATEGORY_ORDER = ["My Properties", "Risk & Hazards", "Neighbourhood"];

export function LayerControl({
  layers,
  visibleLayers,
  onToggle,
}: LayerControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map = new Map<string, LayerDefinition[]>();
    for (const l of layers) {
      const group = map.get(l.category) ?? [];
      group.push(l);
      map.set(l.category, group);
    }
    return map;
  }, [layers]);

  const activeCount = visibleLayers.size;

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[2.75rem]"
        >
          <Layers className="h-4 w-4" />
          <span>Layers</span>
          {activeCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <div className="rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-xl border border-slate-200 dark:border-slate-700 w-72 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Map layers
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {CATEGORY_ORDER.map((cat) => {
              const items = grouped.get(cat);
              if (!items) return null;
              const isCollapsed = collapsed.has(cat);

              return (
                <div key={cat}>
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <span>{cat}</span>
                    {isCollapsed ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {!isCollapsed &&
                    items.map((layer) => {
                      const Icon = LAYER_ICONS[layer.id] || Layers;
                      const isActive = visibleLayers.has(layer.id);

                      return (
                        <button
                          key={layer.id}
                          onClick={() => onToggle(layer.id)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors min-h-[2.75rem]"
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              isActive
                                ? "text-primary-600 dark:text-primary-400"
                                : "text-slate-400 dark:text-slate-500"
                            }`}
                          />
                          <span className="flex-1 text-left">{layer.label}</span>
                          <div
                            className={`w-9 h-5 rounded-full transition-colors ${
                              isActive
                                ? "bg-primary-600"
                                : "bg-slate-200 dark:bg-slate-700"
                            }`}
                          >
                            <div
                              className={`h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${
                                isActive ? "translate-x-4.5 ml-0" : "translate-x-0.5"
                              }`}
                            />
                          </div>
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>

          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
              Hazard data sourced from NZ council GIS services. Not a substitute for professional assessment.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
