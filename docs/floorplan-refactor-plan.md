# Floor Plan Designer — UI/UX Refactor Plan (Major 1)

Source spec: `floorplan_UIX_refactor_major1.json`
Target: in-place refactor of the existing moving-workflow editor at
`packages/web/src/components/features/floor-plan-editor.tsx` (+ canvas,
sticker icons, shared schemas).
Scope chosen by user: **everything in one pass**, phased so each phase is
independently shippable.

---

## 1. What exists today

| Area | State |
|---|---|
| Editor shell | Fullscreen modal, top-bar + two floating panels (tools, help) over a single canvas. Hidden-by-default panels. |
| Data model | `MoveRoom` (rect + legacy polygon) and `MoveSticker` (~60 kinds, rect + rotation). Both stored in 0..1 normalized coords on an image-backed canvas. |
| Tools | Drop-room-stamp, sticker palette (60 kinds), select / move / resize / rotate. |
| Persistence | Per-entity REST via TanStack Query mutations in `routes/moving.tsx`. Optimistic updates in place. |
| Missing vs spec | Zoom/pan, grid + snap, wall drawing as a primitive, live dimensions, multi-select/marquee, undo/redo, property panel (style/opacity/line), layers, annotations, templates, exports (PDF/PNG/SVG), import-as-underlay, onboarding, accessibility modes. |

The editor is used **only** inside the Moving section — rooms double as
drop targets for the item-assignment hero. That behavior has to survive
the refactor.

## 2. Guiding principles for the refactor

1. **Backward-compatible persistence.** `MoveRoom` and `MoveSticker` tables
   stay untouched in phases 1–2. New primitives (walls, annotations,
   layers, extended style props) first live as **client-side extensions**
   rendered into an in-memory `FloorPlanDocument`. Phase 2 adds a
   schema/API migration for the primitives that need durability.
2. **Progressive disclosure.** Two explicit modes: *Beginner* (drop rooms,
   drop furniture, no walls/snap/precision) and *Advanced* (walls,
   dimensions, snap, layers, context menu). Mode is a store setting.
3. **Single document, single undo stack.** A Zustand store owns the
   document and a ring-buffered history (undo/redo). All tools mutate
   the store, which triggers debounced server-side persistence.
4. **Canvas is the hero.** IA matches spec: top bar, left tools column,
   center canvas, right properties panel — each sidebar independently
   collapsible.

## 3. Data model (end state)

```ts
// packages/shared/src/types/index.ts (additions)

export type Unit = "metric" | "imperial";

export interface CanvasViewport {
  zoom: number;         // 1 = fit-to-screen baseline
  panX: number;         // normalized
  panY: number;
  gridSizePx: number;   // 20, 40, 80 presets
  snapToGrid: boolean;
  snapToObjects: boolean;
  unit: Unit;
  scaleMetersPerUnit: number; // 1 unit = 10 m default
}

export interface FloorPlanWall {
  id: string;
  // Walls are primitives: two endpoints + thickness. Persisted as a
  // sticker of kind "wall" with extended metadata in phase 1; promoted
  // to a dedicated row in phase 2.
  x1: number; y1: number; x2: number; y2: number;
  thickness: number;     // 0..0.05 normalized (presets: thin/std/thick)
  lineStyle: "solid" | "dashed" | "dotted";
  color: string;
  layerId: string;
  locked: boolean;
  hidden: boolean;
}

export interface FloorPlanOpening {
  // Doors + windows — always snapped into a wall. Position is a
  // param along the wall [0..1] plus width (normalized).
  id: string;
  kind: "door" | "door_double" | "sliding_door" | "garage_door" | "window";
  wallId: string;
  t: number;             // position along wall
  width: number;         // normalized
  swing?: "left" | "right" | "none";
  layerId: string;
  locked: boolean;
  hidden: boolean;
}

export interface FloorPlanAnnotation {
  id: string;
  kind: "label" | "note" | "callout" | "dimension" | "arrow";
  x: number; y: number;
  width?: number; height?: number;
  x2?: number; y2?: number;  // for arrows / dimensions
  text?: string;
  fontSizePx: number;
  bold: boolean;
  color: string;
  layerId: string;
  locked: boolean;
  hidden: boolean;
}

export interface FloorPlanLayer {
  id: string;             // "walls" | "furniture" | "annotations" | ...
  name: string;
  visible: boolean;
  locked: boolean;
}

// Extended sticker/room fields (client-side until phase 2 migration):
export interface ObjectStyle {
  outlineColor?: string;
  fillColor?: string;
  outlineThickness?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  opacity?: number;
  material?: string;
  layerId?: string;
  locked?: boolean;
  hidden?: boolean;
  clearanceZone?: boolean;
}
```

## 4. Store

```ts
// packages/web/src/stores/floor-plan.ts
useFloorPlanStore = create<FloorPlanState>()(temporal((set,get) => ({
  doc: FloorPlanDocument,
  viewport: CanvasViewport,
  selection: { ids: Set<string>, kind: "mixed" | "room" | "wall" | ... },
  activeTool: "select" | "wall" | "room-rect" | "room-polygon" | "door" | "window" | "dimension" | "text" | "pan",
  mode: "beginner" | "advanced",
  theme: "light" | "dark" | "high-contrast",
  uiDensity: "comfortable" | "compact",
  layers: FloorPlanLayer[],
  // actions: addWall, updateWall, deleteWall, addOpening, addAnnotation,
  //          setTool, setMode, undo, redo, setViewport, ...
}))
```

Undo/redo uses the `zundo` middleware already viable on React 19. History
is coalesced on drag end (not mid-drag).

## 5. Phased implementation

### Phase 1 — Foundation (this session)

**Deliverables**
- Extended shared types (`FloorPlanDocument`, layers, openings, annotations, object style).
- `stores/floor-plan.ts` with document + viewport + selection + undo/redo.
- New editor shell: top bar with mode switch, zoom %, fit, reset, undo/redo, save status, export menu (stub); left tools column with collapsible toolgroups (Walls, Rooms, Doors/Windows, Furniture, Annotations); right properties panel with tabs (Properties, Style, Dimensions, Layers); canvas with spacebar-pan, zoom (wheel/trackpad), grid overlay (adjustable), snap-to-grid, snap-to-object (edges, corners, centerlines, wall intersections).
- Wall drawing tool (click-to-place endpoints, Enter/double-click to finish), live dimension preview, auto-join wall corners, thickness presets + custom input.
- Rectangle room tool with live dimensions.
- Multi-select, marquee, context menu (duplicate/delete/lock/align/bring-forward/send-backward).
- Property panel: width/height/length/rotation inputs, line thickness/style, fill/outline colors, opacity, label, lock/hide, material, preset sizes for common object types.
- Measurement toggle (metric/imperial) with scale indicator.
- Keyboard shortcuts (V select, W wall, R room, D door, N window, T text, L lock, Del, Ctrl+Z/Y, Ctrl+D duplicate, Space pan, + / − zoom, 0 fit).

**Files touched**
- `packages/shared/src/types/index.ts` — new types, non-breaking additions.
- `packages/shared/src/constants/defaults.ts` — grid/thickness/font presets.
- `packages/web/src/stores/floor-plan.ts` — new.
- `packages/web/src/lib/floor-plan/` — new helpers: `geometry.ts` (snap, join, intersect), `coords.ts` (normalized↔px, viewport transform), `history.ts` (undo stack), `units.ts`.
- `packages/web/src/components/features/floor-plan-editor.tsx` — rewrite.
- `packages/web/src/components/features/floor-plan/` — new: `EditorShell.tsx`, `TopBar.tsx`, `ToolSidebar.tsx`, `PropertiesSidebar.tsx`, `Canvas.tsx`, `tools/WallTool.tsx`, `tools/RoomRectTool.tsx`, `tools/SelectTool.tsx`, `overlays/GridOverlay.tsx`, `overlays/SnapGuides.tsx`, `overlays/DimensionLabel.tsx`, `panels/PropertiesPanel.tsx`, `panels/StylePanel.tsx`, `panels/LayersPanel.tsx`.

Walls in phase 1 persist by serializing `{x1,y1,x2,y2,thickness,…}` into the `wall` sticker record's `label` (JSON). This is hacky but reversible and avoids a backend migration inside this phase. Phase 2 swaps this for a proper table.

### Phase 2 — Polygon rooms, openings, alignment, measurement

- Custom polygon room tool (reuse legacy polygon schema already in `MoveRoom.polygon`).
- Doors/windows auto-snap into walls; wall openings render cuts automatically; door swing arcs rendered when the opening owns a `swing` value.
- Smart alignment guides on drag/draw (edge/center match).
- Manual dimension line tool.
- Interior vs exterior measurement modes.
- Appliance clearance zones (fridge, oven, dishwasher, door swing).
- Validation warnings for placement conflicts.
- Backend migration: `move_wall`, `move_opening`, `move_annotation`, `move_layer` tables + mirroring Drizzle schemas + API routes + shared Zod schemas.

### Phase 3 — Annotations, layers, views

- Annotation tools (labels, notes, callouts, arrows, dimension labels).
- Layer visibility/lock panel. Preset layers: walls, furniture, annotations, electrical, plumbing.
- View presets: simple / presentation / technical / empty-shell / furnished.
- Automatic room-area computation and metadata panel.

### Phase 4 — Exports, import, templates

- Export to PDF (skill-assisted), PNG (canvas snapshot), SVG (native serialization).
- Print-ready layout + grayscale option.
- Shareable read-only link (query-signed).
- Import image as tracing underlay (opacity slider).
- Starter templates and prebuilt layout snippets (kitchen, bathroom, bedroom).
- Sample editable demo plan.

### Phase 5 — Onboarding, accessibility, polish

- First-run guided flow with skip.
- Inline hints + short tooltips (with visual examples).
- High-contrast mode, colorblind palette, large-drag-handle setting, text-scale setting (S/M/L).
- Touch/trackpad gesture parity.
- Customizable toolbar arrangement + autosave + version history.

## 6. Beginner vs Advanced mode behavior

| Feature | Beginner | Advanced |
|---|---|---|
| Left-sidebar sections | Rooms, Doors/Windows, Furniture | + Walls, Annotations, Structural |
| Right-sidebar tabs | Properties only | Properties, Style, Dimensions, Layers |
| Dimension input | Sliders + preset sizes | Sliders + typed exact numeric (with unit) |
| Snap | Grid only, 40px | Grid + object snap, adjustable |
| Context menu | Duplicate, delete | + Lock, Align, Bring-forward/Send-backward, Replace |
| Keyboard shortcuts | Arrow nudges, Del | Full shortcut set |
| Overlays shown | Grid only if user opts in | Grid, snap guides, clearance zones, dimensions |
| Confirmation on destructive actions | Always | Once per type per session |

Mode is a user-level setting stored alongside theme/density.

## 7. Key interaction flows

- **Draw a wall:** user clicks W → cursor becomes crosshair → click for endpoint A → move cursor, see live dimension label and snap guides → click for endpoint B → press Enter to commit, Esc to cancel. Shift constrains to 15°.
- **Draw a room rectangle:** user clicks R → click-drag on canvas → live W×H label tracks pointer → release to commit → room opens in Properties.
- **Add a door:** user clicks D → hovers a wall → ghost door previews at nearest wall segment, snapped to wall thickness → click to place.
- **Select + edit:** click object → right panel opens on Properties tab → numeric fields editable; changes coalesce into a single undo entry after 300ms idle.
- **Marquee multi-select:** drag on empty canvas → selects all overlapping objects (respecting layer lock).
- **Pan + zoom:** Space+drag to pan; wheel / pinch to zoom; 0 to fit, Cmd+0 to reset.

## 8. Accessibility

- Tab order: top-bar → left tools → canvas → right panel.
- All tools have `aria-label` + `aria-keyshortcuts`.
- Focus ring uses `shadow.focus` token.
- Minimum contrast ratio 4.5:1 for canvas-overlay text; high-contrast mode bumps to 7:1.
- Font scale setting exposes three presets and persists.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Walls-as-serialized-sticker (phase 1) confuses future migrations | Tag payload with `"__wall_v1"` prefix; phase 2 migration explicitly reads that prefix and promotes to `move_wall`. |
| Large refactor breaks Moving hero drag-drop | Keep `FloorPlanCanvas` (non-editor) untouched in phase 1; only the editor gains the new shell. |
| Undo/redo + optimistic mutations double-save | Debounced flush (300ms idle), plus a `hydrating` flag that disables history capture while loading server data. |
| Perf of SVG with hundreds of stickers + walls + grid | Grid is CSS background (no SVG nodes). Walls use a single `<path>` per batch. Layer visibility gates re-render. |
| Scope creep inside phase 1 | Strict phase-1 checklist; anything not on it is a TODO comment referencing phase 2–5. |

## 10. Success criteria (from spec)

- [ ] A beginner can draw a basic room layout within minutes.
- [ ] A beginner can place furniture without reading documentation.
- [ ] A user can edit exact dimensions without hunting through the UI.
- [ ] A user can change line thickness, text/font settings, and object properties easily.
- [ ] The interface feels uncluttered despite supporting many options.
- [ ] The application accommodates both casual and precision-oriented workflows.

---

*Plan approved by user at 2026-04-22 — scope: everything in one pass, phase 1 starts immediately.*
