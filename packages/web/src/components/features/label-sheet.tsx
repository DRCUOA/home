import { useEffect, useRef, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type {
  MoveBox,
  MoveItem,
  MoveRoom,
  MoveLabelTemplate,
  MoveItemDisposition,
} from "@hcc/shared";
import { MOVE_ITEM_DISPOSITION_LABELS } from "@hcc/shared";
import { code128Svg } from "@/lib/code128";
import { qrSvg } from "@/lib/qrcode";

/** Summarise the dispositions of a box's contents into a short label
 *  string for printing (e.g. "Keep" or "Sell, Dump"). "unassessed"
 *  items are skipped since they carry no actionable disposition.
 *  Returns "" when nothing meaningful is set. */
function dispositionSummary(contents: MoveItem[]): string {
  const seen: string[] = [];
  for (const c of contents) {
    if (c.disposition && c.disposition !== "unassessed" && !seen.includes(c.disposition)) {
      seen.push(c.disposition);
    }
  }
  return seen
    .map((d) => MOVE_ITEM_DISPOSITION_LABELS[d as MoveItemDisposition] ?? d)
    .join(", ");
}

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

/** Per-label inset (mm). Same 4-sided shape is used for both PADDING
 *  (space INSIDE the cell, between die-cut and content) and MARGIN
 *  (space OUTSIDE the cell, shrinking the cell within its grid slot).
 *  Neither relates to the sheet's @page margin — that's left to the
 *  browser / OS print driver. */
export interface LabelInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Back-compat alias — the v1.0.4 PR shipped this name publicly. */
export type LabelPadding = LabelInset;

/** Which inset the four mm inputs in the preview modal currently edit. */
export type LabelInsetMode = "padding" | "margin";

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
  defaultPadding: LabelInset;
  /** Default per-label outer margin (mm). Zero by default — most users
   *  don't need a safety buffer beyond the padding. */
  defaultMargin: LabelInset;
  /** Per-template CSS rules embedded in the print window. Takes both
   *  the current padding (inside each label) and margin (outside each
   *  label, shrinking it within its grid slot) so the user's tweaks
   *  flow into every printed cell. The @page margin stays hardcoded
   *  and is honoured by the browser / OS print driver, not by us. */
  pageCss(padding: LabelInset, margin: LabelInset): string;
  /** Layout of every cell on a single page, in mm. Drives the page-
   *  layout preview. (Page margins are hardcoded so cell positions are
   *  fixed.) */
  computeCells(): CellRect[];
  /** Render a single label cell. Used for both preview and print. */
  renderCell(args: {
    box: MoveBox;
    barcodeSvg: string;
    source: string;
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
    defaultMargin: { top: 0, right: 0, bottom: 0, left: 0 },
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
    pageCss: (p, m) => `
      @page { size: A4; margin: 10mm; }
      .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; padding: 0; }
      .label {
        /* Margin EXPANDS the painted cell beyond its grid slot — the
           grid placement stays where it's computed, but the cell
           overflows outward by ${m.top}/${m.right}/${m.bottom}/${m.left}mm.
           Use this to compensate for printer drift where the real
           die-cut sits a mm or two outside the computed grid. */
        width: calc(100% + ${m.left + m.right}mm);
        margin-top: -${m.top}mm;
        margin-right: -${m.right}mm;
        margin-bottom: -${m.bottom}mm;
        margin-left: -${m.left}mm;
        border: 1.5pt dashed #94a3b8;
        border-radius: 4pt;
        padding: ${p.top}mm ${p.right}mm ${p.bottom}mm ${p.left}mm;
        page-break-inside: avoid;
        break-inside: avoid;
        min-height: calc(60mm + ${m.top + m.bottom}mm);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .label h2 { font-size: 18pt; margin: 0 0 2mm; font-weight: 800; }
      .label .route { margin-bottom: 2mm; }
      .label .sub { font-size: 10pt; color: #475569; margin-bottom: 0.5mm; }
      .label .sub .route-label { font-weight: 700; color: #1e293b; }
      .label .tags { font-size: 9pt; color: #334155; margin-bottom: 2mm; display: flex; gap: 4mm; flex-wrap: wrap; }
      .label .tag { border: 0.75pt solid #cbd5e1; border-radius: 999pt; padding: 1pt 6pt; }
      .label .tag.disposition { border-color: #059669; color: #047857; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3pt; }
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
    renderCell({ box, barcodeSvg, source, destination, contents }) {
      const sym = box.code_type === "code128" ? "code128" : "qr";
      const dispositions = dispositionSummary(contents);
      return (
        <>
          <h2>{box.label}</h2>
          {(source || destination) && (
            <div className="route">
              {source && (
                <div className="sub">
                  <span className="route-label">From:</span> {source}
                </div>
              )}
              {destination && (
                <div className="sub">
                  <span className="route-label">To:</span> {destination}
                </div>
              )}
            </div>
          )}
          <div className="tags">
            {dispositions && <span className="tag disposition">{dispositions}</span>}
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
    defaultMargin: { top: 0, right: 0, bottom: 0, left: 0 },
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
    pageCss: (p, m) => `
      /* LC30 sheet: 3 cols × 10 rows of 64×25mm labels, ~7mm side
         margins, ~13.5mm top/bottom margins, no inter-cell gap.
         @page margin set so the grid starts at the first die.
         Per-label margin EXPANDS the painted cell beyond its 64×25
         slot — the grid placement stays as computed, but each cell
         overflows outward by the margin amount. Use this when the
         physical die-cuts don't quite line up with the computed
         grid; small positive margins (1-2mm) compensate for printer
         drift without misaligning the rest of the sheet. */
      @page { size: A4; margin: 13.5mm 7mm; }
      .sheet {
        display: grid;
        grid-template-columns: repeat(3, 64mm);
        grid-auto-rows: 25mm;
        column-gap: 0;
        row-gap: 0;
      }
      .label {
        width: calc(64mm + ${m.left + m.right}mm);
        height: calc(25mm + ${m.top + m.bottom}mm);
        margin-top: -${m.top}mm;
        margin-right: -${m.right}mm;
        margin-bottom: -${m.bottom}mm;
        margin-left: -${m.left}mm;
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
      .label .barcode svg { display: block; width: 100%; height: 12mm; }
      .label .caption {
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 8pt;
        line-height: 1.1;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .label .route {
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 6.5pt;
        line-height: 1.1;
        text-align: center;
        color: #475569;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
    renderCell({ box, barcodeSvg, source, destination, contents }) {
      const dispositions = dispositionSummary(contents);
      const caption = dispositions ? `${box.label} · ${dispositions}` : box.label;
      const route =
        source || destination ? `${source || "?"} → ${destination || "?"}` : "";
      return (
        <>
          <div
            className="barcode"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: barcodeSvg }}
          />
          <div className="caption">{caption}</div>
          {route && <div className="route">{route}</div>}
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

/** To-scale A4 page diagram with every label cell drawn at its computed
 *  position. Each cell is shown with three concentric rectangles:
 *
 *    1. Computed grid slot (faint) — where the cell would land based
 *       on the template's published die-cut layout
 *    2. Painted cell (= slot expanded by the current MARGIN) — the
 *       area the printer will actually fill. Margin can push this
 *       outside the slot to compensate for printer drift, which is
 *       the whole point of the margin control.
 *    3. Content area (= painted cell minus PADDING) — where the
 *       barcode / text actually sits.
 *
 *  The first top-left cell is the called-out example. Four dotted red
 *  arrows connect the four mm inputs to the matching band of that
 *  cell, with their direction flipped by mode:
 *
 *    - padding mode: arrows point INWARD (input → content edge),
 *      because padding is the inset of content INSIDE the cell.
 *    - margin mode:  arrows point OUTWARD (cell edge → input), because
 *      margin is the OUTWARD expansion of the cell beyond the slot.
 *
 *  Editing any input live-updates every cell on the diagram and flows
 *  into the printed `.label` rule. */
function PageLayoutPreview({
  template,
  padding,
  margin,
  mode,
  onModeChange,
  onChange,
  onReset,
}: {
  template: MoveLabelTemplate;
  padding: LabelInset;
  margin: LabelInset;
  mode: LabelInsetMode;
  onModeChange: (mode: LabelInsetMode) => void;
  onChange: (side: keyof LabelInset, value: number) => void;
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
  const activeInset = mode === "padding" ? padding : margin;
  const isPadMode = mode === "padding";

  /* Page origin in SVG coordinates */
  const pageX = PAD_X;
  const pageY = PAD_Y;

  /* Convert mm-space margin / padding to SVG px */
  const mL = margin.left * SCALE;
  const mR = margin.right * SCALE;
  const mT = margin.top * SCALE;
  const mB = margin.bottom * SCALE;
  const pL = padding.left * SCALE;
  const pR = padding.right * SCALE;
  const pT = padding.top * SCALE;
  const pB = padding.bottom * SCALE;

  /* For each cell give us: slot (computed grid), painted (slot expanded
   * by margin), content (painted shrunk by padding). All in SVG coords. */
  type CellGeom = {
    slotX: number; slotY: number; slotW: number; slotH: number;
    paintX: number; paintY: number; paintW: number; paintH: number;
    contentX: number; contentY: number; contentW: number; contentH: number;
  };
  const geomFor = (cell: CellRect): CellGeom => {
    const slotX = pageX + cell.xMm * SCALE;
    const slotY = pageY + cell.yMm * SCALE;
    const slotW = cell.wMm * SCALE;
    const slotH = cell.hMm * SCALE;
    const paintX = slotX - mL;
    const paintY = slotY - mT;
    const paintW = slotW + mL + mR;
    const paintH = slotH + mT + mB;
    return {
      slotX, slotY, slotW, slotH,
      paintX, paintY, paintW, paintH,
      contentX: paintX + pL,
      contentY: paintY + pT,
      contentW: Math.max(0, paintW - pL - pR),
      contentH: Math.max(0, paintH - pT - pB),
    };
  };

  /* Geometry of the called-out first label */
  const g0 = geomFor(cells[0]);
  const firstCenterX = g0.paintX + g0.paintW / 2;
  const firstCenterY = g0.paintY + g0.paintH / 2;

  /* Arrow endpoints. The OUTER end sits just outside the page (lined
   * up with the corresponding input). The INNER end depends on mode:
   *  - padding: at the CONTENT edge (deeper inside the cell)
   *  - margin:  at the PAINTED edge (further out — the slot edge plus
   *             the current margin, so the arrow visibly tracks the
   *             outward expansion).
   * markerEnd sits at (x2,y2), so we set the inner point as (x2,y2)
   * for padding mode (arrowhead points in) and as (x1,y1) for margin
   * mode (arrowhead points out toward the input). */
  const arrowGap = 4;
  const outerTopY = pageY - arrowGap;
  const outerBottomY = pageY + PAGE_H + arrowGap;
  const outerLeftX = pageX - arrowGap;
  const outerRightX = pageX + PAGE_W + arrowGap;

  const innerTopY = isPadMode ? g0.contentY : g0.paintY;
  const innerBottomY = isPadMode
    ? g0.contentY + g0.contentH
    : g0.paintY + g0.paintH;
  const innerLeftX = isPadMode ? g0.contentX : g0.paintX;
  const innerRightX = isPadMode
    ? g0.contentX + g0.contentW
    : g0.paintX + g0.paintW;

  /* Arrow line endpoints. Same physical line in both modes, but the
   * line direction (and therefore the markerEnd-anchored arrowhead)
   * is reversed for margin mode. */
  const arrows = isPadMode
    ? [
        /* top */    { x1: firstCenterX, y1: outerTopY, x2: firstCenterX, y2: innerTopY },
        /* bottom */ { x1: firstCenterX, y1: outerBottomY, x2: firstCenterX, y2: innerBottomY },
        /* left */   { x1: outerLeftX, y1: firstCenterY, x2: innerLeftX, y2: firstCenterY },
        /* right */  { x1: outerRightX, y1: firstCenterY, x2: innerRightX, y2: firstCenterY },
      ]
    : [
        /* top */    { x1: firstCenterX, y1: innerTopY, x2: firstCenterX, y2: outerTopY },
        /* bottom */ { x1: firstCenterX, y1: innerBottomY, x2: firstCenterX, y2: outerBottomY },
        /* left */   { x1: innerLeftX, y1: firstCenterY, x2: outerLeftX, y2: firstCenterY },
        /* right */  { x1: innerRightX, y1: firstCenterY, x2: outerRightX, y2: firstCenterY },
      ];

  const numberInput = (
    side: keyof LabelInset,
    label: string,
    posStyle: React.CSSProperties,
  ) => (
    <div
      className="absolute flex items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      style={{ ...posStyle, height: INPUT_H }}
      title={
        isPadMode
          ? `${label} padding inside each label`
          : `${label} margin extending each label outward`
      }
    >
      <input
        type="number"
        min={0}
        step={0.5}
        value={activeInset[side]}
        onChange={(e) => onChange(side, parseFloat(e.target.value))}
        className="w-9 bg-transparent text-center text-xs font-mono text-slate-900 outline-none dark:text-slate-100"
        aria-label={`${label} ${mode}, in millimetres`}
      />
      <span className="text-[10px] text-slate-500 dark:text-slate-400">mm</span>
    </div>
  );

  const modeButton = (m: LabelInsetMode, label: string) => (
    <button
      type="button"
      onClick={() => onModeChange(m)}
      className={`min-h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
        mode === m
          ? "bg-primary-500 text-white shadow-sm"
          : "bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
      aria-pressed={mode === m}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
            Adjust:
          </span>
          <div className="inline-flex gap-0.5 rounded-md border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
            {modeButton("padding", "Padding")}
            {modeButton("margin", "Margin")}
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] text-primary-600 hover:underline dark:text-primary-400"
        >
          Reset {mode} to default
        </button>
      </div>
      <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
        {isPadMode
          ? "Padding insets the printed content inside each label (arrows ↘ in)."
          : "Margin expands each label outward beyond its computed grid slot — use to compensate for printer drift (arrows ↖ out)."}
      </p>
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
              id="inset-arrow"
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

          {/* Page outline (purely contextual). */}
          <rect
            x={pageX}
            y={pageY}
            width={PAGE_W}
            height={PAGE_H}
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth={1}
          />

          {/* All label cells. Three rectangles per cell: computed
              slot (faint), painted cell (slot + margin expansion),
              content area (painted - padding). The first cell is
              highlighted to anchor the called-out arrows. */}
          {cells.map((cell, i) => {
            const g = geomFor(cell);
            const isFirst = i === 0;
            return (
              <g key={i}>
                {/* Computed slot — show only if margin > 0 so the
                    user can see the slot vs the painted expansion. */}
                {(mT > 0 || mR > 0 || mB > 0 || mL > 0) && (
                  <rect
                    x={g.slotX}
                    y={g.slotY}
                    width={g.slotW}
                    height={g.slotH}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth={0.4}
                    strokeDasharray="1 2"
                  />
                )}
                {/* Painted cell (slot + margin) */}
                <rect
                  x={g.paintX}
                  y={g.paintY}
                  width={g.paintW}
                  height={g.paintH}
                  fill={isFirst ? "#fef2f2" : "#ffffff"}
                  stroke={isFirst ? "#0f172a" : "#cbd5e1"}
                  strokeWidth={isFirst ? 1.25 : 0.5}
                  strokeDasharray={isFirst ? undefined : "2 2"}
                />
                {/* Content area (painted - padding) */}
                {g.contentW > 0 && g.contentH > 0 && (
                  <rect
                    x={g.contentX}
                    y={g.contentY}
                    width={g.contentW}
                    height={g.contentH}
                    fill={isFirst ? "#ffffff" : "#f8fafc"}
                    stroke={isFirst ? "#0f172a" : "#94a3b8"}
                    strokeWidth={isFirst ? 0.75 : 0.4}
                    strokeDasharray="2 1.5"
                  />
                )}
                {!isFirst && (
                  <text
                    x={g.paintX + g.paintW / 2}
                    y={g.paintY + g.paintH / 2 + 3}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#cbd5e1"
                  >
                    {i + 1}
                  </text>
                )}
                {isFirst && g.contentW > 0 && g.contentH > 0 && (
                  <text
                    x={g.contentX + g.contentW / 2}
                    y={g.contentY + g.contentH / 2 + 3}
                    textAnchor="middle"
                    fontSize={Math.max(7, Math.min(10, g.contentW * 0.08))}
                    fontWeight={600}
                    fill="#0f172a"
                  >
                    First label
                  </text>
                )}
              </g>
            );
          })}

          {/* Dotted red arrows. Direction is reversed in margin mode
              (markerEnd is always at (x2,y2); we swap line direction
              based on mode so the arrowhead lands at the right end). */}
          {arrows.map((a, i) => (
            <line
              key={i}
              x1={a.x1}
              y1={a.y1}
              x2={a.x2}
              y2={a.y2}
              stroke="#dc2626"
              strokeWidth={1.25}
              strokeDasharray="2 2"
              markerEnd="url(#inset-arrow)"
            />
          ))}
        </svg>

        {/* Four mm inputs — same positions for both modes, aligned
            with the first label's centre so the arrows stay clean
            verticals / horizontals. */}
        {numberInput("top", "Top", {
          top: 8,
          left: firstCenterX - INPUT_W / 2,
          width: INPUT_W,
        })}
        {numberInput("bottom", "Bottom", {
          top: pageY + PAGE_H + PAD_Y - INPUT_H - 8,
          left: firstCenterX - INPUT_W / 2,
          width: INPUT_W,
        })}
        {numberInput("left", "Left", {
          top: firstCenterY - INPUT_H / 2,
          left: 4,
          width: INPUT_W,
        })}
        {numberInput("right", "Right", {
          top: firstCenterY - INPUT_H / 2,
          left: pageX + PAGE_W + PAD_X - INPUT_W - 4,
          width: INPUT_W,
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 text-center">
        {spec.label} — both padding and margin are saved per template.
      </p>
    </div>
  );
}

const MAX_COPIES = 50;

/** localStorage key for the saved padding/margin of a given template.
 *  Both inset profiles drift per-printer/per-stock, so each template
 *  keeps its own value for each mode. */
const insetKey = (template: MoveLabelTemplate, mode: LabelInsetMode) =>
  `homelhar-label-${mode}-${template}`;

/** Per-axis cap. Padding is capped tighter (~45% of cell axis) than
 *  margin (~45% as well, but applied to whichever axis the side sits
 *  on). The cap exists so the user can't crush the printed area down
 *  to zero by accident. */
function insetCap(template: MoveLabelTemplate, axis: "x" | "y"): number {
  const cell = TEMPLATES[template].computeCells()[0];
  return axis === "x" ? cell.wMm * 0.45 : cell.hMm * 0.45;
}

function clampInset(
  template: MoveLabelTemplate,
  side: keyof LabelInset,
  value: number,
): number {
  if (Number.isNaN(value)) return 0;
  const axis = side === "top" || side === "bottom" ? "y" : "x";
  return Math.max(0, Math.min(insetCap(template, axis), value));
}

function defaultInset(
  template: MoveLabelTemplate,
  mode: LabelInsetMode,
): LabelInset {
  const spec = TEMPLATES[template];
  return mode === "padding" ? spec.defaultPadding : spec.defaultMargin;
}

function loadInset(
  template: MoveLabelTemplate,
  mode: LabelInsetMode,
): LabelInset {
  const fallback = defaultInset(template, mode);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(insetKey(template, mode));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LabelInset>;
    return {
      top: clampInset(template, "top", Number(parsed.top ?? fallback.top)),
      right: clampInset(template, "right", Number(parsed.right ?? fallback.right)),
      bottom: clampInset(template, "bottom", Number(parsed.bottom ?? fallback.bottom)),
      left: clampInset(template, "left", Number(parsed.left ?? fallback.left)),
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
  const [padding, setPadding] = useState<LabelInset>(() => loadInset(template, "padding"));
  const [margin, setMargin] = useState<LabelInset>(() => loadInset(template, "margin"));
  /* Which inset the four mm inputs currently edit. Padding by default
   * (most users adjust this); margin is for printer-drift compensation. */
  const [mode, setMode] = useState<LabelInsetMode>("padding");

  // Reset copies when the modal re-opens so a previous run's value
  // doesn't surprise the next user.
  useEffect(() => {
    if (open) setCopies(initialCopies);
  }, [open, initialCopies]);

  // Reload saved padding + margin when the active template changes —
  // each template keeps its own profile for each mode.
  useEffect(() => {
    setPadding(loadInset(template, "padding"));
    setMargin(loadInset(template, "margin"));
  }, [template]);

  // Persist whenever the active inset changes so the printer line-up
  // sticks across sessions.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(insetKey(template, "padding"), JSON.stringify(padding));
    } catch {
      /* localStorage full / disabled — non-fatal. */
    }
  }, [padding, template]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(insetKey(template, "margin"), JSON.stringify(margin));
    } catch {
      /* localStorage full / disabled — non-fatal. */
    }
  }, [margin, template]);

  const spec = TEMPLATES[template];
  const activeInset = mode === "padding" ? padding : margin;
  const setActiveInset = mode === "padding" ? setPadding : setMargin;

  const updateInset = (side: keyof LabelInset, value: number) => {
    setActiveInset((prev) => ({ ...prev, [side]: clampInset(template, side, value) }));
  };

  const resetActiveInset = () =>
    setActiveInset(defaultInset(template, mode));

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
    ${spec.pageCss(padding, margin)}
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

        {/* Per-label inset preview — to-scale A4 diagram with the
            first label called out by dotted red arrows. The toggle
            picks which inset the four mm inputs edit:
              - padding: shrinks content INSIDE the cell (arrows in)
              - margin:  expands the cell OUTSIDE its computed slot
                so the printed area can be nudged to match the real
                die-cuts (arrows out)
            Both apply together at print time. */}
        <div className="overflow-x-auto">
          <PageLayoutPreview
            template={template}
            padding={padding}
            margin={margin}
            mode={mode}
            onModeChange={setMode}
            onChange={updateInset}
            onReset={resetActiveInset}
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
              // Box-level room wins; otherwise fall back to a contained
              // item's room. "To" is kept consistent across a box's items
              // (enforced when items are added), so any item's destination
              // is representative. "From" may vary per item, so we surface
              // the first one present.
              const srcId =
                box.source_room_id ??
                contents.find((c) => c.origin_room_id)?.origin_room_id;
              const destId =
                box.destination_room_id ??
                contents.find((c) => c.destination_room_id)?.destination_room_id;
              const src = roomName(srcId);
              const dest = roomName(destId);
              const barcodeSvg = barcodeSvgFor(box, template);
              return (
                <div
                  key={`${box.id}-${copyIndex}`}
                  className={`${spec.previewCellClass}${box.fragile ? " fragile" : ""}`}
                  /* Inline padding wins over the Tailwind p-* utility
                   * in previewCellClass; negative margin mirrors the
                   * print CSS that expands the cell beyond its grid
                   * slot, so on-screen cells reflect what the printer
                   * will actually do. */
                  style={{
                    padding: `${padding.top}mm ${padding.right}mm ${padding.bottom}mm ${padding.left}mm`,
                    margin: `-${margin.top}mm -${margin.right}mm -${margin.bottom}mm -${margin.left}mm`,
                  }}
                >
                  {spec.renderCell({ box, barcodeSvg, source: src, destination: dest, contents })}
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
