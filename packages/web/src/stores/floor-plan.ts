/**
 * Floor Plan Designer store.
 *
 * Holds the client-side editor state for the refactored floor plan designer
 * (spec: floorplan_UIX_refactor_major1.json). This is *in addition to* the
 * server-persisted MoveRoom + MoveSticker rows — the store composes them
 * with walls, openings, annotations, layers, and style overlays to produce
 * a single editable document.
 *
 * Responsibilities
 *   - Viewport (zoom/pan/grid/snap/unit).
 *   - Tool + selection state.
 *   - Mode (beginner/advanced), theme, UI density, text scale.
 *   - Document primitives added in the refactor (walls, openings,
 *     annotations, layers, styles).
 *   - Undo/redo ring buffer over the document slice.
 *
 * Design notes
 *   - We deliberately do NOT mirror MoveRoom / MoveSticker into the store.
 *     Those keep flowing through TanStack Query mutations in the consumer
 *     (moving.tsx). The store holds the parts only the editor knows about.
 *   - History is coalesced by a begin/end pair so a drag produces one entry.
 *   - Persisted slice: viewport + mode + theme + density + textScale.
 *     Document is NOT persisted here — phase 2 migrates it to the server.
 */

import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type {
  FloorPlanAnnotation,
  FloorPlanDocument,
  FloorPlanLayer,
  FloorPlanMode,
  FloorPlanObjectStyle,
  FloorPlanOpening,
  FloorPlanTheme,
  FloorPlanTool,
  FloorPlanUIDensity,
  FloorPlanUnit,
  FloorPlanViewport,
  FloorPlanWall,
} from "@hcc/shared";
import {
  FLOOR_PLAN_DEFAULT_HEIGHT_METERS,
  FLOOR_PLAN_DEFAULT_LAYERS,
  FLOOR_PLAN_ZOOM_MAX,
  FLOOR_PLAN_ZOOM_MIN,
} from "@hcc/shared";

/* ---------- helpers ---------- */

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function emptyDoc(): FloorPlanDocument {
  return {
    walls: [],
    openings: [],
    annotations: [],
    layers: [...FLOOR_PLAN_DEFAULT_LAYERS],
    styles: {},
  };
}

function defaultViewport(): FloorPlanViewport {
  return {
    zoom: 1,
    panX: 0,
    panY: 0,
    gridSizePx: 40,
    showGrid: true,
    snapToGrid: true,
    snapToObjects: true,
    unit: "metric",
    realWorldHeightMeters: FLOOR_PLAN_DEFAULT_HEIGHT_METERS,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/* ---------- history ---------- */

interface HistoryEntry {
  doc: FloorPlanDocument;
}

const HISTORY_LIMIT = 50;

/* ---------- state shape ---------- */

export interface FloorPlanState {
  // --- Document ---
  doc: FloorPlanDocument;

  // --- Viewport ---
  viewport: FloorPlanViewport;

  // --- Selection ---
  selectedIds: Set<string>;
  /** The kind of entity currently selected. Used by the properties panel
   *  to show the right controls. "mixed" means a heterogenous selection. */
  selectionKind:
    | "none"
    | "mixed"
    | "wall"
    | "opening"
    | "annotation"
    | "room"
    | "sticker";

  // --- Tool ---
  activeTool: FloorPlanTool;
  /** In-progress drawing state — what the current tool is gathering. */
  draft:
    | { type: "wall"; x1: number; y1: number; x2: number; y2: number }
    | { type: "room-rect"; x: number; y: number; width: number; height: number }
    | { type: "room-polygon"; points: { x: number; y: number }[] }
    | { type: "marquee"; x: number; y: number; width: number; height: number }
    | null;

  // --- Modes & preferences ---
  mode: FloorPlanMode;
  theme: FloorPlanTheme;
  uiDensity: FloorPlanUIDensity;
  /** Extra text-scale multiplier applied on top of the per-element fonts. */
  textScale: number;
  /** Show each panel (top bar always visible). */
  showToolSidebar: boolean;
  showPropertiesSidebar: boolean;
  showLayersPanel: boolean;

  // --- History ---
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** If set, mutations are merged into the last history entry. Used so a
   *  pointer drag produces a single undo step. */
  batching: boolean;

  // --- Actions ---
  resetDocument(doc?: FloorPlanDocument): void;
  setViewport(partial: Partial<FloorPlanViewport>): void;
  zoomIn(): void;
  zoomOut(): void;
  resetViewport(): void;
  fitToScreen(): void;
  setUnit(unit: FloorPlanUnit): void;

  setTool(tool: FloorPlanTool): void;
  setDraft(draft: FloorPlanState["draft"]): void;

  setMode(mode: FloorPlanMode): void;
  setTheme(theme: FloorPlanTheme): void;
  setDensity(density: FloorPlanUIDensity): void;
  setTextScale(multiplier: number): void;
  toggleToolSidebar(): void;
  togglePropertiesSidebar(): void;
  toggleLayersPanel(): void;

  select(
    ids: Iterable<string>,
    kind: FloorPlanState["selectionKind"]
  ): void;
  addToSelection(id: string, kind: FloorPlanState["selectionKind"]): void;
  clearSelection(): void;

  // Walls
  addWall(wall: Omit<FloorPlanWall, "id">): string;
  updateWall(id: string, patch: Partial<FloorPlanWall>): void;
  deleteWalls(ids: Iterable<string>): void;

  // Openings
  addOpening(o: Omit<FloorPlanOpening, "id">): string;
  updateOpening(id: string, patch: Partial<FloorPlanOpening>): void;
  deleteOpenings(ids: Iterable<string>): void;

  // Annotations
  addAnnotation(a: Omit<FloorPlanAnnotation, "id">): string;
  updateAnnotation(id: string, patch: Partial<FloorPlanAnnotation>): void;
  deleteAnnotations(ids: Iterable<string>): void;

  // Layers
  updateLayer(id: string, patch: Partial<FloorPlanLayer>): void;
  addLayer(name: string): string;
  deleteLayer(id: string): void;

  // Object style overlay (for MoveRoom / MoveSticker ids)
  setStyle(id: string, style: FloorPlanObjectStyle): void;
  clearStyle(id: string): void;

  // History
  beginBatch(): void;
  endBatch(): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}

/* ---------- the store ---------- */

// Persisted slice schema (stored in localStorage).
type PersistedSlice = Pick<
  FloorPlanState,
  "mode" | "theme" | "uiDensity" | "textScale"
> & {
  viewport: Pick<
    FloorPlanViewport,
    "gridSizePx" | "showGrid" | "snapToGrid" | "snapToObjects" | "unit"
  >;
};

export const useFloorPlanStore = create<FloorPlanState>()(
  subscribeWithSelector(
    persist(
      (set, get) => {
        /** Snapshot the current doc before a mutation so undo can restore it.
         *  When batching is true we keep merging into the *last* past entry
         *  (one undo step per drag). */
        const pushHistory = () => {
          set((state) => {
            const entry: HistoryEntry = { doc: state.doc };
            const past = state.batching
              ? state.past.length
                ? state.past
                : [entry]
              : [...state.past, entry].slice(-HISTORY_LIMIT);
            return { past, future: [] };
          });
        };

        /** Apply a document mutator, capturing history. */
        const mutate = (fn: (doc: FloorPlanDocument) => FloorPlanDocument) => {
          pushHistory();
          set((state) => ({ doc: fn(state.doc) }));
        };

        return {
          // Document
          doc: emptyDoc(),

          // Viewport
          viewport: defaultViewport(),

          // Selection
          selectedIds: new Set<string>(),
          selectionKind: "none",

          // Tool
          activeTool: "select",
          draft: null,

          // Preferences
          mode: "beginner",
          theme: "light",
          uiDensity: "comfortable",
          textScale: 1,
          showToolSidebar: true,
          showPropertiesSidebar: true,
          showLayersPanel: false,

          // History
          past: [],
          future: [],
          batching: false,

          // --- Document lifecycle ---
          resetDocument: (doc) =>
            set({
              doc: doc ?? emptyDoc(),
              selectedIds: new Set(),
              selectionKind: "none",
              past: [],
              future: [],
            }),

          // --- Viewport ---
          setViewport: (partial) =>
            set((state) => ({
              viewport: { ...state.viewport, ...partial },
            })),
          zoomIn: () =>
            set((state) => ({
              viewport: {
                ...state.viewport,
                zoom: clamp(
                  state.viewport.zoom * 1.1,
                  FLOOR_PLAN_ZOOM_MIN,
                  FLOOR_PLAN_ZOOM_MAX
                ),
              },
            })),
          zoomOut: () =>
            set((state) => ({
              viewport: {
                ...state.viewport,
                zoom: clamp(
                  state.viewport.zoom / 1.1,
                  FLOOR_PLAN_ZOOM_MIN,
                  FLOOR_PLAN_ZOOM_MAX
                ),
              },
            })),
          resetViewport: () =>
            set((state) => ({
              viewport: { ...state.viewport, zoom: 1, panX: 0, panY: 0 },
            })),
          fitToScreen: () =>
            set((state) => ({
              viewport: { ...state.viewport, zoom: 1, panX: 0, panY: 0 },
            })),
          setUnit: (unit) =>
            set((state) => ({
              viewport: { ...state.viewport, unit },
            })),

          // --- Tool ---
          setTool: (tool) =>
            set({
              activeTool: tool,
              draft: null,
              // Switching tool clears selection unless going back to select.
              selectedIds: tool === "select" ? get().selectedIds : new Set(),
              selectionKind: tool === "select" ? get().selectionKind : "none",
            }),
          setDraft: (draft) => set({ draft }),

          // --- Preferences ---
          setMode: (mode) => {
            // Advanced shows the layers panel by default.
            set((state) => ({
              mode,
              showLayersPanel: mode === "advanced" ? true : state.showLayersPanel,
            }));
          },
          setTheme: (theme) => set({ theme }),
          setDensity: (uiDensity) => set({ uiDensity }),
          setTextScale: (multiplier) =>
            set({ textScale: clamp(multiplier, 0.6, 1.8) }),
          toggleToolSidebar: () =>
            set((state) => ({ showToolSidebar: !state.showToolSidebar })),
          togglePropertiesSidebar: () =>
            set((state) => ({
              showPropertiesSidebar: !state.showPropertiesSidebar,
            })),
          toggleLayersPanel: () =>
            set((state) => ({ showLayersPanel: !state.showLayersPanel })),

          // --- Selection ---
          select: (ids, kind) => set({ selectedIds: new Set(ids), selectionKind: kind }),
          addToSelection: (id, kind) =>
            set((state) => {
              const next = new Set(state.selectedIds);
              next.add(id);
              const nextKind =
                state.selectionKind === "none" || state.selectionKind === kind
                  ? kind
                  : "mixed";
              return { selectedIds: next, selectionKind: nextKind };
            }),
          clearSelection: () =>
            set({ selectedIds: new Set(), selectionKind: "none" }),

          // --- Walls ---
          addWall: (w) => {
            const id = uid("wall");
            mutate((doc) => ({ ...doc, walls: [...doc.walls, { ...w, id }] }));
            return id;
          },
          updateWall: (id, patch) =>
            mutate((doc) => ({
              ...doc,
              walls: doc.walls.map((w) =>
                w.id === id ? { ...w, ...patch } : w
              ),
            })),
          deleteWalls: (ids) => {
            const toDelete = new Set(ids);
            mutate((doc) => ({
              ...doc,
              walls: doc.walls.filter((w) => !toDelete.has(w.id)),
              // Remove openings whose wall vanished.
              openings: doc.openings.filter((o) => !toDelete.has(o.wallId)),
            }));
          },

          // --- Openings ---
          addOpening: (o) => {
            const id = uid("open");
            mutate((doc) => ({
              ...doc,
              openings: [...doc.openings, { ...o, id }],
            }));
            return id;
          },
          updateOpening: (id, patch) =>
            mutate((doc) => ({
              ...doc,
              openings: doc.openings.map((o) =>
                o.id === id ? { ...o, ...patch } : o
              ),
            })),
          deleteOpenings: (ids) => {
            const toDelete = new Set(ids);
            mutate((doc) => ({
              ...doc,
              openings: doc.openings.filter((o) => !toDelete.has(o.id)),
            }));
          },

          // --- Annotations ---
          addAnnotation: (a) => {
            const id = uid("ann");
            mutate((doc) => ({
              ...doc,
              annotations: [...doc.annotations, { ...a, id }],
            }));
            return id;
          },
          updateAnnotation: (id, patch) =>
            mutate((doc) => ({
              ...doc,
              annotations: doc.annotations.map((a) =>
                a.id === id ? { ...a, ...patch } : a
              ),
            })),
          deleteAnnotations: (ids) => {
            const toDelete = new Set(ids);
            mutate((doc) => ({
              ...doc,
              annotations: doc.annotations.filter((a) => !toDelete.has(a.id)),
            }));
          },

          // --- Layers ---
          updateLayer: (id, patch) =>
            mutate((doc) => ({
              ...doc,
              layers: doc.layers.map((l) =>
                l.id === id ? { ...l, ...patch } : l
              ),
            })),
          addLayer: (name) => {
            const id = uid("layer");
            mutate((doc) => ({
              ...doc,
              layers: [
                ...doc.layers,
                {
                  id,
                  name,
                  visible: true,
                  locked: false,
                  sort_order: (doc.layers.at(-1)?.sort_order ?? 0) + 10,
                },
              ],
            }));
            return id;
          },
          deleteLayer: (id) => {
            // Can't delete the last layer. Orphan primitives migrate to
            // whatever's first.
            const doc = get().doc;
            if (doc.layers.length <= 1) return;
            const fallback = doc.layers.find((l) => l.id !== id)?.id ?? "walls";
            mutate((d) => ({
              ...d,
              layers: d.layers.filter((l) => l.id !== id),
              walls: d.walls.map((w) =>
                w.layerId === id ? { ...w, layerId: fallback } : w
              ),
              openings: d.openings.map((o) =>
                o.layerId === id ? { ...o, layerId: fallback } : o
              ),
              annotations: d.annotations.map((a) =>
                a.layerId === id ? { ...a, layerId: fallback } : a
              ),
            }));
          },

          // --- Styles ---
          setStyle: (id, style) =>
            mutate((doc) => ({
              ...doc,
              styles: { ...doc.styles, [id]: { ...(doc.styles[id] ?? {}), ...style } },
            })),
          clearStyle: (id) =>
            mutate((doc) => {
              const next = { ...doc.styles };
              delete next[id];
              return { ...doc, styles: next };
            }),

          // --- History ---
          beginBatch: () => set({ batching: true }),
          endBatch: () => set({ batching: false }),
          undo: () =>
            set((state) => {
              if (state.past.length === 0) return state;
              const previous = state.past[state.past.length - 1];
              const newPast = state.past.slice(0, -1);
              return {
                doc: previous.doc,
                past: newPast,
                future: [{ doc: state.doc }, ...state.future].slice(0, HISTORY_LIMIT),
              };
            }),
          redo: () =>
            set((state) => {
              if (state.future.length === 0) return state;
              const [next, ...rest] = state.future;
              return {
                doc: next.doc,
                past: [...state.past, { doc: state.doc }].slice(-HISTORY_LIMIT),
                future: rest,
              };
            }),
          canUndo: () => get().past.length > 0,
          canRedo: () => get().future.length > 0,
        };
      },
      {
        name: "hcc-floor-plan",
        partialize: (state): PersistedSlice => ({
          mode: state.mode,
          theme: state.theme,
          uiDensity: state.uiDensity,
          textScale: state.textScale,
          viewport: {
            gridSizePx: state.viewport.gridSizePx,
            showGrid: state.viewport.showGrid,
            snapToGrid: state.viewport.snapToGrid,
            snapToObjects: state.viewport.snapToObjects,
            unit: state.viewport.unit,
          },
        }),
        merge: (persisted, current) => {
          const slice = (persisted ?? {}) as Partial<PersistedSlice>;
          return {
            ...current,
            mode: slice.mode ?? current.mode,
            theme: slice.theme ?? current.theme,
            uiDensity: slice.uiDensity ?? current.uiDensity,
            textScale: slice.textScale ?? current.textScale,
            viewport: {
              ...current.viewport,
              ...(slice.viewport ?? {}),
            },
          };
        },
      }
    )
  )
);
