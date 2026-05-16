import { Sun, Moon, Monitor } from "lucide-react";
import { useThemeStore } from "@/stores/theme";
import { cn } from "@/lib/cn";

const options = [
  { value: "light",  label: "Light",  icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark",   label: "Dark",   icon: Moon },
] as const;

type Theme = (typeof options)[number]["value"];

/**
 * Segmented Light / System / Dark switch. Keyboard-accessible: each segment
 * is a button with `aria-pressed`, and the group is labelled as a radiogroup
 * for assistive tech.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-muted p-0.5",
        className
      )}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value as Theme)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
