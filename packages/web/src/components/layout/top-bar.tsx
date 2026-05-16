import { useEffect, useRef, useState } from "react";
import {
  Search,
  LogOut,
  Plus,
  Home as HomeIcon,
  FileText,
  Phone,
  Calculator,
  CheckSquare,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth";
import { ThemeToggle } from "@/components/ui/theme-toggle";
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

  const handleSignOut = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate({ to: "/search", search: q ? { q } : undefined });
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center gap-4 border-b px-6 backdrop-blur",
        "border-border bg-card/90"
      )}
      style={{ height: "var(--ds-topbar-height)" }}
    >
      {/* Global search */}
      <form onSubmit={onSearchSubmit} className="flex-1 max-w-xl">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search properties, contacts, notes…"
            className={cn(
              "w-full rounded-lg border bg-muted pl-9 pr-3 py-1.5 text-sm",
              "border-border text-foreground placeholder:text-subtle-foreground",
              "focus:border-ring focus:bg-card focus:outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring/40"
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
              "inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground",
              "hover:bg-accent-hover active:bg-accent-active",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
                "absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border bg-popover py-1",
                "border-border"
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
                    "flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground-secondary",
                    "hover:bg-muted hover:text-foreground"
                  )}
                >
                  <a.icon className="h-4 w-4 text-muted-foreground" />
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme */}
        <ThemeToggle />

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          className={cn(
            "rounded-full p-2 text-muted-foreground hover:bg-destructive-soft hover:text-destructive-soft-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          )}
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
