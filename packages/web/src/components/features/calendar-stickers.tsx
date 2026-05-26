import { HelpCircle, CheckCircle2, XCircle } from "lucide-react";
import {
  CONFIRMATION_STICKER_LABELS,
  type ConfirmationSticker,
} from "@hcc/shared";
import { cn } from "@/lib/cn";

// Custom MIME used to identify a sticker drag on the dataTransfer.
// Namespaced under application/x-* so the global listing-URL drop zone
// (which only engages for real URL/file drags) ignores it.
export const STICKER_MIME = "application/x-hcc-sticker";

export const STICKER_META: Record<
  ConfirmationSticker,
  { icon: typeof HelpCircle; ringClass: string; badgeClass: string }
> = {
  tentative: {
    icon: HelpCircle,
    ringClass:
      "ring-2 ring-amber-400 dark:ring-amber-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900",
    badgeClass: "bg-amber-500 text-white",
  },
  confirmed: {
    icon: CheckCircle2,
    ringClass:
      "ring-2 ring-emerald-500 dark:ring-emerald-400 ring-offset-1 ring-offset-white dark:ring-offset-slate-900",
    badgeClass: "bg-emerald-600 text-white",
  },
  cancelled: {
    icon: XCircle,
    ringClass:
      "ring-2 ring-rose-400 dark:ring-rose-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900",
    badgeClass: "bg-rose-500 text-white",
  },
};

export function StickerChip({
  sticker,
  collapsed = false,
}: {
  sticker: ConfirmationSticker;
  collapsed?: boolean;
}) {
  const meta = STICKER_META[sticker];
  const Icon = meta.icon;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(STICKER_MIME, sticker);
        // Intentionally not mirrored to text/plain: the global listing-URL
        // drop zone reads text/plain and would otherwise see the sticker
        // name as a candidate URL.
      }}
      role="button"
      tabIndex={0}
      title={`Drag ${CONFIRMATION_STICKER_LABELS[sticker]} onto an entry`}
      aria-label={`${CONFIRMATION_STICKER_LABELS[sticker]} sticker — drag onto an entry`}
      className={cn(
        "flex cursor-grab select-none items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 transition-shadow hover:shadow-sm active:cursor-grabbing",
        collapsed ? "justify-center p-1.5" : "gap-2 px-2.5 py-2"
      )}
    >
      <span
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          meta.badgeClass
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      {!collapsed && (
        <span className="truncate">
          {CONFIRMATION_STICKER_LABELS[sticker]}
        </span>
      )}
    </div>
  );
}
