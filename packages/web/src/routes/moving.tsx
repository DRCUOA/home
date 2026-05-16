import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Truck,
  Loader2,
  Plus,
  Package,
  PackageOpen,
  Home,
  Camera,
  ScanLine,
  Printer,
  MapPin,
  Trash2,
  Pencil,
  Upload,
  Images,
  Check,
  Search,
  Navigation,
  X,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import type {
  Move,
  MoveBox,
  MoveItem,
  MoveRoom,
  MoveScanEvent,
  MoveSticker,
  MoveStickerKind,
  Project,
  Property,
  FileRecord,
} from "@hcc/shared";
import {
  MOVE_STATUSES,
  MOVE_ITEM_STATUSES,
  MOVE_ITEM_CATEGORIES,
  MOVE_ITEM_DISPOSITIONS,
  MOVE_ITEM_DISPOSITION_LABELS,
  MOVE_ROOM_TYPES,
  MOVE_ROOM_TYPE_LABELS,
  MOVE_BOX_PRIORITIES,
  MOVE_CODE_TYPES,
  MOVE_LABEL_TEMPLATES,
} from "@hcc/shared";
import type {
  MoveLabelTemplate,
  MoveItemDisposition,
  MoveRoomType,
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
import { apiGet, apiPost, apiUpload } from "@/lib/api";
import { capitalize } from "@/lib/format";
import { EXAMPLE_ROOMS, EXAMPLE_STICKERS } from "@/lib/example-plan";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FloorPlanCanvas } from "@/components/features/floor-plan-canvas";
import { FloorPlanEditor } from "@/components/features/floor-plan-editor";
import { BarcodeScanner } from "@/components/features/barcode-scanner";
import { LabelSheet } from "@/components/features/label-sheet";
import { CameraCapture } from "@/components/features/camera-capture";
import { ScanActionSheet } from "@/components/features/scan-action-sheet";
import {
  getMovePhase,
  getNextActionPrompts,
  PHASE_LABELS,
  type ResolvedTarget,
  type WorkflowContext,
  type WorkflowPhase,
} from "@/lib/move-workflow";
import { useWorkflowDispatch } from "@/hooks/use-workflow-dispatch";

type ListResponse<T> = { data: T[]; total: number };

/** Tab ids. Order matters — drives the visual tab order.
 *
 *  Five-tab workflow:
 *  - Dashboard: progress + next-action prompts
 *  - Survey: room-by-room item capture with disposition chips
 *  - Move: unified pack/stage/load/unpack operational view
 *  - Problems: triage panel (only shown when not empty)
 *  - Tools: floor plan, labels, room/zone setup, bulk box, settings
 *
 *  Legacy ids accepted from URL search and redirected via
 *  `canonicalTab()` so older deep links keep working. */
export type MovingTab =
  | "dashboard"
  | "survey"
  | "move"
  | "problems"
  | "tools"
  // Legacy aliases — accepted from URL search, redirected at render time.
  | "overview"
  | "declutter"
  | "stage"
  | "pack"
  | "load"
  | "unpack"
  | "exceptions"
  | "labels"
  | "floor-plan"
  | "plans"
  | "inventory"
  | "boxes"
  | "scan";

const MOVING_TABS: readonly MovingTab[] = [
  "dashboard",
  "survey",
  "move",
  "problems",
  "tools",
  "overview",
  "declutter",
  "stage",
  "pack",
  "load",
  "unpack",
  "exceptions",
  "labels",
  "floor-plan",
  "plans",
  "inventory",
  "boxes",
  "scan",
];

export type CanonicalTab = "dashboard" | "survey" | "move" | "problems" | "tools";

/** Canonicalize a possibly-legacy tab id. */
function canonicalTab(id: MovingTab | undefined): CanonicalTab {
  switch (id) {
    case "dashboard":
    case "survey":
    case "move":
    case "problems":
    case "tools":
      return id;
    case "overview":
      return "dashboard";
    case "declutter":
    case "inventory":
      return "survey";
    case "stage":
    case "pack":
    case "load":
    case "unpack":
    case "boxes":
    case "scan":
      return "move";
    case "exceptions":
      return "problems";
    case "labels":
    case "floor-plan":
    case "plans":
      return "tools";
    case undefined:
    default:
      return "dashboard";
  }
}

type MovingSearch = {
  tab?: MovingTab;
  /** Pre-select a move (used by deep links from /scan lookup). */
  move?: string;
  /** Open the BoxModal in edit-mode for this box id on mount. */
  focusBoxId?: string;
  /** Open the ItemModal in edit-mode for this item id on mount. */
  focusItemId?: string;
};

export const Route = createFileRoute("/moving")({
  component: MovingPage,
  validateSearch: (raw: Record<string, unknown>): MovingSearch => ({
    tab:
      typeof raw.tab === "string" && (MOVING_TABS as readonly string[]).includes(raw.tab)
        ? (raw.tab as MovingTab)
        : undefined,
    move: typeof raw.move === "string" ? raw.move : undefined,
    focusBoxId: typeof raw.focusBoxId === "string" ? raw.focusBoxId : undefined,
    focusItemId: typeof raw.focusItemId === "string" ? raw.focusItemId : undefined,
  }),
});

const ROOM_COLORS = [
  "#8b5cf6",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
  "#06b6d4",
  "#a855f7",
];

function MovingPage() {
  const qc = useQueryClient();

  // ----- Top-level selection: which project + which move -----
  const projectsQuery = useList<Project>("projects", "/projects");
  const propertiesQuery = useList<Property>("properties", "/properties");
  const movesQuery = useList<Move>("moves", "/moves");

  const projects = projectsQuery.data?.data ?? [];
  const properties = propertiesQuery.data?.data ?? [];
  const moves = movesQuery.data?.data ?? [];

  const search = Route.useSearch();
  const navigate = useNavigate();

  const [selectedMoveId, setSelectedMoveId] = useState<string | null>(
    search.move ?? null
  );
  useEffect(() => {
    if (!selectedMoveId && moves.length > 0) setSelectedMoveId(moves[0].id);
  }, [moves, selectedMoveId]);
  // If the URL specified a move and it's available, sync the selection.
  useEffect(() => {
    if (search.move && moves.some((m) => m.id === search.move)) {
      setSelectedMoveId(search.move);
    }
  }, [search.move, moves]);

  const selectedMove = moves.find((m) => m.id === selectedMoveId) ?? null;

  // Child collections depend on selected move.
  const roomsQuery = useQuery({
    queryKey: ["move-rooms", selectedMoveId],
    queryFn: () =>
      apiGet<ListResponse<MoveRoom>>(`/moves/${selectedMoveId}/rooms`),
    enabled: !!selectedMoveId,
  });
  const itemsQuery = useQuery({
    queryKey: ["move-items", selectedMoveId],
    queryFn: () =>
      apiGet<ListResponse<MoveItem>>(`/moves/${selectedMoveId}/items`),
    enabled: !!selectedMoveId,
  });
  const boxesQuery = useQuery({
    queryKey: ["move-boxes", selectedMoveId],
    queryFn: () =>
      apiGet<ListResponse<MoveBox>>(`/moves/${selectedMoveId}/boxes`),
    enabled: !!selectedMoveId,
  });
  const stickersQuery = useQuery({
    queryKey: ["move-stickers", selectedMoveId],
    queryFn: () =>
      apiGet<ListResponse<MoveSticker>>(`/moves/${selectedMoveId}/stickers`),
    enabled: !!selectedMoveId,
  });

  const rooms = roomsQuery.data?.data ?? [];
  const items = itemsQuery.data?.data ?? [];
  const boxes = boxesQuery.data?.data ?? [];
  const stickers = stickersQuery.data?.data ?? [];

  const createMove = useCreate<Move>("moves", "/moves");
  const updateMove = useUpdate<Move>("moves", "/moves");
  const removeMove = useRemove("moves", "/moves");

  const [tab, setTab] = useState<CanonicalTab>(canonicalTab(search.tab));
  // Honour URL ?tab= when it changes (deep links from /scan lookup).
  useEffect(() => {
    if (search.tab) setTab(canonicalTab(search.tab));
  }, [search.tab]);

  // Universal scan state — opens the camera scanner, resolves the code,
  // then routes the resolved target through the generic ScanActionSheet.
  const [universalScannerOpen, setUniversalScannerOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<ResolvedTarget | null>(null);

  // Shared cross-tab modal state (item/box edit, view-contents, "add
  // new" prefill from an unknown scan). Lifted here so any tab — or
  // the universal Scan action sheet — can open them.
  const [itemEdit, setItemEdit] = useState<MoveItem | null>(null);
  const [itemEditOpen, setItemEditOpen] = useState(false);
  const [itemPrefillBarcode, setItemPrefillBarcode] = useState<string | null>(null);
  const [boxEdit, setBoxEdit] = useState<MoveBox | null>(null);
  const [boxEditOpen, setBoxEditOpen] = useState(false);
  const [boxPrefillBarcode, setBoxPrefillBarcode] = useState<string | null>(null);
  const [viewBoxContents, setViewBoxContents] = useState<MoveBox | null>(null);

  // ----- Derived state + workflow dispatch -----
  // All declared BEFORE the early-return guards below — `useWorkflowDispatch`
  // is itself a hook, so it must run on every render or React fires the
  // "rendered more hooks than during the previous render" invariant when
  // the loading state transitions to data.
  const phase: WorkflowPhase = getMovePhase(boxes, items);
  const workflowContext: WorkflowContext = {
    move: selectedMove ?? ({} as Move),
    rooms,
    items,
    boxes,
    phase,
  };

  const dispatchProjectId = selectedMove?.project_id ?? "";
  const workflowDispatch = useWorkflowDispatch(
    selectedMoveId ?? "",
    dispatchProjectId,
    {
      onOpenItemModal: (item) => {
        setItemEdit(item);
        setItemPrefillBarcode(null);
        setItemEditOpen(true);
      },
      onOpenBoxModal: (box) => {
        setBoxEdit(box);
        setBoxPrefillBarcode(null);
        setBoxEditOpen(true);
      },
      onViewBoxContents: (box) => setViewBoxContents(box),
      onViewItemBox: (item) => {
        const box = boxes.find((b) => b.id === item.box_id);
        if (box) setViewBoxContents(box);
      },
      onChooseDisposition: (item) => {
        setItemEdit(item);
        setItemEditOpen(true);
      },
      onChooseDestinationRoom: (item) => {
        setItemEdit(item);
        setItemEditOpen(true);
      },
      onChooseBox: (item) => {
        setItemEdit(item);
        setItemEditOpen(true);
      },
      onChooseBoxDestinationRoom: (box) => {
        setBoxEdit(box);
        setBoxEditOpen(true);
      },
      onAddNewBox: (code) => {
        setBoxEdit(null);
        setBoxPrefillBarcode(code);
        setBoxEditOpen(true);
      },
      onAddNewItem: (code) => {
        setItemEdit(null);
        setItemPrefillBarcode(code);
        setItemEditOpen(true);
      },
      onPrintLabel: () => {
        setTab("tools");
      },
      onViewScanHistory: () => {
        setTab("problems");
      },
    }
  );

  const resolveScannedCode = (code: string): ResolvedTarget => {
    const box = boxes.find((b) => b.barcode === code);
    if (box) return { kind: "box", record: box };
    const item = items.find((i) => i.barcode === code);
    if (item) return { kind: "item", record: item };
    return { kind: "unknown", code };
  };

  const problemCount = items.filter(
    (i) => i.status === "missing" || i.status === "damaged"
  ).length;

  const tabDefs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "survey", label: "Survey" },
    { id: "move", label: "Move" },
    ...(problemCount > 0
      ? [{ id: "problems", label: "Problems", count: problemCount }]
      : []),
    { id: "tools", label: "Tools" },
  ];

  /* ---------- Loading / empty states ---------- */
  if (projectsQuery.isLoading || movesQuery.isLoading) {
    return (
      <PageShell title="Moving">
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm">Loading…</p>
        </div>
      </PageShell>
    );
  }

  if (projects.length === 0) {
    return (
      <PageShell title="Moving">
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<Truck className="h-9 w-9" />}
              title="Create a project first"
              description="Your moving plan links to a sell/buy project. Start one on the Home or Sell tab, then come back."
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (moves.length === 0) {
    return (
      <PageShell title="Moving">
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<Truck className="h-9 w-9" />}
              title="Plan your move"
              description="Tie this move to a project, your current home (origin), and the new home (destination from your buy pipeline)."
              action={
                <CreateMoveButton
                  projects={projects}
                  properties={properties}
                  onCreate={(payload) =>
                    createMove.mutate(payload, {
                      onSuccess: (res) => setSelectedMoveId(res.data.id),
                    })
                  }
                />
              }
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="Moving">
      <div className="space-y-4 pb-4">
        {/* Move switcher + universal Scan */}
        <div className="flex gap-2 items-center">
          <Select
            label=""
            value={selectedMoveId ?? ""}
            onChange={(e) => setSelectedMoveId(e.target.value || null)}
            options={moves.map((m) => ({
              value: m.id,
              label: moveLabel(m, projects, properties),
            }))}
          />
          <Button
            size="md"
            variant="primary"
            className="min-h-11"
            onClick={() => setUniversalScannerOpen(true)}
            disabled={!selectedMoveId}
            title="Scan a box or item"
          >
            <ScanLine className="h-4 w-4" />
            Scan
          </Button>
          <CreateMoveButton
            projects={projects}
            properties={properties}
            onCreate={(payload) =>
              createMove.mutate(payload, {
                onSuccess: (res) => setSelectedMoveId(res.data.id),
              })
            }
            compact
          />
        </div>

        <Tabs tabs={tabDefs} active={tab} onChange={(t) => setTab(t as CanonicalTab)} />

        {selectedMove && (
          <>
            {tab === "dashboard" && (
              <DashboardTab
                move={selectedMove}
                projects={projects}
                properties={properties}
                rooms={rooms}
                items={items}
                boxes={boxes}
                phase={phase}
                onJumpTab={setTab}
                onUpdate={(data) =>
                  updateMove.mutate({ id: selectedMove.id, data })
                }
                onDelete={() => {
                  if (confirm("Delete this move? Items, rooms, and boxes will be removed.")) {
                    removeMove.mutate(selectedMove.id, {
                      onSuccess: () => setSelectedMoveId(null),
                    });
                  }
                }}
              />
            )}
            {tab === "survey" && (
              <SurveyTab
                move={selectedMove}
                rooms={rooms}
                items={items}
                focusItemId={search.focusItemId}
                onFocusConsumed={() =>
                  navigate({
                    to: "/moving",
                    search: (prev) => ({ ...prev, focusItemId: undefined }),
                    replace: true,
                  })
                }
                onOpenItemEdit={(item) => {
                  setItemEdit(item);
                  setItemEditOpen(true);
                }}
              />
            )}
            {tab === "move" && (
              <MoveTab
                move={selectedMove}
                rooms={rooms}
                items={items}
                boxes={boxes}
                phase={phase}
                focusBoxId={search.focusBoxId}
                onFocusConsumed={() =>
                  navigate({
                    to: "/moving",
                    search: (prev) => ({ ...prev, focusBoxId: undefined }),
                    replace: true,
                  })
                }
                onScanResolve={(code) => {
                  const target = resolveScannedCode(code);
                  setScanTarget(target);
                }}
                onOpenBoxEdit={(box) => {
                  setBoxEdit(box);
                  setBoxEditOpen(true);
                }}
                onCreateBox={() => {
                  setBoxEdit(null);
                  setBoxPrefillBarcode(null);
                  setBoxEditOpen(true);
                }}
              />
            )}
            {tab === "problems" && (
              <ProblemsTab
                move={selectedMove}
                rooms={rooms}
                items={items}
                boxes={boxes}
                onOpenItemEdit={(item) => {
                  setItemEdit(item);
                  setItemEditOpen(true);
                }}
                onOpenBoxEdit={(box) => {
                  setBoxEdit(box);
                  setBoxEditOpen(true);
                }}
              />
            )}
            {tab === "tools" && (
              <ToolsTab
                move={selectedMove}
                rooms={rooms}
                items={items}
                boxes={boxes}
                stickers={stickers}
                onRefreshMove={() =>
                  qc.invalidateQueries({ queryKey: ["moves"] })
                }
              />
            )}
          </>
        )}

        {/* Universal scan: opens the camera, resolves the scanned code,
            then renders the generic ScanActionSheet with the workflow-
            engine-derived primary + secondary actions. */}
        <BarcodeScanner
          open={universalScannerOpen}
          onClose={() => setUniversalScannerOpen(false)}
          onScan={(code) => {
            setUniversalScannerOpen(false);
            const target = resolveScannedCode(code);
            setScanTarget(target);
          }}
          title="Scan a box or item"
        />
        <ScanActionSheet
          open={scanTarget !== null}
          target={scanTarget}
          context={workflowContext}
          onDispatch={async (action, target) => {
            await workflowDispatch.dispatch(action, target);
          }}
          onClose={() => setScanTarget(null)}
        />

        {/* Shared edit modals — lifted to MovingPage so any tab + the
            universal scan flow can open them. */}
        {selectedMove && (
          <ItemModal
            key={itemEdit?.id ?? `new-${itemPrefillBarcode ?? ""}`}
            open={itemEditOpen}
            onClose={() => {
              setItemEditOpen(false);
              setItemEdit(null);
              setItemPrefillBarcode(null);
            }}
            existing={
              itemEdit ??
              (itemPrefillBarcode
                ? ({ barcode: itemPrefillBarcode } as MoveItem)
                : null)
            }
            rooms={rooms}
            boxes={boxes}
            onSubmit={(payload) => {
              if (itemEdit) {
                fetch(`/api/v1/move-items/${itemEdit.id}`, {
                  method: "PATCH",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                }).then(() => {
                  qc.invalidateQueries({ queryKey: ["move-items", selectedMove.id] });
                  setItemEditOpen(false);
                  setItemEdit(null);
                });
              } else {
                apiPost("/move-items", {
                  ...payload,
                  move_id: selectedMove.id,
                }).then(() => {
                  qc.invalidateQueries({ queryKey: ["move-items", selectedMove.id] });
                  setItemEditOpen(false);
                  setItemPrefillBarcode(null);
                });
              }
            }}
          />
        )}

        {selectedMove && (
          <BoxModal
            key={boxEdit?.id ?? `new-${boxPrefillBarcode ?? ""}`}
            open={boxEditOpen}
            onClose={() => {
              setBoxEditOpen(false);
              setBoxEdit(null);
              setBoxPrefillBarcode(null);
            }}
            existing={
              boxEdit ??
              (boxPrefillBarcode
                ? ({ barcode: boxPrefillBarcode } as MoveBox)
                : null)
            }
            rooms={rooms}
            moveId={selectedMove.id}
            existingBarcodes={boxes.map((b) => b.barcode)}
            onSubmit={(payload) => {
              if (boxEdit) {
                fetch(`/api/v1/move-boxes/${boxEdit.id}`, {
                  method: "PATCH",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                }).then(() => {
                  qc.invalidateQueries({ queryKey: ["move-boxes", selectedMove.id] });
                  setBoxEditOpen(false);
                  setBoxEdit(null);
                });
              } else {
                apiPost("/move-boxes", {
                  ...payload,
                  move_id: selectedMove.id,
                }).then(() => {
                  qc.invalidateQueries({ queryKey: ["move-boxes", selectedMove.id] });
                  setBoxEditOpen(false);
                  setBoxPrefillBarcode(null);
                });
              }
            }}
          />
        )}

        {/* View-contents drawer — opened from the workflow engine via
            View contents / View box actions. Read-only quick view; the
            user can deep-edit by tapping the box. */}
        {viewBoxContents && (
          <ViewBoxContentsModal
            box={viewBoxContents}
            items={items.filter((i) => i.box_id === viewBoxContents.id)}
            onClose={() => setViewBoxContents(null)}
            onEditBox={() => {
              setBoxEdit(viewBoxContents);
              setViewBoxContents(null);
              setBoxEditOpen(true);
            }}
          />
        )}
      </div>
    </PageShell>
  );
}

function moveLabel(
  move: Move,
  projects: Project[],
  properties: Property[]
): string {
  const project = projects.find((p) => p.id === move.project_id);
  const dest = properties.find((p) => p.id === move.destination_property_id);
  const parts = [project?.name ?? "Move"];
  if (dest) parts.push(`→ ${dest.address.split(",")[0]}`);
  return parts.join(" ");
}

/* =========================================================== */
/*  Create Move                                                  */
/* =========================================================== */

function CreateMoveButton({
  projects,
  properties,
  onCreate,
  compact = false,
}: {
  projects: Project[];
  properties: Property[];
  onCreate: (payload: Record<string, unknown>) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="min-h-11" size={compact ? "md" : "lg"} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {compact ? "New" : "Plan a move"}
      </Button>
      <CreateMoveModal
        open={open}
        onClose={() => setOpen(false)}
        projects={projects}
        properties={properties}
        onSubmit={(payload) => {
          onCreate(payload);
          setOpen(false);
        }}
      />
    </>
  );
}

function CreateMoveModal({
  open,
  onClose,
  projects,
  properties,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  properties: Property[];
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [moveDate, setMoveDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setProjectId(projects[0]?.id ?? "");
    // Default origin = is_own_home property; destination = something from buy
    const ownHome = properties.find((p) => p.is_own_home);
    setOriginId(ownHome?.id ?? "");
    setDestinationId("");
    setMoveDate("");
  }, [open, projects, properties]);

  return (
    <Modal open={open} onClose={onClose} title="Plan a move">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!projectId) return;
          onSubmit({
            project_id: projectId,
            origin_property_id: originId || undefined,
            destination_property_id: destinationId || undefined,
            move_date: moveDate || undefined,
          });
        }}
      >
        <Select
          label="Project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="Choose a project"
        />
        <Select
          label="Current home (origin)"
          value={originId}
          onChange={(e) => setOriginId(e.target.value)}
          options={properties.map((p) => ({
            value: p.id,
            label: `${p.is_own_home ? "★ " : ""}${p.address}`,
          }))}
          placeholder="Pick the home you're leaving"
        />
        <Select
          label="New home (destination)"
          value={destinationId}
          onChange={(e) => setDestinationId(e.target.value)}
          options={properties.map((p) => ({ value: p.id, label: p.address }))}
          placeholder="Pick from your buy pipeline (optional)"
        />
        <Input
          type="date"
          label="Move date"
          value={moveDate}
          onChange={(e) => setMoveDate(e.target.value)}
        />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={!projectId}>
            Create move
          </Button>
        </div>
      </form>
    </Modal>
  );
}


function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="font-medium text-slate-900 dark:text-slate-100 text-right min-w-0">{children}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {value}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
        {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/* =========================================================== */
/*  Floor Plans (HERO)                                          */
/* =========================================================== */

function PlansTab({
  move,
  rooms,
  items,
  stickers,
  onRefreshMove,
}: {
  move: Move;
  rooms: MoveRoom[];
  items: MoveItem[];
  stickers: MoveSticker[];
  onRefreshMove: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<"origin" | "destination" | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [uploadSide, setUploadSide] = useState<"origin" | "destination" | null>(null);

  const originRooms = rooms.filter((r) => r.side === "origin");
  const destRooms = rooms.filter((r) => r.side === "destination");
  const originStickers = stickers.filter((s) => s.side === "origin");
  const destStickers = stickers.filter((s) => s.side === "destination");

  const originImage = useFloorPlanImage(move.origin_floor_plan_file_id);
  const destImage = useFloorPlanImage(move.destination_floor_plan_file_id);

  const createRoom = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/move-rooms", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["move-rooms", move.id] }),
  });
  // Rooms are now edited with sticker-like UX (move/resize/rotate), so
  // they need the same optimistic-update treatment: patch the cache in
  // onMutate so the drag feels instant, roll back on error, invalidate
  // on settle. This mirrors the `updateSticker` mutation below.
  const updateRoom = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetch(`/api/v1/move-rooms/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ["move-rooms", move.id] });
      const prev = qc.getQueryData<ListResponse<MoveRoom>>([
        "move-rooms",
        move.id,
      ]);
      if (prev) {
        qc.setQueryData<ListResponse<MoveRoom>>(["move-rooms", move.id], {
          ...prev,
          data: prev.data.map((r) =>
            r.id === id ? ({ ...r, ...data } as MoveRoom) : r
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["move-rooms", move.id], ctx.prev);
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["move-rooms", move.id] }),
  });
  const deleteRoom = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/move-rooms/${id}`, { method: "DELETE", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["move-rooms", move.id] }),
  });
  const assignRoom = useMutation({
    mutationFn: (body: { item_ids: string[]; destination_room_id: string | null }) =>
      apiPost(`/moves/${move.id}/assign-destination`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["move-items", move.id] }),
  });
  const updateItem = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetch(`/api/v1/move-items/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["move-items", move.id] }),
  });

  const createSticker = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiPost("/move-stickers", data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["move-stickers", move.id] }),
  });
  const updateSticker = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetch(`/api/v1/move-stickers/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    // Optimistic update so drag feels smooth — we update the cache right
    // away, then invalidate after the server responds.
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ["move-stickers", move.id] });
      const prev = qc.getQueryData<ListResponse<MoveSticker>>([
        "move-stickers",
        move.id,
      ]);
      if (prev) {
        qc.setQueryData<ListResponse<MoveSticker>>(
          ["move-stickers", move.id],
          {
            ...prev,
            data: prev.data.map((s) =>
              s.id === id ? ({ ...s, ...data } as MoveSticker) : s
            ),
          }
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["move-stickers", move.id], ctx.prev);
      }
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["move-stickers", move.id] }),
  });
  const deleteSticker = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/move-stickers/${id}`, {
        method: "DELETE",
        credentials: "include",
      }).then((r) => r.json()),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["move-stickers", move.id] }),
  });

  // Clears the floor-plan-file association on the move (doesn't delete
  // the file itself — the image stays in the user's gallery so they can
  // re-attach it later or attach it elsewhere).
  const removePlan = useMutation({
    mutationFn: (targetSide: "origin" | "destination") => {
      const key =
        targetSide === "origin"
          ? "origin_floor_plan_file_id"
          : "destination_floor_plan_file_id";
      return fetch(`/api/v1/moves/${move.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: null }),
      }).then((r) => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["moves"] });
      onRefreshMove();
    },
  });

  const handleRemovePlan = (targetSide: "origin" | "destination") => {
    if (
      !confirm(
        "Remove this floor plan? The image will stay in your file gallery — only the link to this move is cleared."
      )
    ) {
      return;
    }
    removePlan.mutate(targetSide);
  };

  /**
   * Clone the built-in EXAMPLE plan into real rooms + stickers for this
   * side. Rooms come first (so sticker POSTs happen in the meantime),
   * then stickers fan out in parallel. After both finish, caches are
   * invalidated so the canvas swaps from the dashed preview to the real
   * records the user can freely rename and edit.
   *
   * We intentionally do NOT prefix room names with a plan title here —
   * the labels are drawn on top of the plan and extra prefixes crowd the
   * canvas. The user can rename any room on the Edit plan screen.
   */
  const handleUseExample = async (targetSide: "origin" | "destination") => {
    if (
      !confirm(
        "Save this example as your own plan? You can rename, move, or delete any room or sticker afterwards."
      )
    ) {
      return;
    }
    try {
      // Rooms are created sequentially so the sort_order stays stable.
      // We send both polygon (legacy) and rect (new sticker-compatible
      // geometry) — the editor renders from the rect, drop targets use
      // the rect, and polygon stays for any older client that still
      // reads from it.
      for (let i = 0; i < EXAMPLE_ROOMS.length; i++) {
        const room = EXAMPLE_ROOMS[i];
        await apiPost("/move-rooms", {
          move_id: move.id,
          side: targetSide,
          name: room.name,
          color: room.color,
          polygon: room.polygon,
          x: room.x,
          y: room.y,
          width: room.width,
          height: room.height,
          rotation: room.rotation,
          sort_order: i,
        });
      }
      // Stickers are independent — fire them in parallel.
      await Promise.all(
        EXAMPLE_STICKERS.map((s, i) =>
          apiPost("/move-stickers", {
            move_id: move.id,
            side: targetSide,
            kind: s.kind,
            x: s.x,
            y: s.y,
            width: s.width,
            height: s.height,
            rotation: s.rotation,
            label: s.label,
            sort_order: i,
          })
        )
      );
      qc.invalidateQueries({ queryKey: ["move-rooms", move.id] });
      qc.invalidateQueries({ queryKey: ["move-stickers", move.id] });
    } catch (err) {
      console.error("Failed to save example plan", err);
      alert(
        "Something went wrong saving the example plan. Please try again."
      );
    }
  };

  const handleCreateSticker = (
    side: "origin" | "destination",
    partial: {
      kind: MoveStickerKind;
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      label?: string;
    }
  ) => {
    createSticker.mutate({
      move_id: move.id,
      side,
      kind: partial.kind,
      x: partial.x,
      y: partial.y,
      width: partial.width,
      height: partial.height,
      rotation: partial.rotation,
      label: partial.label,
      sort_order: stickers.filter((s) => s.side === side).length,
    });
  };

  const toggleItemSelected = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDrop = (itemIds: string[], roomId: string, side: "origin" | "destination") => {
    if (side === "destination") {
      // HERO path: bulk-reassign destination room in one API call.
      assignRoom.mutate({ item_ids: itemIds, destination_room_id: roomId });
    } else {
      // Origin-side drop: update each item's origin_room_id.
      itemIds.forEach((id) =>
        updateItem.mutate({ id, data: { origin_room_id: roomId } })
      );
    }
    setSelectedItemIds(new Set());
  };

  /**
   * Create a room. Historically rooms were drawn as polygons; after the
   * rooms-as-stickers refactor, the editor stamps a rectangle instead.
   * We keep the old polygon-based call sites (FloorPlanCanvas's inline
   * draw tool) working by accepting an optional polygon, and prefer
   * rect fields when the caller supplies them.
   */
  const handleCreateRoom = (
    side: "origin" | "destination",
    partial: {
      name: string;
      polygon?: { x: number; y: number }[];
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      rotation?: number;
    }
  ) => {
    const color =
      ROOM_COLORS[
        (rooms.filter((r) => r.side === side).length) % ROOM_COLORS.length
      ];
    createRoom.mutate({
      move_id: move.id,
      side,
      name: partial.name,
      color,
      ...(partial.polygon ? { polygon: partial.polygon } : {}),
      ...(partial.x !== undefined ? { x: partial.x } : {}),
      ...(partial.y !== undefined ? { y: partial.y } : {}),
      ...(partial.width !== undefined ? { width: partial.width } : {}),
      ...(partial.height !== undefined ? { height: partial.height } : {}),
      ...(partial.rotation !== undefined ? { rotation: partial.rotation } : {}),
      sort_order: rooms.filter((r) => r.side === side).length,
    });
  };

  // The banner wording depends on state. When there are no items yet,
  // "drag items between plans" is misleading — the user needs to add
  // items on the Items tab before anything is draggable.
  const hasItems = items.length > 0;
  const hasAnyRooms = rooms.length > 0;

  return (
    <div className="space-y-3">
      {hasItems ? (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <b>Drag items between plans</b> — tap item chips to multi-select,
          then drag any one of them onto a room on the new-home plan. Click{" "}
          <b>Edit plan</b> to open the full editor and add rooms, doors,
          windows, furniture stickers and more.
        </div>
      ) : (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
          {hasAnyRooms ? (
            <>
              <b>Nice — your rooms are drawn.</b> Now add items on the{" "}
              <b>Items</b> tab. They'll show up as draggable chips below each
              room so you can assign them from your current home to your new
              home by dragging.
            </>
          ) : (
            <>
              <b>Start your plan.</b> Either click <b>Save as my plan</b> on
              the example below, click <b>Edit plan</b> to draw your own, or
              click <b>Upload plan</b> to add a photo. Once you have rooms,
              add items on the <b>Items</b> tab and drag them between plans.
            </>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <FloorPlanCanvas
          side="origin"
          title="Current home"
          imageUrl={originImage}
          rooms={originRooms}
          stickers={originStickers}
          items={items}
          selectedItemIds={selectedItemIds}
          onDropItems={handleDrop}
          onToggleItemSelected={toggleItemSelected}
          onCreateRoom={(poly, name) =>
            handleCreateRoom("origin", { name, polygon: poly })
          }
          onDeleteRoom={(id) => {
            if (confirm("Delete this room? Items in it become unassigned.")) {
              deleteRoom.mutate(id);
            }
          }}
          editing={false}
          onToggleEditing={() => setEditing("origin")}
          onUploadPlan={() => setUploadSide("origin")}
          onRemovePlan={
            move.origin_floor_plan_file_id
              ? () => handleRemovePlan("origin")
              : undefined
          }
          exampleRooms={EXAMPLE_ROOMS}
          exampleStickers={EXAMPLE_STICKERS}
          onUseExample={() => handleUseExample("origin")}
        />
        <FloorPlanCanvas
          side="destination"
          title="New home"
          imageUrl={destImage}
          rooms={destRooms}
          stickers={destStickers}
          items={items}
          selectedItemIds={selectedItemIds}
          onDropItems={handleDrop}
          onToggleItemSelected={toggleItemSelected}
          onCreateRoom={(poly, name) =>
            handleCreateRoom("destination", { name, polygon: poly })
          }
          onDeleteRoom={(id) => {
            if (confirm("Delete this room? Items targeting it become unassigned.")) {
              deleteRoom.mutate(id);
            }
          }}
          editing={false}
          onToggleEditing={() => setEditing("destination")}
          onUploadPlan={() => setUploadSide("destination")}
          onRemovePlan={
            move.destination_floor_plan_file_id
              ? () => handleRemovePlan("destination")
              : undefined
          }
          exampleRooms={EXAMPLE_ROOMS}
          exampleStickers={EXAMPLE_STICKERS}
          onUseExample={() => handleUseExample("destination")}
        />
      </div>

      <UploadFloorPlanModal
        open={uploadSide !== null}
        onClose={() => setUploadSide(null)}
        side={uploadSide}
        moveId={move.id}
        onUploaded={() => {
          setUploadSide(null);
          onRefreshMove();
        }}
      />

      {editing && (
        <FloorPlanEditor
          moveId={move.id}
          side={editing}
          title={editing === "origin" ? "Current home" : "New home"}
          imageUrl={editing === "origin" ? originImage : destImage}
          rooms={editing === "origin" ? originRooms : destRooms}
          stickers={editing === "origin" ? originStickers : destStickers}
          onClose={() => setEditing(null)}
          onUploadPlan={() => setUploadSide(editing)}
          onRemovePlan={
            (editing === "origin"
              ? move.origin_floor_plan_file_id
              : move.destination_floor_plan_file_id)
              ? () => handleRemovePlan(editing)
              : undefined
          }
          onCreateRoom={(partial) => handleCreateRoom(editing, partial)}
          onUpdateRoom={(id, changes) =>
            updateRoom.mutate({
              id,
              data: changes as Record<string, unknown>,
            })
          }
          onDeleteRoom={(id) => deleteRoom.mutate(id)}
          onCreateSticker={(partial) => handleCreateSticker(editing, partial)}
          onUpdateSticker={(id, changes) =>
            updateSticker.mutate({ id, data: changes as Record<string, unknown> })
          }
          onDeleteSticker={(id) => deleteSticker.mutate(id)}
        />
      )}
    </div>
  );
}

/**
 * Fetches the floor plan image as a blob URL for the given file id.
 * Returns null while loading or if no file is associated.
 */
function useFloorPlanImage(fileId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fileId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    (async () => {
      try {
        const res = await fetch(`/api/v1/files/${fileId}/download`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(blobUrl);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [fileId]);
  return url;
}

function UploadFloorPlanModal({
  open,
  onClose,
  side,
  moveId,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  side: "origin" | "destination" | null;
  moveId: string;
  onUploaded: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"upload" | "gallery">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Gallery source — list existing image files the user already uploaded.
  const galleryQuery = useQuery({
    queryKey: ["files"],
    queryFn: () => apiGet<ListResponse<FileRecord>>("/files"),
    enabled: open && mode === "gallery",
  });
  const galleryImages = useMemo(() => {
    const all = galleryQuery.data?.data ?? [];
    return all
      .filter((f) => f.mime_type.startsWith("image/"))
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }, [galleryQuery.data]);

  useEffect(() => {
    if (!open) {
      setMode("upload");
      setFile(null);
      setCameraOpen(false);
      setSelectedFileId(null);
    }
  }, [open]);

  const patchMoveWithFile = async (fileId: string) => {
    if (!side) return;
    const key =
      side === "origin"
        ? "origin_floor_plan_file_id"
        : "destination_floor_plan_file_id";
    await fetch(`/api/v1/moves/${moveId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: fileId }),
    });
    qc.invalidateQueries({ queryKey: ["moves"] });
    onUploaded();
  };

  const submit = async () => {
    if (!side) return;
    setSaving(true);
    try {
      if (mode === "gallery") {
        if (!selectedFileId) return;
        await patchMoveWithFile(selectedFileId);
      } else {
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", "other");
        const res = await apiUpload<{ data: FileRecord }>("/files/upload", fd);
        await patchMoveWithFile(res.data.id);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!side) return null;

  const canSave = mode === "gallery" ? !!selectedFileId : !!file;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Upload ${side === "origin" ? "current home" : "new home"} floor plan`}
    >
      <div className="space-y-4">
        {/* Source switcher */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 -mx-1 px-1 pb-3">
          <Button
            type="button"
            variant={mode === "upload" ? "primary" : "secondary"}
            size="sm"
            className="min-h-10"
            onClick={() => setMode("upload")}
          >
            <Upload className="h-4 w-4" />
            New upload
          </Button>
          <Button
            type="button"
            variant={mode === "gallery" ? "primary" : "secondary"}
            size="sm"
            className="min-h-10"
            onClick={() => setMode("gallery")}
          >
            <Images className="h-4 w-4" />
            From Gallery
          </Button>
        </div>

        {mode === "upload" ? (
          <>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-12"
                onClick={() => setCameraOpen(true)}
              >
                <Camera className="h-4 w-4" />
                Take photo
              </Button>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            {file && (
              <p className="text-xs text-slate-500">
                {file.name} — {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </>
        ) : (
          <div className="space-y-2">
            {galleryQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : galleryImages.length === 0 ? (
              <EmptyState
                icon={<Images className="h-10 w-10" />}
                title="Gallery is empty"
                description="Take photos or upload images in the Gallery tab first, then you can reuse them here."
              />
            ) : (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tap an image to use it as the floor plan.
                </p>
                <div className="grid grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2">
                  {galleryImages.map((img) => {
                    const selected = selectedFileId === img.id;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => setSelectedFileId(img.id)}
                        className={
                          "relative aspect-square overflow-hidden rounded-md border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 " +
                          (selected
                            ? "border-primary-500 ring-2 ring-primary-500/40"
                            : "border-transparent hover:border-slate-300 dark:hover:border-slate-600")
                        }
                        title={img.filename ?? ""}
                      >
                        <img
                          src={`/api/v1/files/${img.id}/download`}
                          alt={img.filename ?? ""}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        {selected && (
                          <div className="absolute top-1 right-1 bg-primary-500 text-white rounded-full p-0.5 shadow">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 min-h-12"
            disabled={!canSave || saving}
            onClick={submit}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "gallery" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {mode === "gallery" ? "Use selected" : "Upload"}
          </Button>
        </div>
      </div>

      <CameraCapture
        open={cameraOpen}
        onCapture={(f) => {
          setFile(f);
          setCameraOpen(false);
        }}
        onClose={() => setCameraOpen(false)}
        title="Photograph floor plan"
      />
    </Modal>
  );
}

function ItemModal({
  open,
  onClose,
  existing,
  rooms,
  boxes,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  existing: MoveItem | null;
  rooms: MoveRoom[];
  boxes: MoveBox[];
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [originRoom, setOriginRoom] = useState("");
  const [destRoom, setDestRoom] = useState("");
  const [boxId, setBoxId] = useState("");
  const [status, setStatus] = useState<string>("surveyed");
  const [disposition, setDisposition] = useState<MoveItemDisposition>("unassessed");
  const [category, setCategory] = useState<string>("");
  const [fragile, setFragile] = useState(false);
  const [notes, setNotes] = useState("");
  const [barcode, setBarcode] = useState("");
  const [codeType, setCodeType] = useState<string>("qr");

  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setQuantity(existing?.quantity ?? 1);
    setOriginRoom(existing?.origin_room_id ?? "");
    setDestRoom(existing?.destination_room_id ?? "");
    setBoxId(existing?.box_id ?? "");
    setStatus(existing?.status ?? "surveyed");
    setDisposition(((existing?.disposition as MoveItemDisposition) ?? "unassessed"));
    setCategory(existing?.category ?? "");
    setFragile(existing?.fragile ?? false);
    setNotes(existing?.notes ?? "");
    setBarcode(existing?.barcode ?? "");
    setCodeType(existing?.code_type ?? "qr");
  }, [open, existing?.id]);

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit item" : "Add item"}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            name: name.trim(),
            quantity,
            origin_room_id: originRoom || undefined,
            destination_room_id: destRoom || undefined,
            box_id: boxId || undefined,
            status,
            disposition,
            category: category || undefined,
            fragile,
            notes: notes || undefined,
            // Empty string clears an existing per-item barcode; the
            // schema accepts null via .nullish().
            barcode: barcode.trim() ? barcode.trim() : null,
            code_type: codeType,
          });
        }}
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            label="Quantity"
            value={String(quantity)}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
          />
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={MOVE_ITEM_CATEGORIES.map((c) => ({ value: c, label: capitalize(c) }))}
            placeholder="—"
          />
        </div>
        <Select
          label="From (current-home room)"
          value={originRoom}
          onChange={(e) => setOriginRoom(e.target.value)}
          options={rooms.filter((r) => r.side === "origin").map((r) => ({ value: r.id, label: r.name }))}
          placeholder="Unassigned"
        />
        <Select
          label="To (new-home room)"
          value={destRoom}
          onChange={(e) => setDestRoom(e.target.value)}
          options={rooms.filter((r) => r.side === "destination").map((r) => ({ value: r.id, label: r.name }))}
          placeholder="Unassigned"
        />
        <Select
          label="Box"
          value={boxId}
          onChange={(e) => setBoxId(e.target.value)}
          options={boxes.map((b) => ({ value: b.id, label: `${b.label} (${b.barcode})` }))}
          placeholder="Not in a box"
        />
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={MOVE_ITEM_STATUSES.map((s) => ({ value: s, label: capitalize(s.replace(/_/g, " ")) }))}
          />
          <Select
            label="Disposition"
            value={disposition}
            onChange={(e) => setDisposition(e.target.value as MoveItemDisposition)}
            options={MOVE_ITEM_DISPOSITIONS.map((d) => ({
              value: d,
              label: MOVE_ITEM_DISPOSITION_LABELS[d],
            }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={fragile}
            onChange={(e) => setFragile(e.target.checked)}
            className="h-4 w-4"
          />
          Fragile
        </label>
        <Input
          label="Per-item barcode (optional)"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="Leave blank unless this item is tracked on its own"
        />
        {barcode.trim() && (
          <Select
            label="Barcode type"
            value={codeType}
            onChange={(e) => setCodeType(e.target.value)}
            options={MOVE_CODE_TYPES.map((c) => ({
              value: c,
              label: c === "qr" ? "QR code" : "Code 128 (1D)",
            }))}
          />
        )}
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function BulkCreateBoxesModal({
  open,
  onClose,
  existingCount,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  existingCount: number;
  pending: boolean;
  onSubmit: (data: { count: number; code_type: string; label_prefix: string }) => void;
}) {
  const [count, setCount] = useState(20);
  const [codeType, setCodeType] = useState<string>("qr");
  const [labelPrefix, setLabelPrefix] = useState("Box");

  useEffect(() => {
    if (!open) return;
    setCount(20);
    setCodeType("qr");
    setLabelPrefix("Box");
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Bulk create boxes">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ count, code_type: codeType, label_prefix: labelPrefix.trim() || "Box" });
        }}
      >
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pre-generate empty boxes with auto-numbered labels and unique
          barcodes. Print the labels now, stick them on cardboard, and
          assign destinations as you pack.
        </p>
        <Input
          label="How many?"
          type="number"
          min={1}
          max={200}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
          required
        />
        <Input
          label="Label prefix"
          value={labelPrefix}
          onChange={(e) => setLabelPrefix(e.target.value)}
          placeholder="Box"
        />
        <Select
          label="Barcode type"
          value={codeType}
          onChange={(e) => setCodeType(e.target.value)}
          options={MOVE_CODE_TYPES.map((c) => ({
            value: c,
            label: c === "qr" ? "QR code (recommended)" : "Code 128 (1D barcode)",
          }))}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Labels will continue numbering from where existing boxes leave off
          ({existingCount} so far).
        </p>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={pending || count < 1}>
            {pending ? "Creating…" : `Create ${count} ${count === 1 ? "box" : "boxes"}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function generateBarcode(existing: string[]): string {
  // Short, printable, unique-ish ID. Format: BOX-XXXXXX where X is base36.
  for (let tries = 0; tries < 20; tries++) {
    const code =
      "BOX-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    if (!existing.includes(code)) return code;
  }
  return "BOX-" + Date.now().toString(36).toUpperCase();
}

function BoxModal({
  open,
  onClose,
  existing,
  rooms,
  existingBarcodes,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  existing: MoveBox | null;
  rooms: MoveRoom[];
  moveId: string;
  existingBarcodes: string[];
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [label, setLabel] = useState("");
  const [barcode, setBarcode] = useState("");
  const [codeType, setCodeType] = useState<string>("qr");
  const [destRoom, setDestRoom] = useState("");
  const [priority, setPriority] = useState("normal");
  const [fragile, setFragile] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel(existing?.label ?? "");
    setBarcode(existing?.barcode ?? generateBarcode(existingBarcodes));
    setCodeType(existing?.code_type ?? "qr");
    setDestRoom(existing?.destination_room_id ?? "");
    setPriority(existing?.priority ?? "normal");
    setFragile(existing?.fragile ?? false);
    setNotes(existing?.notes ?? "");
  }, [open, existing?.id]);

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit box" : "New box"}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            label: label.trim(),
            barcode: barcode.trim(),
            code_type: codeType,
            destination_room_id: destRoom || undefined,
            priority,
            fragile,
            notes: notes || undefined,
          });
        }}
      >
        <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="e.g. Kitchen pots 01" />
        <div className="flex gap-2 items-end">
          <Input
            label="Barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value.toUpperCase())}
            required
          />
          <Button type="button" variant="secondary" className="min-h-12" onClick={() => setBarcode(generateBarcode(existingBarcodes))}>
            Regenerate
          </Button>
        </div>
        <Select
          label="Barcode type"
          value={codeType}
          onChange={(e) => setCodeType(e.target.value)}
          options={MOVE_CODE_TYPES.map((c) => ({
            value: c,
            label: c === "qr" ? "QR code" : "Code 128 (1D)",
          }))}
        />
        <Select
          label="Destination room"
          value={destRoom}
          onChange={(e) => setDestRoom(e.target.value)}
          options={rooms.filter((r) => r.side === "destination").map((r) => ({ value: r.id, label: r.name }))}
          placeholder="Unassigned"
        />
        <Select
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          options={MOVE_BOX_PRIORITIES.map((p) => ({
            value: p,
            label: capitalize(p.replace(/_/g, " ")),
          }))}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={fragile} onChange={(e) => setFragile(e.target.checked)} className="h-4 w-4" />
          Fragile
        </label>
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={!label.trim() || !barcode.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* =========================================================== */
/*  Labels (print)                                              */
/* =========================================================== */

const LABEL_TEMPLATE_KEY = "homelhar-label-template";

const LABEL_TEMPLATE_LABELS: Record<MoveLabelTemplate, string> = {
  "a4-8up": "A4 — 8 per sheet (99×67mm, Avery L7165/J8165)",
  lc30: "LC30 — 30 per sheet (64×25mm, compact)",
};

function LabelsTab({
  moveId,
  boxes,
  items,
  rooms,
}: {
  moveId: string;
  boxes: MoveBox[];
  items: MoveItem[];
  rooms: MoveRoom[];
}) {
  const qc = useQueryClient();
  const [printOpen, setPrintOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Persist the last-used template — most users print onto the same
  // stock every time, no point making them re-pick.
  const [template, setTemplate] = useState<MoveLabelTemplate>(() => {
    if (typeof window === "undefined") return "a4-8up";
    const saved = window.localStorage.getItem(LABEL_TEMPLATE_KEY);
    return (MOVE_LABEL_TEMPLATES as readonly string[]).includes(saved ?? "")
      ? (saved as MoveLabelTemplate)
      : "a4-8up";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LABEL_TEMPLATE_KEY, template);
    }
  }, [template]);

  // Drop any selected ids that no longer exist (e.g. after a delete or
  // refetch). Keeps the selection set honest without manual cleanup.
  useEffect(() => {
    setSelected((prev) => {
      const live = new Set(boxes.map((b) => b.id));
      const next = new Set<string>();
      let changed = false;
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [boxes]);

  const itemsByBox = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      if (!it.box_id) continue;
      map.set(it.box_id, (map.get(it.box_id) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const allSelected = boxes.length > 0 && selected.size === boxes.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(boxes.map((b) => b.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`/api/v1/moves/${moveId}/boxes/bulk-delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(`Bulk delete failed (${res.status})`);
      return res.json() as Promise<{ deleted: number; ids: string[] }>;
    },
    onSuccess: () => {
      setSelected(new Set());
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["move-boxes", moveId] });
      qc.invalidateQueries({ queryKey: ["move-items", moveId] });
    },
  });

  const selectedBoxes = boxes.filter((b) => selected.has(b.id));
  const selectedItemCount = selectedBoxes.reduce(
    (sum, b) => sum + (itemsByBox.get(b.id) ?? 0),
    0,
  );

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-3">
            <Printer className="h-8 w-8 text-primary-500" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Print box labels
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {boxes.length} {boxes.length === 1 ? "box" : "boxes"} ready to print.
                A4-8up uses QR or Code 128 per box; LC30 uses Code 128 with a one-line caption.
              </p>
            </div>
            <Button className="min-h-11" onClick={() => setPrintOpen(true)} disabled={boxes.length === 0}>
              <Printer className="h-4 w-4" />
              Open
            </Button>
          </div>
          <Select
            label="Label sheet"
            value={template}
            onChange={(e) => setTemplate(e.target.value as MoveLabelTemplate)}
            options={MOVE_LABEL_TEMPLATES.map((t) => ({
              value: t,
              label: LABEL_TEMPLATE_LABELS[t],
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Review &amp; delete labels</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tick the labels you no longer need and delete them in one go.
            Items inside a deleted box are kept — they just lose their box
            assignment so you can re-pack them.
          </p>

          {boxes.length === 0 ? (
            <EmptyState
              title="No labels yet"
              description="Create boxes or use Tools → Bulk create to generate a stack of labels."
            />
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer min-h-11">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary-500"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                  />
                  <span>
                    {selected.size === 0
                      ? `Select all (${boxes.length})`
                      : `${selected.size} of ${boxes.length} selected`}
                  </span>
                </label>
                <Button
                  variant="danger"
                  className="ml-auto min-h-11"
                  disabled={selected.size === 0 || bulkDelete.isPending}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete {selected.size > 0 ? selected.size : ""} selected
                </Button>
              </div>

              <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-100 dark:divide-slate-800">
                {boxes.map((box) => {
                  const itemCount = itemsByBox.get(box.id) ?? 0;
                  const checked = selected.has(box.id);
                  return (
                    <label
                      key={box.id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary-500 flex-shrink-0"
                        checked={checked}
                        onChange={() => toggleOne(box.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {box.label}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                          {box.barcode}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {itemCount > 0 && (
                          <Badge variant="default">
                            {itemCount} {itemCount === 1 ? "item" : "items"}
                          </Badge>
                        )}
                        {box.fragile && <Badge variant="primary">Fragile</Badge>}
                        <StatusBadge status={box.status} />
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <LabelSheet
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        boxes={boxes}
        items={items}
        rooms={rooms}
        template={template}
      />

      {confirmOpen && (
        <Modal
          open
          onClose={() => !bulkDelete.isPending && setConfirmOpen(false)}
          title={`Delete ${selected.size} ${selected.size === 1 ? "label" : "labels"}?`}
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              This permanently removes {selected.size}{" "}
              {selected.size === 1 ? "box" : "boxes"} from this move.
              {selectedItemCount > 0 && (
                <>
                  {" "}
                  <span className="font-medium">
                    {selectedItemCount}{" "}
                    {selectedItemCount === 1 ? "item" : "items"}
                  </span>{" "}
                  will be unassigned but kept.
                </>
              )}
            </p>
            <div className="max-h-40 overflow-y-auto text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded p-2 space-y-0.5">
              {selectedBoxes.slice(0, 50).map((b) => (
                <div key={b.id} className="truncate">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {b.label}
                  </span>{" "}
                  <span className="font-mono">({b.barcode})</span>
                </div>
              ))}
              {selectedBoxes.length > 50 && (
                <div className="italic">
                  …and {selectedBoxes.length - 50} more
                </div>
              )}
            </div>
            {bulkDelete.isError && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Couldn't delete. Try again, or refresh and re-select.
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                className="flex-1 min-h-11"
                onClick={() => setConfirmOpen(false)}
                disabled={bulkDelete.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1 min-h-11"
                onClick={() => bulkDelete.mutate([...selected])}
                disabled={bulkDelete.isPending}
              >
                <Trash2 className="h-4 w-4" />
                {bulkDelete.isPending
                  ? "Deleting…"
                  : `Delete ${selected.size}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* =========================================================== */
/*  Workflow tabs (Survey, Declutter, Stage, Pack, Load,        */
/*  Unpack, Exceptions)                                         */
/*                                                              */
/*  These thin wrappers sit on top of the existing items / boxes/*/
/*  scan-events API. They reuse ItemModal / BoxModal /          */
/*  BulkCreateBoxesModal where useful — workflow is presentation,*/
/*  not a parallel data model.                                  */
/* =========================================================== */

/** Shared mutation helpers used by several workflow tabs. */
function useItemMutations(moveId: string) {
  const qc = useQueryClient();
  return {
    update: useMutation({
      mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
        fetch(`/api/v1/move-items/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }).then((r) => r.json()),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["move-items", moveId] }),
    }),
    create: useMutation({
      mutationFn: (data: Record<string, unknown>) => apiPost("/move-items", data),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["move-items", moveId] }),
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        fetch(`/api/v1/move-items/${id}`, { method: "DELETE", credentials: "include" })
          .then((r) => r.json()),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["move-items", moveId] }),
    }),
  };
}

function useRoomMutations(moveId: string) {
  const qc = useQueryClient();
  return {
    update: useMutation({
      mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
        fetch(`/api/v1/move-rooms/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }).then((r) => r.json()),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["move-rooms", moveId] }),
    }),
  };
}

function useBoxStatusTransition(moveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      fetch(`/api/v1/move-boxes/${id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["move-boxes", moveId] });
      qc.invalidateQueries({ queryKey: ["move-items", moveId] });
      qc.invalidateQueries({ queryKey: ["move-scan-events", moveId] });
    },
  });
}

function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/tasks", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

/* =========================================================== */
/*  Dashboard                                                   */
/* =========================================================== */

/** Dashboard is the home tab. It shows what the user has done so far
 *  (progress cards), what the app thinks they should do next
 *  (next-action prompts), and a compact "current focus" hint derived
 *  from the inferred move phase. The detailed counts are kept here
 *  because users still want a quick at-a-glance read of state — but
 *  every counter is paired with a prompt so the user can click in. */
function DashboardTab({
  move,
  projects,
  properties,
  rooms,
  items,
  boxes,
  phase,
  onJumpTab,
  onUpdate,
  onDelete,
}: {
  move: Move;
  projects: Project[];
  properties: Property[];
  rooms: MoveRoom[];
  items: MoveItem[];
  boxes: MoveBox[];
  phase: WorkflowPhase;
  onJumpTab: (tab: CanonicalTab) => void;
  onUpdate: (data: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const project = projects.find((p) => p.id === move.project_id);
  const origin = properties.find((p) => p.id === move.origin_property_id);
  const dest = properties.find((p) => p.id === move.destination_property_id);

  const prompts = useMemo(
    () =>
      getNextActionPrompts({
        move,
        rooms,
        items,
        boxes,
        phase,
      }),
    [move, rooms, items, boxes, phase]
  );

  // Progress percentages — gentle, not exact. Helpful for the
  // sense-of-progress bars in each card; the numbers under them are
  // the real source of truth.
  const itemsActive = items.filter((i) => i.status !== "removed");
  const itemsAssessed = itemsActive.filter((i) => i.disposition !== "unassessed");
  const surveyProgress =
    itemsActive.length === 0 ? 0 : itemsAssessed.length / itemsActive.length;

  const boxesActive = boxes.length;
  const boxesPacked = boxes.filter(
    (b) => b.status !== "preparing"
  ).length;
  const packProgress = boxesActive === 0 ? 0 : boxesPacked / boxesActive;

  const boxesDelivered = boxes.filter(
    (b) => b.status === "delivered" || b.status === "unpacked"
  ).length;
  const moveDayProgress = boxesActive === 0 ? 0 : boxesDelivered / boxesActive;

  const dayOneBoxes = boxes.filter((b) => b.priority === "first_night");
  const dayOnePacked = dayOneBoxes.filter((b) => b.status !== "preparing").length;

  const removalCount = itemsActive.filter(
    (i) =>
      i.disposition === "sell" ||
      i.disposition === "donate" ||
      i.disposition === "recycle" ||
      i.disposition === "dump"
  ).length;
  const removedCount = items.filter((i) => i.status === "removed").length;

  return (
    <div className="space-y-3">
      {/* Move identity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Move details</CardTitle>
          <StatusBadge status={move.status} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Project">{project?.name ?? "—"}</Row>
          <Row label="From">
            {origin ? (
              <span className="flex items-center gap-1 min-w-0">
                <Home className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{origin.address}</span>
              </span>
            ) : (
              "—"
            )}
          </Row>
          <Row label="To">
            {dest ? (
              <span className="flex items-center gap-1 min-w-0">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{dest.address}</span>
              </span>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Move date">{move.move_date || "Not set"}</Row>
          <Row label="Current focus">{PHASE_LABELS[phase]}</Row>
        </CardContent>
      </Card>

      {/* Next actions — the heart of the dashboard. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next useful actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {prompts.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
              You're all caught up. Nothing's waiting on you.
            </p>
          ) : (
            prompts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => p.tab && onJumpTab(p.tab)}
                className="w-full flex items-center justify-between gap-2 text-left py-2 px-3 rounded-md bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
              >
                <span className="truncate">{p.label}</span>
                <ChevronRight />
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {/* Progress cards — quick visual read on each phase. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <ProgressRow
            label="Survey"
            fraction={surveyProgress}
            caption={`${itemsAssessed.length} / ${itemsActive.length} items decided`}
          />
          <ProgressRow
            label="Packing"
            fraction={packProgress}
            caption={`${boxesPacked} / ${boxesActive || 0} boxes packed`}
          />
          <ProgressRow
            label="Move day"
            fraction={moveDayProgress}
            caption={`${boxesDelivered} / ${boxesActive || 0} boxes delivered`}
          />
          {dayOneBoxes.length > 0 && (
            <ProgressRow
              label="Day-one"
              fraction={dayOnePacked / dayOneBoxes.length}
              caption={`${dayOnePacked} / ${dayOneBoxes.length} essentials ready`}
            />
          )}
        </CardContent>
      </Card>

      {/* Bottom stat strip — concise, no nesting. */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Rooms" value={rooms.length} />
        <StatCard
          label="Removed"
          value={removedCount}
          hint={removalCount > 0 ? `${removalCount} pending` : undefined}
        />
        <StatCard label="Boxes" value={boxesActive} />
      </div>

      {/* Settings tucked at the bottom — admin, not daily use. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Move settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            label="Status"
            value={move.status}
            onChange={(e) => onUpdate({ status: e.target.value })}
            options={MOVE_STATUSES.map((s) => ({
              value: s,
              label: capitalize(s.replace(/_/g, " ")),
            }))}
          />
          <Input
            type="date"
            label="Move date"
            value={move.move_date ?? ""}
            onChange={(e) => onUpdate({ move_date: e.target.value })}
          />
          <Textarea
            label="Notes"
            value={move.notes ?? ""}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            rows={2}
          />
          <Button variant="danger" className="w-full min-h-11" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Delete move
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg
      className="h-3.5 w-3.5 text-slate-400 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M7.05 4.05a1 1 0 011.414 0l5.243 5.243a1 1 0 010 1.414L8.464 15.95a1 1 0 11-1.414-1.414L11.379 10 7.05 5.464a1 1 0 010-1.414z" />
    </svg>
  );
}

function ProgressRow({
  label,
  fraction,
  caption,
}: {
  label: string;
  fraction: number;
  caption: string;
}) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-slate-500 dark:text-slate-400">{caption}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-primary-500 transition-all"
          style={{ width: `${(clamped * 100).toFixed(0)}%` }}
        />
      </div>
    </div>
  );
}

/* =========================================================== */
/*  Survey (simplified)                                         */
/* =========================================================== */

/** Quick-add first. The user picks a room, types item names, presses
 *  Enter. Disposition is set with chips on each item; destination
 *  room appears as a small select that only matters when disposition
 *  is `keep` / `stage_only`. Anything more detailed (photo, fragile,
 *  per-item barcode, status overrides) lives behind the edit pencil
 *  → ItemModal. */
function SurveyTab({
  move,
  rooms,
  items,
  focusItemId,
  onFocusConsumed,
  onOpenItemEdit,
}: {
  move: Move;
  rooms: MoveRoom[];
  items: MoveItem[];
  focusItemId?: string;
  onFocusConsumed?: () => void;
  onOpenItemEdit: (item: MoveItem) => void;
}) {
  const itemMut = useItemMutations(move.id);
  const createTask = useCreateTask();
  const originRooms = rooms.filter((r) => r.side === "origin");
  const destRooms = rooms.filter((r) => r.side === "destination");
  const [activeRoomId, setActiveRoomId] = useState<string>(originRooms[0]?.id ?? "");
  const [quickName, setQuickName] = useState("");

  useEffect(() => {
    if (!activeRoomId && originRooms.length > 0) setActiveRoomId(originRooms[0].id);
  }, [originRooms, activeRoomId]);

  useEffect(() => {
    if (!focusItemId) return;
    const target = items.find((i) => i.id === focusItemId);
    if (!target) return;
    onOpenItemEdit(target);
    onFocusConsumed?.();
  }, [focusItemId, items, onFocusConsumed, onOpenItemEdit]);

  // Disposition chips. Tapping one writes the disposition (and any
  // linked task) without opening a modal. `keep`/`stage_only` keep
  // the item in flow; the others auto-spawn a follow-up task and
  // the item drops out of the active inventory rollup once the user
  // marks it removed in Problems.
  const dispositionChips: { id: MoveItemDisposition; label: string; taskTitle?: string }[] = [
    { id: "keep", label: "Keep" },
    { id: "sell", label: "Sell", taskTitle: "Sell" },
    { id: "donate", label: "Donate", taskTitle: "Donate" },
    { id: "recycle", label: "Recycle", taskTitle: "Recycle" },
    { id: "dump", label: "Dump", taskTitle: "Dump" },
    { id: "stage_only", label: "Stage" },
    { id: "repair_clean_first", label: "Repair", taskTitle: "Repair / clean" },
  ];

  const setDisposition = (item: MoveItem, chip: typeof dispositionChips[number]) => {
    // Only flip status when the user marks Keep — `surveyed` →
    // `ready_to_pack`. Other dispositions don't drive lifecycle.
    const patch: Record<string, unknown> = { disposition: chip.id };
    if (chip.id === "keep" && item.status === "surveyed") {
      patch.status = "ready_to_pack";
    }
    itemMut.update.mutate({ id: item.id, data: patch });
    if (chip.taskTitle) {
      createTask.mutate({
        title: `${chip.taskTitle}: ${item.name}`,
        project_id: move.project_id,
        priority: "medium",
        kind: "task",
      });
    }
  };

  const setDestination = (item: MoveItem, roomId: string) => {
    itemMut.update.mutate({
      id: item.id,
      data: { destination_room_id: roomId || null },
    });
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const name = quickName.trim();
    if (!name || !activeRoomId) return;
    itemMut.create.mutate(
      {
        move_id: move.id,
        name,
        origin_room_id: activeRoomId,
      },
      { onSuccess: () => setQuickName("") }
    );
  };

  const roomItems = activeRoomId
    ? items.filter((i) => i.origin_room_id === activeRoomId && i.status !== "removed")
    : items.filter((i) => !i.origin_room_id && i.status !== "removed");

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Survey
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {originRooms.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Set up rooms first in Tools → Floor plan.
            </p>
          ) : (
            <Select
              label="Room"
              value={activeRoomId}
              onChange={(e) => setActiveRoomId(e.target.value)}
              options={originRooms.map((r) => ({
                value: r.id,
                label: `${r.name} (${items.filter((i) => i.origin_room_id === r.id && i.status !== "removed").length})`,
              }))}
            />
          )}
          <form className="flex gap-2" onSubmit={handleQuickAdd}>
            <Input
              label=""
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder="Add item — press Enter"
              className="flex-1"
            />
            <Button type="submit" disabled={!quickName.trim() || !activeRoomId} className="min-h-11">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      {roomItems.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="Nothing here yet"
              description="Type an item name above and press Enter. Decide what to do with each one after."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {roomItems.map((item) => {
            const needsDestination =
              (item.disposition === "keep" || item.disposition === "stage_only") &&
              !item.destination_room_id;
            const destRoom = rooms.find((r) => r.id === item.destination_room_id);
            return (
              <Card key={item.id}>
                <CardContent className="pt-2.5 pb-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate flex-1">
                      {item.name}
                      {item.quantity > 1 && (
                        <span className="text-xs text-slate-400 ml-1">×{item.quantity}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenItemEdit(item)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      aria-label="Edit details"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {dispositionChips.map((chip) => {
                      const active = item.disposition === chip.id;
                      return (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => setDisposition(item, chip)}
                          className={
                            "px-2 py-1 rounded-md text-xs font-medium transition-colors " +
                            (active
                              ? "bg-primary-600 text-white"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700")
                          }
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                  {needsDestination && destRooms.length > 0 && (
                    <Select
                      label=""
                      value={item.destination_room_id ?? ""}
                      onChange={(e) => setDestination(item, e.target.value)}
                      options={destRooms.map((r) => ({ value: r.id, label: `→ ${r.name}` }))}
                      placeholder="Where will it go?"
                    />
                  )}
                  {destRoom && !needsDestination && (
                    <p className="text-[10px] text-slate-400">→ {destRoom.name}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================== */
/*  Move                                                        */
/* =========================================================== */

/** Move is the operational hub: pack, stage, load, deliver, unpack
 *  all happen here. The "Current focus" card shows what the app
 *  thinks comes next (driven by phase). Boxes are grouped into Active
 *  and Done, not by individual lifecycle bucket — the per-box
 *  recommended action button covers the lifecycle without surfacing
 *  it as nav. */
function MoveTab({
  move,
  rooms,
  items,
  boxes,
  phase,
  focusBoxId,
  onFocusConsumed,
  onScanResolve,
  onOpenBoxEdit,
  onCreateBox,
}: {
  move: Move;
  rooms: MoveRoom[];
  items: MoveItem[];
  boxes: MoveBox[];
  phase: WorkflowPhase;
  focusBoxId?: string;
  onFocusConsumed?: () => void;
  onScanResolve: (code: string) => void;
  onOpenBoxEdit: (box: MoveBox) => void;
  onCreateBox: () => void;
}) {
  const navigate = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (!focusBoxId) return;
    const target = boxes.find((b) => b.id === focusBoxId);
    if (!target) return;
    onOpenBoxEdit(target);
    onFocusConsumed?.();
  }, [focusBoxId, boxes, onFocusConsumed, onOpenBoxEdit]);

  // Group boxes by "active" (still doing something) vs "done"
  // (terminal: unpacked). Inside Active, we order by status so the
  // user sees what to pick up next.
  const statusOrder: Record<string, number> = {
    preparing: 0,
    packed: 1,
    staged: 2,
    loaded: 3,
    delivered: 4,
    unpacked: 5,
  };
  const activeBoxes = boxes
    .filter((b) => b.status !== "unpacked")
    .slice()
    .sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
  const doneBoxes = boxes.filter((b) => b.status === "unpacked");

  const itemCountByBox = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.box_id) map.set(item.box_id, (map.get(item.box_id) ?? 0) + 1);
    }
    return map;
  }, [items]);

  // Build the workflow context once for the per-box action buttons
  // below — keeps the recommended-action logic centralised.
  const ctx: WorkflowContext = {
    move,
    rooms,
    items,
    boxes,
    phase,
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Move
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-primary-50 dark:bg-primary-900/20 px-3 py-2 text-sm">
            <p className="text-xs text-primary-700 dark:text-primary-300 font-medium uppercase tracking-wide">
              Current focus
            </p>
            <p className="text-primary-900 dark:text-primary-100">{PHASE_LABELS[phase]}</p>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1 min-h-12"
              onClick={() => setScannerOpen(true)}
            >
              <ScanLine className="h-4 w-4" />
              Scan
            </Button>
            <Button
              variant="secondary"
              className="flex-1 min-h-12"
              onClick={onCreateBox}
            >
              <Plus className="h-4 w-4" />
              New box
            </Button>
          </div>
          <Button
            variant="secondary"
            className="w-full min-h-11"
            onClick={() =>
              navigate({ to: "/scan", search: { move: move.id } })
            }
          >
            <ScanLine className="h-4 w-4" />
            Walk-around scanner
          </Button>
        </CardContent>
      </Card>

      {activeBoxes.length === 0 && doneBoxes.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="No boxes yet"
              description="Create your first box, or use Tools → Bulk create to print a stack of labels."
              action={
                <Button onClick={onCreateBox}>
                  <Plus className="h-4 w-4" />
                  New box
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {activeBoxes.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Active</CardTitle>
                <Badge variant="default">{activeBoxes.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {activeBoxes.map((box) => (
                  <BoxRow
                    key={box.id}
                    box={box}
                    rooms={rooms}
                    itemCount={itemCountByBox.get(box.id) ?? 0}
                    ctx={ctx}
                    onScan={() => onScanResolve(box.barcode)}
                    onEdit={() => onOpenBoxEdit(box)}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {doneBoxes.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm text-slate-500">Done</CardTitle>
                <Badge variant="default">{doneBoxes.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-1">
                {doneBoxes.slice(0, 30).map((box) => {
                  const room = rooms.find((r) => r.id === box.destination_room_id);
                  return (
                    <div
                      key={box.id}
                      className="flex items-center gap-2 text-xs py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                    >
                      <code className="font-mono bg-slate-100 dark:bg-slate-800 rounded px-1.5">{box.barcode}</code>
                      <span className="flex-1 truncate">{box.label}</span>
                      {room && <span className="text-slate-400">→ {room.name}</span>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => {
          setScannerOpen(false);
          onScanResolve(code);
        }}
        title="Scan a box or item"
      />
    </div>
  );
}

/** A single box row in the Move tab. Shows the box + a recommended-
 *  action button driven by the workflow engine. Falls back to "Edit"
 *  if the engine has nothing to recommend. */
function BoxRow({
  box,
  rooms,
  itemCount,
  ctx,
  onScan,
  onEdit,
}: {
  box: MoveBox;
  rooms: MoveRoom[];
  itemCount: number;
  ctx: WorkflowContext;
  onScan: () => void;
  onEdit: () => void;
}) {
  const room = rooms.find((r) => r.id === box.destination_room_id);
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
      <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded px-1.5">
        {box.barcode}
      </code>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{box.label}</p>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
          <StatusBadge status={box.status} />
          <span>{itemCount} items</span>
          {room && <span>→ {room.name}</span>}
          {box.priority === "first_night" && (
            <Badge variant="primary">Day-one</Badge>
          )}
        </div>
      </div>
      <Button size="sm" variant="secondary" className="min-h-9" onClick={onScan}>
        Act
      </Button>
      <button
        type="button"
        onClick={onEdit}
        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        aria-label="Edit"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* =========================================================== */
/*  Problems                                                    */
/* =========================================================== */

/** Triage panel. Only items / scan-events that need attention.
 *  The tab itself only appears when there's something here (the
 *  parent gates the tabDef). */
function ProblemsTab({
  move,
  rooms,
  items,
  boxes,
  onOpenItemEdit,
  onOpenBoxEdit,
}: {
  move: Move;
  rooms: MoveRoom[];
  items: MoveItem[];
  boxes: MoveBox[];
  onOpenItemEdit: (item: MoveItem) => void;
  onOpenBoxEdit: (box: MoveBox) => void;
}) {
  const itemMut = useItemMutations(move.id);
  const { data: logResp } = useQuery({
    queryKey: ["move-scan-events", move.id],
    queryFn: () =>
      apiGet<ListResponse<MoveScanEvent>>(`/moves/${move.id}/scan-events`),
    enabled: !!move.id,
  });
  const log = logResp?.data ?? [];

  const missing = items.filter((i) => i.status === "missing");
  const damaged = items.filter((i) => i.status === "damaged");
  const stuckPacked = boxes.filter(
    (b) => b.status === "packed" || b.status === "staged"
  );
  const stuckLoaded = boxes.filter((b) => b.status === "loaded");
  const stuckDelivered = boxes.filter((b) => b.status === "delivered");
  const noDestination = boxes.filter(
    (b) => (b.status === "loaded" || b.status === "delivered") && !b.destination_room_id
  );

  const unknownScans = log.filter((ev) => ev.target_id == null);
  const duplicateScans: MoveScanEvent[] = [];
  const seen = new Map<string, number>();
  for (const ev of log) {
    const key = `${ev.code}|${ev.action}`;
    const at = new Date(ev.scanned_at).getTime();
    const prev = seen.get(key);
    if (prev && Math.abs(at - prev) < 60_000) duplicateScans.push(ev);
    seen.set(key, at);
  }

  const totalProblems =
    missing.length +
    damaged.length +
    unknownScans.length +
    duplicateScans.length +
    noDestination.length;

  if (totalProblems === 0 && stuckPacked.length === 0 && stuckLoaded.length === 0 && stuckDelivered.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            icon={<Check className="h-9 w-9 text-emerald-500" />}
            title="No problems found"
            description="Everything's where it should be."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Problems
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-slate-500 dark:text-slate-400">
          Quiet when there's nothing to fix. Tap a row to act.
        </CardContent>
      </Card>

      {missing.length > 0 && (
        <ProblemGroup
          title="Missing items"
          tone="danger"
          rows={missing.map((item) => ({
            key: item.id,
            label: item.name,
            actionLabel: "Mark found",
            onAction: () =>
              itemMut.update.mutate({ id: item.id, data: { status: "delivered" } }),
            onClickRow: () => onOpenItemEdit(item),
          }))}
        />
      )}

      {damaged.length > 0 && (
        <ProblemGroup
          title="Damaged items"
          tone="warning"
          rows={damaged.map((item) => ({
            key: item.id,
            label: item.name,
            actionLabel: "Resolve",
            onAction: () =>
              itemMut.update.mutate({ id: item.id, data: { status: "delivered" } }),
            onClickRow: () => onOpenItemEdit(item),
          }))}
        />
      )}

      {noDestination.length > 0 && (
        <ProblemGroup
          title="No destination room"
          tone="warning"
          rows={noDestination.map((box) => ({
            key: box.id,
            label: box.label,
            actionLabel: "Set room",
            onAction: () => onOpenBoxEdit(box),
            onClickRow: () => onOpenBoxEdit(box),
          }))}
        />
      )}

      {unknownScans.length > 0 && (
        <ProblemGroup
          title="Unknown scans"
          tone="default"
          rows={unknownScans.slice(0, 20).map((ev) => ({
            key: ev.id,
            label: `${capitalize(ev.action)} · ${ev.code}`,
          }))}
        />
      )}

      {duplicateScans.length > 0 && (
        <ProblemGroup
          title="Duplicate scans"
          tone="default"
          rows={duplicateScans.slice(0, 20).map((ev) => ({
            key: ev.id,
            label: `${capitalize(ev.action)} · ${ev.code}`,
          }))}
        />
      )}
    </div>
  );
}

interface ProblemRow {
  key: string;
  label: string;
  actionLabel?: string;
  onAction?: () => void;
  onClickRow?: () => void;
}

function ProblemGroup({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: ProblemRow[];
  tone: "danger" | "warning" | "default";
}) {
  const titleColor =
    tone === "danger" ? "text-red-600 dark:text-red-400" :
    tone === "warning" ? "text-amber-600 dark:text-amber-400" :
    "text-slate-700 dark:text-slate-300";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className={`text-sm ${titleColor}`}>{title}</CardTitle>
        <Badge variant="default">{rows.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-center gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
          >
            <button
              type="button"
              onClick={row.onClickRow}
              className="flex-1 text-left text-sm truncate hover:text-slate-900 dark:hover:text-slate-100"
              disabled={!row.onClickRow}
            >
              {row.label}
            </button>
            {row.actionLabel && row.onAction && (
              <Button size="sm" variant="secondary" className="min-h-9" onClick={row.onAction}>
                {row.actionLabel}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* =========================================================== */
/*  Tools                                                       */
/* =========================================================== */

/** Setup and admin. Floor plan, room/zone types, labels, bulk box
 *  creation — anything the user doesn't touch during day-to-day
 *  workflow. Sub-sections live behind expanders so the page itself
 *  stays tidy on first open. */
function ToolsTab({
  move,
  rooms,
  items,
  boxes,
  stickers,
  onRefreshMove,
}: {
  move: Move;
  rooms: MoveRoom[];
  items: MoveItem[];
  boxes: MoveBox[];
  stickers: MoveSticker[];
  onRefreshMove: () => void;
}) {
  const qc = useQueryClient();
  const roomMut = useRoomMutations(move.id);
  const [section, setSection] = useState<"floor-plan" | "rooms" | "labels" | "bulk">("rooms");

  const bulkCreate = useMutation({
    mutationFn: (data: { count: number; code_type: string; label_prefix: string }) =>
      apiPost(`/moves/${move.id}/boxes/bulk-create`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["move-boxes", move.id] }),
  });
  const [bulkOpen, setBulkOpen] = useState(false);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "rooms" as const, label: "Rooms & zones" },
              { id: "floor-plan" as const, label: "Floor plan" },
              { id: "labels" as const, label: "Print labels" },
              { id: "bulk" as const, label: "Bulk create" },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors " +
                  (section === s.id
                    ? "bg-primary-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700")
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {section === "rooms" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Rooms & zones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {rooms.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No rooms yet. Draw some on the Floor plan tab below.
              </p>
            ) : (
              rooms.map((room) => (
                <div key={room.id} className="flex items-center gap-2 py-1">
                  <Badge variant={room.side === "origin" ? "default" : "primary"}>
                    {room.side === "origin" ? "◀" : "▶"} {room.name}
                  </Badge>
                  <Select
                    label=""
                    value={(room.room_type as MoveRoomType) ?? "normal_room"}
                    onChange={(e) =>
                      roomMut.update.mutate({
                        id: room.id,
                        data: { room_type: e.target.value as MoveRoomType },
                      })
                    }
                    options={MOVE_ROOM_TYPES.map((t) => ({
                      value: t,
                      label: MOVE_ROOM_TYPE_LABELS[t],
                    }))}
                    className="ml-auto"
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {section === "floor-plan" && (
        <PlansTab
          move={move}
          rooms={rooms}
          items={items}
          stickers={stickers}
          onRefreshMove={onRefreshMove}
        />
      )}

      {section === "labels" && (
        <LabelsTab moveId={move.id} boxes={boxes} items={items} rooms={rooms} />
      )}

      {section === "bulk" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Bulk create boxes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
            <p>
              Pre-generate a stack of pre-labelled boxes with auto barcodes.
              Print them via "Print labels" and stick them on cardboard before
              packing.
            </p>
            <Button onClick={() => setBulkOpen(true)} className="min-h-11">
              <Package className="h-4 w-4" />
              Open bulk-create
            </Button>
          </CardContent>
        </Card>
      )}

      <BulkCreateBoxesModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        existingCount={boxes.length}
        pending={bulkCreate.isPending}
        onSubmit={(payload) =>
          bulkCreate.mutate(payload, { onSuccess: () => setBulkOpen(false) })
        }
      />
    </div>
  );
}

/* =========================================================== */
/*  View-box-contents modal                                     */
/* =========================================================== */

/** Read-only quick view of a box's contents, opened from the workflow
 *  engine's "View contents" / "View box" actions. */
function ViewBoxContentsModal({
  box,
  items,
  onClose,
  onEditBox,
}: {
  box: MoveBox;
  items: MoveItem[];
  onClose: () => void;
  onEditBox: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={`${box.label} (${box.barcode})`}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs">
          <StatusBadge status={box.status} />
          {box.fragile && <Badge variant="primary">Fragile</Badge>}
          {box.priority && box.priority !== "normal" && (
            <Badge variant="default">{capitalize(box.priority.replace(/_/g, " "))}</Badge>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            This box is empty.
          </p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
              >
                <span className="flex-1 truncate">{item.name}</span>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1 min-h-11" onClick={onClose}>
            Close
          </Button>
          <Button className="flex-1 min-h-11" onClick={onEditBox}>
            <Pencil className="h-4 w-4" />
            Edit box
          </Button>
        </div>
      </div>
    </Modal>
  );
}
