/**
 * Floor Plan Designer — server-backed primitives hook.
 *
 * Phase 2 promotes walls/openings/annotations/layers out of the client-only
 * document and onto dedicated REST endpoints. This hook wires TanStack
 * Query (for reads) + optimistic mutations (for writes) so the designer
 * shell can treat these primitives the same way moving.tsx treats rooms
 * and stickers — as a flat list of typed rows plus create/update/delete
 * callbacks.
 *
 * The camelCase ↔ snake_case translation lives here so the editor UI keeps
 * the phase-1 `FloorPlanWall`/`FloorPlanOpening`/... shapes without every
 * call site knowing about the server column names.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type {
  FloorPlanAnnotation,
  FloorPlanLayer,
  FloorPlanOpening,
  FloorPlanWall,
  MoveAnnotation,
  MoveLayer,
  MoveOpening,
  MoveSide,
  MoveWall,
} from "@hcc/shared";
import { apiGet, apiPost } from "@/lib/api";

interface ListResponse<T> {
  data: T[];
  total: number;
}
interface ItemResponse<T> {
  data: T;
}

/* ---------- row ↔ client-shape adapters ---------- */

function wallRowToClient(row: MoveWall): FloorPlanWall {
  return {
    id: row.id,
    x1: row.x1,
    y1: row.y1,
    x2: row.x2,
    y2: row.y2,
    thickness: row.thickness,
    lineStyle: row.line_style,
    color: row.color,
    layerId: row.layer_id,
    locked: row.locked,
    hidden: row.hidden,
    label: row.label ?? undefined,
  };
}

function openingRowToClient(row: MoveOpening): FloorPlanOpening {
  return {
    id: row.id,
    kind: row.kind,
    wallId: row.wall_id,
    t: row.t,
    width: row.width,
    swing: row.swing,
    layerId: row.layer_id,
    locked: row.locked,
    hidden: row.hidden,
    label: row.label ?? undefined,
  };
}

function annotationRowToClient(row: MoveAnnotation): FloorPlanAnnotation {
  return {
    id: row.id,
    kind: row.kind,
    x: row.x,
    y: row.y,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    x2: row.x2 ?? undefined,
    y2: row.y2 ?? undefined,
    text: row.text ?? undefined,
    fontSizePx: row.font_size_px,
    bold: row.bold,
    color: row.color,
    layerId: row.layer_id,
    locked: row.locked,
    hidden: row.hidden,
  };
}

function layerRowToClient(row: MoveLayer): FloorPlanLayer {
  return {
    id: row.id,
    name: row.name,
    visible: row.visible,
    locked: row.locked,
    sort_order: row.sort_order,
  };
}

/* ---------- hook ---------- */

export interface FloorPlanPersistence {
  walls: FloorPlanWall[];
  openings: FloorPlanOpening[];
  annotations: FloorPlanAnnotation[];
  layers: FloorPlanLayer[];

  createWall: (draft: Omit<FloorPlanWall, "id">) => Promise<FloorPlanWall | null>;
  updateWall: (id: string, patch: Partial<FloorPlanWall>) => Promise<void>;
  deleteWall: (id: string) => Promise<void>;

  createOpening: (draft: Omit<FloorPlanOpening, "id">) => Promise<FloorPlanOpening | null>;
  updateOpening: (id: string, patch: Partial<FloorPlanOpening>) => Promise<void>;
  deleteOpening: (id: string) => Promise<void>;

  createAnnotation: (draft: Omit<FloorPlanAnnotation, "id">) => Promise<FloorPlanAnnotation | null>;
  updateAnnotation: (id: string, patch: Partial<FloorPlanAnnotation>) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;

  updateLayer: (id: string, patch: Partial<FloorPlanLayer>) => Promise<void>;
  createLayer: (draft: Omit<FloorPlanLayer, "id"> & { id?: string }) => Promise<FloorPlanLayer | null>;
  deleteLayer: (id: string) => Promise<void>;
}

/**
 * Fetch walls/openings/annotations/layers for a move, filtered to the
 * side we're editing. Creates/updates/deletes go through server endpoints
 * with optimistic cache updates.
 *
 * Caveat: mutations do not coalesce into the store's undo stack. Undo for
 * server-backed primitives is a phase-5 deliverable (version history).
 */
export function useFloorPlanPersistence(
  moveId: string | null | undefined,
  side: MoveSide
): FloorPlanPersistence {
  const qc = useQueryClient();
  const enabled = !!moveId;

  const wallsQ = useQuery({
    queryKey: ["move-walls", moveId],
    enabled,
    queryFn: () => apiGet<ListResponse<MoveWall>>(`/moves/${moveId}/walls`),
  });
  const openingsQ = useQuery({
    queryKey: ["move-openings", moveId],
    enabled,
    queryFn: () => apiGet<ListResponse<MoveOpening>>(`/moves/${moveId}/openings`),
  });
  const annotationsQ = useQuery({
    queryKey: ["move-annotations", moveId],
    enabled,
    queryFn: () => apiGet<ListResponse<MoveAnnotation>>(`/moves/${moveId}/annotations`),
  });
  const layersQ = useQuery({
    queryKey: ["move-layers", moveId],
    enabled,
    queryFn: () => apiGet<ListResponse<MoveLayer>>(`/moves/${moveId}/layers`),
  });

  const wallsBySide = useMemo(
    () =>
      (wallsQ.data?.data ?? [])
        .filter((w) => w.side === side)
        .map(wallRowToClient),
    [wallsQ.data, side]
  );
  const openingsBySide = useMemo(
    () =>
      (openingsQ.data?.data ?? [])
        .filter((o) => o.side === side)
        .map(openingRowToClient),
    [openingsQ.data, side]
  );
  const annotationsBySide = useMemo(
    () =>
      (annotationsQ.data?.data ?? [])
        .filter((a) => a.side === side)
        .map(annotationRowToClient),
    [annotationsQ.data, side]
  );
  const layers = useMemo(
    () => (layersQ.data?.data ?? []).map(layerRowToClient),
    [layersQ.data]
  );

  /* ---------- mutations (walls) ---------- */

  const createWallM = useMutation({
    mutationFn: (draft: Omit<FloorPlanWall, "id">) =>
      apiPost<ItemResponse<MoveWall>>(`/move-walls`, {
        move_id: moveId!,
        side,
        x1: draft.x1,
        y1: draft.y1,
        x2: draft.x2,
        y2: draft.y2,
        thickness: draft.thickness,
        line_style: draft.lineStyle,
        color: draft.color,
        layer_id: draft.layerId,
        locked: draft.locked,
        hidden: draft.hidden,
        label: draft.label,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["move-walls", moveId] }),
  });

  const updateWallM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<FloorPlanWall> }) =>
      fetch(`/api/v1/move-walls/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x1: patch.x1,
          y1: patch.y1,
          x2: patch.x2,
          y2: patch.y2,
          thickness: patch.thickness,
          line_style: patch.lineStyle,
          color: patch.color,
          layer_id: patch.layerId,
          locked: patch.locked,
          hidden: patch.hidden,
          label: patch.label,
        }),
      }).then((r) => r.json()),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["move-walls", moveId] });
      const prev = qc.getQueryData<ListResponse<MoveWall>>(["move-walls", moveId]);
      if (prev) {
        qc.setQueryData<ListResponse<MoveWall>>(["move-walls", moveId], {
          ...prev,
          data: prev.data.map((w) =>
            w.id === id
              ? {
                  ...w,
                  ...(patch.x1 !== undefined && { x1: patch.x1 }),
                  ...(patch.y1 !== undefined && { y1: patch.y1 }),
                  ...(patch.x2 !== undefined && { x2: patch.x2 }),
                  ...(patch.y2 !== undefined && { y2: patch.y2 }),
                  ...(patch.thickness !== undefined && { thickness: patch.thickness }),
                  ...(patch.lineStyle !== undefined && { line_style: patch.lineStyle }),
                  ...(patch.color !== undefined && { color: patch.color }),
                  ...(patch.layerId !== undefined && { layer_id: patch.layerId }),
                  ...(patch.locked !== undefined && { locked: patch.locked }),
                  ...(patch.hidden !== undefined && { hidden: patch.hidden }),
                  ...(patch.label !== undefined && { label: patch.label }),
                }
              : w
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["move-walls", moveId], ctx.prev);
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["move-walls", moveId] }),
  });

  const deleteWallM = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/move-walls/${id}`, {
        method: "DELETE",
        credentials: "include",
      }).then((r) => r.json()),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["move-walls", moveId] });
      // Wall delete cascades to openings server-side.
      qc.invalidateQueries({ queryKey: ["move-openings", moveId] });
    },
  });

  /* ---------- mutations (openings) ---------- */

  const createOpeningM = useMutation({
    mutationFn: (draft: Omit<FloorPlanOpening, "id">) =>
      apiPost<ItemResponse<MoveOpening>>(`/move-openings`, {
        move_id: moveId!,
        side,
        wall_id: draft.wallId,
        kind: draft.kind,
        t: draft.t,
        width: draft.width,
        swing: draft.swing,
        layer_id: draft.layerId,
        locked: draft.locked,
        hidden: draft.hidden,
        label: draft.label,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["move-openings", moveId] }),
  });

  const updateOpeningM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<FloorPlanOpening> }) =>
      fetch(`/api/v1/move-openings/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wall_id: patch.wallId,
          kind: patch.kind,
          t: patch.t,
          width: patch.width,
          swing: patch.swing,
          layer_id: patch.layerId,
          locked: patch.locked,
          hidden: patch.hidden,
          label: patch.label,
        }),
      }).then((r) => r.json()),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["move-openings", moveId] }),
  });

  const deleteOpeningM = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/move-openings/${id}`, {
        method: "DELETE",
        credentials: "include",
      }).then((r) => r.json()),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["move-openings", moveId] }),
  });

  /* ---------- mutations (annotations) ---------- */

  const createAnnotationM = useMutation({
    mutationFn: (draft: Omit<FloorPlanAnnotation, "id">) =>
      apiPost<ItemResponse<MoveAnnotation>>(`/move-annotations`, {
        move_id: moveId!,
        side,
        kind: draft.kind,
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
        x2: draft.x2,
        y2: draft.y2,
        text: draft.text,
        font_size_px: draft.fontSizePx,
        bold: draft.bold,
        color: draft.color,
        layer_id: draft.layerId,
        locked: draft.locked,
        hidden: draft.hidden,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["move-annotations", moveId] }),
  });

  const updateAnnotationM = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<FloorPlanAnnotation>;
    }) =>
      fetch(`/api/v1/move-annotations/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: patch.kind,
          x: patch.x,
          y: patch.y,
          width: patch.width,
          height: patch.height,
          x2: patch.x2,
          y2: patch.y2,
          text: patch.text,
          font_size_px: patch.fontSizePx,
          bold: patch.bold,
          color: patch.color,
          layer_id: patch.layerId,
          locked: patch.locked,
          hidden: patch.hidden,
        }),
      }).then((r) => r.json()),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["move-annotations", moveId] }),
  });

  const deleteAnnotationM = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/move-annotations/${id}`, {
        method: "DELETE",
        credentials: "include",
      }).then((r) => r.json()),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["move-annotations", moveId] }),
  });

  /* ---------- mutations (layers) ---------- */

  const createLayerM = useMutation({
    mutationFn: (draft: Omit<FloorPlanLayer, "id"> & { id?: string }) =>
      apiPost<ItemResponse<MoveLayer>>(`/move-layers`, {
        move_id: moveId!,
        id:
          draft.id ??
          `layer_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`,
        name: draft.name,
        visible: draft.visible,
        locked: draft.locked,
        sort_order: draft.sort_order,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["move-layers", moveId] }),
  });

  const updateLayerM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<FloorPlanLayer> }) =>
      fetch(`/api/v1/moves/${moveId}/layers/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: patch.name,
          visible: patch.visible,
          locked: patch.locked,
          sort_order: patch.sort_order,
        }),
      }).then((r) => r.json()),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["move-layers", moveId] }),
  });

  const deleteLayerM = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/moves/${moveId}/layers/${id}`, {
        method: "DELETE",
        credentials: "include",
      }).then((r) => r.json()),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["move-layers", moveId] }),
  });

  return {
    walls: wallsBySide,
    openings: openingsBySide,
    annotations: annotationsBySide,
    layers,

    createWall: async (draft) => {
      if (!moveId) return null;
      const res = await createWallM.mutateAsync(draft);
      return res.data ? wallRowToClient(res.data) : null;
    },
    updateWall: async (id, patch) => {
      await updateWallM.mutateAsync({ id, patch });
    },
    deleteWall: async (id) => {
      await deleteWallM.mutateAsync(id);
    },
    createOpening: async (draft) => {
      if (!moveId) return null;
      const res = await createOpeningM.mutateAsync(draft);
      return res.data ? openingRowToClient(res.data) : null;
    },
    updateOpening: async (id, patch) => {
      await updateOpeningM.mutateAsync({ id, patch });
    },
    deleteOpening: async (id) => {
      await deleteOpeningM.mutateAsync(id);
    },
    createAnnotation: async (draft) => {
      if (!moveId) return null;
      const res = await createAnnotationM.mutateAsync(draft);
      return res.data ? annotationRowToClient(res.data) : null;
    },
    updateAnnotation: async (id, patch) => {
      await updateAnnotationM.mutateAsync({ id, patch });
    },
    deleteAnnotation: async (id) => {
      await deleteAnnotationM.mutateAsync(id);
    },
    createLayer: async (draft) => {
      if (!moveId) return null;
      const res = await createLayerM.mutateAsync(draft);
      return res.data ? layerRowToClient(res.data) : null;
    },
    updateLayer: async (id, patch) => {
      await updateLayerM.mutateAsync({ id, patch });
    },
    deleteLayer: async (id) => {
      await deleteLayerM.mutateAsync(id);
    },
  };
}
