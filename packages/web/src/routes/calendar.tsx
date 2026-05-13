import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import type { Task, Project } from "@hcc/shared";
import { TASK_STATUSES, TASK_PRIORITIES } from "@hcc/shared";
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

type CalendarEvent = Task & { project_type: "sell" | "buy" | null };

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

function CalendarPage() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>(formatIsoDate(today));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const gridStart = useMemo(
    () => startOfMondayWeek(startOfMonth(viewMonth)),
    [viewMonth]
  );
  const gridEnd = useMemo(
    () => endOfSundayWeek(endOfMonth(viewMonth)),
    [viewMonth]
  );

  const eventsQuery = useQuery({
    queryKey: [
      "calendar-events",
      filter,
      formatIsoDate(gridStart),
      formatIsoDate(gridEnd),
    ],
    queryFn: () =>
      apiGet<ListResponse<CalendarEvent>>(
        `/calendar/events?from=${gridStart.toISOString()}&to=${gridEnd.toISOString()}&project_type=${filter}`
      ),
  });

  const projectsQuery = useList<Project>("projects", "/projects");

  const events = eventsQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];

  const createTask = useCreate<Task>("tasks", "/tasks");
  const updateTask = useUpdate<Task>("tasks", "/tasks");
  const removeTask = useRemove("tasks", "/tasks");

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      if (!event.due_date) continue;
      const iso = event.due_date.slice(0, 10);
      const list = map.get(iso) ?? [];
      list.push(event);
      map.set(iso, list);
    }
    return map;
  }, [events]);

  const days = useMemo(() => {
    const out: Date[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [gridStart, gridEnd]);

  function openAddModal(date: Date) {
    setEditingId(null);
    setDefaultDate(formatIsoDate(date));
    setModalOpen(true);
  }

  function openEditModal(eventId: string) {
    setEditingId(eventId);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  function invalidateCalendar() {
    eventsQuery.refetch();
  }

  const monthLabel = viewMonth.toLocaleDateString("en-NZ", {
    month: "long",
    year: "numeric",
  });

  const loading = eventsQuery.isLoading || projectsQuery.isLoading;
  const hasError = eventsQuery.isError;

  const editingEvent = editingId
    ? events.find((e) => e.id === editingId)
    : undefined;

  const actions = (
    <Button
      size="md"
      className="min-h-11"
      onClick={() => openAddModal(today)}
    >
      <Plus className="h-4 w-4" />
      Add event
    </Button>
  );

  return (
    <PageShell
      title="Calendar"
      subtitle="Tasks and events across your sell and buy projects."
      actions={actions}
    >
      <div className="space-y-4 pb-4">
        {hasError && (
          <ErrorBanner text="Could not load calendar events. Try refreshing." />
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
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const iso = formatIsoDate(day);
                  const dayEvents = eventsByDate.get(iso) ?? [];
                  const inMonth = day.getMonth() === viewMonth.getMonth();
                  const isToday = sameDay(day, today);
                  return (
                    <button
                      type="button"
                      key={iso}
                      onDoubleClick={() => openAddModal(day)}
                      onClick={() => {
                        if (dayEvents.length === 0) openAddModal(day);
                      }}
                      className={cn(
                        "min-h-[120px] flex flex-col items-stretch gap-1 border-b border-r border-slate-100 dark:border-slate-800 p-2 text-left transition-colors",
                        inMonth
                          ? "bg-white dark:bg-slate-900"
                          : "bg-slate-50/60 dark:bg-slate-900/40",
                        "hover:bg-slate-50 dark:hover:bg-slate-800/50"
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
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {dayEvents.map((event) => (
                          <EventChip
                            key={event.id}
                            event={event}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(event.id);
                            }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && events.length === 0 && !hasError && (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                icon={<CalendarDays className="h-9 w-9" />}
                title="No events this month"
                description="Add a task with a due date, or switch the filter to see more."
              />
            </CardContent>
          </Card>
        )}
      </div>

      <EventModal
        key={editingId ?? `new-${defaultDate}`}
        open={modalOpen}
        onClose={closeModal}
        projects={projects}
        existing={editingEvent}
        defaultDate={defaultDate}
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
        title="Delete event"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Are you sure you want to delete &ldquo;
          {events.find((e) => e.id === confirmDeleteId)?.title}
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

function EventChip({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (e: React.MouseEvent) => void;
}) {
  const dotColor =
    event.project_type === "sell"
      ? "bg-emerald-500"
      : event.project_type === "buy"
      ? "bg-blue-500"
      : "bg-slate-400";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-1 text-left text-[11px] leading-tight",
        "hover:border-primary-300 dark:hover:border-primary-700",
        event.status === "done" && "opacity-60"
      )}
    >
      <span
        className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)}
        aria-hidden="true"
      />
      <span
        className={cn(
          "flex-1 truncate font-medium text-slate-800 dark:text-slate-200",
          event.status === "done" && "line-through"
        )}
      >
        {event.title}
      </span>
      <Badge
        variant={PRIORITY_VARIANT[event.priority] ?? "default"}
        className="hidden sm:inline-flex shrink-0 !px-1.5 !py-0 !text-[10px]"
      >
        {event.priority[0]?.toUpperCase()}
      </Badge>
    </div>
  );
}

function EventModal({
  open,
  onClose,
  projects,
  existing,
  defaultDate,
  defaultProjectType,
  onSubmit,
  onDelete,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  existing: CalendarEvent | undefined;
  defaultDate: string;
  defaultProjectType: "sell" | "buy" | undefined;
  onSubmit: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  submitting: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setTitle(existing.title);
      setDescription(existing.description ?? "");
      setDueDate(existing.due_date?.slice(0, 10) ?? defaultDate);
      setPriority(existing.priority);
      setStatus(existing.status);
      setProjectId(existing.project_id ?? "");
    } else {
      const preferred = defaultProjectType
        ? projects.find((p) => p.type === defaultProjectType)
        : undefined;
      setTitle("");
      setDescription("");
      setDueDate(defaultDate);
      setPriority("medium");
      setStatus("todo");
      setProjectId(preferred?.id ?? projects[0]?.id ?? "");
    }
  }, [open, existing?.id, defaultDate, defaultProjectType, projects]);

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: `${p.name} (${capitalize(p.type)})`,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? "Edit event" : "New event"}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            title: title.trim(),
            description: description || undefined,
            due_date: dueDate || undefined,
            priority,
            status,
            project_id: projectId || undefined,
          });
        }}
      >
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
        <Input
          type="date"
          label="Date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          required
        />
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
