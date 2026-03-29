import { Link, useLocation } from "@tanstack/react-router";
import {
  Home,
  TrendingDown,
  ShoppingCart,
  DollarSign,
  CheckSquare,
  Library,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/sell", icon: TrendingDown, label: "Sell" },
  { to: "/buy", icon: ShoppingCart, label: "Buy" },
  { to: "/money", icon: DollarSign, label: "Money" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks" },
  { to: "/library", icon: Library, label: "Library" },
  { to: "/assistant", icon: MessageCircle, label: "Assistant" },
] as const;

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-sm safe-area-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {tabs.map(({ to, icon: Icon, label }) => {
          const isActive =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 px-1 min-w-[3rem] min-h-[3rem] justify-center transition-colors",
                isActive ? "text-primary-600" : "text-slate-400"
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
