/**
 * Right-side properties sidebar for the Floor Plan Designer.
 *
 * Tabs (spec: informationArchitecture.rightSidebar):
 *   - Properties (always)
 *   - Style (advanced)
 *   - Dimensions (advanced)
 *   - Layers (advanced — toggled from top bar too)
 *
 * When a wall or annotation is selected we route to its dedicated panel;
 * otherwise we fall through to room/sticker panels (backed by moving-
 * workflow rows) or an empty state with workspace tips.
 */

import {
  Copy,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Ruler,
  Settings2,
  Sliders,
  Trash2,
  Unlock,
} from "lucide-react";
import { useState } from "react";
import type { MoveRoom, MoveSticker, MoveStickerKind } from "@hcc/shared";
import {
  FLOOR_PLAN_BEGINNER_PALETTE,
  FLOOR_PLAN_LINE_STYLES,
  FLOOR_PLAN_PRESET_SIZES,
  FLOOR_PLAN_WALL_THICKNESS_PRESETS,
  MOVE_STICKER_LABELS,
} from "@hcc/shared";
import { useFloorPlanStore } from "@/stores/floor-plan";
import { StickerGlyph } from "../sticker-icons";
import { cn } from "@/lib/cn";
import { formatDimension } from "@/lib/floor-plan/coords";

interface Props {
  selectedKind:
    | "none"
    | "room"
    | "sticker"
    | "wall"
    | "opening"
    | "annotation"
    | "mixed";
  selectedIds: string[];
  rooms: MoveRoom[];
  stickers: MoveSticker[];
  onUpdateRoom: (id: string, patch: Partial<MoveRoom>) => void;
  onUpdateSticker: (id: string, patch: Partial<MoveSticker>) => void;
  onDeleteRoom: (id: string) => void;
  onDeleteSticker: (id: string) => void;
  onDuplicateSticker: (s: MoveSticker) => void;
}

type Tab = "properties" | "style" | "dimensions" | "layers";

export function PropertiesSidebar(props: Props) {
  const mode = useFloorPlanStore((s) => s.mode);
  const [tab, setTab] = useState<Tab>("properties");

  const tabs: { id: Tab; label: string; icon: React.ReactNode; advanced?: boolean }[] = [
    { id: "properties", label: "Properties", icon: <Settings2 className="h-3.5 w-3.5" /> },
    { id: "style", label: "Style", icon: <Sliders className="h-3.5 w-3.5" />, advanced: true },
    { id: "dimensions", label: "Dimensions", icon: <Ruler className="h-3.5 w-3.5" />, advanced: true },
    { id: "layers", label: "Layers", icon: <Layers className="h-3.5 w-3.5" />, advanced: true },
  ];

  return (
    <aside
      aria-label="Properties"
      className="w-64 shrink-0 flex flex-col border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100"
    >
      {/* Tabs */}
      <div role="tablist" className="flex items-stretch border-b border-slate-200 dark:border-slate-700">
        {tabs
          .filter((t) => !t.advanced || mode === "advanced")
          .map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 text-[11px] font-medium transition border-b-2",
                tab === t.id
                  ? "text-primary-600 dark:text-primary-300 border-primary-500"
                  : "text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200"
              )}
            >
              {t.icon}
              <span className="hidden lg:inline">{t.label}</span>
            </button>
          ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-2">
        {tab === "properties" && <PropertiesTab {...props} />}
        {tab === "style" && <StyleTab {...props} />}
        {tab === "dimensions" && <DimensionsTab {...props} />}
        {tab === "layers" && <LayersTab />}
      </div>
    </aside>
  );
}

/* ---------- tabs ---------- */

function PropertiesTab(props: Props) {
  const { selectedKind, selectedIds, rooms, stickers } = props;
  if (selectedKind === "none") return <EmptyState />;
  if (selectedKind === "wall") return <WallPanel id={selectedIds[0]} />;
  if (selectedKind === "room") {
    if (selectedIds.length > 1) return <MultiSelectPanel count={selectedIds.length} kind="room" />;
    const room = rooms.find((r) => r.id === selectedIds[0]);
    if (!room) return <EmptyState />;
    return <RoomPanel room={room} {...props} />;
  }
  if (selectedKind === "sticker") {
    if (selectedIds.length > 1) return <MultiSelectPanel count={selectedIds.length} kind="sticker" />;
    const sticker = stickers.find((s) => s.id === selectedIds[0]);
    if (!sticker) return <EmptyState />;
    return <StickerPanel sticker={sticker} {...props} />;
  }
  return <EmptyState />;
}

function StyleTab(props: Props) {
  const { selectedKind, selectedIds, stickers } = props;
  if (selectedKind === "sticker" && selectedIds.length === 1) {
    const s = stickers.find((x) => x.id === selectedIds[0]);
    if (s) return <StickerStyle sticker={s} onUpdate={(p) => props.onUpdateSticker(s.id, p)} />;
  }
  if (selectedKind === "wall") return <WallStyle id={selectedIds[0]} />;
  return (
    <p className="text-[11px] text-slate-400 italic">
      Select an object to edit its appearance.
    </p>
  );
}

function DimensionsTab(props: Props) {
  const viewport = useFloorPlanStore((s) => s.viewport);
  const setViewport = useFloorPlanStore((s) => s.setViewport);
  return (
    <div className="space-y-3">
      <section>
        <SectionTitle>Canvas scale</SectionTitle>
        <label className="block text-[10px] uppercase tracking-wider text-slate-400">
          Real-world height
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={100}
            step={0.5}
            value={viewport.realWorldHeightMeters}
            onChange={(e) =>
              setViewport({ realWorldHeightMeters: Number(e.target.value) || 1 })
            }
            className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[11px]"
          />
          <span className="text-[10px] text-slate-400">
            {viewport.unit === "metric" ? "m" : "ft"}
          </span>
        </div>
        <p className="mt-1 text-[10px] text-slate-400 leading-snug">
          Calibrates every dimension label. Adjust so a known wall matches its
          real measurement.
        </p>
      </section>

      <section>
        <SectionTitle>Grid</SectionTitle>
        <label className="flex items-center gap-2 text-[11px]">
          <input
            type="checkbox"
            checked={viewport.showGrid}
            onChange={(e) => setViewport({ showGrid: e.target.checked })}
          />
          Show grid
        </label>
        <label className="flex items-center gap-2 text-[11px] mt-1">
          <input
            type="checkbox"
            checked={viewport.snapToGrid}
            onChange={(e) => setViewport({ snapToGrid: e.target.checked })}
          />
          Snap to grid
        </label>
        <label className="flex items-center gap-2 text-[11px] mt-1">
          <input
            type="checkbox"
            checked={viewport.snapToObjects}
            onChange={(e) => setViewport({ snapToObjects: e.target.checked })}
          />
          Snap to objects
        </label>
        <label className="block mt-2 text-[10px] uppercase tracking-wider text-slate-400">
          Grid size
        </label>
        <input
          type="range"
          min={10}
          max={120}
          step={5}
          value={viewport.gridSizePx}
          onChange={(e) => setViewport({ gridSizePx: Number(e.target.value) })}
          className="w-full"
        />
        <div className="text-[10px] text-slate-400">{viewport.gridSizePx}px cell</div>
      </section>

      <section>
        <SectionTitle>Selected object</SectionTitle>
        {props.selectedIds.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">Nothing selected.</p>
        ) : (
          <SelectedDimensionsControls {...props} />
        )}
      </section>
    </div>
  );
}

function LayersTab() {
  const layers = useFloorPlanStore((s) => s.doc.layers);
  const updateLayer = useFloorPlanStore((s) => s.updateLayer);
  const addLayer = useFloorPlanStore((s) => s.addLayer);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <SectionTitle>Layers</SectionTitle>
        <button
          type="button"
          onClick={() => addLayer(`Layer ${layers.length + 1}`)}
          className="text-[11px] text-primary-600 dark:text-primary-300 hover:underline"
        >
          + Add
        </button>
      </div>
      <ul className="space-y-1">
        {layers
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-1.5 rounded border border-slate-200 dark:border-slate-700 px-1.5 py-1 bg-white dark:bg-slate-800"
            >
              <button
                type="button"
                onClick={() => updateLayer(l.id, { visible: !l.visible })}
                aria-label={l.visible ? "Hide layer" : "Show layer"}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {l.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => updateLayer(l.id, { locked: !l.locked })}
                aria-label={l.locked ? "Unlock layer" : "Lock layer"}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {l.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
              <input
                type="text"
                value={l.name}
                onChange={(e) => updateLayer(l.id, { name: e.target.value })}
                className="flex-1 bg-transparent text-[11px] focus:outline-none"
              />
            </li>
          ))}
      </ul>
    </div>
  );
}

/* ---------- object panels ---------- */

function RoomPanel({
  room,
  onUpdateRoom,
  onDeleteRoom,
}: {
  room: MoveRoom;
} & Props) {
  const viewport = useFloorPlanStore((s) => s.viewport);
  const lengthLabel = formatDimension(room.width ?? 0, viewport);
  const widthLabel = formatDimension(room.height ?? 0, viewport);
  const areaLabel = formatDimension((room.width ?? 0) * (room.height ?? 0), viewport, { precision: 2 });

  return (
    <div className="space-y-2">
      <Field label="Name">
        <input
          type="text"
          value={room.name}
          onChange={(e) => onUpdateRoom(room.id, { name: e.target.value })}
          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[12px]"
        />
      </Field>
      <Field label="Color">
        <ColorSwatches
          value={room.color || "#8b5cf6"}
          onChange={(c) => onUpdateRoom(room.id, { color: c })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-1">
        <Field label="Width">
          <DimensionInput
            value={room.width ?? 0}
            onChange={(v) => onUpdateRoom(room.id, { width: v })}
          />
        </Field>
        <Field label="Height">
          <DimensionInput
            value={room.height ?? 0}
            onChange={(v) => onUpdateRoom(room.id, { height: v })}
          />
        </Field>
      </div>
      <Field label="Rotation">
        <div className="flex items-center gap-1">
          <input
            type="range"
            min={-180}
            max={180}
            value={room.rotation ?? 0}
            onChange={(e) => onUpdateRoom(room.id, { rotation: Number(e.target.value) })}
            className="flex-1"
          />
          <input
            type="number"
            value={Math.round(room.rotation ?? 0)}
            onChange={(e) => onUpdateRoom(room.id, { rotation: Number(e.target.value) })}
            className="w-14 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 py-0.5 text-[11px] text-right"
          />
          <span className="text-[10px] text-slate-400">°</span>
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-500 dark:text-slate-400">
        <Stat label="W" value={lengthLabel} />
        <Stat label="H" value={widthLabel} />
        <Stat label="Area" value={areaLabel} />
      </div>
      <p className="text-[10px] text-slate-400 leading-snug">
        Rooms still act as drop targets — drag item chips onto this room to
        assign them.
      </p>
      <button
        type="button"
        onClick={() => {
          if (
            confirm(
              `Delete "${room.name}"? Items assigned to it become unassigned.`
            )
          ) {
            onDeleteRoom(room.id);
          }
        }}
        className="w-full flex items-center justify-center gap-1 rounded border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-300 px-1.5 py-1 text-[11px] hover:bg-red-50 dark:hover:bg-red-900/30"
      >
        <Trash2 className="h-3 w-3" />
        Delete room
      </button>
    </div>
  );
}

function StickerPanel({
  sticker,
  onUpdateSticker,
  onDeleteSticker,
  onDuplicateSticker,
}: {
  sticker: MoveSticker;
} & Props) {
  const label = MOVE_STICKER_LABELS[sticker.kind as MoveStickerKind] ?? sticker.kind;
  const presets = FLOOR_PLAN_PRESET_SIZES[sticker.kind];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <svg viewBox="0 0 100 100" className="w-5 h-5 text-slate-600 dark:text-slate-300">
          <StickerGlyph kind={sticker.kind as MoveStickerKind} stroke="currentColor" previewOnly />
        </svg>
        <div className="text-[12px] font-semibold capitalize">{label}</div>
      </div>
      <Field label="Label">
        <input
          type="text"
          value={sticker.label ?? ""}
          onChange={(e) => onUpdateSticker(sticker.id, { label: e.target.value })}
          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[12px]"
          placeholder={sticker.kind === "label" ? "Text" : "Optional note"}
        />
      </Field>
      <Field label="Color">
        <ColorSwatches
          value={sticker.color ?? "#0f172a"}
          onChange={(c) => onUpdateSticker(sticker.id, { color: c })}
        />
      </Field>
      {presets && (
        <Field label="Preset size">
          <select
            onChange={(e) => {
              const preset = presets.find((p) => p.label === e.target.value);
              if (preset) onUpdateSticker(sticker.id, { width: preset.width, height: preset.height });
            }}
            defaultValue=""
            className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[11px]"
          >
            <option value="" disabled>
              Choose…
            </option>
            {presets.map((p) => (
              <option key={p.label}>{p.label}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-1">
        <Field label="Width">
          <DimensionInput
            value={sticker.width}
            onChange={(v) => onUpdateSticker(sticker.id, { width: v })}
          />
        </Field>
        <Field label="Height">
          <DimensionInput
            value={sticker.height}
            onChange={(v) => onUpdateSticker(sticker.id, { height: v })}
          />
        </Field>
      </div>
      <Field label="Rotation">
        <div className="flex items-center gap-1">
          <input
            type="range"
            min={-180}
            max={180}
            value={sticker.rotation}
            onChange={(e) => onUpdateSticker(sticker.id, { rotation: Number(e.target.value) })}
            className="flex-1"
          />
          <input
            type="number"
            value={Math.round(sticker.rotation)}
            onChange={(e) => onUpdateSticker(sticker.id, { rotation: Number(e.target.value) })}
            className="w-14 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 py-0.5 text-[11px] text-right"
          />
          <span className="text-[10px] text-slate-400">°</span>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => onDuplicateSticker(sticker)}
          className="flex items-center justify-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 py-1 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <Copy className="h-3 w-3" />
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => onDeleteSticker(sticker.id)}
          className="flex items-center justify-center gap-1 rounded border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-300 px-1 py-1 text-[11px] hover:bg-red-50 dark:hover:bg-red-900/30"
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </button>
      </div>
    </div>
  );
}

function StickerStyle({
  sticker,
  onUpdate,
}: {
  sticker: MoveSticker;
  onUpdate: (p: Partial<MoveSticker>) => void;
}) {
  const styles = useFloorPlanStore((s) => s.doc.styles);
  const setStyle = useFloorPlanStore((s) => s.setStyle);
  const style = styles[sticker.id] ?? {};
  return (
    <div className="space-y-2">
      <Field label="Outline color">
        <ColorSwatches
          value={style.outlineColor ?? sticker.color ?? "#0f172a"}
          onChange={(c) => {
            setStyle(sticker.id, { outlineColor: c });
            onUpdate({ color: c });
          }}
        />
      </Field>
      <Field label="Fill color">
        <ColorSwatches
          value={style.fillColor ?? "#ffffff"}
          onChange={(c) => setStyle(sticker.id, { fillColor: c })}
        />
      </Field>
      <Field label="Outline thickness">
        <input
          type="range"
          min={0.5}
          max={6}
          step={0.5}
          value={style.outlineThickness ?? 1.5}
          onChange={(e) =>
            setStyle(sticker.id, { outlineThickness: Number(e.target.value) })
          }
          className="w-full"
        />
      </Field>
      <Field label="Line style">
        <div className="flex gap-1">
          {FLOOR_PLAN_LINE_STYLES.map((ls) => (
            <button
              key={ls}
              type="button"
              onClick={() => setStyle(sticker.id, { lineStyle: ls })}
              className={cn(
                "flex-1 rounded border py-1 text-[10px] capitalize",
                style.lineStyle === ls
                  ? "bg-primary-500 text-white border-primary-500"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              )}
            >
              {ls}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Opacity">
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={style.opacity ?? 1}
          onChange={(e) => setStyle(sticker.id, { opacity: Number(e.target.value) })}
          className="w-full"
        />
      </Field>
      <label className="flex items-center gap-2 text-[11px]">
        <input
          type="checkbox"
          checked={!!style.clearanceZone}
          onChange={(e) => setStyle(sticker.id, { clearanceZone: e.target.checked })}
        />
        Show clearance zone
      </label>
    </div>
  );
}

function WallPanel({ id }: { id: string | undefined }) {
  const wall = useFloorPlanStore((s) => s.doc.walls.find((w) => w.id === id));
  const updateWall = useFloorPlanStore((s) => s.updateWall);
  const deleteWalls = useFloorPlanStore((s) => s.deleteWalls);
  if (!wall) return <EmptyState />;
  return (
    <div className="space-y-2">
      <div className="text-[12px] font-semibold">Wall</div>
      <Field label="Thickness">
        <div className="grid grid-cols-4 gap-1">
          {FLOOR_PLAN_WALL_THICKNESS_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => updateWall(wall.id, { thickness: p.value })}
              className={cn(
                "rounded border py-0.5 text-[10px]",
                Math.abs(wall.thickness - p.value) < 0.001
                  ? "bg-primary-500 text-white border-primary-500"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              )}
              title={p.label}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={0.002}
          max={0.04}
          step={0.001}
          value={wall.thickness}
          onChange={(e) => updateWall(wall.id, { thickness: Number(e.target.value) })}
          className="w-full mt-1"
        />
      </Field>
      <Field label="Line style">
        <div className="flex gap-1">
          {FLOOR_PLAN_LINE_STYLES.map((ls) => (
            <button
              key={ls}
              type="button"
              onClick={() => updateWall(wall.id, { lineStyle: ls })}
              className={cn(
                "flex-1 rounded border py-1 text-[10px] capitalize",
                wall.lineStyle === ls
                  ? "bg-primary-500 text-white border-primary-500"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              )}
            >
              {ls}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Color">
        <ColorSwatches value={wall.color} onChange={(c) => updateWall(wall.id, { color: c })} />
      </Field>
      <button
        type="button"
        onClick={() => deleteWalls([wall.id])}
        className="w-full flex items-center justify-center gap-1 rounded border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-300 px-1.5 py-1 text-[11px] hover:bg-red-50 dark:hover:bg-red-900/30"
      >
        <Trash2 className="h-3 w-3" />
        Delete wall
      </button>
    </div>
  );
}

function WallStyle({ id }: { id: string | undefined }) {
  const wall = useFloorPlanStore((s) => s.doc.walls.find((w) => w.id === id));
  if (!wall) return <EmptyState />;
  return (
    <p className="text-[11px] text-slate-500 dark:text-slate-400">
      Wall style lives in the Properties tab.
    </p>
  );
}

function SelectedDimensionsControls({
  selectedKind,
  selectedIds,
  rooms,
  stickers,
  onUpdateRoom,
  onUpdateSticker,
}: Props) {
  const viewport = useFloorPlanStore((s) => s.viewport);
  if (selectedKind === "room" && selectedIds.length === 1) {
    const r = rooms.find((x) => x.id === selectedIds[0]);
    if (!r) return null;
    return (
      <div className="grid grid-cols-2 gap-1">
        <Field label={`Width (${viewport.unit === "metric" ? "m" : "ft"})`}>
          <DimensionInput value={r.width ?? 0} onChange={(v) => onUpdateRoom(r.id, { width: v })} asReal />
        </Field>
        <Field label={`Height (${viewport.unit === "metric" ? "m" : "ft"})`}>
          <DimensionInput value={r.height ?? 0} onChange={(v) => onUpdateRoom(r.id, { height: v })} asReal />
        </Field>
      </div>
    );
  }
  if (selectedKind === "sticker" && selectedIds.length === 1) {
    const s = stickers.find((x) => x.id === selectedIds[0]);
    if (!s) return null;
    return (
      <div className="grid grid-cols-2 gap-1">
        <Field label={`Width (${viewport.unit === "metric" ? "m" : "ft"})`}>
          <DimensionInput value={s.width} onChange={(v) => onUpdateSticker(s.id, { width: v })} asReal />
        </Field>
        <Field label={`Height (${viewport.unit === "metric" ? "m" : "ft"})`}>
          <DimensionInput value={s.height} onChange={(v) => onUpdateSticker(s.id, { height: v })} asReal />
        </Field>
      </div>
    );
  }
  return <p className="text-[11px] text-slate-400 italic">Single-object dimensions only.</p>;
}

/* ---------- small components ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <label className="block text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1 py-0.5 text-center">
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {FLOOR_PLAN_BEGINNER_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
          className={cn(
            "h-5 w-5 rounded border transition",
            value.toLowerCase() === c.toLowerCase()
              ? "border-primary-500 ring-2 ring-primary-500/40 scale-110"
              : "border-slate-200 dark:border-slate-700 hover:border-slate-400"
          )}
          style={{ background: c }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-5 w-6 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer"
      />
    </div>
  );
}

function DimensionInput({
  value,
  onChange,
  asReal,
}: {
  value: number;
  onChange: (v: number) => void;
  asReal?: boolean;
}) {
  const viewport = useFloorPlanStore((s) => s.viewport);
  // When `asReal` we show meters/feet. Otherwise raw normalized 0..1.
  if (asReal) {
    const meters = value * viewport.realWorldHeightMeters;
    const imperial = viewport.unit === "imperial";
    const displayed = imperial ? meters * 3.28084 : meters;
    return (
      <input
        type="number"
        min={0.01}
        step={0.01}
        value={displayed.toFixed(2)}
        onChange={(e) => {
          const raw = Number(e.target.value);
          const m = imperial ? raw / 3.28084 : raw;
          onChange(m / viewport.realWorldHeightMeters);
        }}
        className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[11px] tabular-nums"
      />
    );
  }
  return (
    <input
      type="number"
      min={0.01}
      max={2}
      step={0.01}
      value={value.toFixed(2)}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[11px] tabular-nums"
    />
  );
}

function MultiSelectPanel({ count, kind }: { count: number; kind: "room" | "sticker" }) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold">
        {count} {kind === "room" ? "rooms" : "objects"} selected
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Select a single object to edit its properties, or use the context
        menu on the canvas for bulk actions (align, distribute, delete).
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="space-y-2 text-[11px] text-slate-500 dark:text-slate-400">
      <p className="font-semibold text-slate-700 dark:text-slate-200">
        Select an object
      </p>
      <ul className="space-y-1">
        <li>• Click any room, wall, or object on the canvas.</li>
        <li>• Drag from the left library to add new objects.</li>
        <li>• Press <kbd>R</kbd> for a rectangle room.</li>
        <li>• Press <kbd>W</kbd> for the wall tool (Advanced mode).</li>
      </ul>
    </div>
  );
}
