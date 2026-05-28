import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Move, MoveBox, MoveItem, MoveRoom } from "@hcc/shared";
import {
  MOVE_ITEM_CATEGORIES,
  MOVE_ITEM_DISPOSITIONS,
  MOVE_ITEM_DISPOSITION_LABELS,
  MOVE_ITEM_STATUSES,
} from "@hcc/shared";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useList } from "@/hooks/use-query-helpers";
import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

type ListResponse<T> = { data: T[]; total: number };

type SortKey =
  | "name"
  | "quantity"
  | "category"
  | "status"
  | "disposition"
  | "origin_room_name"
  | "destination_room_name"
  | "box_label"
  | "fragile"
  | "value_estimate"
  | "barcode"
  | "updated_at";

type SortDir = "asc" | "desc";

interface EnrichedItem extends MoveItem {
  origin_room_name: string;
  destination_room_name: string;
  box_label: string;
}

interface ColumnFilters {
  name: string;
  category: string;
  status: string;
  disposition: string;
  origin_room: string;
  destination_room: string;
  box: string;
  fragile: "" | "yes" | "no";
  barcode: string;
}

const EMPTY_FILTERS: ColumnFilters = {
  name: "",
  category: "",
  status: "",
  disposition: "",
  origin_room: "",
  destination_room: "",
  box: "",
  fragile: "",
  barcode: "",
};

const UNASSIGNED = "__unassigned__";
const UNASSIGN = "__unassign__";

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CATEGORY_OPTS = MOVE_ITEM_CATEGORIES.map((c) => ({
  value: c,
  label: cap(c),
}));
const STATUS_OPTS = MOVE_ITEM_STATUSES.map((s) => ({
  value: s,
  label: cap(s.replace(/_/g, " ")),
}));
const DISPOSITION_OPTS = MOVE_ITEM_DISPOSITIONS.map((d) => ({
  value: d,
  label: MOVE_ITEM_DISPOSITION_LABELS[d],
}));

export const Route = createFileRoute("/inventory")({
  component: InventoryPage,
});

function InventoryPage() {
  const qc = useQueryClient();

  const movesQuery = useList<Move>("moves", "/moves");
  const moves = movesQuery.data?.data ?? [];

  const [selectedMoveId, setSelectedMoveId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedMoveId && moves.length > 0) setSelectedMoveId(moves[0].id);
  }, [moves, selectedMoveId]);

  const roomsQuery = useQuery({
    queryKey: ["move-rooms", selectedMoveId],
    queryFn: () =>
      apiGet<ListResponse<MoveRoom>>(`/moves/${selectedMoveId}/rooms`),
    enabled: !!selectedMoveId,
  });
  const boxesQuery = useQuery({
    queryKey: ["move-boxes", selectedMoveId],
    queryFn: () =>
      apiGet<ListResponse<MoveBox>>(`/moves/${selectedMoveId}/boxes`),
    enabled: !!selectedMoveId,
  });
  const itemsQuery = useQuery({
    queryKey: ["move-items", selectedMoveId],
    queryFn: () =>
      apiGet<ListResponse<MoveItem>>(`/moves/${selectedMoveId}/items`),
    enabled: !!selectedMoveId,
  });

  const rooms = roomsQuery.data?.data ?? [];
  const boxes = boxesQuery.data?.data ?? [];
  const items = itemsQuery.data?.data ?? [];

  const roomMap = useMemo(
    () => new Map(rooms.map((r) => [r.id, r.name])),
    [rooms],
  );
  const boxMap = useMemo(
    () => new Map(boxes.map((b) => [b.id, b.label])),
    [boxes],
  );

  const roomOpts = useMemo(
    () => rooms.map((r) => ({ value: r.id, label: r.name })),
    [rooms],
  );
  const boxOpts = useMemo(
    () => boxes.map((b) => ({ value: b.id, label: b.label })),
    [boxes],
  );

  // ----- Filter / sort state -----
  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  // ----- Enrich + filter + sort -----
  const enriched = useMemo<EnrichedItem[]>(
    () =>
      items.map((it) => ({
        ...it,
        origin_room_name: it.origin_room_id
          ? (roomMap.get(it.origin_room_id) ?? "")
          : "",
        destination_room_name: it.destination_room_id
          ? (roomMap.get(it.destination_room_id) ?? "")
          : "",
        box_label: it.box_id ? (boxMap.get(it.box_id) ?? "") : "",
      })),
    [items, roomMap, boxMap],
  );

  const visible = useMemo(() => {
    const f = filters;
    const nameQ = f.name.trim().toLowerCase();
    const barcodeQ = f.barcode.trim().toLowerCase();

    const matchAssignment = (
      filterVal: string,
      assigned: string | undefined,
    ) => {
      if (!filterVal) return true;
      if (filterVal === UNASSIGNED) return !assigned;
      return assigned === filterVal;
    };

    const rows = enriched.filter((it) => {
      if (nameQ && !it.name.toLowerCase().includes(nameQ)) return false;
      if (barcodeQ && !(it.barcode ?? "").toLowerCase().includes(barcodeQ))
        return false;
      if (f.category && (it.category ?? "") !== f.category) return false;
      if (f.status && it.status !== f.status) return false;
      if (f.disposition && it.disposition !== f.disposition) return false;
      if (!matchAssignment(f.origin_room, it.origin_room_id)) return false;
      if (!matchAssignment(f.destination_room, it.destination_room_id))
        return false;
      if (!matchAssignment(f.box, it.box_id)) return false;
      if (f.fragile === "yes" && !it.fragile) return false;
      if (f.fragile === "no" && it.fragile) return false;
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const key = sortKey;
    return [...rows].sort((a, b) => {
      const av = readSort(a, key);
      const bv = readSort(b, key);
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [enriched, filters, sortKey, sortDir]);

  // ----- Selection state -----
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusIdx, setFocusIdx] = useState<number>(-1);
  const anchorIdxRef = useRef<number>(-1);
  const tableRef = useRef<HTMLDivElement | null>(null);

  // Clear stale selections when the visible set changes (e.g. switched move
  // or filter eliminated rows).
  useEffect(() => {
    const visibleIds = new Set(visible.map((v) => v.id));
    setSelected((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (visibleIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
    if (focusIdx >= visible.length) setFocusIdx(visible.length - 1);
  }, [visible, focusIdx]);

  // Reset selection when the active move changes.
  useEffect(() => {
    setSelected(new Set());
    setFocusIdx(-1);
    anchorIdxRef.current = -1;
  }, [selectedMoveId]);

  const selectRange = useCallback(
    (from: number, to: number, additive: boolean) => {
      if (from < 0) from = to;
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      setSelected((prev) => {
        const next = additive ? new Set(prev) : new Set<string>();
        for (let i = lo; i <= hi; i++) {
          const row = visible[i];
          if (row) next.add(row.id);
        }
        return next;
      });
    },
    [visible],
  );

  const handleRowClick = useCallback(
    (idx: number, e: MouseEvent) => {
      const id = visible[idx]?.id;
      if (!id) return;
      tableRef.current?.focus();
      if (e.shiftKey) {
        e.preventDefault();
        const anchor = anchorIdxRef.current >= 0 ? anchorIdxRef.current : idx;
        selectRange(anchor, idx, false);
        setFocusIdx(idx);
      } else if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        anchorIdxRef.current = idx;
        setFocusIdx(idx);
      } else {
        setSelected(new Set([id]));
        anchorIdxRef.current = idx;
        setFocusIdx(idx);
      }
    },
    [visible, selectRange],
  );

  const handleCheckboxClick = useCallback(
    (idx: number, e: MouseEvent<HTMLInputElement>) => {
      // Stop the click from bubbling to the row's onClick which would
      // otherwise replace the selection instead of toggling.
      e.stopPropagation();
      const id = visible[idx]?.id;
      if (!id) return;
      tableRef.current?.focus();
      if (e.shiftKey) {
        const anchor = anchorIdxRef.current >= 0 ? anchorIdxRef.current : idx;
        selectRange(anchor, idx, false);
        setFocusIdx(idx);
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        anchorIdxRef.current = idx;
        setFocusIdx(idx);
      }
    },
    [visible, selectRange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (visible.length === 0) return;
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        setSelected(new Set(visible.map((v) => v.id)));
        return;
      }
      if (e.key === "Escape") {
        if (selected.size === 0) return;
        e.preventDefault();
        setSelected(new Set());
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const next = Math.max(
          0,
          Math.min(visible.length - 1, (focusIdx < 0 ? -1 : focusIdx) + delta),
        );
        setFocusIdx(next);
        if (e.shiftKey) {
          const anchor =
            anchorIdxRef.current >= 0 ? anchorIdxRef.current : next;
          selectRange(anchor, next, false);
        } else {
          const id = visible[next]?.id;
          if (id) setSelected(new Set([id]));
          anchorIdxRef.current = next;
        }
        // Keep the focused row in view.
        const rowEl = tableRef.current?.querySelector<HTMLElement>(
          `[data-row-idx="${next}"]`,
        );
        rowEl?.scrollIntoView({ block: "nearest" });
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected.size > 0) {
        e.preventDefault();
        setDeleteOpen(true);
      }
    },
    [visible, focusIdx, selected, selectRange],
  );

  // ----- Bulk mutations -----
  const bulkUpdate = useMutation({
    mutationFn: (vars: { ids: string[]; patch: Record<string, unknown> }) =>
      apiPost(`/moves/${selectedMoveId}/items/bulk-update`, vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["move-items", selectedMoveId] });
    },
  });
  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) =>
      apiPost(`/moves/${selectedMoveId}/items/bulk-delete`, { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["move-items", selectedMoveId] });
      setSelected(new Set());
    },
  });

  // ----- Dialogs -----
  const [updateOpen, setUpdateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const allVisibleSelected =
    visible.length > 0 && visible.every((v) => selected.has(v.id));
  const someVisibleSelected =
    visible.some((v) => selected.has(v.id)) && !allVisibleSelected;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((v) => v.id)));
    }
  };

  const moveOpts = moves.map((m) => ({
    value: m.id,
    label: m.move_date
      ? `Move · ${m.move_date}`
      : `Move ${m.id.slice(0, 8)}`,
  }));

  const headerActions = moveOpts.length > 1 && (
    <div className="w-64">
      <Select
        aria-label="Active move"
        value={selectedMoveId ?? ""}
        onChange={(e) => setSelectedMoveId(e.target.value)}
        options={moveOpts}
      />
    </div>
  );

  const isLoading =
    movesQuery.isLoading ||
    (!!selectedMoveId &&
      (itemsQuery.isLoading || roomsQuery.isLoading || boxesQuery.isLoading));

  return (
    <PageShell
      title="Inventory"
      subtitle="All items being tracked for this move. Filter columns, multi-select, then bulk update or delete."
      actions={headerActions}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !selectedMoveId ? (
        <EmptyState
          icon={<Boxes className="h-8 w-8" />}
          title="No moves yet"
          description="Create a move on the Moving page to start tracking items."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {selected.size >= 1 && (
            <BulkActionBar
              count={selected.size}
              onUpdate={() => setUpdateOpen(true)}
              onDelete={() => setDeleteOpen(true)}
              onClear={() => setSelected(new Set())}
            />
          )}

          <div
            ref={tableRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className={cn(
              "overflow-auto rounded-xl border border-border bg-card",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
            style={{ maxHeight: "calc(100vh - 220px)" }}
            role="grid"
            aria-rowcount={visible.length + 1}
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  <th className="w-10 px-3 py-2 text-left align-bottom">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected;
                      }}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </th>
                  <HeaderCell
                    label="Name"
                    sortKey="name"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    filter={
                      <Input
                        value={filters.name}
                        placeholder="contains…"
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, name: e.target.value }))
                        }
                        className="h-8 py-1 text-xs"
                      />
                    }
                  />
                  <HeaderCell
                    label="Qty"
                    sortKey="quantity"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <HeaderCell
                    label="Category"
                    sortKey="category"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    filter={
                      <Select
                        value={filters.category}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            category: e.target.value,
                          }))
                        }
                        options={CATEGORY_OPTS}
                        placeholder="Any"
                        className="h-8 py-1 text-xs"
                      />
                    }
                  />
                  <HeaderCell
                    label="Status"
                    sortKey="status"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    filter={
                      <Select
                        value={filters.status}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, status: e.target.value }))
                        }
                        options={STATUS_OPTS}
                        placeholder="Any"
                        className="h-8 py-1 text-xs"
                      />
                    }
                  />
                  <HeaderCell
                    label="Disposition"
                    sortKey="disposition"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    filter={
                      <Select
                        value={filters.disposition}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            disposition: e.target.value,
                          }))
                        }
                        options={DISPOSITION_OPTS}
                        placeholder="Any"
                        className="h-8 py-1 text-xs"
                      />
                    }
                  />
                  <HeaderCell
                    label="Origin"
                    sortKey="origin_room_name"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    filter={
                      <Select
                        value={filters.origin_room}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            origin_room: e.target.value,
                          }))
                        }
                        options={[
                          { value: UNASSIGNED, label: "(Unassigned)" },
                          ...roomOpts,
                        ]}
                        placeholder="Any"
                        className="h-8 py-1 text-xs"
                      />
                    }
                  />
                  <HeaderCell
                    label="Destination"
                    sortKey="destination_room_name"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    filter={
                      <Select
                        value={filters.destination_room}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            destination_room: e.target.value,
                          }))
                        }
                        options={[
                          { value: UNASSIGNED, label: "(Unassigned)" },
                          ...roomOpts,
                        ]}
                        placeholder="Any"
                        className="h-8 py-1 text-xs"
                      />
                    }
                  />
                  <HeaderCell
                    label="Box"
                    sortKey="box_label"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    filter={
                      <Select
                        value={filters.box}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, box: e.target.value }))
                        }
                        options={[
                          { value: UNASSIGNED, label: "(Unassigned)" },
                          ...boxOpts,
                        ]}
                        placeholder="Any"
                        className="h-8 py-1 text-xs"
                      />
                    }
                  />
                  <HeaderCell
                    label="Fragile"
                    sortKey="fragile"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    filter={
                      <Select
                        value={filters.fragile}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            fragile: e.target.value as ColumnFilters["fragile"],
                          }))
                        }
                        options={[
                          { value: "yes", label: "Yes" },
                          { value: "no", label: "No" },
                        ]}
                        placeholder="Any"
                        className="h-8 py-1 text-xs"
                      />
                    }
                  />
                  <HeaderCell
                    label="Value"
                    sortKey="value_estimate"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <HeaderCell
                    label="Barcode"
                    sortKey="barcode"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    filter={
                      <Input
                        value={filters.barcode}
                        placeholder="contains…"
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            barcode: e.target.value,
                          }))
                        }
                        className="h-8 py-1 text-xs"
                      />
                    }
                  />
                  <HeaderCell
                    label="Updated"
                    sortKey="updated_at"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={13}
                      className="px-3 py-12 text-center text-sm text-muted-foreground"
                    >
                      {enriched.length === 0
                        ? "No items in this move yet."
                        : "No items match the current filters."}
                    </td>
                  </tr>
                ) : (
                  visible.map((it, idx) => {
                    const isSelected = selected.has(it.id);
                    const isFocused = idx === focusIdx;
                    return (
                      <tr
                        key={it.id}
                        data-row-idx={idx}
                        onClick={(e) => handleRowClick(idx, e)}
                        className={cn(
                          "border-b border-border/60 cursor-pointer select-none",
                          isSelected
                            ? "bg-accent-soft/30 hover:bg-accent-soft/40"
                            : "hover:bg-muted/40",
                          isFocused &&
                            "outline outline-1 -outline-offset-1 outline-ring/60",
                        )}
                      >
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${it.name}`}
                            checked={isSelected}
                            onChange={() => {
                              /* handled by onClick — kept for a11y */
                            }}
                            onClick={(e) => handleCheckboxClick(idx, e)}
                            className="h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-1.5 font-medium text-foreground">
                          {it.name}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {it.quantity}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {it.category ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {it.status.replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {MOVE_ITEM_DISPOSITION_LABELS[
                            it.disposition as keyof typeof MOVE_ITEM_DISPOSITION_LABELS
                          ] ?? it.disposition}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {it.origin_room_name || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {it.destination_room_name || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {it.box_label || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-center text-muted-foreground">
                          {it.fragile ? "Yes" : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {it.value_estimate != null
                            ? formatCurrency(it.value_estimate)
                            : "—"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                          {it.barcode || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {formatRelative(it.updated_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            {visible.length} of {enriched.length} items
            {selected.size > 0 && ` · ${selected.size} selected`}
            <span className="ml-3">
              ↑/↓ navigate · Shift+↑/↓ extend · ⌘A select all · Esc clear · Del bulk-delete
            </span>
          </p>
        </div>
      )}

      <BulkUpdateModal
        open={updateOpen}
        onClose={() => setUpdateOpen(false)}
        roomOpts={roomOpts}
        boxOpts={boxOpts}
        count={selected.size}
        pending={bulkUpdate.isPending}
        onSubmit={(patch) => {
          bulkUpdate.mutate(
            { ids: Array.from(selected), patch },
            {
              onSuccess: () => setUpdateOpen(false),
            },
          );
        }}
      />

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete items"
        size="sm"
      >
        <p className="text-sm text-foreground-secondary">
          Delete {selected.size} item{selected.size === 1 ? "" : "s"}? This
          can&rsquo;t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setDeleteOpen(false)}
            disabled={bulkDelete.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              bulkDelete.mutate(Array.from(selected), {
                onSuccess: () => setDeleteOpen(false),
              });
            }}
            disabled={bulkDelete.isPending}
          >
            {bulkDelete.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete
          </Button>
        </div>
      </Modal>
    </PageShell>
  );
}

/* ---------- Sub-components ---------- */

interface HeaderCellProps {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  filter?: React.ReactNode;
  align?: "left" | "right" | "center";
}

function HeaderCell({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  filter,
  align = "left",
}: HeaderCellProps) {
  const isActive = sortKey === activeKey;
  return (
    <th
      className={cn(
        "px-3 py-2 align-bottom font-semibold text-xs uppercase tracking-wide text-muted-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          isActive && "text-foreground",
        )}
      >
        <span>{label}</span>
        {isActive ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
      {filter && <div className="mt-1.5 normal-case">{filter}</div>}
    </th>
  );
}

interface BulkActionBarProps {
  count: number;
  onUpdate: () => void;
  onDelete: () => void;
  onClear: () => void;
}

function BulkActionBar({
  count,
  onUpdate,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 flex items-center justify-between gap-3",
        "rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-accent-soft-foreground",
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-card/30"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">
          {count} item{count === 1 ? "" : "s"} selected
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onUpdate}>
          <Pencil className="h-4 w-4" /> Update
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  );
}

interface BulkUpdateModalProps {
  open: boolean;
  onClose: () => void;
  roomOpts: { value: string; label: string }[];
  boxOpts: { value: string; label: string }[];
  count: number;
  pending: boolean;
  onSubmit: (patch: Record<string, unknown>) => void;
}

function BulkUpdateModal({
  open,
  onClose,
  roomOpts,
  boxOpts,
  count,
  pending,
  onSubmit,
}: BulkUpdateModalProps) {
  // Each field uses "" as "no change". UNASSIGN is the sentinel for
  // "clear this assignment" on nullable FK fields.
  const [status, setStatus] = useState("");
  const [disposition, setDisposition] = useState("");
  const [category, setCategory] = useState("");
  const [destination, setDestination] = useState("");
  const [box, setBox] = useState("");
  const [fragile, setFragile] = useState("");

  useEffect(() => {
    if (!open) {
      setStatus("");
      setDisposition("");
      setCategory("");
      setDestination("");
      setBox("");
      setFragile("");
    }
  }, [open]);

  const buildPatch = (): Record<string, unknown> => {
    const p: Record<string, unknown> = {};
    if (status) p.status = status;
    if (disposition) p.disposition = disposition;
    if (category) p.category = category;
    if (destination)
      p.destination_room_id = destination === UNASSIGN ? null : destination;
    if (box) p.box_id = box === UNASSIGN ? null : box;
    if (fragile) p.fragile = fragile === "yes";
    return p;
  };

  const patch = buildPatch();
  const hasChange = Object.keys(patch).length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Update ${count} item${count === 1 ? "" : "s"}`}
      size="lg"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldRow label="Status">
          <Select
            value={status}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setStatus(e.target.value)
            }
            options={STATUS_OPTS}
            placeholder="(no change)"
          />
        </FieldRow>
        <FieldRow label="Disposition">
          <Select
            value={disposition}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setDisposition(e.target.value)
            }
            options={DISPOSITION_OPTS}
            placeholder="(no change)"
          />
        </FieldRow>
        <FieldRow label="Category">
          <Select
            value={category}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setCategory(e.target.value)
            }
            options={CATEGORY_OPTS}
            placeholder="(no change)"
          />
        </FieldRow>
        <FieldRow label="Fragile">
          <Select
            value={fragile}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setFragile(e.target.value)
            }
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            placeholder="(no change)"
          />
        </FieldRow>
        <FieldRow label="Destination room">
          <Select
            value={destination}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setDestination(e.target.value)
            }
            options={[
              { value: UNASSIGN, label: "(Clear assignment)" },
              ...roomOpts,
            ]}
            placeholder="(no change)"
          />
        </FieldRow>
        <FieldRow label="Box">
          <Select
            value={box}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setBox(e.target.value)
            }
            options={[
              { value: UNASSIGN, label: "(Clear assignment)" },
              ...boxOpts,
            ]}
            placeholder="(no change)"
          />
        </FieldRow>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!hasChange || pending}
          onClick={() => onSubmit(patch)}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Apply to {count}
        </Button>
      </div>
    </Modal>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-foreground-secondary">
        {label}
      </label>
      {children}
    </div>
  );
}

/* ---------- Helpers ---------- */

function readSort(it: EnrichedItem, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return it.name.toLowerCase();
    case "quantity":
      return it.quantity;
    case "category":
      return it.category ?? "";
    case "status":
      return it.status;
    case "disposition":
      return it.disposition;
    case "origin_room_name":
      return it.origin_room_name.toLowerCase();
    case "destination_room_name":
      return it.destination_room_name.toLowerCase();
    case "box_label":
      return it.box_label.toLowerCase();
    case "fragile":
      return it.fragile ? 1 : 0;
    case "value_estimate":
      return it.value_estimate ?? -Infinity;
    case "barcode":
      return (it.barcode ?? "").toLowerCase();
    case "updated_at":
      return it.updated_at;
    default:
      return null;
  }
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString();
}
