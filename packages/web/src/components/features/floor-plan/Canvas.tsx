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
import type { MoveRoom, MoveSticker, MoveStickerKind } from "@hcc/shared";
import {
  MOVE_STICKER_LABELS,
} from "@hcc/shared";
import { StickerGlyph } from "../sticker-icons";
import { useFloorPlanStore } from "@/stores/floor-plan";
import {
  autoJoinEndpoint,
  constrainAngle,
  normalizeRect,
  segmentLength,
  snapToFeatures,
  snapToGrid,
  type Point,
  type Rect,
} from "@/lib/floor-plan/geometry";
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

interface Props {
  imageUrl: string | null;
  rooms: MoveRoom[];
  stickers: MoveSticker[];
  onCreateRoomRect: (r: { x: number; y: number; width: number; height: number }) => void;
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
  /** Raise selection to parent so Properties panel can display. */
  onSelectionChange: (kind: "room" | "sticker" | "wall" | "none", ids: string[]) => void;
}

const VIEWBOX = 1000;
const AUTOJOIN = 0.02;
const SNAP_THRESHOLD = 0.015;

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
  onUpdateRoom,
  onDeleteRooms,
  onCreateSticker,
  onUpdateSticker,
  onDeleteStickers,
  onSelectionChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const viewport = useFloorPlanStore((s) => s.viewport);
  const setViewport = useFloorPlanStore((s) => s.setViewport);
  const activeTool = useFloorPlanStore((s) => s.activeTool);
  const setTool = useFloorPlanStore((s) => s.setTool);
  const setDraft = useFloorPlanStore((s) => s.setDraft);
  const draft = useFloorPlanStore((s) => s.draft);
  const walls = useFloorPlanStore((s) => s.doc.walls);
  const addWall = useFloorPlanStore((s) => s.addWall);
  const deleteWalls = useFloorPlanStore((s) => s.deleteWalls);
  const selectedIds = useFloorPlanStore((s) => s.selectedIds);
  const selectionKind = useFloorPlanStore((s) => s.selectionKind);
  const select = useFloorPlanStore((s) => s.select);
  const clearSelection = useFloorPlanStore((s) => s.clearSelection);
  const layers = useFloorPlanStore((s) => s.doc.layers);
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

  // Selection helpers.
  const selectOne = (kind: "room" | "sticker" | "wall", id: string) => {
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
        const patch = {
          x: clampSafe(drag.startRect.x + dx),
          y: clampSafe(drag.startRect.y + dy),
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

  /* ---------- key handlers ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement | null)?.isContentEditable;
      if (typing) return;
      if (e.key === "Escape") {
        if (draft) setDraft(null);
        else clearSel();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectionKind === "sticker") onDeleteStickers([...selectedIds]);
        else if (selectionKind === "room") onDeleteRooms([...selectedIds]);
        else if (selectionKind === "wall") deleteWalls([...selectedIds]);
        clearSel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, selectedIds, selectionKind, onDeleteStickers, onDeleteRooms, deleteWalls, clearSel, setDraft]);

  /* ---------- grid backdrop ---------- */
  const gridPx = viewport.gridSizePx * viewport.zoom;
  const gridStyle: React.CSSProperties = viewport.showGrid
    ? {
        backgroundImage:
          "linear-gradient(to right, rgb(226 232 240 / 0.7) 1px, transparent 1px), linear-gradient(to bottom, rgb(226 232 240 / 0.7) 1px, transparent 1px)",
        backgroundSize: `${gridPx}px ${gridPx}px`,
        backgroundPosition: `${viewport.panX * size.width}px ${viewport.panY * size.height}px`,
      }
    : {};

  /* ---------- render ---------- */
  const worldTransform = `translate(${viewport.panX * VIEWBOX} ${viewport.panY * VIEWBOX}) scale(${viewport.zoom})`;

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 relative bg-slate-100 dark:bg-slate-950 overflow-hidden"
    >
      {/* Grid backdrop */}
      <div className="absolute inset-0 bg-white dark:bg-slate-900" style={gridStyle} />

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
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "absolute inset-0 w-full h-full touch-none",
          activeTool === "pan" || spaceDown ? "cursor-grab" : "",
          activeTool === "wall" ? "cursor-crosshair" : "",
          activeTool === "room-rect" ? "cursor-crosshair" : ""
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
                  stroke={selected ? "#0ea5e9" : w.color}
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

          {/* Rooms */}
          {rooms.map((room) => {
            const rect = roomRect(room);
            const isSelected = selectionKind === "room" && selectedIds.has(room.id);
            const color = room.color || "#8b5cf6";
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
                  fill={color}
                  fillOpacity={isSelected ? 0.22 : 0.14}
                  stroke={color}
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
                  fill="#0f172a"
                  fontSize={Math.max(14, Math.min(30, rect.height * VIEWBOX * 0.15))}
                  fontWeight={700}
                  paintOrder="stroke"
                  stroke="#ffffff"
                  strokeWidth={4}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {room.name}
                </text>
                {isSelected && (
                  <SelectionHandles
                    width={rect.width * VIEWBOX}
                    height={rect.height * VIEWBOX}
                    color={color}
                    onResize={(corner, e) => beginResize(e, "room", rect, corner)}
                    onRotate={(e) => beginRotate(e, "room", rect)}
                  />
                )}
              </g>
            );
          })}

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
                  strokeWidth={2}
                  strokeDasharray="4 4"
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
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: s.color ?? "#0f172a",
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
                    fill="#334155"
                    paintOrder="stroke"
                    stroke="#ffffff"
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
                    onResize={(corner, e) => beginResize(e, "sticker", rect, corner)}
                    onRotate={(e) => beginRotate(e, "sticker", rect)}
                  />
                )}
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
                strokeWidth={8}
                strokeOpacity={0.6}
                strokeLinecap="round"
              />
              <DimensionLabel
                x1={draft.x1}
                y1={draft.y1}
                x2={draft.x2}
                y2={draft.y2}
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
                strokeDasharray="6 4"
                strokeWidth={3}
              />
              <RectDimensions
                x={Math.min(draft.x, draft.x + draft.width)}
                y={Math.min(draft.y, draft.y + draft.height)}
                w={Math.abs(draft.width)}
                h={Math.abs(draft.height)}
              />
            </g>
          )}

          {/* Snap guide indicator */}
          {snapGuide && (
            <circle
              cx={snapGuide.p.x * VIEWBOX}
              cy={snapGuide.p.y * VIEWBOX}
              r={8}
              fill="none"
              stroke="#06b6d4"
              strokeWidth={2}
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
              strokeWidth={1}
              strokeDasharray="4 3"
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
  onResize,
  onRotate,
}: {
  width: number;
  height: number;
  color: string;
  onResize: (corner: "tl" | "tr" | "bl" | "br", e: React.PointerEvent) => void;
  onRotate: (e: React.PointerEvent) => void;
}) {
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
            r={10}
            fill="#ffffff"
            stroke={color}
            strokeWidth={3}
            style={{ cursor }}
            onPointerDown={(e) => onResize(corner, e)}
          />
        );
      })}
      <line x1={width / 2} y1={0} x2={width / 2} y2={-30} stroke={color} strokeWidth={2} />
      <circle
        cx={width / 2}
        cy={-30}
        r={10}
        fill={color}
        style={{ cursor: "grab" }}
        onPointerDown={onRotate}
      />
    </>
  );
}

function DimensionLabel({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const viewport = useFloorPlanStore((s) => s.viewport);
  const length = Math.hypot(x2 - x1, y2 - y1);
  const label = formatDimension(length, viewport);
  const mx = ((x1 + x2) / 2) * VIEWBOX;
  const my = ((y1 + y2) / 2) * VIEWBOX;
  return (
    <g pointerEvents="none">
      <rect x={mx - 34} y={my - 22} width={68} height={18} rx={4} fill="#0ea5e9" />
      <text
        x={mx}
        y={my - 8}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="#ffffff"
      >
        {label}
      </text>
    </g>
  );
}

function RectDimensions({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const viewport = useFloorPlanStore((s) => s.viewport);
  const widthLabel = formatDimension(w, viewport);
  const heightLabel = formatDimension(h, viewport);
  return (
    <g pointerEvents="none">
      <text
        x={(x + w / 2) * VIEWBOX}
        y={y * VIEWBOX - 6}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="#0ea5e9"
        paintOrder="stroke"
        stroke="#ffffff"
        strokeWidth={3}
      >
        {widthLabel}
      </text>
      <text
        x={x * VIEWBOX - 6}
        y={(y + h / 2) * VIEWBOX}
        textAnchor="end"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
        fill="#0ea5e9"
        paintOrder="stroke"
        stroke="#ffffff"
        strokeWidth={3}
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
