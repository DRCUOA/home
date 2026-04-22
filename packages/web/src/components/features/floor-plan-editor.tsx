import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Check,
  Trash2,
  Pencil,
  MousePointer2,
  RotateCw,
  Copy,
  Upload as UploadIcon,
  Image as ImageIcon,
  Square,
  HelpCircle,
  Shapes,
  Home as HomeIcon,
} from "lucide-react";
import type { MoveRoom, MoveSticker, MoveStickerKind } from "@hcc/shared";
import { MOVE_STICKER_KINDS, MOVE_STICKER_LABELS } from "@hcc/shared";
import { Button } from "@/components/ui/button";
import { StickerGlyph, STICKER_DEFAULT_SIZES } from "./sticker-icons";
import { cn } from "@/lib/cn";

/**
 * Fullscreen floor plan editor.
 *
 * Takes over the viewport with:
 *   - a left-side sticker palette (doors, windows, walls, furniture…),
 *     plus an "Add room" stamp that drops a new room onto the canvas
 *   - a center canvas showing the uploaded plan image (or a grid if
 *     none, so the user can start from a blank canvas)
 *   - a right-side help / properties panel
 *
 * Rooms are treated as *special stickers* — they live in their own
 * table (they're still drop targets for items/boxes) but in the editor
 * they move, resize, and rotate with the exact same UX as every other
 * sticker. A room is stored as a bounding box (x/y/width/height) plus a
 * rotation angle, in the same 0..1 normalized coordinate space that
 * stickers use. Legacy rooms drawn with the old polygon tool fall back
 * to their polygon's bounding box (the DB migration backfills this).
 *
 * Everything in here speaks normalized coordinates so it scales at any
 * viewport size.
 */

interface FloorPlanEditorProps {
  side: "origin" | "destination";
  title: string;
  imageUrl: string | null;
  rooms: MoveRoom[];
  stickers: MoveSticker[];

  onClose: () => void;
  onUploadPlan: () => void;
  /** Clears the uploaded plan image for this side. The underlying file
   *  stays in the user's gallery — only the association is removed. */
  onRemovePlan?: () => void;

  /** Create a new room. Unlike the old polygon tool, we now stamp a
   *  rectangle — same shape as a sticker. The caller gets the default
   *  geometry and a name; it can assign a sort_order / color. */
  onCreateRoom: (partial: {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }) => void;
  /** Optimistic update — the editor calls this mid-drag so the cached
   *  rooms list follows the pointer without waiting for a round-trip,
   *  same pattern stickers already use. */
  onUpdateRoom: (id: string, patch: Partial<MoveRoom>) => void;
  onDeleteRoom: (roomId: string) => void;

  onCreateSticker: (partial: {
    kind: MoveStickerKind;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    label?: string;
  }) => void;
  onUpdateSticker: (id: string, changes: Partial<MoveSticker>) => void;
  onDeleteSticker: (id: string) => void;
}

/* ---------- rectangle helpers shared between stickers and rooms ---------- */

/**
 * Rooms and stickers both expose this shape — any rect-like widget can
 * be moved, resized, and rotated by the same pointer code. The editor
 * keeps the two selection streams separate (so the properties panel
 * can show room-specific or sticker-specific controls), but the drag
 * math is identical.
 */
interface RectLike {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

const DEFAULT_ROOM_RECT = {
  width: 0.3,
  height: 0.25,
  rotation: 0,
};

/** Derive a rectangle for a room regardless of whether it was created
 *  via the old polygon tool or the new stamp flow. Any modern row has
 *  width > 0 so we use the rect fields directly; legacy polygon-only
 *  rooms fall back to the polygon's bounding box. */
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
  // Totally empty (pre-save draft): centred default so selection handles
  // aren't at (0,0).
  return {
    id: room.id,
    x: 0.35,
    y: 0.4,
    width: DEFAULT_ROOM_RECT.width,
    height: DEFAULT_ROOM_RECT.height,
    rotation: 0,
  };
}

export function FloorPlanEditor({
  side,
  title,
  imageUrl,
  rooms,
  stickers,
  onClose,
  onUploadPlan,
  onRemovePlan,
  onCreateRoom,
  onUpdateRoom,
  onDeleteRoom,
  onCreateSticker,
  onUpdateSticker,
  onDeleteSticker,
}: FloorPlanEditorProps) {
  // `side` is passed through to parent handlers via closures in
  // moving.tsx; we don't need it inside the editor itself, but keep it
  // in the signature so the call site stays self-documenting.
  void side;

  const svgRef = useRef<SVGSVGElement>(null);
  // Exactly one of these is non-null at a time — selecting one clears
  // the other, so the properties panel can decide what to show.
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(
    null
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  // Tools and help are both hidden by default so the plan is the hero.
  const [showTools, setShowTools] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Sticker palette filter — useful now that there are ~60 sticker kinds.
  const [stickerFilter, setStickerFilter] = useState("");

  const selectSticker = (id: string | null) => {
    setSelectedStickerId(id);
    if (id) setSelectedRoomId(null);
  };
  const selectRoom = (id: string | null) => {
    setSelectedRoomId(id);
    if (id) setSelectedStickerId(null);
  };

  // Escape closes the editor; Delete/Backspace removes selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedStickerId) selectSticker(null);
        else if (selectedRoomId) selectRoom(null);
        else onClose();
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        if (selectedStickerId) {
          onDeleteSticker(selectedStickerId);
          selectSticker(null);
        } else if (selectedRoomId) {
          // Deleting a room is destructive (items in it become
          // unassigned). The caller handles the confirm.
          onDeleteRoom(selectedRoomId);
          selectRoom(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedStickerId, selectedRoomId, onClose, onDeleteSticker, onDeleteRoom]);

  /* ---------- coordinate helpers ---------- */

  const toLocal = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      return { x, y };
    },
    []
  );

  /* ---------- palette "drop to canvas" ---------- */

  const addStickerFromPalette = (kind: MoveStickerKind) => {
    const { w, h } = STICKER_DEFAULT_SIZES[kind];
    onCreateSticker({
      kind,
      x: 0.5 - w / 2,
      y: 0.5 - h / 2,
      width: w,
      height: h,
      rotation: 0,
      label: kind === "label" ? "Label" : undefined,
    });
  };

  /** Stamp a new room at the center of the canvas. The caller assigns
   *  color + sort_order based on the current side's room count; from
   *  here it looks exactly like dropping a sticker. */
  const addRoomFromPalette = () => {
    const w = DEFAULT_ROOM_RECT.width;
    const h = DEFAULT_ROOM_RECT.height;
    onCreateRoom({
      name: `Room ${rooms.length + 1}`,
      x: 0.5 - w / 2,
      y: 0.5 - h / 2,
      width: w,
      height: h,
      rotation: DEFAULT_ROOM_RECT.rotation,
    });
  };

  /* ---------- generic rect drag (stickers + rooms) ---------- */

  type DragTarget = "sticker" | "room";

  type DragKind =
    | {
        type: "move";
        startMouse: { x: number; y: number };
        startRect: RectLike;
      }
    | {
        type: "resize";
        anchor: { x: number; y: number };
        startMouse: { x: number; y: number };
        startRect: RectLike;
      }
    | {
        type: "rotate";
        centre: { x: number; y: number };
        startAngle: number;
        startRotation: number;
      };

  const dragRef = useRef<
    | ({ target: DragTarget; id: string; latestPatch: Partial<RectLike> | null } & DragKind)
    | null
  >(null);

  /** Apply an in-flight rect patch to whatever entity the drag targets.
   *  Stickers already had this optimistic-update path — rooms now get
   *  the same treatment via onUpdateRoom, so drag feels instant on both. */
  const pushPatch = (
    target: DragTarget,
    id: string,
    patch: Partial<RectLike>
  ) => {
    if (target === "sticker") {
      onUpdateSticker(id, patch as Partial<MoveSticker>);
    } else {
      onUpdateRoom(id, patch as Partial<MoveRoom>);
    }
  };

  const beginMove = (
    e: React.PointerEvent,
    target: DragTarget,
    rect: RectLike
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (target === "sticker") selectSticker(rect.id);
    else selectRoom(rect.id);
    dragRef.current = {
      target,
      id: rect.id,
      type: "move",
      startMouse: toLocal(e.clientX, e.clientY),
      startRect: { ...rect },
      latestPatch: null,
    };
  };

  const beginResize = (
    e: React.PointerEvent,
    target: DragTarget,
    rect: RectLike,
    corner: "tl" | "tr" | "bl" | "br"
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const anchorX =
      corner === "tl" || corner === "bl" ? rect.x + rect.width : rect.x;
    const anchorY =
      corner === "tl" || corner === "tr" ? rect.y + rect.height : rect.y;
    dragRef.current = {
      target,
      id: rect.id,
      type: "resize",
      anchor: { x: anchorX, y: anchorY },
      startMouse: toLocal(e.clientX, e.clientY),
      startRect: { ...rect },
      latestPatch: null,
    };
  };

  const beginRotate = (
    e: React.PointerEvent,
    target: DragTarget,
    rect: RectLike
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const p = toLocal(e.clientX, e.clientY);
    const angle = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI;
    dragRef.current = {
      target,
      id: rect.id,
      type: "rotate",
      centre: { x: cx, y: cy },
      startAngle: angle,
      startRotation: rect.rotation,
      latestPatch: null,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toLocal(e.clientX, e.clientY);
    let patch: Partial<RectLike> | null = null;

    if (drag.type === "move") {
      const dx = p.x - drag.startMouse.x;
      const dy = p.y - drag.startMouse.y;
      patch = {
        x: clamp(drag.startRect.x + dx, -0.15, 1.15 - drag.startRect.width),
        y: clamp(drag.startRect.y + dy, -0.15, 1.15 - drag.startRect.height),
      };
    } else if (drag.type === "resize") {
      const x = Math.min(drag.anchor.x, p.x);
      const y = Math.min(drag.anchor.y, p.y);
      const width = Math.max(0.02, Math.abs(p.x - drag.anchor.x));
      const height = Math.max(0.02, Math.abs(p.y - drag.anchor.y));
      patch = { x, y, width, height };
    } else if (drag.type === "rotate") {
      const angle =
        (Math.atan2(p.y - drag.centre.y, p.x - drag.centre.x) * 180) / Math.PI;
      const delta = angle - drag.startAngle;
      let next = drag.startRotation + delta;
      // snap to 15° if shift held
      if (e.shiftKey) next = Math.round(next / 15) * 15;
      // normalize -180..180 for storage
      next = (((next + 180) % 360) + 360) % 360 - 180;
      patch = { rotation: next };
    }

    if (patch) {
      drag.latestPatch = { ...(drag.latestPatch ?? {}), ...patch };
      pushPatch(drag.target, drag.id, patch);
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleSvgClick = () => {
    // Clicks on the SVG background deselect. Sticker/room clicks
    // stopPropagation so they stay selected.
    selectSticker(null);
    selectRoom(null);
  };

  /* ---------- derived state ---------- */

  const selectedSticker = useMemo(
    () => stickers.find((s) => s.id === selectedStickerId) ?? null,
    [stickers, selectedStickerId]
  );
  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );

  /* ---------- render ---------- */

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-sm">
      {/* ----- Top bar (compact) ----- */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/90 backdrop-blur border-b border-slate-700 text-slate-100">
        <Pencil className="h-4 w-4 text-primary-400 shrink-0" />
        <h2 className="text-xs font-semibold truncate">Edit — {title}</h2>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowTools((v) => !v)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition border min-h-8",
              showTools
                ? "bg-primary-500 text-white border-primary-500"
                : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
            )}
            title="Toggle tools & sticker palette"
          >
            <Shapes className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tools</span>
          </button>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition border min-h-8",
              showHelp
                ? "bg-primary-500 text-white border-primary-500"
                : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
            )}
            title="Toggle help"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Help</span>
          </button>
          <button
            type="button"
            onClick={onUploadPlan}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition border bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 min-h-8"
            title={imageUrl ? "Replace plan image" : "Add plan image"}
          >
            <UploadIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {imageUrl ? "Replace" : "Add image"}
            </span>
          </button>
          {imageUrl && onRemovePlan && (
            <button
              type="button"
              onClick={onRemovePlan}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition border bg-slate-800 text-red-300 border-slate-700 hover:bg-red-900/50 hover:text-red-200 min-h-8"
              title="Remove the plan image from this side (the file stays in your gallery)"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Remove</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition bg-primary-500 hover:bg-primary-600 text-white min-h-8"
          >
            <Check className="h-3.5 w-3.5" />
            Done
          </button>
        </div>
      </div>

      {/* ----- Body: canvas hero, floating palette + help overlays ----- */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0 bg-slate-800 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
            <div
              className="relative bg-white dark:bg-slate-900 rounded shadow-lg overflow-hidden"
              style={{ width: "min(100%, 100%)", height: "100%", aspectRatio: "auto" }}
            >
              {/* Grid background for blank-canvas mode */}
              {!imageUrl && (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: "#f8fafc",
                    backgroundImage:
                      "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />
              )}
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={`${title} floor plan`}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                  draggable={false}
                />
              )}

              <svg
                ref={svgRef}
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full touch-none"
                onClick={handleSvgClick}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {/* ---------- Rooms (as special stickers) ---------- */}
                {rooms.map((room) => {
                  const rect = roomRect(room);
                  const isSelected = room.id === selectedRoomId;
                  const color = room.color || "#8b5cf6";
                  return (
                    <g
                      key={room.id}
                      transform={`translate(${rect.x * 1000}, ${rect.y * 1000}) rotate(${rect.rotation} ${rect.width * 500} ${rect.height * 500})`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Filled body — softer than a sticker glyph so
                          rooms read as an enclosing area. */}
                      <rect
                        x={0}
                        y={0}
                        width={rect.width * 1000}
                        height={rect.height * 1000}
                        fill={color}
                        fillOpacity={isSelected ? 0.22 : 0.14}
                        stroke={color}
                        strokeOpacity={0.9}
                        strokeWidth={isSelected ? 4 : 3}
                        strokeDasharray={isSelected ? "none" : "6 4"}
                        rx={6}
                        ry={6}
                        style={{ cursor: "move" }}
                        onPointerDown={(e) => beginMove(e, "room", rect)}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectRoom(room.id);
                        }}
                      />
                      {/* Room name centred inside the rect */}
                      <text
                        x={rect.width * 500}
                        y={rect.height * 500}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#0f172a"
                        fontSize={Math.max(
                          16,
                          Math.min(32, rect.height * 1000 * 0.18)
                        )}
                        fontWeight={700}
                        paintOrder="stroke"
                        stroke="#ffffff"
                        strokeWidth={5}
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {room.name}
                      </text>
                      {/* Selection handles — identical shape to stickers */}
                      {isSelected && (
                        <>
                          {(["tl", "tr", "bl", "br"] as const).map((corner) => {
                            const cxh =
                              corner === "tl" || corner === "bl"
                                ? 0
                                : rect.width * 1000;
                            const cyh =
                              corner === "tl" || corner === "tr"
                                ? 0
                                : rect.height * 1000;
                            const cursor =
                              corner === "tl" || corner === "br"
                                ? "nwse-resize"
                                : "nesw-resize";
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
                                onPointerDown={(e) =>
                                  beginResize(e, "room", rect, corner)
                                }
                              />
                            );
                          })}
                          <g>
                            <line
                              x1={rect.width * 500}
                              y1={0}
                              x2={rect.width * 500}
                              y2={-30}
                              stroke={color}
                              strokeWidth={2}
                            />
                            <circle
                              cx={rect.width * 500}
                              cy={-30}
                              r={10}
                              fill={color}
                              style={{ cursor: "grab" }}
                              onPointerDown={(e) =>
                                beginRotate(e, "room", rect)
                              }
                            />
                          </g>
                        </>
                      )}
                    </g>
                  );
                })}

                {/* ---------- Stickers ---------- */}
                {stickers.map((s) => {
                  const rect: RectLike = {
                    id: s.id,
                    x: s.x,
                    y: s.y,
                    width: s.width,
                    height: s.height,
                    rotation: s.rotation,
                  };
                  const isSelected = s.id === selectedStickerId;
                  return (
                    <g
                      key={s.id}
                      transform={`translate(${s.x * 1000}, ${s.y * 1000}) rotate(${s.rotation} ${s.width * 500} ${s.height * 500})`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Selection background for hit testing */}
                      <rect
                        x={0}
                        y={0}
                        width={s.width * 1000}
                        height={s.height * 1000}
                        fill="transparent"
                        stroke={isSelected ? "#3b82f6" : "transparent"}
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        style={{ cursor: "move" }}
                        onPointerDown={(e) => beginMove(e, "sticker", rect)}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectSticker(s.id);
                        }}
                      />
                      {/* Glyph (or label) */}
                      {s.kind === "label" ? (
                        <foreignObject
                          x={0}
                          y={0}
                          width={s.width * 1000}
                          height={s.height * 1000}
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
                              padding: 2,
                            }}
                          >
                            {s.label ?? "Label"}
                          </div>
                        </foreignObject>
                      ) : (
                        <g
                          transform={`scale(${(s.width * 1000) / 100}, ${(s.height * 1000) / 100})`}
                          style={{ pointerEvents: "none" }}
                        >
                          <StickerGlyph
                            kind={s.kind as MoveStickerKind}
                            stroke={s.color ?? undefined}
                          />
                        </g>
                      )}
                      {/* Labels next to glyph (when not a text sticker itself) */}
                      {s.kind !== "label" && s.label && (
                        <text
                          x={s.width * 500}
                          y={s.height * 1000 + 18}
                          textAnchor="middle"
                          fontSize={16}
                          fill="#334155"
                          paintOrder="stroke"
                          stroke="#ffffff"
                          strokeWidth={3}
                          style={{ pointerEvents: "none" }}
                        >
                          {s.label}
                        </text>
                      )}
                      {/* Selection handles */}
                      {isSelected && (
                        <>
                          {(["tl", "tr", "bl", "br"] as const).map((corner) => {
                            const cxh =
                              corner === "tl" || corner === "bl" ? 0 : s.width * 1000;
                            const cyh =
                              corner === "tl" || corner === "tr" ? 0 : s.height * 1000;
                            const cursor =
                              corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize";
                            return (
                              <circle
                                key={corner}
                                cx={cxh}
                                cy={cyh}
                                r={10}
                                fill="#ffffff"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                style={{ cursor }}
                                onPointerDown={(e) =>
                                  beginResize(e, "sticker", rect, corner)
                                }
                              />
                            );
                          })}
                          <g>
                            <line
                              x1={s.width * 500}
                              y1={0}
                              x2={s.width * 500}
                              y2={-30}
                              stroke="#3b82f6"
                              strokeWidth={2}
                            />
                            <circle
                              cx={s.width * 500}
                              cy={-30}
                              r={10}
                              fill="#3b82f6"
                              style={{ cursor: "grab" }}
                              onPointerDown={(e) =>
                                beginRotate(e, "sticker", rect)
                              }
                            />
                          </g>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Floating tools + sticker palette (left) */}
        {showTools && (
          <div
            className="absolute left-2 top-2 bottom-2 w-24 z-20 rounded-lg bg-slate-900/92 backdrop-blur-sm border border-slate-700 shadow-xl flex flex-col text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1.5 py-1 border-b border-slate-700">
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                Tools
              </span>
              <button
                type="button"
                onClick={() => setShowTools(false)}
                className="p-0.5 rounded text-slate-400 hover:text-slate-100"
                aria-label="Close tools panel"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              {/* Rooms come first in the palette — they're the primary
                  unit of a floor plan, stickers are decoration. */}
              <div className="px-0.5 pt-0.5 pb-0.5 text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                Rooms
              </div>
              <button
                type="button"
                onClick={addRoomFromPalette}
                title="Add a new room — drag the handles to resize, rotate, or move it."
                className="w-full mb-1.5 flex items-center justify-center gap-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 p-1.5 text-[10px] text-slate-200 transition"
              >
                <HomeIcon className="h-3.5 w-3.5" />
                Add room
              </button>
              <div className="mb-1 flex items-center gap-1 rounded bg-slate-800/60 border border-slate-700 px-1.5 py-1 text-[9px] leading-tight text-slate-400">
                <Square className="h-3 w-3 shrink-0" />
                <span>
                  Rooms now move, resize, and rotate like stickers.
                </span>
              </div>

              <div className="px-0.5 pt-1 pb-0.5 text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                Stickers
              </div>
              {/* Search input — filters by label. ~60 kinds is a lot to
                  visually scan, so text search keeps the palette useful. */}
              <input
                type="text"
                value={stickerFilter}
                onChange={(e) => setStickerFilter(e.target.value)}
                placeholder="Find…"
                className="w-full mb-1 rounded bg-slate-800 border border-slate-700 px-1.5 py-1 text-[10px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary-500"
              />
              <div className="grid grid-cols-2 gap-0.5">
                {MOVE_STICKER_KINDS.filter((k) => {
                  const q = stickerFilter.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    k.toLowerCase().includes(q) ||
                    MOVE_STICKER_LABELS[k].toLowerCase().includes(q)
                  );
                }).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => addStickerFromPalette(k)}
                    className="group flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 p-0.5 transition aspect-square"
                    title={MOVE_STICKER_LABELS[k]}
                  >
                    <svg
                      viewBox="0 0 100 100"
                      className="w-5 h-5 text-slate-200 group-hover:text-white"
                    >
                      <StickerGlyph kind={k} stroke="currentColor" previewOnly />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Floating help / properties (right) — auto-opens when a
            sticker or a room is selected. */}
        {(showHelp || selectedSticker || selectedRoom) && (
          <div
            className="absolute right-2 top-2 bottom-2 w-36 z-20 rounded-lg bg-slate-900/92 backdrop-blur-sm border border-slate-700 shadow-xl flex flex-col text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1.5 py-1 border-b border-slate-700">
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold truncate">
                {selectedRoom ? "Room" : selectedSticker ? "Sticker" : "Help"}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (selectedSticker) selectSticker(null);
                  else if (selectedRoom) selectRoom(null);
                  else setShowHelp(false);
                }}
                className="p-0.5 rounded text-slate-400 hover:text-slate-100 shrink-0"
                aria-label="Close panel"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5">
              {selectedRoom ? (
                <RoomProperties
                  room={selectedRoom}
                  onUpdate={(changes) => onUpdateRoom(selectedRoom.id, changes)}
                  onDelete={() => {
                    if (
                      confirm(
                        `Delete "${selectedRoom.name}"? Items in it become unassigned.`
                      )
                    ) {
                      onDeleteRoom(selectedRoom.id);
                      selectRoom(null);
                    }
                  }}
                />
              ) : selectedSticker ? (
                <StickerProperties
                  sticker={selectedSticker}
                  onUpdate={(changes) =>
                    onUpdateSticker(selectedSticker.id, changes)
                  }
                  onDuplicate={() => {
                    onCreateSticker({
                      kind: selectedSticker.kind as MoveStickerKind,
                      x: clamp(selectedSticker.x + 0.03, 0, 0.9),
                      y: clamp(selectedSticker.y + 0.03, 0, 0.9),
                      width: selectedSticker.width,
                      height: selectedSticker.height,
                      rotation: selectedSticker.rotation,
                      label: selectedSticker.label,
                    });
                  }}
                  onDelete={() => {
                    onDeleteSticker(selectedSticker.id);
                    selectSticker(null);
                  }}
                />
              ) : (
                <div className="space-y-1.5 text-[10px] leading-snug">
                  <ul className="space-y-1">
                    <li className="flex gap-1">
                      <ImageIcon className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                      <span>
                        <b>Add image</b> up top or work on a grid.
                      </span>
                    </li>
                    <li className="flex gap-1">
                      <HomeIcon className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                      <span>
                        <b>Add room</b> stamps a new room you can
                        rename and resize.
                      </span>
                    </li>
                    <li className="flex gap-1">
                      <Shapes className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                      <span>
                        Open <b>Tools</b> to drop doors, windows, furniture.
                      </span>
                    </li>
                    <li className="flex gap-1">
                      <MousePointer2 className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                      <span>
                        Drag to move, corners resize, top handle rotates
                        (Shift = 15°).
                      </span>
                    </li>
                    <li className="flex gap-1">
                      <Trash2 className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                      <span>
                        Select + <kbd>Del</kbd> removes the room or sticker.
                      </span>
                    </li>
                  </ul>
                  <p className="pt-1 text-slate-400">
                    Auto-saves. <kbd>Esc</kbd> exits.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Selected-room properties panel ---------- */

function RoomProperties({
  room,
  onUpdate,
  onDelete,
}: {
  room: MoveRoom;
  onUpdate: (changes: Partial<MoveRoom>) => void;
  onDelete: () => void;
}) {
  const rect = roomRect(room);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-4 w-4 rounded-sm shrink-0 border border-white/30"
          style={{ background: room.color || "#8b5cf6" }}
        />
        <div className="text-[11px] font-medium text-slate-100 truncate">
          {room.name}
        </div>
      </div>

      <label className="block text-[9px] uppercase tracking-wider text-slate-400">
        Name
        <input
          type="text"
          value={room.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-slate-100"
        />
      </label>

      <label className="block text-[9px] uppercase tracking-wider text-slate-400">
        Colour
        <input
          type="color"
          value={room.color || "#8b5cf6"}
          onChange={(e) => onUpdate({ color: e.target.value })}
          className="mt-0.5 w-full h-6 rounded border border-slate-700 bg-slate-800 cursor-pointer"
        />
      </label>

      <label className="block text-[9px] uppercase tracking-wider text-slate-400">
        Rotation {Math.round(rect.rotation)}°
        <input
          type="range"
          min={-180}
          max={180}
          value={rect.rotation}
          onChange={(e) => onUpdate({ rotation: Number(e.target.value) })}
          className="mt-0.5 w-full"
        />
      </label>

      <div className="grid grid-cols-2 gap-1 text-[9px] text-slate-400">
        <div className="rounded bg-slate-800 px-1 py-0.5 text-center">
          W {(rect.width * 100).toFixed(0)}%
        </div>
        <div className="rounded bg-slate-800 px-1 py-0.5 text-center">
          H {(rect.height * 100).toFixed(0)}%
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          onUpdate({ rotation: ((rect.rotation + 90 + 180) % 360) - 180 })
        }
        className="w-full flex items-center justify-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-1 py-1 text-[10px] text-slate-200"
        title="Rotate 90°"
      >
        <RotateCw className="h-3 w-3" />
        Rotate 90°
      </button>

      <p className="text-[9px] text-slate-400 leading-snug">
        Rooms still act as drop targets — drag item chips onto this
        room to assign them.
      </p>

      <button
        type="button"
        onClick={onDelete}
        title="Delete room"
        className="w-full flex items-center justify-center gap-1 rounded bg-slate-800 hover:bg-red-900/40 border border-red-500/40 text-red-300 px-1 py-1 text-[10px]"
      >
        <Trash2 className="h-3 w-3" />
        Delete room
      </button>
    </div>
  );
}

/* ---------- Selected-sticker properties panel ---------- */

function StickerProperties({
  sticker,
  onUpdate,
  onDuplicate,
  onDelete,
}: {
  sticker: MoveSticker;
  onUpdate: (changes: Partial<MoveSticker>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <svg viewBox="0 0 100 100" className="w-6 h-6 text-slate-200 shrink-0">
          <StickerGlyph
            kind={sticker.kind as MoveStickerKind}
            stroke="currentColor"
            previewOnly
          />
        </svg>
        <div className="text-[11px] font-medium text-slate-100 capitalize truncate">
          {MOVE_STICKER_LABELS[sticker.kind as MoveStickerKind] ?? sticker.kind}
        </div>
      </div>

      <label className="block text-[9px] uppercase tracking-wider text-slate-400">
        Label
        <input
          type="text"
          value={sticker.label ?? ""}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-slate-100"
          placeholder={sticker.kind === "label" ? "Text" : "Note"}
        />
      </label>

      <label className="block text-[9px] uppercase tracking-wider text-slate-400">
        Colour
        <input
          type="color"
          value={sticker.color ?? "#1e293b"}
          onChange={(e) => onUpdate({ color: e.target.value })}
          className="mt-0.5 w-full h-6 rounded border border-slate-700 bg-slate-800 cursor-pointer"
        />
      </label>

      <label className="block text-[9px] uppercase tracking-wider text-slate-400">
        Rotation {Math.round(sticker.rotation)}°
        <input
          type="range"
          min={-180}
          max={180}
          value={sticker.rotation}
          onChange={(e) => onUpdate({ rotation: Number(e.target.value) })}
          className="mt-0.5 w-full"
        />
      </label>

      <div className="grid grid-cols-2 gap-1 text-[9px] text-slate-400">
        <div className="rounded bg-slate-800 px-1 py-0.5 text-center">
          W {(sticker.width * 100).toFixed(0)}%
        </div>
        <div className="rounded bg-slate-800 px-1 py-0.5 text-center">
          H {(sticker.height * 100).toFixed(0)}%
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          onUpdate({ rotation: ((sticker.rotation + 90 + 180) % 360) - 180 })
        }
        className="w-full flex items-center justify-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-1 py-1 text-[10px] text-slate-200"
        title="Rotate 90°"
      >
        <RotateCw className="h-3 w-3" />
        Rotate 90°
      </button>

      <div className="grid grid-cols-2 gap-1 pt-0.5">
        <button
          type="button"
          onClick={onDuplicate}
          title="Duplicate"
          className="flex items-center justify-center gap-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-1 py-1 text-[10px] text-slate-200"
        >
          <Copy className="h-3 w-3" />
          Copy
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Delete"
          className="flex items-center justify-center gap-1 rounded bg-slate-800 hover:bg-red-900/40 border border-red-500/40 text-red-300 px-1 py-1 text-[10px]"
        >
          <Trash2 className="h-3 w-3" />
          Del
        </button>
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
