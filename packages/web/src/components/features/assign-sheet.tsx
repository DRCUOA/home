import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Package, Box as BoxIcon, ScanLine, Check, Unlink } from "lucide-react";
import {
  MOVE_BOX_STATUSES,
  MOVE_BOX_PRIORITIES,
  MOVE_ITEM_STATUSES,
  MOVE_ITEM_CATEGORIES,
} from "@hcc/shared";
import type { Move, MoveBox, MoveItem, MoveRoom } from "@hcc/shared";
import { apiPost, apiPatch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Bottom sheet shown in /scan "Assign" mode and from the universal
 * ScanActionSheet. A scanned barcode opens this over the paused camera.
 *
 * A single barcode can represent either a **box** or an **item**, so the
 * sheet leads with a Box | Item toggle. Whichever side is active edits
 * the matching record for the code (or creates a new one). The table is
 * location-first and every control is a 48px touch target sized for a
 * phone or iPad held while packing.
 *
 * For an **item**, its container is itself a barcode — the box it gets
 * packed in — so the "packed in" field is a barcode input that resolves
 * live to a box (with a picker fallback), not a label dropdown.
 *
 * No new API surface: assign = PATCH the barcode onto an existing record
 * or POST a new one carrying it; "Unassign" clears an item's code.
 */

const prettify = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const boxStatusOptions = MOVE_BOX_STATUSES.map((s) => ({ value: s, label: prettify(s) }));
const boxPriorityOptions = MOVE_BOX_PRIORITIES.map((s) => ({ value: s, label: prettify(s) }));
const itemStatusOptions = MOVE_ITEM_STATUSES.map((s) => ({ value: s, label: prettify(s) }));
const itemCategoryOptions = MOVE_ITEM_CATEGORIES.map((s) => ({ value: s, label: prettify(s) }));

interface AssignSheetProps {
  move: Move;
  code: string;
  /** Resolved target when the scanned code is already known — used only
   *  to pick the initial Box/Item tab. */
  initialBox: MoveBox | null;
  initialItem: MoveItem | null;
  boxes: MoveBox[];
  items: MoveItem[];
  rooms: MoveRoom[];
  onClose: () => void;
  /** Called after a successful save with a short confirmation summary;
   *  the parent flashes it, invalidates queries, and resumes scanning. */
  onSaved: (summary: string) => void;
}

type Kind = "box" | "item";

/** One row of the metadata table: a fixed-width label and a full-width
 *  control, stacked tight so the whole table fits a small screen. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-24 flex-shrink-0 pt-2.5 text-sm font-medium text-foreground-secondary">
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

const Divider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 pt-3 pb-1">
    <span className="text-xs font-semibold uppercase tracking-wide text-subtle-foreground">
      {label}
    </span>
    <div className="h-px flex-1 bg-border" />
  </div>
);

export function AssignSheet({
  move,
  code,
  initialBox,
  initialItem,
  boxes,
  items,
  rooms,
  onClose,
  onSaved,
}: AssignSheetProps) {
  const [kind, setKind] = useState<Kind>(
    initialItem && !initialBox ? "item" : "box"
  );

  const destRooms = useMemo(
    () => rooms.filter((r) => r.side === "destination"),
    [rooms]
  );
  const originRooms = useMemo(
    () => rooms.filter((r) => r.side === "origin"),
    [rooms]
  );

  // The record (if any) the scanned code already maps to, per kind.
  const box = useMemo(
    () => boxes.find((b) => b.barcode === code) ?? null,
    [boxes, code]
  );
  const item = useMemo(
    () => items.find((i) => i.barcode === code) ?? null,
    [items, code]
  );

  const subtitle =
    kind === "box"
      ? box
        ? "Editing this box"
        : "New box for this barcode"
      : item
        ? "Editing this object"
        : "New object for this barcode";

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col justify-end">
      {/* backdrop — tap to dismiss */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      <div className="relative bg-background text-foreground rounded-t-2xl shadow-2xl flex flex-col max-h-[88dvh]">
        {/* header */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-border">
          <ScanLine className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground-secondary leading-none mb-0.5">
              Barcode
            </p>
            <p className="font-mono text-sm font-semibold truncate">{code}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-11 w-11 -mr-2 rounded-full flex items-center justify-center active:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Box | Item toggle — declares what this barcode represents */}
        <div className="px-4 pt-3">
          <div className="flex gap-1 p-1 rounded-xl bg-muted" role="tablist">
            {(["box", "item"] as const).map((k) => {
              const active = kind === k;
              const Icon = k === "box" ? BoxIcon : Package;
              const exists = k === "box" ? !!box : !!item;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setKind(k)}
                  className={
                    "flex-1 min-h-11 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors " +
                    (active
                      ? "bg-card shadow text-foreground"
                      : "text-foreground-secondary active:bg-muted-strong")
                  }
                >
                  <Icon className="h-4 w-4" />
                  {k === "box" ? "Box" : "Item"}
                  {exists && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-foreground-secondary">{subtitle}</p>
        </div>

        {kind === "box" ? (
          <BoxForm
            key={`box-${box?.id ?? "new"}`}
            move={move}
            code={code}
            box={box}
            destRooms={destRooms}
            originRooms={originRooms}
            onSaved={onSaved}
          />
        ) : (
          <ItemForm
            key={`item-${item?.id ?? "new"}`}
            move={move}
            code={code}
            item={item}
            boxes={boxes}
            destRooms={destRooms}
            originRooms={originRooms}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  );
}

/* ----------------------------- helpers ------------------------------ */

const roomOptions = (rooms: MoveRoom[]) =>
  rooms.map((r) => ({ value: r.id, label: r.name }));

/* ----------------------------- Box form ----------------------------- */

function BoxForm({
  move,
  code,
  box,
  destRooms,
  originRooms,
  onSaved,
}: {
  move: Move;
  code: string;
  box: MoveBox | null;
  destRooms: MoveRoom[];
  originRooms: MoveRoom[];
  onSaved: (summary: string) => void;
}) {
  const isNew = !box;
  const [label, setLabel] = useState(box?.label ?? code);
  const [destination, setDestination] = useState(box?.destination_room_id ?? "");
  const [source, setSource] = useState(box?.source_room_id ?? "");
  const [status, setStatus] = useState(box?.status ?? "preparing");
  const [priority, setPriority] = useState(box?.priority ?? "normal");
  const [fragile, setFragile] = useState(box?.fragile ?? false);
  const [packedBy, setPackedBy] = useState(box?.packed_by ?? "");

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        barcode: code,
        label: label.trim(),
        destination_room_id: destination || undefined,
        source_room_id: source || null,
        status,
        priority,
        fragile,
        packed_by: packedBy.trim() || null,
      };
      return isNew
        ? apiPost("/move-boxes", { move_id: move.id, ...payload })
        : apiPatch(`/move-boxes/${box!.id}`, payload);
    },
    onSuccess: () => onSaved(`${isNew ? "Created" : "Updated"} box: ${label.trim()}`),
  });

  const canSave = label.trim().length > 0 && !save.isPending;

  return (
    <FormShell
      onSave={() => save.mutate()}
      canSave={canSave}
      saving={save.isPending}
      error={save.isError ? "Couldn't save. Check the code isn't already used." : null}
    >
      <Divider label="Location" />
      <Row label="Destination">
        <Select
          placeholder="Unassigned"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          options={roomOptions(destRooms)}
        />
      </Row>
      <Row label="Packed in">
        <Select
          placeholder="Unassigned"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          options={roomOptions(originRooms)}
        />
      </Row>
      <Row label="Status">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={boxStatusOptions}
        />
      </Row>

      <Divider label="Identity" />
      <Row label="Label">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Box label" />
      </Row>
      <Row label="Priority">
        <Select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          options={boxPriorityOptions}
        />
      </Row>
      <Row label="Fragile">
        <Toggle on={fragile} onChange={setFragile} />
      </Row>
      <Row label="Packed by">
        <Input value={packedBy} onChange={(e) => setPackedBy(e.target.value)} placeholder="Name" />
      </Row>
    </FormShell>
  );
}

/* ----------------------------- Item form ---------------------------- */

function ItemForm({
  move,
  code,
  item,
  boxes,
  destRooms,
  originRooms,
  onSaved,
}: {
  move: Move;
  code: string;
  item: MoveItem | null;
  boxes: MoveBox[];
  destRooms: MoveRoom[];
  originRooms: MoveRoom[];
  onSaved: (summary: string) => void;
}) {
  const isNew = !item;
  const [name, setName] = useState(item?.name ?? "");
  // The container is itself a barcode: the box the item gets packed in.
  const [boxBarcode, setBoxBarcode] = useState(
    item?.box_id ? (boxes.find((b) => b.id === item.box_id)?.barcode ?? "") : ""
  );
  const [destination, setDestination] = useState(item?.destination_room_id ?? "");
  const [origin, setOrigin] = useState(item?.origin_room_id ?? "");
  const [status, setStatus] = useState(item?.status ?? "surveyed");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [category, setCategory] = useState(item?.category ?? "");
  const [value, setValue] = useState(
    item?.value_estimate != null ? String(item.value_estimate) : ""
  );
  const [fragile, setFragile] = useState(item?.fragile ?? false);

  const trimmedBox = boxBarcode.trim();
  const resolvedBox = useMemo(
    () => (trimmedBox ? boxes.find((b) => b.barcode === trimmedBox) ?? null : null),
    [boxes, trimmedBox]
  );
  const boxNotFound = trimmedBox.length > 0 && !resolvedBox;

  const save = useMutation({
    mutationFn: () => {
      const qty = parseInt(quantity, 10);
      const val = parseFloat(value);
      const payload = {
        barcode: code,
        name: name.trim(),
        box_id: resolvedBox?.id || undefined,
        destination_room_id: destination || undefined,
        origin_room_id: origin || undefined,
        status,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        category: category || undefined,
        value_estimate: Number.isFinite(val) && val > 0 ? val : undefined,
        fragile,
      };
      return isNew
        ? apiPost("/move-items", { move_id: move.id, ...payload })
        : apiPatch(`/move-items/${item!.id}`, payload);
    },
    onSuccess: () => onSaved(`${isNew ? "Created" : "Updated"} object: ${name.trim()}`),
  });

  const unassign = useMutation({
    mutationFn: () => apiPatch(`/move-items/${item!.id}`, { barcode: null }),
    onSuccess: () => onSaved(`Freed code from: ${item!.name}`),
  });

  const canSave = name.trim().length > 0 && !boxNotFound && !save.isPending;

  return (
    <FormShell
      onSave={() => save.mutate()}
      canSave={canSave}
      saving={save.isPending}
      error={save.isError ? "Couldn't save. Try again." : null}
      secondary={
        !isNew && item?.barcode
          ? {
              label: "Unassign code",
              icon: <Unlink className="h-4 w-4" />,
              onClick: () => unassign.mutate(),
              pending: unassign.isPending,
            }
          : undefined
      }
    >
      <Divider label="Packed in box" />
      <Row label="Box barcode">
        <div className="space-y-1">
          <Input
            value={boxBarcode}
            onChange={(e) => setBoxBarcode(e.target.value)}
            placeholder="Scan or type the box's barcode"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className={boxNotFound ? "border-amber-500" : undefined}
          />
          {trimmedBox.length > 0 &&
            (resolvedBox ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <BoxIcon className="h-3 w-3" /> {resolvedBox.label}
              </p>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No box with that barcode in this move yet.
              </p>
            ))}
        </div>
      </Row>
      <Row label="or pick box">
        <Select
          placeholder="Choose from list"
          value={resolvedBox?.id ?? ""}
          onChange={(e) => {
            const b = boxes.find((x) => x.id === e.target.value);
            setBoxBarcode(b?.barcode ?? "");
          }}
          options={boxes.map((b) => ({ value: b.id, label: `${b.label} · ${b.barcode}` }))}
        />
      </Row>

      <Divider label="Destination" />
      <Row label="Room">
        <Select
          placeholder="Unassigned"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          options={roomOptions(destRooms)}
        />
      </Row>
      <Row label="From room">
        <Select
          placeholder="Unassigned"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          options={roomOptions(originRooms)}
        />
      </Row>
      <Row label="Status">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={itemStatusOptions}
        />
      </Row>

      <Divider label="Identity" />
      <Row label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="What is it?" />
      </Row>
      <Row label="Quantity">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </Row>
      <Row label="Category">
        <Select
          placeholder="Uncategorised"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={itemCategoryOptions}
        />
      </Row>
      <Row label="Value">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Estimate"
        />
      </Row>
      <Row label="Fragile">
        <Toggle on={fragile} onChange={setFragile} />
      </Row>
    </FormShell>
  );
}

/* ----------------------------- shared ------------------------------- */

function FormShell({
  children,
  onSave,
  canSave,
  saving,
  error,
  secondary,
}: {
  children: React.ReactNode;
  onSave: () => void;
  canSave: boolean;
  saving: boolean;
  error: string | null;
  secondary?: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    pending: boolean;
  };
}) {
  return (
    <>
      <div className="px-4 py-2 overflow-y-auto flex-1">{children}</div>
      {error && <p className="px-4 pb-1 text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 px-4 py-3 border-t border-border pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {secondary && (
          <Button
            type="button"
            variant="secondary"
            className="min-h-12"
            disabled={secondary.pending}
            onClick={secondary.onClick}
          >
            {secondary.icon}
            {secondary.label}
          </Button>
        )}
        <Button
          type="button"
          className="flex-1 min-h-12"
          disabled={!canSave}
          onClick={onSave}
        >
          <Check className="h-4 w-4" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={
        "relative inline-flex h-7 w-12 items-center rounded-full transition-colors " +
        (on ? "bg-primary" : "bg-muted")
      }
    >
      <span
        className={
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
          (on ? "translate-x-6" : "translate-x-1")
        }
      />
    </button>
  );
}
