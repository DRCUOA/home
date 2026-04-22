/**
 * Left-side tool sidebar for the Floor Plan Designer.
 *
 * Arrangement (spec: informationArchitecture.leftSidebar):
 *   - Wall tools
 *   - Room tools
 *   - Doors / windows
 *   - Furniture / object library (with search, recent, favorites)
 *   - Annotation tools
 *
 * In beginner mode the Wall tools + Annotation tools collapse by default.
 */

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Grip,
  Home as HomeIcon,
  MessageSquare,
  MousePointer2,
  Pencil,
  PenTool,
  Ruler,
  Search,
  Shapes,
  Square,
  Type,
} from "lucide-react";
import {
  MOVE_STICKER_KINDS,
  MOVE_STICKER_LABELS,
  type MoveStickerKind,
} from "@hcc/shared";
import { StickerGlyph } from "../sticker-icons";
import { useFloorPlanStore } from "@/stores/floor-plan";
import { cn } from "@/lib/cn";

interface Props {
  onStampRoom: () => void;
  onStampSticker: (kind: MoveStickerKind) => void;
}

const STICKER_CATEGORIES: { id: string; label: string; kinds: MoveStickerKind[] }[] = [
  {
    id: "openings",
    label: "Doors & Windows",
    kinds: ["door", "door_double", "sliding_door", "garage_door", "window", "archway"],
  },
  {
    id: "structural",
    label: "Structural",
    kinds: ["wall", "column", "stairs", "fireplace"],
  },
  {
    id: "kitchen",
    label: "Kitchen",
    kinds: ["sink", "fridge", "stove", "oven", "microwave", "dishwasher", "kitchen_island", "pantry"],
  },
  {
    id: "bathroom",
    label: "Bathroom & Laundry",
    kinds: ["toilet", "bathtub", "shower", "vanity", "mirror", "washer", "dryer"],
  },
  {
    id: "bedroom",
    label: "Bedroom",
    kinds: ["bed", "bunk_bed", "crib", "wardrobe", "closet", "dresser", "nightstand"],
  },
  {
    id: "living",
    label: "Living & Dining",
    kinds: ["sofa", "armchair", "table", "dining_table", "chair", "tv", "bookshelf", "piano"],
  },
  { id: "office", label: "Office", kinds: ["desk", "filing_cabinet"] },
  {
    id: "outdoor",
    label: "Outdoor",
    kinds: ["bbq", "pool", "hot_tub", "trampoline", "shed", "firepit", "car"],
  },
  {
    id: "utility",
    label: "HVAC & Utilities",
    kinds: ["radiator", "water_heater", "ceiling_fan", "air_conditioner"],
  },
  {
    id: "misc",
    label: "Misc",
    kinds: ["plant", "rug", "lamp"],
  },
];

export function ToolSidebar({ onStampRoom, onStampSticker }: Props) {
  const activeTool = useFloorPlanStore((s) => s.activeTool);
  const setTool = useFloorPlanStore((s) => s.setTool);
  const mode = useFloorPlanStore((s) => s.mode);

  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<MoveStickerKind[]>([]);
  const [favorites, setFavorites] = useState<Set<MoveStickerKind>>(new Set());

  const handleStamp = (kind: MoveStickerKind) => {
    onStampSticker(kind);
    setRecent((r) => [kind, ...r.filter((k) => k !== kind)].slice(0, 8));
  };

  const toggleFavorite = (kind: MoveStickerKind) => {
    setFavorites((f) => {
      const next = new Set(f);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return STICKER_CATEGORIES;
    return STICKER_CATEGORIES.map((cat) => ({
      ...cat,
      kinds: cat.kinds.filter((k) => {
        const label = MOVE_STICKER_LABELS[k] ?? k;
        return k.toLowerCase().includes(q) || label.toLowerCase().includes(q);
      }),
    })).filter((cat) => cat.kinds.length > 0);
  }, [query]);

  return (
    <aside
      aria-label="Floor plan tools"
      className="w-52 shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100"
    >
      {/* Select + Pan */}
      <section className="p-2 border-b border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-2 gap-1">
          <ToolButton
            label="Select"
            icon={<MousePointer2 className="h-4 w-4" />}
            active={activeTool === "select"}
            onClick={() => setTool("select")}
            shortcut="V"
          />
          <ToolButton
            label="Pan"
            icon={<Grip className="h-4 w-4" />}
            active={activeTool === "pan"}
            onClick={() => setTool("pan")}
            shortcut="Space"
          />
        </div>
      </section>

      {/* Walls (advanced only by default) */}
      {mode === "advanced" && (
        <Section title="Walls">
          <div className="grid grid-cols-1 gap-1">
            <ToolButton
              label="Draw wall"
              icon={<PenTool className="h-4 w-4" />}
              active={activeTool === "wall"}
              onClick={() => setTool("wall")}
              shortcut="W"
              description="Click to start, click to end. Double-click to finish a run."
            />
          </div>
        </Section>
      )}

      {/* Rooms */}
      <Section title="Rooms">
        <div className="grid grid-cols-1 gap-1">
          <ToolButton
            label="Rectangle room"
            icon={<Square className="h-4 w-4" />}
            active={activeTool === "room-rect"}
            onClick={() => setTool("room-rect")}
            shortcut="R"
          />
          {mode === "advanced" && (
            <ToolButton
              label="Polygon room"
              icon={<Shapes className="h-4 w-4" />}
              active={activeTool === "room-polygon"}
              onClick={() => setTool("room-polygon")}
              shortcut="P"
              description="Click to place each corner, Enter or double-click to close."
            />
          )}
          <button
            type="button"
            onClick={onStampRoom}
            className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium bg-primary-500 hover:bg-primary-600 text-white"
            title="Drop a new room in the center"
          >
            <HomeIcon className="h-3.5 w-3.5" />
            Add room
          </button>
        </div>
      </Section>

      {/* Doors & Windows */}
      <Section title="Doors & Windows" defaultOpen>
        <div className="grid grid-cols-2 gap-1">
          {STICKER_CATEGORIES[0].kinds.map((k) => (
            <StickerButton
              key={k}
              kind={k}
              onClick={() => handleStamp(k)}
              onFavorite={() => toggleFavorite(k)}
              favorited={favorites.has(k)}
            />
          ))}
        </div>
      </Section>

      {/* Furniture / object library with search, favorites, recent */}
      <Section title="Furniture & Objects" defaultOpen>
        {/* Search */}
        <label className="relative block mb-1.5">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-6 pr-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] placeholder:text-slate-400"
          />
        </label>

        {/* Favorites */}
        {favorites.size > 0 && !query && (
          <Subheading>Favorites</Subheading>
        )}
        {favorites.size > 0 && !query && (
          <div className="grid grid-cols-4 gap-0.5 mb-2">
            {[...favorites].map((k) => (
              <StickerButton
                key={`fav-${k}`}
                kind={k}
                onClick={() => handleStamp(k)}
                onFavorite={() => toggleFavorite(k)}
                favorited
                compact
              />
            ))}
          </div>
        )}

        {/* Recent */}
        {recent.length > 0 && !query && (
          <Subheading>Recently used</Subheading>
        )}
        {recent.length > 0 && !query && (
          <div className="grid grid-cols-4 gap-0.5 mb-2">
            {recent.map((k) => (
              <StickerButton
                key={`recent-${k}`}
                kind={k}
                onClick={() => handleStamp(k)}
                onFavorite={() => toggleFavorite(k)}
                favorited={favorites.has(k)}
                compact
              />
            ))}
          </div>
        )}

        {/* Categorized library */}
        {filteredCategories
          .filter((c) => c.id !== "openings" && c.id !== "structural")
          .map((cat) => (
            <div key={cat.id} className="mb-2">
              <Subheading>{cat.label}</Subheading>
              <div className="grid grid-cols-4 gap-0.5">
                {cat.kinds.map((k) => (
                  <StickerButton
                    key={k}
                    kind={k}
                    onClick={() => handleStamp(k)}
                    onFavorite={() => toggleFavorite(k)}
                    favorited={favorites.has(k)}
                    compact
                  />
                ))}
              </div>
            </div>
          ))}

        {/* Structural — advanced only */}
        {mode === "advanced" && !query && (
          <div className="mb-2">
            <Subheading>Structural</Subheading>
            <div className="grid grid-cols-4 gap-0.5">
              {STICKER_CATEGORIES[1].kinds.map((k) => (
                <StickerButton
                  key={k}
                  kind={k}
                  onClick={() => handleStamp(k)}
                  onFavorite={() => toggleFavorite(k)}
                  favorited={favorites.has(k)}
                  compact
                />
              ))}
            </div>
          </div>
        )}

        {filteredCategories.length === 0 && query && (
          <p className="text-[11px] text-slate-400 italic px-1">
            No objects match "{query}".
          </p>
        )}
      </Section>

      {/* Annotations (advanced) */}
      {mode === "advanced" && (
        <Section title="Annotations">
          <div className="grid grid-cols-2 gap-1">
            <ToolButton
              label="Text"
              icon={<Type className="h-4 w-4" />}
              active={activeTool === "text"}
              onClick={() => setTool("text")}
              shortcut="T"
            />
            <ToolButton
              label="Note"
              icon={<MessageSquare className="h-4 w-4" />}
              active={activeTool === "note"}
              onClick={() => setTool("note")}
            />
            <ToolButton
              label="Dimension"
              icon={<Ruler className="h-4 w-4" />}
              active={activeTool === "dimension"}
              onClick={() => setTool("dimension")}
            />
            <ToolButton
              label="Arrow"
              icon={<ArrowRight className="h-4 w-4" />}
              active={activeTool === "arrow"}
              onClick={() => setTool("arrow")}
            />
          </div>
        </Section>
      )}

      {/* Pad so sticky-bottom help has room */}
      <div className="p-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
        <div className="flex items-center gap-1 mb-0.5">
          <Pencil className="h-3 w-3" />
          <span className="font-medium">Tip</span>
        </div>
        Drag from the library onto the canvas, or click to stamp at center.
      </div>
    </aside>
  );
}

/* ---------- local parts ---------- */

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        {title}
        <span className="text-[10px]">{open ? "–" : "+"}</span>
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </section>
  );
}

function Subheading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-0.5 pt-1 pb-0.5 text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">
      {children}
    </div>
  );
}

function ToolButton({
  label,
  icon,
  active,
  onClick,
  shortcut,
  description,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  shortcut?: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-keyshortcuts={shortcut}
      title={description ?? label + (shortcut ? ` (${shortcut})` : "")}
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition border",
        active
          ? "bg-primary-500 text-white border-primary-500"
          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      {shortcut && (
        <kbd
          className={cn(
            "ml-auto rounded bg-slate-100 dark:bg-slate-700 px-1 py-0.5 text-[9px]",
            active && "bg-white/20 text-white"
          )}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

function StickerButton({
  kind,
  onClick,
  onFavorite,
  favorited,
  compact,
}: {
  kind: MoveStickerKind;
  onClick: () => void;
  onFavorite: () => void;
  favorited: boolean;
  compact?: boolean;
}) {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        title={MOVE_STICKER_LABELS[kind] ?? kind}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-floor-plan-sticker", kind);
          e.dataTransfer.effectAllowed = "copy";
        }}
        className={cn(
          "group flex items-center justify-center rounded border aspect-square transition",
          "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-slate-700"
        )}
      >
        <svg
          viewBox="0 0 100 100"
          className={cn("text-slate-700 dark:text-slate-200", compact ? "w-5 h-5" : "w-6 h-6")}
        >
          <StickerGlyph kind={kind} stroke="currentColor" previewOnly />
        </svg>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFavorite();
        }}
        aria-label={favorited ? "Unfavorite" : "Favorite"}
        className={cn(
          "absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full text-[9px] leading-none flex items-center justify-center transition",
          favorited
            ? "bg-amber-400 text-white"
            : "bg-slate-300 text-white opacity-0 group-hover:opacity-100"
        )}
        title={favorited ? "Unfavorite" : "Favorite"}
      >
        ★
      </button>
    </div>
  );
}
