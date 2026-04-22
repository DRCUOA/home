import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  /**
   * Retained for API compatibility. Global search lives in the TopBar on
   * desktop, so per-page opt-out is no longer meaningful, but accepting
   * the prop keeps existing route call sites unchanged.
   */
  showSearch?: boolean;
  children: ReactNode;
  /** Optional page-level actions rendered in the page header row. */
  actions?: ReactNode;
  /**
   * Optional supporting text rendered under the page title. Useful for
   * desktop layouts that have room for more descriptive headers.
   */
  subtitle?: ReactNode;
}

/**
 * Per-page wrapper for the desktop layout. Renders a page header (title,
 * optional subtitle, optional actions) and a full-width content slot. The
 * global chrome (sidebar, top bar, search) lives at the AppShell level.
 *
 * `showSearch` is accepted-but-unused for backward compatibility.
 */
export function PageShell({
  title,
  children,
  actions,
  subtitle,
  showSearch: _showSearch,
}: PageShellProps) {
  void _showSearch;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </header>
      <div>{children}</div>
    </div>
  );
}
