import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  AlertCircle,
  Send,
  Bot,
  User,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCw,
  Camera,
  X,
  ImageIcon,
  Globe,
  ChevronDown,
  Cpu,
  Settings2,
  MessageSquarePlus,
  MessageSquareDot,
  Pencil,
  Trash2,
  Download,
  Files,
  FileText,
} from "lucide-react";
import type { AgentRun, Project, Property, AssistantTool, ContextMessage } from "@hcc/shared";
import {
  AGENT_WORKFLOW_TYPES,
  OPENAI_MODELS,
  OPENAI_MODEL_LABELS,
  ASSISTANT_TOOLS,
  ASSISTANT_TOOL_LABELS,
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
import { CameraCapture } from "@/components/features/camera-capture";
import {
  useList,
  useCreate,
  useUpdate,
  useRemove,
} from "@/hooks/use-query-helpers";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { formatCurrency, formatDate, formatPercent, capitalize } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type ListResponse<T> = { data: T[]; total: number };

export const Route = createFileRoute("/assistant")({
  component: AssistantPage,
});

const WORKFLOW_LABELS: Record<string, string> = {
  summarise_document: "Summarise document",
  extract_key_points: "Extract key points",
  suggest_follow_up_questions: "Suggest follow-up questions",
  clean_up_notes: "Clean up notes",
  compare_properties: "Compare properties",
  explain_scenario: "Explain scenario",
  identify_missing_info: "Identify missing info",
  recommend_next_actions: "Recommend next actions",
  project_state_summary: "Project state summary",
  semantic_search: "Semantic search",
  qa: "Q&A",
};

const workflowOptions = AGENT_WORKFLOW_TYPES.map((t) => ({
  value: t,
  label: WORKFLOW_LABELS[t] ?? capitalize(t),
}));

const modelOptions = OPENAI_MODELS.map((m) => ({
  value: m,
  label: OPENAI_MODEL_LABELS[m],
}));

const TOOL_ICONS: Record<string, typeof Globe> = {
  web_search: Globe,
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" },
  failed: { icon: XCircle, color: "text-red-600 dark:text-red-400" },
  running: { icon: Loader2, color: "text-blue-600" },
  pending: { icon: Clock, color: "text-slate-500 dark:text-slate-400" },
};

function AssistantPage() {
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [inputText, setInputText] = useState("");
  const [workflowType, setWorkflowType] = useState<string>("qa");
  const [selectedModel, setSelectedModel] = useState<string>("gpt-5-mini");
  const [enabledTools, setEnabledTools] = useState<AssistantTool[]>([]);
  const [scopeProjectId, setScopeProjectId] = useState("");
  const [scopePropertyId, setScopePropertyId] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());

  const prevRunsRef = useRef<Map<string, string>>(new Map());

  const toggleRunSelection = (runId: string) => {
    setSelectedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const clearRunSelection = () => setSelectedRunIds(new Set());

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showFeedback = (message: string, type: "success" | "error" = "success") => {
    setActionFeedback({ message, type });
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const handleEdit = (runId: string) => {
    const chronological = [...sortedRuns].reverse();
    const targetIdx = chronological.findIndex((r) => r.id === runId);
    if (targetIdx < 0) return;
    const ancestors = chronological.slice(0, targetIdx);
    const target = chronological[targetIdx];
    const ancestorIds = new Set(
      ancestors.filter((r) => r.status === "completed").map((r) => r.id)
    );
    setSelectedRunIds(ancestorIds);
    setInputText(target.input_summary);
    setWorkflowType(target.workflow_type);
  };

  const deleteMutation = useMutation({
    mutationFn: (runId: string) =>
      apiDelete(`/assistant/runs/${runId}/cascade`),
    onSuccess: (_data, runId) => {
      setConfirmDeleteId(null);
      setSelectedRunIds((prev) => {
        const next = new Set(prev);
        next.delete(runId);
        return next;
      });
      qc.invalidateQueries({ queryKey: ["assistant-runs"] });
      showFeedback("Messages deleted");
    },
    onError: () => {
      setConfirmDeleteId(null);
      showFeedback("Failed to delete messages", "error");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (runId: string) =>
      apiPost<{ data: any; title: string }>(`/assistant/runs/${runId}/save`, {}),
    onSuccess: (result) => {
      showFeedback(`Saved to Library: "${result.title}"`);
    },
    onError: () => {
      showFeedback("Failed to save to Library", "error");
    },
  });

  const saveSelectedMutation = useMutation({
    mutationFn: (runIds: string[]) =>
      apiPost<{ data: any; title: string }>("/assistant/runs/save-selected", {
        run_ids: runIds,
      }),
    onSuccess: (result) => {
      showFeedback(`Saved to Library: "${result.title}"`);
    },
    onError: () => {
      showFeedback("Failed to save to Library", "error");
    },
  });

  const handleSaveSelected = (anchorRunId: string) => {
    const ids = selectedRunIds.size > 0
      ? [...selectedRunIds]
      : [anchorRunId];
    saveSelectedMutation.mutate(ids);
  };

  const toggleTool = (tool: AssistantTool) => {
    setEnabledTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  const runsQuery = useQuery({
    queryKey: ["assistant-runs"],
    queryFn: async () => {
      const result = await apiGet<ListResponse<AgentRun>>("/assistant/runs");
      const prev = prevRunsRef.current;
      for (const run of result.data) {
        const prevStatus = prev.get(run.id);
        if (prevStatus && prevStatus !== run.status) {
          console.group(`[Assistant] Run ${run.id.slice(0, 8)}… status changed`);
          console.log(`${prevStatus} → ${run.status}`);
          if (run.output_summary) {
            try {
              console.log("Output:", JSON.parse(run.output_summary));
            } catch {
              console.log("Output (raw):", run.output_summary);
            }
          }
          console.groupEnd();
        }
        prev.set(run.id, run.status);
      }
      return result;
    },
    refetchInterval: (query) => {
      const runs = query.state.data?.data ?? [];
      return runs.some((r) => r.status === "running") ? 3000 : false;
    },
  });

  const projectsQuery = useList<Project>("projects", "/projects");

  const runs = runsQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];

  const sortedRuns = useMemo(
    () =>
      [...runs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [runs]
  );

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const submitRun = useMutation({
    mutationFn: async (body: {
      workflow_type: string;
      input: string;
      model?: string;
      tools?: AssistantTool[];
      context_messages?: ContextMessage[];
      project_id?: string;
      property_id?: string;
      imageFile?: File | null;
    }) => {
      const { imageFile, ...rest } = body;
      let image_base64: string | undefined;
      if (imageFile) {
        image_base64 = await fileToBase64(imageFile);
      }
      return apiPost<{ data: AgentRun }>("/assistant/run", {
        ...rest,
        image_base64,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assistant-runs"] });
      setInputText("");
      clearAttachedImage();
      clearRunSelection();
    },
  });

  const loading = runsQuery.isLoading || projectsQuery.isLoading;
  const hasError = runsQuery.isError;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedRuns.length]);

  const handleCameraCapture = (file: File) => {
    setCameraOpen(false);
    setAttachedImage(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    setWorkflowType("qa");
  };

  const clearAttachedImage = () => {
    setAttachedImage(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  };

  const buildContextMessages = (): ContextMessage[] => {
    if (selectedRunIds.size === 0) return [];
    const chronological = [...sortedRuns].reverse();
    const messages: ContextMessage[] = [];
    for (const run of chronological) {
      if (!selectedRunIds.has(run.id)) continue;
      messages.push({ role: "user", content: run.input_summary });
      if (run.output_summary && run.status === "completed") {
        try {
          const parsed = JSON.parse(run.output_summary);
          const answer =
            parsed.answer ?? parsed.summary ?? parsed.cleaned ?? parsed.explanation ?? run.output_summary;
          messages.push({ role: "assistant", content: answer });
        } catch {
          messages.push({ role: "assistant", content: run.output_summary });
        }
      }
    }
    return messages;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !attachedImage) return;
    submitRun.mutate({
      workflow_type: workflowType,
      input: inputText.trim() || (attachedImage ? "Analyse this image" : ""),
      model: selectedModel,
      tools: enabledTools,
      context_messages: buildContextMessages(),
      project_id: scopeProjectId || undefined,
      property_id: scopePropertyId || undefined,
      imageFile: attachedImage,
    });
  };

  if (loading) {
    return (
      <PageShell title="Assistant">
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
          <p className="text-sm">Loading assistant…</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Assistant">
      <div className="flex flex-col h-[calc(100dvh-10rem)] min-h-0">
        {hasError && (
          <ErrorBanner text="Could not load assistant data. Try refreshing." />
        )}

        <div className="flex-1 overflow-y-auto space-y-3 pb-4">
          {sortedRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500 dark:text-slate-400">
              <Sparkles className="h-10 w-10 text-primary-300" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">How can I help?</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-xs">
                Ask a question, summarise a document, compare properties, or get recommendations for your next steps.
              </p>
            </div>
          ) : (
            (() => {
              const chronological = [...sortedRuns].reverse();
              const latestId = sortedRuns[0]?.id;
              const hasSelections = selectedRunIds.size > 0;
              return chronological.map((run) => {
                const isLatest = run.id === latestId;
                const isRunning = run.status === "running";
                const isSelected = selectedRunIds.has(run.id);
                const isGreyedOut = hasSelections && !isSelected && !isLatest && !isRunning;
                return (
                  <RunMessage
                    key={run.id}
                    run={run}
                    isSelected={isSelected}
                    isGreyedOut={isGreyedOut}
                    onToggleSelect={() => toggleRunSelection(run.id)}
                    onEdit={() => handleEdit(run.id)}
                    onDelete={() => setConfirmDeleteId(run.id)}
                    onSaveAll={() => saveMutation.mutate(run.id)}
                    onSaveSelected={() => handleSaveSelected(run.id)}
                    isSavingAll={saveMutation.isPending && saveMutation.variables === run.id}
                    isSavingSelected={saveSelectedMutation.isPending}
                  />
                );
              });
            })()
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pt-3 pb-2 space-y-2">
          {selectedRunIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                <MessageSquareDot className="h-3.5 w-3.5" />
                {selectedRunIds.size} {selectedRunIds.size === 1 ? "message" : "messages"} as context
              </span>
              <button
                type="button"
                onClick={clearRunSelection}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <PromptOption
              icon={Cpu}
              label={OPENAI_MODEL_LABELS[selectedModel as keyof typeof OPENAI_MODEL_LABELS] ?? selectedModel}
              items={modelOptions}
              value={selectedModel}
              onChange={setSelectedModel}
            />
            <PromptOption
              label={WORKFLOW_LABELS[workflowType] ?? capitalize(workflowType)}
              items={workflowOptions}
              value={workflowType}
              onChange={setWorkflowType}
            />
            {projects.length > 0 && (
              <PromptOption
                label={
                  scopeProjectId
                    ? projects.find((p) => p.id === scopeProjectId)?.name ?? "Project"
                    : "All projects"
                }
                items={[
                  { value: "", label: "All projects" },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={scopeProjectId}
                onChange={setScopeProjectId}
              />
            )}

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

            {ASSISTANT_TOOLS.map((tool) => {
              const ToolIcon = TOOL_ICONS[tool] ?? Globe;
              const active = enabledTools.includes(tool);
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => toggleTool(tool)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                  title={ASSISTANT_TOOL_LABELS[tool]}
                >
                  <ToolIcon className="h-3.5 w-3.5" />
                  {ASSISTANT_TOOL_LABELS[tool]}
                </button>
              );
            })}
          </div>

          {imagePreview && (
            <div className="relative inline-block">
              <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 inline-block">
                <img
                  src={imagePreview}
                  alt="Attached"
                  className="h-20 w-auto object-cover"
                />
              </div>
              <button
                type="button"
                onClick={clearAttachedImage}
                className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2">
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="min-h-12 min-w-12 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              aria-label="Attach photo"
              disabled={submitRun.isPending}
            >
              <Camera className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={attachedImage ? "Ask about this image…" : "Ask something…"}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-3 px-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                disabled={submitRun.isPending}
              />
            </div>
            <Button
              type="submit"
              className="min-h-12 min-w-12 shrink-0"
              disabled={submitRun.isPending || (!inputText.trim() && !attachedImage)}
            >
              {submitRun.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>

          <CameraCapture
            open={cameraOpen}
            onCapture={handleCameraCapture}
            onClose={() => setCameraOpen(false)}
            title="Attach photo"
          />
        </div>
      </div>

      {actionFeedback && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg transition-all ${
            actionFeedback.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {actionFeedback.message}
        </div>
      )}

      <Modal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete messages"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          This will permanently delete this message and all subsequent messages. This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            onClick={() => setConfirmDeleteId(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={deleteMutation.isPending}
            onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
          >
            {deleteMutation.isPending ? (
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

function PromptOption({
  icon: Icon,
  label,
  items,
  value,
  onChange,
}: {
  icon?: typeof Cpu;
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 pl-3 pr-7 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30"
      >
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
    </div>
  );
}

function RunActionButton({
  icon: Icon,
  title,
  onClick,
  loading,
  badge: Badge,
}: {
  icon: typeof Pencil;
  title: string;
  onClick: () => void;
  loading?: boolean;
  badge?: typeof Files;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="relative rounded-full p-1 text-slate-400 dark:text-slate-500 transition-colors hover:text-[rgb(255,69,0)] hover:bg-[rgba(255,69,0,0.12)] active:bg-[rgba(255,69,0,0.2)]"
      title={title}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <>
          <Icon className="h-3 w-3" />
          {Badge && (
            <Badge className="absolute -top-0.5 -right-0.5 h-2 w-2" />
          )}
        </>
      )}
    </button>
  );
}

function RunMessage({
  run,
  isSelected,
  isGreyedOut,
  onToggleSelect,
  onEdit,
  onDelete,
  onSaveAll,
  onSaveSelected,
  isSavingAll,
  isSavingSelected,
}: {
  run: AgentRun;
  isSelected: boolean;
  isGreyedOut: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveAll: () => void;
  onSaveSelected: () => void;
  isSavingAll: boolean;
  isSavingSelected: boolean;
}) {
  const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;
  const isRunning = run.status === "running";
  const isCompleted = run.status === "completed";
  const modelLabel = run.model
    ? OPENAI_MODEL_LABELS[run.model as keyof typeof OPENAI_MODEL_LABELS] ?? run.model
    : null;
  const runTools = run.tools ?? [];

  const SelectIcon = isSelected ? MessageSquareDot : MessageSquarePlus;

  return (
    <div
      className={`space-y-2 transition-opacity duration-200 ${
        isGreyedOut ? "opacity-35" : ""
      } ${isSelected ? "relative" : ""}`}
    >
      {isSelected && (
        <div className="absolute -left-1 top-0 bottom-0 w-0.5 rounded-full bg-amber-400 dark:bg-amber-500" />
      )}

      <div className="flex justify-end gap-1.5 items-start">
        {isCompleted && (
          <div className="flex flex-col items-center gap-0.5 mt-2 shrink-0">
            <button
              type="button"
              onClick={onToggleSelect}
              className={`rounded-full p-1 transition-colors ${
                isSelected
                  ? "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40"
                  : "text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              title={isSelected ? "Remove from context" : "Include as context"}
            >
              <SelectIcon className="h-3.5 w-3.5" />
            </button>
            <RunActionButton icon={Pencil} title="Edit from here" onClick={onEdit} />
          </div>
        )}
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary-600 px-4 py-3 text-sm text-white">
          <p className="text-xs text-primary-200 dark:text-primary-300 mb-1 flex items-center gap-1.5">
            <User className="h-3 w-3" />
            {WORKFLOW_LABELS[run.workflow_type] ?? capitalize(run.workflow_type)}
          </p>
          <p>{run.input_summary}</p>
        </div>
      </div>

      <div className="flex justify-start gap-1.5 items-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5 flex-wrap">
            <Bot className="h-3 w-3" />
            Assistant
            <span className={`flex items-center gap-1 ${cfg.color}`}>
              <StatusIcon className={`h-3 w-3 ${isRunning ? "animate-spin" : ""}`} />
              {capitalize(run.status)}
            </span>
            {modelLabel && (
              <span className="inline-flex items-center gap-1 bg-slate-200/70 dark:bg-slate-700/70 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                <Cpu className="h-2.5 w-2.5" />
                {modelLabel}
              </span>
            )}
            {runTools.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center gap-1 bg-primary-100/60 dark:bg-primary-900/30 rounded px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:text-primary-400"
              >
                <Globe className="h-2.5 w-2.5" />
                {ASSISTANT_TOOL_LABELS[tool as keyof typeof ASSISTANT_TOOL_LABELS] ?? tool}
              </span>
            ))}
          </p>

          {isRunning ? (
            <p className="text-slate-500 dark:text-slate-400 italic">Thinking…</p>
          ) : run.output_summary ? (
            <FormattedOutput raw={run.output_summary} />
          ) : run.status === "failed" ? (
            <p className="text-red-700 dark:text-red-300">Something went wrong. Please try again.</p>
          ) : (
            <p className="text-slate-400 dark:text-slate-500 italic">No output yet.</p>
          )}

          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            {formatDate(run.completed_at ?? run.created_at)}
          </p>
        </div>
        {isCompleted && (
          <div className="flex flex-col items-center gap-0.5 mt-2 shrink-0">
            <RunActionButton icon={Trash2} title="Delete from here" onClick={onDelete} />
            <RunActionButton icon={Download} badge={Files} title="Save entire chat to Library" onClick={onSaveAll} loading={isSavingAll} />
            <RunActionButton icon={Download} badge={FileText} title="Save selected to Library" onClick={onSaveSelected} loading={isSavingSelected} />
          </div>
        )}
      </div>
    </div>
  );
}

function AnnotatedText({ text }: { text: string }) {
  const parts = text.split(/(\[General\]|\[Web\])/g);
  if (parts.length === 1) return <>{text}</>;

  type AnnotationType = "none" | "general" | "web";
  const segments: Array<{ text: string; type: AnnotationType }> = [];
  let currentType: AnnotationType = "none";
  for (const part of parts) {
    if (part === "[General]") {
      currentType = "general";
      continue;
    }
    if (part === "[Web]") {
      currentType = "web";
      continue;
    }
    if (part) {
      segments.push({ text: part, type: currentType });
      currentType = "none";
    }
  }

  const typeColors: Record<AnnotationType, string> = {
    none: "",
    general: "text-indigo-700 dark:text-indigo-300",
    web: "text-sky-700 dark:text-sky-300",
  };

  return (
    <>
      {segments.map((seg, i) =>
        seg.type !== "none" ? (
          <span key={i} className={typeColors[seg.type]}>{seg.text}</span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

function AnnotatedListItem({ text }: { text: string }) {
  const isGeneral = text.startsWith("[General]");
  const isWeb = text.startsWith("[Web]");
  const cleanText = text.replace(/^\[(General|Web)\]\s*/, "");
  return (
    <li className={isGeneral ? "text-indigo-700 dark:text-indigo-300" : isWeb ? "text-sky-700 dark:text-sky-300" : ""}>
      {isGeneral && (
        <span className="inline-block text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded px-1 py-0.5 mr-1.5 align-middle">
          General
        </span>
      )}
      {isWeb && (
        <span className="inline-block text-[10px] font-semibold bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 rounded px-1 py-0.5 mr-1.5 align-middle">
          Web
        </span>
      )}
      {cleanText}
    </li>
  );
}

function KnowledgeSourceBadges({
  sources,
  note,
}: {
  sources?: string[];
  note?: string;
}) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sources.includes("app_data") && (
        <span className="inline-block text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full px-2 py-0.5">
          Your data
        </span>
      )}
      {sources.includes("general_knowledge") && (
        <span className="inline-block text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-full px-2 py-0.5">
          General knowledge
        </span>
      )}
      {sources.includes("web_search") && (
        <span className="inline-block text-[10px] font-semibold bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded-full px-2 py-0.5">
          Web search
        </span>
      )}
      {note && (
        <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">{note}</span>
      )}
    </div>
  );
}

function FormattedOutput({ raw }: { raw: string }) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [raw]);

  if (!parsed || typeof parsed !== "object") {
    return <p className="whitespace-pre-wrap">{raw}</p>;
  }

  const mainText =
    parsed.answer ?? parsed.summary ?? parsed.cleaned ?? parsed.explanation ?? null;
  const confidence = parsed.confidence as string | undefined;
  const knowledgeSources = parsed.knowledge_sources as string[] | undefined;
  const generalNote = parsed.general_knowledge_note as string | undefined;

  const LIST_LABELS: Record<string, string> = {
    keyPoints: "Key points",
    key_points: "Key points",
    keyFacts: "Key facts",
    risks: "Risks",
    risksSummary: "Risks",
    actionItems: "Action items",
    action_items: "Action items",
    questions: "Questions",
    questionsForAgent: "Questions for agent",
    questionsForSolicitor: "Questions for solicitor",
    questionsForBroker: "Questions for broker",
    generalQuestions: "General questions",
    follow_up_questions: "Follow-up questions",
    missing: "Missing information",
    missing_items: "Missing information",
    missingDocuments: "Missing documents",
    missingInfo: "Missing information",
    unresolvedQuestions: "Unresolved questions",
    risksThatNeedClearing: "Risks to clear",
    recommendations: "Recommendations",
    next_actions: "Next actions",
    nextSteps: "Next steps",
    topActions: "Top actions",
    stalledItems: "Stalled items",
    upcomingDeadlines: "Upcoming deadlines",
    keyDecisionsPending: "Pending decisions",
    biggestCostDrivers: "Biggest cost drivers",
    warnings: "Warnings",
    suggestions: "Suggestions",
    tradeoffs: "Trade-offs",
    participants: "Participants",
    keyOutcomes: "Key outcomes",
    unansweredQuestions: "Unanswered questions",
    pros: "Pros",
    cons: "Cons",
    differences: "Differences",
    similarities: "Similarities",
  };

  const EXTRA_TEXT_FIELDS: Record<string, string> = {
    cleanSummary: "Summary",
    overallStatus: "Overall status",
    sellSummary: "Sale status",
    buySummary: "Purchase status",
    financialSummary: "Financial position",
    comparisonSummary: "Comparison",
    recommendation: "Recommendation",
    reasoning: "Reasoning",
    readinessScore: "Readiness",
  };

  const listSections: Array<{ label: string; items: string[] }> = [];
  for (const [key, label] of Object.entries(LIST_LABELS)) {
    const val = parsed[key];
    if (Array.isArray(val) && val.length > 0) {
      listSections.push({ label, items: val.map(String) });
    }
  }

  const extraText: Array<{ label: string; text: string }> = [];
  for (const [key, label] of Object.entries(EXTRA_TEXT_FIELDS)) {
    const val = parsed[key];
    if (typeof val === "string" && val.trim() && val !== mainText) {
      extraText.push({ label, text: val });
    }
  }

  const citations = parsed.citations as
    | Array<{ source_type?: string; source_id?: string; excerpt?: string }>
    | undefined;

  const results = parsed.results as
    | Array<{ source_type?: string; content_preview?: string; similarity?: number }>
    | undefined;

  const hasContent =
    mainText || extraText.length > 0 || listSections.length > 0 || citations?.length || results?.length;

  if (!hasContent) {
    return <p className="whitespace-pre-wrap">{raw}</p>;
  }

  return (
    <div className="space-y-3">
      {mainText && (
        <p className="whitespace-pre-wrap">
          <AnnotatedText text={mainText} />
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {confidence && (
          <span
            className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
              confidence === "high"
                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                : confidence === "medium"
                  ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200"
                  : "bg-slate-200 text-slate-600 dark:text-slate-400"
            }`}
          >
            {capitalize(confidence)} confidence
          </span>
        )}
        <KnowledgeSourceBadges sources={knowledgeSources} note={generalNote} />
      </div>

      {extraText.map((section) => (
        <div key={section.label}>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{section.label}</p>
          <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
            <AnnotatedText text={section.text} />
          </p>
        </div>
      ))}

      {listSections.map((section) => (
        <div key={section.label}>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{section.label}</p>
          <ul className="list-disc list-inside space-y-0.5 text-sm text-slate-800 dark:text-slate-200">
            {section.items.map((item, i) => (
              <AnnotatedListItem key={i} text={item} />
            ))}
          </ul>
        </div>
      ))}

      {citations && citations.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Sources (your data)</p>
          <ul className="space-y-1">
            {citations.map((c, i) => (
              <li key={i} className="text-xs text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-800/60 rounded px-2 py-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {c.source_type}/{c.source_id}
                </span>
                {c.excerpt && (
                  <span className="block text-slate-400 dark:text-slate-500 mt-0.5">"{c.excerpt}"</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {results && results.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Search results</p>
          <ul className="space-y-1.5">
            {results.map((r, i) => (
              <li key={i} className="text-xs bg-white/60 dark:bg-slate-800/60 rounded px-2 py-1.5">
                <span className="font-medium text-slate-700 dark:text-slate-300">{r.source_type}</span>
                {r.similarity != null && (
                  <span className="text-slate-400 dark:text-slate-500 ml-1">
                    ({Math.round(r.similarity * 100)}% match)
                  </span>
                )}
                {r.content_preview && (
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{r.content_preview}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200 mb-3">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}
