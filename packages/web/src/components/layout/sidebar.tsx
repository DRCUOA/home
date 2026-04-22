import { Link, useLocation } from "@tanstack/react-router";
import {
  Home,
  TrendingDown,
  ShoppingCart,
  MapPin,
  DollarSign,
  CheckSquare,
  Library,
  MessageCircle,
  Image,
  Truck,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { BUILD_FOOTER_TEXT, BUILD_NUMBER } from "@/lib/build-info";

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

const navItems: readonly NavItem[] = [
  { to: "/",          icon: Home,          label: "Home" },
  { to: "/sell",      icon: TrendingDown,  label: "Sell" },
  { to: "/buy",       icon: ShoppingCart,  label: "Buy" },
  { to: "/map",       icon: MapPin,        label: "Map" },
  { to: "/money",     icon: DollarSign,    label: "Money" },
  { to: "/tasks",     icon: CheckSquare,   label: "Tasks" },
  { to: "/moving",    icon: Truck,         label: "Moving" },
  { to: "/gallery",   icon: Image,         label: "Gallery" },
  { to: "/library",   icon: Library,       label: "Library" },
  { to: "/assistant", icon: MessageCircle, label: "Assistant" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-20 flex flex-col border-r bg-white dark:bg-slate-900",
        "border-slate-200 dark:border-slate-800",
        "transition-[width] duration-200 ease-out"
      )}
      style={{
        width: collapsed
          ? "var(--ds-sidebar-width-collapsed)"
          : "var(--ds-sidebar-width)",
      }}
    >
      {/* Brand */}
      <div
        className="flex items-center gap-2 px-3 border-b border-slate-200 dark:border-slate-800"
        style={{ height: "var(--ds-topbar-height)" }}
      >
        <Link
          to="/"
          className="flex items-center gap-2 overflow-hidden flex-1 min-w-0"
          aria-label="Homelhar home"
        >
          <img
            src="/logo.png"
            alt=""
            className="h-8 w-8 shrink-0 object-contain"
          />
          {!collapsed && (
            <span className="font-display text-lg font-extrabold tracking-tight text-slate-800 dark:text-slate-100 truncate">
              Homelhar
            </span>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="flex flex-col gap-0.5 px-2">
          {navItems.map(({ to, icon: Icon, label }) => {
            const isActive =
              to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(to);

            return (
              <li key={to}>
                <Link
                  to={to}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
                    isActive
                      ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  )}
                >
                  <Icon
                    className="h-5 w-5 shrink-0"
                    strokeWidth={isActive ? 2.25 : 2}
                  />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer: build + collapse toggle */}
      <div className="border-t border-slate-200 dark:border-slate-800 px-2 py-2">
        {!collapsed && (
          <p className="px-2 pb-2 text-[10px] leading-tight text-slate-400 dark:text-slate-500">
            {BUILD_FOOTER_TEXT} Build : {BUILD_NUMBER}
          </p>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium",
            "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
            "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
