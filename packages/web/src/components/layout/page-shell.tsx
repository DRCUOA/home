import type { ReactNode } from "react";
import { TopBar } from "./top-bar";

interface PageShellProps {
  title: string;
  showSearch?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}

export function PageShell({ title, showSearch, children, actions }: PageShellProps) {
  return (
    <div className="min-h-screen pb-20">
      <TopBar title={title} showSearch={showSearch} />
      {actions && (
        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 max-w-lg mx-auto">
          {actions}
        </div>
      )}
      <main className="max-w-lg mx-auto px-4 py-4">{children}</main>
    </div>
  );
}
