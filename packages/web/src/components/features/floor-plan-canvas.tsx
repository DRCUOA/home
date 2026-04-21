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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { MoveItem, MoveRoom } from "@hcc/shared";
import { cn } from "@/lib/cn";

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
  selectedItemIds: Set<string>;
  /** Called when the user drops one or more items onto a room. */
  onDropItems: (itemIds: string[], roomId: string, side: FloorPlanSide) => void;
  onToggleItemSelected: (itemId: string) => void;
  onCreateRoom: (polygon: { x: number; y: number }[], name: string) => void;
  onDeleteRoom: (roomId: string) => void;
  editing: boolean;
  onToggleEditing: () => void;
  onUploadPlan: () => void;
}

export function FloorPlanCanvas({
  side,
  title,
  imageUrl,
  rooms,
  items,
  selectedItemIds,
  onDropItems,
  onToggleItemSelected,
  onCreateRoom,
  onDeleteRoom,
  editing,
  onToggleEditing,
  onUploadPlan,
}: FloorPlanCanvasProps) {
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
    const hit = rooms.find((r) => pointInPolygon(p, r.polygon));
    setDropRoomId(hit?.id ?? null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const p = toLocal(e);
    if (!p) {
      setDropRoomId(null);
      return;
    }
    const hit = rooms.find((r) => pointInPolygon(p, r.polygon));
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

  const polyToPath = (poly: { x: number; y: number }[]) =>
    poly.length === 0
      ? ""
      : poly.map((p, i) => `${i === 0 ? "M" : "L"}${p.x * 1000},${p.y * 1000}`).join(" ") +
        " Z";

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
                Done
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" />
                Edit rooms
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
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center p-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No floor plan uploaded yet. Click <b>Upload plan</b> above and
              pick a PNG, JPG, or PDF image of your {side === "origin" ? "current" : "new"} home.
            </p>
          </div>
        )}

        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          onClick={handleSvgClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Existing room polygons */}
          {rooms.map((room) => {
            const active = dropRoomId === room.id || hoverRoomId === room.id;
            return (
              <g key={room.id}>
                <path
                  d={polyToPath(room.polygon)}
                  fill={room.color}
                  fillOpacity={active ? 0.45 : 0.18}
                  stroke={room.color}
                  strokeOpacity={0.95}
                  strokeWidth={3}
                  onMouseEnter={() => setHoverRoomId(room.id)}
                  onMouseLeave={() => setHoverRoomId(null)}
                  onClick={(e) => {
                    if (editing) e.stopPropagation();
                  }}
                  style={{ cursor: editing ? "default" : "pointer" }}
                />
                {/* Room label at polygon centroid */}
                {room.polygon.length >= 3 && (
                  (() => {
                    const cx =
                      (room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length) *
                      1000;
                    const cy =
                      (room.polygon.reduce((s, p) => s + p.y, 0) / room.polygon.length) *
                      1000;
                    const count = itemsByRoom.get(room.id)?.length ?? 0;
                    return (
                      <g>
                        <text
                          x={cx}
                          y={cy}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#0f172a"
                          fontSize={26}
                          fontWeight={700}
                          paintOrder="stroke"
                          stroke="#ffffff"
                          strokeWidth={5}
                        >
                          {room.name}
                        </text>
                        {count > 0 && (
                          <text
                            x={cx}
                            y={cy + 30}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#334155"
                            fontSize={20}
                            paintOrder="stroke"
                            stroke="#ffffff"
                            strokeWidth={4}
                          >
                            {count} item{count === 1 ? "" : "s"}
                          </text>
                        )}
                      </g>
                    );
                  })()
                )}
              </g>
            );
          })}

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
