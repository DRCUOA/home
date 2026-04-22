/**
 * Floor plan geometry helpers.
 *
 * All functions operate in the editor's 0..1 normalized coordinate space.
 * The canvas renders a fixed 1000 × 1000 SVG viewBox that scales to the
 * visible area, so callers rarely need to think in pixels — the only
 * pixel-aware helper is snap-to-grid, which takes the current pixel-per-
 * normalized-unit factor so grid size stays visually stable across zooms.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Snap a normalized point to a grid whose cell size is `cellNormalized`. */
export function snapToGrid(p: Point, cellNormalized: number): Point {
  if (cellNormalized <= 0) return p;
  return {
    x: Math.round(p.x / cellNormalized) * cellNormalized,
    y: Math.round(p.y / cellNormalized) * cellNormalized,
  };
}

/**
 * Snap a point to the nearest significant feature (wall endpoint, wall
 * midpoint, wall line, object edge / corner / centerline) within `threshold`
 * (normalized). Returns the snapped point + a tag describing what we
 * snapped to, or null if nothing was close enough.
 */
export function snapToFeatures(
  p: Point,
  features: {
    walls: Segment[];
    rects: Rect[];
  },
  threshold: number
): { point: Point; kind: "endpoint" | "midpoint" | "edge" | "corner" | "center" } | null {
  let best: {
    point: Point;
    kind: "endpoint" | "midpoint" | "edge" | "corner" | "center";
    dist: number;
  } | null = null;

  const consider = (
    candidate: Point,
    kind: "endpoint" | "midpoint" | "edge" | "corner" | "center"
  ) => {
    const d = Math.hypot(candidate.x - p.x, candidate.y - p.y);
    if (d <= threshold && (!best || d < best.dist)) {
      best = { point: candidate, kind, dist: d };
    }
  };

  for (const w of features.walls) {
    consider({ x: w.x1, y: w.y1 }, "endpoint");
    consider({ x: w.x2, y: w.y2 }, "endpoint");
    consider({ x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 }, "midpoint");
    // Nearest point on wall line.
    const near = nearestOnSegment(p, w);
    consider(near, "edge");
  }

  for (const r of features.rects) {
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    // Corners
    consider({ x: r.x, y: r.y }, "corner");
    consider({ x: r.x + r.width, y: r.y }, "corner");
    consider({ x: r.x, y: r.y + r.height }, "corner");
    consider({ x: r.x + r.width, y: r.y + r.height }, "corner");
    // Center
    consider({ x: cx, y: cy }, "center");
    // Edge midpoints (centerlines)
    consider({ x: cx, y: r.y }, "midpoint");
    consider({ x: cx, y: r.y + r.height }, "midpoint");
    consider({ x: r.x, y: cy }, "midpoint");
    consider({ x: r.x + r.width, y: cy }, "midpoint");
  }

  return best;
}

/** Closest point on segment to p. */
export function nearestOnSegment(p: Point, seg: Segment): Point {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: seg.x1, y: seg.y1 };
  const t = Math.max(
    0,
    Math.min(1, ((p.x - seg.x1) * dx + (p.y - seg.y1) * dy) / len2)
  );
  return { x: seg.x1 + dx * t, y: seg.y1 + dy * t };
}

/** Length of a segment. */
export function segmentLength(s: Segment): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

/** Angle of a segment in degrees, normalized to -180..180. */
export function segmentAngle(s: Segment): number {
  return (Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI;
}

/** Given a free mouse position, constrain to the nearest 15° step from origin. */
export function constrainAngle(origin: Point, p: Point, stepDeg = 15): Point {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return p;
  const angle = Math.atan2(dy, dx);
  const step = (stepDeg * Math.PI) / 180;
  const snapped = Math.round(angle / step) * step;
  return { x: origin.x + Math.cos(snapped) * len, y: origin.y + Math.sin(snapped) * len };
}

/**
 * Auto-join a freshly drawn wall: if either endpoint is close to an existing
 * wall endpoint, snap to the existing endpoint. This is the "auto-join wall
 * corners" behavior from the spec. We only fuse to endpoints (not midpoints)
 * so T-joins remain user-intentional.
 */
export function autoJoinEndpoint(
  p: Point,
  existingWalls: Segment[],
  threshold: number
): Point {
  for (const w of existingWalls) {
    if (Math.hypot(p.x - w.x1, p.y - w.y1) <= threshold) return { x: w.x1, y: w.y1 };
    if (Math.hypot(p.x - w.x2, p.y - w.y2) <= threshold) return { x: w.x2, y: w.y2 };
  }
  return p;
}

/** Whether rect A fully contains point p. */
export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** Whether two rects intersect. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    b.x > a.x + a.width ||
    b.x + b.width < a.x ||
    b.y > a.y + a.height ||
    b.y + b.height < a.y
  );
}

/** Normalize a rect so width/height are positive. */
export function normalizeRect(r: Rect): Rect {
  return {
    x: r.width < 0 ? r.x + r.width : r.x,
    y: r.height < 0 ? r.y + r.height : r.y,
    width: Math.abs(r.width),
    height: Math.abs(r.height),
  };
}

/** Project a point onto a wall, returning the t parameter (0..1) along the
 *  wall, clamped. Used when placing a door or window on a wall. */
export function projectOntoWall(p: Point, wall: Segment): { t: number; point: Point } {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { t: 0, point: { x: wall.x1, y: wall.y1 } };
  const t = Math.max(
    0,
    Math.min(1, ((p.x - wall.x1) * dx + (p.y - wall.y1) * dy) / len2)
  );
  return { t, point: { x: wall.x1 + dx * t, y: wall.y1 + dy * t } };
}

/** Find the wall nearest to a point within `threshold`. Used for door/window
 *  placement. */
export function nearestWall(
  p: Point,
  walls: (Segment & { id: string })[],
  threshold: number
): (Segment & { id: string }) | null {
  let best: { w: Segment & { id: string }; d: number } | null = null;
  for (const w of walls) {
    const q = nearestOnSegment(p, w);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= threshold && (!best || d < best.d)) best = { w, d };
  }
  return best?.w ?? null;
}
