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
  ScanLine,
  Trash2,
  Lock,
  ArrowLeft,
} from "lucide-react";
import type { Move, MoveBox, MoveItem, MoveRoom } from "@hcc/shared";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  useBarcodeCamera,
  playScanBeep,
  vibrateScan,
} from "@/lib/use-barcode-camera";

/**
 * Fast multi-item pack-box flow. One full-screen view, three stages:
 *   1. scanBox    — scan a box label, look it up via /by-barcode
 *   2. configure  — set packed_on / packed_by / source+destination rooms
 *                   and fill up to 6 preset item-name slots
 *   3. packing    — camera reactivates, items stream into the box list.
 *                   Tap a preset to arm it (sticky). Every scan while
 *                   a preset is armed POSTs a new move_item with that
 *                   preset's name + the scanned code as item barcode.
 *
 * Sealing the box issues two requests: PATCH /move-boxes/:id with the
 * packed_on/packed_by/source_room_id metadata, then PATCH /:id/status
 * → "packed" to log a single scan_event and cascade item statuses.
 */

type ListResponse<T> = { data: T[]; total: number };
type SingleResponse<T> = { data: T };
type SearchParams = { move?: string };

const PRESET_COUNT = 6;

export const Route = createFileRoute("/moving/pack-box")({
  component: PackBoxPage,
  validateSearch: (raw: Record<string, unknown>): SearchParams => ({
    move: typeof raw.move === "string" ? raw.move : undefined,
  }),
});

type Stage = "scanBox" | "configure" | "packing";

interface PackedItem {
  /** Move item id returned by the server — lets us DELETE / PATCH later. */
  id: string;
  /** Preset slot the user tapped before scanning (1-indexed). */
  presetIndex: number;
  /** Display name (the preset's text). */
  name: string;
  /** Scanned barcode. */
  barcode: string;
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function PackBoxPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  /* ---------- Moves & rooms ---------- */

  const { data: movesResp, isLoading: movesLoading } = useQuery({
    queryKey: ["moves"],
    queryFn: () => apiGet<ListResponse<Move>>("/moves"),
  });
  const moves = movesResp?.data ?? [];

  const [moveId, setMoveId] = useState<string | null>(search.move ?? null);
  useEffect(() => {
    if (!moveId && moves.length > 0) setMoveId(moves[0].id);
  }, [moves, moveId]);

  const { data: roomsResp } = useQuery({
    queryKey: ["move-rooms", moveId],
    queryFn: () => apiGet<ListResponse<MoveRoom>>(`/moves/${moveId}/rooms`),
    enabled: !!moveId,
  });
  const rooms = roomsResp?.data ?? [];
  const originRooms = useMemo(
    () => rooms.filter((r) => r.side === "origin"),
    [rooms],
  );
  const destinationRooms = useMemo(
    () => rooms.filter((r) => r.side === "destination"),
    [rooms],
  );

  /* ---------- Stage state ---------- */

  const [stage, setStage] = useState<Stage>("scanBox");
  const [box, setBox] = useState<MoveBox | null>(null);
  const [packedOn, setPackedOn] = useState<string>(todayIso());
  const [packedBy, setPackedBy] = useState<string>("");
  const [sourceRoomId, setSourceRoomId] = useState<string>("");
  const [destinationRoomId, setDestinationRoomId] = useState<string>("");
  const [presets, setPresets] = useState<string[]>(
    () => Array.from({ length: PRESET_COUNT }, () => ""),
  );
  const [armedPreset, setArmedPreset] = useState<number | null>(null);
  const [packed, setPacked] = useState<PackedItem[]>([]);
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [flashMsg, setFlashMsg] = useState<{ text: string; tone: "ok" | "warn" | "err" } | null>(
    null,
  );

  // Preload the signed-in user's name into the "packed by" field, but
  // leave it editable so a different crew member can be credited.
  useEffect(() => {
    if (!packedBy && user?.name) setPackedBy(user.name);
  }, [user, packedBy]);

  // When a box is found, prefill destination from the box's stored
  // destination_room_id so the typical flow is one tap.
  useEffect(() => {
    if (box?.destination_room_id && !destinationRoomId) {
      setDestinationRoomId(box.destination_room_id);
    }
  }, [box, destinationRoomId]);

  const flash = (text: string, tone: "ok" | "warn" | "err" = "ok") => {
    setFlashMsg({ text, tone });
    window.setTimeout(() => {
      setFlashMsg((current) => (current?.text === text ? null : current));
    }, 1600);
  };

  /* ---------- Box lookup ---------- */

  const lookupBox = async (code: string) => {
    if (!moveId) {
      flash("Pick a move first", "warn");
      return;
    }
    try {
      const res = await apiGet<SingleResponse<MoveBox>>(
        `/move-boxes/by-barcode/${encodeURIComponent(code)}`,
      );
      const found = res.data;
      if (found.move_id !== moveId) {
        flash("Box belongs to a different move", "err");
        return;
      }
      if (found.status !== "preparing") {
        flash(`Already ${found.status}`, "warn");
      }
      playScanBeep();
      vibrateScan();
      setBox(found);
      // If the box was previously partly packed, pull its existing
      // metadata so the user keeps the same packer/source on resume.
      if (found.packed_by) setPackedBy(found.packed_by);
      if (found.packed_on) setPackedOn(found.packed_on);
      if (found.source_room_id) setSourceRoomId(found.source_room_id);
      // Load any items already in this box so resuming a session shows
      // a populated contents list.
      try {
        const items = await apiGet<ListResponse<MoveItem>>(
          `/moves/${moveId}/items`,
        );
        const existing = items.data
          .filter((i) => i.box_id === found.id && !!i.barcode)
          .map<PackedItem>((i) => ({
            id: i.id,
            presetIndex: 0,
            name: i.name,
            barcode: i.barcode!,
          }));
        setPacked(existing);
      } catch {
        // best-effort prefill
      }
      setStage("configure");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        flash(`No box matches ${code}`, "err");
      } else {
        flash("Lookup failed", "err");
      }
    }
  };

  /* ---------- Item scan ---------- */

  const createItem = useMutation({
    mutationFn: async ({
      code,
      presetIndex,
      name,
    }: {
      code: string;
      presetIndex: number;
      name: string;
    }) => {
      if (!box || !moveId) throw new Error("No active box");
      const res = await apiPost<SingleResponse<MoveItem>>("/move-items", {
        move_id: moveId,
        name,
        box_id: box.id,
        origin_room_id: sourceRoomId || undefined,
        destination_room_id: destinationRoomId || undefined,
        status: "packed",
        barcode: code,
      });
      return { item: res.data, presetIndex, code };
    },
    onSuccess: ({ item, presetIndex, code }) => {
      setPacked((p) => [
        { id: item.id, presetIndex, name: item.name, barcode: code },
        ...p,
      ]);
      playScanBeep();
      vibrateScan();
      flash(`${item.name} +1`, "ok");
      if (moveId) qc.invalidateQueries({ queryKey: ["move-items", moveId] });
    },
    onError: (e) => {
      const msg =
        e instanceof ApiError && e.status === 400
          ? "Duplicate barcode"
          : "Couldn't add item";
      flash(msg, "err");
    },
  });

  const handleItemScan = (code: string) => {
    if (!box) return;
    if (armedPreset == null) {
      flash("Tap a preset first", "warn");
      return;
    }
    const name = presets[armedPreset]?.trim();
    if (!name) {
      flash("Preset is empty", "warn");
      return;
    }
    if (packed.some((p) => p.barcode === code)) {
      flash("Already in this box", "warn");
      return;
    }
    createItem.mutate({ code, presetIndex: armedPreset + 1, name });
  };

  /* ---------- Camera plumbing ---------- */

  // Single camera, shared between scanBox + packing stages. Disabled
  // during configure so the user can fill the form without a humming
  // preview, and during manual entry.
  const cameraEnabled = !manualMode && (stage === "scanBox" || stage === "packing");

  // Stash latest handler context so the camera callback (created in
  // the hook on enable) doesn't see a stale stage/box/armedPreset.
  const ctxRef = useRef({ stage, lookupBox, handleItemScan });
  ctxRef.current = { stage, lookupBox, handleItemScan };

  const { videoRef, state: camState, error: camError, retry } = useBarcodeCamera({
    enabled: cameraEnabled,
    onScan: (code) => {
      const ctx = ctxRef.current;
      if (ctx.stage === "scanBox") void ctx.lookupBox(code);
      else if (ctx.stage === "packing") ctx.handleItemScan(code);
    },
  });

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualValue.trim();
    if (!code) return;
    if (stage === "scanBox") void lookupBox(code);
    else handleItemScan(code);
    setManualValue("");
  };

  /* ---------- Configure → packing transition ---------- */

  const configReady =
    !!box &&
    !!packedOn &&
    !!packedBy.trim() &&
    !!sourceRoomId &&
    !!destinationRoomId &&
    presets.some((p) => p.trim().length > 0);

  const startPacking = () => {
    if (!configReady) return;
    // Auto-arm the first filled preset so the user can scan immediately.
    const firstFilled = presets.findIndex((p) => p.trim().length > 0);
    setArmedPreset(firstFilled >= 0 ? firstFilled : null);
    setStage("packing");
  };

  /* ---------- Remove a packed item ---------- */

  const removeItem = useMutation({
    mutationFn: (itemId: string) => apiDelete(`/move-items/${itemId}`),
    onSuccess: (_d, itemId) => {
      setPacked((p) => p.filter((x) => x.id !== itemId));
      if (moveId) qc.invalidateQueries({ queryKey: ["move-items", moveId] });
    },
    onError: () => flash("Couldn't remove item", "err"),
  });

  /* ---------- Seal box ---------- */

  const sealBox = useMutation({
    mutationFn: async () => {
      if (!box) throw new Error("No active box");
      // Metadata first so the cascade-driven status transition reads
      // the correct sealed values when the scan_event is logged.
      await apiPatch(`/move-boxes/${box.id}`, {
        packed_on: packedOn,
        packed_by: packedBy.trim(),
        source_room_id: sourceRoomId,
        destination_room_id: destinationRoomId,
      });
      // Status-transition endpoint logs one scan_event tagged "pack"
      // and cascades item statuses to "packed".
      await apiPatch(`/move-boxes/${box.id}/status`, { status: "packed" });
    },
    onSuccess: () => {
      flash(`${box?.label ?? "Box"} sealed`, "ok");
      if (moveId) {
        qc.invalidateQueries({ queryKey: ["move-boxes", moveId] });
        qc.invalidateQueries({ queryKey: ["move-items", moveId] });
        qc.invalidateQueries({ queryKey: ["move-scan-events", moveId] });
      }
      // Reset to scan the next box, keeping packer/source so a packing
      // session through one room stays fast.
      const carryOverPackedBy = packedBy;
      const carryOverSource = sourceRoomId;
      setBox(null);
      setPacked([]);
      setPresets(Array.from({ length: PRESET_COUNT }, () => ""));
      setArmedPreset(null);
      setDestinationRoomId("");
      setPackedBy(carryOverPackedBy);
      setSourceRoomId(carryOverSource);
      setStage("scanBox");
    },
    onError: () => flash("Couldn't seal box", "err"),
  });

  /* ---------- Close / esc ---------- */

  const close = () => {
    navigate({ to: "/moving" });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Render ---------- */

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
        <p className="text-lg">You don't have any moves to pack against yet.</p>
        <Button onClick={() => navigate({ to: "/moving" })}>Go to Moving</Button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950 text-white overflow-hidden flex flex-col"
      style={{ height: "100dvh" }}
    >
      {/* ============ Top bar ============ */}
      <div className="flex items-center justify-between gap-2 p-3 bg-black/60 backdrop-blur shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {stage !== "scanBox" && (
            <button
              type="button"
              onClick={() => {
                if (stage === "configure") {
                  setBox(null);
                  setPacked([]);
                  setStage("scanBox");
                } else if (stage === "packing") {
                  setStage("configure");
                }
              }}
              aria-label="Back"
              className="h-11 w-11 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-xs uppercase tracking-wider text-white/60">
              Pack a box
            </span>
            {moves.length > 1 ? (
              <select
                className="bg-transparent text-sm font-medium truncate outline-none"
                value={moveId ?? ""}
                onChange={(e) => setMoveId(e.target.value || null)}
                aria-label="Move"
                disabled={stage !== "scanBox"}
              >
                {moves.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-900">
                    {m.notes || `Move ${m.id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-medium truncate">
                {moves[0]?.notes || "Move"}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="h-11 w-11 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ============ Flash banner ============ */}
      {flashMsg && (
        <div
          className={
            "absolute top-20 left-1/2 -translate-x-1/2 z-50 max-w-[90%] px-4 py-2 rounded-full text-sm font-semibold shadow-lg flex items-center gap-2 " +
            (flashMsg.tone === "ok"
              ? "bg-emerald-500 text-white"
              : flashMsg.tone === "warn"
                ? "bg-amber-500 text-white"
                : "bg-red-500 text-white")
          }
        >
          <Check className="h-4 w-4" />
          {flashMsg.text}
        </div>
      )}

      {/* ============ Body ============ */}
      <div className="flex-1 overflow-y-auto">
        {stage === "scanBox" && (
          <ScanBoxStage
            manualMode={manualMode}
            setManualMode={setManualMode}
            manualValue={manualValue}
            setManualValue={setManualValue}
            submitManual={submitManual}
            videoRef={videoRef}
            camState={camState}
            camError={camError}
            retry={retry}
          />
        )}

        {stage === "configure" && box && (
          <ConfigureStage
            box={box}
            packedOn={packedOn}
            setPackedOn={setPackedOn}
            packedBy={packedBy}
            setPackedBy={setPackedBy}
            sourceRoomId={sourceRoomId}
            setSourceRoomId={setSourceRoomId}
            destinationRoomId={destinationRoomId}
            setDestinationRoomId={setDestinationRoomId}
            originRooms={originRooms}
            destinationRooms={destinationRooms}
            presets={presets}
            setPresets={setPresets}
            configReady={configReady}
            onStart={startPacking}
          />
        )}

        {stage === "packing" && box && (
          <PackingStage
            box={box}
            presets={presets}
            armedPreset={armedPreset}
            setArmedPreset={setArmedPreset}
            packed={packed}
            onRemove={(id) => removeItem.mutate(id)}
            videoRef={videoRef}
            camState={camState}
            camError={camError}
            retry={retry}
            manualMode={manualMode}
            setManualMode={setManualMode}
            manualValue={manualValue}
            setManualValue={setManualValue}
            submitManual={submitManual}
            onSeal={() => sealBox.mutate()}
            sealing={sealBox.isPending}
            canSeal={packed.length > 0 && !sealBox.isPending}
            sourceRoomName={
              originRooms.find((r) => r.id === sourceRoomId)?.name ?? "—"
            }
            destinationRoomName={
              destinationRooms.find((r) => r.id === destinationRoomId)?.name ?? "—"
            }
          />
        )}
      </div>
    </div>
  );
}

/* ==================== Sub-views ==================== */

interface ScannerSurfaceProps {
  manualMode: boolean;
  setManualMode: (v: boolean) => void;
  manualValue: string;
  setManualValue: (v: string) => void;
  submitManual: (e: React.FormEvent) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  camState: "idle" | "starting" | "running" | "unsupported" | "error";
  camError: string | null;
  retry: () => void;
  hint: string;
}

function ScannerSurface({
  manualMode,
  setManualMode,
  manualValue,
  setManualValue,
  submitManual,
  videoRef,
  camState,
  camError,
  retry,
  hint,
}: ScannerSurfaceProps) {
  return (
    <div className="relative w-full aspect-[4/3] sm:aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
      {manualMode ? (
        <div className="w-full h-full flex items-center justify-center p-6">
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
              <Button type="submit" className="flex-1 min-h-12" disabled={!manualValue.trim()}>
                <ScanLine className="h-4 w-4" />
                Submit
              </Button>
            </div>
          </form>
        </div>
      ) : camState === "error" || camState === "unsupported" ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-4">
          <CameraIcon className="h-10 w-10 text-white/60" />
          <p className="text-sm text-white/80 max-w-xs">
            {camError ??
              "Couldn't start the camera. Check browser permission, or enter codes manually."}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={retry}>
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
            <Button onClick={() => setManualMode(true)}>
              <Keyboard className="h-4 w-4" />
              Manual
            </Button>
          </div>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {camState === "running" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-2/3 max-w-xs aspect-square border-2 border-white/70 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="absolute bottom-2 right-2 inline-flex items-center px-3 h-10 text-xs rounded-full bg-black/60 backdrop-blur"
          >
            <Keyboard className="h-3.5 w-3.5 mr-1" />
            Manual
          </button>
        </>
      )}
      <div className="absolute top-2 left-2 text-xs px-2 py-1 rounded-full bg-black/60 backdrop-blur">
        {hint}
      </div>
    </div>
  );
}

interface ScanBoxStageProps {
  manualMode: boolean;
  setManualMode: (v: boolean) => void;
  manualValue: string;
  setManualValue: (v: string) => void;
  submitManual: (e: React.FormEvent) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  camState: "idle" | "starting" | "running" | "unsupported" | "error";
  camError: string | null;
  retry: () => void;
}

function ScanBoxStage(props: ScanBoxStageProps) {
  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div>
        <h2 className="text-lg font-semibold">Scan a box to start</h2>
        <p className="text-sm text-white/70">
          Hold the box's label in front of the camera. We'll load it up so you
          can start scanning items into it.
        </p>
      </div>
      <ScannerSurface {...props} hint="Scanning box" />
    </div>
  );
}

interface ConfigureStageProps {
  box: MoveBox;
  packedOn: string;
  setPackedOn: (v: string) => void;
  packedBy: string;
  setPackedBy: (v: string) => void;
  sourceRoomId: string;
  setSourceRoomId: (v: string) => void;
  destinationRoomId: string;
  setDestinationRoomId: (v: string) => void;
  originRooms: MoveRoom[];
  destinationRooms: MoveRoom[];
  presets: string[];
  setPresets: React.Dispatch<React.SetStateAction<string[]>>;
  configReady: boolean;
  onStart: () => void;
}

function ConfigureStage({
  box,
  packedOn,
  setPackedOn,
  packedBy,
  setPackedBy,
  sourceRoomId,
  setSourceRoomId,
  destinationRoomId,
  setDestinationRoomId,
  originRooms,
  destinationRooms,
  presets,
  setPresets,
  configReady,
  onStart,
}: ConfigureStageProps) {
  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto pb-24">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center gap-3">
        <Package className="h-6 w-6 text-emerald-400 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{box.label}</div>
          <div className="text-xs text-white/60 truncate">{box.barcode}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Packed on"
          type="date"
          value={packedOn}
          onChange={(e) => setPackedOn(e.target.value)}
        />
        <Input
          label="By"
          value={packedBy}
          placeholder="Your name"
          onChange={(e) => setPackedBy(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Source room"
          value={sourceRoomId}
          onChange={(e) => setSourceRoomId(e.target.value)}
          placeholder="Pick origin room…"
          options={originRooms.map((r) => ({ value: r.id, label: r.name }))}
        />
        <Select
          label="Destination room"
          value={destinationRoomId}
          onChange={(e) => setDestinationRoomId(e.target.value)}
          placeholder="Pick destination room…"
          options={destinationRooms.map((r) => ({ value: r.id, label: r.name }))}
        />
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Preset items</div>
        <p className="text-xs text-white/60 mb-3">
          Up to 6 quick-tap labels. Tap a preset during packing, then scan items
          to commit them under that name.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {presets.map((p, i) => (
            <Input
              key={i}
              value={p}
              placeholder={`Preset ${i + 1}`}
              onChange={(e) => {
                const next = e.target.value;
                setPresets((prev) => prev.map((v, idx) => (idx === i ? next : v)));
              }}
            />
          ))}
        </div>
      </div>

      <div className="sticky bottom-3 z-10">
        <Button
          size="lg"
          className="w-full"
          disabled={!configReady}
          onClick={onStart}
        >
          <ScanLine className="h-5 w-5" />
          Start scanning items
        </Button>
      </div>
    </div>
  );
}

interface PackingStageProps {
  box: MoveBox;
  presets: string[];
  armedPreset: number | null;
  setArmedPreset: (i: number | null) => void;
  packed: PackedItem[];
  onRemove: (id: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  camState: "idle" | "starting" | "running" | "unsupported" | "error";
  camError: string | null;
  retry: () => void;
  manualMode: boolean;
  setManualMode: (v: boolean) => void;
  manualValue: string;
  setManualValue: (v: string) => void;
  submitManual: (e: React.FormEvent) => void;
  onSeal: () => void;
  sealing: boolean;
  canSeal: boolean;
  sourceRoomName: string;
  destinationRoomName: string;
}

function PackingStage({
  box,
  presets,
  armedPreset,
  setArmedPreset,
  packed,
  onRemove,
  videoRef,
  camState,
  camError,
  retry,
  manualMode,
  setManualMode,
  manualValue,
  setManualValue,
  submitManual,
  onSeal,
  sealing,
  canSeal,
  sourceRoomName,
  destinationRoomName,
}: PackingStageProps) {
  const filledPresets = presets
    .map((label, idx) => ({ label: label.trim(), idx }))
    .filter((p) => p.label.length > 0);

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto pb-24">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
        <Package className="h-5 w-5 text-emerald-400 shrink-0" />
        <div className="text-sm flex-1 min-w-0">
          <div className="font-semibold truncate">{box.label}</div>
          <div className="text-xs text-white/60 truncate">
            {sourceRoomName} → {destinationRoomName}
          </div>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
          {packed.length} item{packed.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <ScannerSurface
            manualMode={manualMode}
            setManualMode={setManualMode}
            manualValue={manualValue}
            setManualValue={setManualValue}
            submitManual={submitManual}
            videoRef={videoRef}
            camState={camState}
            camError={camError}
            retry={retry}
            hint={
              armedPreset != null
                ? `Scanning: ${presets[armedPreset]?.trim() || "—"}`
                : "Tap a preset to arm"
            }
          />

          <div>
            <div className="text-xs uppercase tracking-wider text-white/60 mb-2">
              Presets — tap one, then scan
            </div>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((p, i) => {
                const empty = !p.trim();
                const armed = i === armedPreset;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={empty}
                    onClick={() => setArmedPreset(armed ? null : i)}
                    aria-pressed={armed}
                    className={
                      "min-h-20 rounded-xl p-2 flex flex-col items-center justify-center gap-1 transition-colors text-center " +
                      (empty
                        ? "bg-white/5 text-white/30 cursor-not-allowed"
                        : armed
                          ? "bg-emerald-500 text-white shadow-lg ring-2 ring-emerald-300"
                          : "bg-white/10 text-white active:bg-white/20")
                    }
                  >
                    <span className="text-xs font-bold opacity-70">{i + 1}</span>
                    <span className="text-sm font-semibold leading-tight break-words">
                      {p.trim() || "—"}
                    </span>
                  </button>
                );
              })}
            </div>
            {filledPresets.length === 0 && (
              <p className="text-xs text-amber-300 mt-2">
                No presets filled — go back to add some.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-white/60">
            Box contents
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/10 min-h-40 max-h-[60vh] overflow-y-auto">
            {packed.length === 0 ? (
              <div className="p-6 text-center text-sm text-white/60">
                Nothing scanned yet. Tap a preset and aim at an item label.
              </div>
            ) : (
              packed.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {row.presetIndex > 0
                        ? `${row.name} (P${row.presetIndex})`
                        : row.name}
                    </div>
                    <div className="text-xs text-white/60 truncate">
                      {row.barcode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    aria-label="Remove item"
                    className="h-10 w-10 rounded-full hover:bg-white/10 active:bg-white/20 flex items-center justify-center text-white/70"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="sticky bottom-3 z-10">
        <Button
          size="lg"
          variant="primary"
          className="w-full"
          disabled={!canSeal}
          onClick={onSeal}
        >
          {sealing ? (
            <span className="h-5 w-5 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
          ) : (
            <Lock className="h-5 w-5" />
          )}
          Seal box
        </Button>
      </div>
    </div>
  );
}
