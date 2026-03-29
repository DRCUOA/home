import { cn } from "@/lib/cn";

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 -mx-4 scrollbar-hide">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "whitespace-nowrap px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
            active === tab.id
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          {tab.label}
          {tab.count != null && (
            <span className="ml-1.5 text-xs bg-slate-100 rounded-full px-1.5 py-0.5">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
