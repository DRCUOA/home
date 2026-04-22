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
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
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
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl bg-white dark:bg-slate-900",
          "max-h-[85vh] flex flex-col",
          sizeClass[size],
          className
        )}
        style={{ boxShadow: "var(--ds-shadow-xl)" }}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
