import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, Search } from "lucide-react";
import type { Property } from "@hcc/shared";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";

export function propertyLabel(p: Property): string {
  const parts = [p.address, p.suburb].filter(Boolean);
  return parts.join(", ") || "Untitled property";
}

interface PropertyPickerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  properties: Property[];
  /** Currently associated property id, or null for none/General. */
  selectedId: string | null;
  /** Show a "no property" option at the top of the list. */
  allowNone?: boolean;
  noneLabel?: string;
  onSelect: (propertyId: string | null) => void;
}

/**
 * Modal combobox for picking a property by typing its address. Every search
 * term must match somewhere in the address/suburb/city, so "12 smith" finds
 * "12 Smith Street, Ponsonby".
 */
export function PropertyPicker({
  open,
  onClose,
  title = "Choose property",
  properties,
  selectedId,
  allowNone = false,
  noneLabel = "General (no property)",
  onSelect,
}: PropertyPickerProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const matches = useMemo(() => {
    const sorted = [...properties].sort((a, b) =>
      propertyLabel(a).localeCompare(propertyLabel(b))
    );
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return sorted;
    return sorted.filter((p) => {
      const haystack = [p.address, p.suburb, p.city]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [properties, query]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by address…"
            autoFocus
            className={cn(
              "w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-base text-foreground",
              "placeholder:text-subtle-foreground",
              "focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            )}
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {allowNone && (
            <PickerRow
              label={noneLabel}
              selected={selectedId === null}
              onClick={() => onSelect(null)}
            />
          )}
          {matches.map((p) => (
            <PickerRow
              key={p.id}
              label={p.address || "Untitled property"}
              secondary={[p.suburb, p.city].filter(Boolean).join(", ")}
              selected={selectedId === p.id}
              onClick={() => onSelect(p.id)}
            />
          ))}
          {matches.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {properties.length === 0
                ? "No properties yet — add one from the Buy page first."
                : "No properties match that address."}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function PickerRow({
  label,
  secondary,
  selected,
  onClick,
}: {
  label: string;
  secondary?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected
          ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
          : "text-foreground hover:bg-muted"
      )}
    >
      <MapPin
        className={cn(
          "h-4 w-4 shrink-0",
          selected ? "text-primary-600 dark:text-primary-400" : "text-muted-foreground"
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {secondary && (
          <span className="block truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        )}
      </span>
      {selected && (
        <Check className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
      )}
    </button>
  );
}
