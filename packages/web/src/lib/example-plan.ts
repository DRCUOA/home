/**
 * Example floor plan fixture.
 *
 * Used as the DEFAULT VIEW on the moving plans tab when a user has not
 * yet drawn their own plan (no rooms, no stickers, no uploaded image).
 *
 * The layout is a simple 4-room home with doors, windows, and a handful
 * of furniture stickers. Users can preview it in-place and click
 * "Save as my plan" to clone these rooms + stickers into real records
 * they own and can freely rename, move, or delete.
 *
 * Coordinates are normalized to 0..1 relative to the plan canvas, so the
 * example renders at any viewport size.
 */

import type { MoveStickerKind } from "@hcc/shared";

export interface ExampleRoom {
  name: string;
  color: string;
  /** Legacy polygon — unused by new renderers but kept so the "save as
   *  my plan" flow can still populate the legacy column for anyone on
   *  an older client that hasn't refreshed the bundle. */
  polygon: { x: number; y: number }[];
  /** Sticker-compatible rectangle geometry. The floor-plan editor now
   *  treats rooms as special stickers — same move/resize/rotate UX. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ExampleSticker {
  kind: MoveStickerKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label?: string;
}

/** Rectangle helper — returns 5-point open polyline that visually closes. */
const rect = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number }[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
  { x: x1, y: y1 },
];

/** Rect helper — same bounding box as the `rect` polyline, expressed as
 *  the x/y/width/height/rotation tuple the editor now uses directly. */
const rectBox = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number; width: number; height: number; rotation: number } => ({
  x: x1,
  y: y1,
  width: x2 - x1,
  height: y2 - y1,
  rotation: 0,
});

export const EXAMPLE_ROOMS: ExampleRoom[] = [
  {
    name: "Kitchen",
    color: "#f59e0b",
    polygon: rect(0.06, 0.09, 0.48, 0.40),
    ...rectBox(0.06, 0.09, 0.48, 0.40),
  },
  {
    name: "Bedroom",
    color: "#8b5cf6",
    polygon: rect(0.52, 0.09, 0.94, 0.40),
    ...rectBox(0.52, 0.09, 0.94, 0.40),
  },
  {
    name: "Living room",
    color: "#10b981",
    polygon: rect(0.06, 0.44, 0.55, 0.91),
    ...rectBox(0.06, 0.44, 0.55, 0.91),
  },
  {
    name: "Bathroom",
    color: "#06b6d4",
    polygon: rect(0.60, 0.44, 0.94, 0.63),
    ...rectBox(0.60, 0.44, 0.94, 0.63),
  },
  {
    name: "Bedroom 2",
    color: "#ec4899",
    polygon: rect(0.60, 0.67, 0.94, 0.91),
    ...rectBox(0.60, 0.67, 0.94, 0.91),
  },
];

export const EXAMPLE_STICKERS: ExampleSticker[] = [
  // --- Doors ---
  { kind: "door", x: 0.28, y: 0.89, width: 0.06, height: 0.04, rotation: 0, label: "Front" },
  { kind: "door", x: 0.46, y: 0.20, width: 0.04, height: 0.05, rotation: 90 },
  { kind: "door", x: 0.58, y: 0.52, width: 0.04, height: 0.05, rotation: 90 },
  { kind: "door", x: 0.58, y: 0.76, width: 0.04, height: 0.05, rotation: 90 },
  { kind: "door", x: 0.28, y: 0.42, width: 0.06, height: 0.04, rotation: 0 },

  // --- Windows ---
  { kind: "window", x: 0.15, y: 0.07, width: 0.10, height: 0.02, rotation: 0 },
  { kind: "window", x: 0.70, y: 0.07, width: 0.10, height: 0.02, rotation: 0 },
  { kind: "window", x: 0.04, y: 0.60, width: 0.02, height: 0.10, rotation: 0 },
  { kind: "window", x: 0.94, y: 0.78, width: 0.02, height: 0.08, rotation: 0 },

  // --- Kitchen ---
  { kind: "fridge", x: 0.09, y: 0.12, width: 0.06, height: 0.06, rotation: 0 },
  { kind: "stove", x: 0.17, y: 0.12, width: 0.06, height: 0.06, rotation: 0 },
  { kind: "sink", x: 0.25, y: 0.12, width: 0.06, height: 0.05, rotation: 0 },

  // --- Bedroom ---
  { kind: "bed", x: 0.60, y: 0.13, width: 0.12, height: 0.14, rotation: 0, label: "Queen" },

  // --- Living room ---
  { kind: "sofa", x: 0.12, y: 0.76, width: 0.22, height: 0.08, rotation: 0 },
  { kind: "table", x: 0.18, y: 0.60, width: 0.14, height: 0.09, rotation: 0, label: "Coffee" },
  { kind: "plant", x: 0.42, y: 0.50, width: 0.06, height: 0.06, rotation: 0 },

  // --- Bathroom ---
  { kind: "toilet", x: 0.63, y: 0.47, width: 0.05, height: 0.07, rotation: 0 },
  { kind: "bathtub", x: 0.75, y: 0.47, width: 0.15, height: 0.08, rotation: 0 },
  { kind: "sink", x: 0.70, y: 0.57, width: 0.06, height: 0.04, rotation: 0 },

  // --- Bedroom 2 ---
  { kind: "bed", x: 0.64, y: 0.72, width: 0.12, height: 0.13, rotation: 0, label: "Single" },
  { kind: "desk", x: 0.82, y: 0.70, width: 0.10, height: 0.06, rotation: 0 },
];
