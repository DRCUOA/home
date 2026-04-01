import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  AlertCircle,
  ShoppingCart,
  Plus,
  Pencil,
  Home,
  GitCompare,
  ClipboardCheck,
  CircleDot,
  Check,
  Star,
  ExternalLink,
  Trash2,
  Camera,
  Flag,
  Sparkles,
} from "lucide-react";
import type {
  Project,
  Property,
  PropertyCriteria,
  PropertyEvaluation,
  Offer,
  ChecklistItem,
  FinancialScenario,
  Note,
  FileRecord,
} from "@hcc/shared";
import {
  BUY_MILESTONES,
  PROPERTY_TYPES,
  WATCHLIST_STATUSES,
  LISTING_METHODS,
  OFFER_CONDITIONS,
  OFFER_STATUSES,
  RISK_SEVERITIES,
  CHECKLIST_STATES,
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
import { FilePreviewModal } from "@/components/features/file-preview";
import {
  useList,
  useCreate,
  useUpdate,
  useRemove,
  useDetail,
} from "@/hooks/use-query-helpers";
import { apiGet, apiPost, apiPatch, apiPut } from "@/lib/api";
import { formatCurrency, formatDate, formatPercent, capitalize } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type ListResponse<T> = { data: T[]; total: number };

export const Route = createFileRoute("/buy")({
  component: BuyPage,
});

const MILESTONE_LABEL: Record<string, string> = {
  researching: "Researching",
  due_diligence: "Due diligence",
  preparing_offer: "Preparing offer",
  under_offer: "Under offer",
  conditional: "Conditional",
  unconditional: "Unconditional",
  settled: "Settled",
};

const REPORT_TRACKER_LABELS = [
  "LIM",
  "Title search",
  "Builder's report",
  "Rental appraisal",
  "Body corporate records",
] as const;

const watchlistFilterOptions = [
  { value: "", label: "All statuses" },
  ...WATCHLIST_STATUSES.map((s) => ({ value: s, label: capitalize(s) })),
];

const offerStatusOptions = OFFER_STATUSES.map((s) => ({
  value: s,
  label: capitalize(s),
}));

const checklistStateOptions = CHECKLIST_STATES.map((s) => ({
  value: s,
  label: capitalize(s),
}));

const riskSeverityOptions = RISK_SEVERITIES.map((s) => ({
  value: s,
  label: capitalize(s),
}));

function milestoneProgress(
  milestone: string | undefined,
  order: readonly string[]
): number {
  if (!milestone) return 0;
  const idx = order.indexOf(milestone);
  if (idx < 0) return 0;
  return ((idx + 1) / order.length) * 100;
}

function isShortlisted(p: Property) {
  return p.watchlist_status === "shortlisted" || p.watchlist_status === "offer_candidate";
}

function BuyPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("criteria");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editMilestoneOpen, setEditMilestoneOpen] = useState(false);
  const [propertyDetailId, setPropertyDetailId] = useState<string | null>(null);
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [watchlistFilter, setWatchlistFilter] = useState("");
  const [compareIds, setCompareIds] = useState<(string | null)[]>([null, null, null]);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [scenarioPropertyId, setScenarioPropertyId] = useState<string | null>(null);

  const projectsQuery = useList<Project>("projects", "/projects", { type: "buy" });
  const buyProject = projectsQuery.data?.data[0];

  const projectDetailQuery = useDetail<Project>("projects", "/projects", buyProject?.id);
  const buy = projectDetailQuery.data?.data ?? buyProject;

  const criteriaQuery = useQuery({
    queryKey: ["property-criteria", buy?.id],
    queryFn: () =>
      apiGet<{ data: PropertyCriteria | null }>(
        `/property-criteria?project_id=${encodeURIComponent(buy!.id)}`
      ),
    enabled: Boolean(buy?.id),
  });

  const propertiesQuery = useQuery({
    queryKey: ["properties", buy?.id, "buy"],
    queryFn: () =>
      apiGet<ListResponse<Property>>(
        `/properties?project_id=${encodeURIComponent(buy!.id)}`
      ),
    enabled: Boolean(buy?.id),
  });

  const properties = propertiesQuery.data?.data ?? [];
  const filteredProperties = useMemo(() => {
    if (!watchlistFilter) return properties;
    return properties.filter((p) => p.watchlist_status === watchlistFilter);
  }, [properties, watchlistFilter]);

  const shortlisted = useMemo(() => properties.filter(isShortlisted), [properties]);

  const propertyIdsKey = useMemo(() => properties.map((p) => p.id).sort().join(","), [properties]);

  const evaluationsQuery = useQuery({
    queryKey: ["property-evaluations", "project", buy?.id, propertyIdsKey],
    queryFn: async () => {
      const res = await apiGet<ListResponse<PropertyEvaluation>>("/property-evaluations");
      const idSet = new Set(properties.map((p) => p.id));
      return {
        data: res.data.filter((e) => idSet.has(e.property_id)),
        total: res.total,
      };
    },
    enabled: Boolean(buy?.id) && properties.length > 0,
  });

  const evaluations = evaluationsQuery.data?.data ?? [];
  const evalByPropertyId = useMemo(() => {
    const m = new Map<string, PropertyEvaluation>();
    for (const e of evaluations) m.set(e.property_id, e);
    return m;
  }, [evaluations]);

  const offersQuery = useQuery({
    queryKey: ["offers", buy?.id, "submitted"],
    queryFn: () =>
      apiGet<ListResponse<Offer>>(
        `/offers?${new URLSearchParams({ project_id: buy!.id, direction: "submitted" }).toString()}`
      ),
    enabled: Boolean(buy?.id),
  });

  const checklistsQuery = useQuery({
    queryKey: ["checklists", buy?.id, "buy"],
    queryFn: () =>
      apiGet<ListResponse<ChecklistItem>>(
        `/checklists?project_id=${encodeURIComponent(buy!.id)}`
      ),
    enabled: Boolean(buy?.id),
  });

  const scenariosQuery = useQuery({
    queryKey: ["financial-scenarios", buy?.id],
    queryFn: () =>
      apiGet<ListResponse<FinancialScenario>>(
        `/financial-scenarios?${new URLSearchParams({ project_id: buy!.id }).toString()}`
      ),
    enabled: Boolean(buy?.id),
  });

  const createProject = useCreate<Project>("projects", "/projects");
  const updateProject = useUpdate<Project>("projects", "/projects");
  const createProperty = useCreate<Property>("properties", "/properties");
  const updateProperty = useUpdate<Property>("properties", "/properties");
  const removeProperty = useRemove("properties", "/properties");
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const enrichProperty = useMutation({
    mutationFn: (id: string) => apiPost<{ data: Property; enriched_fields: string[]; photos_downloaded: number }>(`/properties/${id}/enrich`, {}),
    onSuccess: (_data, id) => {
      setEnrichingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (_err, id) => {
      setEnrichingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    },
  });
  const createOffer = useCreate<Offer>("offers", "/offers");
  const updateOffer = useUpdate<Offer>("offers", "/offers");
  const removeOffer = useRemove("offers", "/offers");
  const createChecklist = useCreate<ChecklistItem>("checklists", "/checklists");
  const updateChecklist = useUpdate<ChecklistItem>("checklists", "/checklists");
  const removeChecklist = useRemove("checklists", "/checklists");
  const createEvaluation = useCreate<PropertyEvaluation>("property-evaluations", "/property-evaluations");
  const updateEvaluation = useUpdate<PropertyEvaluation>("property-evaluations", "/property-evaluations");
  const createNoteMutation = useMutation({
    mutationFn: (data: {
      project_id: string;
      property_id: string;
      body: string;
      tags: string[];
    }) => apiPost<{ data: Note }>("/notes", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
  const removeNote = useRemove("notes", "/notes");

  const saveCriteriaMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPut<{ data: PropertyCriteria }>("/property-criteria", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property-criteria"] });
    },
  });

  const scenarioRows = scenariosQuery.data?.data ?? [];
  const latestScenario = useMemo(() => {
    if (scenarioRows.length === 0) return null;
    return [...scenarioRows].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )[0];
  }, [scenarioRows]);

  const saveScenarioMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const pid = scenarioPropertyId ?? undefined;
      if (latestScenario) {
        return apiPatch<{ data: FinancialScenario }>(`/financial-scenarios/${latestScenario.id}`, {
          ...payload,
          ...(pid ? { property_id: pid } : {}),
        });
      }
      if (!buy?.id) throw new Error("No project");
      return apiPost<{ data: FinancialScenario }>("/financial-scenarios", {
        name: "Purchase scenario",
        project_id: buy.id,
        ...payload,
        ...(pid ? { property_id: pid } : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-scenarios"] });
    },
  });

  const offers = offersQuery.data?.data ?? [];
  const checklistItems = checklistsQuery.data?.data ?? [];

  const loading =
    projectsQuery.isLoading ||
    (Boolean(buy?.id) &&
      (projectDetailQuery.isLoading ||
        criteriaQuery.isLoading ||
        propertiesQuery.isLoading ||
        offersQuery.isLoading ||
        checklistsQuery.isLoading ||
        scenariosQuery.isLoading ||
        (properties.length > 0 && evaluationsQuery.isLoading)));

  const hasError =
    projectsQuery.isError ||
    projectDetailQuery.isError ||
    criteriaQuery.isError ||
    propertiesQuery.isError ||
    offersQuery.isError ||
    checklistsQuery.isError ||
    scenariosQuery.isError ||
    evaluationsQuery.isError;

  const tabDefs = [
    { id: "criteria", label: "Criteria" },
    { id: "properties", label: "Properties", count: properties.length },
    { id: "compare", label: "Compare" },
    { id: "diligence", label: "Due Diligence" },
    { id: "offers", label: "Offers", count: offers.length },
  ];

  const detailProperty = propertyDetailId
    ? properties.find((p) => p.id === propertyDetailId) ?? null
    : null;

  if (loading && !buy) {
    return (
      <PageShell title="Buy">
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
          <p className="text-sm">Loading buy workspace…</p>
        </div>
      </PageShell>
    );
  }

  if (!buy) {
    return (
      <PageShell title="Buy">
        <div className="space-y-4">
          {hasError && (
            <ErrorBanner text="We could not load projects. Check your connection and try again." />
          )}
          <Card>
            <CardContent className="py-10">
              <EmptyState
                icon={<ShoppingCart className="h-10 w-10" />}
                title="No buy project yet"
                description="Create a project to save listings, compare homes, run due diligence, and track offers."
                action={
                  <Button size="lg" className="min-h-12 px-6" onClick={() => setCreateProjectOpen(true)}>
                    Create buy project
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
        <CreateBuyProjectModal
          open={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          onSubmit={(data) =>
            createProject.mutate(data, {
              onSuccess: () => setCreateProjectOpen(false),
            })
          }
          submitting={createProject.isPending}
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Buy">
      <div className="space-y-5 pb-4">
        {hasError && (
          <ErrorBanner text="Some sections failed to load. Try refreshing the page." />
        )}

        <Tabs tabs={tabDefs} active={tab} onChange={setTab} />

        {tab === "criteria" && (
          <CriteriaTab
            projectId={buy.id}
            criteria={criteriaQuery.data?.data ?? null}
            loading={criteriaQuery.isLoading}
            saving={saveCriteriaMutation.isPending}
            onSave={(payload) => saveCriteriaMutation.mutate(payload)}
          />
        )}

        {tab === "properties" && (
          <PropertiesTab
            properties={filteredProperties}
            allCount={properties.length}
            watchlistFilter={watchlistFilter}
            onWatchlistFilter={setWatchlistFilter}
            loading={propertiesQuery.isLoading}
            evaluations={evalByPropertyId}
            enrichingIds={enrichingIds}
            onOpenDetail={(id) => setPropertyDetailId(id)}
            onAddProperty={() => setAddPropertyOpen(true)}
            onToggleFavourite={(p, rank) =>
              updateProperty.mutate({
                id: p.id,
                data: { favourite_rank: rank },
              })
            }
            favouritePending={updateProperty.isPending}
            onPatchWatchlist={(p, status) =>
              updateProperty.mutate({ id: p.id, data: { watchlist_status: status } })
            }
            onEnrich={(p) => {
              setEnrichingIds((prev) => new Set(prev).add(p.id));
              enrichProperty.mutate(p.id);
            }}
            onDelete={(id) => removeProperty.mutate(id)}
            deletePending={removeProperty.isPending}
          />
        )}

        {tab === "compare" && (
          <CompareTab
            shortlisted={shortlisted}
            compareIds={compareIds}
            setCompareIds={setCompareIds}
            evalByPropertyId={evalByPropertyId}
            onUpdateEvaluation={(id, data) =>
              updateEvaluation.mutate({ id, data }, { onSuccess: () => qc.invalidateQueries({ queryKey: ["property-evaluations"] }) })
            }
            updatePending={updateEvaluation.isPending}
          />
        )}

        {tab === "diligence" && (
          <DueDiligenceTab
            shortlisted={shortlisted}
            checklistItems={checklistItems}
            evaluations={evalByPropertyId}
            projectId={buy.id}
            loading={checklistsQuery.isLoading}
            onSeedReports={(propertyId) => {
              REPORT_TRACKER_LABELS.forEach((label, i) => {
                createChecklist.mutate({
                  project_id: buy.id,
                  property_id: propertyId,
                  label,
                  checklist_type: "buy_due_diligence",
                  state: "not_started",
                  sort_order: i,
                });
              });
            }}
            onChangeChecklistState={(id, state) =>
              updateChecklist.mutate({ id, data: { state } })
            }
            onRemoveChecklist={(id) => removeChecklist.mutate(id)}
            removeChecklistPending={removeChecklist.isPending}
            onEnsureEvaluation={async (propertyId) => {
              const existing = evalByPropertyId.get(propertyId);
              if (existing) return existing;
              const res = await apiPost<{ data: PropertyEvaluation }>("/property-evaluations", {
                property_id: propertyId,
                pros: [],
                cons: [],
                red_flags: [],
                criteria_fit: {},
                room_observations: {},
                questions_for_agent: [],
              });
              qc.invalidateQueries({ queryKey: ["property-evaluations"] });
              return res.data;
            }}
            onPatchEvaluation={(id, data) =>
              updateEvaluation.mutate({ id, data }, { onSuccess: () => qc.invalidateQueries({ queryKey: ["property-evaluations"] }) })
            }
            onCreateIssueNote={(propertyId, body, severity) =>
              createNoteMutation.mutate({
                project_id: buy.id,
                property_id: propertyId,
                body,
                tags: ["dd_issue", `severity:${severity}`],
              })
            }
            onDeleteNote={(id) => removeNote.mutate(id)}
          />
        )}

        {tab === "offers" && (
          <OffersTab
            project={buy}
            offers={offers}
            properties={properties}
            shortlisted={shortlisted}
            loading={offersQuery.isLoading}
            latestScenario={latestScenario}
            scenarioPropertyId={scenarioPropertyId}
            setScenarioPropertyId={setScenarioPropertyId}
            saveScenarioMutation={saveScenarioMutation}
            onEditMilestone={() => setEditMilestoneOpen(true)}
            onAddOffer={() => {
              setEditingOfferId(null);
              setOfferModalOpen(true);
            }}
            onEditOffer={(id) => {
              setEditingOfferId(id);
              setOfferModalOpen(true);
            }}
            onDeleteOffer={(id) => removeOffer.mutate(id)}
            deleteOfferPending={removeOffer.isPending}
          />
        )}
      </div>

      <CreateBuyProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onSubmit={(data) =>
          createProject.mutate(data, { onSuccess: () => setCreateProjectOpen(false) })
        }
        submitting={createProject.isPending}
      />

      <EditBuyMilestoneModal
        open={editMilestoneOpen}
        onClose={() => setEditMilestoneOpen(false)}
        project={buy}
        onSubmit={(data) =>
          updateProject.mutate({ id: buy.id, data }, { onSuccess: () => setEditMilestoneOpen(false) })
        }
        submitting={updateProject.isPending}
      />

      <AddPropertyModal
        open={addPropertyOpen}
        onClose={() => setAddPropertyOpen(false)}
        projectId={buy.id}
        onSubmit={(data) =>
          createProperty.mutate(data, {
            onSuccess: (result) => {
              setAddPropertyOpen(false);
              qc.invalidateQueries({ queryKey: ["properties"] });
              const created = result.data;
              if (created.listing_url || created.address) {
                setEnrichingIds((prev) => new Set(prev).add(created.id));
                enrichProperty.mutate(created.id);
              }
            },
          })
        }
        submitting={createProperty.isPending}
      />

      <PropertyDetailModal
        open={propertyDetailId != null}
        property={detailProperty}
        evaluation={detailProperty ? evalByPropertyId.get(detailProperty.id) : undefined}
        onClose={() => setPropertyDetailId(null)}
        onCreateEvaluation={() => {
          if (!detailProperty) return;
          createEvaluation.mutate(
            {
              property_id: detailProperty.id,
              pros: [],
              cons: [],
              red_flags: [],
              criteria_fit: {},
              room_observations: {},
              questions_for_agent: [],
            },
            {
              onSuccess: () => qc.invalidateQueries({ queryKey: ["property-evaluations"] }),
            }
          );
        }}
        onPatchEvaluation={(id, data) =>
          updateEvaluation.mutate(
            { id, data },
            { onSuccess: () => qc.invalidateQueries({ queryKey: ["property-evaluations"] }) }
          )
        }
        creatingEval={createEvaluation.isPending}
        updatingEval={updateEvaluation.isPending}
        filesQueryEnabled={Boolean(detailProperty)}
        propertyId={detailProperty?.id}
        isEnriching={detailProperty ? enrichingIds.has(detailProperty.id) : false}
        onEnrich={() => {
          if (!detailProperty) return;
          setEnrichingIds((prev) => new Set(prev).add(detailProperty.id));
          enrichProperty.mutate(detailProperty.id);
        }}
        onUpdateProperty={(data) => {
          if (!detailProperty) return;
          updateProperty.mutate({ id: detailProperty.id, data });
        }}
        updatingProperty={updateProperty.isPending}
      />

      <BuyOfferModal
        open={offerModalOpen}
        onClose={() => {
          setOfferModalOpen(false);
          setEditingOfferId(null);
        }}
        projectId={buy.id}
        properties={properties}
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

function StringListEditor({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...items, t]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder ?? "Add item"}
          className="flex-1 min-h-11"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" className="min-h-11 shrink-0 px-4" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((s, i) => (
            <li
              key={`${s}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm"
            >
              <span className="max-w-[220px] truncate">{s}</span>
              <button
                type="button"
                className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 p-1 min-w-[2rem] min-h-[2rem] flex items-center justify-center"
                aria-label="Remove"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CriteriaSummaryCard({
  criteria,
  onEdit,
}: {
  criteria: PropertyCriteria;
  onEdit: () => void;
}) {
  const f = criteria.financing_assumptions;
  const hasFinancing = f && (f.deposit_percent || f.interest_rate || f.loan_term_years || f.pre_approval_amount);

  const tagList = (items: string[]) =>
    items.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
          >
            {item}
          </span>
        ))}
      </div>
    ) : (
      <p className="text-xs text-slate-400 dark:text-slate-500 italic">None set</p>
    );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Buy criteria
          </CardTitle>
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 p-2 -m-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Edit criteria"
            title="Edit criteria"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {criteria.locations.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Locations</p>
            {tagList(criteria.locations)}
          </div>
        )}

        {criteria.must_haves.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Must-haves</p>
            {tagList(criteria.must_haves)}
          </div>
        )}

        {criteria.nice_to_haves.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nice-to-haves</p>
            {tagList(criteria.nice_to_haves)}
          </div>
        )}

        {criteria.exclusions.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Exclusions</p>
            {tagList(criteria.exclusions)}
          </div>
        )}

        {criteria.property_types.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Property types</p>
            <div className="flex flex-wrap gap-1.5">
              {criteria.property_types.map((t) => (
                <span
                  key={t}
                  className="rounded-full px-2.5 py-1 text-xs font-medium border border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                >
                  {capitalize(t)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          {criteria.budget_ceiling && (
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Budget</p>
              <p className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatCurrency(criteria.budget_ceiling)}
              </p>
            </div>
          )}
          {f?.pre_approval_amount && (
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Pre-approval</p>
              <p className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatCurrency(f.pre_approval_amount)}
              </p>
            </div>
          )}
        </div>

        {hasFinancing && (
          <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80 px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Financing</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
              {f?.deposit_percent != null && <span>{f.deposit_percent}% deposit</span>}
              {f?.interest_rate != null && <span>{f.interest_rate}% interest</span>}
              {f?.loan_term_years != null && <span>{f.loan_term_years} yr term</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CriteriaTab({
  projectId,
  criteria,
  loading,
  saving,
  onSave,
}: {
  projectId: string;
  criteria: PropertyCriteria | null;
  loading: boolean;
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [locations, setLocations] = useState<string[]>([]);
  const [mustHaves, setMustHaves] = useState<string[]>([]);
  const [nice, setNice] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [depPct, setDepPct] = useState("");
  const [interest, setInterest] = useState("");
  const [term, setTerm] = useState("");
  const [preApp, setPreApp] = useState("");

  const prevSaving = useRef(saving);
  useEffect(() => {
    if (prevSaving.current && !saving && criteria) {
      setEditing(false);
    }
    prevSaving.current = saving;
  }, [saving, criteria]);

  useEffect(() => {
    if (!criteria) return;
    setLocations(criteria.locations ?? []);
    setMustHaves(criteria.must_haves ?? []);
    setNice(criteria.nice_to_haves ?? []);
    setExclusions(criteria.exclusions ?? []);
    setPropertyTypes(criteria.property_types ?? []);
    setBudget(criteria.budget_ceiling?.toString() ?? "");
    const f = criteria.financing_assumptions;
    setDepPct(f?.deposit_percent?.toString() ?? "");
    setInterest(f?.interest_rate?.toString() ?? "");
    setTerm(f?.loan_term_years?.toString() ?? "");
    setPreApp(f?.pre_approval_amount?.toString() ?? "");
  }, [criteria?.id, criteria?.updated_at]);

  const toggleType = (t: string) => {
    setPropertyTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const handleSave = () => {
    onSave({
      project_id: projectId,
      locations,
      must_haves: mustHaves,
      nice_to_haves: nice,
      exclusions,
      property_types: propertyTypes,
      budget_ceiling: budget ? parseFloat(budget) : undefined,
      financing_assumptions: {
        deposit_percent: depPct ? parseFloat(depPct) : undefined,
        interest_rate: interest ? parseFloat(interest) : undefined,
        loan_term_years: term ? parseFloat(term) : undefined,
        pre_approval_amount: preApp ? parseFloat(preApp) : undefined,
      },
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-500 dark:text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (criteria && !editing) {
    return (
      <div className="space-y-4">
        <CriteriaSummaryCard criteria={criteria} onEdit={() => setEditing(true)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Buy criteria
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <StringListEditor label="Location targets" items={locations} onChange={setLocations} />
          <StringListEditor label="Must-have criteria" items={mustHaves} onChange={setMustHaves} />
          <StringListEditor label="Nice-to-have criteria" items={nice} onChange={setNice} />
          <StringListEditor label="Hard exclusions" items={exclusions} onChange={setExclusions} />

          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">Property type preferences</p>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={`rounded-full px-3 py-2 text-xs font-medium border min-h-10 ${
                    propertyTypes.includes(t)
                      ? "border-primary-600 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {capitalize(t)}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Budget ceiling (NZD)"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. 950000"
          />

          <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Financing assumptions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Deposit %"
                inputMode="decimal"
                value={depPct}
                onChange={(e) => setDepPct(e.target.value)}
              />
              <Input
                label="Interest rate %"
                inputMode="decimal"
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
              />
              <Input
                label="Loan term (years)"
                inputMode="decimal"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
              <Input
                label="Pre-approval amount"
                inputMode="decimal"
                value={preApp}
                onChange={(e) => setPreApp(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            {criteria && (
              <Button
                type="button"
                variant="secondary"
                className="flex-1 min-h-12"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            )}
            <Button className="flex-1 min-h-12" disabled={saving} onClick={handleSave}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save criteria"
              )}
            </Button>
          </div>
          {!criteria && (
            <p className="text-xs text-center text-slate-500 dark:text-slate-400">
              First save creates your criteria record for this project.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PropertiesTab({
  properties,
  allCount,
  watchlistFilter,
  onWatchlistFilter,
  loading,
  evaluations,
  enrichingIds,
  onOpenDetail,
  onAddProperty,
  onToggleFavourite,
  favouritePending,
  onPatchWatchlist,
  onEnrich,
  onDelete,
  deletePending,
}: {
  properties: Property[];
  allCount: number;
  watchlistFilter: string;
  onWatchlistFilter: (v: string) => void;
  loading: boolean;
  evaluations: Map<string, PropertyEvaluation>;
  enrichingIds: Set<string>;
  onOpenDetail: (id: string) => void;
  onAddProperty: () => void;
  onToggleFavourite: (p: Property, rank: number | undefined) => void;
  favouritePending: boolean;
  onPatchWatchlist: (p: Property, status: string) => void;
  onEnrich: (p: Property) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <Select
            label="Filter by watchlist"
            value={watchlistFilter}
            onChange={(e) => onWatchlistFilter(e.target.value)}
            options={watchlistFilterOptions}
          />
        </div>
        <Button size="md" className="min-h-11 w-full sm:w-auto shrink-0" onClick={onAddProperty}>
          <Plus className="h-4 w-4" />
          Add property
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : properties.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={<Home className="h-9 w-9" />}
              title={allCount === 0 ? "No saved properties" : "No matches for this filter"}
              description={
                allCount === 0
                  ? "Add a listing URL to start tracking homes you are considering."
                  : "Try clearing the watchlist filter."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {properties.map((p) => {
            const ev = evaluations.get(p.id);
            const rank = p.favourite_rank ?? 0;
            const isEnriching = enrichingIds.has(p.id);
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenDetail(p.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDetail(p.id); } }}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
              >
                {isEnriching && (
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-primary-600 dark:text-primary-400">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                    <span>Fetching listing details…</span>
                  </div>
                )}
                <div className="flex justify-between gap-2 mb-2">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 leading-snug pr-2">{p.address}</p>
                  <button
                    type="button"
                    className="shrink-0 p-2 -m-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavourite(p, rank > 0 ? undefined : 1);
                    }}
                    disabled={favouritePending}
                    aria-label="Favourite"
                  >
                    <Star className={`h-5 w-5 ${rank ? "fill-amber-400 text-amber-500" : ""}`} />
                  </button>
                </div>
                <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100 mb-2">
                  {formatCurrency(p.price_asking ?? p.price_guide_high ?? p.price_guide_low)}
                </p>
                <div className="flex flex-wrap gap-2 text-sm text-slate-600 dark:text-slate-400 mb-2">
                  <span>{p.bedrooms != null ? `${p.bedrooms} bed` : "— bed"}</span>
                  <span>·</span>
                  <span>{p.bathrooms != null ? `${p.bathrooms} bath` : "— bath"}</span>
                  {p.property_type && (
                    <>
                      <span>·</span>
                      <span>{capitalize(p.property_type)}</span>
                    </>
                  )}
                </div>
                <div
                  className="space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Select
                    label="Watchlist status"
                    value={p.watchlist_status ?? "researching"}
                    onChange={(e) => onPatchWatchlist(p, e.target.value)}
                    options={WATCHLIST_STATUSES.map((s) => ({ value: s, label: capitalize(s) }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.watchlist_status && <StatusBadge status={p.watchlist_status} />}
                    {p.listing_url && (
                      <a
                        href={p.listing_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Listing <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onEnrich(p)}
                      disabled={isEnriching}
                      className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-40 transition-colors"
                      aria-label="Enrich from listing"
                      title="Enrich from listing"
                    >
                      <Sparkles className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDetail(p.id)}
                      className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      aria-label="Edit property"
                      title="View / edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${p.address}"?`)) onDelete(p.id);
                      }}
                      disabled={deletePending}
                      className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 transition-colors"
                      aria-label="Delete property"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {ev?.visit_notes && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{ev.visit_notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompareTab({
  shortlisted,
  compareIds,
  setCompareIds,
  evalByPropertyId,
  onUpdateEvaluation,
  updatePending,
}: {
  shortlisted: Property[];
  compareIds: (string | null)[];
  setCompareIds: (v: (string | null)[]) => void;
  evalByPropertyId: Map<string, PropertyEvaluation>;
  onUpdateEvaluation: (id: string, data: Record<string, unknown>) => void;
  updatePending: boolean;
}) {
  const options = shortlisted.map((p) => ({
    value: p.id,
    label: p.address.slice(0, 42) + (p.address.length > 42 ? "…" : ""),
  }));

  const selected = compareIds
    .map((id) => (id ? shortlisted.find((p) => p.id === id) : null))
    .filter(Boolean) as Property[];

  if (shortlisted.length < 2) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            icon={<GitCompare className="h-9 w-9" />}
            title="Shortlist at least two properties"
            description="Mark listings as shortlisted or offer candidate on each property card, then compare them here."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Choose 2–3 homes
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Select
              key={i}
              label={`Property ${i + 1}`}
              value={compareIds[i] ?? ""}
              onChange={(e) => {
                const next = [...compareIds];
                next[i] = e.target.value || null;
                setCompareIds(next);
              }}
              options={options}
              placeholder="Select…"
            />
          ))}
        </CardContent>
      </Card>

      {selected.length >= 2 && (
        <div className="overflow-x-auto -mx-1 px-1 pb-2">
          <div
            className="grid gap-3 min-w-[640px]"
            style={{ gridTemplateColumns: `repeat(${selected.length}, minmax(0,1fr))` }}
          >
            {selected.map((p) => (
              <CompareColumn
                key={p.id}
                property={p}
                evaluation={evalByPropertyId.get(p.id)}
                onUpdateEvaluation={onUpdateEvaluation}
                updatePending={updatePending}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CompareColumn({
  property,
  evaluation,
  onUpdateEvaluation,
  updatePending,
}: {
  property: Property;
  evaluation: PropertyEvaluation | undefined;
  onUpdateEvaluation: (id: string, data: Record<string, unknown>) => void;
  updatePending: boolean;
}) {
  const [pros, setPros] = useState<string[]>([]);
  const [cons, setCons] = useState<string[]>([]);
  const [flags, setFlags] = useState<string[]>([]);
  const [fit, setFit] = useState("");

  useEffect(() => {
    if (!evaluation) return;
    setPros(evaluation.pros ?? []);
    setCons(evaluation.cons ?? []);
    setFlags(evaluation.red_flags ?? []);
    setFit(JSON.stringify(evaluation.criteria_fit ?? {}, null, 2));
  }, [evaluation?.id, evaluation?.updated_at]);

  if (!evaluation) {
    return (
      <Card className="min-h-[200px]">
        <CardHeader>
          <CardTitle className="text-sm leading-tight">{property.address}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 dark:text-slate-400">No evaluation yet — open the property from Properties to create one.</p>
        </CardContent>
      </Card>
    );
  }

  let criteriaFitParsed: Record<string, string> = {};
  try {
    criteriaFitParsed = JSON.parse(fit || "{}");
  } catch {
    criteriaFitParsed = {};
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm leading-tight">{property.address}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Price</p>
          <p className="font-semibold tabular-nums">
            {formatCurrency(property.price_asking ?? property.price_guide_high)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Beds</span>
            <p className="font-medium">{property.bedrooms ?? "—"}</p>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Baths</span>
            <p className="font-medium">{property.bathrooms ?? "—"}</p>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Land m²</span>
            <p className="font-medium tabular-nums">{property.land_area_sqm ?? "—"}</p>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Floor m²</span>
            <p className="font-medium tabular-nums">{property.floor_area_sqm ?? "—"}</p>
          </div>
        </div>
        <StringListEditor label="Pros" items={pros} onChange={setPros} />
        <StringListEditor label="Cons" items={cons} onChange={setCons} />
        <StringListEditor label="Red flags" items={flags} onChange={setFlags} />
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">Criteria fit (JSON)</p>
          <Textarea
            value={fit}
            onChange={(e) => setFit(e.target.value)}
            rows={4}
            className="font-mono text-xs"
          />
        </div>
        <Button
          className="w-full min-h-11"
          disabled={updatePending}
          onClick={() => {
            onUpdateEvaluation(evaluation.id, {
              pros,
              cons,
              red_flags: flags,
              criteria_fit: criteriaFitParsed,
            });
          }}
        >
          {updatePending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save comparison"}
        </Button>
      </CardContent>
    </Card>
  );
}

function DueDiligenceTab({
  shortlisted,
  checklistItems,
  evaluations,
  projectId,
  loading,
  onSeedReports,
  onChangeChecklistState,
  onRemoveChecklist,
  removeChecklistPending,
  onEnsureEvaluation,
  onPatchEvaluation,
  onCreateIssueNote,
  onDeleteNote,
}: {
  shortlisted: Property[];
  checklistItems: ChecklistItem[];
  evaluations: Map<string, PropertyEvaluation>;
  projectId: string;
  loading: boolean;
  onSeedReports: (propertyId: string) => void;
  onChangeChecklistState: (id: string, state: string) => void;
  onRemoveChecklist: (id: string) => void;
  removeChecklistPending: boolean;
  onEnsureEvaluation: (propertyId: string) => Promise<PropertyEvaluation>;
  onPatchEvaluation: (id: string, data: Record<string, unknown>) => void;
  onCreateIssueNote: (propertyId: string, body: string, severity: string) => void;
  onDeleteNote: (id: string) => void;
}) {
  if (shortlisted.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            icon={<ClipboardCheck className="h-9 w-9" />}
            title="Nothing shortlisted yet"
            description="Shortlist properties to manage per-home due diligence, reports, and issues."
          />
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-500 dark:text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {shortlisted.map((p) => (
        <DueDiligencePropertyCard
          key={p.id}
          property={p}
          items={checklistItems.filter(
            (c) => c.property_id === p.id && c.checklist_type === "buy_due_diligence"
          )}
          evaluation={evaluations.get(p.id)}
          projectId={projectId}
          onSeedReports={() => onSeedReports(p.id)}
          onChangeChecklistState={onChangeChecklistState}
          onRemoveChecklist={onRemoveChecklist}
          removeChecklistPending={removeChecklistPending}
          onEnsureEvaluation={() => onEnsureEvaluation(p.id)}
          onPatchEvaluation={onPatchEvaluation}
          onCreateIssueNote={(body, sev) => onCreateIssueNote(p.id, body, sev)}
          onDeleteNote={onDeleteNote}
        />
      ))}
    </div>
  );
}

function DueDiligencePropertyCard({
  property,
  items,
  evaluation,
  projectId,
  onSeedReports,
  onChangeChecklistState,
  onRemoveChecklist,
  removeChecklistPending,
  onEnsureEvaluation,
  onPatchEvaluation,
  onCreateIssueNote,
  onDeleteNote,
}: {
  property: Property;
  items: ChecklistItem[];
  evaluation: PropertyEvaluation | undefined;
  projectId: string;
  onSeedReports: () => void;
  onChangeChecklistState: (id: string, state: string) => void;
  onRemoveChecklist: (id: string) => void;
  removeChecklistPending: boolean;
  onEnsureEvaluation: () => Promise<PropertyEvaluation>;
  onPatchEvaluation: (id: string, data: Record<string, unknown>) => void;
  onCreateIssueNote: (body: string, severity: string) => void;
  onDeleteNote: (id: string) => void;
}) {
  const notesQuery = useQuery({
    queryKey: ["notes", "dd", projectId, property.id],
    queryFn: () =>
      apiGet<ListResponse<Note>>(
        `/notes?${new URLSearchParams({ property_id: property.id }).toString()}`
      ),
  });

  const issueNotes = useMemo(() => {
    const rows = notesQuery.data?.data ?? [];
    return rows.filter((n) => n.tags?.includes("dd_issue"));
  }, [notesQuery.data?.data]);

  const [issueBody, setIssueBody] = useState("");
  const [issueSev, setIssueSev] = useState<(typeof RISK_SEVERITIES)[number]>("medium");
  const [questions, setQuestions] = useState<string[]>([]);
  const [flags, setFlags] = useState<string[]>([]);

  useEffect(() => {
    if (!evaluation) return;
    setQuestions(evaluation.questions_for_agent ?? []);
    setFlags(evaluation.red_flags ?? []);
  }, [evaluation?.id, evaluation?.updated_at]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base leading-snug">{property.address}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex justify-between items-center gap-2 mb-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Report requests</p>
            {items.length === 0 && (
              <Button variant="secondary" size="sm" className="min-h-10" onClick={onSeedReports}>
                Add standard set
              </Button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No rows yet. Tap “Add standard set” for LIM, title, and more.</p>
          ) : (
            <div className="space-y-2">
              {items.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-3"
                >
                  <p className="text-sm font-medium flex-1">{c.label}</p>
                  <select
                    value={c.state}
                    onChange={(e) => onChangeChecklistState(c.id, e.target.value)}
                    className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-2 text-sm min-h-10 flex-1 sm:flex-none sm:min-w-[10rem]"
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
                    disabled={removeChecklistPending}
                    onClick={() => onRemoveChecklist(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Issues found</p>
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
            <div className="sm:w-36 shrink-0">
              <Select
                label="Severity"
                value={issueSev}
                onChange={(e) => setIssueSev(e.target.value as (typeof RISK_SEVERITIES)[number])}
                options={riskSeverityOptions}
              />
            </div>
            <Input
              label="Issue"
              value={issueBody}
              onChange={(e) => setIssueBody(e.target.value)}
              placeholder="Describe the issue"
              className="flex-1 min-h-11"
            />
            <div className="flex sm:items-end">
              <Button
                type="button"
                className="min-h-11 w-full sm:w-auto shrink-0"
                onClick={() => {
                  if (!issueBody.trim()) return;
                  onCreateIssueNote(issueBody.trim(), issueSev);
                  setIssueBody("");
                }}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
          {notesQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
          ) : issueNotes.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No issues logged.</p>
          ) : (
            <ul className="space-y-2">
              {issueNotes.map((n) => {
                const sev =
                  n.tags?.find((t) => t.startsWith("severity:"))?.replace("severity:", "") ?? "?";
                return (
                  <li
                    key={n.id}
                    className="flex justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                  >
                    <div>
                      <Badge variant="default" className="mb-1">
                        {capitalize(sev)}
                      </Badge>
                      <p>{n.body}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onDeleteNote(n.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Unresolved questions before offer</p>
          <StringListEditor
            label="Open questions"
            items={questions}
            onChange={setQuestions}
            placeholder="Question for agent"
          />
          <Button
            variant="secondary"
            className="w-full min-h-11 mt-2"
            onClick={async () => {
              let ev = evaluation;
              if (!ev) ev = await onEnsureEvaluation();
              onPatchEvaluation(ev.id, { questions_for_agent: questions });
            }}
          >
            Save questions
          </Button>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1">
            <Flag className="h-4 w-4" /> Red flag tracker
          </p>
          <StringListEditor
            label="Red flags"
            items={flags}
            onChange={setFlags}
            placeholder="Red flag"
          />
          <Button
            variant="secondary"
            className="w-full min-h-11 mt-2"
            onClick={async () => {
              let ev = evaluation;
              if (!ev) ev = await onEnsureEvaluation();
              onPatchEvaluation(ev.id, { red_flags: flags });
            }}
          >
            Save red flags
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OffersTab({
  project,
  offers,
  properties,
  shortlisted,
  loading,
  latestScenario,
  scenarioPropertyId,
  setScenarioPropertyId,
  saveScenarioMutation,
  onEditMilestone,
  onAddOffer,
  onEditOffer,
  onDeleteOffer,
  deleteOfferPending,
}: {
  project: Project;
  offers: Offer[];
  properties: Property[];
  shortlisted: Property[];
  loading: boolean;
  latestScenario: FinancialScenario | null;
  scenarioPropertyId: string | null;
  setScenarioPropertyId: (id: string | null) => void;
  saveScenarioMutation: ReturnType<typeof useMutation<any, any, any, any>>;
  onEditMilestone: () => void;
  onAddOffer: () => void;
  onEditOffer: (id: string) => void;
  onDeleteOffer: (id: string) => void;
  deleteOfferPending: boolean;
}) {
  const progress = milestoneProgress(project.buy_milestone, BUY_MILESTONES);
  const currentIdx = project.buy_milestone
    ? BUY_MILESTONES.indexOf(project.buy_milestone as (typeof BUY_MILESTONES)[number])
    : -1;

  const [price, setPrice] = useState("");
  const [deposit, setDeposit] = useState("");

  useEffect(() => {
    if (!latestScenario) return;
    setPrice(latestScenario.purchase_price?.toString() ?? "");
    setDeposit(latestScenario.deposit?.toString() ?? "");
  }, [latestScenario?.id]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="text-base">Buy milestone</CardTitle>
          <Button variant="ghost" size="sm" className="min-h-10" onClick={onEditMilestone}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {project.buy_milestone ? (
              <>
                {MILESTONE_LABEL[project.buy_milestone] ?? capitalize(project.buy_milestone)} · Step{" "}
                {currentIdx >= 0 ? currentIdx + 1 : 0} of {BUY_MILESTONES.length}
              </>
            ) : (
              "Set your milestone as you progress toward settlement."
            )}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {BUY_MILESTONES.map((m, i) => {
              const done = currentIdx >= i;
              const active = currentIdx === i;
              return (
                <div
                  key={m}
                  className={`flex min-w-[6.5rem] flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center ${
                    active
                      ? "border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30"
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
                  <span className="text-[10px] font-medium leading-tight text-slate-700 dark:text-slate-300">
                    {MILESTONE_LABEL[m] ?? capitalize(m)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Offer calculator & scenarios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            label="Link scenario to property (optional)"
            value={scenarioPropertyId ?? ""}
            onChange={(e) => setScenarioPropertyId(e.target.value || null)}
            options={[
              { value: "", label: "Whole project" },
              ...shortlisted.map((p) => ({ value: p.id, label: p.address.slice(0, 48) })),
            ]}
          />
          <Input
            label="Offer / purchase price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <Input
            label="Deposit"
            inputMode="decimal"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Use “New offer” below to record conditions, settlement date, and counteroffer links.
          </p>
          <Button
            className="w-full min-h-12"
            disabled={saveScenarioMutation.isPending || !price}
            onClick={() =>
              saveScenarioMutation.mutate({
                purchase_price: parseFloat(price),
                deposit: deposit ? parseFloat(deposit) : undefined,
              })
            }
          >
            {saveScenarioMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save purchase scenario"
            )}
          </Button>
          {latestScenario && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
              Last updated {formatDate(latestScenario.updated_at)}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Submitted offers</h2>
        <Button size="md" className="min-h-11" onClick={onAddOffer} disabled={properties.length === 0}>
          <Plus className="h-4 w-4" />
          New offer
        </Button>
      </div>
      {properties.length === 0 && (
        <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800 rounded-lg px-3 py-2">
          Add a property before recording an offer.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400 dark:text-slate-500" />
        </div>
      ) : offers.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<CircleDot className="h-9 w-9" />}
              title="No offers tracked"
              description="Log purchase offers and counteroffers to compare terms over time."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {offers.map((o) => {
            const prop = properties.find((p) => p.id === o.property_id);
            return (
              <Card key={o.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold tabular-nums">{formatCurrency(o.price)}</p>
                      {prop && <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{prop.address}</p>}
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Settlement {o.settlement_date ? formatDate(o.settlement_date) : "—"} · Deposit{" "}
                    {formatCurrency(o.deposit)}
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
                  {o.counter_offer_parent_id && (
                    <p className="text-xs text-amber-800 dark:text-amber-200">Counteroffer thread</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button variant="secondary" className="flex-1 min-h-11" onClick={() => onEditOffer(o.id)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700"
                      disabled={deleteOfferPending}
                      onClick={() => onDeleteOffer(o.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateBuyProjectModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { type: "buy"; name: string }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("My purchase");

  return (
    <Modal open={open} onClose={onClose} title="Create buy project">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            type: "buy",
            name: name.trim() || "My purchase",
          });
        }}
      >
        <Input label="Project name" value={name} onChange={(e) => setName(e.target.value)} required />
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

function EditBuyMilestoneModal({
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
  const [milestone, setMilestone] = useState("");

  useEffect(() => {
    if (!open) return;
    setMilestone(project.buy_milestone ?? "");
  }, [open, project.id, project.buy_milestone]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Buy milestone">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ buy_milestone: milestone || undefined });
        }}
      >
        <Select
          label="Current milestone"
          value={milestone}
          onChange={(e) => setMilestone(e.target.value)}
          options={BUY_MILESTONES.map((m) => ({
            value: m,
            label: MILESTONE_LABEL[m] ?? capitalize(m),
          }))}
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

function AddPropertyModal({
  open,
  onClose,
  projectId,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [address, setAddress] = useState("");
  const [url, setUrl] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");
  const [listingMethod, setListingMethod] = useState("");
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAddress("");
    setUrl("");
    setSuburb("");
    setCity("");
    setListingMethod("");
    setEnriching(false);
  }, [open]);

  const handleEnrich = async () => {
    if (!url.trim()) return;
    setEnriching(true);
    try {
      const res = await apiPost<{ data: Record<string, any> }>("/properties/enrich-preview", {
        listing_url: url.trim(),
        address: address.trim() || undefined,
      });
      const d = res.data;
      if (d.address) setAddress(d.address);
      if (d.suburb) setSuburb(d.suburb);
      if (d.city) setCity(d.city);
      if (d.listing_method) setListingMethod(d.listing_method);
    } catch {
      // enrichment is best-effort
    } finally {
      setEnriching(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Add property from listing">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            project_id: projectId,
            address: address.trim(),
            listing_url: url || undefined,
            suburb: suburb || undefined,
            city: city || undefined,
            listing_method: listingMethod || undefined,
            watchlist_status: "researching",
            is_own_home: false,
          });
        }}
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Listing URL</label>
          <div className="flex gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="flex-1"
            />
            <button
              type="button"
              disabled={!url.trim() || enriching}
              onClick={handleEnrich}
              className="shrink-0 flex items-center justify-center h-11 w-11 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Fetch details from listing"
            >
              {enriching ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Sparkles className="h-4.5 w-4.5" />}
            </button>
          </div>
          {enriching && (
            <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">Fetching listing details…</p>
          )}
        </div>
        <Input
          label="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          placeholder="Street & number"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} />
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <Select
          label="Listing method (optional)"
          value={listingMethod}
          onChange={(e) => setListingMethod(e.target.value)}
          options={LISTING_METHODS.map((m) => ({ value: m, label: capitalize(m) }))}
          placeholder="Select…"
        />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting || enriching}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save property"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PropertyDetailModal({
  open,
  property,
  evaluation,
  onClose,
  onCreateEvaluation,
  onPatchEvaluation,
  creatingEval,
  updatingEval,
  filesQueryEnabled,
  propertyId,
  isEnriching,
  onEnrich,
  onUpdateProperty,
  updatingProperty,
}: {
  open: boolean;
  property: Property | null;
  evaluation: PropertyEvaluation | undefined;
  onClose: () => void;
  onCreateEvaluation: () => void;
  onPatchEvaluation: (id: string, data: Record<string, unknown>) => void;
  creatingEval: boolean;
  updatingEval: boolean;
  filesQueryEnabled: boolean;
  propertyId: string | undefined;
  isEnriching: boolean;
  onEnrich: () => void;
  onUpdateProperty: (data: Record<string, unknown>) => void;
  updatingProperty: boolean;
}) {
  /* ---- edit helpers ---- */
  const startEditing = () => {
    if (!property) return;
    setEditAddress(property.address ?? "");
    setEditSuburb(property.suburb ?? "");
    setEditCity(property.city ?? "");
    setEditPrice(property.price_asking?.toString() ?? "");
    setEditBeds(property.bedrooms?.toString() ?? "");
    setEditBaths(property.bathrooms?.toString() ?? "");
    setEditParking(property.parking?.toString() ?? "");
    setEditLand(property.land_area_sqm?.toString() ?? "");
    setEditFloor(property.floor_area_sqm?.toString() ?? "");
    setEditType(property.property_type ?? "");
    setEditMethod(property.listing_method ?? "");
    setEditUrl(property.listing_url ?? "");
    setEditing(true);
  };
  const saveEdits = () => {
    const data: Record<string, unknown> = {
      address: editAddress.trim() || undefined,
      suburb: editSuburb.trim() || undefined,
      city: editCity.trim() || undefined,
      price_asking: editPrice ? parseFloat(editPrice) : undefined,
      bedrooms: editBeds ? parseInt(editBeds, 10) : undefined,
      bathrooms: editBaths ? parseInt(editBaths, 10) : undefined,
      parking: editParking ? parseInt(editParking, 10) : undefined,
      land_area_sqm: editLand ? parseFloat(editLand) : undefined,
      floor_area_sqm: editFloor ? parseFloat(editFloor) : undefined,
      property_type: editType || undefined,
      listing_method: editMethod || undefined,
      listing_url: editUrl.trim() || undefined,
    };
    onUpdateProperty(data);
    setEditing(false);
  };
  const [visitNotes, setVisitNotes] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [flags, setFlags] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [editAddress, setEditAddress] = useState("");
  const [editSuburb, setEditSuburb] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editBeds, setEditBeds] = useState("");
  const [editBaths, setEditBaths] = useState("");
  const [editParking, setEditParking] = useState("");
  const [editLand, setEditLand] = useState("");
  const [editFloor, setEditFloor] = useState("");
  const [editType, setEditType] = useState("");
  const [editMethod, setEditMethod] = useState("");
  const [editUrl, setEditUrl] = useState("");

  const filesQuery = useQuery({
    queryKey: ["files", propertyId],
    queryFn: () =>
      apiGet<ListResponse<FileRecord>>(
        `/files?${new URLSearchParams({ property_id: propertyId! }).toString()}`
      ),
    enabled: filesQueryEnabled && Boolean(propertyId),
  });

  useEffect(() => {
    if (!evaluation) return;
    setVisitNotes(evaluation.visit_notes ?? "");
    setQuestions(evaluation.questions_for_agent ?? []);
    setFlags(evaluation.red_flags ?? []);
  }, [evaluation?.id, evaluation?.updated_at]);

  if (!open || !property) return null;

  const photos =
    filesQuery.data?.data.filter(
      (f) => f.category === "photo" || f.mime_type?.startsWith("image/")
    ) ?? [];

  return (
    <Modal open={open} onClose={() => { setEditing(false); onClose(); }} title="Property detail">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {editing ? (
          <div className="space-y-3">
            <Input label="Address" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Suburb" value={editSuburb} onChange={(e) => setEditSuburb(e.target.value)} />
              <Input label="City" value={editCity} onChange={(e) => setEditCity(e.target.value)} />
            </div>
            <Input label="Asking price" inputMode="decimal" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Beds" inputMode="numeric" value={editBeds} onChange={(e) => setEditBeds(e.target.value)} />
              <Input label="Baths" inputMode="numeric" value={editBaths} onChange={(e) => setEditBaths(e.target.value)} />
              <Input label="Parking" inputMode="numeric" value={editParking} onChange={(e) => setEditParking(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Land m²" inputMode="decimal" value={editLand} onChange={(e) => setEditLand(e.target.value)} />
              <Input label="Floor m²" inputMode="decimal" value={editFloor} onChange={(e) => setEditFloor(e.target.value)} />
            </div>
            <Select
              label="Property type"
              value={editType}
              onChange={(e) => setEditType(e.target.value)}
              options={PROPERTY_TYPES.map((t) => ({ value: t, label: capitalize(t) }))}
              placeholder="Select…"
            />
            <Select
              label="Listing method"
              value={editMethod}
              onChange={(e) => setEditMethod(e.target.value)}
              options={LISTING_METHODS.map((m) => ({ value: m, label: capitalize(m) }))}
              placeholder="Select…"
            />
            <Input label="Listing URL" type="url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="secondary" className="flex-1 min-h-11" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="button" className="flex-1 min-h-11" onClick={saveEdits} disabled={updatingProperty}>
                {updatingProperty ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-start gap-2">
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">{property.address}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {property.watchlist_status && <StatusBadge status={property.watchlist_status} />}
                  {property.listing_method && (
                    <Badge>{capitalize(property.listing_method)}</Badge>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={startEditing}
                className="shrink-0 p-2 -mt-1 -mr-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Edit property"
                title="Edit property"
              >
                <Pencil className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Price</span>
                <p className="font-semibold tabular-nums">
                  {formatCurrency(property.price_asking ?? property.price_guide_high)}
                </p>
                {property.price_guide_low && property.price_guide_high && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatCurrency(property.price_guide_low)} – {formatCurrency(property.price_guide_high)}
                  </p>
                )}
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Beds / baths</span>
                <p className="font-medium">
                  {property.bedrooms ?? "—"} / {property.bathrooms ?? "—"}
                </p>
              </div>
              {(property.parking != null || property.land_area_sqm != null || property.floor_area_sqm != null) && (
                <>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Parking</span>
                    <p className="font-medium">{property.parking ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Land / floor</span>
                    <p className="font-medium tabular-nums">
                      {property.land_area_sqm ? `${property.land_area_sqm} m²` : "—"}
                      {" / "}
                      {property.floor_area_sqm ? `${property.floor_area_sqm} m²` : "—"}
                    </p>
                  </div>
                </>
              )}
              {property.property_type && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Type</span>
                  <p className="font-medium">{capitalize(property.property_type)}</p>
                </div>
              )}
            </div>

            {property.listing_description && (
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Listing</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{property.listing_description}</p>
              </div>
            )}

            {property.listing_url && (
              <a
                href={property.listing_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400"
              >
                Open listing <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </>
        )}

        {isEnriching ? (
          <div className="flex items-center gap-2 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30 px-3 py-2.5 text-sm text-primary-700 dark:text-primary-300">
            <Sparkles className="h-4 w-4 animate-pulse" />
            <span>Fetching listing details with AI…</span>
            <Loader2 className="h-4 w-4 animate-spin ml-auto" />
          </div>
        ) : (
          <Button
            variant="secondary"
            className="w-full min-h-11"
            onClick={onEnrich}
          >
            <Sparkles className="h-4 w-4" />
            Enrich from listing
          </Button>
        )}

        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1">
            <Camera className="h-4 w-4" /> Photos ({photos.length})
          </p>
          {filesQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
          ) : photos.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No photo files linked yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPreviewFile(f)}
                  className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer hover:ring-2 hover:ring-primary-500/40 transition-shadow"
                >
                  <img
                    src={`/api/v1/files/${f.id}/download`}
                    alt={f.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {!evaluation ? (
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Create an evaluation to add visit notes and questions.</p>
            <Button className="min-h-11" onClick={onCreateEvaluation} disabled={creatingEval}>
              {creatingEval ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start evaluation"}
            </Button>
          </div>
        ) : (
          <>
            <Textarea
              label="Visit notes"
              value={visitNotes}
              onChange={(e) => setVisitNotes(e.target.value)}
              rows={4}
            />
            <StringListEditor
              label="Questions for agent"
              items={questions}
              onChange={setQuestions}
              placeholder="Question"
            />
            <StringListEditor
              label="Red flags"
              items={flags}
              onChange={setFlags}
              placeholder="Flag"
            />
            <Button
              className="w-full min-h-11"
              disabled={updatingEval}
              onClick={() =>
                onPatchEvaluation(evaluation.id, {
                  visit_notes: visitNotes || undefined,
                  questions_for_agent: questions,
                  red_flags: flags,
                })
              }
            >
              {updatingEval ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save notes"}
            </Button>
          </>
        )}
      </div>
      <FilePreviewModal
        file={previewFile}
        open={previewFile != null}
        onClose={() => setPreviewFile(null)}
        gallery={photos}
        onNavigate={setPreviewFile}
      />
    </Modal>
  );
}

function BuyOfferModal({
  open,
  onClose,
  projectId,
  properties,
  existing,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  properties: Property[];
  existing: Offer | undefined;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState("draft");
  const [settlement, setSettlement] = useState("");
  const [deposit, setDeposit] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [parentId, setParentId] = useState("");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setPropertyId(existing.property_id);
      setPrice(existing.price.toString());
      setStatus(existing.status);
      setSettlement(existing.settlement_date?.slice(0, 10) ?? "");
      setDeposit(existing.deposit?.toString() ?? "");
      setConditions(existing.conditions ?? []);
      setNotes(existing.notes ?? "");
      setParentId(existing.counter_offer_parent_id ?? "");
    } else {
      setPropertyId(properties[0]?.id ?? "");
      setPrice("");
      setStatus("submitted");
      setSettlement("");
      setDeposit("");
      setConditions([]);
      setNotes("");
      setParentId("");
    }
  }, [open, existing?.id, properties]);

  const toggleCondition = (c: string) => {
    setConditions((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit offer" : "New purchase offer"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            property_id: existing?.property_id ?? propertyId,
            project_id: projectId,
            direction: "submitted",
            price: parseFloat(price),
            status,
            settlement_date: settlement || undefined,
            deposit: deposit ? parseFloat(deposit) : undefined,
            conditions,
            notes: notes || undefined,
            counter_offer_parent_id: parentId || undefined,
          });
        }}
      >
        <Select
          label="Property"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          options={properties.map((p) => ({ value: p.id, label: p.address.slice(0, 60) }))}
        />
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
        <Input
          label="Counteroffer parent ID (optional)"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          placeholder="UUID of prior offer"
        />
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Conditions</p>
          <div className="flex flex-wrap gap-2">
            {OFFER_CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCondition(c)}
                className={`rounded-full px-3 py-2 text-xs font-medium border min-h-9 ${
                  conditions.includes(c)
                    ? "border-primary-600 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400"
                }`}
              >
                {capitalize(c)}
              </button>
            ))}
          </div>
        </div>
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting || !propertyId}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
