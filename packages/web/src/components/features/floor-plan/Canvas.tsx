/**
 * Floor Plan Designer — Canvas.
 *
 * Renders the drawing surface:
 *   - Optional image underlay.
 *   - Adjustable grid overlay.
 *   - Rooms (from the moving workflow's MoveRoom rows).
 *   - Walls, openings, annotations (from the client-side FloorPlanDocument).
 *   - Stickers (from the moving workflow's MoveSticker rows).
 *   - Selection handles, rotation handle, marquee, snap guides.
 *
 * Zoom/pan are implemented via a viewBox offset + outer <g> transform so
 * coordinate math stays trivial: children of the world <g> always work in
 * the 0..1000 viewBox space that maps 1:1 to normalized 0..1.
 *
 * Pointer model:
 *   - Select tool: click to select, shift-click to extend, drag empty for
 *     marquee, drag on object to move, corner handles resize, top handle
 *     rotates (shift → 15° increments).
 *   - Wall tool: click-click to draw, Esc cancels, Enter finishes a chain,
 *     Shift constrains to 15°, auto-join endpoints within 0.02 threshold.
 *   - Room-rect tool: click-drag to draw, release to commit.
 *   - Pan: spacebar held OR pan tool active → drag translates viewport.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  FloorPlanAnnotation,
  FloorPlanOpening,
  FloorPlanWall,
  MoveRoom,
  MoveSticker,
  MoveStickerKind,
} from "@hcc/shared";
import {
  MOVE_STICKER_LABELS,
} from "@hcc/shared";
import { StickerGlyph } from "../sticker-icons";
import { useFloorPlanStore } from "@/stores/floor-plan";
import {
  autoJoinEndpoint,
  computeAlignmentGuides,
  constrainAngle,
  nearestWall,
  normalizeRect,
  projectOntoWall,
  segmentLength,
  snapToFeatures,
  snapToGrid,
  type Point,
  type Rect,
} from "@/lib/floor-plan/geometry";
import {
  clearanceBounds,
  clearanceForKind,
  rectsOverlap,
  segmentCrossesRect,
} from "@/lib/floor-plan/clearance";
import {
  clientToNormalized,
  formatDimension,
  gridCellNormalized,
} from "@/lib/floor-plan/coords";
import { cn } from "@/lib/cn";

interface RectLike {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Clipboard entry — discriminated union across every selectable kind so
 *  Cmd+V can dispatch the right creation path per item. Each variant stores
 *  a snapshot of the source sufficient to reconstruct a fresh copy (ids
 *  regenerated, coordinates offset, parent relationships preserved). */
type ClipboardItem =
  | { kind: "wall"; snapshot: MoveWallSnapshot }
  | { kind: "opening"; snapshot: FloorPlanOpening }
  | { kind: "annotation"; snapshot: FloorPlanAnnotation }
  | { kind: "room"; snapshot: MoveRoom }
  | { kind: "sticker"; snapshot: MoveSticker };

// Local alias — walls use a generated `id` but we carry the full shape for
// symmetry with openings/annotations when pasting (new id + offset coords).
type MoveWallSnapshot = FloorPlanWall;

interface Props {
  imageUrl: string | null;
  rooms: MoveRoom[];
  stickers: MoveSticker[];
  onCreateRoomRect: (r: { x: number; y: number; width: number; height: number }) => void;
  /** Fires when a polygon-tool draft closes. Points are in 0..1. */
  onCreateRoomPolygon: (points: { x: number; y: number }[]) => void;
  onUpdateRoom: (id: string, patch: Partial<MoveRoom>) => void;
  onDeleteRooms: (ids: string[]) => void;
  onCreateSticker: (partial: {
    kind: MoveStickerKind;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    label?: string;
  }) => void;
  onUpdateSticker: (id: string, patch: Partial<MoveSticker>) => void;
  onDeleteStickers: (ids: string[]) => void;
  /** Clone a room with the given offset applied to its coordinates. Called
   *  by copy/paste; EditorShell forwards this to `onCreateRoom` preserving
   *  name/color/polygon/rotation. */
  onDuplicateRoom: (source: MoveRoom, offset: { dx: number; dy: number }) => void;
  /** Clone a sticker with the given offset applied. Preserves kind, size,
   *  rotation, color, label. */
  onDuplicateSticker: (
    source: MoveSticker,
    offset: { dx: number; dy: number }
  ) => void;
  /** Raise selection to parent so Properties panel can display. */
  onSelectionChange: (
    kind: "room" | "sticker" | "wall" | "opening" | "annotation" | "none",
    ids: string[]
  ) => void;
}

const VIEWBOX = 1000;
const AUTOJOIN = 0.02;
const SNAP_THRESHOLD = 0.015;

// "Default" stored colors that should track the active theme instead of being
// drawn literally. When a wall / room / sticker has its color unset — or has
// one of these historical default values — we render it with CSS
// `currentColor`, which resolves to charcoal in light mode and off-white in
// dark mode via a Tailwind text class on the SVG root. User-picked custom
// colors pass through untouched so people's deliberate styling is preserved.
const DEFAULT_WALL_COLOR = "#0f172a";
const DEFAULT_ROOM_COLOR = "#8b5cf6";

function outlineColor(stored: string | null | undefined, def: string): string {
  if (!stored) return "currentColor";
  const normalized = stored.toLowerCase();
  if (normalized === def.toLowerCase()) return "currentColor";
  return stored;
}

function roomRect(room: MoveRoom): RectLike {
  if (room.width && room.width > 0) {
    return {
      id: room.id,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
      rotation: room.rotation ?? 0,
    };
  }
  if (room.polygon && room.polygon.length >= 2) {
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      id: room.id,
      x: minX,
      y: minY,
      width: Math.max(0.05, maxX - minX),
      height: Math.max(0.05, maxY - minY),
      rotation: 0,
    };
  }
  return { id: room.id, x: 0.35, y: 0.4, width: 0.3, height: 0.25, rotation: 0 };
}

export function FloorPlanCanvasInner({
  imageUrl,
  rooms,
  stickers,
  onCreateRoomRect,
  onCreateRoomPolygon,
  onUpdateRoom,
  onDeleteRooms,
  onCreateSticker,
  onUpdateSticker,
  onDeleteStickers,
  onDuplicateRoom,
  onDuplicateSticker,
  onSelectionChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Copy/paste clipboard — held in a ref rather than the zustand store
  // because it never participates in rendering and doesn't need to survive a
  // canvas remount. Each entry is a snapshot of the item at the time of
  // copy; paste creates fresh ids and offsets coordinates.
  //
  // `pasteCount` is incremented on every Cmd+V so repeated pastes fan out
  // rather than stacking on top of each other.
  const clipboardRef = useRef<{
    items: ClipboardItem[];
    pasteCount: number;
  } | null>(null);

  const viewport = useFloorPlanStore((s) => s.viewport);
  const setViewport = useFloorPlanStore((s) => s.setViewport);
  const activeTool = useFloorPlanStore((s) => s.activeTool);
  const setTool = useFloorPlanStore((s) => s.setTool);
  const setDraft = useFloorPlanStore((s) => s.setDraft);
  const draft = useFloorPlanStore((s) => s.draft);
  const walls = useFloorPlanStore((s) => s.doc.walls);
  const addWall = useFloorPlanStore((s) => s.addWall);
  const deleteWalls = useFloorPlanStore((s) => s.deleteWalls);
  const openings = useFloorPlanStore((s) => s.doc.openings);
  const addOpening = useFloorPlanStore((s) => s.addOpening);
  const deleteOpenings = useFloorPlanStore((s) => s.deleteOpenings);
  const annotations = useFloorPlanStore((s) => s.doc.annotations);
  const addAnnotation = useFloorPlanStore((s) => s.addAnnotation);
  const deleteAnnotations = useFloorPlanStore((s) => s.deleteAnnotations);
  const selectedIds = useFloorPlanStore((s) => s.selectedIds);
  const selectionKind = useFloorPlanStore((s) => s.selectionKind);
  const select = useFloorPlanStore((s) => s.select);
  const clearSelection = useFloorPlanStore((s) => s.clearSelection);
  const layers = useFloorPlanStore((s) => s.doc.layers);
  const styles = useFloorPlanStore((s) => s.doc.styles);
  const beginBatch = useFloorPlanStore((s) => s.beginBatch);
  const endBatch = useFloorPlanStore((s) => s.endBatch);

  // Local canvas size for grid calculation.
  const [size, setSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gridCell = useMemo(
    () => gridCellNormalized(viewport.gridSizePx, size, viewport),
    [viewport, size]
  );

  const layerById = useMemo(() => {
    const m = new Map<string, (typeof layers)[number]>();
    for (const l of layers) m.set(l.id, l);
    return m;
  }, [layers]);

  /** For each sticker that has clearance enabled, precompute the zone's
   *  bounding rect + whether it conflicts with any other sticker, wall,
   *  or room. The rendering layer below reads from this map. Computed in
   *  a memo so we avoid recomputing per-sticker on every pointer move. */
  const clearanceInfo = useMemo(() => {
    const entries = new Map<
      string,
      {
        zone: { x: number; y: number; width: number; height: number };
        conflict: boolean;
        conflictReason: string | null;
      }
    >();
    // Collect the clearance rect for every sticker that opts in.
    const zones: { id: string; rect: { x: number; y: number; width: number; height: number } }[] = [];
    for (const s of stickers) {
      const st = styles[s.id];
      if (!st?.clearanceZone) continue;
      const margins = clearanceForKind(s.kind as MoveStickerKind);
      if (!margins) continue;
      const zone = clearanceBounds(
        { x: s.x, y: s.y, width: s.width, height: s.height, rotation: s.rotation },
        margins
      );
      zones.push({ id: s.id, rect: zone });
    }
    for (const { id, rect } of zones) {
      let conflict = false;
      let reason: string | null = null;
      // Zone-to-sticker overlap (excluding the owner).
      for (const s of stickers) {
        if (s.id === id) continue;
        if (
          rectsOverlap(rect, {
            x: s.x,
            y: s.y,
            width: s.width,
            height: s.height,
          })
        ) {
          conflict = true;
          reason = "Overlaps another object";
          break;
        }
      }
      // Zone-to-wall crossing (walls are line segments).
      if (!conflict) {
        for (const w of walls) {
          if (w.hidden) continue;
          if (segmentCrossesRect({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }, rect)) {
            conflict = true;
            reason = "Blocked by wall";
            break;
          }
        }
      }
      entries.set(id, { zone: rect, conflict, conflictReason: reason });
    }
    return entries;
  }, [stickers, styles, walls]);

  /* ---------- pointer to normalized coords ---------- */

  const toLocal = useCallback(
    (clientX: number, clientY: number): Point => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      return clientToNormalized(clientX, clientY, svg.getBoundingClientRect(), viewport);
    },
    [viewport]
  );

  /** Apply grid + feature snap to a point. Returns both the snapped point
   *  and a tag describing what we snapped to (used for visual guides). */
  const snap = useCallback(
    (
      p: Point,
      opts: { ignoreWallIds?: Set<string> } = {}
    ): { point: Point; guide: string | null } => {
      let out = p;
      let guide: string | null = null;
      if (viewport.snapToObjects) {
        const wallSegs = walls
          .filter((w) => !opts.ignoreWallIds?.has(w.id))
          .map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }));
        const rects = rooms.map(roomRect).map((r) => ({
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        }));
        const hit = snapToFeatures(out, { walls: wallSegs, rects }, SNAP_THRESHOLD);
        if (hit) {
          out = hit.point;
          guide = hit.kind;
        }
      }
      if (viewport.snapToGrid) {
        out = snapToGrid(out, gridCell);
        guide = guide ?? "grid";
      }
      return { point: out, guide };
    },
    [walls, rooms, gridCell, viewport.snapToGrid, viewport.snapToObjects]
  );

  /* ---------- selection + drag state ---------- */

  type DragKind =
    | { type: "move"; targetKind: "sticker" | "room"; id: string; startMouse: Point; startRect: RectLike }
    | { type: "resize"; targetKind: "sticker" | "room"; id: string; anchor: Point; startMouse: Point; startRect: RectLike; corner: "tl" | "tr" | "bl" | "br" }
    | { type: "rotate"; targetKind: "sticker" | "room"; id: string; centre: Point; startAngle: number; startRotation: number }
    | { type: "pan"; startMouse: Point; startPan: Point }
    | { type: "marquee"; startMouse: Point }
    | null;
  const dragRef = useRef<DragKind>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [snapGuide, setSnapGuide] = useState<{ p: Point; kind: string } | null>(null);
  // Opening-placement preview: the wall + t position the cursor would
  // snap to when the door/window tool is active. Pure UI state — does not
  // enter the undo stack until the user clicks to commit.
  const [openingPreview, setOpeningPreview] = useState<
    | { wallId: string; t: number; point: Point; kind: "door" | "window" }
    | null
  >(null);
  // Smart-alignment guide lines rendered during move/resize drags. Each
  // entry is either an x (vertical guide) or y (horizontal guide) in 0..1.
  const [alignGuides, setAlignGuides] = useState<{
    vertical: number[];
    horizontal: number[];
  } | null>(null);

  // Selection helpers.
  const selectOne = (
    kind: "room" | "sticker" | "wall" | "opening" | "annotation",
    id: string
  ) => {
    select([id], kind);
    onSelectionChange(kind, [id]);
  };

  const clearSel = () => {
    clearSelection();
    onSelectionChange("none", []);
  };

  /* ---------- spacebar pan ---------- */
  const [spaceDown, setSpaceDown] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* ---------- wheel zoom ---------- */
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) {
      // Treat pinch / trackpad two-finger as zoom only when modifier held,
      // otherwise pan. This matches Figma / Miro conventions.
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        // Scroll = zoom at the pointer, not translate.
      }
    }
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const localX = (e.clientX - rect.left) / rect.width;
    const localY = (e.clientY - rect.top) / rect.height;
    const newZoom = Math.max(0.25, Math.min(6, viewport.zoom * factor));
    // Keep the point under the cursor stable.
    const newPanX = localX - (localX - viewport.panX) * (newZoom / viewport.zoom);
    const newPanY = localY - (localY - viewport.panY) * (newZoom / viewport.zoom);
    setViewport({ zoom: newZoom, panX: newPanX, panY: newPanY });
  };

  /* ---------- pointer handlers ---------- */

  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = toLocal(e.clientX, e.clientY);
    const capture = (e.target as Element).setPointerCapture?.bind(e.target as Element);
    capture?.(e.pointerId);
    const panning = activeTool === "pan" || spaceDown;
    if (panning) {
      dragRef.current = {
        type: "pan",
        startMouse: p,
        startPan: { x: viewport.panX, y: viewport.panY },
      };
      return;
    }
    if (activeTool === "wall") {
      const snapped = snap(p);
      const joined = autoJoinEndpoint(snapped.point, walls, AUTOJOIN);
      setDraft({ type: "wall", x1: joined.x, y1: joined.y, x2: joined.x, y2: joined.y });
      return;
    }
    if (activeTool === "room-rect") {
      const snapped = snap(p).point;
      setDraft({ type: "room-rect", x: snapped.x, y: snapped.y, width: 0, height: 0 });
      return;
    }
    if (activeTool === "door" || activeTool === "window") {
      // Place an opening on the nearest wall. Recompute — the hover-move
      // handler might not have fired yet (first click after tool switch).
      const hit = nearestWall(
        p,
        walls.map((w) => ({ id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })),
        0.05
      );
      if (!hit) return;
      const { t } = projectOntoWall(p, {
        x1: hit.x1,
        y1: hit.y1,
        x2: hit.x2,
        y2: hit.y2,
      });
      const kind = activeTool === "door" ? "door" : "window";
      // Opening width defaults: doors 0.08 (≈80 cm), windows 0.10.
      // Expressed as a fraction of wall length so it follows resizing.
      const wallLen = segmentLength({
        x1: hit.x1,
        y1: hit.y1,
        x2: hit.x2,
        y2: hit.y2,
      });
      const absWidth = kind === "door" ? 0.08 : 0.1;
      const widthFraction = wallLen > 0 ? Math.min(0.9, absWidth / wallLen) : 0.25;
      addOpening({
        wallId: hit.id,
        kind,
        t,
        width: widthFraction,
        swing: kind === "door" ? "right" : "none",
        layerId: kind === "door" ? "walls" : "walls",
        locked: false,
        hidden: false,
      });
      // Stay in tool to allow multi-placement — user can hit Esc / switch.
      return;
    }
    if (activeTool === "dimension") {
      const snapped = snap(p).point;
      if (draft?.type === "dimension" && draft.placed) {
        // Second click — commit the dimension as an annotation.
        addAnnotation({
          kind: "dimension",
          x: draft.x1,
          y: draft.y1,
          x2: snapped.x,
          y2: snapped.y,
          fontSizePx: 12,
          bold: false,
          color: "#0ea5e9",
          layerId: "annotations",
          locked: false,
          hidden: false,
        });
        setDraft(null);
        // Stay in dimension mode so users can drop another.
      } else {
        setDraft({
          type: "dimension",
          x1: snapped.x,
          y1: snapped.y,
          x2: snapped.x,
          y2: snapped.y,
          placed: true,
        });
      }
      return;
    }
    if (activeTool === "room-polygon") {
      const snapped = snap(p).point;
      // First click starts the polygon; subsequent clicks append a vertex.
      // Double-click (below, detached) closes. Enter (keydown) also closes.
      if (draft?.type === "room-polygon") {
        // If near the first vertex, close the polygon.
        const first = draft.points[0];
        const dx = snapped.x - first.x;
        const dy = snapped.y - first.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (draft.points.length >= 3 && dist < 0.02) {
          onCreateRoomPolygon(draft.points);
          setDraft(null);
          setTool("select");
          return;
        }
        setDraft({ type: "room-polygon", points: [...draft.points, snapped] });
      } else {
        setDraft({ type: "room-polygon", points: [snapped] });
      }
      return;
    }
    if (activeTool === "select") {
      // Start a marquee.
      dragRef.current = { type: "marquee", startMouse: p };
      setMarquee({ x: p.x, y: p.y, width: 0, height: 0 });
      if (!e.shiftKey) clearSel();
      return;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = toLocal(e.clientX, e.clientY);
    const drag = dragRef.current;
    if (drag) {
      if (drag.type === "pan") {
        setViewport({
          panX: drag.startPan.x + (p.x - drag.startMouse.x) * viewport.zoom,
          panY: drag.startPan.y + (p.y - drag.startMouse.y) * viewport.zoom,
        });
        return;
      }
      if (drag.type === "marquee") {
        const x = Math.min(drag.startMouse.x, p.x);
        const y = Math.min(drag.startMouse.y, p.y);
        const width = Math.abs(p.x - drag.startMouse.x);
        const height = Math.abs(p.y - drag.startMouse.y);
        setMarquee({ x, y, width, height });
        return;
      }
      if (drag.type === "move") {
        const snapped = snap(p).point;
        const dx = snapped.x - drag.startMouse.x;
        const dy = snapped.y - drag.startMouse.y;
        // Proposed post-move bounding rect; used to pull smart-alignment
        // guides against the other objects.
        const proposed: Rect = {
          x: clampSafe(drag.startRect.x + dx),
          y: clampSafe(drag.startRect.y + dy),
          width: drag.startRect.width,
          height: drag.startRect.height,
        };
        const others: Rect[] = [];
        for (const s of stickers) {
          if (drag.targetKind === "sticker" && s.id === drag.id) continue;
          others.push({ x: s.x, y: s.y, width: s.width, height: s.height });
        }
        for (const r of rooms) {
          if (drag.targetKind === "room" && r.id === drag.id) continue;
          const rc = roomRect(r);
          others.push({ x: rc.x, y: rc.y, width: rc.width, height: rc.height });
        }
        const guides = computeAlignmentGuides(proposed, others, 0.012);
        if (guides.vertical.length > 0 || guides.horizontal.length > 0) {
          setAlignGuides({
            vertical: guides.vertical.map((v) => v.x),
            horizontal: guides.horizontal.map((h) => h.y),
          });
        } else {
          setAlignGuides(null);
        }
        const patch = {
          x: clampSafe(proposed.x + guides.snapDeltaX),
          y: clampSafe(proposed.y + guides.snapDeltaY),
        };
        if (drag.targetKind === "sticker")
          onUpdateSticker(drag.id, patch as Partial<MoveSticker>);
        else onUpdateRoom(drag.id, patch as Partial<MoveRoom>);
        return;
      }
      if (drag.type === "resize") {
        const snapped = snap(p).point;
        const x = Math.min(drag.anchor.x, snapped.x);
        const y = Math.min(drag.anchor.y, snapped.y);
        const width = Math.max(0.02, Math.abs(snapped.x - drag.anchor.x));
        const height = Math.max(0.02, Math.abs(snapped.y - drag.anchor.y));
        const patch = { x, y, width, height };
        if (drag.targetKind === "sticker")
          onUpdateSticker(drag.id, patch as Partial<MoveSticker>);
        else onUpdateRoom(drag.id, patch as Partial<MoveRoom>);
        return;
      }
      if (drag.type === "rotate") {
        const angle = (Math.atan2(p.y - drag.centre.y, p.x - drag.centre.x) * 180) / Math.PI;
        const delta = angle - drag.startAngle;
        let next = drag.startRotation + delta;
        if (e.shiftKey) next = Math.round(next / 15) * 15;
        next = (((next + 180) % 360) + 360) % 360 - 180;
        if (drag.targetKind === "sticker")
          onUpdateSticker(drag.id, { rotation: next });
        else onUpdateRoom(drag.id, { rotation: next });
        return;
      }
    }

    // In-progress draft updates.
    if (draft?.type === "wall") {
      let end = snap(p).point;
      if (e.shiftKey)
        end = constrainAngle({ x: draft.x1, y: draft.y1 }, end, 15);
      const joined = autoJoinEndpoint(end, walls, AUTOJOIN);
      setDraft({ ...draft, x2: joined.x, y2: joined.y });
      setSnapGuide(snap(end).guide ? { p: joined, kind: snap(end).guide ?? "" } : null);
      return;
    }
    if (draft?.type === "room-rect") {
      const snapped = snap(p).point;
      setDraft({
        ...draft,
        width: snapped.x - draft.x,
        height: snapped.y - draft.y,
      });
      return;
    }
    if (draft?.type === "dimension" && draft.placed) {
      let end = snap(p).point;
      if (e.shiftKey) end = constrainAngle({ x: draft.x1, y: draft.y1 }, end, 15);
      setDraft({ ...draft, x2: end.x, y2: end.y });
      return;
    }

    // Door/window hover preview — snap the cursor to the nearest wall and
    // show a ghost gap at that location. Using nearestWall so a pointer can
    // be slightly off the wall and still lock on; threshold is generous
    // because walls are thin.
    if (activeTool === "door" || activeTool === "window") {
      const hit = nearestWall(
        p,
        walls.map((w) => ({ id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })),
        0.05
      );
      if (hit) {
        const { t, point } = projectOntoWall(p, {
          x1: hit.x1,
          y1: hit.y1,
          x2: hit.x2,
          y2: hit.y2,
        });
        setOpeningPreview({
          wallId: hit.id,
          t,
          point,
          kind: activeTool === "door" ? "door" : "window",
        });
      } else {
        setOpeningPreview(null);
      }
      return;
    }
    // Any other tool → clear a stale preview.
    if (openingPreview) setOpeningPreview(null);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag?.type === "marquee") {
      if (marquee && (marquee.width > 0.003 || marquee.height > 0.003)) {
        // Select stickers & rooms whose centers fall inside.
        const nm = normalizeRect(marquee);
        const hitSticker: string[] = [];
        for (const s of stickers) {
          const cx = s.x + s.width / 2;
          const cy = s.y + s.height / 2;
          if (cx >= nm.x && cx <= nm.x + nm.width && cy >= nm.y && cy <= nm.y + nm.height)
            hitSticker.push(s.id);
        }
        const hitRoom: string[] = [];
        for (const r of rooms) {
          const rc = roomRect(r);
          const cx = rc.x + rc.width / 2;
          const cy = rc.y + rc.height / 2;
          if (cx >= nm.x && cx <= nm.x + nm.width && cy >= nm.y && cy <= nm.y + nm.height)
            hitRoom.push(r.id);
        }
        if (hitSticker.length > 0 && hitRoom.length === 0) {
          select(hitSticker, "sticker");
          onSelectionChange("sticker", hitSticker);
        } else if (hitRoom.length > 0 && hitSticker.length === 0) {
          select(hitRoom, "room");
          onSelectionChange("room", hitRoom);
        } else if (hitSticker.length > 0 && hitRoom.length > 0) {
          select([...hitSticker, ...hitRoom], "mixed" as unknown as "room");
          // Keep primary panel on rooms when mixed.
          onSelectionChange("room", hitRoom);
        }
      }
      setMarquee(null);
    }

    if (drag?.type === "move" || drag?.type === "resize" || drag?.type === "rotate") {
      endBatch();
      setAlignGuides(null);
    }

    dragRef.current = null;

    // Commit drafts.
    if (draft?.type === "wall") {
      const len = segmentLength({ x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2 });
      if (len > 0.01) {
        addWall({
          x1: draft.x1,
          y1: draft.y1,
          x2: draft.x2,
          y2: draft.y2,
          thickness: 0.012,
          lineStyle: "solid",
          color: "#0f172a",
          layerId: "walls",
          locked: false,
          hidden: false,
        });
      }
      setDraft(null);
      setSnapGuide(null);
      // Keep the wall tool active so the user can chain.
      return;
    }
    if (draft?.type === "room-rect") {
      const r = normalizeRect({ x: draft.x, y: draft.y, width: draft.width, height: draft.height });
      if (r.width > 0.02 && r.height > 0.02) {
        onCreateRoomRect({ x: r.x, y: r.y, width: r.width, height: r.height });
      }
      setDraft(null);
      setTool("select");
    }
    void e;
  };

  /* ---------- start a sticker/room drag ---------- */
  const beginMove = (
    e: React.PointerEvent,
    kind: "sticker" | "room",
    rect: RectLike
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    selectOne(kind, rect.id);
    beginBatch();
    const p = toLocal(e.clientX, e.clientY);
    dragRef.current = {
      type: "move",
      targetKind: kind,
      id: rect.id,
      startMouse: snap(p).point,
      startRect: { ...rect },
    };
  };
  const beginResize = (
    e: React.PointerEvent,
    kind: "sticker" | "room",
    rect: RectLike,
    corner: "tl" | "tr" | "bl" | "br"
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const anchor = {
      x: corner === "tl" || corner === "bl" ? rect.x + rect.width : rect.x,
      y: corner === "tl" || corner === "tr" ? rect.y + rect.height : rect.y,
    };
    beginBatch();
    dragRef.current = {
      type: "resize",
      targetKind: kind,
      id: rect.id,
      anchor,
      startMouse: toLocal(e.clientX, e.clientY),
      startRect: { ...rect },
      corner,
    };
  };
  const beginRotate = (
    e: React.PointerEvent,
    kind: "sticker" | "room",
    rect: RectLike
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const p = toLocal(e.clientX, e.clientY);
    const angle = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI;
    beginBatch();
    dragRef.current = {
      type: "rotate",
      targetKind: kind,
      id: rect.id,
      centre: { x: cx, y: cy },
      startAngle: angle,
      startRotation: rect.rotation,
    };
  };

  /* ---------- drop-from-palette support ---------- */
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-floor-plan-sticker")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    const kind = e.dataTransfer.getData("application/x-floor-plan-sticker") as MoveStickerKind;
    if (!kind) return;
    e.preventDefault();
    const p = snap(toLocal(e.clientX, e.clientY)).point;
    onCreateSticker({
      kind,
      x: p.x - 0.05,
      y: p.y - 0.05,
      width: 0.1,
      height: 0.1,
      rotation: 0,
    });
  };

  /* ---------- copy / paste ---------- */

  // Gather a snapshot of whatever is currently selected. Returns an empty
  // array when there's no selection or the selection kind can't be
  // serialised (e.g. mixed).
  const snapshotSelection = useCallback((): ClipboardItem[] => {
    const ids = [...selectedIds];
    if (ids.length === 0) return [];
    switch (selectionKind) {
      case "wall": {
        const byId = new Map(walls.map((w) => [w.id, w]));
        return ids
          .map((id) => byId.get(id))
          .filter((w): w is FloorPlanWall => !!w)
          .map((w) => ({ kind: "wall" as const, snapshot: w }));
      }
      case "opening": {
        const byId = new Map(openings.map((o) => [o.id, o]));
        return ids
          .map((id) => byId.get(id))
          .filter((o): o is FloorPlanOpening => !!o)
          .map((o) => ({ kind: "opening" as const, snapshot: o }));
      }
      case "annotation": {
        const byId = new Map(annotations.map((a) => [a.id, a]));
        return ids
          .map((id) => byId.get(id))
          .filter((a): a is FloorPlanAnnotation => !!a)
          .map((a) => ({ kind: "annotation" as const, snapshot: a }));
      }
      case "room": {
        const byId = new Map(rooms.map((r) => [r.id, r]));
        return ids
          .map((id) => byId.get(id))
          .filter((r): r is MoveRoom => !!r)
          .map((r) => ({ kind: "room" as const, snapshot: r }));
      }
      case "sticker": {
        const byId = new Map(stickers.map((s) => [s.id, s]));
        return ids
          .map((id) => byId.get(id))
          .filter((s): s is MoveSticker => !!s)
          .map((s) => ({ kind: "sticker" as const, snapshot: s }));
      }
      default:
        return [];
    }
  }, [selectedIds, selectionKind, walls, openings, annotations, rooms, stickers]);

  const copySelection = useCallback(() => {
    const items = snapshotSelection();
    if (items.length === 0) return false;
    clipboardRef.current = { items, pasteCount: 0 };
    return true;
  }, [snapshotSelection]);

  // Standard offset applied on each paste (in normalized 0..1 units — ~2%
  // of the canvas). Multiplied by pasteCount so back-to-back Cmd+V presses
  // fan the copies out diagonally instead of piling them up on the same
  // spot.
  const PASTE_OFFSET_STEP = 0.02;

  // Keep x/y in [0, 1 - size] so the paste never lands off-canvas. If the
  // offset would push the object out, we clamp rather than cancelling the
  // paste — user still sees a copy, just not at the intended spot.
  const clampIntoCanvas = (
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    return {
      x: Math.max(0, Math.min(1 - width, x)),
      y: Math.max(0, Math.min(1 - height, y)),
    };
  };

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || clip.items.length === 0) return false;
    clip.pasteCount += 1;
    const dx = PASTE_OFFSET_STEP * clip.pasteCount;
    const dy = PASTE_OFFSET_STEP * clip.pasteCount;
    // Collect the ids of every freshly created item (walls/openings/
    // annotations) so we can select them afterwards. Rooms/stickers round-
    // trip through the server and their ids arrive asynchronously; leaving
    // them out of the post-paste selection matches the duplicate-sticker
    // UX that already ships.
    const newIds: string[] = [];
    let lastKind: typeof selectionKind = "none";
    for (const item of clip.items) {
      switch (item.kind) {
        case "wall": {
          const w = item.snapshot;
          // Shift both endpoints, then clamp the bounding box so the wall
          // doesn't walk off-canvas on repeated pastes.
          const minX = Math.min(w.x1, w.x2);
          const minY = Math.min(w.y1, w.y2);
          const maxX = Math.max(w.x1, w.x2);
          const maxY = Math.max(w.y1, w.y2);
          const clamped = clampIntoCanvas(
            minX + dx,
            minY + dy,
            maxX - minX,
            maxY - minY
          );
          const finalDx = clamped.x - minX;
          const finalDy = clamped.y - minY;
          const id = addWall({
            x1: w.x1 + finalDx,
            y1: w.y1 + finalDy,
            x2: w.x2 + finalDx,
            y2: w.y2 + finalDy,
            thickness: w.thickness,
            lineStyle: w.lineStyle,
            color: w.color,
            layerId: w.layerId,
            locked: false,
            hidden: w.hidden,
            label: w.label,
          });
          newIds.push(id);
          lastKind = "wall";
          break;
        }
        case "opening": {
          // Openings are parameterized along a wall — copying them is only
          // meaningful when the host wall still exists. If it's gone we
          // silently skip rather than surprising the user with a ghost.
          const o = item.snapshot;
          const host = walls.find((w) => w.id === o.wallId);
          if (!host) break;
          // Shift `t` so the clone sits next to the original on the same
          // wall. Clamp to keep the opening inside the wall's 0..1 range.
          const shift = 0.08 * clip.pasteCount;
          const newT = Math.max(
            o.width / 2,
            Math.min(1 - o.width / 2, o.t + shift)
          );
          const id = addOpening({
            kind: o.kind,
            wallId: o.wallId,
            t: newT,
            width: o.width,
            swing: o.swing,
            layerId: o.layerId,
            locked: false,
            hidden: o.hidden,
            label: o.label,
          });
          newIds.push(id);
          lastKind = "opening";
          break;
        }
        case "annotation": {
          const a = item.snapshot;
          const w = a.width ?? 0;
          const h = a.height ?? 0;
          const c = clampIntoCanvas(a.x + dx, a.y + dy, w, h);
          const id = addAnnotation({
            kind: a.kind,
            x: c.x,
            y: c.y,
            width: a.width,
            height: a.height,
            x2:
              a.x2 !== undefined
                ? a.x2 + (c.x - a.x)
                : undefined,
            y2:
              a.y2 !== undefined
                ? a.y2 + (c.y - a.y)
                : undefined,
            text: a.text,
            fontSizePx: a.fontSizePx,
            bold: a.bold,
            color: a.color,
            layerId: a.layerId,
            locked: false,
            hidden: a.hidden,
          });
          newIds.push(id);
          lastKind = "annotation";
          break;
        }
        case "room": {
          // Rooms round-trip through the server; the server assigns the id,
          // so we can't push it into `newIds`. The EditorShell duplicate
          // helper takes care of the sort_order/name dedup.
          onDuplicateRoom(item.snapshot, { dx, dy });
          break;
        }
        case "sticker": {
          onDuplicateSticker(item.snapshot, { dx, dy });
          break;
        }
      }
    }
    // Select the freshly-pasted client-side objects so the user can
    // immediately move them, nudge them, or paste again.
    if (newIds.length > 0 && lastKind !== "none") {
      select(newIds, lastKind);
    }
    return true;
  }, [
    addWall,
    addOpening,
    addAnnotation,
    onDuplicateRoom,
    onDuplicateSticker,
    select,
    walls,
  ]);

  const cutSelection = useCallback(() => {
    if (!copySelection()) return false;
    // Delete just like the Backspace handler would.
    if (selectionKind === "sticker") onDeleteStickers([...selectedIds]);
    else if (selectionKind === "room") onDeleteRooms([...selectedIds]);
    else if (selectionKind === "wall") deleteWalls([...selectedIds]);
    else if (selectionKind === "opening") deleteOpenings([...selectedIds]);
    else if (selectionKind === "annotation") deleteAnnotations([...selectedIds]);
    clearSel();
    return true;
  }, [
    copySelection,
    selectionKind,
    selectedIds,
    onDeleteStickers,
    onDeleteRooms,
    deleteWalls,
    deleteOpenings,
    deleteAnnotations,
    clearSel,
  ]);

  /* ---------- key handlers ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement | null)?.isContentEditable;
      if (typing) return;
      // Copy / cut / paste — Cmd on mac, Ctrl elsewhere. We check both so a
      // mac user plugged into a PC keyboard still gets the right shortcut.
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "c" || e.key === "C")) {
        if (copySelection()) e.preventDefault();
        return;
      }
      if (mod && (e.key === "x" || e.key === "X")) {
        if (cutSelection()) e.preventDefault();
        return;
      }
      if (mod && (e.key === "v" || e.key === "V")) {
        if (pasteClipboard()) e.preventDefault();
        return;
      }
      // Cmd+D duplicates the current selection without touching the
      // clipboard — same pattern Figma/Sketch use.
      if (mod && (e.key === "d" || e.key === "D")) {
        const items = snapshotSelection();
        if (items.length > 0) {
          clipboardRef.current = { items, pasteCount: 0 };
          pasteClipboard();
          e.preventDefault();
        }
        return;
      }
      if (e.key === "Escape") {
        if (draft) setDraft(null);
        else clearSel();
      } else if (e.key === "Enter") {
        // Commit an in-progress polygon draft with at least 3 vertices.
        if (draft?.type === "room-polygon" && draft.points.length >= 3) {
          e.preventDefault();
          onCreateRoomPolygon(draft.points);
          setDraft(null);
          setTool("select");
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectionKind === "sticker") onDeleteStickers([...selectedIds]);
        else if (selectionKind === "room") onDeleteRooms([...selectedIds]);
        else if (selectionKind === "wall") deleteWalls([...selectedIds]);
        else if (selectionKind === "opening") deleteOpenings([...selectedIds]);
        else if (selectionKind === "annotation")
          deleteAnnotations([...selectedIds]);
        clearSel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    draft,
    selectedIds,
    selectionKind,
    onDeleteStickers,
    onDeleteRooms,
    deleteWalls,
    deleteOpenings,
    deleteAnnotations,
    clearSel,
    setDraft,
    onCreateRoomPolygon,
    setTool,
    copySelection,
    cutSelection,
    pasteClipboard,
    snapshotSelection,
  ]);

  /* ---------- grid backdrop ---------- */
  const gridPx = viewport.gridSizePx * viewport.zoom;
  // Build a dashed-grid background as a tiled SVG data URI. Placing the
  // horizontal + vertical strokes at the top + left edges of each cell
  // means the pattern tiles into a continuous grid. We stroke at 1px
  // with a short dash so the lines read as "thin dashed" at any zoom.
  const buildGridBg = (
    color: string,
    cellPx: number,
    dash: string,
    opacity: number
  ): string => {
    const size = Math.max(2, cellPx);
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
      `<path d='M ${size} 0 L 0 0 L 0 ${size}' fill='none' stroke='${color}' stroke-width='1' stroke-dasharray='${dash}' opacity='${opacity}'/>` +
      `</svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  };
  const gridShared: React.CSSProperties = viewport.showGrid
    ? {
        backgroundSize: `${gridPx}px ${gridPx}px`,
        backgroundPosition: `${viewport.panX * size.width}px ${viewport.panY * size.height}px`,
      }
    : {};
  // Light mode: charcoal dashed grid lines on an off-white field.
  const lightGridStyle: React.CSSProperties = viewport.showGrid
    ? { ...gridShared, backgroundImage: buildGridBg("#1f2937", gridPx, "3 4", 0.55) }
    : {};
  // Dark mode: soft, low-contrast slate-500 dashes.
  const darkGridStyle: React.CSSProperties = viewport.showGrid
    ? { ...gridShared, backgroundImage: buildGridBg("#94a3b8", gridPx, "3 4", 0.28) }
    : {};

  /* ---------- render ---------- */
  const worldTransform = `translate(${viewport.panX * VIEWBOX} ${viewport.panY * VIEWBOX}) scale(${viewport.zoom})`;
  // Inverse zoom factor — UI chrome rendered inside the world <g> multiplies
  // its pixel-sized dimensions by `z` so it stays a constant visual size
  // regardless of zoom level. Content (walls, rooms, stickers, opening cuts,
  // clearance fills) intentionally scales with the world.
  const z = 1 / Math.max(viewport.zoom, 0.01);
  const da = (a: number, b: number) => `${a * z} ${b * z}`;

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 relative bg-slate-100 dark:bg-slate-950 overflow-hidden"
    >
      {/* Grid backdrop — two stacked divs, toggled by the dark-mode class.
          Light: charcoal dashes on off-white. Dark: soft grey dashes on a
          deep slate panel. */}
      <div className="absolute inset-0 bg-stone-50 dark:hidden" style={lightGridStyle} />
      <div
        className="absolute inset-0 hidden dark:block bg-slate-900"
        style={darkGridStyle}
      />

      {/* Image underlay */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none opacity-90"
          style={{
            transform: `translate(${viewport.panX * 100}%, ${viewport.panY * 100}%) scale(${viewport.zoom})`,
            transformOrigin: "top left",
          }}
        />
      )}

      {/* SVG drawing surface */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        preserveAspectRatio="none"
        onWheel={onWheel}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => {
          // Double-click closes an in-progress polygon (convention shared
          // with Figma / Illustrator's pen tool).
          if (draft?.type === "room-polygon" && draft.points.length >= 3) {
            onCreateRoomPolygon(draft.points);
            setDraft(null);
            setTool("select");
          }
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "absolute inset-0 w-full h-full touch-none",
          activeTool === "pan" || spaceDown ? "cursor-grab" : "",
          activeTool === "wall" ? "cursor-crosshair" : "",
          activeTool === "room-rect" ? "cursor-crosshair" : "",
          activeTool === "room-polygon" ? "cursor-crosshair" : "",
          activeTool === "door" || activeTool === "window"
            ? "cursor-crosshair"
            : "",
          // Theme-aware default outline color for shapes whose color isn't
          // customized. `currentColor` in SVG strokes/fills resolves to this
          // text color, so charcoal on light / off-white on dark flips cleanly.
          "text-slate-800 dark:text-stone-200"
        )}
      >
        <g transform={worldTransform}>
          {/* Walls */}
          {walls
            .filter((w) => !w.hidden && (layerById.get(w.layerId)?.visible ?? true))
            .map((w) => {
              const strokePx = Math.max(2, w.thickness * VIEWBOX);
              const dash =
                w.lineStyle === "dashed"
                  ? `${strokePx * 2} ${strokePx}`
                  : w.lineStyle === "dotted"
                    ? `${strokePx / 2} ${strokePx}`
                    : undefined;
              const selected = selectionKind === "wall" && selectedIds.has(w.id);
              return (
                <line
                  key={w.id}
                  x1={w.x1 * VIEWBOX}
                  y1={w.y1 * VIEWBOX}
                  x2={w.x2 * VIEWBOX}
                  y2={w.y2 * VIEWBOX}
                  stroke={selected ? "#0ea5e9" : outlineColor(w.color, DEFAULT_WALL_COLOR)}
                  strokeWidth={strokePx}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectOne("wall", w.id);
                  }}
                  style={{ cursor: "pointer" }}
                />
              );
            })}

          {/* Openings (doors/windows): rendered as wall cuts + swing arcs */}
          {openings
            .filter((o) => !o.hidden && (layerById.get(o.layerId)?.visible ?? true))
            .map((o) => {
              const wall = walls.find((w) => w.id === o.wallId);
              if (!wall) return null;
              const dx = wall.x2 - wall.x1;
              const dy = wall.y2 - wall.y1;
              const wallLen = Math.hypot(dx, dy);
              if (wallLen === 0) return null;
              const cx = wall.x1 + dx * o.t;
              const cy = wall.y1 + dy * o.t;
              // Opening half-width along the wall (in normalized units).
              const halfW = (o.width * wallLen) / 2;
              // Unit vectors along + perpendicular to the wall.
              const ux = dx / wallLen;
              const uy = dy / wallLen;
              const nx = -uy;
              const ny = ux;
              const ax = cx - ux * halfW;
              const ay = cy - uy * halfW;
              const bx = cx + ux * halfW;
              const by = cy + uy * halfW;
              const thickness = wall.thickness;
              // Opening footprint — a rectangle straddling the wall.
              const corners: [number, number][] = [
                [ax + nx * (thickness / 2), ay + ny * (thickness / 2)],
                [bx + nx * (thickness / 2), by + ny * (thickness / 2)],
                [bx - nx * (thickness / 2), by - ny * (thickness / 2)],
                [ax - nx * (thickness / 2), ay - ny * (thickness / 2)],
              ];
              const selected =
                selectionKind === "opening" && selectedIds.has(o.id);
              const isWindow = o.kind === "window";
              const isDoor =
                o.kind === "door" ||
                o.kind === "door_double" ||
                o.kind === "sliding_door" ||
                o.kind === "garage_door";
              const outline = selected
                ? "#0ea5e9"
                : outlineColor(wall.color, DEFAULT_WALL_COLOR);
              // Door swing arc: quarter-circle from the hinge.
              let arcPath: string | null = null;
              if (isDoor && o.swing && o.swing !== "none") {
                const openingWidth = o.width * wallLen;
                // Hinge is at one end of the opening; swing determines
                // whether it's the start (a) or end (b) and which side of
                // the wall the arc sits on.
                const hinge = o.swing === "left" ? { x: ax, y: ay } : { x: bx, y: by };
                const far = o.swing === "left" ? { x: bx, y: by } : { x: ax, y: ay };
                // Door panel endpoint — rotate `far` 90° around `hinge`
                // so the arc points "inward" (perpendicular to the wall).
                const vx = far.x - hinge.x;
                const vy = far.y - hinge.y;
                // Rotate +90° (perpendicular into +n direction).
                const pEndX = hinge.x - vy;
                const pEndY = hinge.y + vx;
                arcPath =
                  `M ${hinge.x * VIEWBOX} ${hinge.y * VIEWBOX} ` +
                  `L ${far.x * VIEWBOX} ${far.y * VIEWBOX} ` +
                  `A ${openingWidth * VIEWBOX} ${openingWidth * VIEWBOX} 0 0 ${o.swing === "left" ? 0 : 1} ${pEndX * VIEWBOX} ${pEndY * VIEWBOX} ` +
                  `L ${hinge.x * VIEWBOX} ${hinge.y * VIEWBOX}`;
              }
              return (
                <g
                  key={o.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectOne("opening", o.id);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {/* Cut out the wall — opaque background matching the
                      canvas, sized to the opening's wall footprint. */}
                  <polygon
                    points={corners
                      .map((c) => `${c[0] * VIEWBOX},${c[1] * VIEWBOX}`)
                      .join(" ")}
                    fill="white"
                    className="dark:fill-slate-900"
                  />
                  {/* Window glazing — a slim line through the middle. */}
                  {isWindow && (
                    <line
                      x1={ax * VIEWBOX}
                      y1={ay * VIEWBOX}
                      x2={bx * VIEWBOX}
                      y2={by * VIEWBOX}
                      stroke={outline}
                      strokeWidth={Math.max(2, thickness * VIEWBOX * 0.3)}
                    />
                  )}
                  {/* Opening jambs — short perpendicular strokes at the
                      opening's two ends, so the wall visually terminates. */}
                  <line
                    x1={(ax + nx * (thickness / 2)) * VIEWBOX}
                    y1={(ay + ny * (thickness / 2)) * VIEWBOX}
                    x2={(ax - nx * (thickness / 2)) * VIEWBOX}
                    y2={(ay - ny * (thickness / 2)) * VIEWBOX}
                    stroke={outline}
                    strokeWidth={Math.max(1.5, thickness * VIEWBOX * 0.4)}
                  />
                  <line
                    x1={(bx + nx * (thickness / 2)) * VIEWBOX}
                    y1={(by + ny * (thickness / 2)) * VIEWBOX}
                    x2={(bx - nx * (thickness / 2)) * VIEWBOX}
                    y2={(by - ny * (thickness / 2)) * VIEWBOX}
                    stroke={outline}
                    strokeWidth={Math.max(1.5, thickness * VIEWBOX * 0.4)}
                  />
                  {/* Door swing arc. */}
                  {arcPath && (
                    <path
                      d={arcPath}
                      fill={outline}
                      fillOpacity={selected ? 0.18 : 0.08}
                      stroke={outline}
                      strokeWidth={1.5}
                    />
                  )}
                </g>
              );
            })}

          {/* Rooms */}
          {rooms.map((room) => {
            const rect = roomRect(room);
            const isSelected = selectionKind === "room" && selectedIds.has(room.id);
            // Keep the soft purple wash for rooms that haven't been
            // customized — it's the category tint that says "this is a room"
            // — but let the *outline* and label track the theme.
            const fillColor = room.color || DEFAULT_ROOM_COLOR;
            const strokeColor = outlineColor(room.color, DEFAULT_ROOM_COLOR);
            return (
              <g
                key={room.id}
                transform={`translate(${rect.x * VIEWBOX}, ${rect.y * VIEWBOX}) rotate(${rect.rotation} ${rect.width * 500} ${rect.height * 500})`}
              >
                <rect
                  x={0}
                  y={0}
                  width={rect.width * VIEWBOX}
                  height={rect.height * VIEWBOX}
                  fill={fillColor}
                  fillOpacity={isSelected ? 0.22 : 0.14}
                  stroke={strokeColor}
                  strokeOpacity={0.9}
                  strokeWidth={isSelected ? 4 : 3}
                  strokeDasharray={isSelected ? undefined : "6 4"}
                  rx={6}
                  ry={6}
                  style={{ cursor: "move" }}
                  onPointerDown={(e) => beginMove(e, "room", rect)}
                />
                <text
                  x={rect.width * 500}
                  y={rect.height * 500}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-slate-800 dark:fill-stone-200 stroke-white dark:stroke-slate-900"
                  fontSize={Math.max(14, Math.min(30, rect.height * VIEWBOX * 0.15))}
                  fontWeight={700}
                  paintOrder="stroke"
                  strokeWidth={4}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {room.name}
                </text>
                {isSelected && (
                  <SelectionHandles
                    width={rect.width * VIEWBOX}
                    height={rect.height * VIEWBOX}
                    color={strokeColor}
                    zoom={viewport.zoom}
                    onResize={(corner, e) => beginResize(e, "room", rect, corner)}
                    onRotate={(e) => beginRotate(e, "room", rect)}
                  />
                )}
              </g>
            );
          })}

          {/* Clearance zones (rendered below stickers so the sticker
              glyph remains on top). */}
          {clearanceInfo.size > 0 && (
            <g pointerEvents="none">
              {Array.from(clearanceInfo.entries()).map(([id, info]) => {
                const color = info.conflict ? "#dc2626" : "#16a34a";
                return (
                  <rect
                    key={`clr-${id}`}
                    x={info.zone.x * VIEWBOX}
                    y={info.zone.y * VIEWBOX}
                    width={info.zone.width * VIEWBOX}
                    height={info.zone.height * VIEWBOX}
                    fill={color}
                    fillOpacity={info.conflict ? 0.12 : 0.06}
                    stroke={color}
                    strokeOpacity={0.75}
                    strokeDasharray={da(4, 4)}
                    strokeWidth={1.5 * z}
                    rx={4 * z}
                    ry={4 * z}
                  />
                );
              })}
            </g>
          )}

          {/* Stickers */}
          {stickers.map((s) => {
            const rect: RectLike = {
              id: s.id,
              x: s.x,
              y: s.y,
              width: s.width,
              height: s.height,
              rotation: s.rotation,
            };
            const isSelected = selectionKind === "sticker" && selectedIds.has(s.id);
            return (
              <g
                key={s.id}
                transform={`translate(${s.x * VIEWBOX}, ${s.y * VIEWBOX}) rotate(${s.rotation} ${s.width * 500} ${s.height * 500})`}
              >
                <rect
                  x={0}
                  y={0}
                  width={s.width * VIEWBOX}
                  height={s.height * VIEWBOX}
                  fill="transparent"
                  stroke={isSelected ? "#3b82f6" : "transparent"}
                  strokeWidth={2 * z}
                  strokeDasharray={da(4, 4)}
                  style={{ cursor: "move" }}
                  onPointerDown={(e) => beginMove(e, "sticker", rect)}
                />
                {s.kind === "label" ? (
                  <foreignObject
                    x={0}
                    y={0}
                    width={s.width * VIEWBOX}
                    height={s.height * VIEWBOX}
                    style={{ pointerEvents: "none" }}
                  >
                    <div
                      className={s.color ? undefined : "text-slate-800 dark:text-stone-200"}
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: s.color ?? undefined,
                        fontSize: 18,
                        fontWeight: 700,
                        textAlign: "center",
                      }}
                    >
                      {s.label ?? "Label"}
                    </div>
                  </foreignObject>
                ) : (
                  <g
                    transform={`scale(${(s.width * VIEWBOX) / 100}, ${(s.height * VIEWBOX) / 100})`}
                    style={{ pointerEvents: "none" }}
                  >
                    <StickerGlyph kind={s.kind as MoveStickerKind} stroke={s.color ?? undefined} />
                  </g>
                )}
                {s.kind !== "label" && s.label && (
                  <text
                    x={s.width * 500}
                    y={s.height * VIEWBOX + 16}
                    textAnchor="middle"
                    fontSize={14}
                    className="fill-slate-700 dark:fill-stone-200 stroke-white dark:stroke-slate-900"
                    paintOrder="stroke"
                    strokeWidth={3}
                    style={{ pointerEvents: "none" }}
                  >
                    {s.label}
                  </text>
                )}
                {isSelected && (
                  <SelectionHandles
                    width={s.width * VIEWBOX}
                    height={s.height * VIEWBOX}
                    color="#3b82f6"
                    zoom={viewport.zoom}
                    onResize={(corner, e) => beginResize(e, "sticker", rect, corner)}
                    onRotate={(e) => beginRotate(e, "sticker", rect)}
                  />
                )}
                {/* Clearance conflict warning badge — drawn inside the
                    rotated group so it tracks the sticker. Sized in
                    viewBox units divided by zoom so it stays constant on
                    screen. */}
                {clearanceInfo.get(s.id)?.conflict && (
                  <g
                    transform={`translate(${s.width * VIEWBOX - 6 * z}, ${6 * z})`}
                    style={{ pointerEvents: "none" }}
                  >
                    <title>
                      {clearanceInfo.get(s.id)?.conflictReason ?? "Placement conflict"}
                    </title>
                    <circle
                      r={10 * z}
                      fill="#dc2626"
                      stroke="#ffffff"
                      strokeWidth={2 * z}
                    />
                    <text
                      x={0}
                      y={1 * z}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={13 * z}
                      fontWeight={800}
                      fill="#ffffff"
                    >
                      !
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Annotations (labels, notes, callouts, arrows, dimensions) */}
          {annotations
            .filter(
              (a) => !a.hidden && (layerById.get(a.layerId)?.visible ?? true)
            )
            .map((a) => {
              const selected =
                selectionKind === "annotation" && selectedIds.has(a.id);
              if (
                a.kind === "dimension" ||
                a.kind === "arrow"
              ) {
                const x1 = a.x;
                const y1 = a.y;
                const x2 = a.x2 ?? a.x;
                const y2 = a.y2 ?? a.y;
                return (
                  <g
                    key={a.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectOne("annotation", a.id);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <line
                      x1={x1 * VIEWBOX}
                      y1={y1 * VIEWBOX}
                      x2={x2 * VIEWBOX}
                      y2={y2 * VIEWBOX}
                      stroke={selected ? "#0ea5e9" : a.color}
                      strokeWidth={2 * z}
                    />
                    {/* Extension ticks for dimension lines */}
                    {a.kind === "dimension" && (
                      <>
                        <circle
                          cx={x1 * VIEWBOX}
                          cy={y1 * VIEWBOX}
                          r={3 * z}
                          fill={selected ? "#0ea5e9" : a.color}
                        />
                        <circle
                          cx={x2 * VIEWBOX}
                          cy={y2 * VIEWBOX}
                          r={3 * z}
                          fill={selected ? "#0ea5e9" : a.color}
                        />
                        <DimensionLabel x1={x1} y1={y1} x2={x2} y2={y2} zoom={viewport.zoom} />
                      </>
                    )}
                    {/* Arrow head for arrow annotations */}
                    {a.kind === "arrow" && (
                      <ArrowHead
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        color={a.color}
                        zoom={viewport.zoom}
                      />
                    )}
                  </g>
                );
              }
              // label/note/callout: render the text at (x,y), width+height
              // as a background box. Minimal — each kind gets a shared
              // treatment for now; richer styling lives in the style panel.
              const bgW = (a.width ?? 0.18) * VIEWBOX;
              const bgH = (a.height ?? 0.05) * VIEWBOX;
              return (
                <g
                  key={a.id}
                  transform={`translate(${a.x * VIEWBOX}, ${a.y * VIEWBOX})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectOne("annotation", a.id);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {a.kind === "callout" && (
                    <rect
                      width={bgW}
                      height={bgH}
                      rx={6}
                      ry={6}
                      fill="#fef3c7"
                      stroke={selected ? "#0ea5e9" : a.color}
                      strokeWidth={(selected ? 2.5 : 1.5) * z}
                    />
                  )}
                  <text
                    x={a.kind === "callout" ? bgW / 2 : 0}
                    y={bgH > 0 ? bgH / 2 : 12}
                    fontSize={a.fontSizePx}
                    fontWeight={a.bold ? 700 : 400}
                    fill={a.color}
                    textAnchor={a.kind === "callout" ? "middle" : "start"}
                    dominantBaseline="central"
                  >
                    {a.text ?? ""}
                  </text>
                </g>
              );
            })}

          {/* In-progress draft */}
          {draft?.type === "wall" && (
            <g pointerEvents="none">
              <line
                x1={draft.x1 * VIEWBOX}
                y1={draft.y1 * VIEWBOX}
                x2={draft.x2 * VIEWBOX}
                y2={draft.y2 * VIEWBOX}
                stroke="#0ea5e9"
                strokeWidth={8 * z}
                strokeOpacity={0.6}
                strokeLinecap="round"
              />
              <DimensionLabel
                x1={draft.x1}
                y1={draft.y1}
                x2={draft.x2}
                y2={draft.y2}
                zoom={viewport.zoom}
              />
            </g>
          )}
          {draft?.type === "room-rect" && (
            <g pointerEvents="none">
              <rect
                x={Math.min(draft.x, draft.x + draft.width) * VIEWBOX}
                y={Math.min(draft.y, draft.y + draft.height) * VIEWBOX}
                width={Math.abs(draft.width) * VIEWBOX}
                height={Math.abs(draft.height) * VIEWBOX}
                fill="#0ea5e9"
                fillOpacity={0.12}
                stroke="#0ea5e9"
                strokeDasharray={da(6, 4)}
                strokeWidth={3 * z}
              />
              <RectDimensions
                x={Math.min(draft.x, draft.x + draft.width)}
                y={Math.min(draft.y, draft.y + draft.height)}
                w={Math.abs(draft.width)}
                h={Math.abs(draft.height)}
                zoom={viewport.zoom}
              />
            </g>
          )}
          {draft?.type === "dimension" && draft.placed && (
            <g pointerEvents="none">
              <line
                x1={draft.x1 * VIEWBOX}
                y1={draft.y1 * VIEWBOX}
                x2={draft.x2 * VIEWBOX}
                y2={draft.y2 * VIEWBOX}
                stroke="#0ea5e9"
                strokeWidth={2 * z}
                strokeDasharray={da(4, 3)}
              />
              <DimensionLabel
                x1={draft.x1}
                y1={draft.y1}
                x2={draft.x2}
                y2={draft.y2}
                zoom={viewport.zoom}
              />
            </g>
          )}
          {draft?.type === "room-polygon" && draft.points.length > 0 && (
            <g pointerEvents="none">
              {/* Filled preview when we already have enough vertices to form
                  a shape; rubber-band line from last vertex to cursor. */}
              {draft.points.length >= 3 && (
                <polygon
                  points={draft.points
                    .map((pt) => `${pt.x * VIEWBOX},${pt.y * VIEWBOX}`)
                    .join(" ")}
                  fill="#0ea5e9"
                  fillOpacity={0.12}
                  stroke="#0ea5e9"
                  strokeDasharray={da(6, 4)}
                  strokeWidth={3 * z}
                />
              )}
              {draft.points.length < 3 && draft.points.length >= 2 && (
                <polyline
                  points={draft.points
                    .map((pt) => `${pt.x * VIEWBOX},${pt.y * VIEWBOX}`)
                    .join(" ")}
                  fill="none"
                  stroke="#0ea5e9"
                  strokeDasharray={da(6, 4)}
                  strokeWidth={3 * z}
                />
              )}
              {/* Vertex dots; first one gets a bigger ring so the close
                  target is discoverable. */}
              {draft.points.map((pt, idx) => (
                <circle
                  key={idx}
                  cx={pt.x * VIEWBOX}
                  cy={pt.y * VIEWBOX}
                  r={(idx === 0 && draft.points.length >= 3 ? 10 : 6) * z}
                  fill={idx === 0 && draft.points.length >= 3 ? "#ffffff" : "#0ea5e9"}
                  stroke="#0ea5e9"
                  strokeWidth={(idx === 0 && draft.points.length >= 3 ? 3 : 2) * z}
                />
              ))}
            </g>
          )}

          {/* Smart-alignment guides (shown while dragging) */}
          {alignGuides && (
            <g pointerEvents="none">
              {alignGuides.vertical.map((x, i) => (
                <line
                  key={`v-${i}-${x}`}
                  x1={x * VIEWBOX}
                  y1={0}
                  x2={x * VIEWBOX}
                  y2={VIEWBOX}
                  stroke="#ec4899"
                  strokeWidth={1 * z}
                  strokeDasharray={da(3, 3)}
                  opacity={0.8}
                />
              ))}
              {alignGuides.horizontal.map((y, i) => (
                <line
                  key={`h-${i}-${y}`}
                  x1={0}
                  y1={y * VIEWBOX}
                  x2={VIEWBOX}
                  y2={y * VIEWBOX}
                  stroke="#ec4899"
                  strokeWidth={1 * z}
                  strokeDasharray={da(3, 3)}
                  opacity={0.8}
                />
              ))}
            </g>
          )}

          {/* Door/window hover preview */}
          {openingPreview && (activeTool === "door" || activeTool === "window") && (
            <g pointerEvents="none">
              <circle
                cx={openingPreview.point.x * VIEWBOX}
                cy={openingPreview.point.y * VIEWBOX}
                r={14 * z}
                fill="#0ea5e9"
                fillOpacity={0.15}
                stroke="#0ea5e9"
                strokeWidth={2 * z}
                strokeDasharray={da(4, 3)}
              />
              <text
                x={openingPreview.point.x * VIEWBOX + 18 * z}
                y={openingPreview.point.y * VIEWBOX - 6 * z}
                fill="#0369a1"
                fontSize={12 * z}
                fontWeight={600}
              >
                {openingPreview.kind === "door" ? "Place door" : "Place window"}
              </text>
            </g>
          )}

          {/* Snap guide indicator */}
          {snapGuide && (
            <circle
              cx={snapGuide.p.x * VIEWBOX}
              cy={snapGuide.p.y * VIEWBOX}
              r={8 * z}
              fill="none"
              stroke="#06b6d4"
              strokeWidth={2 * z}
              pointerEvents="none"
            />
          )}

          {/* Marquee */}
          {marquee && (
            <rect
              x={marquee.x * VIEWBOX}
              y={marquee.y * VIEWBOX}
              width={Math.abs(marquee.width) * VIEWBOX}
              height={Math.abs(marquee.height) * VIEWBOX}
              fill="rgb(59 130 246 / 0.1)"
              stroke="#3b82f6"
              strokeWidth={1 * z}
              strokeDasharray={da(4, 3)}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {/* Overlay: tool hint */}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-slate-900/80 text-white text-[10px] px-2 py-1">
        {toolHint(activeTool, viewport.unit === "metric" ? "m" : "ft")}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function clampSafe(n: number) {
  return Math.max(-0.2, Math.min(1.2, n));
}

function toolHint(tool: string, unit: string): string {
  switch (tool) {
    case "wall":
      return `Click to start wall · click again to end · Enter to chain · Shift = 15° · Esc cancels · ${unit}`;
    case "room-rect":
      return "Click-drag to draw a rectangle room";
    case "room-polygon":
      return "Click each corner · Enter or double-click to close";
    case "door":
    case "window":
      return "Hover a wall, click to place";
    case "pan":
      return "Drag to pan";
    default:
      return "Click to select · drag empty canvas for marquee · Space to pan · wheel to zoom";
  }
}

/* ---------- sub-components ---------- */

function SelectionHandles({
  width,
  height,
  color,
  zoom,
  onResize,
  onRotate,
}: {
  width: number;
  height: number;
  color: string;
  /** Current viewport zoom. Handle radii, stroke widths, and the rotation
   *  arm length are divided by this so the chrome stays a constant size on
   *  screen regardless of how far the user has zoomed in. */
  zoom: number;
  onResize: (corner: "tl" | "tr" | "bl" | "br", e: React.PointerEvent) => void;
  onRotate: (e: React.PointerEvent) => void;
}) {
  const s = 1 / Math.max(zoom, 0.01);
  const r = 10 * s;
  const strokeW = 3 * s;
  const armLen = 30 * s;
  return (
    <>
      {(["tl", "tr", "bl", "br"] as const).map((corner) => {
        const cxh = corner === "tl" || corner === "bl" ? 0 : width;
        const cyh = corner === "tl" || corner === "tr" ? 0 : height;
        const cursor =
          corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize";
        return (
          <circle
            key={corner}
            cx={cxh}
            cy={cyh}
            r={r}
            fill="#ffffff"
            stroke={color}
            strokeWidth={strokeW}
            style={{ cursor }}
            onPointerDown={(e) => onResize(corner, e)}
          />
        );
      })}
      <line
        x1={width / 2}
        y1={0}
        x2={width / 2}
        y2={-armLen}
        stroke={color}
        strokeWidth={2 * s}
      />
      <circle
        cx={width / 2}
        cy={-armLen}
        r={r}
        fill={color}
        style={{ cursor: "grab" }}
        onPointerDown={onRotate}
      />
    </>
  );
}

function DimensionLabel({
  x1,
  y1,
  x2,
  y2,
  zoom,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Viewport zoom — used to keep the label a constant on-screen size. */
  zoom: number;
}) {
  const viewport = useFloorPlanStore((s) => s.viewport);
  const raw = Math.hypot(x2 - x1, y2 - y1);
  // Interior mode: subtract the typical wall thickness (0.012 each side →
  // 0.024 total) from the rendered length so the reading reflects the
  // usable inside dimension between walls. If the dimension is shorter
  // than that offset, fall back to the raw length so we don't flash a
  // negative value.
  const WALL_OFFSET = 0.024;
  const length =
    viewport.measurementMode === "interior" && raw > WALL_OFFSET
      ? raw - WALL_OFFSET
      : raw;
  const label = formatDimension(length, viewport);
  const mx = ((x1 + x2) / 2) * VIEWBOX;
  const my = ((y1 + y2) / 2) * VIEWBOX;
  const s = 1 / Math.max(zoom, 0.01);
  return (
    <g pointerEvents="none">
      <rect
        x={mx - 34 * s}
        y={my - 22 * s}
        width={68 * s}
        height={18 * s}
        rx={4 * s}
        fill="#0ea5e9"
      />
      <text
        x={mx}
        y={my - 8 * s}
        textAnchor="middle"
        fontSize={11 * s}
        fontWeight={600}
        fill="#ffffff"
      >
        {label}
      </text>
    </g>
  );
}

/** Small arrow head at the (x2, y2) end of a line, used for arrow
 *  annotations. Coordinates are in 0..1 normalized space; the head is
 *  drawn in viewBox pixels so it stays a constant size regardless of
 *  zoom. */
function ArrowHead({
  x1,
  y1,
  x2,
  y2,
  color,
  zoom,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  zoom: number;
}) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 14 / Math.max(zoom, 0.01);
  const headHalf = Math.PI / 7;
  const hx = x2 * VIEWBOX;
  const hy = y2 * VIEWBOX;
  const ax = hx - headLen * Math.cos(angle - headHalf);
  const ay = hy - headLen * Math.sin(angle - headHalf);
  const bx = hx - headLen * Math.cos(angle + headHalf);
  const by = hy - headLen * Math.sin(angle + headHalf);
  return (
    <polygon
      points={`${hx},${hy} ${ax},${ay} ${bx},${by}`}
      fill={color}
      pointerEvents="none"
    />
  );
}

function RectDimensions({
  x,
  y,
  w,
  h,
  zoom,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
}) {
  const viewport = useFloorPlanStore((sv) => sv.viewport);
  const widthLabel = formatDimension(w, viewport);
  const heightLabel = formatDimension(h, viewport);
  const s = 1 / Math.max(zoom, 0.01);
  return (
    <g pointerEvents="none">
      <text
        x={(x + w / 2) * VIEWBOX}
        y={y * VIEWBOX - 6 * s}
        textAnchor="middle"
        fontSize={11 * s}
        fontWeight={600}
        fill="#0ea5e9"
        paintOrder="stroke"
        stroke="#ffffff"
        strokeWidth={3 * s}
      >
        {widthLabel}
      </text>
      <text
        x={x * VIEWBOX - 6 * s}
        y={(y + h / 2) * VIEWBOX}
        textAnchor="end"
        dominantBaseline="central"
        fontSize={11 * s}
        fontWeight={600}
        fill="#0ea5e9"
        paintOrder="stroke"
        stroke="#ffffff"
        strokeWidth={3 * s}
      >
        {heightLabel}
      </text>
    </g>
  );
}

// Silence unused: the imported label map is used indirectly through the
// glyph renderer on child components; keeping the import guarantees the
// sticker registry stays loaded.
void MOVE_STICKER_LABELS;
