import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  AlertCircle,
  Plus,
  Pencil,
  ListChecks,
  CheckSquare,
  LayoutTemplate,
  Clock,
  AlertTriangle,
  ChevronRight,
  Circle,
  CircleDot,
  CircleCheck,
  Pause,
} from "lucide-react";
import type { Task, ChecklistItem, Project } from "@hcc/shared";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  CHECKLIST_STATES,
  CHECKLIST_TYPES,
} from "@hcc/shared";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useList,
  useCreate,
  useUpdate,
  useRemove,
} from "@/hooks/use-query-helpers";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { formatCurrency, formatDate, formatPercent, capitalize } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type ListResponse<T> = { data: T[]; total: number };

export const Route = createFileRoute("/tasks")({
  component: TasksPage,
});

const STATUS_ORDER: Record<string, number> = { todo: 0, in_progress: 1, waiting: 2, done: 3 };

const STATUS_ICON: Record<string, typeof Circle> = {
  todo: Circle,
  in_progress: CircleDot,
  waiting: Pause,
  done: CircleCheck,
};

const PRIORITY_VARIANT: Record<string, "danger" | "warning" | "primary" | "default"> = {
  urgent: "danger",
  high: "warning",
  medium: "primary",
  low: "default",
};

const TEMPLATE_NAMES = [
  { value: "pre_sale", label: "Pre-sale checklist" },
  { value: "sell_documents", label: "Sell documents" },
  { value: "buy_due_diligence", label: "Buy due diligence" },
  { value: "offer_preparation", label: "Offer preparation" },
  { value: "open_home_visit", label: "Open home visit" },
];

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === "done") return false;
  return new Date(task.due_date) < new Date(new Date().toDateString());
}

function isDueToday(task: Task): boolean {
  if (!task.due_date || task.status === "done") return false;
  return new Date(task.due_date).toDateString() === new Date().toDateString();
}

function isDueThisWeek(task: Task): boolean {
  if (!task.due_date || task.status === "done") return false;
  const d = new Date(task.due_date);
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + (7 - now.getDay()));
  return d >= now && d <= weekEnd;
}

function TasksPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("tasks");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [sortBy, setSortBy] = useState<"due_date" | "priority">("due_date");

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => apiGet<ListResponse<Task>>("/tasks"),
  });

  const checklistsQuery = useQuery({
    queryKey: ["checklists", "all"],
    queryFn: () => apiGet<ListResponse<ChecklistItem>>("/checklists"),
  });

  const projectsQuery = useList<Project>("projects", "/projects");

  const tasks = tasksQuery.data?.data ?? [];
  const checklists = checklistsQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];

  const createTask = useCreate<Task>("tasks", "/tasks");
  const updateTask = useUpdate<Task>("tasks", "/tasks");
  const removeTask = useRemove("tasks", "/tasks");
  const updateChecklist = useUpdate<ChecklistItem>("checklists", "/checklists");
  const createChecklist = useCreate<ChecklistItem>("checklists", "/checklists");

  const generateFromTemplate = useMutation({
    mutationFn: (body: { template: string; project_id?: string }) =>
      apiPost<{ data: Task[] }>("/tasks/from-template", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const appliedTemplates = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) {
      if (t.template_source) s.add(t.template_source);
    }
    return s;
  }, [tasks]);

  const loading = tasksQuery.isLoading || checklistsQuery.isLoading || projectsQuery.isLoading;
  const hasError = tasksQuery.isError || checklistsQuery.isError;

  const overdueTasks = useMemo(() => tasks.filter(isOverdue), [tasks]);
  const todayTasks = useMemo(() => tasks.filter(isDueToday), [tasks]);
  const weekTasks = useMemo(() => tasks.filter(isDueThisWeek), [tasks]);

  const tabDefs = [
    { id: "tasks", label: "All Tasks", count: tasks.length },
    { id: "checklists", label: "Checklists", count: checklists.length },
    { id: "templates", label: "Templates" },
  ];

  if (loading) {
    return (
      <PageShell title="Tasks">
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm">Loading tasks…</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Tasks">
      <div className="space-y-5 pb-4">
        {hasError && (
          <ErrorBanner text="Some task data failed to load. Try refreshing." />
        )}

        {(overdueTasks.length > 0 || todayTasks.length > 0 || weekTasks.length > 0) && (
          <RemindersCard overdue={overdueTasks} today={todayTasks} week={weekTasks} />
        )}

        <Tabs tabs={tabDefs} active={tab} onChange={setTab} />

        {tab === "tasks" && (
          <AllTasksTab
            tasks={tasks}
            projects={projects}
            filterProject={filterProject}
            setFilterProject={setFilterProject}
            filterPriority={filterPriority}
            setFilterPriority={setFilterPriority}
            filterOverdue={filterOverdue}
            setFilterOverdue={setFilterOverdue}
            sortBy={sortBy}
            setSortBy={setSortBy}
            onAdd={() => {
              setEditingTaskId(null);
              setTaskModalOpen(true);
            }}
            onEdit={(id) => {
              setEditingTaskId(id);
              setTaskModalOpen(true);
            }}
            onCycleStatus={(task) => {
              const statuses = TASK_STATUSES as readonly string[];
              const idx = statuses.indexOf(task.status);
              const next = statuses[(idx + 1) % statuses.length];
              updateTask.mutate({ id: task.id, data: { status: next } });
            }}
            onDelete={(id) => removeTask.mutate(id)}
            deletePending={removeTask.isPending}
          />
        )}

        {tab === "checklists" && (
          <ChecklistsTab
            checklists={checklists}
            onChangeState={(id, state) => updateChecklist.mutate({ id, data: { state } })}
            onAddItem={(type, projectId) =>
              createChecklist.mutate({
                checklist_type: type,
                project_id: projectId,
                label: "",
                state: "not_started",
                sort_order: 0,
              })
            }
          />
        )}

        {tab === "templates" && (
          <TemplatesTab
            projects={projects}
            appliedTemplates={appliedTemplates}
            generating={generateFromTemplate.isPending}
            onGenerate={(template, projectId) =>
              generateFromTemplate.mutate({ template, project_id: projectId || undefined })
            }
          />
        )}
      </div>

      <TaskModal
        key={editingTaskId ?? "new-task"}
        open={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false);
          setEditingTaskId(null);
        }}
        projects={projects}
        existing={editingTaskId ? tasks.find((t) => t.id === editingTaskId) : undefined}
        onSubmit={(payload) => {
          if (editingTaskId) {
            updateTask.mutate(
              { id: editingTaskId, data: payload },
              {
                onSuccess: () => {
                  setTaskModalOpen(false);
                  setEditingTaskId(null);
                },
              }
            );
          } else {
            createTask.mutate(payload, {
              onSuccess: () => setTaskModalOpen(false),
            });
          }
        }}
        submitting={createTask.isPending || updateTask.isPending}
      />
    </PageShell>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

function RemindersCard({
  overdue,
  today,
  week,
}: {
  overdue: Task[];
  today: Task[];
  week: Task[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-500" />
          Reminders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {overdue.length > 0 && (
          <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
            <p className="font-semibold text-red-800 mb-1">
              <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
              Overdue ({overdue.length})
            </p>
            <ul className="space-y-1">
              {overdue.slice(0, 5).map((t) => (
                <li key={t.id} className="text-red-700 truncate">
                  {t.title} — due {formatDate(t.due_date)}
                </li>
              ))}
              {overdue.length > 5 && (
                <li className="text-red-600 text-xs">+{overdue.length - 5} more</li>
              )}
            </ul>
          </div>
        )}
        {today.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
            <p className="font-semibold text-amber-800 mb-1">Due today ({today.length})</p>
            <ul className="space-y-1">
              {today.map((t) => (
                <li key={t.id} className="text-amber-700 truncate">{t.title}</li>
              ))}
            </ul>
          </div>
        )}
        {week.length > 0 && (
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
            <p className="font-semibold text-blue-800 mb-1">Due this week ({week.length})</p>
            <ul className="space-y-1">
              {week.slice(0, 5).map((t) => (
                <li key={t.id} className="text-blue-700 truncate">
                  {t.title} — {formatDate(t.due_date)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AllTasksTab({
  tasks,
  projects,
  filterProject,
  setFilterProject,
  filterPriority,
  setFilterPriority,
  filterOverdue,
  setFilterOverdue,
  sortBy,
  setSortBy,
  onAdd,
  onEdit,
  onCycleStatus,
  onDelete,
  deletePending,
}: {
  tasks: Task[];
  projects: Project[];
  filterProject: string;
  setFilterProject: (v: string) => void;
  filterPriority: string;
  setFilterPriority: (v: string) => void;
  filterOverdue: boolean;
  setFilterOverdue: (v: boolean) => void;
  sortBy: "due_date" | "priority";
  setSortBy: (v: "due_date" | "priority") => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onCycleStatus: (task: Task) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}) {
  const filtered = useMemo(() => {
    let result = [...tasks];
    if (filterProject) result = result.filter((t) => t.project_id === filterProject);
    if (filterPriority) result = result.filter((t) => t.priority === filterPriority);
    if (filterOverdue) result = result.filter(isOverdue);

    if (sortBy === "due_date") {
      result.sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
    } else {
      const pOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      result.sort((a, b) => (pOrder[a.priority] ?? 9) - (pOrder[b.priority] ?? 9));
    }
    return result;
  }, [tasks, filterProject, filterPriority, filterOverdue, sortBy]);

  const grouped = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const status of TASK_STATUSES) groups[status] = [];
    for (const t of filtered) {
      if (groups[t.status]) groups[t.status].push(t);
      else groups[t.status] = [t];
    }
    return groups;
  }, [filtered]);

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800">All tasks</h2>
        <Button size="md" className="min-h-11 shrink-0" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add task
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Select
          label="Project"
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          options={projectOptions}
          placeholder="All projects"
        />
        <Select
          label="Priority"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          options={TASK_PRIORITIES.map((p) => ({ value: p, label: capitalize(p) }))}
          placeholder="All"
        />
        <Select
          label="Sort by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "due_date" | "priority")}
          options={[
            { value: "due_date", label: "Due date" },
            { value: "priority", label: "Priority" },
          ]}
        />
        <div className="flex items-end">
          <Button
            variant={filterOverdue ? "primary" : "outline"}
            className="w-full min-h-11"
            onClick={() => setFilterOverdue(!filterOverdue)}
          >
            <AlertTriangle className="h-4 w-4" />
            Overdue
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<CheckSquare className="h-9 w-9" />}
              title="No tasks"
              description="Create a task or generate from a template to get started."
            />
          </CardContent>
        </Card>
      ) : (
        (TASK_STATUSES as readonly string[]).map((status) => {
          const group = grouped[status] ?? [];
          if (group.length === 0) return null;
          return (
            <div key={status} className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <StatusBadge status={status} />
                {capitalize(status)} ({group.length})
              </h3>
              <div className="space-y-2">
                {group.map((task) => {
                  const overdue = isOverdue(task);
                  const project = projects.find((p) => p.id === task.project_id);
                  return (
                    <Card key={task.id} className={overdue ? "border-red-200" : ""}>
                      <CardContent className="pt-3 pb-3 space-y-2">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => onCycleStatus(task)}
                            className="mt-0.5 p-1 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0 min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center"
                            aria-label="Cycle status"
                          >
                            {(() => {
                              const Icon = STATUS_ICON[task.status] ?? Circle;
                              return <Icon className="h-5 w-5" />;
                            })()}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium text-slate-900 ${task.status === "done" ? "line-through text-slate-400" : ""}`}>
                              {task.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {task.due_date && (
                                <span className={`text-xs ${overdue ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                                  {overdue ? "Overdue: " : "Due: "}
                                  {formatDate(task.due_date)}
                                </span>
                              )}
                              <Badge variant={PRIORITY_VARIANT[task.priority] ?? "default"}>
                                {capitalize(task.priority)}
                              </Badge>
                              {project && (
                                <span className="text-xs text-slate-500">{project.name}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="sm" className="min-h-10" onClick={() => onEdit(task.id)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ChecklistsTab({
  checklists,
  onChangeState,
  onAddItem,
}: {
  checklists: ChecklistItem[];
  onChangeState: (id: string, state: string) => void;
  onAddItem: (type: string, projectId?: string) => void;
}) {
  const grouped = useMemo(() => {
    const groups: Record<string, ChecklistItem[]> = {};
    for (const item of checklists) {
      if (!groups[item.checklist_type]) groups[item.checklist_type] = [];
      groups[item.checklist_type].push(item);
    }
    return groups;
  }, [checklists]);

  const types = Object.keys(grouped);

  const checklistStateOptions = CHECKLIST_STATES.map((s) => ({
    value: s,
    label: capitalize(s),
  }));

  const stateIndicator: Record<string, string> = {
    not_started: "bg-slate-300",
    in_progress: "bg-blue-500",
    complete: "bg-emerald-500",
    waiting_on_third_party: "bg-amber-500",
  };

  if (checklists.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            icon={<ListChecks className="h-9 w-9" />}
            title="No checklist items"
            description="Checklist items are created from templates or added on the Sell / Buy pages."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {types.map((type) => {
        const items = grouped[type];
        const completed = items.filter((i) => i.state === "complete").length;
        const pct = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;

        return (
          <Card key={type}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-slate-500" />
                {capitalize(type)}
              </CardTitle>
              <span className="text-xs text-slate-500 tabular-nums">
                {completed}/{items.length} · {pct}%
              </span>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3"
                >
                  <button
                    type="button"
                    onClick={() => {
                      const states = CHECKLIST_STATES as readonly string[];
                      const idx = states.indexOf(item.state);
                      const next = states[(idx + 1) % states.length];
                      onChangeState(item.id, next);
                    }}
                    className="shrink-0 min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center"
                    aria-label="Cycle state"
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full ${stateIndicator[item.state] ?? "bg-slate-300"}`} />
                  </button>
                  <p className={`text-sm font-medium flex-1 ${item.state === "complete" ? "line-through text-slate-400" : "text-slate-900"}`}>
                    {item.label || "(untitled)"}
                  </p>
                  <span className="text-xs text-slate-500">{capitalize(item.state)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TemplatesTab({
  projects,
  appliedTemplates,
  generating,
  onGenerate,
}: {
  projects: Project[];
  appliedTemplates: Set<string>;
  generating: boolean;
  onGenerate: (template: string, projectId: string) => void;
}) {
  const [selectedProject, setSelectedProject] = useState(projects[0]?.id ?? "");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-slate-500" />
            Generate tasks from template
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {projects.length > 1 && (
            <Select
              label="Target project"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
          <div className="space-y-2">
            {TEMPLATE_NAMES.map((t) => {
              const applied = appliedTemplates.has(t.value);
              return (
                <div
                  key={t.value}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{t.label}</p>
                    {applied && (
                      <p className="text-xs text-emerald-600 mt-0.5">Already applied</p>
                    )}
                  </div>
                  <Button
                    variant={applied ? "outline" : "secondary"}
                    className="min-h-11 shrink-0"
                    disabled={generating}
                    onClick={() => onGenerate(t.value, selectedProject)}
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : applied ? (
                      "Re-apply"
                    ) : (
                      "Generate"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TaskModal({
  open,
  onClose,
  projects,
  existing,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  existing: Task | undefined;
  onSubmit: (data: Record<string, unknown>) => void;
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
      setDueDate(existing.due_date?.slice(0, 10) ?? "");
      setPriority(existing.priority);
      setStatus(existing.status);
      setProjectId(existing.project_id ?? "");
    } else {
      setTitle("");
      setDescription("");
      setDueDate("");
      setPriority("medium");
      setStatus("todo");
      setProjectId(projects[0]?.id ?? "");
    }
  }, [open, existing?.id, projects]);

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit task" : "New task"}>
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
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <Input type="date" label="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: capitalize(p) }))}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={TASK_STATUSES.map((s) => ({ value: s, label: capitalize(s) }))}
          />
        </div>
        {projects.length > 0 && (
          <Select
            label="Project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="None"
          />
        )}
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting || !title.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
