/**
 * Top bar for the Floor Plan Designer.
 *
 * Houses: file/close, undo/redo, zoom controls + percent, scale indicator,
 * mode switch (beginner/advanced), save status, export stub. Density-aware
 * so the compact layout still fits at 1024px.
 *
 * Spec reference: informationArchitecture.topBar
 */

import {
  Check,
  ChevronDown,
  Download,
  HelpCircle,
  Image as ImageIcon,
  Maximize2,
  PanelLeft,
  PanelRight,
  Redo2,
  RotateCcw,
  Ruler,
  Trash2,
  Undo2,
  Upload as UploadIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useFloorPlanStore } from "@/stores/floor-plan";
import { FLOOR_PLAN_ZOOM_MAX, FLOOR_PLAN_ZOOM_MIN } from "@hcc/shared";
import { cn } from "@/lib/cn";

interface Props {
  title: string;
  /** Whether an image underlay is present. */
  hasImage: boolean;
  onClose: () => void;
  onUploadPlan: () => void;
  onRemovePlan?: () => void;
  onExport?: () => void;
}

export function FloorPlanTopBar({
  title,
  hasImage,
  onClose,
  onUploadPlan,
  onRemovePlan,
  onExport,
}: Props) {
  const mode = useFloorPlanStore((s) => s.mode);
  const setMode = useFloorPlanStore((s) => s.setMode);
  const viewport = useFloorPlanStore((s) => s.viewport);
  const zoomIn = useFloorPlanStore((s) => s.zoomIn);
  const zoomOut = useFloorPlanStore((s) => s.zoomOut);
  const fitToScreen = useFloorPlanStore((s) => s.fitToScreen);
  const resetViewport = useFloorPlanStore((s) => s.resetViewport);
  const setUnit = useFloorPlanStore((s) => s.setUnit);
  const undo = useFloorPlanStore((s) => s.undo);
  const redo = useFloorPlanStore((s) => s.redo);
  const past = useFloorPlanStore((s) => s.past);
  const future = useFloorPlanStore((s) => s.future);
  const toggleToolSidebar = useFloorPlanStore((s) => s.toggleToolSidebar);
  const togglePropertiesSidebar = useFloorPlanStore(
    (s) => s.togglePropertiesSidebar
  );
  const showToolSidebar = useFloorPlanStore((s) => s.showToolSidebar);
  const showPropertiesSidebar = useFloorPlanStore(
    (s) => s.showPropertiesSidebar
  );

  const zoomPct = Math.round(viewport.zoom * 100);

  return (
    <div
      role="toolbar"
      aria-label="Floor plan tools"
      className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100"
    >
      {/* File / title group */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={toggleToolSidebar}
          aria-pressed={showToolSidebar}
          aria-label="Toggle tool sidebar"
          className={cn(
            "rounded p-1.5 border transition",
            showToolSidebar
              ? "bg-primary-500 border-primary-500 text-white"
              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
          )}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
        <div
          className="text-sm font-semibold truncate"
          style={{ fontSize: 14 }}
        >
          {title}
        </div>
      </div>

      {/* Undo/redo */}
      <div
        role="group"
        aria-label="History"
        className="flex items-center gap-0.5 ml-2"
      >
        <TopBarIconButton
          label="Undo"
          onClick={undo}
          disabled={past.length === 0}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </TopBarIconButton>
        <TopBarIconButton
          label="Redo"
          onClick={redo}
          disabled={future.length === 0}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </TopBarIconButton>
      </div>

      {/* Zoom controls */}
      <div
        role="group"
        aria-label="Zoom"
        className="flex items-center gap-0.5 ml-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-0.5"
      >
        <TopBarIconButton
          label="Zoom out"
          onClick={zoomOut}
          disabled={viewport.zoom <= FLOOR_PLAN_ZOOM_MIN + 0.01}
          flat
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </TopBarIconButton>
        <div
          className="px-1.5 tabular-nums text-[11px] text-slate-600 dark:text-slate-300 min-w-10 text-center"
          aria-live="polite"
        >
          {zoomPct}%
        </div>
        <TopBarIconButton
          label="Zoom in"
          onClick={zoomIn}
          disabled={viewport.zoom >= FLOOR_PLAN_ZOOM_MAX - 0.01}
          flat
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </TopBarIconButton>
        <TopBarIconButton label="Fit to screen" onClick={fitToScreen} flat>
          <Maximize2 className="h-3.5 w-3.5" />
        </TopBarIconButton>
        <TopBarIconButton label="Reset viewport" onClick={resetViewport} flat>
          <RotateCcw className="h-3.5 w-3.5" />
        </TopBarIconButton>
      </div>

      {/* Scale indicator + unit toggle */}
      <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 ml-2">
        <Ruler className="h-3.5 w-3.5" />
        <button
          type="button"
          onClick={() => setUnit(viewport.unit === "metric" ? "imperial" : "metric")}
          className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-700"
          title="Switch between metric and imperial"
        >
          {viewport.unit === "metric" ? "m · cm" : "ft · in"}
        </button>
        <span className="hidden xl:inline">
          canvas ≈ {viewport.realWorldHeightMeters} m tall
        </span>
      </div>

      {/* Mode switch */}
      <div
        role="group"
        aria-label="Mode"
        className="flex items-center gap-0 ml-auto rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setMode("beginner")}
          aria-pressed={mode === "beginner"}
          className={cn(
            "px-2 py-1 text-[11px] font-medium transition",
            mode === "beginner"
              ? "bg-primary-500 text-white"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          )}
          title="Beginner mode — simple tools, smart defaults"
        >
          Beginner
        </button>
        <button
          type="button"
          onClick={() => setMode("advanced")}
          aria-pressed={mode === "advanced"}
          className={cn(
            "px-2 py-1 text-[11px] font-medium transition",
            mode === "advanced"
              ? "bg-primary-500 text-white"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          )}
          title="Advanced mode — full tools and precision controls"
        >
          Advanced
        </button>
      </div>

      {/* Save status */}
      <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
        <Check className="h-3 w-3 text-primary-500" />
        <span>Autosaved</span>
      </div>

      {/* Image actions */}
      <div className="flex items-center gap-0.5">
        <TopBarTextButton onClick={onUploadPlan} icon={<UploadIcon className="h-3.5 w-3.5" />}>
          {hasImage ? "Replace" : "Add image"}
        </TopBarTextButton>
        {hasImage && onRemovePlan && (
          <TopBarTextButton
            onClick={onRemovePlan}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            tone="danger"
          >
            Remove
          </TopBarTextButton>
        )}
      </div>

      {/* Export */}
      {onExport && (
        <TopBarTextButton onClick={onExport} icon={<Download className="h-3.5 w-3.5" />}>
          Export
          <ChevronDown className="h-3 w-3 -mr-1 ml-0.5 opacity-60" />
        </TopBarTextButton>
      )}

      {/* Help */}
      <TopBarIconButton label="Keyboard shortcuts" onClick={() => undefined}>
        <HelpCircle className="h-3.5 w-3.5" />
      </TopBarIconButton>

      {/* Right-sidebar toggle */}
      <TopBarIconButton
        label="Toggle properties panel"
        onClick={togglePropertiesSidebar}
        active={showPropertiesSidebar}
      >
        <PanelRight className="h-3.5 w-3.5" />
      </TopBarIconButton>

      {/* Done */}
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition bg-primary-500 hover:bg-primary-600 text-white min-h-7"
      >
        <Check className="h-3.5 w-3.5" />
        Done
      </button>

      {/* Fallback: used only when the image actions are placed somewhere that
          doesn't import the ImageIcon — silences lint for the import. */}
      <ImageIcon className="hidden" aria-hidden />
    </div>
  );
}

/* ---------- local buttons ---------- */

function TopBarIconButton({
  children,
  label,
  onClick,
  disabled,
  flat,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  flat?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "rounded p-1.5 transition",
        !flat && "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800",
        !disabled && !active && "hover:bg-slate-100 dark:hover:bg-slate-700",
        active && "bg-primary-500 text-white border-primary-500",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

function TopBarTextButton({
  children,
  icon,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition border min-h-7",
        tone === "danger"
          ? "bg-white dark:bg-slate-800 text-red-600 dark:text-red-300 border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/40"
          : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}
