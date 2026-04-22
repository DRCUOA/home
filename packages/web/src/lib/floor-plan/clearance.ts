/**
 * Appliance / fixture clearance zones.
 *
 * Clearance is the space around an object that should stay unobstructed so
 * the object can actually be used — a fridge door has to swing open, a
 * stove needs pull-out room, a toilet needs elbow room. The zone is drawn
 * as a translucent halo around the sticker and used to flag placement
 * conflicts (overlaps with walls / other stickers).
 *
 * Values are in the editor's 0..1 normalized space, scaled against the
 * canvas. A typical floor plan canvas represents roughly 10–15 m of
 * real-world height, so 0.05 ≈ 50–75 cm.
 */
import type { MoveStickerKind } from "@hcc/shared";

/** Per-side clearance margins. If absent, the object has no clearance. */
export interface Clearance {
  /** Margin in normalized units added on the object's front-facing side. */
  front: number;
  back: number;
  left: number;
  right: number;
}

const FRONT_HEAVY: Clearance = { front: 0.055, back: 0.005, left: 0.01, right: 0.01 };
const PULLOUT: Clearance = { front: 0.05, back: 0.005, left: 0.015, right: 0.015 };
const SYMMETRIC_MEDIUM: Clearance = { front: 0.035, back: 0.035, left: 0.035, right: 0.035 };
const SYMMETRIC_SMALL: Clearance = { front: 0.02, back: 0.02, left: 0.02, right: 0.02 };

/** Return the clearance margins for a sticker kind, or null if none. */
export function clearanceForKind(kind: MoveStickerKind): Clearance | null {
  switch (kind) {
    case "fridge":
    case "oven":
    case "dishwasher":
    case "washer":
    case "dryer":
    case "pantry":
      return FRONT_HEAVY;
    case "stove":
    case "microwave":
      return PULLOUT;
    case "toilet":
    case "bathtub":
    case "shower":
    case "vanity":
      return SYMMETRIC_SMALL;
    case "door":
    case "door_double":
    case "sliding_door":
    case "garage_door":
      // Swing arc already drawn, but we still add a modest pull zone so
      // furniture doesn't overlap the swept space.
      return { front: 0.05, back: 0.005, left: 0.02, right: 0.02 };
    case "bed":
    case "bunk_bed":
    case "crib":
      return SYMMETRIC_MEDIUM;
    case "piano":
      return SYMMETRIC_SMALL;
    default:
      return null;
  }
}

/** The 0..1 axis-aligned bounding rect that represents the sticker + its
 *  clearance zone, ignoring rotation (the overlay is approximate — the
 *  clearance rectangle is drawn in the sticker's own rotated frame but the
 *  bounding box used for conflict detection uses the AABB of the expanded
 *  rotated rect). */
export function clearanceBounds(
  rect: { x: number; y: number; width: number; height: number; rotation: number },
  margins: Clearance
): { x: number; y: number; width: number; height: number } {
  // The "front" of a sticker is defined as +y in local space (bottom edge).
  // To get the world-aligned bounding box, we expand the rect by the
  // largest margin in each direction — a pessimistic bound that's always
  // safe for conflict tests even under rotation.
  const worstX = Math.max(margins.left, margins.right, margins.front, margins.back);
  const worstY = Math.max(margins.left, margins.right, margins.front, margins.back);
  return {
    x: rect.x - worstX,
    y: rect.y - worstY,
    width: rect.width + worstX * 2,
    height: rect.height + worstY * 2,
  };
}

/** Rects intersect test — simple AABB. Used for conflict detection. */
export function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    b.x >= a.x + a.width ||
    b.x + b.width <= a.x ||
    b.y >= a.y + a.height ||
    b.y + b.height <= a.y
  );
}

/** Does a segment cross a rectangle (either endpoint inside, or it
 *  intersects any of the four edges)? Used to flag clearance zones that
 *  overlap walls. */
export function segmentCrossesRect(
  seg: { x1: number; y1: number; x2: number; y2: number },
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  const inside = (x: number, y: number) =>
    x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  if (inside(seg.x1, seg.y1) || inside(seg.x2, seg.y2)) return true;
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [
    { x1: rect.x, y1: rect.y, x2: rect.x + rect.width, y2: rect.y },
    { x1: rect.x + rect.width, y1: rect.y, x2: rect.x + rect.width, y2: rect.y + rect.height },
    { x1: rect.x + rect.width, y1: rect.y + rect.height, x2: rect.x, y2: rect.y + rect.height },
    { x1: rect.x, y1: rect.y + rect.height, x2: rect.x, y2: rect.y },
  ];
  for (const e of edges) {
    if (segmentsIntersect(seg, e)) return true;
  }
  return false;
}

function segmentsIntersect(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number }
): boolean {
  const d = (a.x2 - a.x1) * (b.y2 - b.y1) - (a.y2 - a.y1) * (b.x2 - b.x1);
  if (d === 0) return false;
  const t = ((b.x1 - a.x1) * (b.y2 - b.y1) - (b.y1 - a.y1) * (b.x2 - b.x1)) / d;
  const u = ((b.x1 - a.x1) * (a.y2 - a.y1) - (b.y1 - a.y1) * (a.x2 - a.x1)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
