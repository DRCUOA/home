/**
 * Workflow dispatch hook.
 *
 * The side-effecting half of the move workflow. Given an action
 * descriptor + resolved target (from `lib/move-workflow.ts`), this
 * hook writes to the API and invalidates queries.
 *
 * UI-only intents (edit, view contents, pick a box/room) are
 * delegated to caller-supplied callbacks so this layer stays free of
 * React UI concerns.
 *
 * Status-changing actions all funnel through the existing
 * `move-scan-events` and `move-boxes/:id/status` endpoints so the
 * audit trail and box→item cascade are identical to a real scan.
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import type { MoveBox, MoveItem } from "@hcc/shared";
import type {
  ActionId,
  ResolvedTarget,
  WorkflowAction,
} from "@/lib/move-workflow";

/** UI callbacks the dispatch can't fulfil on its own (modals, pickers,
 *  navigations). Anything left undefined is treated as a no-op. */
export interface DispatchCallbacks {
  onOpenItemModal?: (item: MoveItem) => void;
  onOpenBoxModal?: (box: MoveBox) => void;
  onChooseDisposition?: (item: MoveItem) => void;
  onChooseBox?: (item: MoveItem) => void;
  onChooseDestinationRoom?: (item: MoveItem) => void;
  onChooseBoxDestinationRoom?: (box: MoveBox) => void;
  onViewBoxContents?: (box: MoveBox) => void;
  onViewItemBox?: (item: MoveItem) => void;
  onViewScanHistory?: (target: ResolvedTarget) => void;
  onAddNewBox?: (code: string) => void;
  onAddNewItem?: (code: string) => void;
  onPrintLabel?: (target: ResolvedTarget) => void;
  onAddPhoto?: (item: MoveItem) => void;
}

interface DispatchExtras {
  /** Used by `assign_to_box`, `move_to_another_box`. */
  boxId?: string;
  /** Used by `assign_destination_room`. */
  roomId?: string;
  /** Optional note attached to the scan event. */
  note?: string;
}

async function jsonPatch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function useWorkflowDispatch(
  moveId: string,
  projectId: string,
  callbacks: DispatchCallbacks = {}
) {
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["move-boxes", moveId] });
    qc.invalidateQueries({ queryKey: ["move-items", moveId] });
    qc.invalidateQueries({ queryKey: ["move-scan-events", moveId] });
  }, [moveId, qc]);

  /** Box-status transition via the existing endpoint — this both
   *  writes the box status and (server-side) appends a scan event +
   *  cascades to contained items. */
  const transitionBox = useCallback(
    async (box: MoveBox, status: string, note?: string) => {
      await jsonPatch(`/api/v1/move-boxes/${box.id}/status`, { status, note });
      invalidate();
    },
    [invalidate]
  );

  /** Scan-event write for actions that don't fit the box-status
   *  transition pattern (deliver_to_room, mark_missing, mark_damaged
   *  on items, install, remove). Server cascades item rollups too. */
  const writeScanEvent = useCallback(
    async (
      target: ResolvedTarget,
      action: string,
      note?: string
    ) => {
      if (target.kind === "unknown") return;
      await apiPost("/move-scan-events", {
        move_id: moveId,
        code: target.kind === "box" ? target.record.barcode : (target.record.barcode ?? target.record.id),
        target_kind: target.kind,
        target_id: target.record.id,
        action,
        note,
      });
      invalidate();
    },
    [moveId, invalidate]
  );

  const patchItem = useCallback(
    async (item: MoveItem, data: Record<string, unknown>) => {
      await jsonPatch(`/api/v1/move-items/${item.id}`, data);
      invalidate();
    },
    [invalidate]
  );

  /** Create a follow-up task linked to the current move's project.
   *  Used by disposition shortcuts (Sell / Donate / Recycle / Dump /
   *  Repair). */
  const createTask = useCallback(
    async (title: string, projectId: string) => {
      await apiPost("/tasks", {
        title,
        project_id: projectId,
        priority: "medium",
        kind: "task",
      });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    [qc]
  );

  /** Dispatch entry point. */
  const dispatch = useCallback(
    async (
      action: WorkflowAction,
      target: ResolvedTarget,
      extras: DispatchExtras = {}
    ): Promise<void> => {
      const id: ActionId = action.id;

      // ------- Unknown-target actions -------
      if (target.kind === "unknown") {
        switch (id) {
          case "add_as_box":
            callbacks.onAddNewBox?.(target.code);
            return;
          case "add_as_item":
            callbacks.onAddNewItem?.(target.code);
            return;
          case "ignore_scan":
            // Log it so the user can find it later under Problems
            // (unknown scan list).
            await apiPost("/move-scan-events", {
              move_id: moveId,
              code: target.code,
              target_kind: "box",
              action: "lookup",
              note: "Ignored unknown scan",
            });
            invalidate();
            return;
          default:
            return;
        }
      }

      // ------- Box actions -------
      if (target.kind === "box") {
        const box = target.record;
        switch (id) {
          case "seal_box":
            return transitionBox(box, "packed");
          case "stage_box":
            return transitionBox(box, "staged");
          case "load_box":
            return transitionBox(box, "loaded");
          case "deliver_box":
            return transitionBox(box, "delivered");
          case "deliver_to_room":
            await writeScanEvent(target, "deliver_to_room");
            return;
          case "unpack_box":
            return transitionBox(box, "unpacked");
          case "mark_damaged":
            return writeScanEvent(target, "mark_damaged");
          case "mark_missing":
            return writeScanEvent(target, "mark_missing");
          case "edit_box":
            callbacks.onOpenBoxModal?.(box);
            return;
          case "view_box_contents":
            callbacks.onViewBoxContents?.(box);
            return;
          case "edit_box_destination":
            callbacks.onChooseBoxDestinationRoom?.(box);
            return;
          case "print_box_label":
            callbacks.onPrintLabel?.(target);
            return;
          case "add_item_to_box":
            callbacks.onOpenBoxModal?.(box);
            return;
          default:
            return;
        }
      }

      // ------- Item actions -------
      const item = target.record;
      switch (id) {
        case "choose_disposition":
          callbacks.onChooseDisposition?.(item);
          return;
        case "mark_keep":
          return patchItem(item, { disposition: "keep", status: "ready_to_pack" });
        case "mark_sell":
          await patchItem(item, { disposition: "sell" });
          await createTask(`Sell: ${item.name}`, projectId);
          return;
        case "mark_donate":
          await patchItem(item, { disposition: "donate" });
          await createTask(`Donate: ${item.name}`, projectId);
          return;
        case "mark_recycle":
          await patchItem(item, { disposition: "recycle" });
          await createTask(`Recycle: ${item.name}`, projectId);
          return;
        case "mark_dump":
          await patchItem(item, { disposition: "dump" });
          await createTask(`Dump: ${item.name}`, projectId);
          return;
        case "mark_stage_only":
          return patchItem(item, { disposition: "stage_only" });
        case "mark_repair":
          await patchItem(item, { disposition: "repair_clean_first" });
          await createTask(`Repair / clean: ${item.name}`, projectId);
          return;
        case "mark_removed":
          return patchItem(item, { status: "removed" });
        case "assign_to_box":
        case "move_to_another_box":
          if (extras.boxId) {
            return patchItem(item, { box_id: extras.boxId, status: "packed" });
          }
          callbacks.onChooseBox?.(item);
          return;
        case "assign_destination_room":
          if (extras.roomId) {
            return patchItem(item, { destination_room_id: extras.roomId });
          }
          callbacks.onChooseDestinationRoom?.(item);
          return;
        case "mark_unpacked_item":
          return writeScanEvent(target, "unpack");
        case "mark_installed":
          return writeScanEvent(target, "install");
        case "mark_complete":
          return patchItem(item, { status: "installed" });
        case "mark_missing":
          return writeScanEvent(target, "mark_missing");
        case "mark_damaged":
          return writeScanEvent(target, "mark_damaged");
        case "mark_found":
          return patchItem(item, { status: "delivered" });
        case "resolve_damage":
          return patchItem(item, { status: "delivered" });
        case "edit_item":
          callbacks.onOpenItemModal?.(item);
          return;
        case "view_item_box":
          callbacks.onViewItemBox?.(item);
          return;
        case "view_scan_history":
          callbacks.onViewScanHistory?.(target);
          return;
        case "add_photo":
          callbacks.onAddPhoto?.(item);
          return;
        case "print_item_label":
          callbacks.onPrintLabel?.(target);
          return;
        default:
          return;
      }
    },
    [
      callbacks,
      moveId,
      projectId,
      invalidate,
      transitionBox,
      writeScanEvent,
      patchItem,
      createTask,
    ]
  );

  return { dispatch };
}
