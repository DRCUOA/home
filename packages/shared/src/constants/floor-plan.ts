/**
 * Floor Plan Designer — constants shared by client and server.
 *
 * Introduced as part of the UI/UX refactor (major 1). These are the
 * design-token-level values that the spec calls out explicitly (font
 * sizes, thickness presets, grid sizes, etc.) so that any part of the
 * app can read them without drifting from the spec.
 */

import type {
  FloorPlanLayer,
  FloorPlanLineStyle,
} from "../types/index.js";

/** Ordered list of wall thickness presets (normalized units). */
export const FLOOR_PLAN_WALL_THICKNESS_PRESETS = [
  { id: "thin", label: "Thin", value: 0.006 },
  { id: "standard", label: "Standard", value: 0.012 },
  { id: "thick", label: "Thick", value: 0.02 },
  { id: "structural", label: "Structural", value: 0.03 },
] as const;

export const FLOOR_PLAN_WALL_THICKNESS_MIN = 0.002;
export const FLOOR_PLAN_WALL_THICKNESS_MAX = 0.04;

/** Grid overlay sizes (in CSS px at 1x zoom). */
export const FLOOR_PLAN_GRID_PRESETS = [
  { id: "fine", label: "Fine (20)", value: 20 },
  { id: "medium", label: "Medium (40)", value: 40 },
  { id: "coarse", label: "Coarse (80)", value: 80 },
] as const;

export const FLOOR_PLAN_ZOOM_MIN = 0.25;
export const FLOOR_PLAN_ZOOM_MAX = 6;
export const FLOOR_PLAN_ZOOM_STEP = 1.1;

/** Font ramp from the spec (spec.stylingControls.fontControls.fontUsage). */
export const FLOOR_PLAN_FONT_USAGE = {
  appTitle: { sizePx: 20, weight: 600 },
  sectionHeaders: { sizePx: 16, weight: 600 },
  panelLabels: { sizePx: 14, weight: 500 },
  bodyText: { sizePx: 14, weight: 400 },
  smallMetaText: { sizePx: 12, weight: 400 },
  canvasLabels: { sizePx: 12, weight: 500 },
  dimensionLabels: { sizePx: 11, weight: 500 },
  tooltips: { sizePx: 13, weight: 400 },
  inputText: { sizePx: 14, weight: 400 },
  buttonText: { sizePx: 14, weight: 500 },
} as const;

/** User-facing "Small / Medium / Large" text-scale presets. */
export const FLOOR_PLAN_TEXT_SCALES = [
  { id: "small", label: "Small", multiplier: 0.875 },
  { id: "medium", label: "Medium", multiplier: 1 },
  { id: "large", label: "Large", multiplier: 1.15 },
] as const;

/** Supported line styles (wall + object outline + dimension line). */
export const FLOOR_PLAN_LINE_STYLES: readonly FloorPlanLineStyle[] = [
  "solid",
  "dashed",
  "dotted",
] as const;

/** Default layer seed for a fresh plan. Ordered bottom → top on screen. */
export const FLOOR_PLAN_DEFAULT_LAYERS: readonly FloorPlanLayer[] = [
  { id: "walls", name: "Walls", visible: true, locked: false, sort_order: 10 },
  { id: "furniture", name: "Furniture", visible: true, locked: false, sort_order: 20 },
  { id: "annotations", name: "Annotations", visible: true, locked: false, sort_order: 30 },
  { id: "electrical", name: "Electrical", visible: false, locked: false, sort_order: 40 },
  { id: "plumbing", name: "Plumbing", visible: false, locked: false, sort_order: 50 },
];

/** Beginner-safe color palette the property panel offers by default. */
export const FLOOR_PLAN_BEGINNER_PALETTE = [
  "#0f172a", // slate-900 (default outlines)
  "#64748b", // slate-500
  "#94a3b8", // slate-400
  "#00c94e", // brand primary
  "#2563eb", // info
  "#d97706", // warning
  "#dc2626", // danger
  "#8b5cf6", // violet
  "#f472b6", // pink
  "#facc15", // yellow
] as const;

/** Object-replacement presets for common sizes (width × height, normalized).
 *  Used by the property panel's "Preset size" dropdown so a beginner can
 *  pick "Queen bed" without typing a number. Values are approximate at a
 *  6m-tall canvas. */
export const FLOOR_PLAN_PRESET_SIZES: Record<
  string,
  { label: string; width: number; height: number }[]
> = {
  bed: [
    { label: "Single", width: 0.14, height: 0.32 },
    { label: "Double", width: 0.22, height: 0.32 },
    { label: "Queen", width: 0.25, height: 0.33 },
    { label: "King", width: 0.3, height: 0.33 },
  ],
  sofa: [
    { label: "2-seater", width: 0.3, height: 0.14 },
    { label: "3-seater", width: 0.36, height: 0.14 },
    { label: "L-shape", width: 0.4, height: 0.28 },
  ],
  dining_table: [
    { label: "4-seat", width: 0.26, height: 0.16 },
    { label: "6-seat", width: 0.34, height: 0.18 },
    { label: "8-seat", width: 0.42, height: 0.2 },
  ],
  fridge: [
    { label: "Standard", width: 0.12, height: 0.14 },
    { label: "French-door", width: 0.16, height: 0.14 },
  ],
  bathtub: [
    { label: "Alcove", width: 0.3, height: 0.14 },
    { label: "Freestanding", width: 0.26, height: 0.14 },
  ],
  door: [
    { label: "Single (0.8m)", width: 0.13, height: 0.02 },
    { label: "Double (1.5m)", width: 0.25, height: 0.02 },
  ],
  window: [
    { label: "Small", width: 0.1, height: 0.02 },
    { label: "Standard", width: 0.15, height: 0.02 },
    { label: "Large", width: 0.25, height: 0.02 },
  ],
};

/** Clearance zones (front-of-object depth, normalized) — used to render a
 *  translucent halo where the object needs space to open / be used. */
export const FLOOR_PLAN_CLEARANCE: Record<string, number> = {
  door: 0.13,
  door_double: 0.25,
  sliding_door: 0.05,
  fridge: 0.1,
  oven: 0.1,
  dishwasher: 0.1,
  washer: 0.1,
  dryer: 0.1,
  toilet: 0.08,
  bathtub: 0.08,
  shower: 0.06,
};

/** Default real-world canvas height — 10 metres covers most floor plans. */
export const FLOOR_PLAN_DEFAULT_HEIGHT_METERS = 10;

/** Keyboard shortcuts (advanced mode). Kept here so the help overlay and
 *  the key handler stay in sync. */
export const FLOOR_PLAN_SHORTCUTS = [
  { keys: "V", action: "Select tool" },
  { keys: "W", action: "Wall tool" },
  { keys: "R", action: "Rectangle room" },
  { keys: "P", action: "Polygon room" },
  { keys: "D", action: "Door" },
  { keys: "N", action: "Window" },
  { keys: "T", action: "Text / label" },
  { keys: "Space (hold)", action: "Pan" },
  { keys: "L", action: "Lock / unlock selection" },
  { keys: "⌘/Ctrl + D", action: "Duplicate" },
  { keys: "⌘/Ctrl + Z", action: "Undo" },
  { keys: "⌘/Ctrl + Shift + Z", action: "Redo" },
  { keys: "⌘/Ctrl + 0", action: "Reset viewport" },
  { keys: "0", action: "Fit to screen" },
  { keys: "+ / −", action: "Zoom" },
  { keys: "Delete", action: "Delete selection" },
] as const;
