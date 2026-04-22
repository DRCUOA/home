import type { MoveStickerKind } from "@hcc/shared";

/**
 * Blank / outline SVG glyphs for floor plan stickers.
 *
 * Each glyph draws inside a 100 × 100 viewBox. The parent code scales
 * the glyph to the sticker's bounding box so shapes stretch naturally
 * when the user resizes them. Colors default to the current stroke.
 *
 * All paths are stroke-only, no fill — that's the "sticker" look: a
 * clean outline that sits on top of the user's floor plan photo.
 */

interface GlyphProps {
  stroke?: string;
  strokeWidth?: number;
  previewOnly?: boolean;
}

const defaultStroke = "#1e293b";

/* ---------- individual glyphs ---------- */

export function DoorGlyph({ stroke = defaultStroke, strokeWidth = 4 }: GlyphProps) {
  // Wall with door swing arc
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      {/* wall segment */}
      <line x1="0" y1="95" x2="100" y2="95" />
      {/* door panel (hinged left) */}
      <line x1="5" y1="95" x2="5" y2="5" />
      {/* swing arc */}
      <path d="M5 5 A 90 90 0 0 1 95 95" />
    </g>
  );
}

export function DoorDoubleGlyph({ stroke = defaultStroke, strokeWidth = 4 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      <line x1="0" y1="95" x2="100" y2="95" />
      {/* left panel */}
      <line x1="5" y1="95" x2="5" y2="50" />
      <path d="M5 50 A 45 45 0 0 1 50 95" />
      {/* right panel */}
      <line x1="95" y1="95" x2="95" y2="50" />
      <path d="M95 50 A 45 45 0 0 0 50 95" />
    </g>
  );
}

export function WindowGlyph({ stroke = defaultStroke, strokeWidth = 4 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      {/* window is a thin double-line rectangle */}
      <rect x="2" y="35" width="96" height="30" />
      <line x1="2" y1="50" x2="98" y2="50" />
    </g>
  );
}

export function WallGlyph({ stroke = defaultStroke }: GlyphProps) {
  return (
    <g fill={stroke} stroke="none">
      <rect x="0" y="40" width="100" height="20" />
    </g>
  );
}

export function SinkGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="5" width="90" height="90" rx="6" />
      <circle cx="50" cy="55" r="26" />
      <circle cx="50" cy="20" r="3" />
    </g>
  );
}

export function ToiletGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      {/* tank */}
      <rect x="15" y="5" width="70" height="22" rx="3" />
      {/* bowl */}
      <ellipse cx="50" cy="65" rx="35" ry="30" />
    </g>
  );
}

export function BathtubGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="15" width="90" height="70" rx="14" />
      <rect x="15" y="25" width="70" height="50" rx="10" />
      {/* drain */}
      <circle cx="80" cy="50" r="3" />
    </g>
  );
}

export function ShowerGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="5" width="90" height="90" rx="4" />
      {/* shower head */}
      <line x1="50" y1="15" x2="50" y2="30" />
      <circle cx="50" cy="35" r="8" />
      {/* drain hatch */}
      <line x1="15" y1="85" x2="85" y2="85" strokeDasharray="6 6" />
    </g>
  );
}

export function BedGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      {/* mattress */}
      <rect x="5" y="10" width="90" height="85" rx="6" />
      {/* pillows */}
      <rect x="12" y="16" width="34" height="18" rx="3" />
      <rect x="54" y="16" width="34" height="18" rx="3" />
    </g>
  );
}

export function SofaGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      {/* backrest */}
      <rect x="5" y="15" width="90" height="22" rx="6" />
      {/* seat */}
      <rect x="5" y="40" width="90" height="40" rx="8" />
      {/* arms */}
      <rect x="2" y="45" width="12" height="40" rx="4" />
      <rect x="86" y="45" width="12" height="40" rx="4" />
    </g>
  );
}

export function TableGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="20" width="90" height="60" rx="4" />
      {/* chairs around */}
      <rect x="10" y="3" width="20" height="12" rx="2" />
      <rect x="70" y="3" width="20" height="12" rx="2" />
      <rect x="10" y="85" width="20" height="12" rx="2" />
      <rect x="70" y="85" width="20" height="12" rx="2" />
    </g>
  );
}

export function ChairGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      {/* seat */}
      <rect x="10" y="25" width="80" height="60" rx="8" />
      {/* back */}
      <rect x="10" y="8" width="80" height="14" rx="3" />
    </g>
  );
}

export function StairsGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="5" width="90" height="90" />
      {[20, 35, 50, 65, 80].map((y) => (
        <line key={y} x1="5" y1={y} x2="95" y2={y} />
      ))}
      {/* direction arrow */}
      <path d="M50 85 L50 20 M40 30 L50 20 L60 30" />
    </g>
  );
}

export function FridgeGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="10" y="5" width="80" height="90" rx="4" />
      {/* freezer divider */}
      <line x1="10" y1="35" x2="90" y2="35" />
      {/* door handles */}
      <line x1="78" y1="18" x2="78" y2="28" />
      <line x1="78" y1="55" x2="78" y2="80" />
    </g>
  );
}

export function StoveGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="5" width="90" height="90" rx="4" />
      <circle cx="30" cy="35" r="12" />
      <circle cx="70" cy="35" r="12" />
      <circle cx="30" cy="75" r="12" />
      <circle cx="70" cy="75" r="12" />
    </g>
  );
}

export function DeskGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="35" width="90" height="30" rx="3" />
      {/* drawers */}
      <line x1="25" y1="35" x2="25" y2="65" />
      {/* chair */}
      <rect x="35" y="75" width="30" height="20" rx="3" />
    </g>
  );
}

export function PlantGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      {/* pot */}
      <path d="M25 70 L75 70 L68 95 L32 95 Z" />
      {/* leaves */}
      <path d="M50 70 C 30 50 20 30 30 15" />
      <path d="M50 70 C 70 50 80 30 70 15" />
      <path d="M50 70 L50 30" />
    </g>
  );
}

export function RugGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="10" width="90" height="80" rx="4" strokeDasharray="4 4" />
      <rect x="15" y="20" width="70" height="60" rx="2" />
      {/* fringe */}
      {[14, 30, 50, 70, 86].map((x) => (
        <line key={`t${x}`} x1={x} y1="4" x2={x} y2="10" />
      ))}
      {[14, 30, 50, 70, 86].map((x) => (
        <line key={`b${x}`} x1={x} y1="90" x2={x} y2="96" />
      ))}
    </g>
  );
}

export function LabelGlyph({
  stroke = defaultStroke,
  previewOnly = false,
}: GlyphProps) {
  // Text labels are rendered by the sticker layer (which knows the
  // actual label text). For the palette preview we draw a simple
  // "T" so users recognise the tool.
  return previewOnly ? (
    <g fill={stroke}>
      <rect x="15" y="15" width="70" height="12" rx="2" />
      <rect x="42" y="15" width="16" height="70" rx="2" />
    </g>
  ) : (
    <g fill="none" stroke={stroke} strokeWidth={2} strokeDasharray="4 3">
      <rect x="2" y="2" width="96" height="96" rx="4" />
    </g>
  );
}

export function ArrowGlyph({ stroke = defaultStroke, strokeWidth = 5 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="50" x2="85" y2="50" />
      <path d="M70 30 L90 50 L70 70" />
    </g>
  );
}

/* ---------- Openings & structural ---------- */

export function SlidingDoorGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  // Two overlapping panels with slide arrows underneath.
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      <rect x="5" y="20" width="45" height="40" />
      <rect x="50" y="20" width="45" height="40" />
      <line x1="20" y1="80" x2="45" y2="80" />
      <path d="M25 75 L20 80 L25 85" />
      <line x1="55" y1="80" x2="80" y2="80" />
      <path d="M75 75 L80 80 L75 85" />
    </g>
  );
}

export function GarageDoorGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="5" width="90" height="90" rx="4" />
      {[20, 35, 50, 65, 80].map((y) => (
        <line key={y} x1="10" y1={y} x2="90" y2={y} />
      ))}
    </g>
  );
}

export function ArchwayGlyph({ stroke = defaultStroke, strokeWidth = 4 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      {/* wall + arch opening */}
      <line x1="5" y1="95" x2="20" y2="95" />
      <line x1="80" y1="95" x2="95" y2="95" />
      <path d="M20 95 L20 45 A 30 30 0 0 1 80 45 L80 95" />
    </g>
  );
}

export function ColumnGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <circle cx="50" cy="50" r="38" />
      <circle cx="50" cy="50" r="26" />
      <circle cx="50" cy="50" r="4" fill={stroke} />
    </g>
  );
}

export function FireplaceGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {/* surround */}
      <rect x="5" y="25" width="90" height="70" />
      {/* hearth mantle */}
      <rect x="2" y="15" width="96" height="10" />
      {/* opening */}
      <rect x="20" y="40" width="60" height="55" />
      {/* flame */}
      <path d="M50 85 C 40 70 60 65 50 45 C 55 60 70 65 50 85 Z" />
    </g>
  );
}

/* ---------- Kitchen ---------- */

export function OvenGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="5" width="90" height="90" rx="4" />
      {/* control row */}
      <line x1="5" y1="25" x2="95" y2="25" />
      <circle cx="20" cy="15" r="4" />
      <circle cx="40" cy="15" r="4" />
      <circle cx="60" cy="15" r="4" />
      <circle cx="80" cy="15" r="4" />
      {/* door window */}
      <rect x="15" y="35" width="70" height="50" rx="3" />
      <line x1="35" y1="85" x2="65" y2="85" strokeWidth={4} />
    </g>
  );
}

export function MicrowaveGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="20" width="90" height="60" rx="3" />
      <rect x="12" y="28" width="55" height="44" rx="2" />
      {/* control panel */}
      <line x1="72" y1="28" x2="72" y2="72" />
      <circle cx="82" cy="36" r="2" />
      <circle cx="82" cy="46" r="2" />
      <circle cx="82" cy="56" r="2" />
      <circle cx="82" cy="66" r="2" />
    </g>
  );
}

export function DishwasherGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="5" width="90" height="90" rx="3" />
      {/* top control strip */}
      <line x1="5" y1="20" x2="95" y2="20" />
      <circle cx="20" cy="12" r="2" />
      <circle cx="35" cy="12" r="2" />
      <circle cx="50" cy="12" r="2" />
      {/* door handle */}
      <line x1="35" y1="30" x2="65" y2="30" strokeWidth={5} strokeLinecap="round" />
      {/* door panel */}
      <rect x="15" y="40" width="70" height="50" rx="2" />
    </g>
  );
}

export function KitchenIslandGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="20" width="90" height="60" rx="4" />
      {/* integrated sink */}
      <rect x="20" y="30" width="30" height="22" rx="3" />
      {/* counter groove */}
      <line x1="5" y1="60" x2="95" y2="60" strokeDasharray="4 3" />
      {/* bar stools */}
      <circle cx="30" cy="92" r="5" />
      <circle cx="55" cy="92" r="5" />
      <circle cx="80" cy="92" r="5" />
    </g>
  );
}

export function PantryGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="10" y="5" width="80" height="90" rx="3" />
      {/* shelves */}
      {[25, 45, 65, 85].map((y) => (
        <line key={y} x1="10" y1={y} x2="90" y2={y} />
      ))}
      {/* door divider */}
      <line x1="50" y1="5" x2="50" y2="95" />
    </g>
  );
}

/* ---------- Bathroom & laundry ---------- */

export function VanityGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="20" width="90" height="60" rx="4" />
      <ellipse cx="28" cy="50" rx="16" ry="12" />
      <ellipse cx="72" cy="50" rx="16" ry="12" />
      <circle cx="28" cy="30" r="2" />
      <circle cx="72" cy="30" r="2" />
    </g>
  );
}

export function MirrorGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      <rect x="15" y="5" width="70" height="90" rx="8" />
      {/* shine lines */}
      <line x1="28" y1="20" x2="38" y2="30" />
      <line x1="28" y1="35" x2="33" y2="40" />
    </g>
  );
}

export function WasherGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="5" width="90" height="90" rx="4" />
      {/* detergent dispenser bar */}
      <line x1="5" y1="20" x2="95" y2="20" />
      <circle cx="15" cy="13" r="2" />
      <circle cx="30" cy="13" r="2" />
      {/* drum */}
      <circle cx="50" cy="58" r="30" />
      <circle cx="50" cy="58" r="22" />
    </g>
  );
}

export function DryerGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="5" width="90" height="90" rx="4" />
      <line x1="5" y1="20" x2="95" y2="20" />
      <rect x="13" y="11" width="40" height="6" rx="1" />
      {/* drum */}
      <circle cx="50" cy="58" r="30" />
      {/* vent indicator */}
      <path d="M40 58 Q50 48 60 58 Q50 68 40 58 Z" />
    </g>
  );
}

/* ---------- Bedroom ---------- */

export function BunkBedGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      {/* upper bunk */}
      <rect x="5" y="5" width="90" height="40" rx="4" />
      <rect x="12" y="10" width="30" height="12" rx="2" />
      {/* lower bunk */}
      <rect x="5" y="55" width="90" height="40" rx="4" />
      <rect x="12" y="60" width="30" height="12" rx="2" />
      {/* ladder */}
      <line x1="88" y1="45" x2="88" y2="55" />
      <line x1="80" y1="50" x2="96" y2="50" />
    </g>
  );
}

export function CribGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      <rect x="5" y="10" width="90" height="85" rx="6" />
      {/* vertical bars */}
      {[18, 30, 42, 54, 66, 78, 90].map((x) => (
        <line key={x} x1={x} y1="15" x2={x} y2="90" />
      ))}
    </g>
  );
}

export function WardrobeGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="10" y="5" width="80" height="90" rx="3" />
      <line x1="50" y1="5" x2="50" y2="95" />
      {/* handles */}
      <circle cx="45" cy="50" r="2" fill={stroke} />
      <circle cx="55" cy="50" r="2" fill={stroke} />
    </g>
  );
}

export function ClosetGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      <rect x="5" y="5" width="90" height="90" />
      {/* hanging rod */}
      <line x1="15" y1="25" x2="85" y2="25" />
      {/* clothes hangers */}
      {[25, 40, 55, 70, 85].map((x) => (
        <g key={x}>
          <line x1={x} y1="25" x2={x} y2="35" />
          <path d={`M${x - 6} 45 L${x} 35 L${x + 6} 45 L${x + 6} 70 L${x - 6} 70 Z`} />
        </g>
      ))}
    </g>
  );
}

export function DresserGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="10" width="90" height="80" rx="3" />
      {/* drawer lines */}
      <line x1="5" y1="35" x2="95" y2="35" />
      <line x1="5" y1="62" x2="95" y2="62" />
      <line x1="50" y1="10" x2="50" y2="62" />
      {/* handles */}
      <line x1="20" y1="23" x2="35" y2="23" strokeWidth={4} strokeLinecap="round" />
      <line x1="65" y1="23" x2="80" y2="23" strokeWidth={4} strokeLinecap="round" />
      <line x1="20" y1="48" x2="35" y2="48" strokeWidth={4} strokeLinecap="round" />
      <line x1="65" y1="48" x2="80" y2="48" strokeWidth={4} strokeLinecap="round" />
      <line x1="40" y1="76" x2="60" y2="76" strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

export function NightstandGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="10" y="15" width="80" height="75" rx="3" />
      <line x1="10" y1="40" x2="90" y2="40" />
      <circle cx="50" cy="28" r="2" fill={stroke} />
    </g>
  );
}

/* ---------- Living & dining ---------- */

export function ArmchairGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="12" y="10" width="76" height="30" rx="6" />
      <rect x="12" y="40" width="76" height="45" rx="6" />
      <rect x="2" y="50" width="14" height="35" rx="4" />
      <rect x="84" y="50" width="14" height="35" rx="4" />
    </g>
  );
}

export function DiningTableGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      {/* long table */}
      <rect x="10" y="30" width="80" height="40" rx="4" />
      {/* chairs around */}
      <rect x="12" y="8" width="18" height="14" rx="2" />
      <rect x="40" y="8" width="20" height="14" rx="2" />
      <rect x="70" y="8" width="18" height="14" rx="2" />
      <rect x="12" y="78" width="18" height="14" rx="2" />
      <rect x="40" y="78" width="20" height="14" rx="2" />
      <rect x="70" y="78" width="18" height="14" rx="2" />
    </g>
  );
}

export function TvGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="15" width="90" height="55" rx="3" />
      {/* stand */}
      <line x1="40" y1="70" x2="60" y2="70" />
      <line x1="30" y1="85" x2="70" y2="85" strokeWidth={4} />
      <line x1="50" y1="70" x2="50" y2="85" />
    </g>
  );
}

export function BookshelfGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="5" width="90" height="90" />
      {/* shelves */}
      {[25, 50, 75].map((y) => (
        <line key={`shelf${y}`} x1="5" y1={y} x2="95" y2={y} />
      ))}
      {/* books */}
      {[
        [10, 10], [18, 8], [26, 12], [34, 10], [42, 8],
        [10, 35], [18, 32], [26, 38], [34, 34],
        [60, 60], [68, 58], [76, 62],
      ].map(([x, h], i) => (
        <rect key={i} x={x} y={50 - h} width="5" height={h + 1} />
      ))}
    </g>
  );
}

export function PianoGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="20" width="90" height="60" rx="3" />
      {/* keys */}
      <rect x="10" y="55" width="80" height="22" />
      {[20, 30, 40, 50, 60, 70, 80].map((x) => (
        <line key={x} x1={x} y1="55" x2={x} y2="77" />
      ))}
      {/* black keys */}
      {[18, 28, 48, 58, 68].map((x) => (
        <rect key={`b${x}`} x={x - 2} y="55" width="4" height="12" fill={stroke} />
      ))}
    </g>
  );
}

/* ---------- Office ---------- */

export function FilingCabinetGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="15" y="5" width="70" height="90" rx="2" />
      {[30, 55, 80].map((y) => (
        <line key={y} x1="15" y1={y} x2="85" y2={y} />
      ))}
      {/* drawer handles */}
      {[18, 43, 68].map((y) => (
        <circle key={y} cx="50" cy={y} r="3" fill={stroke} />
      ))}
    </g>
  );
}

/* ---------- Outdoor ---------- */

export function BbqGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      {/* lid */}
      <path d="M10 50 A 40 40 0 0 1 90 50" />
      {/* body */}
      <rect x="10" y="50" width="80" height="22" />
      {/* grill bars */}
      {[20, 30, 40, 50, 60, 70, 80].map((x) => (
        <line key={x} x1={x} y1="50" x2={x} y2="55" />
      ))}
      {/* legs */}
      <line x1="20" y1="72" x2="20" y2="92" />
      <line x1="80" y1="72" x2="80" y2="92" />
      {/* wheels */}
      <circle cx="20" cy="94" r="4" />
      <circle cx="80" cy="94" r="4" />
    </g>
  );
}

export function PoolGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      <rect x="5" y="15" width="90" height="70" rx="14" />
      <rect x="12" y="22" width="76" height="56" rx="10" strokeDasharray="4 3" />
      {/* ripples */}
      <path d="M25 50 Q35 42 45 50 Q55 58 65 50 Q75 42 85 50" />
      <path d="M20 65 Q30 57 40 65 Q50 73 60 65 Q70 57 80 65" />
    </g>
  );
}

export function HotTubGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      <circle cx="50" cy="50" r="42" />
      <circle cx="50" cy="50" r="32" strokeDasharray="4 3" />
      {/* steam */}
      <path d="M35 30 Q40 20 35 10" />
      <path d="M50 30 Q55 20 50 10" />
      <path d="M65 30 Q70 20 65 10" />
    </g>
  );
}

export function TrampolineGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <ellipse cx="50" cy="50" rx="45" ry="40" />
      <ellipse cx="50" cy="50" rx="35" ry="30" />
      {/* springs */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const r1 = 35;
        const r2 = 45;
        const x1 = 50 + r1 * Math.cos((a * Math.PI) / 180);
        const y1 = 50 + r1 * 0.85 * Math.sin((a * Math.PI) / 180);
        const x2 = 50 + r2 * Math.cos((a * Math.PI) / 180);
        const y2 = 50 + r2 * 0.85 * Math.sin((a * Math.PI) / 180);
        return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
    </g>
  );
}

export function ShedGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round">
      {/* roof */}
      <path d="M5 40 L50 10 L95 40" />
      {/* walls */}
      <rect x="12" y="40" width="76" height="55" />
      {/* door */}
      <rect x="40" y="55" width="20" height="40" />
      <circle cx="56" cy="75" r="1.5" fill={stroke} />
    </g>
  );
}

export function FirepitGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {/* pit rim */}
      <ellipse cx="50" cy="75" rx="40" ry="12" />
      <ellipse cx="50" cy="75" rx="32" ry="8" />
      {/* flames */}
      <path d="M50 70 C 40 55 55 50 48 35 C 55 45 65 40 58 25 C 68 40 62 55 65 70" />
      <path d="M38 70 C 34 60 42 55 36 45" />
      <path d="M68 70 C 72 60 64 55 70 45" />
    </g>
  );
}

export function CarGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round">
      {/* top-down silhouette */}
      <path d="M25 10 Q50 5 75 10 L85 30 L85 80 Q50 90 15 80 L15 30 Z" />
      {/* windshield / windows */}
      <line x1="25" y1="25" x2="75" y2="25" />
      <line x1="25" y1="50" x2="75" y2="50" />
      <line x1="25" y1="65" x2="75" y2="65" />
      {/* wheels */}
      <rect x="8" y="35" width="6" height="14" rx="1" />
      <rect x="86" y="35" width="6" height="14" rx="1" />
      <rect x="8" y="62" width="6" height="14" rx="1" />
      <rect x="86" y="62" width="6" height="14" rx="1" />
    </g>
  );
}

/* ---------- HVAC & utilities ---------- */

export function RadiatorGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <rect x="5" y="15" width="90" height="70" rx="4" />
      {[18, 30, 42, 54, 66, 78].map((x) => (
        <line key={x} x1={x} y1="20" x2={x} y2="80" />
      ))}
      {/* valve */}
      <circle cx="92" cy="88" r="4" />
    </g>
  );
}

export function WaterHeaterGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      {/* cylinder */}
      <rect x="20" y="20" width="60" height="70" rx="6" />
      {/* top pipe */}
      <path d="M50 20 L50 5 L70 5" />
      {/* pressure relief */}
      <rect x="10" y="40" width="10" height="6" />
      {/* temp dial */}
      <circle cx="50" cy="60" r="8" />
      <line x1="50" y1="60" x2="50" y2="54" />
    </g>
  );
}

export function CeilingFanGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round">
      {/* blades */}
      <path d="M50 50 L50 10 L60 22 Z" />
      <path d="M50 50 L90 50 L78 60 Z" />
      <path d="M50 50 L50 90 L40 78 Z" />
      <path d="M50 50 L10 50 L22 40 Z" />
      {/* hub */}
      <circle cx="50" cy="50" r="8" />
      <circle cx="50" cy="50" r="2" fill={stroke} />
    </g>
  );
}

export function AirConditionerGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      <rect x="5" y="25" width="90" height="50" rx="6" />
      {/* louvre slats */}
      {[38, 48, 58, 68].map((y) => (
        <line key={y} x1="15" y1={y} x2="85" y2={y} />
      ))}
      {/* breeze lines */}
      <path d="M30 82 Q35 88 30 92" />
      <path d="M50 82 Q55 88 50 92" />
      <path d="M70 82 Q75 88 70 92" />
    </g>
  );
}

/* ---------- Misc ---------- */

export function LampGlyph({ stroke = defaultStroke, strokeWidth = 3 }: GlyphProps) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round">
      {/* shade */}
      <path d="M25 35 L75 35 L85 60 L15 60 Z" />
      {/* stem */}
      <line x1="50" y1="60" x2="50" y2="85" />
      {/* base */}
      <ellipse cx="50" cy="90" rx="18" ry="5" />
    </g>
  );
}

/* ---------- dispatch ---------- */

export function StickerGlyph({
  kind,
  stroke,
  strokeWidth,
  previewOnly,
}: { kind: MoveStickerKind } & GlyphProps) {
  const props = { stroke, strokeWidth, previewOnly };
  switch (kind) {
    case "door":
      return <DoorGlyph {...props} />;
    case "door_double":
      return <DoorDoubleGlyph {...props} />;
    case "window":
      return <WindowGlyph {...props} />;
    case "wall":
      return <WallGlyph {...props} />;
    case "sink":
      return <SinkGlyph {...props} />;
    case "toilet":
      return <ToiletGlyph {...props} />;
    case "bathtub":
      return <BathtubGlyph {...props} />;
    case "shower":
      return <ShowerGlyph {...props} />;
    case "bed":
      return <BedGlyph {...props} />;
    case "sofa":
      return <SofaGlyph {...props} />;
    case "table":
      return <TableGlyph {...props} />;
    case "chair":
      return <ChairGlyph {...props} />;
    case "stairs":
      return <StairsGlyph {...props} />;
    case "fridge":
      return <FridgeGlyph {...props} />;
    case "stove":
      return <StoveGlyph {...props} />;
    case "desk":
      return <DeskGlyph {...props} />;
    case "plant":
      return <PlantGlyph {...props} />;
    case "rug":
      return <RugGlyph {...props} />;
    case "label":
      return <LabelGlyph {...props} />;
    case "arrow":
      return <ArrowGlyph {...props} />;
    // Openings & structural
    case "sliding_door":
      return <SlidingDoorGlyph {...props} />;
    case "garage_door":
      return <GarageDoorGlyph {...props} />;
    case "archway":
      return <ArchwayGlyph {...props} />;
    case "column":
      return <ColumnGlyph {...props} />;
    case "fireplace":
      return <FireplaceGlyph {...props} />;
    // Kitchen
    case "oven":
      return <OvenGlyph {...props} />;
    case "microwave":
      return <MicrowaveGlyph {...props} />;
    case "dishwasher":
      return <DishwasherGlyph {...props} />;
    case "kitchen_island":
      return <KitchenIslandGlyph {...props} />;
    case "pantry":
      return <PantryGlyph {...props} />;
    // Bathroom & laundry
    case "vanity":
      return <VanityGlyph {...props} />;
    case "mirror":
      return <MirrorGlyph {...props} />;
    case "washer":
      return <WasherGlyph {...props} />;
    case "dryer":
      return <DryerGlyph {...props} />;
    // Bedroom
    case "bunk_bed":
      return <BunkBedGlyph {...props} />;
    case "crib":
      return <CribGlyph {...props} />;
    case "wardrobe":
      return <WardrobeGlyph {...props} />;
    case "closet":
      return <ClosetGlyph {...props} />;
    case "dresser":
      return <DresserGlyph {...props} />;
    case "nightstand":
      return <NightstandGlyph {...props} />;
    // Living & dining
    case "armchair":
      return <ArmchairGlyph {...props} />;
    case "dining_table":
      return <DiningTableGlyph {...props} />;
    case "tv":
      return <TvGlyph {...props} />;
    case "bookshelf":
      return <BookshelfGlyph {...props} />;
    case "piano":
      return <PianoGlyph {...props} />;
    // Office
    case "filing_cabinet":
      return <FilingCabinetGlyph {...props} />;
    // Outdoor
    case "bbq":
      return <BbqGlyph {...props} />;
    case "pool":
      return <PoolGlyph {...props} />;
    case "hot_tub":
      return <HotTubGlyph {...props} />;
    case "trampoline":
      return <TrampolineGlyph {...props} />;
    case "shed":
      return <ShedGlyph {...props} />;
    case "firepit":
      return <FirepitGlyph {...props} />;
    case "car":
      return <CarGlyph {...props} />;
    // HVAC & utilities
    case "radiator":
      return <RadiatorGlyph {...props} />;
    case "water_heater":
      return <WaterHeaterGlyph {...props} />;
    case "ceiling_fan":
      return <CeilingFanGlyph {...props} />;
    case "air_conditioner":
      return <AirConditionerGlyph {...props} />;
    // Misc
    case "lamp":
      return <LampGlyph {...props} />;
    default:
      return null;
  }
}

/**
 * Default initial size (width, height in 0..1 normalized space) for each
 * sticker kind. Pure visual default — the user is expected to resize.
 */
export const STICKER_DEFAULT_SIZES: Record<MoveStickerKind, { w: number; h: number }> = {
  // Openings & structural
  door: { w: 0.08, h: 0.08 },
  door_double: { w: 0.12, h: 0.08 },
  sliding_door: { w: 0.16, h: 0.06 },
  garage_door: { w: 0.2, h: 0.03 },
  window: { w: 0.12, h: 0.03 },
  wall: { w: 0.2, h: 0.02 },
  archway: { w: 0.12, h: 0.1 },
  column: { w: 0.04, h: 0.04 },
  stairs: { w: 0.1, h: 0.22 },
  fireplace: { w: 0.14, h: 0.08 },
  // Kitchen
  sink: { w: 0.08, h: 0.08 },
  fridge: { w: 0.07, h: 0.1 },
  stove: { w: 0.1, h: 0.08 },
  oven: { w: 0.07, h: 0.09 },
  microwave: { w: 0.08, h: 0.05 },
  dishwasher: { w: 0.08, h: 0.08 },
  kitchen_island: { w: 0.22, h: 0.1 },
  pantry: { w: 0.08, h: 0.12 },
  // Bathroom & laundry
  toilet: { w: 0.07, h: 0.09 },
  bathtub: { w: 0.18, h: 0.09 },
  shower: { w: 0.1, h: 0.1 },
  vanity: { w: 0.18, h: 0.08 },
  mirror: { w: 0.08, h: 0.12 },
  washer: { w: 0.08, h: 0.1 },
  dryer: { w: 0.08, h: 0.1 },
  // Bedroom
  bed: { w: 0.18, h: 0.22 },
  bunk_bed: { w: 0.18, h: 0.22 },
  crib: { w: 0.14, h: 0.18 },
  wardrobe: { w: 0.14, h: 0.06 },
  closet: { w: 0.2, h: 0.06 },
  dresser: { w: 0.14, h: 0.06 },
  nightstand: { w: 0.06, h: 0.06 },
  // Living & dining
  sofa: { w: 0.2, h: 0.09 },
  armchair: { w: 0.1, h: 0.1 },
  table: { w: 0.14, h: 0.1 },
  dining_table: { w: 0.22, h: 0.12 },
  chair: { w: 0.05, h: 0.05 },
  tv: { w: 0.12, h: 0.07 },
  bookshelf: { w: 0.16, h: 0.06 },
  piano: { w: 0.18, h: 0.08 },
  // Office
  desk: { w: 0.14, h: 0.1 },
  filing_cabinet: { w: 0.07, h: 0.1 },
  // Outdoor
  bbq: { w: 0.1, h: 0.08 },
  pool: { w: 0.3, h: 0.22 },
  hot_tub: { w: 0.12, h: 0.12 },
  trampoline: { w: 0.2, h: 0.18 },
  shed: { w: 0.14, h: 0.14 },
  firepit: { w: 0.1, h: 0.1 },
  car: { w: 0.1, h: 0.2 },
  // HVAC & utilities
  radiator: { w: 0.12, h: 0.04 },
  water_heater: { w: 0.06, h: 0.1 },
  ceiling_fan: { w: 0.08, h: 0.08 },
  air_conditioner: { w: 0.12, h: 0.05 },
  // Misc
  plant: { w: 0.06, h: 0.08 },
  rug: { w: 0.22, h: 0.16 },
  lamp: { w: 0.06, h: 0.08 },
  label: { w: 0.12, h: 0.05 },
  arrow: { w: 0.12, h: 0.04 },
};
