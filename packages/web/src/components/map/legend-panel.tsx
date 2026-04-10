import { STATUS_COLORS } from "./types";
import { capitalize } from "@/lib/format";

interface LegendPanelProps {
  visibleLayers: Set<string>;
}

export function LegendPanel({ visibleLayers }: LegendPanelProps) {
  const showPins = visibleLayers.has("property-pins");
  const showHeatmap = visibleLayers.has("value-heatmap");
  const showFlood = visibleLayers.has("flood-coastal");
  const showFaults = visibleLayers.has("earthquake-faults");
  const showSchools = visibleLayers.has("school-zones");

  if (!showPins && !showHeatmap && !showFlood && !showFaults && !showSchools) return null;

  return (
    <div className="rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs space-y-2 max-w-[200px]">
      {showPins && (
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Property status
          </p>
          <div className="space-y-1">
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <div key={status} className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-slate-600 dark:text-slate-400">
                  {capitalize(status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showHeatmap && (
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Value intensity
          </p>
          <div className="h-2.5 w-full rounded-full bg-gradient-to-r from-blue-500 via-yellow-400 to-red-600" />
          <div className="flex justify-between mt-0.5 text-[10px] text-slate-400">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>
      )}

      {showFlood && (
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Flood risk
          </p>
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-4 rounded bg-blue-500/50" />
            <span className="text-slate-600 dark:text-slate-400">
              Flood-prone area
            </span>
          </div>
        </div>
      )}

      {showFaults && (
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Earthquake faults
          </p>
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-4 rounded bg-red-600" />
            <span className="text-slate-600 dark:text-slate-400">
              Active fault line
            </span>
          </div>
        </div>
      )}

      {showSchools && (
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
            School decile
          </p>
          <div className="h-2.5 w-full rounded-full bg-gradient-to-r from-red-100 via-red-400 to-red-800" />
          <div className="flex justify-between mt-0.5 text-[10px] text-slate-400">
            <span>1</span>
            <span>10</span>
          </div>
        </div>
      )}
    </div>
  );
}
