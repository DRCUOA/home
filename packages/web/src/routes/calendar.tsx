import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  AlertCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  TrendingDown,
  ShoppingCart,
  Layers,
  Clock,
  CheckSquare,
} from "lucide-react";
import type { Task, Project } from "@hcc/shared";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_KINDS } from "@hcc/shared";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useList,
  useCreate,
  useUpdate,
  useRemove,
} from "@/hooks/use-query-helpers";
import { apiGet } from "@/lib/api";
import { capitalize } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/cn";

type ProjectFilter = "all" | "sell" | "buy";

type CalendarEntry = Task & { project_type: "sell" | "buy" | null };

type ListResponse<T> = { data: T[]; total: number };

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});

const PRIORITY_VARIANT: Record<
  string,
  "danger" | "warning" | "primary" | "default"
> = {
  urgent: "danger",
  high: "warning",
  medium: "primary",
  low: "default",
};

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const FILTER_OPTIONS: ReadonlyArray<{
  value: ProjectFilter;
  label: string;
  icon: typeof Layers;
}> = [
  { value: "all", label: "Combined", icon: Layers },
  { value: "sell", label: "Sell", icon: TrendingDown },
  { value: "buy", label: "Buy", icon: ShoppingCart },
];

const MS_PER_DAY = 86_400_000;

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfMondayWeek(d: Date) {
  const out = new Date(d);
  const day = out.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + delta);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfSundayWeek(d: Date) {
  const out = new Date(d);
  const day = out.getDay();
  const delta = day === 0 ? 0 : 7 - day;
  out.setDate(out.getDate() + delta);
  out.setHours(23, 59, 59, 999);
  return out;
}

function formatIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffInDays(a: Date, b: Date) {
  return Math.round(
    (startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY
  );
}

function formatTimeOfDay(hhmm: string | null | undefined): string | null {
  if (!hhmm) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return hhmm;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "pm" : "am";
  const display = ((hour + 11) % 12) + 1;
  return minute === "00" ? `${display}${suffix}` : `${display}:${minute}${suffix}`;
}

function formatDaysFromToday(target: Date, today: Date): string {
  const diff = diffInDays(target, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0) return `In ${diff} days`;
  return `${-diff} days ago`;
}

function formatShortDate(d: Date) {
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

function CalendarPage() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [filter, setFilter] = useState<ProjectFilter>("all");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [defaultStart, setDefaultStart] = useState<string>(formatIsoDate(today));
  const [defaultEnd, setDefaultEnd] = useState<string | null>(null);
  const [defaultKind, setDefaultKind] = useState<"task" | "event">("event");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Mouse interaction state
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const dragStartRef = useRef<Date | null>(null);
  const dragEndRef = useRef<Date | null>(null);
  dragStartRef.current = dragStart;
  dragEndRef.current = dragEnd;

  const gridStart = useMemo(
    () => startOfMondayWeek(startOfMonth(viewMonth)),
    [viewMonth]
  );
  const gridEnd = useMemo(
    () => endOfSundayWeek(endOfMonth(viewMonth)),
    [viewMonth]
  );

  const entriesQuery = useQuery({
    queryKey: [
      "calendar-events",
      filter,
      formatIsoDate(gridStart),
      formatIsoDate(gridEnd),
    ],
    queryFn: () =>
      apiGet<ListResponse<CalendarEntry>>(
        `/calendar/events?from=${gridStart.toISOString()}&to=${gridEnd.toISOString()}&project_type=${filter}`
      ),
  });

  const projectsQuery = useList<Project>("projects", "/projects");

  const entries = entriesQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];

  const createTask = useCreate<Task>("tasks", "/tasks");
  const updateTask = useUpdate<Task>("tasks", "/tasks");
  const removeTask = useRemove("tasks", "/tasks");

  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      if (!entry.due_date) continue;
      const iso = entry.due_date.slice(0, 10);
      const list = map.get(iso) ?? [];
      list.push(entry);
      map.set(iso, list);
    }
    return map;
  }, [entries]);

  const days = useMemo(() => {
    const out: Date[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [gridStart, gridEnd]);

  // Normalize drag range so it works forwards or backwards in time.
  const dragRange = useMemo(() => {
    if (!dragStart || !dragEnd) return null;
    return dragStart <= dragEnd
      ? { start: dragStart, end: dragEnd }
      : { start: dragEnd, end: dragStart };
  }, [dragStart, dragEnd]);

  const dragDays = dragRange
    ? diffInDays(dragRange.end, dragRange.start) + 1
    : 0;

  function isInDragRange(d: Date): boolean {
    if (!dragRange) return false;
    const t = d.getTime();
    return t >= dragRange.start.getTime() && t <= dragRange.end.getTime();
  }

  function openModalForRange(start: Date, end: Date, kind: "task" | "event") {
    setEditingId(null);
    setDefaultStart(formatIsoDate(start));
    setDefaultEnd(sameDay(start, end) ? null : formatIsoDate(end));
    setDefaultKind(kind);
    setModalOpen(true);
  }

  function openEditModal(entryId: string) {
    setEditingId(entryId);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  function invalidateCalendar() {
    entriesQuery.refetch();
  }

  // Global mouse handlers active only while dragging. Attaching to window
  // means we still get the release even if the cursor leaves the grid.
  useEffect(() => {
    if (!dragStart) return;

    const onMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };

    const onUp = () => {
      const s = dragStartRef.current;
      const e = dragEndRef.current;
      if (s && e) {
        const start = s <= e ? s : e;
        const end = s <= e ? e : s;
        openModalForRange(start, end, "event");
      }
      setDragStart(null);
      setDragEnd(null);
      setCursorPos(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragStart]);

  const monthLabel = viewMonth.toLocaleDateString("en-NZ", {
    month: "long",
    year: "numeric",
  });

  const loading = entriesQuery.isLoading || projectsQuery.isLoading;
  const hasError = entriesQuery.isError;
  const editingEntry = editingId
    ? entries.find((e) => e.id === editingId)
    : undefined;

  const showHoverTooltip =
    hoveredDate && !dragStart && cursorPos !== null;

  const actions = (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        size="md"
        className="min-h-11"
        onClick={() => openModalForRange(today, today, "task")}
      >
        <CheckSquare className="h-4 w-4" />
        Add task
      </Button>
      <Button
        size="md"
        className="min-h-11"
        onClick={() => openModalForRange(today, today, "event")}
      >
        <Plus className="h-4 w-4" />
        Add event
      </Button>
    </div>
  );

  return (
    <PageShell
      title="Calendar"
      subtitle="Tasks and events across your sell and buy projects."
      actions={actions}
    >
      <div className="space-y-4 pb-4">
        {hasError && (
          <ErrorBanner text="Could not load calendar entries. Try refreshing." />
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FilterSelector value={filter} onChange={setFilter} />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              className="min-h-11"
              onClick={() =>
                setViewMonth(
                  new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
                )
              }
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[10rem] text-center text-sm font-semibold text-slate-800 dark:text-slate-200">
              {monthLabel}
            </div>
            <Button
              variant="outline"
              size="md"
              className="min-h-11"
              onClick={() =>
                setViewMonth(
                  new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
                )
              }
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="md"
              className="min-h-11"
              onClick={() => setViewMonth(startOfMonth(new Date()))}
            >
              Today
            </Button>
          </div>
        </div>

        <Legend />

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
            <p className="text-sm">Loading calendar…</p>
          </div>
        ) : (
          <Card>
            <CardContent className="px-0 py-0">
              <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {w.slice(0, 3)}
                  </div>
                ))}
              </div>
              <div
                className="grid grid-cols-7 select-none"
                onMouseLeave={() => setHoveredDate(null)}
              >
                {days.map((day) => {
                  const iso = formatIsoDate(day);
                  const dayEntries = entriesByDate.get(iso) ?? [];
                  const inMonth = day.getMonth() === viewMonth.getMonth();
                  const isToday = sameDay(day, today);
                  const inRange = isInDragRange(day);

                  return (
                    <div
                      key={iso}
                      onMouseDown={(e) => {
                        // Ignore right/middle clicks and modifier clicks.
                        if (e.button !== 0) return;
                        e.preventDefault();
                        setCursorPos({ x: e.clientX, y: e.clientY });
                        setDragStart(day);
                        setDragEnd(day);
                      }}
                      onMouseEnter={(e) => {
                        setHoveredDate(day);
                        setCursorPos({ x: e.clientX, y: e.clientY });
                        if (dragStartRef.current) setDragEnd(day);
                      }}
                      onMouseMove={(e) => {
                        // Keep the hover tooltip glued to the cursor.
                        setCursorPos({ x: e.clientX, y: e.clientY });
                      }}
                      className={cn(
                        "min-h-[120px] flex flex-col items-stretch gap-1 border-b border-r border-slate-100 dark:border-slate-800 p-2 text-left transition-colors cursor-pointer",
                        inMonth
                          ? "bg-white dark:bg-slate-900"
                          : "bg-slate-50/60 dark:bg-slate-900/40",
                        inRange
                          ? "bg-slate-200/80 dark:bg-slate-700/60 ring-1 ring-primary-400 dark:ring-primary-600"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                            isToday
                              ? "bg-primary-600 text-white"
                              : inMonth
                              ? "text-slate-700 dark:text-slate-200"
                              : "text-slate-400 dark:text-slate-500"
                          )}
                        >
                          {day.getDate()}
                        </span>
                        {dayEntries.length > 0 && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {dayEntries.length}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {dayEntries.map((entry) => (
                          <EntryChip
                            key={entry.id}
                            entry={entry}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(entry.id);
                            }}
                            onMouseDown={(e) => {
                              // Prevent the day-cell from starting a drag when
                              // the user is just trying to click a chip.
                              e.stopPropagation();
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && entries.length === 0 && !hasError && (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                icon={<CalendarDays className="h-9 w-9" />}
                title="Nothing scheduled this month"
                description="Add an event or task, or switch the filter to see more."
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Floating indicators. position:fixed so they follow the cursor without
          getting clipped by the grid's overflow. pointer-events:none so they
          don't break the drag. */}
      {showHoverTooltip && cursorPos && hoveredDate && (
        <FloatingLabel x={cursorPos.x} y={cursorPos.y}>
          <span className="text-slate-200">
            {formatDaysFromToday(hoveredDate, today)}
          </span>
        </FloatingLabel>
      )}
      {dragRange && cursorPos && (
        <FloatingLabel x={cursorPos.x} y={cursorPos.y} highlight>
          <span className="font-semibold">
            {dragDays} day{dragDays === 1 ? "" : "s"} selected
          </span>
          <span className="block text-[11px] opacity-80">
            {formatShortDate(dragRange.start)} → {formatShortDate(dragRange.end)}
          </span>
        </FloatingLabel>
      )}

      <EntryModal
        key={editingId ?? `new-${defaultStart}-${defaultEnd ?? ""}-${defaultKind}`}
        open={modalOpen}
        onClose={closeModal}
        projects={projects}
        existing={editingEntry}
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
        defaultKind={defaultKind}
        defaultProjectType={filter === "all" ? undefined : filter}
        submitting={createTask.isPending || updateTask.isPending}
        onSubmit={(payload) => {
          if (editingId) {
            updateTask.mutate(
              { id: editingId, data: payload },
              {
                onSuccess: () => {
                  closeModal();
                  invalidateCalendar();
                },
              }
            );
          } else {
            createTask.mutate(payload, {
              onSuccess: () => {
                closeModal();
                invalidateCalendar();
              },
            });
          }
        }}
        onDelete={() => {
          if (!editingId) return;
          setConfirmDeleteId(editingId);
        }}
      />

      <Modal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete entry"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Are you sure you want to delete &ldquo;
          {entries.find((e) => e.id === confirmDeleteId)?.title}
          &rdquo;? This cannot be undone.
        </p>
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1 min-h-12"
            onClick={() => setConfirmDeleteId(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            className="flex-1 min-h-12"
            disabled={removeTask.isPending}
            onClick={() => {
              if (!confirmDeleteId) return;
              removeTask.mutate(confirmDeleteId, {
                onSuccess: () => {
                  setConfirmDeleteId(null);
                  closeModal();
                  invalidateCalendar();
                },
              });
            }}
          >
            {removeTask.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Delete"
            )}
          </Button>
        </div>
      </Modal>
    </PageShell>
  );
}

function FloatingLabel({
  x,
  y,
  highlight,
  children,
}: {
  x: number;
  y: number;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: x + 14,
        top: y + 14,
        zIndex: 60,
        pointerEvents: "none",
      }}
      className={cn(
        "rounded-md px-2 py-1 text-xs shadow-lg",
        highlight
          ? "bg-primary-600 text-white"
          : "bg-slate-900/90 text-slate-100 dark:bg-slate-800/95"
      )}
    >
      {children}
    </div>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

function FilterSelector({
  value,
  onChange,
}: {
  value: ProjectFilter;
  onChange: (next: ProjectFilter) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Project filter"
      className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1"
    >
      {FILTER_OPTIONS.map(({ value: optValue, label, icon: Icon }) => {
        const active = value === optValue;
        return (
          <button
            key={optValue}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(optValue)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-9",
              active
                ? "bg-primary-600 text-white"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
        Event (timed)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CheckSquare className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
        Task
      </span>
      <span className="hidden sm:inline text-slate-300 dark:text-slate-600">
        |
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        Sell
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
        Buy
      </span>
      <span className="hidden md:inline text-slate-300 dark:text-slate-600">
        |
      </span>
      <span className="hidden md:inline italic">
        Click + drag to create a multi-day entry.
      </span>
    </div>
  );
}

function EntryChip({
  entry,
  onClick,
  onMouseDown,
}: {
  entry: CalendarEntry;
  onClick: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const isEvent = entry.kind === "event";
  const Icon = isEvent ? Clock : CheckSquare;
  const time = isEvent ? formatTimeOfDay(entry.start_time) : null;
  const endIso = entry.end_date?.slice(0, 10);
  const startIso = entry.due_date?.slice(0, 10);
  const isMultiDay = !!(endIso && startIso && endIso !== startIso);

  const dotColor =
    entry.project_type === "sell"
      ? "bg-emerald-500"
      : entry.project_type === "buy"
      ? "bg-blue-500"
      : "bg-slate-400";

  const iconColor = isEvent
    ? "text-primary-600 dark:text-primary-400"
    : "text-slate-500 dark:text-slate-400";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-1 text-left text-[11px] leading-tight cursor-pointer",
        "hover:border-primary-300 dark:hover:border-primary-700",
        entry.status === "done" && "opacity-60"
      )}
      aria-label={`${isEvent ? "Event" : "Task"}: ${entry.title}`}
    >
      <span
        className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)}
        aria-hidden="true"
      />
      <Icon className={cn("h-3 w-3 shrink-0", iconColor)} aria-hidden="true" />
      {time && (
        <span className="shrink-0 font-semibold tabular-nums text-slate-600 dark:text-slate-300">
          {time}
        </span>
      )}
      <span
        className={cn(
          "flex-1 truncate font-medium text-slate-800 dark:text-slate-200",
          entry.status === "done" && "line-through"
        )}
      >
        {entry.title}
      </span>
      {isMultiDay && endIso && (
        <span className="hidden md:inline shrink-0 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
          →{formatShortDate(new Date(endIso))}
        </span>
      )}
      <Badge
        variant={PRIORITY_VARIANT[entry.priority] ?? "default"}
        className="hidden sm:inline-flex shrink-0 !px-1.5 !py-0 !text-[10px]"
      >
        {entry.priority[0]?.toUpperCase()}
      </Badge>
    </div>
  );
}

function EntryModal({
  open,
  onClose,
  projects,
  existing,
  defaultStart,
  defaultEnd,
  defaultKind,
  defaultProjectType,
  onSubmit,
  onDelete,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  existing: CalendarEntry | undefined;
  defaultStart: string;
  defaultEnd: string | null;
  defaultKind: "task" | "event";
  defaultProjectType: "sell" | "buy" | undefined;
  onSubmit: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  submitting: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [kind, setKind] = useState<"task" | "event">("event");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setTitle(existing.title);
      setDescription(existing.description ?? "");
      setDueDate(existing.due_date?.slice(0, 10) ?? defaultStart);
      setEndDate(existing.end_date?.slice(0, 10) ?? "");
      setStartTime(existing.start_time ?? "");
      setKind(
        (existing.kind === "event" ? "event" : "task") as "task" | "event"
      );
      setPriority(existing.priority);
      setStatus(existing.status);
      setProjectId(existing.project_id ?? "");
    } else {
      const preferred = defaultProjectType
        ? projects.find((p) => p.type === defaultProjectType)
        : undefined;
      setTitle("");
      setDescription("");
      setDueDate(defaultStart);
      setEndDate(defaultEnd ?? "");
      setStartTime("");
      setKind(defaultKind);
      setPriority("medium");
      setStatus("todo");
      setProjectId(preferred?.id ?? projects[0]?.id ?? "");
    }
  }, [
    open,
    existing?.id,
    defaultStart,
    defaultEnd,
    defaultKind,
    defaultProjectType,
    projects,
  ]);

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: `${p.name} (${capitalize(p.type)})`,
  }));

  const isEvent = kind === "event";
  const KindIcon = isEvent ? Clock : CheckSquare;
  const hasRange = endDate && endDate !== dueDate;
  const rangeDays =
    dueDate && endDate
      ? diffInDays(new Date(endDate), new Date(dueDate)) + 1
      : 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        existing
          ? isEvent
            ? "Edit event"
            : "Edit task"
          : isEvent
          ? "New event"
          : "New task"
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            title: title.trim(),
            description: description || undefined,
            due_date: dueDate || undefined,
            end_date: hasRange ? endDate : null,
            start_time: isEvent && startTime ? startTime : null,
            kind,
            priority,
            status,
            project_id: projectId || undefined,
          });
        }}
      >
        <div>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Kind
          </span>
          <div
            role="radiogroup"
            aria-label="Entry kind"
            className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1"
          >
            {TASK_KINDS.map((k) => {
              const active = kind === k;
              const Icon = k === "event" ? Clock : CheckSquare;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setKind(k)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-9",
                    active
                      ? "bg-primary-600 text-white"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{capitalize(k)}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <KindIcon className="inline h-3 w-3 -mt-0.5" />{" "}
            {isEvent
              ? "Events are scheduled at a specific time of day."
              : "Tasks are to-do items with a due date but no time."}
          </p>
        </div>

        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="date"
            label="Start date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
          <Input
            type="date"
            label="End date (optional)"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={dueDate || undefined}
          />
        </div>
        {hasRange && (
          <p className="-mt-2 text-xs text-primary-700 dark:text-primary-300">
            Spans {rangeDays} day{rangeDays === 1 ? "" : "s"}.
          </p>
        )}
        {isEvent && (
          <Input
            type="time"
            label="Time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            options={TASK_PRIORITIES.map((p) => ({
              value: p,
              label: capitalize(p),
            }))}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={TASK_STATUSES.map((s) => ({
              value: s,
              label: capitalize(s),
            }))}
          />
        </div>
        {projects.length > 0 && (
          <Select
            label="Project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={projectOptions}
            placeholder="None"
          />
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          {existing && (
            <Button
              type="button"
              variant="danger"
              className="min-h-12"
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-12"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="min-h-12"
              disabled={submitting || !title.trim()}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
