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
} from "lucide-react";
import type { AgentRun, Project, Property } from "@hcc/shared";
import { AGENT_WORKFLOW_TYPES } from "@hcc/shared";
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

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-600" },
  failed: { icon: XCircle, color: "text-red-600" },
  running: { icon: Loader2, color: "text-blue-600" },
  pending: { icon: Clock, color: "text-slate-500" },
};

function AssistantPage() {
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [inputText, setInputText] = useState("");
  const [workflowType, setWorkflowType] = useState<string>("qa");
  const [scopeProjectId, setScopeProjectId] = useState("");
  const [scopePropertyId, setScopePropertyId] = useState("");

  const runsQuery = useQuery({
    queryKey: ["assistant-runs"],
    queryFn: () => apiGet<ListResponse<AgentRun>>("/assistant/runs"),
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

  const submitRun = useMutation({
    mutationFn: (body: {
      workflow_type: string;
      input_summary: string;
      project_id?: string;
      property_id?: string;
    }) => apiPost<{ data: AgentRun }>("/assistant/run", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assistant-runs"] });
      setInputText("");
    },
  });

  const loading = runsQuery.isLoading || projectsQuery.isLoading;
  const hasError = runsQuery.isError;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedRuns.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    submitRun.mutate({
      workflow_type: workflowType,
      input_summary: inputText.trim(),
      project_id: scopeProjectId || undefined,
      property_id: scopePropertyId || undefined,
    });
  };

  if (loading) {
    return (
      <PageShell title="Assistant">
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
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
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
              <Sparkles className="h-10 w-10 text-primary-300" />
              <p className="text-sm font-medium text-slate-600">How can I help?</p>
              <p className="text-xs text-slate-400 text-center max-w-xs">
                Ask a question, summarise a document, compare properties, or get recommendations for your next steps.
              </p>
            </div>
          ) : (
            [...sortedRuns].reverse().map((run) => (
              <RunMessage key={run.id} run={run} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-slate-200 bg-white pt-3 pb-2 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Select
              label="Workflow"
              value={workflowType}
              onChange={(e) => setWorkflowType(e.target.value)}
              options={workflowOptions}
            />
            {projects.length > 0 && (
              <Select
                label="Project"
                value={scopeProjectId}
                onChange={(e) => setScopeProjectId(e.target.value)}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                placeholder="Any"
              />
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask something…"
                className="w-full rounded-lg border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                disabled={submitRun.isPending}
              />
            </div>
            <Button
              type="submit"
              className="min-h-12 min-w-12 shrink-0"
              disabled={submitRun.isPending || !inputText.trim()}
            >
              {submitRun.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </PageShell>
  );
}

function RunMessage({ run }: { run: AgentRun }) {
  const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;
  const isRunning = run.status === "running";

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary-600 px-4 py-3 text-sm text-white">
          <p className="text-xs text-primary-200 mb-1 flex items-center gap-1.5">
            <User className="h-3 w-3" />
            {WORKFLOW_LABELS[run.workflow_type] ?? capitalize(run.workflow_type)}
          </p>
          <p>{run.input_summary}</p>
        </div>
      </div>

      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm text-slate-900">
          <p className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
            <Bot className="h-3 w-3" />
            Assistant
            <span className={`flex items-center gap-1 ${cfg.color}`}>
              <StatusIcon className={`h-3 w-3 ${isRunning ? "animate-spin" : ""}`} />
              {capitalize(run.status)}
            </span>
          </p>

          {isRunning ? (
            <p className="text-slate-500 italic">Thinking…</p>
          ) : run.output_summary ? (
            <p className="whitespace-pre-wrap">{run.output_summary}</p>
          ) : run.status === "failed" ? (
            <p className="text-red-700">Something went wrong. Please try again.</p>
          ) : (
            <p className="text-slate-400 italic">No output yet.</p>
          )}

          <p className="text-xs text-slate-400 mt-2">
            {formatDate(run.completed_at ?? run.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 mb-3">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}
