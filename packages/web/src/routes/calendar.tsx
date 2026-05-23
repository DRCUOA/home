import { createFileRoute } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  AlertCircle,
  Plus,
  CalendarDays,
  TrendingDown,
  ShoppingCart,
  Layers,
  Clock,
  CheckSquare,
  Crosshair,
  Repeat,
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

type Scale = "days" | "weeks" | "months" | "years";

type CalendarEntry = Task & {
  project_type: "sell" | "buy" | null;
  // For recurring series the calendar route expands occurrences and supplies
  // these per-occurrence dates. For non-recurring entries they mirror
  // due_date/end_date, so callers can read them uniformly. due_date/end_date
  // always reference the SERIES original, so the edit modal hydrates from
  // the correct row.
  occurrence_start?: string | null;
  occurrence_end?: string | null;
};

type SpanPosition = "single" | "start" | "middle" | "end";

type DayEntry = {
  entry: CalendarEntry;
  position: SpanPosition;
  // True for the absolute first day of a multi-day span. Continuation days
  // suppress the icon/badge to keep the bar reading as one shape, but still
  // show the title so the user can identify the span without looking back.
  isFirstDay: boolean;
};

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

const SCALES: readonly Scale[] = ["days", "weeks", "months", "years"];

const SCALE_LABELS: Record<Scale, string> = {
  days: "Days",
  weeks: "Weeks",
  months: "Months",
  years: "Years",
};

// Each scale just scales the day cell's size — same Mon-Sun grid, denser
// presentation. Entry chips degrade to dots and then to background tints.
const CELL_MIN_H: Record<Scale, string> = {
  days: "min-h-[120px]",
  weeks: "min-h-[60px]",
  months: "min-h-[28px]",
  years: "min-h-[14px]",
};

const PRELOAD_MONTHS = 6;
const EXTEND_BY = 6;
const MAX_LOADED_MONTHS = 60; // hard ceiling so memory doesn't grow forever

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

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

function formatMonthYear(d: Date) {
  return d.toLocaleDateString("en-NZ", { month: "long", year: "numeric" });
}

function buildInitialMonths(anchor: Date): Date[] {
  const base = startOfMonth(anchor);
  const months: Date[] = [];
  for (let i = -PRELOAD_MONTHS; i <= PRELOAD_MONTHS; i++) {
    months.push(new Date(base.getFullYear(), base.getMonth() + i, 1));
  }
  return months;
}

function CalendarPage() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [scale, setScale] = useState<Scale>("days");
  const [loadedMonths, setLoadedMonths] = useState<Date[]>(() =>
    buildInitialMonths(today)
  );

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

  // Infinite-scroll refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Captured scrollHeight just before a prepend, used to keep the user's
  // current visual position stable when new months arrive at the top.
  const pendingPrependHeight = useRef<number | null>(null);
  const didInitialScroll = useRef(false);

  // The fetched range covers the full visible grid (each month is padded
  // to include leading/trailing weekday cells from adjacent months).
  const rangeStart = useMemo(
    () => startOfMondayWeek(startOfMonth(loadedMonths[0])),
    [loadedMonths]
  );
  const rangeEnd = useMemo(
    () =>
      endOfSundayWeek(endOfMonth(loadedMonths[loadedMonths.length - 1])),
    [loadedMonths]
  );

  const entriesQuery = useQuery({
    queryKey: [
      "calendar-events",
      filter,
      formatIsoDate(rangeStart),
      formatIsoDate(rangeEnd),
    ],
    queryFn: () =>
      apiGet<ListResponse<CalendarEntry>>(
        `/calendar/events?from=${rangeStart.toISOString()}&to=${rangeEnd.toISOString()}&project_type=${filter}`
      ),
  });

  const projectsQuery = useList<Project>("projects", "/projects");

  const entries = entriesQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];

  const createTask = useCreate<Task>("tasks", "/tasks");
  const updateTask = useUpdate<Task>("tasks", "/tasks");
  const removeTask = useRemove("tasks", "/tasks");

  const entriesByDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const entry of entries) {
      // Prefer the per-occurrence date when present (recurring series). Falls
      // back to due_date/end_date for non-recurring entries — the API mirrors
      // those into the occurrence fields too, so this fallback is only
      // exercised against older responses without the new fields.
      const startSource = entry.occurrence_start ?? entry.due_date;
      const endSource = entry.occurrence_end ?? entry.end_date;
      if (!startSource) continue;
      const startIso = startSource.slice(0, 10);
      const endIso = endSource ? endSource.slice(0, 10) : startIso;
      // Parse as local dates (no time / no timezone) so we can step day by day
      // without DST drift.
      const [sy, sm, sd] = startIso.split("-").map(Number);
      const [ey, em, ed] = endIso.split("-").map(Number);
      const startDate = new Date(sy, sm - 1, sd);
      let endDate = new Date(ey, em - 1, ed);
      // Defensive: if end_date precedes due_date (bad data), treat as single day.
      if (endDate < startDate) endDate = startDate;

      const cursor = new Date(startDate);
      while (cursor <= endDate) {
        const iso = formatIsoDate(cursor);
        const isStart = sameDay(cursor, startDate);
        const isEnd = sameDay(cursor, endDate);
        const position: SpanPosition =
          isStart && isEnd
            ? "single"
            : isStart
            ? "start"
            : isEnd
            ? "end"
            : "middle";
        const list = map.get(iso) ?? [];
        list.push({ entry, position, isFirstDay: isStart });
        map.set(iso, list);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [entries]);

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

  function extendForward() {
    setLoadedMonths((prev) => {
      const last = prev[prev.length - 1];
      const next: Date[] = [];
      for (let i = 1; i <= EXTEND_BY; i++) {
        next.push(new Date(last.getFullYear(), last.getMonth() + i, 1));
      }
      const merged = [...prev, ...next];
      // Trim from the start if we go over the ceiling — keeps memory bounded
      // without surprising the user (they're scrolling away from those months).
      return merged.length > MAX_LOADED_MONTHS
        ? merged.slice(merged.length - MAX_LOADED_MONTHS)
        : merged;
    });
  }

  function extendBackward() {
    const container = scrollRef.current;
    if (!container) return;
    pendingPrependHeight.current = container.scrollHeight;
    setLoadedMonths((prev) => {
      const first = prev[0];
      const next: Date[] = [];
      for (let i = EXTEND_BY; i >= 1; i--) {
        next.push(new Date(first.getFullYear(), first.getMonth() - i, 1));
      }
      const merged = [...next, ...prev];
      return merged.length > MAX_LOADED_MONTHS
        ? merged.slice(0, MAX_LOADED_MONTHS)
        : merged;
    });
  }

  // Restore the user's visual position after a prepend by shifting scrollTop
  // by exactly the height of the newly-prepended content.
  useLayoutEffect(() => {
    if (pendingPrependHeight.current === null) return;
    const container = scrollRef.current;
    if (!container) {
      pendingPrependHeight.current = null;
      return;
    }
    const delta = container.scrollHeight - pendingPrependHeight.current;
    container.scrollTop += delta;
    pendingPrependHeight.current = null;
  }, [loadedMonths]);

  // The scroll-to-today is driven from the month's ref callback (below) so it
  // fires the moment today's element actually mounts. A useEffect on `today`
  // alone runs before the loading spinner gives way to the month grid, which
  // is why the previous attempt silently no-op'd on fresh loads.

  // IntersectionObserver-driven infinite scroll: prepend/append when sentinels
  // come into view. rootMargin gives us a little lead time before the user
  // hits the absolute edge.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (!record.isIntersecting) continue;
          if (record.target === topSentinelRef.current) {
            extendBackward();
          } else if (record.target === bottomSentinelRef.current) {
            extendForward();
          }
        }
      },
      { root: container, rootMargin: "300px" }
    );
    if (topSentinelRef.current) observer.observe(topSentinelRef.current);
    if (bottomSentinelRef.current) observer.observe(bottomSentinelRef.current);
    return () => observer.disconnect();
  }, []);

  // Wheel-to-zoom anywhere on the calendar — same UX as the map's MapLibre
  // canvas: plain wheel changes scale, no modifier required. The listener
  // is non-passive so we can preventDefault and stop the page from
  // scrolling underneath. Date navigation falls to the scrollbar and the
  // Today button (parallel to the map, which pans by drag, not wheel).
  // Pinch on macOS trackpads fires the same wheel event with ctrlKey,
  // which this also covers.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let accum = 0;
    let lastFireTime = 0;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      // Trackpad pinch fires deltaY at finer granularity than mouse wheel.
      // ctrlKey == true means pinch on macOS; treat it the same as plain wheel
      // here since both end up changing scale.
      accum += e.deltaY;
      const threshold = e.ctrlKey ? 8 : 40;
      if (Math.abs(accum) < threshold) return;
      // Rate-limit so a single fast flick can only change scale every 120ms.
      const now = performance.now();
      if (now - lastFireTime < 120) {
        accum = 0;
        return;
      }
      lastFireTime = now;
      const dir = accum > 0 ? 1 : -1;
      accum = 0;
      setScale((prev) => {
        const idx = SCALES.indexOf(prev);
        return SCALES[
          Math.max(0, Math.min(SCALES.length - 1, idx + dir))
        ];
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Global pointer handlers active only while dragging. We listen to
  // pointer rather than mouse events so the same code path works for
  // mouse, pen, and (via the cell's onPointerDown) touch. `pointercancel`
  // cleans up if iOS Safari interrupts the drag because the user scrolled
  // or switched windows mid-gesture.
  useEffect(() => {
    if (!dragStart) return;

    const onMove = (e: PointerEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };

    const commit = () => {
      const s = dragStartRef.current;
      const en = dragEndRef.current;
      if (s && en) {
        const start = s <= en ? s : en;
        const end = s <= en ? en : s;
        openModalForRange(start, end, "event");
      }
      setDragStart(null);
      setDragEnd(null);
      setCursorPos(null);
    };

    const abort = () => {
      setDragStart(null);
      setDragEnd(null);
      setCursorPos(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", commit);
    window.addEventListener("pointercancel", abort);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", commit);
      window.removeEventListener("pointercancel", abort);
    };
  }, [dragStart]);

  function jumpToToday() {
    const el = monthRefs.current.get(monthKey(today));
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // If today's month isn't currently loaded, rebuild the window around it.
    setLoadedMonths(buildInitialMonths(today));
    didInitialScroll.current = false;
  }

  const loading = entriesQuery.isLoading || projectsQuery.isLoading;
  const hasError = entriesQuery.isError;
  const editingEntry = editingId
    ? entries.find((e) => e.id === editingId)
    : undefined;

  const showHoverTooltip = hoveredDate && !dragStart && cursorPos !== null;

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="md"
        className="min-h-11"
        onClick={jumpToToday}
      >
        <Crosshair className="h-4 w-4" />
        Today
      </Button>
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
          <ScaleWheel value={scale} onChange={setScale} />
        </div>

        <Legend />

        {loading && entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
            <p className="text-sm">Loading calendar…</p>
          </div>
        ) : (
          <Card>
            <CardContent className="px-0 py-0">
              <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 backdrop-blur">
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
                ref={scrollRef}
                className="select-none overflow-y-scroll"
                style={{
                  maxHeight: "calc(100vh - 240px)",
                  // Avoid the page jumping when the always-visible scrollbar
                  // appears or disappears on theme switches etc.
                  scrollbarGutter: "stable",
                }}
                onMouseLeave={() => setHoveredDate(null)}
              >
                <div ref={topSentinelRef} aria-hidden className="h-px" />

                {loadedMonths.map((monthDate) => (
                  <MonthSection
                    key={monthKey(monthDate)}
                    monthDate={monthDate}
                    today={today}
                    scale={scale}
                    entriesByDate={entriesByDate}
                    inDragRange={isInDragRange}
                    onDayPointerDown={(day, e) => {
                      // Mouse: only respond to the primary button.
                      // Touch/pen always counts as primary.
                      if (e.pointerType === "mouse" && e.button !== 0) return;
                      // preventDefault stops mouse drag from selecting text.
                      // On touch we deliberately do NOT preventDefault so the
                      // browser can still handle vertical page scrolling when
                      // the user swipes — `pointercancel` (handled above) then
                      // aborts the drag cleanly.
                      if (e.pointerType === "mouse") e.preventDefault();
                      setCursorPos({ x: e.clientX, y: e.clientY });
                      setDragStart(day);
                      setDragEnd(day);
                    }}
                    onDayPointerEnter={(day, e) => {
                      setHoveredDate(day);
                      setCursorPos({ x: e.clientX, y: e.clientY });
                      if (dragStartRef.current) setDragEnd(day);
                    }}
                    onDayPointerMove={(e) => {
                      setCursorPos({ x: e.clientX, y: e.clientY });
                    }}
                    onEntryClick={(entryId, e) => {
                      e.stopPropagation();
                      openEditModal(entryId);
                    }}
                    registerRef={(key, el) => {
                      if (el) {
                        monthRefs.current.set(key, el);
                        // Anchor the viewport on today the first time today's
                        // month enters the DOM. Doing it here (rather than in
                        // a useEffect) handles the case where the spinner
                        // suppresses month rendering during the initial data
                        // fetch — by the time today's element registers, we
                        // scroll to it immediately.
                        if (
                          !didInitialScroll.current &&
                          key === monthKey(today)
                        ) {
                          didInitialScroll.current = true;
                          el.scrollIntoView({ block: "start" });
                        }
                      } else {
                        monthRefs.current.delete(key);
                      }
                    }}
                  />
                ))}

                <div ref={bottomSentinelRef} aria-hidden className="h-px" />
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && entries.length === 0 && !hasError && (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                icon={<CalendarDays className="h-9 w-9" />}
                title="Nothing scheduled in this window"
                description="Add an event or task, or scroll to load more months."
              />
            </CardContent>
          </Card>
        )}
      </div>

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

function MonthSection({
  monthDate,
  today,
  scale,
  entriesByDate,
  inDragRange,
  onDayPointerDown,
  onDayPointerEnter,
  onDayPointerMove,
  onEntryClick,
  registerRef,
}: {
  monthDate: Date;
  today: Date;
  scale: Scale;
  entriesByDate: Map<string, DayEntry[]>;
  inDragRange: (d: Date) => boolean;
  onDayPointerDown: (day: Date, e: React.PointerEvent) => void;
  onDayPointerEnter: (day: Date, e: React.PointerEvent) => void;
  onDayPointerMove: (e: React.PointerEvent) => void;
  onEntryClick: (entryId: string, e: React.MouseEvent) => void;
  registerRef: (key: string, el: HTMLDivElement | null) => void;
}) {
  const key = monthKey(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const daysInMonth = monthEnd.getDate();
  // Pad with empty cells so the 1st lands on the right weekday column.
  const padStart = (monthDate.getDay() + 6) % 7;

  return (
    <div
      ref={(el) => registerRef(key, el)}
      data-month={key}
      className="border-b-2 border-slate-200 dark:border-slate-700"
    >
      <div className="sticky top-9 z-[5] flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 py-1.5">
        <h3 className="font-display text-sm font-extrabold tracking-tight text-slate-800 dark:text-slate-200">
          {formatMonthYear(monthDate)}
        </h3>
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: padStart }, (_, i) => (
          <div
            key={`pad-${i}`}
            className={cn(
              CELL_MIN_H[scale],
              "border-b border-r border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30"
            )}
          />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = new Date(
            monthDate.getFullYear(),
            monthDate.getMonth(),
            i + 1
          );
          const iso = formatIsoDate(day);
          const dayEntries = entriesByDate.get(iso) ?? [];
          const isToday = sameDay(day, today);
          const inRange = inDragRange(day);
          return (
            <DayCell
              key={iso}
              day={day}
              scale={scale}
              isToday={isToday}
              inRange={inRange}
              entries={dayEntries}
              onPointerDown={(e) => onDayPointerDown(day, e)}
              onPointerEnter={(e) => onDayPointerEnter(day, e)}
              onPointerMove={onDayPointerMove}
              onEntryClick={onEntryClick}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayCell({
  day,
  scale,
  isToday,
  inRange,
  entries,
  onPointerDown,
  onPointerEnter,
  onPointerMove,
  onEntryClick,
}: {
  day: Date;
  scale: Scale;
  isToday: boolean;
  inRange: boolean;
  entries: DayEntry[];
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onEntryClick: (entryId: string, e: React.MouseEvent) => void;
}) {
  const showFullChips = scale === "days";
  const showDots = scale === "weeks" || scale === "months";
  const showNumber = scale !== "years";

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      className={cn(
        CELL_MIN_H[scale],
        "flex flex-col items-stretch gap-1 border-b border-r border-slate-100 dark:border-slate-800 p-1 text-left transition-colors cursor-pointer bg-white dark:bg-slate-900",
        inRange
          ? "bg-slate-200/80 dark:bg-slate-700/60 ring-1 ring-primary-400 dark:ring-primary-600"
          : entries.length > 0 && (scale === "months" || scale === "years")
          ? "bg-primary-50/60 dark:bg-primary-900/20 hover:bg-primary-100/70"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
      )}
    >
      {showNumber && (
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full font-semibold",
              scale === "days" ? "h-6 w-6 text-xs" : "h-5 w-5 text-[10px]",
              isToday
                ? "bg-primary-600 text-white"
                : "text-slate-700 dark:text-slate-200"
            )}
          >
            {day.getDate()}
          </span>
          {scale === "days" && entries.length > 0 && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {entries.length}
            </span>
          )}
        </div>
      )}

      {showFullChips && (
        <div className="flex flex-col gap-1">
          {entries.map(({ entry, position, isFirstDay }) => (
            <EntryChip
              key={entry.id}
              entry={entry}
              position={position}
              isFirstDay={isFirstDay}
              onClick={(e) => onEntryClick(entry.id, e)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ))}
        </div>
      )}

      {showDots && entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-0.5">
          {entries.slice(0, 6).map(({ entry, position }, i) => (
            <span
              key={`${entry.id}-${i}`}
              title={entry.title}
              className={cn(
                "h-1.5 rounded-full",
                // Multi-day spans render a short dash to hint at continuation,
                // single-day entries stay as dots.
                position === "single" ? "w-1.5" : "w-3",
                entry.project_type === "sell"
                  ? "bg-emerald-500"
                  : entry.project_type === "buy"
                  ? "bg-blue-500"
                  : "bg-slate-400"
              )}
            />
          ))}
          {entries.length > 6 && (
            <span className="text-[9px] text-slate-400 dark:text-slate-500">
              +{entries.length - 6}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ScaleWheel({
  value,
  onChange,
}: {
  value: Scale;
  onChange: (next: Scale) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const wheelAccum = useRef(0);

  // Use a native non-passive listener so we can preventDefault on the
  // wheel event. Without this, the page would scroll instead of changing
  // the scale.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      // Accumulate deltas so a flick on a trackpad doesn't skip past every
      // scale in a single frame.
      wheelAccum.current += e.deltaY;
      if (Math.abs(wheelAccum.current) < 40) return;
      const dir = wheelAccum.current > 0 ? 1 : -1;
      wheelAccum.current = 0;
      const idx = SCALES.indexOf(valueRef.current);
      const next = SCALES[Math.max(0, Math.min(SCALES.length - 1, idx + dir))];
      if (next !== valueRef.current) onChange(next);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [onChange]);

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label="Time scale"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const idx = SCALES.indexOf(value);
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = SCALES[Math.max(0, Math.min(SCALES.length - 1, idx + dir))];
        if (next !== value) onChange(next);
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
      title="Wheel or pinch anywhere on the calendar to zoom: Days → Weeks → Months → Years"
    >
      {SCALES.map((s) => {
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(s)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-9",
              active
                ? "bg-primary-600 text-white"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            {SCALE_LABELS[s]}
          </button>
        );
      })}
    </div>
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
        Click + drag to create. Wheel or pinch to zoom Days → Weeks → Months
        → Years. Drag the scrollbar or click Today to navigate dates.
      </span>
    </div>
  );
}

function EntryChip({
  entry,
  position,
  isFirstDay,
  onClick,
  onPointerDown,
}: {
  entry: CalendarEntry;
  position: SpanPosition;
  isFirstDay: boolean;
  onClick: (e: React.MouseEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const isEvent = entry.kind === "event";
  const Icon = isEvent ? Clock : CheckSquare;
  const time = isEvent ? formatTimeOfDay(entry.start_time) : null;
  // The "→ end" annotation on the start chip should reflect this occurrence's
  // span, not the series template's, so prefer occurrence_end when present.
  const endIso = (entry.occurrence_end ?? entry.end_date)?.slice(0, 10);

  const dotColor =
    entry.project_type === "sell"
      ? "bg-emerald-500"
      : entry.project_type === "buy"
      ? "bg-blue-500"
      : "bg-slate-400";

  const iconColor = isEvent
    ? "text-primary-600 dark:text-primary-400"
    : "text-slate-500 dark:text-slate-400";

  // Negative horizontal margins let the chip bleed into the parent cell's
  // p-1 padding so adjacent segments visually butt up against each other,
  // forming a single continuous bar across the days the span covers.
  const spanLayout: Record<SpanPosition, string> = {
    single: "rounded-md border",
    start: "rounded-l-md border border-r-0 -mr-1",
    middle: "border-y border-x-0 -mx-1",
    end: "rounded-r-md border border-l-0 -ml-1",
  };

  const isContinuation = position === "middle" || position === "end";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      className={cn(
        "flex items-center gap-1.5 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-1 text-left text-[11px] leading-tight cursor-pointer",
        "hover:border-primary-300 dark:hover:border-primary-700",
        spanLayout[position],
        entry.status === "done" && "opacity-60"
      )}
      aria-label={`${isEvent ? "Event" : "Task"}: ${entry.title}${
        position !== "single" ? ` (${position} of multi-day span)` : ""
      }`}
    >
      <span
        className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)}
        aria-hidden="true"
      />
      {/* Icon, time and priority only show on the first day so the bar reads
          as one shape across continuation days. */}
      {isFirstDay && (
        <Icon
          className={cn("h-3 w-3 shrink-0", iconColor)}
          aria-hidden="true"
        />
      )}
      {isFirstDay && entry.recurrence_frequency && (
        <Repeat
          className="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400"
          aria-hidden="true"
        />
      )}
      {isFirstDay && time && (
        <span className="shrink-0 font-semibold tabular-nums text-slate-600 dark:text-slate-300">
          {time}
        </span>
      )}
      <span
        className={cn(
          "flex-1 truncate font-medium text-slate-800 dark:text-slate-200",
          entry.status === "done" && "line-through",
          isContinuation && "italic opacity-80"
        )}
      >
        {entry.title}
      </span>
      {position === "start" && endIso && (
        <span className="hidden md:inline shrink-0 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
          →{formatShortDate(new Date(endIso))}
        </span>
      )}
      {isFirstDay && (
        <Badge
          variant={PRIORITY_VARIANT[entry.priority] ?? "default"}
          className="hidden sm:inline-flex shrink-0 !px-1.5 !py-0 !text-[10px]"
        >
          {entry.priority[0]?.toUpperCase()}
        </Badge>
      )}
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

  // Recurrence state. recurrenceFreq === "" means "doesn't repeat" — the
  // submit handler sends null for every recurrence_* field in that case.
  // recurrenceEndKind is a UI-only discriminator: "never" sends both
  // recurrence_end_date and recurrence_count as null, "on" sends a date,
  // "after" sends a count.
  const [recurrenceFreq, setRecurrenceFreq] = useState<string>("");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<Set<number>>(
    () => new Set()
  );
  const [recurrenceEndKind, setRecurrenceEndKind] = useState<
    "never" | "on" | "after"
  >("never");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [recurrenceCount, setRecurrenceCount] = useState(10);

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
      setRecurrenceFreq(existing.recurrence_frequency ?? "");
      setRecurrenceInterval(existing.recurrence_interval ?? 1);
      setRecurrenceWeekdays(
        new Set(
          existing.recurrence_weekdays
            ? existing.recurrence_weekdays
                .split(",")
                .map(Number)
                .filter((n) => n >= 0 && n <= 6)
            : []
        )
      );
      setRecurrenceEndDate(existing.recurrence_end_date?.slice(0, 10) ?? "");
      setRecurrenceCount(existing.recurrence_count ?? 10);
      if (existing.recurrence_end_date) setRecurrenceEndKind("on");
      else if (existing.recurrence_count != null) setRecurrenceEndKind("after");
      else setRecurrenceEndKind("never");
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
      setRecurrenceFreq("");
      setRecurrenceInterval(1);
      setRecurrenceWeekdays(new Set());
      setRecurrenceEndKind("never");
      setRecurrenceEndDate("");
      setRecurrenceCount(10);
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
          // Collapse the UI state into the API shape: when freq is empty
          // every recurrence_* column is cleared; otherwise interval is
          // always sent and exactly one of end_date / count is populated
          // based on the "Ends" radio.
          const recPayload =
            recurrenceFreq === ""
              ? {
                  recurrence_frequency: null,
                  recurrence_interval: null,
                  recurrence_weekdays: null,
                  recurrence_end_date: null,
                  recurrence_count: null,
                }
              : {
                  recurrence_frequency: recurrenceFreq,
                  recurrence_interval: Math.max(
                    1,
                    Math.min(366, recurrenceInterval || 1)
                  ),
                  recurrence_weekdays:
                    recurrenceFreq === "weekly" && recurrenceWeekdays.size > 0
                      ? Array.from(recurrenceWeekdays)
                          .sort((a, b) => a - b)
                          .join(",")
                      : null,
                  recurrence_end_date:
                    recurrenceEndKind === "on" && recurrenceEndDate
                      ? recurrenceEndDate
                      : null,
                  recurrence_count:
                    recurrenceEndKind === "after"
                      ? Math.max(1, Math.min(999, recurrenceCount || 1))
                      : null,
                };
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
            ...recPayload,
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

        <RecurrenceFields
          freq={recurrenceFreq}
          interval={recurrenceInterval}
          weekdays={recurrenceWeekdays}
          endKind={recurrenceEndKind}
          endDate={recurrenceEndDate}
          count={recurrenceCount}
          dueDate={dueDate}
          isEditingSeries={!!existing?.recurrence_frequency}
          onChange={(patch) => {
            if (patch.freq !== undefined) {
              setRecurrenceFreq(patch.freq);
              // When the user switches to weekly with no weekdays picked
              // yet, seed the start-date's weekday so the picker reflects
              // what the series will actually do.
              if (
                patch.freq === "weekly" &&
                recurrenceWeekdays.size === 0 &&
                dueDate
              ) {
                const jsDay = new Date(dueDate + "T00:00:00").getDay();
                const idx = (jsDay + 6) % 7; // 0=Mon..6=Sun
                setRecurrenceWeekdays(new Set([idx]));
              }
            }
            if (patch.interval !== undefined) setRecurrenceInterval(patch.interval);
            if (patch.weekdays !== undefined) setRecurrenceWeekdays(patch.weekdays);
            if (patch.endKind !== undefined) setRecurrenceEndKind(patch.endKind);
            if (patch.endDate !== undefined) setRecurrenceEndDate(patch.endDate);
            if (patch.count !== undefined) setRecurrenceCount(patch.count);
          }}
        />

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

const WEEKDAY_SHORT = ["M", "T", "W", "T", "F", "S", "S"]; // index 0=Mon..6=Sun
const WEEKDAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const FREQ_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Doesn't repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const FREQ_UNIT_LABEL: Record<string, [string, string]> = {
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
  yearly: ["year", "years"],
};

type RecurrencePatch = {
  freq?: string;
  interval?: number;
  weekdays?: Set<number>;
  endKind?: "never" | "on" | "after";
  endDate?: string;
  count?: number;
};

// The styled Input component wraps each control in a block-level div, which
// breaks the inline "Every [N] days" / "After [N] occurrences" layout used
// in this section. These styles mirror Input.tsx so raw inputs visually
// match the rest of the modal.
const INLINE_INPUT_CLASS =
  "rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground " +
  "focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

function RecurrenceFields({
  freq,
  interval,
  weekdays,
  endKind,
  endDate,
  count,
  dueDate,
  isEditingSeries,
  onChange,
}: {
  freq: string;
  interval: number;
  weekdays: Set<number>;
  endKind: "never" | "on" | "after";
  endDate: string;
  count: number;
  dueDate: string;
  isEditingSeries: boolean;
  onChange: (patch: RecurrencePatch) => void;
}) {
  const unitLabels = freq ? FREQ_UNIT_LABEL[freq] : null;
  const unitLabel = unitLabels
    ? interval === 1
      ? unitLabels[0]
      : unitLabels[1]
    : null;

  function toggleWeekday(idx: number) {
    const next = new Set(weekdays);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    onChange({ weekdays: next });
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Repeat
          className="h-4 w-4 text-slate-500 dark:text-slate-400"
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Repeats
        </span>
      </div>

      <Select
        value={freq}
        onChange={(e) => onChange({ freq: e.target.value })}
        options={FREQ_OPTIONS}
      />

      {freq && (
        <>
          <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <label htmlFor="rec-interval" className="shrink-0">
              Every
            </label>
            <input
              id="rec-interval"
              type="number"
              min={1}
              max={366}
              value={interval}
              onChange={(e) =>
                onChange({
                  interval: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className={cn(INLINE_INPUT_CLASS, "w-20")}
            />
            <span className="shrink-0">{unitLabel}</span>
          </div>

          {freq === "weekly" && (
            <div className="space-y-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                On
              </span>
              <div
                role="group"
                aria-label="Weekdays"
                className="flex flex-wrap gap-1"
              >
                {WEEKDAY_SHORT.map((label, idx) => {
                  const active = weekdays.has(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      aria-pressed={active}
                      aria-label={WEEKDAY_LONG[idx]}
                      onClick={() => toggleWeekday(idx)}
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                        active
                          ? "bg-primary-600 text-white"
                          : "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {weekdays.size === 0 && dueDate && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No days selected — will repeat on{" "}
                  {
                    WEEKDAY_LONG[
                      (new Date(dueDate + "T00:00:00").getDay() + 6) % 7
                    ]
                  }{" "}
                  (matching the start date).
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Ends
            </span>
            <div
              role="radiogroup"
              aria-label="Recurrence end"
              className="flex flex-wrap items-center gap-3 text-sm text-slate-700 dark:text-slate-300"
            >
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="rec-end"
                  checked={endKind === "never"}
                  onChange={() => onChange({ endKind: "never" })}
                />
                Never
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="rec-end"
                  checked={endKind === "on"}
                  onChange={() => onChange({ endKind: "on" })}
                />
                On
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => onChange({ endDate: e.target.value })}
                  onFocus={() => onChange({ endKind: "on" })}
                  min={dueDate || undefined}
                  className={cn(INLINE_INPUT_CLASS, "w-40")}
                />
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="rec-end"
                  checked={endKind === "after"}
                  onChange={() => onChange({ endKind: "after" })}
                />
                After
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={count}
                  onChange={(e) =>
                    onChange({
                      count: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  onFocus={() => onChange({ endKind: "after" })}
                  className={cn(INLINE_INPUT_CLASS, "w-20")}
                />
                occurrences
              </label>
            </div>
          </div>

          {isEditingSeries && (
            <p className="text-xs italic text-slate-500 dark:text-slate-400">
              Changes apply to the whole series.
            </p>
          )}
        </>
      )}
    </div>
  );
}
