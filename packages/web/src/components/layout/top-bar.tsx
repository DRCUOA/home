import { Search, Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface TopBarProps {
  title: string;
  showSearch?: boolean;
}

export function TopBar({ title, showSearch = true }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm safe-area-top">
      <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
        <h1 className="text-lg font-bold text-slate-900 truncate">{title}</h1>
        <div className="flex items-center gap-2">
          {showSearch && (
            <Link to="/search" className="p-2 rounded-full hover:bg-slate-100 active:bg-slate-200">
              <Search className="h-5 w-5 text-slate-600" />
            </Link>
          )}
          <button className="p-2 rounded-full hover:bg-slate-100 active:bg-slate-200 relative">
            <Bell className="h-5 w-5 text-slate-600" />
          </button>
        </div>
      </div>
    </header>
  );
}
