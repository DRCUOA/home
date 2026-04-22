/**
 * Floor Plan Designer — top-level shell.
 *
 * Composition (spec: informationArchitecture):
 *
 *   ┌─────────────────────────────── TopBar ────────────────────────────────┐
 *   │ title · undo/redo · zoom · scale · mode · save · image · export · × │
 *   ├──────────┬────────────────────────────────────────────┬───────────────┤
 *   │   Tool   │                                            │   Properties  │
 *   │  Sidebar │                 Canvas                     │    Sidebar    │
 *   │          │                                            │  (tabs)       │
 *   └──────────┴────────────────────────────────────────────┴───────────────┘
 *
 * The shell owns the high-level orchestration (closes, keyboard shortcuts,
 * mode + theme surface) and delegates rendering to the dedicated pieces.
 * Individual pieces read from the Zustand store directly.
 */

import { useEffect } from "react";
import type {
  MoveRoom,
  MoveSticker,
  MoveStickerKind,
} from "@hcc/shared";
import { FloorPlanTopBar } from "./TopBar";
import { ToolSidebar } from "./ToolSidebar";
import { PropertiesSidebar } from "./PropertiesSidebar";
import { FloorPlanCanvasInner } from "./Canvas";
import { useFloorPlanStore } from "@/stores/floor-plan";
import { STICKER_DEFAULT_SIZES } from "../sticker-icons";
import { cn } from "@/lib/cn";
import { useState } from "react";

interface Props {
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
  onDeleteRoom: (id: string) => void;
  onCreateSticker: (partial: {
    kind: MoveStickerKind;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    label?: string;
  }) => void;
  onUpdateSticker: (id: string, patch: Partial<MoveSticker>) => void;
  onDeleteSticker: (id: string) => void;
}

export function FloorPlanEditorShell({
  side,
  title,
  imageUrl,
  rooms,
  stickers,
  onClose,
  onUploadPlan,
  onRemovePlan,
  onCreateRoom,
  onUpdateRoom,
  onDeleteRoom,
  onCreateSticker,
  onUpdateSticker,
  onDeleteSticker,
}: Props) {
  void side;
  const theme = useFloorPlanStore((s) => s.theme);
  const textScale = useFloorPlanStore((s) => s.textScale);
  const showToolSidebar = useFloorPlanStore((s) => s.showToolSidebar);
  const showPropertiesSidebar = useFloorPlanStore((s) => s.showPropertiesSidebar);
  const setTool = useFloorPlanStore((s) => s.setTool);
  const mode = useFloorPlanStore((s) => s.mode);
  const undo = useFloorPlanStore((s) => s.undo);
  const redo = useFloorPlanStore((s) => s.redo);
  const zoomIn = useFloorPlanStore((s) => s.zoomIn);
  const zoomOut = useFloorPlanStore((s) => s.zoomOut);
  const resetViewport = useFloorPlanStore((s) => s.resetViewport);
  const fitToScreen = useFloorPlanStore((s) => s.fitToScreen);
  const clearSelection = useFloorPlanStore((s) => s.clearSelection);

  const [selection, setSelection] = useState<{
    kind: "none" | "room" | "sticker" | "wall" | "mixed";
    ids: string[];
  }>({ kind: "none", ids: [] });

  // Stamp helpers for the palette "click" action.
  const stampRoom = () => {
    const w = 0.3;
    const h = 0.25;
    onCreateRoom({
      name: `Room ${rooms.length + 1}`,
      x: 0.5 - w / 2,
      y: 0.5 - h / 2,
      width: w,
      height: h,
      rotation: 0,
    });
  };
  const stampSticker = (kind: MoveStickerKind) => {
    const { w, h } = STICKER_DEFAULT_SIZES[kind];
    onCreateSticker({
      kind,
      x: 0.5 - w / 2,
      y: 0.5 - h / 2,
      width: w,
      height: h,
      rotation: 0,
      label: kind === "label" ? "Label" : undefined,
    });
  };

  const createRoomRect = (r: { x: number; y: number; width: number; height: number }) => {
    onCreateRoom({
      name: `Room ${rooms.length + 1}`,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      rotation: 0,
    });
  };

  const handleSelection = (
    kind: "room" | "sticker" | "wall" | "none",
    ids: string[]
  ) => {
    setSelection({ kind, ids });
  };

  const duplicateSticker = (s: MoveSticker) => {
    onCreateSticker({
      kind: s.kind as MoveStickerKind,
      x: Math.min(0.9, s.x + 0.03),
      y: Math.min(0.9, s.y + 0.03),
      width: s.width,
      height: s.height,
      rotation: s.rotation,
      label: s.label,
    });
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (document.activeElement as HTMLElement | null)?.isContentEditable;
      if (typing) return;
      if (e.key === "Escape") {
        if (selection.kind === "none") onClose();
        else {
          clearSelection();
          setSelection({ kind: "none", ids: [] });
        }
      }
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        }
        if ((e.key === "z" && e.shiftKey) || e.key === "y") {
          e.preventDefault();
          redo();
        }
        if (e.key === "0") {
          e.preventDefault();
          resetViewport();
        }
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          zoomIn();
        }
        if (e.key === "-") {
          e.preventDefault();
          zoomOut();
        }
      } else {
        if (e.key === "v" || e.key === "V") setTool("select");
        if (e.key === "w" || e.key === "W") {
          if (mode === "advanced") setTool("wall");
        }
        if (e.key === "r" || e.key === "R") setTool("room-rect");
        if (e.key === "p" || e.key === "P") {
          if (mode === "advanced") setTool("room-polygon");
        }
        if (e.key === "t" || e.key === "T") {
          if (mode === "advanced") setTool("text");
        }
        if (e.key === "0") fitToScreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selection.kind,
    clearSelection,
    onClose,
    undo,
    redo,
    resetViewport,
    zoomIn,
    zoomOut,
    setTool,
    mode,
    fitToScreen,
  ]);

  const themeClass =
    theme === "dark"
      ? "dark"
      : theme === "high-contrast"
        ? "dark contrast-more"
        : "";

  return (
    <div
      className={cn("fixed inset-0 z-50 flex flex-col bg-slate-50 dark:bg-slate-950", themeClass)}
      style={{ fontSize: `${textScale}rem` }}
    >
      <FloorPlanTopBar
        title={title}
        hasImage={!!imageUrl}
        onClose={onClose}
        onUploadPlan={onUploadPlan}
        onRemovePlan={onRemovePlan}
      />
      <div className="flex-1 min-h-0 flex">
        {showToolSidebar && (
          <ToolSidebar onStampRoom={stampRoom} onStampSticker={stampSticker} />
        )}
        <FloorPlanCanvasInner
          imageUrl={imageUrl}
          rooms={rooms}
          stickers={stickers}
          onCreateRoomRect={createRoomRect}
          onUpdateRoom={onUpdateRoom}
          onDeleteRooms={(ids) => ids.forEach((id) => onDeleteRoom(id))}
          onCreateSticker={onCreateSticker}
          onUpdateSticker={onUpdateSticker}
          onDeleteStickers={(ids) => ids.forEach((id) => onDeleteSticker(id))}
          onSelectionChange={handleSelection}
        />
        {showPropertiesSidebar && (
          <PropertiesSidebar
            selectedKind={selection.kind}
            selectedIds={selection.ids}
            rooms={rooms}
            stickers={stickers}
            onUpdateRoom={onUpdateRoom}
            onUpdateSticker={onUpdateSticker}
            onDeleteRoom={onDeleteRoom}
            onDeleteSticker={onDeleteSticker}
            onDuplicateSticker={duplicateSticker}
          />
        )}
      </div>
    </div>
  );
}
