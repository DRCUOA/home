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
} from "lucide-react";
import { cn } from "@/lib/cn";
import { BUILD_FOOTER_TEXT, BUILD_NUMBER } from "@/lib/build-info";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/sell", icon: TrendingDown, label: "Sell" },
  { to: "/buy", icon: ShoppingCart, label: "Buy" },
  { to: "/map", icon: MapPin, label: "Map" },
  { to: "/money", icon: DollarSign, label: "Money" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks" },
  { to: "/moving", icon: Truck, label: "Moving" },
  { to: "/gallery", icon: Image, label: "Gallery" },
  { to: "/library", icon: Library, label: "Library" },
  { to: "/assistant", icon: MessageCircle, label: "Assistant" },
] as const;

export function BottomNav() {
  const location = useLocation();

  return (
    <>
      <div className="fixed left-0 right-0 bottom-[calc(3.4rem+env(safe-area-inset-bottom,0px))] z-40 pointer-events-none">
        <div className="mx-auto max-w-lg px-2 text-center text-[10px] leading-tight text-slate-500/90 dark:text-slate-400/90">
          {BUILD_FOOTER_TEXT} Build : {BUILD_NUMBER}
        </div>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm safe-area-bottom">
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
                  isActive
                    ? "text-primary-600 dark:text-primary-400"
                    : "text-slate-400 dark:text-slate-500"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
