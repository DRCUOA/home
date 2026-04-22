import { useMemo, useRef, useState } from "react";
import {
  Pencil,
  Trash2,
  MousePointer2,
  Check,
  Plus,
  X,
  Package,
  CheckCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { MoveItem, MoveRoom, MoveSticker, MoveStickerKind } from "@hcc/shared";
import { cn } from "@/lib/cn";
import { StickerGlyph } from "./sticker-icons";
import type { ExampleRoom, ExampleSticker } from "@/lib/example-plan";

/**
 * HERO feature of the Moving section.
 *
 * Renders two floor plan images side by side (origin + destination),
 * with room polygons as overlays and item chips that drag from a
 * room on one plan to a room on the other.
 *
 * All drawing is SVG in 0..1 coordinate space — polygons scale with
 * any render size, so rooms stay aligned when the screen resizes.
 *
 * Two modes:
 *   - "move" mode (default): items are draggable between rooms.
 *   - "edit" mode: the user draws polygons on the current side by
 *     clicking to place vertices; Enter/double-click closes the shape.
 */

export type FloorPlanSide = "origin" | "destination";

interface FloorPlanCanvasProps {
  side: FloorPlanSide;
  title: string;
  imageUrl: string | null;
  rooms: MoveRoom[];
  items: MoveItem[];
  /** Freeform sticker overlays — rendered read-only on the inline canvas. */
  stickers?: MoveSticker[];
  selectedItemIds: Set<string>;
  /** Called when the user drops one or more items onto a room. */
  onDropItems: (itemIds: string[], roomId: string, side: FloorPlanSide) => void;
  onToggleItemSelected: (itemId: string) => void;
  onCreateRoom: (polygon: { x: number; y: number }[], name: string) => void;
  onDeleteRoom: (roomId: string) => void;
  editing: boolean;
  onToggleEditing: () => void;
  onUploadPlan: () => void;
  /** Clear the existing plan image from this side. The underlying file
   *  stays in the user's gallery — only the association is removed. */
  onRemovePlan?: () => void;
  /** Example plan rendered as a muted preview when the side has no real
   *  rooms, stickers, or uploaded image. The user can save the example
   *  as their own starter plan (see onUseExample). */
  exampleRooms?: ExampleRoom[];
  exampleStickers?: ExampleSticker[];
  /** Clone the example rooms + stickers as real records for this side. */
  onUseExample?: () => void;
}

export function FloorPlanCanvas({
  side,
  title,
  imageUrl,
  rooms,
  items,
  stickers = [],
  selectedItemIds,
  onDropItems,
  onToggleItemSelected,
  onCreateRoom,
  onDeleteRoom,
  editing,
  onToggleEditing,
  onUploadPlan,
  onRemovePlan,
  exampleRooms,
  exampleStickers,
  onUseExample,
}: FloorPlanCanvasProps) {
  // Show the example layout only when the side is completely empty —
  // no rooms the user drew, no stickers, no uploaded image. Once they
  // save the example, real records exist and this preview goes away.
  const isEmpty =
    !imageUrl && rooms.length === 0 && stickers.length === 0;
  const showExample =
    isEmpty && !!exampleRooms?.length && !!exampleStickers?.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x: number; y: number }[]>([]);
  const [draftName, setDraftName] = useState("");
  const [hoverRoomId, setHoverRoomId] = useState<string | null>(null);
  const [dropRoomId, setDropRoomId] = useState<string | null>(null);

  /* Pre-compute items per room (by the appropriate side). */
  const itemsByRoom = useMemo(() => {
    const map = new Map<string, MoveItem[]>();
    for (const room of rooms) map.set(room.id, []);
    for (const item of items) {
      const rid =
        side === "origin" ? item.origin_room_id : item.destination_room_id;
      if (rid && map.has(rid)) map.get(rid)!.push(item);
    }
    return map;
  }, [rooms, items, side]);

  const unassignedItems = useMemo(() => {
    return items.filter((item) => {
      const rid =
        side === "origin" ? item.origin_room_id : item.destination_room_id;
      return !rid;
    });
  }, [items, side]);

  /* ----- Coordinate helpers ----- */

  const toLocal = (e: React.MouseEvent | React.DragEvent): { x: number; y: number } | null => {
    const svg = containerRef.current?.querySelector("svg") as SVGSVGElement | null;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const pointInPolygon = (p: { x: number; y: number }, poly: { x: number; y: number }[]): boolean => {
    if (poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect =
        yi > p.y !== yj > p.y &&
        p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  /**
   * Rooms now carry a rectangle (x/y/width/height/rotation) so their
   * footprint matches the sticker geometry model. A drop hit-test on a
   * rect-with-rotation is a 2D axis transform: rotate the pointer into
   * the rect's local frame, then do a trivial AABB check. Legacy rooms
   * that still only have a polygon fall back to the polygon test.
   */
  const pointInRoom = (p: { x: number; y: number }, room: MoveRoom): boolean => {
    if (room.width && room.width > 0) {
      const cx = room.x + room.width / 2;
      const cy = room.y + room.height / 2;
      const rad = ((room.rotation ?? 0) * Math.PI) / 180;
      const cos = Math.cos(-rad);
      const sin = Math.sin(-rad);
      const dx = p.x - cx;
      const dy = p.y - cy;
      const localX = dx * cos - dy * sin + room.width / 2;
      const localY = dx * sin + dy * cos + room.height / 2;
      return (
        localX >= 0 &&
        localX <= room.width &&
        localY >= 0 &&
        localY <= room.height
      );
    }
    return pointInPolygon(p, room.polygon);
  };

  /* ----- Draw-polygon mode ----- */

  const handleSvgClick = (e: React.MouseEvent) => {
    if (!editing) return;
    const p = toLocal(e);
    if (!p) return;
    setDraft((prev) => [...prev, p]);
  };

  const commitDraft = () => {
    if (draft.length < 3) return;
    const name = draftName.trim() || `Room ${rooms.length + 1}`;
    onCreateRoom(draft, name);
    setDraft([]);
    setDraftName("");
  };

  const cancelDraft = () => {
    setDraft([]);
    setDraftName("");
  };

  /* ----- Drag-drop items between rooms ----- */

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const p = toLocal(e);
    if (!p) return;
    const hit = rooms.find((r) => pointInRoom(p, r));
    setDropRoomId(hit?.id ?? null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const p = toLocal(e);
    if (!p) {
      setDropRoomId(null);
      return;
    }
    const hit = rooms.find((r) => pointInRoom(p, r));
    if (!hit) {
      setDropRoomId(null);
      return;
    }

    const payload = e.dataTransfer.getData("application/x-move-items");
    const ids = payload ? (JSON.parse(payload) as string[]) : [];
    if (ids.length > 0) {
      onDropItems(ids, hit.id, side);
    }
    setDropRoomId(null);
  };

  const handleDragLeave = () => setDropRoomId(null);

  /* ----- Item chip drag start ----- */

  const startItemDrag = (e: React.DragEvent, itemId: string) => {
    // If multi-selected, drag the whole selection. Otherwise just this one.
    const ids = selectedItemIds.has(itemId)
      ? Array.from(selectedItemIds)
      : [itemId];
    e.dataTransfer.setData("application/x-move-items", JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  };

  /* ----- Render ----- */

  // Rooms are open polylines (2+ points). We never auto-close — the
  // user decides whether the last point meets the first.
  const polyToPath = (poly: { x: number; y: number }[]) =>
    poly.length === 0
      ? ""
      : poly
          .map((p, i) => `${i === 0 ? "M" : "L"}${p.x * 1000},${p.y * 1000}`)
          .join(" ");

  return (
    <div className="flex flex-col gap-2 min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {title}
        </h3>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={editing ? "primary" : "secondary"}
            className="min-h-10"
            onClick={onToggleEditing}
          >
            {editing ? (
              <>
                <MousePointer2 className="h-3.5 w-3.5" />
                Close editor
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" />
                Edit plan
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="min-h-10"
            onClick={onUploadPlan}
          >
            {imageUrl ? "Replace plan" : "Upload plan"}
          </Button>
          {imageUrl && onRemovePlan && (
            <Button
              size="sm"
              variant="secondary"
              className="min-h-10 text-red-600 dark:text-red-400"
              onClick={onRemovePlan}
              title="Remove the uploaded plan from this side (the file stays in your gallery)"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove plan
            </Button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 aspect-[4/3] select-none"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${title} floor plan`}
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
        ) : isEmpty && !showExample ? (
          // Only when the side is truly empty — no image, no rooms, no
          // stickers, and no example to fall back on — show the nudge
          // to upload. Otherwise the SVG below carries the content and
          // this overlay would just clutter it.
          <div className="absolute inset-0 flex items-center justify-center text-center p-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No floor plan uploaded yet. Click <b>Upload plan</b> above and
              pick a PNG, JPG, or PDF image of your {side === "origin" ? "current" : "new"} home.
            </p>
          </div>
        ) : null}

        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          onClick={handleSvgClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* ---------- Example plan preview (when empty) ---------- */}
          {showExample && exampleRooms && exampleStickers && (
            <g opacity={0.55} style={{ pointerEvents: "none" }}>
              {exampleRooms.map((room, i) => {
                const d = polyToPath(room.polygon);
                const xs = room.polygon.map((p) => p.x);
                const ys = room.polygon.map((p) => p.y);
                const lx = Math.min(...xs) * 1000 + 12;
                const ly = Math.min(...ys) * 1000 + 20;
                return (
                  <g key={`ex-room-${i}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke={room.color}
                      strokeWidth={3}
                      strokeDasharray="10 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <text
                      x={lx}
                      y={ly}
                      textAnchor="start"
                      dominantBaseline="hanging"
                      fill="#0f172a"
                      fontSize={18}
                      fontWeight={700}
                      paintOrder="stroke"
                      stroke="#ffffff"
                      strokeWidth={4}
                    >
                      {room.name}
                    </text>
                  </g>
                );
              })}
              {exampleStickers.map((s, i) => (
                <g
                  key={`ex-sticker-${i}`}
                  transform={`translate(${s.x * 1000}, ${s.y * 1000}) rotate(${s.rotation} ${s.width * 500} ${s.height * 500})`}
                >
                  {s.kind === "label" ? (
                    <foreignObject
                      x={0}
                      y={0}
                      width={s.width * 1000}
                      height={s.height * 1000}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#0f172a",
                          fontSize: 14,
                          fontWeight: 700,
                          textAlign: "center",
                        }}
                      >
                        {s.label ?? "Label"}
                      </div>
                    </foreignObject>
                  ) : (
                    <g
                      transform={`scale(${(s.width * 1000) / 100}, ${(s.height * 1000) / 100})`}
                    >
                      <StickerGlyph kind={s.kind} />
                    </g>
                  )}
                </g>
              ))}
            </g>
          )}

          {/* Rooms — rendered as rectangles so they match the editor's
              sticker-style geometry. Legacy polygon-only rooms (created
              before the rooms-as-stickers refactor and not yet
              backfilled) fall through to the polyline path. */}
          {rooms.map((room) => {
            const active = dropRoomId === room.id || hoverRoomId === room.id;
            const hasRect = room.width && room.width > 0;
            const count = itemsByRoom.get(room.id)?.length ?? 0;

            if (hasRect) {
              const cx = (room.x + room.width / 2) * 1000;
              const cy = (room.y + room.height / 2) * 1000;
              return (
                <g
                  key={room.id}
                  transform={`translate(${room.x * 1000}, ${room.y * 1000}) rotate(${room.rotation ?? 0} ${room.width * 500} ${room.height * 500})`}
                >
                  {/* Filled body doubles as the drop hit target — a
                      rect is much easier to hover than a thin polyline,
                      which matters because dropping an item chip is
                      the core interaction of this canvas. */}
                  <rect
                    x={0}
                    y={0}
                    width={room.width * 1000}
                    height={room.height * 1000}
                    fill={room.color}
                    fillOpacity={active ? 0.28 : 0.14}
                    stroke={room.color}
                    strokeOpacity={active ? 1 : 0.85}
                    strokeWidth={active ? 5 : 3}
                    rx={6}
                    ry={6}
                    onMouseEnter={() => setHoverRoomId(room.id)}
                    onMouseLeave={() => setHoverRoomId(null)}
                    style={{ cursor: editing ? "default" : "pointer" }}
                  />
                  {/* Centred name (same treatment as the editor) */}
                  <text
                    x={room.width * 500}
                    y={room.height * 500 - (count > 0 ? 10 : 0)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#0f172a"
                    fontSize={Math.max(14, Math.min(22, room.height * 1000 * 0.14))}
                    fontWeight={700}
                    paintOrder="stroke"
                    stroke="#ffffff"
                    strokeWidth={4}
                    pointerEvents="none"
                  >
                    {room.name}
                  </text>
                  {count > 0 && (
                    <text
                      x={room.width * 500}
                      y={room.height * 500 + 14}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#334155"
                      fontSize={12}
                      paintOrder="stroke"
                      stroke="#ffffff"
                      strokeWidth={3}
                      pointerEvents="none"
                    >
                      {count} item{count === 1 ? "" : "s"}
                    </text>
                  )}
                  {/* Keep the anchored top-left label suppressed here —
                      rect rooms use a centred label since the whole
                      shape is enclosed (no ambiguity about which side
                      is "inside"). */}
                  {/* cx / cy reserved for future features (tooltip anchoring) */}
                  <desc>{`${cx},${cy}`}</desc>
                </g>
              );
            }

            /* Legacy polygon fallback — matches the pre-refactor look. */
            const d = polyToPath(room.polygon);
            return (
              <g key={room.id}>
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={32}
                  onMouseEnter={() => setHoverRoomId(room.id)}
                  onMouseLeave={() => setHoverRoomId(null)}
                  onClick={(e) => {
                    if (editing) e.stopPropagation();
                  }}
                  style={{
                    cursor: editing ? "default" : "pointer",
                    pointerEvents: "stroke",
                  }}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={room.color}
                  strokeOpacity={active ? 1 : 0.95}
                  strokeWidth={active ? 5 : 3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
                {room.polygon.length >= 2 &&
                  (() => {
                    const xs = room.polygon.map((p) => p.x);
                    const ys = room.polygon.map((p) => p.y);
                    const minX = Math.min(...xs) * 1000;
                    const minY = Math.min(...ys) * 1000;
                    const lx = minX + 12;
                    const ly = minY + 20;
                    return (
                      <g>
                        <text
                          x={lx}
                          y={ly}
                          textAnchor="start"
                          dominantBaseline="hanging"
                          fill="#0f172a"
                          fontSize={18}
                          fontWeight={700}
                          paintOrder="stroke"
                          stroke="#ffffff"
                          strokeWidth={4}
                        >
                          {room.name}
                        </text>
                        {count > 0 && (
                          <text
                            x={lx}
                            y={ly + 22}
                            textAnchor="start"
                            dominantBaseline="hanging"
                            fill="#334155"
                            fontSize={14}
                            paintOrder="stroke"
                            stroke="#ffffff"
                            strokeWidth={3}
                          >
                            {count} item{count === 1 ? "" : "s"}
                          </text>
                        )}
                      </g>
                    );
                  })()}
              </g>
            );
          })}

          {/* Read-only sticker overlays */}
          {stickers.map((s) => (
            <g
              key={s.id}
              transform={`translate(${s.x * 1000}, ${s.y * 1000}) rotate(${s.rotation} ${s.width * 500} ${s.height * 500})`}
              style={{ pointerEvents: "none" }}
            >
              {s.kind === "label" ? (
                <foreignObject
                  x={0}
                  y={0}
                  width={s.width * 1000}
                  height={s.height * 1000}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: s.color ?? "#0f172a",
                      fontSize: 16,
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  >
                    {s.label ?? "Label"}
                  </div>
                </foreignObject>
              ) : (
                <g
                  transform={`scale(${(s.width * 1000) / 100}, ${(s.height * 1000) / 100})`}
                >
                  <StickerGlyph
                    kind={s.kind as MoveStickerKind}
                    stroke={s.color ?? undefined}
                  />
                </g>
              )}
            </g>
          ))}

          {/* Draft polygon being drawn */}
          {editing && draft.length > 0 && (
            <>
              <polyline
                points={draft.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
                stroke="#db2777"
                strokeWidth={3}
                fill="none"
                strokeDasharray="8 6"
              />
              {draft.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x * 1000}
                  cy={p.y * 1000}
                  r={8}
                  fill="#db2777"
                />
              ))}
            </>
          )}
        </svg>

        {editing && draft.length >= 3 && (
          <div className="absolute left-2 right-2 bottom-2 bg-white/95 dark:bg-slate-900/95 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-2 flex gap-2 items-center">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={`Room ${rooms.length + 1} name`}
              className="flex-1 min-w-0 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100"
            />
            <Button size="sm" className="min-h-10" onClick={commitDraft}>
              <Check className="h-3.5 w-3.5" />
              Save
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="min-h-10"
              onClick={cancelDraft}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {editing && draft.length < 3 && (
          <div className="absolute left-2 right-2 top-2 bg-white/95 dark:bg-slate-900/95 rounded-md px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 shadow border border-slate-200 dark:border-slate-700">
            Click the plan to place corners — at least 3 to form a room.
          </div>
        )}

        {/* Example-plan CTA: appears only when the canvas is empty and an
            example is provided. Saves the example rooms + stickers as
            real records the user can then edit freely. */}
        {showExample && onUseExample && (
          <div className="absolute left-2 right-2 bottom-2 bg-white/95 dark:bg-slate-900/95 rounded-lg shadow-lg border border-primary-300 dark:border-primary-700 p-2 flex gap-2 items-center">
            <Sparkles className="h-4 w-4 text-primary-500 shrink-0" />
            <p className="text-xs text-slate-700 dark:text-slate-200 flex-1 min-w-0">
              Example plan — <b>save it as your own</b> to start editing, or
              draw your own from scratch.
            </p>
            <Button size="sm" className="min-h-10" onClick={onUseExample}>
              <Check className="h-3.5 w-3.5" />
              Save as my plan
            </Button>
          </div>
        )}
      </div>

      {/* Room list with draggable item chips */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {rooms.length === 0 && !editing && (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
            No rooms yet. Click <b>Edit rooms</b> to draw rooms on the plan.
          </p>
        )}
        {rooms.map((room) => {
          const roomItems = itemsByRoom.get(room.id) ?? [];
          return (
            <div
              key={room.id}
              className={cn(
                "rounded-lg border px-2 py-1.5",
                dropRoomId === room.id
                  ? "border-primary-400 bg-primary-50 dark:bg-primary-900/30"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDropRoomId(room.id);
              }}
              onDragLeave={() => setDropRoomId(null)}
              onDrop={(e) => {
                e.preventDefault();
                const payload = e.dataTransfer.getData("application/x-move-items");
                const ids = payload ? (JSON.parse(payload) as string[]) : [];
                if (ids.length > 0) onDropItems(ids, room.id, side);
                setDropRoomId(null);
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="inline-block h-3 w-3 rounded-sm shrink-0"
                    style={{ background: room.color }}
                  />
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {room.name}
                  </span>
                  <Badge variant="default">{roomItems.length}</Badge>
                </div>
                {editing && (
                  <button
                    type="button"
                    onClick={() => onDeleteRoom(room.id)}
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500"
                    aria-label="Delete room"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {roomItems.length === 0 ? (
                  <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                    Drop items here
                  </span>
                ) : (
                  roomItems.map((item) => (
                    <ItemChip
                      key={item.id}
                      item={item}
                      selected={selectedItemIds.has(item.id)}
                      onClick={() => onToggleItemSelected(item.id)}
                      onDragStart={(e) => startItemDrag(e, item.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}

        {unassignedItems.length > 0 && (
          <div
            className={cn(
              "rounded-lg border border-dashed px-2 py-1.5",
              "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60"
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Package className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Unassigned ({side === "origin" ? "current home" : "new home"})
              </span>
              <Badge variant="default">{unassignedItems.length}</Badge>
            </div>
            <div className="flex flex-wrap gap-1">
              {unassignedItems.map((item) => (
                <ItemChip
                  key={item.id}
                  item={item}
                  selected={selectedItemIds.has(item.id)}
                  onClick={() => onToggleItemSelected(item.id)}
                  onDragStart={(e) => startItemDrag(e, item.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedItemIds.size > 1 && (
        <div className="rounded-md bg-primary-50 dark:bg-primary-900/30 px-3 py-2 text-xs text-primary-800 dark:text-primary-200 flex items-center gap-2">
          <CheckCheck className="h-3.5 w-3.5" />
          {selectedItemIds.size} items selected — drag any one to move the group.
        </div>
      )}
    </div>
  );
}

function ItemChip({
  item,
  selected,
  onClick,
  onDragStart,
}: {
  item: MoveItem;
  selected: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        "cursor-grab active:cursor-grabbing inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        selected
          ? "border-primary-500 bg-primary-100 dark:bg-primary-900/50 text-primary-800 dark:text-primary-200"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
      )}
      title={item.name}
    >
      <Package className="h-3 w-3" />
      <span className="truncate max-w-[8rem]">{item.name}</span>
      {item.quantity > 1 && (
        <span className="text-[10px] text-slate-400">×{item.quantity}</span>
      )}
    </button>
  );
}

export function AddRoomButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" className="min-h-10" onClick={onClick}>
      <Plus className="h-3.5 w-3.5" />
      Add room
    </Button>
  );
}
