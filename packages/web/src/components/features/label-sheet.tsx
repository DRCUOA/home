import { useEffect, useRef, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { MoveBox, MoveItem, MoveRoom, MoveLabelTemplate } from "@hcc/shared";
import { code128Svg } from "@/lib/code128";
import { qrSvg } from "@/lib/qrcode";

/**
 * Printable label sheet for boxes. Renders a grid of labels and gives
 * the user a "Print" button that opens the browser's Print dialog.
 *
 * Templates control the cell-size and content density:
 *   - a4-8up: large 99×67mm cells (Avery L7165 / J8165 stock). Full
 *     content: heading, destination, fragile/priority chips, contents
 *     list, large barcode. The default.
 *   - lc30:   compact 64×25mm cells (LC30 inkjet stock). Two-column
 *     content: QR on the left, bold name + destination + barcode text
 *     on the right. Fragile is rendered as a red left-edge bar (no
 *     room for chip text). Contents list omitted.
 *
 * Print uses each template's own @page + grid rules so cell edges line
 * up with the physical die-cuts. The on-screen preview mirrors the
 * print layout at scaled-down dimensions so the user sees what will
 * come out.
 */

/* ============ Template specs ============ */

/** Per-label padding (mm). User-tweakable per template — this is the
 *  inner cell padding around the printed content, NOT the @page margin
 *  (that's left to the browser / OS print driver). */
export interface LabelPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A single label cell's position on the page, in millimetres. */
interface CellRect {
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

interface TemplateSpec {
  /** Cells per page — used by the on-screen preview header. */
  perPage: number;
  /** Human label for the picker. */
  label: string;
  /** Physical sheet description shown in the picker tooltip. */
  description: string;
  /** Number of preview columns on screen. */
  previewCols: number;
  /** Symbology to render for a given box. lc30 forces QR (Code 128 is
   *  unreadable at 64mm width on a short label). */
  symbology(box: MoveBox): "qr" | "code128";
  /** Tailwind classes applied to the on-screen preview cell. */
  previewCellClass: string;
  /** Default per-label inner padding (mm) for the stock this template
   *  targets. */
  defaultPadding: LabelPadding;
  /** Per-template CSS rules embedded in the print window. Takes the
   *  current label padding so the user's tweaks flow into every printed
   *  cell. The @page margin stays hardcoded and is honoured by the
   *  browser / OS print driver, not by us. */
  pageCss(padding: LabelPadding): string;
  /** Layout of every cell on a single page, in mm. Drives the page-
   *  layout preview. (Page margins are hardcoded so cell positions are
   *  fixed.) */
  computeCells(): CellRect[];
  /** Render a single label cell. Used for both preview and print. */
  renderCell(args: {
    box: MoveBox;
    barcodeSvg: string;
    destination: string;
    contents: MoveItem[];
  }): React.ReactNode;
}

/** Physical A4 dimensions in millimetres — used by the page-layout preview. */
const A4_W_MM = 210;
const A4_H_MM = 297;

const TEMPLATES: Record<MoveLabelTemplate, TemplateSpec> = {
  "a4-8up": {
    perPage: 8,
    label: "A4 — 8 labels (99×67mm)",
    description: "Avery L7165 / J8165",
    previewCols: 2,
    symbology: (box) => (box.code_type === "code128" ? "code128" : "qr"),
    previewCellClass:
      "label rounded border-2 border-dashed border-slate-400 bg-white p-3 text-slate-900",
    defaultPadding: { top: 6, right: 6, bottom: 6, left: 6 },
    computeCells() {
      /* Page margins are hardcoded at 10mm uniform; the cells line up
       * with the Avery die-cuts inside that. */
      const pageMargin = 10;
      const cols = 2;
      const rows = 4;
      const colGap = 6;
      const rowGap = 6;
      const cellW = (A4_W_MM - pageMargin * 2 - colGap * (cols - 1)) / cols;
      const cellH = 60;
      const cells: CellRect[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cells.push({
            xMm: pageMargin + c * (cellW + colGap),
            yMm: pageMargin + r * (cellH + rowGap),
            wMm: cellW,
            hMm: cellH,
          });
        }
      }
      return cells;
    },
    pageCss: (p) => `
      @page { size: A4; margin: 10mm; }
      .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; padding: 0; }
      .label {
        border: 1.5pt dashed #94a3b8;
        border-radius: 4pt;
        padding: ${p.top}mm ${p.right}mm ${p.bottom}mm ${p.left}mm;
        page-break-inside: avoid;
        break-inside: avoid;
        min-height: 60mm;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .label h2 { font-size: 18pt; margin: 0 0 2mm; font-weight: 800; }
      .label .sub { font-size: 10pt; color: #475569; margin-bottom: 2mm; }
      .label .tags { font-size: 9pt; color: #334155; margin-bottom: 2mm; display: flex; gap: 4mm; flex-wrap: wrap; }
      .label .tag { border: 0.75pt solid #cbd5e1; border-radius: 999pt; padding: 1pt 6pt; }
      .label .tag.fragile { border-color: #dc2626; color: #dc2626; }
      .label .tag.priority-first_night { border-color: #d97706; color: #d97706; }
      .label .tag.priority-high { border-color: #2563eb; color: #2563eb; }
      .label ul { margin: 2mm 0; padding-left: 4mm; font-size: 9pt; color: #475569; }
      .label ul li { margin: 0; }
      .label .barcode-wrap { margin-top: 3mm; text-align: center; }
      .label .barcode-wrap.code128 svg { width: 100%; height: 18mm; }
      .label .barcode-wrap.qr { display: flex; justify-content: center; }
      .label .barcode-wrap.qr svg { width: 28mm; height: 28mm; }
      .label .code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 10pt; letter-spacing: 0.5pt; text-align: center; margin-top: 1mm; }
    `,
    renderCell({ box, barcodeSvg, destination, contents }) {
      const sym = box.code_type === "code128" ? "code128" : "qr";
      return (
        <>
          <h2>{box.label}</h2>
          {destination && <div className="sub">→ {destination}</div>}
          <div className="tags">
            {box.priority && box.priority !== "normal" && (
              <span className={`tag priority-${box.priority}`}>
                {box.priority === "first_night" ? "First night" : box.priority}
              </span>
            )}
            {box.fragile && <span className="tag fragile">FRAGILE</span>}
          </div>
          {contents.length > 0 && (
            <ul>
              {contents.slice(0, 6).map((c) => (
                <li key={c.id}>
                  {c.name}
                  {c.quantity > 1 ? ` ×${c.quantity}` : ""}
                </li>
              ))}
              {contents.length > 6 && <li>…and {contents.length - 6} more</li>}
            </ul>
          )}
          <div className={`barcode-wrap ${sym}`}>
            <div
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: barcodeSvg }}
            />
            <div className="code">{box.barcode}</div>
          </div>
        </>
      );
    },
  },

  /* LC30 — 30-up 64×25mm small-label layout.
   *
   * Spec from the user: just the Code 128 barcode (full width) with a
   * single mono caption "Box N → Room" underneath. No QR, no fragile
   * indicator, no barcode value text — keep it readable from across a
   * room with the minimum ink that reliably scans. */
  lc30: {
    perPage: 30,
    label: "LC30 — 30 labels (64×25mm)",
    description: "LC30 inkjet, 3 cols × 10 rows, Code 128 only",
    previewCols: 3,
    symbology: () => "code128",
    previewCellClass:
      "lc30-label flex flex-col items-stretch justify-center gap-1 rounded-sm border border-slate-300 bg-white p-1.5 text-slate-900 min-h-[60px]",
    defaultPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
    computeCells() {
      /* LC30 page margins are fixed by the stock — 13.5mm top/bottom,
       * 7mm sides — so the 3×10 grid lands on the die-cuts. The user
       * controls inner cell padding, not these. */
      const marginTop = 13.5;
      const marginLeft = 7;
      const cellW = 64;
      const cellH = 25;
      const cols = 3;
      const rows = 10;
      const cells: CellRect[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cells.push({
            xMm: marginLeft + c * cellW,
            yMm: marginTop + r * cellH,
            wMm: cellW,
            hMm: cellH,
          });
        }
      }
      return cells;
    },
    pageCss: (p) => `
      /* LC30 sheet: 3 cols × 10 rows of 64×25mm labels, ~7mm side
         margins, ~13.5mm top/bottom margins, no inter-cell gap.
         Margins set on @page so the grid starts at the first die. */
      @page { size: A4; margin: 13.5mm 7mm; }
      .sheet {
        display: grid;
        grid-template-columns: repeat(3, 64mm);
        grid-auto-rows: 25mm;
        column-gap: 0;
        row-gap: 0;
      }
      .label {
        width: 64mm;
        height: 25mm;
        padding: ${p.top}mm ${p.right}mm ${p.bottom}mm ${p.left}mm;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0.8mm;
        page-break-inside: avoid;
        break-inside: avoid;
        overflow: hidden;
      }
      /* Barcode stretches to the full content width and a fixed height —
         preserveAspectRatio=none on the SVG side makes this exact. */
      .label .barcode { width: 100%; }
      .label .barcode svg { display: block; width: 100%; height: 14mm; }
      .label .caption {
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 8pt;
        line-height: 1.1;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
    renderCell({ box, barcodeSvg, destination }) {
      const caption = destination ? `${box.label} → ${destination}` : box.label;
      return (
        <>
          <div
            className="barcode"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: barcodeSvg }}
          />
          <div className="caption">{caption}</div>
        </>
      );
    },
  },
};

/** Render the appropriate symbology SVG for a box, given the template
 *  the caller is using. Templates can force a symbology (LC30 forces
 *  Code 128) regardless of box.code_type. LC30 also stretches the
 *  bars to fill the slot exactly (preserveAspectRatio=none) because
 *  every label cell has a fixed printed size. */
function barcodeSvgFor(box: MoveBox, template: MoveLabelTemplate): string {
  const sym = TEMPLATES[template].symbology(box);
  if (sym === "code128") {
    return code128Svg(box.barcode, {
      preserveAspectRatio: template === "lc30" ? "none" : undefined,
    });
  }
  return qrSvg(box.barcode);
}

/* ============ Page layout preview ============ */

/** Renders a to-scale A4 page diagram with every label cell on it.
 *  The first top-left cell is the called-out example: its inner
 *  content area (after padding) is highlighted and four dotted red
 *  arrows fan out from the four mm-unit input boxes to the matching
 *  padding band of that cell.
 *
 *  Editing any input live-updates EVERY cell's inner content area
 *  (since one padding value applies to every label) AND flows into
 *  the printed `.label { padding: ... }` rule. The @page margin is
 *  not touched — that's the browser / OS print driver's job. */
function PageLayoutPreview({
  template,
  padding,
  onChange,
  onReset,
}: {
  template: MoveLabelTemplate;
  padding: LabelPadding;
  onChange: (side: keyof LabelPadding, value: number) => void;
  onReset: () => void;
}) {
  /* Layout constants — chosen so the whole diagram fits inside the
   * default `md` modal width on phones and desktops alike. */
  const SCALE = 1.2; // px per mm
  const PAGE_W = A4_W_MM * SCALE; // ≈252
  const PAGE_H = A4_H_MM * SCALE; // ≈356
  const INPUT_W = 70;
  const INPUT_H = 26;
  const PAD_X = 80; // room either side for left/right inputs + arrows
  const PAD_Y = 56; // room above/below for top/bottom inputs + arrows
  const WRAP_W = PAGE_W + PAD_X * 2;
  const WRAP_H = PAGE_H + PAD_Y * 2;

  const spec = TEMPLATES[template];
  const cells = spec.computeCells();

  /* Page origin in SVG coordinates */
  const pageX = PAD_X;
  const pageY = PAD_Y;

  /* First label cell — the called-out example */
  const first = cells[0];
  const firstX = pageX + first.xMm * SCALE;
  const firstY = pageY + first.yMm * SCALE;
  const firstW = first.wMm * SCALE;
  const firstH = first.hMm * SCALE;

  /* Inner content area of the first label, after the current padding */
  const padL = padding.left * SCALE;
  const padR = padding.right * SCALE;
  const padT = padding.top * SCALE;
  const padB = padding.bottom * SCALE;
  const innerX = firstX + padL;
  const innerY = firstY + padT;
  const innerW = Math.max(0, firstW - padL - padR);
  const innerH = Math.max(0, firstH - padT - padB);

  /* Inputs align with the first label's centre (not the page centre)
   * so the dotted arrows are straight verticals / horizontals — no
   * confusing diagonals. The bottom/right arrows are longer than the
   * top/left ones because the first label lives in the top-left of
   * the page; they still cross other cells, which is fine — every
   * cell on the sheet gets the same padding. */
  const firstCenterX = firstX + firstW / 2;
  const firstCenterY = firstY + firstH / 2;

  /* Arrow endpoints — each starts at the outer edge of the cell (or
   * just inside it) and points inward to the content edge. */
  const arrowGap = 4;
  const topArrowX = firstCenterX;
  const topArrowY1 = pageY - arrowGap;
  const topArrowY2 = innerY;

  const bottomArrowX = firstCenterX;
  const bottomArrowY1 = pageY + PAGE_H + arrowGap;
  const bottomArrowY2 = innerY + innerH;

  const leftArrowY = firstCenterY;
  const leftArrowX1 = pageX - arrowGap;
  const leftArrowX2 = innerX;

  const rightArrowY = firstCenterY;
  const rightArrowX1 = pageX + PAGE_W + arrowGap;
  const rightArrowX2 = innerX + innerW;

  const numberInput = (
    side: keyof LabelPadding,
    label: string,
    posStyle: React.CSSProperties,
  ) => (
    <div
      className="absolute flex items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      style={{ ...posStyle, height: INPUT_H }}
      title={`${label} padding inside each label`}
    >
      <input
        type="number"
        min={0}
        step={0.5}
        value={padding[side]}
        onChange={(e) => onChange(side, parseFloat(e.target.value))}
        className="w-9 bg-transparent text-center text-xs font-mono text-slate-900 outline-none dark:text-slate-100"
        aria-label={`${label} padding inside each label, in millimetres`}
      />
      <span className="text-[10px] text-slate-500 dark:text-slate-400">mm</span>
    </div>
  );

  /* Helper: the inner (content) rect for an arbitrary cell, in SVG
   * coords. Used to draw the padded content area on every cell. */
  const innerRectFor = (cell: CellRect) => {
    const cx = pageX + cell.xMm * SCALE;
    const cy = pageY + cell.yMm * SCALE;
    const cw = cell.wMm * SCALE;
    const ch = cell.hMm * SCALE;
    return {
      x: cx + padL,
      y: cy + padT,
      w: Math.max(0, cw - padL - padR),
      h: Math.max(0, ch - padT - padB),
    };
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
          Label padding (mm) — applies inside every label on the sheet
        </p>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] text-primary-600 hover:underline dark:text-primary-400"
        >
          Reset to template defaults
        </button>
      </div>
      <div
        className="relative mx-auto"
        style={{ width: WRAP_W, height: WRAP_H }}
      >
        <svg
          width={WRAP_W}
          height={WRAP_H}
          viewBox={`0 0 ${WRAP_W} ${WRAP_H}`}
          className="block"
          aria-hidden
        >
          <defs>
            <marker
              id="pad-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="#dc2626" />
            </marker>
          </defs>

          {/* Page outline (purely contextual — @page margins are
              hardcoded, the user doesn't control them here). */}
          <rect
            x={pageX}
            y={pageY}
            width={PAGE_W}
            height={PAGE_H}
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth={1}
          />

          {/* All label cells. Every cell shows its outer die-cut and
              its inner content rectangle so the user sees the padding
              applied to all labels, not just the called-out one. */}
          {cells.map((cell, i) => {
            const cx = pageX + cell.xMm * SCALE;
            const cy = pageY + cell.yMm * SCALE;
            const cw = cell.wMm * SCALE;
            const ch = cell.hMm * SCALE;
            const inner = innerRectFor(cell);
            const isFirst = i === 0;
            return (
              <g key={i}>
                {/* Outer cell (die-cut) */}
                <rect
                  x={cx}
                  y={cy}
                  width={cw}
                  height={ch}
                  fill={isFirst ? "#fef2f2" : "#ffffff"}
                  stroke={isFirst ? "#0f172a" : "#cbd5e1"}
                  strokeWidth={isFirst ? 1.25 : 0.5}
                  strokeDasharray={isFirst ? undefined : "2 2"}
                />
                {/* Inner content rectangle (cell minus padding) */}
                {inner.w > 0 && inner.h > 0 && (
                  <rect
                    x={inner.x}
                    y={inner.y}
                    width={inner.w}
                    height={inner.h}
                    fill={isFirst ? "#ffffff" : "#f8fafc"}
                    stroke={isFirst ? "#0f172a" : "#94a3b8"}
                    strokeWidth={isFirst ? 0.75 : 0.4}
                    strokeDasharray="2 1.5"
                  />
                )}
                {!isFirst && (
                  <text
                    x={cx + cw / 2}
                    y={cy + ch / 2 + 3}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#cbd5e1"
                  >
                    {i + 1}
                  </text>
                )}
                {isFirst && inner.w > 0 && inner.h > 0 && (
                  <text
                    x={inner.x + inner.w / 2}
                    y={inner.y + inner.h / 2 + 3}
                    textAnchor="middle"
                    fontSize={Math.max(7, Math.min(10, inner.w * 0.08))}
                    fontWeight={600}
                    fill="#0f172a"
                  >
                    First label
                  </text>
                )}
              </g>
            );
          })}

          {/* Dotted red arrows from each input to the matching padding
              band on the first label. Vertical for top/bottom,
              horizontal for left/right. */}
          <line
            x1={topArrowX}
            y1={topArrowY1}
            x2={topArrowX}
            y2={topArrowY2}
            stroke="#dc2626"
            strokeWidth={1.25}
            strokeDasharray="2 2"
            markerEnd="url(#pad-arrow)"
          />
          <line
            x1={bottomArrowX}
            y1={bottomArrowY1}
            x2={bottomArrowX}
            y2={bottomArrowY2}
            stroke="#dc2626"
            strokeWidth={1.25}
            strokeDasharray="2 2"
            markerEnd="url(#pad-arrow)"
          />
          <line
            x1={leftArrowX1}
            y1={leftArrowY}
            x2={leftArrowX2}
            y2={leftArrowY}
            stroke="#dc2626"
            strokeWidth={1.25}
            strokeDasharray="2 2"
            markerEnd="url(#pad-arrow)"
          />
          <line
            x1={rightArrowX1}
            y1={rightArrowY}
            x2={rightArrowX2}
            y2={rightArrowY}
            stroke="#dc2626"
            strokeWidth={1.25}
            strokeDasharray="2 2"
            markerEnd="url(#pad-arrow)"
          />
        </svg>

        {/* Four padding inputs — absolutely positioned so each sits
            outside the page, aligned with the first label's centre so
            the arrows are clean verticals / horizontals. */}
        {numberInput("top", "Top", {
          top: 8,
          left: topArrowX - INPUT_W / 2,
          width: INPUT_W,
        })}
        {numberInput("bottom", "Bottom", {
          top: pageY + PAGE_H + PAD_Y - INPUT_H - 8,
          left: bottomArrowX - INPUT_W / 2,
          width: INPUT_W,
        })}
        {numberInput("left", "Left", {
          top: leftArrowY - INPUT_H / 2,
          left: 4,
          width: INPUT_W,
        })}
        {numberInput("right", "Right", {
          top: rightArrowY - INPUT_H / 2,
          left: pageX + PAGE_W + PAD_X - INPUT_W - 4,
          width: INPUT_W,
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 text-center">
        {spec.label} — page margins are handled by the print dialog. Padding is saved per template.
      </p>
    </div>
  );
}

const MAX_COPIES = 50;

/** localStorage key for the saved per-label padding of a given
 *  template. Padding drifts per-printer/per-stock, so each template
 *  keeps its own value. */
const paddingKey = (template: MoveLabelTemplate) =>
  `homelhar-label-padding-${template}`;

/** Pick a cap so the user can't pad the content area into negative
 *  size. Capped at ~45% of the smaller cell dimension on each axis. */
function paddingCap(template: MoveLabelTemplate, axis: "x" | "y"): number {
  const cell = TEMPLATES[template].computeCells()[0];
  return axis === "x" ? cell.wMm * 0.45 : cell.hMm * 0.45;
}

/** Clamp a padding value into a sensible range — never negative, never
 *  enough to crush the content area. */
function clampPadding(
  template: MoveLabelTemplate,
  side: keyof LabelPadding,
  value: number,
): number {
  if (Number.isNaN(value)) return 0;
  const axis = side === "top" || side === "bottom" ? "y" : "x";
  return Math.max(0, Math.min(paddingCap(template, axis), value));
}

function loadPadding(template: MoveLabelTemplate): LabelPadding {
  const fallback = TEMPLATES[template].defaultPadding;
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(paddingKey(template));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LabelPadding>;
    return {
      top: clampPadding(template, "top", Number(parsed.top ?? fallback.top)),
      right: clampPadding(template, "right", Number(parsed.right ?? fallback.right)),
      bottom: clampPadding(template, "bottom", Number(parsed.bottom ?? fallback.bottom)),
      left: clampPadding(template, "left", Number(parsed.left ?? fallback.left)),
    };
  } catch {
    return fallback;
  }
}

interface LabelSheetProps {
  open: boolean;
  onClose: () => void;
  boxes: MoveBox[];
  items: MoveItem[];
  rooms: MoveRoom[];
  template?: MoveLabelTemplate;
  title?: string;
  /** Initial copies-per-label value. User can still change it in the
   *  modal. Defaults to 1. */
  initialCopies?: number;
}

export function LabelSheet({
  open,
  onClose,
  boxes,
  items,
  rooms,
  template = "a4-8up",
  title = "Print labels",
  initialCopies = 1,
}: LabelSheetProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(initialCopies);
  const [padding, setPadding] = useState<LabelPadding>(() => loadPadding(template));

  // Reset copies when the modal re-opens so a previous run's value
  // doesn't surprise the next user.
  useEffect(() => {
    if (open) setCopies(initialCopies);
  }, [open, initialCopies]);

  // Reload saved padding when the active template changes — each
  // template keeps its own padding profile.
  useEffect(() => {
    setPadding(loadPadding(template));
  }, [template]);

  // Persist padding whenever it changes so the same printer line-up
  // sticks across sessions.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(paddingKey(template), JSON.stringify(padding));
    } catch {
      /* localStorage full / disabled — non-fatal, just don't persist. */
    }
  }, [padding, template]);

  const spec = TEMPLATES[template];

  const updatePadding = (side: keyof LabelPadding, value: number) => {
    setPadding((prev) => ({ ...prev, [side]: clampPadding(template, side, value) }));
  };

  const resetPadding = () => setPadding(spec.defaultPadding);

  // Repeat each box `copies` times. Each repetition gets a unique React
  // key but renders the same underlying label (same barcode).
  const expanded: { box: MoveBox; copyIndex: number }[] = [];
  for (const box of boxes) {
    for (let i = 0; i < copies; i++) {
      expanded.push({ box, copyIndex: i });
    }
  }

  const roomName = (id?: string) =>
    id ? rooms.find((r) => r.id === id)?.name ?? "" : "";

  const itemsByBox = new Map<string, MoveItem[]>();
  for (const box of boxes) itemsByBox.set(box.id, []);
  for (const item of items) {
    if (item.box_id && itemsByBox.has(item.box_id)) {
      itemsByBox.get(item.box_id)!.push(item);
    }
  }

  const handlePrint = () => {
    if (!printRef.current) return;
    const html = printRef.current.innerHTML;
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) {
      // popup blocked: fall back to inline print
      window.print();
      return;
    }
    win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Move labels</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
    ${spec.pageCss(padding)}
  </style>
</head>
<body>
  <div class="sheet">${html}</div>
  <script>window.onload = () => { window.focus(); window.print(); setTimeout(() => window.close(), 500); };</script>
</body>
</html>`);
    win.document.close();
  };

  // keyboard: Esc closes the modal
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const totalLabels = expanded.length;
  const pages = Math.ceil(totalLabels / spec.perPage);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {boxes.length} {boxes.length === 1 ? "label" : "labels"}
            {copies > 1 && ` × ${copies} copies = ${totalLabels}`}
            {pages > 0 && ` across ${pages} ${pages === 1 ? "page" : "pages"}`}
            {" — "}{spec.label}
          </p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              Copies
              <input
                type="number"
                min={1}
                max={MAX_COPIES}
                value={copies}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isNaN(n)) return;
                  setCopies(Math.max(1, Math.min(MAX_COPIES, n)));
                }}
                className="w-16 min-h-10 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-slate-100"
                aria-label="Copies per label"
              />
            </label>
            <Button variant="secondary" size="sm" className="min-h-10" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
            <Button size="sm" className="min-h-10" onClick={handlePrint} disabled={totalLabels === 0}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </div>
        </div>

        {/* Per-label padding preview — to-scale A4 diagram with the
            first label called out by dotted red arrows. Edits live-
            update every cell on the diagram AND flow into the print
            CSS so what the user sees is what the printer prints. The
            page (@page) margin stays hardcoded; that's the browser /
            OS print driver's job. */}
        <div className="overflow-x-auto">
          <PageLayoutPreview
            template={template}
            padding={padding}
            onChange={updatePadding}
            onReset={resetPadding}
          />
        </div>

        {/* On-screen content preview — the printed output uses its own stylesheet above. */}
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
          <div
            ref={printRef}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${spec.previewCols}, minmax(0, 1fr))` }}
          >
            {expanded.map(({ box, copyIndex }) => {
              const contents = itemsByBox.get(box.id) ?? [];
              const dest = roomName(box.destination_room_id);
              const barcodeSvg = barcodeSvgFor(box, template);
              return (
                <div
                  key={`${box.id}-${copyIndex}`}
                  className={`${spec.previewCellClass}${box.fragile ? " fragile" : ""}`}
                  /* Inline padding wins over the Tailwind p-* utility
                   * in previewCellClass, so on-screen cells reflect
                   * the user's chosen padding alongside the print
                   * output. */
                  style={{
                    padding: `${padding.top}mm ${padding.right}mm ${padding.bottom}mm ${padding.left}mm`,
                  }}
                >
                  {spec.renderCell({ box, barcodeSvg, destination: dest, contents })}
                </div>
              );
            })}
            {totalLabels === 0 && (
              <div
                className="text-center text-sm text-slate-500 py-8"
                style={{ gridColumn: `span ${spec.previewCols}` }}
              >
                No boxes yet — add some in the Boxes tab and they'll appear here.
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
