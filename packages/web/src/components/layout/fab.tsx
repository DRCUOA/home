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
            className={cn(
              "flex items-center gap-2 rounded-full bg-card border border-border pl-3 pr-4 py-2 text-sm font-medium",
              "text-foreground-secondary hover:bg-muted active:bg-muted-strong",
              "animate-in fade-in slide-in-from-bottom-2"
            )}
            style={{ boxShadow: "var(--ds-shadow-lg)" }}
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </button>
        ))}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center justify-center h-14 w-14 rounded-full transition-transform",
          open
            ? "bg-muted-strong text-foreground rotate-45"
            : "bg-accent text-accent-foreground hover:bg-accent-hover"
        )}
        style={{ boxShadow: "var(--ds-shadow-lg)" }}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
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
