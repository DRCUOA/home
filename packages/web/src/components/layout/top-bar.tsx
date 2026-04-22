import { useEffect, useRef, useState } from "react";
import {
  Search,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Plus,
  Home as HomeIcon,
  FileText,
  Phone,
  Calculator,
  CheckSquare,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useThemeStore } from "@/stores/theme";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/cn";

type QuickAction = "property" | "note" | "call" | "task" | "scenario";

interface TopBarProps {
  onQuickAdd: (action: QuickAction) => void;
}

const quickActions: ReadonlyArray<{
  type: QuickAction;
  icon: typeof HomeIcon;
  label: string;
}> = [
  { type: "property",  icon: HomeIcon,    label: "Add property" },
  { type: "note",      icon: FileText,    label: "Add note" },
  { type: "call",      icon: Phone,       label: "Log communication" },
  { type: "task",      icon: CheckSquare, label: "Add task" },
  { type: "scenario",  icon: Calculator,  label: "New scenario" },
];

export function TopBar({ onQuickAdd }: TopBarProps) {
  const { theme, setTheme } = useThemeStore();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const quickRef = useRef<HTMLDivElement>(null);

  // Close Quick Add dropdown on outside click.
  useEffect(() => {
    if (!quickOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) {
        setQuickOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [quickOpen]);

  const cycleTheme = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  const handleSignOut = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate({ to: "/search", search: q ? { q } : undefined });
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center gap-4 border-b bg-white/95 px-6 backdrop-blur",
        "border-slate-200 dark:border-slate-800 dark:bg-slate-900/95"
      )}
      style={{ height: "var(--ds-topbar-height)" }}
    >
      {/* Global search */}
      <form onSubmit={onSearchSubmit} className="flex-1 max-w-xl">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search properties, contacts, notes…"
            className={cn(
              "w-full rounded-lg border bg-slate-50 pl-9 pr-3 py-1.5 text-sm",
              "border-slate-200 text-slate-900 placeholder:text-slate-400",
              "focus:border-primary-500 focus:bg-white focus:outline-none",
              "focus-visible:ring-2 focus-visible:ring-primary-500/40",
              "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
              "dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
            )}
          />
        </label>
      </form>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        {/* Quick Add */}
        <div className="relative" ref={quickRef}>
          <button
            type="button"
            onClick={() => setQuickOpen((o) => !o)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white",
              "hover:bg-primary-700 active:bg-primary-800",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            )}
            aria-haspopup="menu"
            aria-expanded={quickOpen}
          >
            <Plus className="h-4 w-4" />
            New
          </button>
          {quickOpen && (
            <div
              role="menu"
              className={cn(
                "absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border bg-white py-1 shadow-lg",
                "border-slate-200 dark:border-slate-700 dark:bg-slate-800"
              )}
              style={{ boxShadow: "var(--ds-shadow-lg)" }}
            >
              {quickActions.map((a) => (
                <button
                  key={a.type}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setQuickOpen(false);
                    onQuickAdd(a.type);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700",
                    "hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  )}
                >
                  <a.icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme */}
        <button
          type="button"
          onClick={cycleTheme}
          className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label={`Theme: ${theme}`}
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="h-4 w-4" />
        </button>

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-full p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950 dark:hover:text-red-300"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

export type { QuickAction };
