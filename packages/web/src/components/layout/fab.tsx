import { useState } from "react";
import { Plus, X, Home as HomeIcon, FileText, Phone, Upload, Calculator, CheckSquare } from "lucide-react";
import { cn } from "@/lib/cn";

interface FabAction {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}

interface FabProps {
  actions: FabAction[];
}

export function Fab({ actions }: FabProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col-reverse items-end gap-2">
      {open &&
        actions.map((action, i) => (
          <button
            key={i}
            onClick={() => { action.onClick(); setOpen(false); }}
            className="flex items-center gap-2 rounded-full bg-white shadow-lg border border-slate-200 pl-3 pr-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 animate-in fade-in slide-in-from-bottom-2"
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </button>
        ))}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center justify-center h-14 w-14 rounded-full shadow-lg transition-transform",
          open
            ? "bg-slate-700 rotate-45"
            : "bg-primary-600 hover:bg-primary-700"
        )}
      >
        {open ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <Plus className="h-6 w-6 text-white" />
        )}
      </button>
    </div>
  );
}

export const defaultFabActions: FabAction[] = [
  { icon: HomeIcon, label: "Add Property", onClick: () => {} },
  { icon: FileText, label: "Add Note", onClick: () => {} },
  { icon: Phone, label: "Log Call", onClick: () => {} },
  { icon: Upload, label: "Upload File", onClick: () => {} },
  { icon: Calculator, label: "New Scenario", onClick: () => {} },
  { icon: CheckSquare, label: "Add Task", onClick: () => {} },
];
