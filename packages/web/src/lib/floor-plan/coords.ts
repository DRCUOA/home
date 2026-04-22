/**
 * Coordinate transforms for the floor plan canvas.
 *
 * Model space is 0..1 normalized. The SVG uses a fixed 1000x1000 viewBox
 * that preserveAspectRatio="none" stretches into the available area.
 *
 * The viewport (zoom + panX + panY) is applied as an outer SVG <g>
 * transform. Helpers here convert between:
 *
 *   client (px)  →  normalized  →  viewBox (0..1000)
 *   viewBox (0..1000)  →  normalized  →  client (px)
 */

import type { FloorPlanViewport } from "@hcc/shared";

export interface CanvasSize {
  width: number;
  height: number;
}

/** Convert a mouse/pointer client event into a normalized 0..1 point,
 *  accounting for the current viewport transform (zoom + pan). */
export function clientToNormalized(
  clientX: number,
  clientY: number,
  svgRect: DOMRect,
  viewport: FloorPlanViewport
): { x: number; y: number } {
  const localX = (clientX - svgRect.left) / svgRect.width;
  const localY = (clientY - svgRect.top) / svgRect.height;
  // Invert the viewport transform.
  const x = (localX - viewport.panX) / viewport.zoom;
  const y = (localY - viewport.panY) / viewport.zoom;
  return { x, y };
}

/** Forward transform used in SVG children. */
export function viewportTransform(viewport: FloorPlanViewport): string {
  return `translate(${viewport.panX * 1000}, ${viewport.panY * 1000}) scale(${viewport.zoom})`;
}

/** Convert a normalized dimension to real-world meters, using the viewport's
 *  scale calibration. */
export function normalizedToMeters(
  normalizedLength: number,
  realWorldHeightMeters: number
): number {
  return normalizedLength * realWorldHeightMeters;
}

/** Render a dimension label in the user's preferred unit. */
export function formatDimension(
  normalizedLength: number,
  viewport: FloorPlanViewport,
  opts: { precision?: number } = {}
): string {
  const meters = normalizedToMeters(normalizedLength, viewport.realWorldHeightMeters);
  const precision = opts.precision ?? 2;
  if (viewport.unit === "imperial") {
    const totalInches = meters * 39.3701;
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches - feet * 12;
    return `${feet}'${inches.toFixed(precision - 1)}"`;
  }
  if (meters < 1) {
    return `${(meters * 100).toFixed(0)} cm`;
  }
  return `${meters.toFixed(precision)} m`;
}

/** The grid cell size expressed as a fraction of normalized space, given
 *  the current canvas pixel size. 40px grid on a 1000px canvas = 0.04 in
 *  normalized space. */
export function gridCellNormalized(
  gridPx: number,
  canvasSize: CanvasSize,
  viewport: FloorPlanViewport
): number {
  // Reference against the shorter canvas edge so grid is square regardless
  // of aspect ratio.
  const shorter = Math.min(canvasSize.width, canvasSize.height);
  if (shorter <= 0 || viewport.zoom <= 0) return 0.04;
  return gridPx / (shorter * viewport.zoom);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
