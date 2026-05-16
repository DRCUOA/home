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
  /** Per-template CSS rules embedded in the print window. */
  pageCss: string;
  /** Render a single label cell. Used for both preview and print. */
  renderCell(args: {
    box: MoveBox;
    barcodeSvg: string;
    destination: string;
    contents: MoveItem[];
  }): React.ReactNode;
}

const TEMPLATES: Record<MoveLabelTemplate, TemplateSpec> = {
  "a4-8up": {
    perPage: 8,
    label: "A4 — 8 labels (99×67mm)",
    description: "Avery L7165 / J8165",
    previewCols: 2,
    symbology: (box) => (box.code_type === "code128" ? "code128" : "qr"),
    previewCellClass:
      "label rounded border-2 border-dashed border-slate-400 bg-white p-3 text-slate-900",
    pageCss: `
      @page { size: A4; margin: 10mm; }
      .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; padding: 0; }
      .label {
        border: 1.5pt dashed #94a3b8;
        border-radius: 4pt;
        padding: 6mm;
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
    pageCss: `
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
        padding: 1.5mm 2mm;
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

const MAX_COPIES = 50;

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

  // Reset copies when the modal re-opens so a previous run's value
  // doesn't surprise the next user.
  useEffect(() => {
    if (open) setCopies(initialCopies);
  }, [open, initialCopies]);

  const spec = TEMPLATES[template];

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
    ${spec.pageCss}
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

        {/* On-screen preview — the printed output uses its own stylesheet above. */}
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
