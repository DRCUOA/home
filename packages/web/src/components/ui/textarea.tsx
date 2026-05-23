import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

// Cmd+Enter on macOS and Win+Enter on Windows (both fire as `metaKey: true`)
// don't insert a newline by default — browsers swallow the keystroke when
// the meta modifier is held. Most modern editors (Slack, Discord, Notion,
// GitHub, etc.) treat that combo as a "soft enter" anyway, so this handler
// normalizes the behavior across our textareas: when we see meta+Enter, we
// manually splice a "\n" at the caret position.
//
// We use the native value setter + a dispatched "input" event so React's
// controlled-component bookkeeping sees the change and fires onChange.
// Setting the value directly via `ta.value = ...` would update the DOM but
// React's tracked previous-value would still hold the old string, so the
// next user keystroke would re-emit the stale value.
function insertNewlineAtCaret(ta: HTMLTextAreaElement) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const next = ta.value.slice(0, start) + "\n" + ta.value.slice(end);
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(ta, next);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    // Defensive fallback for environments without a value descriptor (we
    // don't expect to hit this in any real browser, but be graceful).
    ta.value = next;
  }
  const caret = start + 1;
  ta.setSelectionRange(caret, caret);
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, onKeyDown, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let consumer-supplied handlers run first so they can preventDefault if
      // they need to override our behavior (e.g. a chat textarea that wants
      // meta+Enter to mean "send" instead of "newline").
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        insertNewlineAtCaret(e.currentTarget);
      }
    };

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-foreground-secondary">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full rounded-lg border border-input bg-card px-3 py-2.5 text-base text-foreground",
            "placeholder:text-subtle-foreground",
            "focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30",
            "disabled:bg-muted disabled:text-disabled-foreground min-h-[80px]",
            error && "border-destructive focus:border-destructive focus:ring-destructive/30",
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
