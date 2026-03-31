import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Loader2,
  AlertCircle,
  TrendingDown,
  Plus,
  Pencil,
  Home,
  Users,
  Calculator,
  ListChecks,
  FileText,
  GitCompare,
  CircleDot,
  Check,
} from "lucide-react";
import type {
  Project,
  Property,
  SellAgent,
  Offer,
  ChecklistItem,
  FinancialScenario,
} from "@hcc/shared";
import {
  SELL_MILESTONES,
  SALE_STRATEGIES,
  OFFER_CONDITIONS,
  OFFER_STATUSES,
  CHECKLIST_STATES,
  FILE_CATEGORIES,
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
  useDetail,
} from "@/hooks/use-query-helpers";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { formatCurrency, formatDate, formatPercent, capitalize } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type ListResponse<T> = { data: T[]; total: number };

export const Route = createFileRoute("/sell")({
  component: SellPage,
});

const strategyOptions = SALE_STRATEGIES.map((s) => ({
  value: s,
  label: capitalize(s),
}));

const offerStatusOptions = OFFER_STATUSES.map((s) => ({
  value: s,
  label: capitalize(s),
}));

const checklistStateOptions = CHECKLIST_STATES.map((s) => ({
  value: s,
  label: capitalize(s),
}));

const agentStatusOptions = ["shortlisted", "rejected", "selected"].map((s) => ({
  value: s,
  label: capitalize(s),
}));

const MILESTONE_LABEL: Record<string, string> = {
  planning: "Planning",
  listed: "Listed",
  open_homes_underway: "Open homes",
  offer_received: "Offer received",
  under_contract: "Under contract",
  unconditional: "Unconditional",
  settled: "Settled",
};

function milestoneProgress(
  milestone: string | undefined,
  order: readonly string[]
): number {
  if (!milestone) return 0;
  const idx = order.indexOf(milestone);
  if (idx < 0) return 0;
  return ((idx + 1) / order.length) * 100;
}

function SellPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [checklistModal, setChecklistModal] = useState<{
    type: "pre_sale" | "sell_documents" | "staging";
  } | null>(null);
  const [compareOfferIds, setCompareOfferIds] = useState<[string | null, string | null]>([
    null,
    null,
  ]);

  const projectsQuery = useList<Project>("projects", "/projects", { type: "sell" });
  const sellProject = projectsQuery.data?.data[0];

  const projectDetailQuery = useDetail<Project>("projects", "/projects", sellProject?.id);

  const sell = projectDetailQuery.data?.data ?? sellProject;

  const propertiesQuery = useQuery({
    queryKey: ["properties", sell?.id, "own"],
    queryFn: () =>
      apiGet<ListResponse<Property>>(
        `/properties?project_id=${encodeURIComponent(sell!.id)}`
      ),
    enabled: Boolean(sell?.id),
  });

  const ownProperty = useMemo(
    () => propertiesQuery.data?.data.find((p) => p.is_own_home) ?? null,
    [propertiesQuery.data]
  );

  const agentsQuery = useQuery({
    queryKey: ["sell-agents", sell?.id],
    queryFn: () =>
      apiGet<ListResponse<SellAgent>>(
        `/sell-agents?${new URLSearchParams({ project_id: sell!.id }).toString()}`
      ),
    enabled: Boolean(sell?.id),
  });

  const offersQuery = useQuery({
    queryKey: ["offers", sell?.id, "received"],
    queryFn: () =>
      apiGet<ListResponse<Offer>>(
        `/offers?${new URLSearchParams({ project_id: sell!.id, direction: "received" }).toString()}`
      ),
    enabled: Boolean(sell?.id),
  });

  const checklistsQuery = useQuery({
    queryKey: ["checklists", sell?.id],
    queryFn: () =>
      apiGet<ListResponse<ChecklistItem>>(
        `/checklists?project_id=${encodeURIComponent(sell!.id)}`
      ),
    enabled: Boolean(sell?.id),
  });

  const scenariosQuery = useQuery({
    queryKey: ["financial-scenarios", sell?.id],
    queryFn: () =>
      apiGet<ListResponse<FinancialScenario>>(
        `/financial-scenarios?${new URLSearchParams({ project_id: sell!.id }).toString()}`
      ),
    enabled: Boolean(sell?.id),
  });

  const agentDetailQuery = useDetail<SellAgent>(
    "sell-agents",
    "/sell-agents",
    agentModalOpen && editingAgentId ? editingAgentId : undefined
  );

  const editingAgentResolved = useMemo(() => {
    if (!editingAgentId) return null;
    return (
      agentsQuery.data?.data.find((a) => a.id === editingAgentId) ??
      agentDetailQuery.data?.data ??
      null
    );
  }, [editingAgentId, agentsQuery.data?.data, agentDetailQuery.data?.data]);

  const createProject = useCreate<Project>("projects", "/projects");
  const updateProject = useUpdate<Project>("projects", "/projects");
  const createProperty = useCreate<Property>("properties", "/properties");
  const updateProperty = useUpdate<Property>("properties", "/properties");
  const createAgent = useCreate<SellAgent>("sell-agents", "/sell-agents");
  const updateAgent = useUpdate<SellAgent>("sell-agents", "/sell-agents");
  const removeAgent = useRemove("sell-agents", "/sell-agents");
  const createOffer = useCreate<Offer>("offers", "/offers");
  const updateOffer = useUpdate<Offer>("offers", "/offers");
  const removeOffer = useRemove("offers", "/offers");
  const createChecklist = useCreate<ChecklistItem>("checklists", "/checklists");
  const updateChecklist = useUpdate<ChecklistItem>("checklists", "/checklists");
  const removeChecklist = useRemove("checklists", "/checklists");

  const scenarioRows = scenariosQuery.data?.data ?? [];
  const latestScenarioForSave = useMemo(() => {
    if (scenarioRows.length === 0) return null;
    return [...scenarioRows].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )[0];
  }, [scenarioRows]);

  const saveScenarioMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (latestScenarioForSave) {
        return apiPatch<{ data: FinancialScenario }>(
          `/financial-scenarios/${latestScenarioForSave.id}`,
          payload
        );
      }
      if (!sell?.id) throw new Error("No project");
      return apiPost<{ data: FinancialScenario }>("/financial-scenarios", {
        name: "Sell proceeds",
        project_id: sell.id,
        ...payload,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-scenarios"] });
    },
  });

  const loading =
    projectsQuery.isLoading ||
    (Boolean(sell?.id) &&
      (projectDetailQuery.isLoading ||
        propertiesQuery.isLoading ||
        agentsQuery.isLoading ||
        offersQuery.isLoading ||
        checklistsQuery.isLoading ||
        scenariosQuery.isLoading));

  const hasError =
    projectsQuery.isError ||
    projectDetailQuery.isError ||
    propertiesQuery.isError ||
    agentsQuery.isError ||
    offersQuery.isError ||
    checklistsQuery.isError ||
    scenariosQuery.isError;

  const agents = agentsQuery.data?.data ?? [];
  const offers = offersQuery.data?.data ?? [];
  const checklistItems = checklistsQuery.data?.data ?? [];
  const latestScenario = latestScenarioForSave;

  const preSaleItems = checklistItems.filter((i) => i.checklist_type === "pre_sale");
  const docItems = checklistItems.filter((i) => i.checklist_type === "sell_documents");
  const stagingItems = checklistItems.filter((i) => i.checklist_type === "staging");

  const shortlistedAgents = agents.filter((a) => a.status === "shortlisted" || a.status === "selected");

  const tabDefs = [
    { id: "overview", label: "Overview" },
    { id: "agents", label: "Agents", count: agents.length },
    { id: "costs", label: "Costs" },
    {
      id: "checklists",
      label: "Checklists",
      count: preSaleItems.length + docItems.length + stagingItems.length,
    },
    { id: "offers", label: "Offers", count: offers.length },
  ];

  if (loading && !sell) {
    return (
      <PageShell title="Sell">
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm">Loading sell workspace…</p>
        </div>
      </PageShell>
    );
  }

  if (!sell) {
    return (
      <PageShell title="Sell">
        <div className="space-y-4">
          {hasError && (
            <ErrorBanner text="We could not load projects. Check your connection and try again." />
          )}
          <Card>
            <CardContent className="py-10">
              <EmptyState
                icon={<TrendingDown className="h-10 w-10" />}
                title="No sell project yet"
                description="Create a project to track your listing, agents, offers, and settlement milestones."
                action={
                  <Button size="lg" className="min-h-12 px-6" onClick={() => setCreateProjectOpen(true)}>
                    Create sell project
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
        <CreateProjectModal
          open={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          onSubmit={(data) =>
            createProject.mutate(data, {
              onSuccess: () => {
                setCreateProjectOpen(false);
              },
            })
          }
          submitting={createProject.isPending}
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Sell">
      <div className="space-y-5 pb-4">
        {hasError && (
          <ErrorBanner text="Some sections failed to load. Try refreshing the page." />
        )}

        <Tabs tabs={tabDefs} active={tab} onChange={setTab} />

        {tab === "overview" && (
          <OverviewTab
            sell={sell}
            ownProperty={ownProperty}
            propertiesLoading={propertiesQuery.isLoading}
            onEditProject={() => setEditProjectOpen(true)}
            onEditProperty={() => setPropertyModalOpen(true)}
          />
        )}

        {tab === "agents" && (
          <AgentsTab
            agents={agents}
            shortlistedAgents={shortlistedAgents}
            loading={agentsQuery.isLoading}
            onAdd={() => {
              setEditingAgentId(null);
              setAgentModalOpen(true);
            }}
            onEdit={(id) => {
              setEditingAgentId(id);
              setAgentModalOpen(true);
            }}
            onDelete={(id) => removeAgent.mutate(id)}
            deletePending={removeAgent.isPending}
          />
        )}

        {tab === "costs" && (
          <CostsTab latestScenario={latestScenario} saveScenarioMutation={saveScenarioMutation} />
        )}

        {tab === "checklists" && (
          <ChecklistsTab
            preSale={preSaleItems}
            documents={docItems}
            staging={stagingItems}
            loading={checklistsQuery.isLoading}
            onAdd={(type) => setChecklistModal({ type })}
            onChangeState={(id, state) => updateChecklist.mutate({ id, data: { state } })}
            onRemove={(id) => removeChecklist.mutate(id)}
            removePending={removeChecklist.isPending}
          />
        )}

        {tab === "offers" && (
          <OffersTab
            offers={offers}
            ownProperty={ownProperty}
            loading={offersQuery.isLoading}
            compareOfferIds={compareOfferIds}
            setCompareOfferIds={setCompareOfferIds}
            onAdd={() => {
              setEditingOfferId(null);
              setOfferModalOpen(true);
            }}
            onEdit={(id) => {
              setEditingOfferId(id);
              setOfferModalOpen(true);
            }}
            onDelete={(id) => removeOffer.mutate(id)}
            deletePending={removeOffer.isPending}
          />
        )}
      </div>

      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onSubmit={(data) =>
          createProject.mutate(data, { onSuccess: () => setCreateProjectOpen(false) })
        }
        submitting={createProject.isPending}
      />

      <EditProjectModal
        key={sell.id}
        open={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        project={sell}
        onSubmit={(data) =>
          updateProject.mutate(
            { id: sell.id, data },
            { onSuccess: () => setEditProjectOpen(false) }
          )
        }
        submitting={updateProject.isPending}
      />

      <PropertyModal
        key={ownProperty?.id ?? "new-property"}
        open={propertyModalOpen}
        onClose={() => setPropertyModalOpen(false)}
        projectId={sell.id}
        existing={ownProperty}
        onCreate={(data) =>
          createProperty.mutate(data, {
            onSuccess: () => {
              setPropertyModalOpen(false);
              qc.invalidateQueries({ queryKey: ["properties"] });
            },
          })
        }
        onUpdate={(id, data) =>
          updateProperty.mutate(
            { id, data },
            {
              onSuccess: () => {
                setPropertyModalOpen(false);
                qc.invalidateQueries({ queryKey: ["properties"] });
              },
            }
          )
        }
        creating={createProperty.isPending}
        updating={updateProperty.isPending}
      />

      <AgentModal
        key={editingAgentId ?? "new-agent"}
        open={agentModalOpen}
        onClose={() => {
          setAgentModalOpen(false);
          setEditingAgentId(null);
        }}
        projectId={sell.id}
        existing={editingAgentResolved}
        detailLoading={Boolean(editingAgentId) && agentDetailQuery.isLoading && !editingAgentResolved}
        onSubmit={(payload) => {
          if (editingAgentId) {
            updateAgent.mutate(
              { id: editingAgentId, data: payload },
              {
                onSuccess: () => {
                  setAgentModalOpen(false);
                  setEditingAgentId(null);
                },
              }
            );
          } else {
            createAgent.mutate(payload, {
              onSuccess: () => {
                setAgentModalOpen(false);
              },
            });
          }
        }}
        submitting={createAgent.isPending || updateAgent.isPending}
      />

      <OfferModal
        key={editingOfferId ?? "new-offer"}
        open={offerModalOpen}
        onClose={() => {
          setOfferModalOpen(false);
          setEditingOfferId(null);
        }}
        projectId={sell.id}
        propertyId={ownProperty?.id}
        existing={editingOfferId ? offers.find((o) => o.id === editingOfferId) : undefined}
        onSubmit={(payload) => {
          if (editingOfferId) {
            updateOffer.mutate(
              { id: editingOfferId, data: payload },
              {
                onSuccess: () => {
                  setOfferModalOpen(false);
                  setEditingOfferId(null);
                },
              }
            );
          } else {
            createOffer.mutate(payload, {
              onSuccess: () => {
                setOfferModalOpen(false);
              },
            });
          }
        }}
        submitting={createOffer.isPending || updateOffer.isPending}
      />

      <AddChecklistModal
        open={checklistModal != null}
        onClose={() => setChecklistModal(null)}
        projectId={sell.id}
        checklistType={checklistModal?.type}
        onSubmit={(body) =>
          createChecklist.mutate(body, {
            onSuccess: () => {
              setChecklistModal(null);
              qc.invalidateQueries({ queryKey: ["checklists"] });
            },
          })
        }
        submitting={createChecklist.isPending}
      />
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

function OverviewTab({
  sell,
  ownProperty,
  propertiesLoading,
  onEditProject,
  onEditProperty,
}: {
  sell: Project;
  ownProperty: Property | null;
  propertiesLoading: boolean;
  onEditProject: () => void;
  onEditProperty: () => void;
}) {
  const progress = milestoneProgress(sell.sell_milestone, SELL_MILESTONES);
  const currentIdx = sell.sell_milestone
    ? SELL_MILESTONES.indexOf(sell.sell_milestone as (typeof SELL_MILESTONES)[number])
    : -1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
              <Home className="h-5 w-5" />
            </span>
            Property & pricing
          </CardTitle>
          <Button variant="ghost" size="sm" className="shrink-0 min-h-10" onClick={onEditProject}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {propertiesLoading ? (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading property…
            </div>
          ) : ownProperty ? (
            <>
              <p className="font-medium text-slate-900 dark:text-slate-100 leading-snug">{ownProperty.address}</p>
              <div className="grid gap-2">
                {[ownProperty.suburb, ownProperty.city].filter(Boolean).length > 0 && (
                  <p className="text-slate-600 dark:text-slate-400">
                    {[ownProperty.suburb, ownProperty.city].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
              <Button variant="outline" size="md" className="w-full min-h-11" onClick={onEditProperty}>
                Edit home details
              </Button>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 p-4 text-center">
              <p className="text-slate-600 dark:text-slate-400 mb-3">No home record linked to this sale yet.</p>
              <Button className="min-h-11 w-full" onClick={onEditProperty}>
                Add property being sold
              </Button>
            </div>
          )}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2.5">
            <Row label="Target price range" value={
              sell.target_sale_price_low != null || sell.target_sale_price_high != null ? (
                <>
                  {formatCurrency(sell.target_sale_price_low)} – {formatCurrency(sell.target_sale_price_high)}
                </>
              ) : (
                "Not set"
              )
            } />
            <Row label="Minimum price" value={formatCurrency(sell.minimum_acceptable_price)} />
            <Row
              label="Sale strategy"
              value={sell.sale_strategy ? capitalize(sell.sale_strategy) : "Not set"}
            />
            <Row
              label="Timing"
              value={
                sell.sale_timing_start || sell.sale_timing_end ? (
                  <>
                    {sell.sale_timing_start ? formatDate(sell.sale_timing_start) : "—"} →{" "}
                    {sell.sale_timing_end ? formatDate(sell.sale_timing_end) : "—"}
                  </>
                ) : (
                  "Not set"
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sale milestones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-primary-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {sell.sell_milestone ? (
                <>
                  {MILESTONE_LABEL[sell.sell_milestone] ?? capitalize(sell.sell_milestone)} · Step{" "}
                  {currentIdx >= 0 ? currentIdx + 1 : 0} of {SELL_MILESTONES.length}
                </>
              ) : (
                "Set a milestone on the project when you are ready."
              )}
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {SELL_MILESTONES.map((m, i) => {
              const done = currentIdx >= i;
              const active = currentIdx === i;
              return (
                <div
                  key={m}
                  className={`flex min-w-[7.5rem] flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center ${
                    active
                      ? "border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/30"
                      : done
                        ? "border-emerald-200 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/20"
                        : "border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                      done ? "bg-emerald-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" /> : i + 1}
                  </div>
                  <span className="text-[11px] font-medium leading-tight text-slate-700 dark:text-slate-300">
                    {MILESTONE_LABEL[m] ?? capitalize(m)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-900 dark:text-slate-100 tabular-nums">{value}</span>
    </div>
  );
}

function AgentsTab({
  agents,
  shortlistedAgents,
  loading,
  onAdd,
  onEdit,
  onDelete,
  deletePending,
}: {
  agents: SellAgent[];
  shortlistedAgents: SellAgent[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Selling agents</h2>
        <Button size="md" className="min-h-11 shrink-0" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add agent
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<Users className="h-9 w-9" />}
              title="No agents yet"
              description="Add appraisals and fee estimates to compare who you will list with."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {agents.map((a) => (
            <Card key={a.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{a.name}</p>
                    {a.agency && <p className="text-sm text-slate-500 dark:text-slate-400">{a.agency}</p>}
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Appraisal</p>
                    <p className="font-medium tabular-nums">
                      {a.appraisal_low != null || a.appraisal_high != null ? (
                        <>
                          {formatCurrency(a.appraisal_low)} – {formatCurrency(a.appraisal_high)}
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Commission</p>
                    <p className="font-medium tabular-nums">
                      {a.commission_rate != null ? formatPercent(a.commission_rate) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Marketing est.</p>
                    <p className="font-medium tabular-nums">{formatCurrency(a.marketing_estimate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Method</p>
                    <p className="font-medium">
                      {a.recommended_method ? capitalize(a.recommended_method) : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="secondary" className="flex-1 min-h-11" onClick={() => onEdit(a.id)}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700"
                    disabled={deletePending}
                    onClick={() => onDelete(a.id)}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {shortlistedAgents.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Shortlist comparison
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="pb-2 pr-3 font-medium">Agent</th>
                  <th className="pb-2 pr-3 font-medium">Appraisal</th>
                  <th className="pb-2 pr-3 font-medium">Commission</th>
                  <th className="pb-2 pr-3 font-medium">Marketing</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shortlistedAgents.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800">
                    <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                      {a.name}
                      {a.agency && (
                        <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{a.agency}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {formatCurrency(a.appraisal_low)} – {formatCurrency(a.appraisal_high)}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{formatPercent(a.commission_rate)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{formatCurrency(a.marketing_estimate)}</td>
                    <td className="py-2.5">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CostsTab({
  latestScenario,
  saveScenarioMutation,
}: {
  latestScenario: FinancialScenario | null;
  saveScenarioMutation: ReturnType<typeof useMutation<any, any, any, any>>;
}) {
  const [salePrice, setSalePrice] = useState("");
  const [commissionRate, setCommissionRate] = useState("2.5");
  const [marketing, setMarketing] = useState("");
  const [legal, setLegal] = useState("");
  const [repairs, setRepairs] = useState("");
  const [mortgage, setMortgage] = useState("");

  useEffect(() => {
    if (!latestScenario) return;
    setSalePrice(latestScenario.sale_price?.toString() ?? "");
    setCommissionRate(latestScenario.commission_rate?.toString() ?? "2.5");
    setMarketing(latestScenario.marketing_cost?.toString() ?? "");
    setLegal(latestScenario.legal_fees_sell?.toString() ?? "");
    setRepairs(latestScenario.repairs_cost?.toString() ?? "");
    setMortgage(latestScenario.mortgage_balance?.toString() ?? "");
  }, [latestScenario?.id]);

  const n = (v: string) => {
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : 0;
  };

  const sale = n(salePrice);
  const rate = n(commissionRate);
  const commissionAmt = sale > 0 && rate >= 0 ? (sale * rate) / 100 : 0;
  const mkt = n(marketing);
  const leg = n(legal);
  const rep = n(repairs);
  const mort = n(mortgage);

  const netProceeds = sale - commissionAmt - mkt - leg - rep - mort;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Cost calculators
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Expected sale price"
            inputMode="decimal"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            placeholder="e.g. 950000"
          />
          <Input
            label="Commission rate (%)"
            inputMode="decimal"
            value={commissionRate}
            onChange={(e) => setCommissionRate(e.target.value)}
          />
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Commission estimate · </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(commissionAmt)}
            </span>
          </div>
          <Input
            label="Marketing costs"
            inputMode="decimal"
            value={marketing}
            onChange={(e) => setMarketing(e.target.value)}
            placeholder="Photography, advertising…"
          />
          <Input
            label="Legal fees (sale)"
            inputMode="decimal"
            value={legal}
            onChange={(e) => setLegal(e.target.value)}
          />
          <Input
            label="Staging / repairs budget"
            inputMode="decimal"
            value={repairs}
            onChange={(e) => setRepairs(e.target.value)}
          />
          <Input
            label="Mortgage balance to discharge"
            inputMode="decimal"
            value={mortgage}
            onChange={(e) => setMortgage(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Net proceeds estimate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Sale price</span>
            <span className="font-medium tabular-nums">{formatCurrency(sale || undefined)}</span>
          </div>
          <div className="flex justify-between text-red-700 dark:text-red-300">
            <span>− Commission ({formatPercent(rate)})</span>
            <span className="tabular-nums">−{formatCurrency(commissionAmt || undefined)}</span>
          </div>
          <div className="flex justify-between text-red-700 dark:text-red-300">
            <span>− Marketing</span>
            <span className="tabular-nums">−{formatCurrency(mkt || undefined)}</span>
          </div>
          <div className="flex justify-between text-red-700 dark:text-red-300">
            <span>− Legal</span>
            <span className="tabular-nums">−{formatCurrency(leg || undefined)}</span>
          </div>
          <div className="flex justify-between text-red-700 dark:text-red-300">
            <span>− Staging / repairs</span>
            <span className="tabular-nums">−{formatCurrency(rep || undefined)}</span>
          </div>
          <div className="flex justify-between text-red-700 dark:text-red-300">
            <span>− Mortgage</span>
            <span className="tabular-nums">−{formatCurrency(mort || undefined)}</span>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between text-base font-semibold">
            <span className="text-slate-900 dark:text-slate-100">Net estimate</span>
            <span className={`tabular-nums ${netProceeds < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>
              {formatCurrency(netProceeds || undefined)}
            </span>
          </div>
          <Button
            className="w-full min-h-12"
            disabled={saveScenarioMutation.isPending || !sale}
            onClick={() =>
              saveScenarioMutation.mutate({
                sale_price: sale,
                commission_rate: rate,
                commission_amount: commissionAmt,
                marketing_cost: mkt || undefined,
                legal_fees_sell: leg || undefined,
                repairs_cost: rep || undefined,
                mortgage_balance: mort || undefined,
              })
            }
          >
            {saveScenarioMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save to financial scenario"
            )}
          </Button>
          {latestScenario && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
              Last saved {formatDate(latestScenario.updated_at)}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChecklistsTab({
  preSale,
  documents,
  staging,
  loading,
  onAdd,
  onChangeState,
  onRemove,
  removePending,
}: {
  preSale: ChecklistItem[];
  documents: ChecklistItem[];
  staging: ChecklistItem[];
  loading: boolean;
  onAdd: (type: "pre_sale" | "sell_documents" | "staging") => void;
  onChangeState: (id: string, state: string) => void;
  onRemove: (id: string) => void;
  removePending: boolean;
}) {
  const sections: {
    title: string;
    type: "pre_sale" | "sell_documents" | "staging";
    items: ChecklistItem[];
    icon: ReactNode;
    hint: string;
  }[] = [
    {
      title: "Pre-sale checklist",
      type: "pre_sale",
      items: preSale,
      icon: <ListChecks className="h-4 w-4" />,
      hint: "Declutter, repairs, and curb appeal before listing.",
    },
    {
      title: "Document checklist",
      type: "sell_documents",
      items: documents,
      icon: <FileText className="h-4 w-4" />,
      hint: `Common categories: ${FILE_CATEGORIES.slice(0, 4).map(capitalize).join(", ")}…`,
    },
    {
      title: "Staging checklist",
      type: "staging",
      items: staging,
      icon: <Home className="h-4 w-4" />,
      hint: "Room-by-room presentation and open-home readiness.",
    },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-500 dark:text-slate-400">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {sections.map((s) => (
        <Card key={s.type}>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              {s.icon}
              {s.title}
            </CardTitle>
            <Button variant="secondary" size="sm" className="min-h-10 shrink-0" onClick={() => onAdd(s.type)}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{s.hint}</p>
            {s.items.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-2">No items yet.</p>
            ) : (
              s.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 flex-1">{item.label}</p>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <select
                      value={item.state}
                      onChange={(e) => onChangeState(item.id, e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-2 text-sm min-h-10"
                    >
                      {checklistStateOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 dark:text-red-400 min-h-10"
                      disabled={removePending}
                      onClick={() => onRemove(item.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OffersTab({
  offers,
  ownProperty,
  loading,
  compareOfferIds,
  setCompareOfferIds,
  onAdd,
  onEdit,
  onDelete,
  deletePending,
}: {
  offers: Offer[];
  ownProperty: Property | null;
  loading: boolean;
  compareOfferIds: [string | null, string | null];
  setCompareOfferIds: (v: [string | null, string | null]) => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}) {
  const a = compareOfferIds[0] ? offers.find((o) => o.id === compareOfferIds[0]) : null;
  const b = compareOfferIds[1] ? offers.find((o) => o.id === compareOfferIds[1]) : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Offers received</h2>
        <Button
          size="md"
          className="min-h-11 shrink-0"
          onClick={onAdd}
          disabled={!ownProperty}
        >
          <Plus className="h-4 w-4" />
          Add offer
        </Button>
      </div>
      {!ownProperty && (
        <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800 rounded-lg px-3 py-2">
          Add the property you are selling (Overview tab) before recording offers.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : offers.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<CircleDot className="h-9 w-9" />}
              title="No offers logged"
              description="When buyers submit offers, add them here to compare terms side by side."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {offers.map((o) => (
            <Card key={o.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex justify-between gap-2">
                  <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(o.price)}
                  </p>
                  <StatusBadge status={o.status} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Settlement {o.settlement_date ? formatDate(o.settlement_date) : "—"}
                </p>
                {o.conditions?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {o.conditions.map((c) => (
                      <Badge key={c} variant="default">
                        {capitalize(c)}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="secondary" className="flex-1 min-h-11" onClick={() => onEdit(o.id)}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700"
                    disabled={deletePending}
                    onClick={() => onDelete(o.id)}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {offers.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Compare offers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Offer A"
                value={compareOfferIds[0] ?? ""}
                onChange={(e) =>
                  setCompareOfferIds([e.target.value || null, compareOfferIds[1]])
                }
                options={offers.map((o) => ({
                  value: o.id,
                  label: `${formatCurrency(o.price)} · ${capitalize(o.status)}`,
                }))}
                placeholder="Select offer"
              />
              <Select
                label="Offer B"
                value={compareOfferIds[1] ?? ""}
                onChange={(e) =>
                  setCompareOfferIds([compareOfferIds[0], e.target.value || null])
                }
                options={offers.map((o) => ({
                  value: o.id,
                  label: `${formatCurrency(o.price)} · ${capitalize(o.status)}`,
                }))}
                placeholder="Select offer"
              />
            </div>
            {a && b && (
              <div className="grid grid-cols-2 gap-3 text-sm border-t border-slate-100 dark:border-slate-800 pt-3">
                <CompareCol offer={a} />
                <CompareCol offer={b} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CompareCol({ offer }: { offer: Offer }) {
  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80 p-3 space-y-2">
      <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(offer.price)}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Settlement: {offer.settlement_date ? formatDate(offer.settlement_date) : "—"}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">Deposit: {formatCurrency(offer.deposit)}</p>
      <div className="flex flex-wrap gap-1">
        {offer.conditions?.map((c) => (
          <Badge key={c} variant="default">
            {capitalize(c)}
          </Badge>
        ))}
      </div>
      <StatusBadge status={offer.status} />
    </div>
  );
}

function CreateProjectModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    type: "sell";
    name: string;
    sale_strategy?: string;
    target_sale_price_low?: number;
    target_sale_price_high?: number;
  }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("My sale");
  const [strategy, setStrategy] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");

  return (
    <Modal open={open} onClose={onClose} title="Create sell project">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            type: "sell",
            name: name.trim() || "My sale",
            sale_strategy: strategy || undefined,
            target_sale_price_low: low ? parseFloat(low) : undefined,
            target_sale_price_high: high ? parseFloat(high) : undefined,
          });
        }}
      >
        <Input label="Project name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Select
          label="Sale strategy (optional)"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          options={strategyOptions}
          placeholder="Choose strategy"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Target low"
            inputMode="decimal"
            value={low}
            onChange={(e) => setLow(e.target.value)}
          />
          <Input
            label="Target high"
            inputMode="decimal"
            value={high}
            onChange={(e) => setHigh(e.target.value)}
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditProjectModal({
  open,
  onClose,
  project,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [min, setMin] = useState("");
  const [strategy, setStrategy] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [milestone, setMilestone] = useState("");

  useEffect(() => {
    if (!open) return;
    setMin(project.minimum_acceptable_price?.toString() ?? "");
    setStrategy(project.sale_strategy ?? "");
    setLow(project.target_sale_price_low?.toString() ?? "");
    setHigh(project.target_sale_price_high?.toString() ?? "");
    setStart(project.sale_timing_start?.slice(0, 10) ?? "");
    setEnd(project.sale_timing_end?.slice(0, 10) ?? "");
    setMilestone(project.sell_milestone ?? "");
  }, [open, project.id, project.updated_at]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Edit sale plan">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            sale_strategy: strategy || undefined,
            target_sale_price_low: low ? parseFloat(low) : undefined,
            target_sale_price_high: high ? parseFloat(high) : undefined,
            minimum_acceptable_price: min ? parseFloat(min) : undefined,
            sale_timing_start: start || undefined,
            sale_timing_end: end || undefined,
            sell_milestone: milestone || undefined,
          });
        }}
      >
        <Select
          label="Sale strategy"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          options={strategyOptions}
          placeholder="Optional"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Target low" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} />
          <Input
            label="Target high"
            inputMode="decimal"
            value={high}
            onChange={(e) => setHigh(e.target.value)}
          />
        </div>
        <Input
          label="Minimum acceptable price"
          inputMode="decimal"
          value={min}
          onChange={(e) => setMin(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input type="date" label="Timing start" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input type="date" label="Timing end" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Select
          label="Current milestone"
          value={milestone}
          onChange={(e) => setMilestone(e.target.value)}
          options={SELL_MILESTONES.map((m) => ({ value: m, label: MILESTONE_LABEL[m] ?? capitalize(m) }))}
          placeholder="Not set"
        />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PropertyModal({
  open,
  onClose,
  projectId,
  existing,
  onCreate,
  onUpdate,
  creating,
  updating,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  existing: Property | null;
  onCreate: (data: Record<string, unknown>) => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  creating: boolean;
  updating: boolean;
}) {
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    if (!open) return;
    setAddress(existing?.address ?? "");
    setSuburb(existing?.suburb ?? "");
    setCity(existing?.city ?? "");
  }, [open, existing?.id, existing?.address, existing?.suburb, existing?.city]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit property" : "Property being sold"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (existing) {
            onUpdate(existing.id, { address, suburb: suburb || undefined, city: city || undefined });
          } else {
            onCreate({
              project_id: projectId,
              address,
              suburb: suburb || undefined,
              city: city || undefined,
              is_own_home: true,
            });
          }
        }}
      >
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} required />
        <Input label="Suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} />
        <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={creating || updating}>
            {creating || updating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AgentModal({
  open,
  onClose,
  projectId,
  existing,
  detailLoading,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  existing: SellAgent | null | undefined;
  detailLoading: boolean;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const agent = existing;

  const [name, setName] = useState("");
  const [agency, setAgency] = useState("");
  const [appraisalLow, setAppraisalLow] = useState("");
  const [appraisalHigh, setAppraisalHigh] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
  const [marketingEstimate, setMarketingEstimate] = useState("");
  const [status, setStatus] = useState("shortlisted");
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (agent) {
      setName(agent.name);
      setAgency(agent.agency ?? "");
      setAppraisalLow(agent.appraisal_low?.toString() ?? "");
      setAppraisalHigh(agent.appraisal_high?.toString() ?? "");
      setCommissionRate(agent.commission_rate?.toString() ?? "");
      setMarketingEstimate(agent.marketing_estimate?.toString() ?? "");
      setStatus(agent.status);
      setMethod(agent.recommended_method ?? "");
      setNotes(agent.notes ?? "");
    } else if (!detailLoading) {
      setName("");
      setAgency("");
      setAppraisalLow("");
      setAppraisalHigh("");
      setCommissionRate("");
      setMarketingEstimate("");
      setStatus("shortlisted");
      setMethod("");
      setNotes("");
    }
  }, [open, agent?.id, detailLoading, agent]);

  return (
    <Modal open={open} onClose={onClose} title={agent ? "Edit agent" : "Add agent"}>
      {detailLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400 dark:text-slate-500" />
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              project_id: projectId,
              name: name.trim(),
              agency: agency || undefined,
              appraisal_low: appraisalLow ? parseFloat(appraisalLow) : undefined,
              appraisal_high: appraisalHigh ? parseFloat(appraisalHigh) : undefined,
              commission_rate: commissionRate ? parseFloat(commissionRate) : undefined,
              marketing_estimate: marketingEstimate ? parseFloat(marketingEstimate) : undefined,
              recommended_method: method || undefined,
              status,
              notes: notes || undefined,
            });
          }}
        >
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Agency" value={agency} onChange={(e) => setAgency(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Appraisal low"
              inputMode="decimal"
              value={appraisalLow}
              onChange={(e) => setAppraisalLow(e.target.value)}
            />
            <Input
              label="Appraisal high"
              inputMode="decimal"
              value={appraisalHigh}
              onChange={(e) => setAppraisalHigh(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Commission %"
              inputMode="decimal"
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
            />
            <Input
              label="Marketing est."
              inputMode="decimal"
              value={marketingEstimate}
              onChange={(e) => setMarketingEstimate(e.target.value)}
            />
          </div>
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={agentStatusOptions}
          />
          <Select
            label="Recommended method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            options={strategyOptions}
            placeholder="Optional"
          />
          <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 min-h-12" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function OfferModal({
  open,
  onClose,
  projectId,
  propertyId,
  existing,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  propertyId: string | undefined;
  existing: Offer | undefined;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState("submitted");
  const [settlement, setSettlement] = useState("");
  const [deposit, setDeposit] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setPrice(existing.price.toString());
      setStatus(existing.status);
      setSettlement(existing.settlement_date?.slice(0, 10) ?? "");
      setDeposit(existing.deposit?.toString() ?? "");
      setConditions(existing.conditions ?? []);
      setDetail(existing.conditions_detail ?? "");
    } else {
      setPrice("");
      setStatus("submitted");
      setSettlement("");
      setDeposit("");
      setConditions([]);
      setDetail("");
    }
  }, [open, existing?.id]);

  const toggleCondition = (c: string) => {
    setConditions((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit offer" : "Add offer"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!propertyId && !existing) return;
          onSubmit({
            property_id: existing?.property_id ?? propertyId,
            project_id: projectId,
            direction: "received",
            price: parseFloat(price),
            status,
            settlement_date: settlement || undefined,
            deposit: deposit ? parseFloat(deposit) : undefined,
            conditions,
            conditions_detail: detail || undefined,
          });
        }}
      >
        <Input
          label="Price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={offerStatusOptions}
        />
        <Input type="date" label="Settlement date" value={settlement} onChange={(e) => setSettlement(e.target.value)} />
        <Input
          label="Deposit"
          inputMode="decimal"
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
        />
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Conditions</p>
          <div className="flex flex-wrap gap-2">
            {OFFER_CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCondition(c)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium border min-h-9 ${
                  conditions.includes(c)
                    ? "border-primary-600 bg-primary-50 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400"
                }`}
              >
                {capitalize(c)}
              </button>
            ))}
          </div>
        </div>
        <Textarea
          label="Condition details"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
        />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1 min-h-12"
            disabled={submitting || (!existing && !propertyId)}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AddChecklistModal({
  open,
  onClose,
  projectId,
  checklistType,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  checklistType?: "pre_sale" | "sell_documents" | "staging";
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [label, setLabel] = useState("");

  if (!checklistType) return null;

  return (
    <Modal open={open} onClose={onClose} title="Add checklist item">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            project_id: projectId,
            label: label.trim(),
            checklist_type: checklistType,
            state: "not_started",
            sort_order: 0,
          });
        }}
      >
        <Input label="Task" value={label} onChange={(e) => setLabel(e.target.value)} required />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting || !label.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
