import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { QuickAddHost, type QuickAction } from "@/components/features/quick-add";

/**
 * The desktop app chrome. Renders a fixed left sidebar, a sticky top bar,
 * and a scrollable main content region. All layout dimensions (sidebar
 * width, top-bar height, content max width) come from the design-system
 * CSS variables defined in app.css / design-system.ts.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [quickAction, setQuickAction] = useState<QuickAction | null>(null);

  const sidebarWidth = collapsed
    ? "var(--ds-sidebar-width-collapsed)"
    : "var(--ds-sidebar-width)";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      <div
        className="flex min-h-screen flex-col transition-[margin-left] duration-200 ease-out"
        style={{ marginLeft: sidebarWidth }}
      >
        <TopBar onQuickAdd={setQuickAction} />

        <main className="flex-1">
          <div
            className="mx-auto px-8 py-8"
            style={{ maxWidth: "var(--ds-content-max)" }}
          >
            {children}
          </div>
        </main>
      </div>

      <QuickAddHost
        action={quickAction}
        onClose={() => setQuickAction(null)}
      />
    </div>
  );
}
