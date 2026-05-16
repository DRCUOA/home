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
} from "lucide-react";
import type {
  Move,
  MoveBox,
  MoveItem,
  MoveRoom,
  MoveScanEvent,
  MoveSticker,
  MoveStickerKind,
  MoveScanAction,
  Project,
  Property,
  FileRecord,
} from "@hcc/shared";
import {
  MOVE_STATUSES,
  MOVE_ITEM_STATUSES,
  MOVE_ITEM_CATEGORIES,
  MOVE_BOX_PRIORITIES,
  MOVE_CODE_TYPES,
  MOVE_LABEL_TEMPLATES,
} from "@hcc/shared";
import type { MoveLabelTemplate } from "@hcc/shared";
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

type ListResponse<T> = { data: T[]; total: number };

type MovingTab = "overview" | "plans" | "inventory" | "boxes" | "scan" | "labels";
const MOVING_TABS: readonly MovingTab[] = ["overview", "plans", "inventory", "boxes", "scan", "labels"];

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

  const [tab, setTab] = useState<MovingTab>(search.tab ?? "overview");
  // Honour URL ?tab= when it changes (deep links from /scan lookup).
  useEffect(() => {
    if (search.tab) setTab(search.tab);
  }, [search.tab]);

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

  const tabDefs = [
    { id: "overview", label: "Overview" },
    { id: "plans", label: "Floor plans", count: rooms.length },
    { id: "inventory", label: "Inventory", count: items.length },
    { id: "boxes", label: "Boxes", count: boxes.length },
    { id: "scan", label: "Scan" },
    { id: "labels", label: "Labels" },
  ];

  return (
    <PageShell title="Moving">
      <div className="space-y-4 pb-4">
        {/* Move switcher + quick actions */}
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

        <Tabs tabs={tabDefs} active={tab} onChange={(t) => setTab(t as any)} />

        {selectedMove && (
          <>
            {tab === "overview" && (
              <OverviewTab
                move={selectedMove}
                projects={projects}
                properties={properties}
                rooms={rooms}
                items={items}
                boxes={boxes}
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
            {tab === "plans" && (
              <PlansTab
                move={selectedMove}
                rooms={rooms}
                items={items}
                stickers={stickers}
                onRefreshMove={() =>
                  qc.invalidateQueries({ queryKey: ["moves"] })
                }
              />
            )}
            {tab === "inventory" && (
              <InventoryTab
                move={selectedMove}
                rooms={rooms}
                boxes={boxes}
                items={items}
                focusItemId={search.focusItemId}
                onFocusConsumed={() =>
                  navigate({
                    to: "/moving",
                    search: (prev) => ({ ...prev, focusItemId: undefined }),
                    replace: true,
                  })
                }
              />
            )}
            {tab === "boxes" && (
              <BoxesTab
                move={selectedMove}
                rooms={rooms}
                boxes={boxes}
                items={items}
                focusBoxId={search.focusBoxId}
                onFocusConsumed={() =>
                  navigate({
                    to: "/moving",
                    search: (prev) => ({ ...prev, focusBoxId: undefined }),
                    replace: true,
                  })
                }
              />
            )}
            {tab === "scan" && (
              <ScanTab move={selectedMove} boxes={boxes} items={items} rooms={rooms} />
            )}
            {tab === "labels" && (
              <LabelsTab boxes={boxes} items={items} rooms={rooms} />
            )}
          </>
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

/* =========================================================== */
/*  Overview                                                    */
/* =========================================================== */

function OverviewTab({
  move,
  projects,
  properties,
  rooms,
  items,
  boxes,
  onUpdate,
  onDelete,
}: {
  move: Move;
  projects: Project[];
  properties: Property[];
  rooms: MoveRoom[];
  items: MoveItem[];
  boxes: MoveBox[];
  onUpdate: (data: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const project = projects.find((p) => p.id === move.project_id);
  const origin = properties.find((p) => p.id === move.origin_property_id);
  const dest = properties.find((p) => p.id === move.destination_property_id);

  const packed = items.filter((i) => i.status !== "unpacked").length;

  return (
    <div className="space-y-3">
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
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Rooms" value={rooms.length} />
        <StatCard label="Items" value={items.length} hint={`${packed} packed`} />
        <StatCard label="Boxes" value={boxes.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            label="Move status"
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
            rows={3}
          />
        </CardContent>
      </Card>

      <Button variant="danger" className="w-full min-h-12" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
        Delete move
      </Button>
    </div>
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

/* =========================================================== */
/*  Inventory                                                   */
/* =========================================================== */

function InventoryTab({
  move,
  rooms,
  boxes,
  items,
  focusItemId,
  onFocusConsumed,
}: {
  move: Move;
  rooms: MoveRoom[];
  boxes: MoveBox[];
  items: MoveItem[];
  /** Deep-link target: open the ItemModal for this id on mount. */
  focusItemId?: string;
  /** Called once the deep-link target has been opened, so the parent
   *  can drop the search param from the URL. */
  onFocusConsumed?: () => void;
}) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MoveItem | null>(null);
  const [filterRoom, setFilterRoom] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterBoxId, setFilterBoxId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Deep-link: if /moving?focusItemId= matches an item once data loads,
  // open its modal exactly once. Re-entries with the same id (e.g. user
  // closes + reopens the tab) won't re-fire because the parent clears
  // the search param via onFocusConsumed.
  useEffect(() => {
    if (!focusItemId) return;
    const target = items.find((i) => i.id === focusItemId);
    if (!target) return;
    setEditing(target);
    setModalOpen(true);
    onFocusConsumed?.();
  }, [focusItemId, items, onFocusConsumed]);

  const createItem = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/move-items", data),
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
  const deleteItem = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/move-items/${id}`, { method: "DELETE", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["move-items", move.id] }),
  });

  const filtered = useMemo(() => {
    let list = [...items];
    if (filterRoom) {
      list = list.filter(
        (i) => i.origin_room_id === filterRoom || i.destination_room_id === filterRoom
      );
    }
    if (filterStatus) list = list.filter((i) => i.status === filterStatus);
    if (filterBoxId) list = list.filter((i) => i.box_id === filterBoxId);
    return list;
  }, [items, filterRoom, filterStatus, filterBoxId]);

  // Scan lookup: items first (per-item barcodes are rare but specific),
  // then boxes (filter inventory to the box's contents — the natural
  // "what's in this box?" gesture). Unknown codes get a flash message.
  const handleScan = (code: string) => {
    setScannerOpen(false);
    const item = items.find((i) => i.barcode === code);
    if (item) {
      setScanMessage(`✓ ${item.name}`);
      setEditing(item);
      setTimeout(() => setModalOpen(true), 50);
      return;
    }
    const box = boxes.find((b) => b.barcode === code);
    if (box) {
      const n = items.filter((i) => i.box_id === box.id).length;
      setFilterBoxId(box.id);
      setScanMessage(`Box ${box.label} → showing ${n} item${n === 1 ? "" : "s"}`);
      return;
    }
    setScanMessage(`No item or box matches "${code}".`);
  };

  const filterBox = filterBoxId ? boxes.find((b) => b.id === filterBoxId) : null;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Inventory</h2>
        <div className="flex gap-2">
          <Button size="md" variant="secondary" className="min-h-11" onClick={() => setScannerOpen(true)}>
            <ScanLine className="h-4 w-4" />
            Scan
          </Button>
          <Button size="md" className="min-h-11" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4" />
            Add item
          </Button>
        </div>
      </div>

      {scanMessage && (
        <div className="flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          <span className="truncate">{scanMessage}</span>
          {(filterBox || scanMessage) && (
            <button
              type="button"
              onClick={() => { setFilterBoxId(null); setScanMessage(null); }}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 shrink-0"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Room"
          value={filterRoom}
          onChange={(e) => setFilterRoom(e.target.value)}
          options={rooms.map((r) => ({ value: r.id, label: `${r.side === "origin" ? "◀" : "▶"} ${r.name}` }))}
          placeholder="All rooms"
        />
        <Select
          label="Status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          options={MOVE_ITEM_STATUSES.map((s) => ({
            value: s,
            label: capitalize(s.replace(/_/g, " ")),
          }))}
          placeholder="All statuses"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<Package className="h-9 w-9" />}
              title="No items yet"
              description="Add items from rooms, then drag them across floor plans to assign destinations."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <Card key={item.id}>
              <CardContent className="pt-3 pb-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.name}
                      {item.quantity > 1 && <span className="text-xs text-slate-400 ml-1">×{item.quantity}</span>}
                    </span>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {item.origin_room_id && (
                    <Badge variant="default">
                      From: {rooms.find((r) => r.id === item.origin_room_id)?.name ?? "?"}
                    </Badge>
                  )}
                  {item.destination_room_id && (
                    <Badge variant="primary">
                      To: {rooms.find((r) => r.id === item.destination_room_id)?.name ?? "?"}
                    </Badge>
                  )}
                  {item.box_id && (
                    <Badge variant="default">
                      Box: {boxes.find((b) => b.id === item.box_id)?.label ?? "?"}
                    </Badge>
                  )}
                  {item.fragile && <Badge variant="primary">Fragile</Badge>}
                </div>
                <div className="flex gap-1.5 pt-1">
                  <Button size="sm" variant="secondary" className="min-h-10" onClick={() => { setEditing(item); setModalOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteItem.mutate(item.id); }}
                    className="p-1.5 text-slate-400 hover:text-red-500"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ItemModal
        key={editing?.id ?? "new"}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        existing={editing}
        rooms={rooms}
        boxes={boxes}
        onSubmit={(payload) => {
          if (editing) {
            updateItem.mutate({ id: editing.id, data: payload }, {
              onSuccess: () => { setModalOpen(false); setEditing(null); },
            });
          } else {
            createItem.mutate({ ...payload, move_id: move.id }, {
              onSuccess: () => setModalOpen(false),
            });
          }
        }}
      />

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        title="Scan item or box"
      />
    </div>
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
  const [status, setStatus] = useState<string>("unpacked");
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
    setStatus(existing?.status ?? "unpacked");
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
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={MOVE_ITEM_STATUSES.map((s) => ({ value: s, label: capitalize(s.replace(/_/g, " ")) }))}
        />
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

/* =========================================================== */
/*  Boxes                                                       */
/* =========================================================== */

function BoxesTab({
  move,
  rooms,
  boxes,
  items,
  focusBoxId,
  onFocusConsumed,
}: {
  move: Move;
  rooms: MoveRoom[];
  boxes: MoveBox[];
  items: MoveItem[];
  /** Deep-link target: open the BoxModal for this id on mount. */
  focusBoxId?: string;
  /** Called once the deep-link target has been opened, so the parent
   *  can drop the search param from the URL. */
  onFocusConsumed?: () => void;
}) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MoveBox | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Deep-link: if /moving?focusBoxId= matches a box once data loads,
  // open its modal exactly once. See InventoryTab for the same pattern.
  useEffect(() => {
    if (!focusBoxId) return;
    const target = boxes.find((b) => b.id === focusBoxId);
    if (!target) return;
    setEditing(target);
    setModalOpen(true);
    onFocusConsumed?.();
  }, [focusBoxId, boxes, onFocusConsumed]);

  const createBox = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/move-boxes", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["move-boxes", move.id] }),
  });
  const bulkCreateBoxes = useMutation({
    mutationFn: (data: { count: number; code_type: string; label_prefix: string }) =>
      apiPost(`/moves/${move.id}/boxes/bulk-create`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["move-boxes", move.id] }),
  });
  const updateBox = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetch(`/api/v1/move-boxes/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["move-boxes", move.id] }),
  });
  const deleteBox = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/move-boxes/${id}`, { method: "DELETE", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["move-boxes", move.id] }),
  });

  const itemCountByBox = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.box_id) map.set(item.box_id, (map.get(item.box_id) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const handleScan = (code: string) => {
    const box = boxes.find((b) => b.barcode === code);
    if (box) {
      setScanMessage(`✓ ${box.label} (${box.barcode})`);
      setEditing(box);
      setScannerOpen(false);
      setTimeout(() => setModalOpen(true), 50);
    } else {
      setScanMessage(`No box matches "${code}". You can create one now.`);
      setScannerOpen(false);
      setTimeout(() => {
        setEditing(null);
        setModalOpen(true);
      }, 50);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Boxes</h2>
        <div className="flex gap-2">
          <Button size="md" variant="secondary" className="min-h-11" onClick={() => setScannerOpen(true)}>
            <ScanLine className="h-4 w-4" />
            Scan
          </Button>
          <Button size="md" variant="secondary" className="min-h-11" onClick={() => setBulkOpen(true)}>
            <Package className="h-4 w-4" />
            Bulk create
          </Button>
          <Button size="md" className="min-h-11" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4" />
            New box
          </Button>
        </div>
      </div>

      {scanMessage && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{scanMessage}</p>
      )}

      {boxes.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<Package className="h-9 w-9" />}
              title="No boxes yet"
              description="Create boxes as you pack. Each box gets a barcode for fast scanning later, and a printable label."
              action={
                <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
                  <Plus className="h-4 w-4" />
                  New box
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {boxes.map((box) => {
            const room = rooms.find((r) => r.id === box.destination_room_id);
            const count = itemCountByBox.get(box.id) ?? 0;
            return (
              <Card key={box.id}>
                <CardContent className="pt-3 pb-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {box.label}
                    </span>
                    <code className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-2 py-0.5">
                      {box.barcode}
                    </code>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {room && <Badge variant="primary">→ {room.name}</Badge>}
                    <Badge variant="default">{count} items</Badge>
                    {box.fragile && <Badge variant="primary">Fragile</Badge>}
                    {box.priority && box.priority !== "normal" && (
                      <Badge variant="default">{capitalize(box.priority.replace(/_/g, " "))}</Badge>
                    )}
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <Button size="sm" variant="secondary" className="min-h-10" onClick={() => { setEditing(box); setModalOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <button
                      type="button"
                      onClick={() => { if (confirm(`Delete box "${box.label}"? Items in it stay, just unassigned.`)) deleteBox.mutate(box.id); }}
                      className="p-1.5 text-slate-400 hover:text-red-500"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BoxModal
        key={editing?.id ?? "new"}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        existing={editing}
        rooms={rooms}
        moveId={move.id}
        existingBarcodes={boxes.map((b) => b.barcode)}
        onSubmit={(payload) => {
          if (editing) {
            updateBox.mutate({ id: editing.id, data: payload }, {
              onSuccess: () => { setModalOpen(false); setEditing(null); },
            });
          } else {
            createBox.mutate({ ...payload, move_id: move.id }, {
              onSuccess: () => setModalOpen(false),
            });
          }
        }}
      />

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        title="Scan box barcode"
      />

      <BulkCreateBoxesModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        existingCount={boxes.length}
        pending={bulkCreateBoxes.isPending}
        onSubmit={(payload) =>
          bulkCreateBoxes.mutate(payload, {
            onSuccess: () => setBulkOpen(false),
          })
        }
      />
    </div>
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
/*  Scan mode                                                   */
/* =========================================================== */

const SCAN_ACTIONS: { id: MoveScanAction; label: string; icon: typeof Package }[] = [
  { id: "pack", label: "Pack", icon: Package },
  { id: "load", label: "Load on truck", icon: Truck },
  { id: "transit", label: "In transit", icon: Navigation },
  { id: "arrive", label: "Arrived", icon: MapPin },
  { id: "unpack", label: "Unpack", icon: PackageOpen },
  { id: "lookup", label: "Look up", icon: Search },
];

/**
 * "Scan" tab on /moving — a launch-pad rather than the scan UI itself.
 * The actual scanning happens at /scan, a full-screen route designed
 * for phone-in-hand walking around the house. This tab lets the user:
 *   - pre-select an action so it's primed when scanning starts
 *   - see at-a-glance status counts for every box
 *   - review the persisted scan log
 */
function ScanTab({
  move,
  boxes,
  items,
  rooms,
}: {
  move: Move;
  boxes: MoveBox[];
  items: MoveItem[];
  rooms: MoveRoom[];
}) {
  const navigate = useNavigate();
  const [action, setAction] = useState<MoveScanAction>("pack");

  const { data: logResp } = useQuery({
    queryKey: ["move-scan-events", move.id],
    queryFn: () =>
      apiGet<ListResponse<MoveScanEvent>>(`/moves/${move.id}/scan-events`),
    enabled: !!move.id,
  });
  const log = logResp?.data ?? [];

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      preparing: 0,
      packed: 0,
      loaded: 0,
      delivered: 0,
      unpacked: 0,
    };
    for (const b of boxes) counts[b.status] = (counts[b.status] ?? 0) + 1;
    return counts;
  }, [boxes]);

  const roomById = (id?: string) => (id ? rooms.find((r) => r.id === id) : null);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Scan mode
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pick an action, then open the full-screen scanner. Every
              scan is logged and advances the box's lifecycle.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SCAN_ACTIONS.map((a) => {
              const Icon = a.icon;
              const active = a.id === action;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAction(a.id)}
                  className={
                    "flex flex-col items-center justify-center rounded-lg border-2 py-3 px-2 text-xs font-medium transition-colors min-h-16 " +
                    (active
                      ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200"
                      : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300")
                  }
                  aria-pressed={active}
                >
                  <Icon className="h-5 w-5 mb-1" />
                  {a.label}
                </button>
              );
            })}
          </div>
          <Button
            size="lg"
            className="w-full min-h-14"
            onClick={() =>
              navigate({
                to: "/scan",
                search: { move: move.id, action },
              })
            }
          >
            <ScanLine className="h-5 w-5" />
            Open full-screen scanner
          </Button>
        </CardContent>
      </Card>

      {/* Status roll-up — quick at-a-glance of where every box is */}
      <Card>
        <CardContent className="pt-3 pb-3">
          <p className="text-xs uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 mb-2">
            Box lifecycle
          </p>
          <div className="grid grid-cols-5 gap-2 text-center">
            {(["preparing", "packed", "loaded", "delivered", "unpacked"] as const).map((s) => (
              <div key={s} className="rounded-md bg-slate-50 dark:bg-slate-800/50 py-2">
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {statusCounts[s] ?? 0}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {capitalize(s)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Persisted scan log — recent first */}
      <Card>
        <CardContent className="pt-3 pb-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
              Scan log
            </p>
            <span className="text-[10px] text-slate-400">{log.length} total</span>
          </div>
          {log.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
              No scans yet. Open the scanner above to start.
            </p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {[...log].reverse().slice(0, 50).map((ev) => {
                const box = ev.target_kind === "box" && ev.target_id
                  ? boxes.find((b) => b.id === ev.target_id)
                  : null;
                const item = ev.target_kind === "item" && ev.target_id
                  ? items.find((i) => i.id === ev.target_id)
                  : null;
                const targetLabel = box?.label ?? item?.name ?? `Unknown (${ev.code})`;
                const room = box ? roomById(box.destination_room_id) : null;
                return (
                  <div key={ev.id} className="flex items-center gap-2 text-xs py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                    <Badge variant="default">{capitalize(ev.action)}</Badge>
                    <span className="flex-1 truncate">
                      {targetLabel}
                      {room && <span className="text-slate-400"> → {room.name}</span>}
                    </span>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {new Date(ev.scanned_at).toLocaleTimeString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
  boxes,
  items,
  rooms,
}: {
  boxes: MoveBox[];
  items: MoveItem[];
  rooms: MoveRoom[];
}) {
  const [printOpen, setPrintOpen] = useState(false);
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

      <LabelSheet
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        boxes={boxes}
        items={items}
        rooms={rooms}
        template={template}
      />
    </div>
  );
}
