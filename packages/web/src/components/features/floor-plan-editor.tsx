/**
 * Floor Plan Editor (public entry point).
 *
 * Before the UI/UX refactor this file contained the entire editor: ~1200
 * lines of canvas + palette + panel code. After the refactor it's a thin
 * adapter that forwards the Moving workflow's props to the new designer
 * shell under `./floor-plan/`. This keeps moving.tsx's call site stable
 * while the internals become the spec-compliant designer.
 *
 * The old implementation was extracted into:
 *   - floor-plan/EditorShell.tsx          — top-level composition
 *   - floor-plan/TopBar.tsx               — zoom/undo/mode/export/save
 *   - floor-plan/ToolSidebar.tsx          — left: walls, rooms, library, annotations
 *   - floor-plan/Canvas.tsx               — SVG canvas + tools + handles
 *   - floor-plan/PropertiesSidebar.tsx    — right: tabs (Properties/Style/Dimensions/Layers)
 *
 * The store at `stores/floor-plan.ts` owns the client-only pieces
 * (walls, openings, annotations, layers, viewport, mode, undo/redo);
 * room + sticker persistence still flows through the existing TanStack
 * Query mutations in moving.tsx.
 */

import type { MoveRoom, MoveSticker, MoveStickerKind } from "@hcc/shared";
import { FloorPlanEditorShell } from "./floor-plan/EditorShell";

interface FloorPlanEditorProps {
  side: "origin" | "destination";
  title: string;
  imageUrl: string | null;
  rooms: MoveRoom[];
  stickers: MoveSticker[];

  onClose: () => void;
  onUploadPlan: () => void;
  onRemovePlan?: () => void;

  onCreateRoom: (partial: {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }) => void;
  onUpdateRoom: (id: string, patch: Partial<MoveRoom>) => void;
  onDeleteRoom: (roomId: string) => void;

  onCreateSticker: (partial: {
    kind: MoveStickerKind;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    label?: string;
  }) => void;
  onUpdateSticker: (id: string, changes: Partial<MoveSticker>) => void;
  onDeleteSticker: (id: string) => void;
}

export function FloorPlanEditor(props: FloorPlanEditorProps) {
  return <FloorPlanEditorShell {...props} />;
}
