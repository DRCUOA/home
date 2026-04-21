import { useEffect, useRef } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { MoveBox, MoveItem, MoveRoom } from "@hcc/shared";
import { code128Svg } from "@/lib/code128";

/**
 * Printable label sheet for boxes. Renders a grid of labels and gives
 * the user a "Print" button that opens the browser's Print dialog.
 *
 * Each label contains: label text, destination room, priority/fragile
 * indicators, an item summary, and a Code 128 barcode (native SVG).
 *
 * Layout assumes A4 @ 8 labels per sheet (2 cols x 4 rows). Printed
 * @page margins are tight so most desktop printers will reproduce the
 * grid faithfully onto plain paper — the user can cut and tape them,
 * or print onto standard shipping-label paper.
 */

interface LabelSheetProps {
  open: boolean;
  onClose: () => void;
  boxes: MoveBox[];
  items: MoveItem[];
  rooms: MoveRoom[];
  title?: string;
}

export function LabelSheet({
  open,
  onClose,
  boxes,
  items,
  rooms,
  title = "Print labels",
}: LabelSheetProps) {
  const printRef = useRef<HTMLDivElement>(null);

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
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
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
    .label .barcode-wrap svg { width: 100%; height: 18mm; }
    .label .code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 10pt; letter-spacing: 0.5pt; text-align: center; margin-top: 1mm; }
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

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {boxes.length} {boxes.length === 1 ? "label" : "labels"} ready
            — preview below, then print.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="min-h-10" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
            <Button size="sm" className="min-h-10" onClick={handlePrint} disabled={boxes.length === 0}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </div>
        </div>

        {/* On-screen preview — the printed output uses its own stylesheet above. */}
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
          <div
            ref={printRef}
            className="grid grid-cols-2 gap-3"
          >
            {boxes.map((box) => {
              const contents = itemsByBox.get(box.id) ?? [];
              const dest = roomName(box.destination_room_id);
              return (
                <div
                  key={box.id}
                  className="label rounded border-2 border-dashed border-slate-400 bg-white p-3 text-slate-900"
                >
                  <h2>{box.label}</h2>
                  {dest && <div className="sub">→ {dest}</div>}
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
                  <div className="barcode-wrap">
                    <div
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: code128Svg(box.barcode) }}
                    />
                    <div className="code">{box.barcode}</div>
                  </div>
                </div>
              );
            })}
            {boxes.length === 0 && (
              <div className="col-span-2 text-center text-sm text-slate-500 py-8">
                No boxes yet — add some in the Boxes tab and they'll appear here.
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
