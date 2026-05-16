import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Keyboard,
  Camera as CameraIcon,
  RotateCcw,
  Check,
  Package,
  PackageOpen,
  Truck,
  Navigation,
  MapPin,
  Search,
  ScanLine,
} from "lucide-react";
import type {
  Move,
  MoveBox,
  MoveItem,
  MoveScanAction,
} from "@hcc/shared";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useBarcodeCamera,
  playScanBeep,
  vibrateScan,
} from "@/lib/use-barcode-camera";

/**
 * Full-screen barcode scan view — designed for phone-in-hand, walking
 * around the house. No app chrome, no modal, just the camera, an
 * action picker along the bottom edge, and a corner close button.
 *
 * Renders as a fixed overlay above the AppShell so the sidebar/top-bar
 * never compete for screen real estate. Sticky on iOS with `inset:0`
 * + `100dvh` for keyboard-aware sizing on the manual-entry fallback.
 *
 * State machine:
 *   - choose move (if not provided in URL or only one exists)
 *   - choose action chip (Pack/Load/Transit/Arrive/Unpack/Lookup)
 *   - scan: camera loops, each detection POSTs a scan event and
 *     flashes a confirmation toast over the video
 *   - manual entry as a fallback when the camera isn't available
 */

type ListResponse<T> = { data: T[]; total: number };

type SearchParams = { move?: string; action?: MoveScanAction };

const VALID_ACTIONS: MoveScanAction[] = [
  "pack",
  "load",
  "transit",
  "arrive",
  "unpack",
  "lookup",
];

export const Route = createFileRoute("/scan")({
  component: ScanPage,
  validateSearch: (raw: Record<string, unknown>): SearchParams => ({
    move: typeof raw.move === "string" ? raw.move : undefined,
    action:
      typeof raw.action === "string" &&
      (VALID_ACTIONS as string[]).includes(raw.action)
        ? (raw.action as MoveScanAction)
        : undefined,
  }),
});

const ACTIONS: {
  id: MoveScanAction;
  label: string;
  short: string;
  verb: string;
  icon: typeof Package;
}[] = [
  { id: "pack", label: "Pack", short: "Pack", verb: "Packed", icon: Package },
  { id: "load", label: "Load on truck", short: "Load", verb: "Loaded", icon: Truck },
  { id: "transit", label: "In transit", short: "Transit", verb: "In transit", icon: Navigation },
  { id: "arrive", label: "Arrived", short: "Arrive", verb: "Delivered", icon: MapPin },
  { id: "unpack", label: "Unpack", short: "Unpack", verb: "Unpacked", icon: PackageOpen },
  { id: "lookup", label: "Look up", short: "Look", verb: "Looked up", icon: Search },
];

interface SessionScan {
  key: string;
  code: string;
  state: "ok" | "unknown";
  summary: string;
  at: number;
}

function ScanPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const qc = useQueryClient();

  const { data: movesResp, isLoading: movesLoading } = useQuery({
    queryKey: ["moves"],
    queryFn: () => apiGet<ListResponse<Move>>("/moves"),
  });
  const moves = movesResp?.data ?? [];

  // Resolve the active move: URL param wins; otherwise the first move.
  const [moveId, setMoveId] = useState<string | null>(search.move ?? null);
  useEffect(() => {
    if (!moveId && moves.length > 0) {
      setMoveId(moves[0].id);
    }
  }, [moves, moveId]);

  const move = useMemo(
    () => moves.find((m) => m.id === moveId) ?? null,
    [moves, moveId]
  );

  const [action, setAction] = useState<MoveScanAction>(search.action ?? "pack");

  const { data: boxesResp } = useQuery({
    queryKey: ["move-boxes", moveId],
    queryFn: () =>
      apiGet<ListResponse<MoveBox>>(`/moves/${moveId}/boxes`),
    enabled: !!moveId,
  });
  const boxes = boxesResp?.data ?? [];

  const { data: itemsResp } = useQuery({
    queryKey: ["move-items", moveId],
    queryFn: () =>
      apiGet<ListResponse<MoveItem>>(`/moves/${moveId}/items`),
    enabled: !!moveId,
  });
  const items = itemsResp?.data ?? [];

  const boxByBarcode = useMemo(() => {
    const m = new Map<string, MoveBox>();
    for (const b of boxes) m.set(b.barcode, b);
    return m;
  }, [boxes]);
  const itemByBarcode = useMemo(() => {
    const m = new Map<string, MoveItem>();
    for (const i of items) if (i.barcode) m.set(i.barcode, i);
    return m;
  }, [items]);

  const recordScan = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiPost("/move-scan-events", data),
    onSuccess: () => {
      if (!moveId) return;
      qc.invalidateQueries({ queryKey: ["move-scan-events", moveId] });
      qc.invalidateQueries({ queryKey: ["move-boxes", moveId] });
    },
  });

  const [session, setSession] = useState<SessionScan[]>([]);
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");

  // Keep latest action/move/maps in a ref so the camera scan callback,
  // which is recreated infrequently, always sees current state.
  const ctxRef = useRef({
    action,
    moveId,
    boxByBarcode,
    itemByBarcode,
  });
  ctxRef.current = { action, moveId, boxByBarcode, itemByBarcode };

  const handleScan = (code: string) => {
    const { action: a, moveId: mid, boxByBarcode: bx, itemByBarcode: it } = ctxRef.current;
    if (!mid) return;

    const box = bx.get(code);
    const item = !box ? it.get(code) : null;
    const actionDef = ACTIONS.find((x) => x.id === a)!;

    playScanBeep();
    vibrateScan();

    if (!box && !item) {
      const entry: SessionScan = {
        key: `${code}-${Date.now()}`,
        code,
        state: "unknown",
        summary: `Unknown: ${code}`,
        at: Date.now(),
      };
      setSession((s) => [entry, ...s].slice(0, 5));
      recordScan.mutate({
        move_id: mid,
        code,
        target_kind: "box",
        action: a,
      });
      return;
    }

    const summary = box
      ? `${actionDef.verb}: ${box.label}`
      : `${actionDef.verb}: ${item!.name}`;
    const entry: SessionScan = {
      key: `${code}-${Date.now()}`,
      code,
      state: "ok",
      summary,
      at: Date.now(),
    };
    setSession((s) => [entry, ...s].slice(0, 5));

    recordScan.mutate({
      move_id: mid,
      code,
      target_kind: item ? "item" : "box",
      target_id: box?.id ?? item?.id,
      action: a,
    });

    // On lookup with a resolved target: close the scan view and open
    // the details modal for the scanned code. Other actions stay in
    // scan-mode so the user can keep scanning more boxes in a row.
    if (a === "lookup") {
      if (box) {
        navigate({
          to: "/moving",
          search: { tab: "boxes", move: mid, focusBoxId: box.id },
        });
      } else if (item) {
        navigate({
          to: "/moving",
          search: { tab: "inventory", move: mid, focusItemId: item.id },
        });
      }
    }
  };

  const cameraEnabled = !!moveId && !manualMode;
  const { videoRef, state: camState, error, flash, retry } = useBarcodeCamera({
    enabled: cameraEnabled,
    onScan: handleScan,
  });

  const close = () => {
    navigate({ to: "/moving" });
  };

  // Esc closes the scan view — handy when paired with a Bluetooth keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualValue.trim();
    if (!code) return;
    handleScan(code);
    setManualValue("");
  };

  // Loading / empty states.
  if (movesLoading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-white/50 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (moves.length === 0) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col items-center justify-center p-6 text-center gap-4">
        <p className="text-lg">You don't have any moves to scan against yet.</p>
        <Button onClick={() => navigate({ to: "/moving" })}>
          Go to Moving
        </Button>
      </div>
    );
  }

  const currentActionDef = ACTIONS.find((a) => a.id === action)!;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black text-white overflow-hidden"
      style={{ height: "100dvh" }}
    >
      {/* ============ Video / scanner stage ============ */}
      <div className="absolute inset-0">
        {manualMode ? (
          <div className="w-full h-full bg-slate-900 flex items-center justify-center p-6">
            <form onSubmit={submitManual} className="w-full max-w-sm space-y-4">
              <Input
                label="Barcode"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="Type or paste a barcode"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 min-h-12"
                  onClick={() => setManualMode(false)}
                >
                  <CameraIcon className="h-4 w-4" />
                  Use camera
                </Button>
                <Button
                  type="submit"
                  className="flex-1 min-h-12"
                  disabled={!manualValue.trim()}
                >
                  <ScanLine className="h-4 w-4" />
                  Submit
                </Button>
              </div>
            </form>
          </div>
        ) : camState === "error" || camState === "unsupported" ? (
          <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-6 text-center gap-4">
            <CameraIcon className="h-12 w-12 text-slate-400" />
            <p className="text-sm text-slate-300 max-w-xs">
              {error ??
                "This browser can't auto-detect barcodes. Try Chrome/Edge/Safari, or enter codes manually."}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={retry}>
                <RotateCcw className="h-4 w-4" />
                Retry camera
              </Button>
              <Button onClick={() => setManualMode(true)}>
                <Keyboard className="h-4 w-4" />
                Enter manually
              </Button>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

        {/* Scan reticle (only over the live video) */}
        {!manualMode && camState === "running" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-3/4 max-w-md aspect-square border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}

        {/* Flash banner on successful detection */}
        {flash && session[0] && (
          <div
            className={
              "pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 rounded-full text-sm font-semibold shadow-lg flex items-center gap-2 " +
              (session[0].state === "ok"
                ? "bg-emerald-500 text-white"
                : "bg-amber-500 text-white")
            }
          >
            <Check className="h-4 w-4" />
            {session[0].summary}
          </div>
        )}
      </div>

      {/* ============ Top bar: move name + close ============ */}
      <div
        className="absolute top-0 inset-x-0 flex items-center justify-between gap-2 p-3"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)",
        }}
      >
        <div className="flex-1 min-w-0">
          {moves.length > 1 ? (
            <select
              className="bg-black/60 text-white text-sm rounded-md px-2 py-1.5 max-w-full"
              value={moveId ?? ""}
              onChange={(e) => setMoveId(e.target.value || null)}
              aria-label="Move"
            >
              {moves.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.notes || `Move ${m.id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          ) : (
            move && (
              <span className="text-sm font-medium truncate inline-block max-w-full">
                {move.notes || "Move"}
              </span>
            )
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close scan"
          className="h-12 w-12 rounded-full bg-black/60 backdrop-blur flex items-center justify-center active:bg-black/80"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* ============ Bottom: action picker + session feed ============ */}
      <div
        className="absolute bottom-0 inset-x-0 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)",
        }}
      >
        {/* Last scans — small line above the chips */}
        {session.length > 0 && (
          <div className="mb-2 max-h-20 overflow-hidden">
            {session.slice(0, 3).map((s) => (
              <div
                key={s.key}
                className={
                  "text-xs px-2 py-1 rounded-md mb-1 flex items-center gap-2 backdrop-blur " +
                  (s.state === "ok"
                    ? "bg-emerald-500/30 text-white"
                    : "bg-amber-500/30 text-white")
                }
              >
                <Check className="h-3 w-3 flex-shrink-0" />
                <span className="truncate flex-1">{s.summary}</span>
              </div>
            ))}
          </div>
        )}

        {/* Active action display */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm">
            <currentActionDef.icon className="h-5 w-5" />
            <span className="font-semibold">Scanning to: {currentActionDef.label}</span>
          </div>
          {!manualMode && (
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className="text-xs underline decoration-dotted underline-offset-2"
            >
              <Keyboard className="h-3.5 w-3.5 inline-block mr-1" />
              Manual
            </button>
          )}
        </div>

        {/* Action chips — scrollable on narrow phones */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            const active = a.id === action;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAction(a.id)}
                className={
                  "flex-shrink-0 snap-start flex flex-col items-center justify-center rounded-xl px-4 py-2 min-w-20 min-h-16 transition-colors " +
                  (active
                    ? "bg-white text-slate-900"
                    : "bg-white/15 text-white backdrop-blur active:bg-white/25")
                }
                aria-pressed={active}
              >
                <Icon className="h-5 w-5 mb-0.5" />
                <span className="text-xs font-medium">{a.short}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
