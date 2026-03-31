import { Search, Sun, Moon, Monitor, LogOut } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useThemeStore } from "@/stores/theme";
import { useAuthStore } from "@/stores/auth";

interface TopBarProps {
  title: string;
  showSearch?: boolean;
}

export function TopBar({ title, showSearch = true }: TopBarProps) {
  const { theme, setTheme } = useThemeStore();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const cycleTheme = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  const handleSignOut = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm safe-area-top">
      <div className="relative flex items-center h-14 px-4 max-w-lg mx-auto">
        {/* Left-aligned logo */}
        <Link to="/" className="shrink-0">
          <img src="/logo.png" alt="Homelhar" className="h-9 w-auto" />
        </Link>

        {/* Center-aligned title (absolute so it's truly viewport-centered) */}
        <h1 className="absolute inset-x-0 text-center font-display text-lg font-extrabold tracking-tight text-slate-800 dark:text-slate-100 pointer-events-none">
          {title}
        </h1>

        {/* Right-aligned actions */}
        <div className="ml-auto flex items-center gap-1">
          {showSearch && (
            <Link to="/search" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700">
              <Search className="h-3 w-3 text-slate-600 dark:text-slate-400" />
            </Link>
          )}
          <button
            onClick={cycleTheme}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700"
            aria-label={`Theme: ${theme}`}
          >
            <ThemeIcon className="h-3 w-3 text-slate-600 dark:text-slate-400" />
          </button>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-950 active:bg-red-100 dark:active:bg-red-900"
            aria-label="Sign out"
          >
            <LogOut className="h-3 w-3 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
      </div>
    </header>
  );
}
