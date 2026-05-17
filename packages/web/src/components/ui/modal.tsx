import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  /**
   * Content width preset. Defaults to "md" (32rem). Use "lg" (44rem) for
   * larger forms or "xl" (56rem) for wide editors.
   */
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClass: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  size = "md",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    // iOS Safari ignores `body { overflow: hidden }` for the document scroll —
    // the page rubber-bands behind the modal. Locking with position:fixed
    // and restoring scrollY on close is the well-known fix.
    const { scrollY } = window;
    const { body } = document;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

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
    <div
      className="fixed inset-0 flex items-center justify-center p-6"
      style={{ zIndex: 50 }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-overlay backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl border border-border bg-popover text-foreground",
          "max-h-[85vh] flex flex-col",
          sizeClass[size],
          className
        )}
        style={{ boxShadow: "var(--ds-shadow-xl)" }}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border px-5 py-2">
            <h2 className="text-base font-semibold text-foreground">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              )}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {/* `overscroll-contain` keeps a fully-scrolled modal panel from
            bubbling the wheel/scroll up into the locked page underneath
            (iOS Safari + Chrome both honour this). */}
        <div className="flex-1 overflow-y-auto p-5 overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
