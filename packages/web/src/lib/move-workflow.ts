/**
 * Move workflow engine.
 *
 * Pure functions only — no React, no fetch. The UI layer uses these to
 * figure out:
 *
 *   - given a scanned/resolved target (box / item / unknown), what
 *     actions are valid?
 *   - which of those actions should we recommend as the primary?
 *   - what phase of the move are we in right now?
 *
 * The dispatch hook (`use-workflow-dispatch.ts`) is the side-effecting
 * half — it takes an action descriptor + target and writes to the API.
 * Splitting it this way means the rule table here can be tested
 * standalone, and the UI never hard-codes "if status === 'packed' show
 * Load button" — it just renders whatever this layer says.
 */

import type { Move, MoveBox, MoveItem, MoveRoom } from "@hcc/shared";

/* -------------------------------------------------------------------- */
/*  Types                                                                */
/* -------------------------------------------------------------------- */

export type ResolvedTarget =
  | { kind: "box"; record: MoveBox }
  | { kind: "item"; record: MoveItem }
  | { kind: "unknown"; code: string };

export type WorkflowPhase =
  | "survey"
  | "pack"
  | "stage"
  | "load"
  | "transit"
  | "unpack"
  | "install"
  | "done";

export interface WorkflowContext {
  move: Move;
  rooms: MoveRoom[];
  boxes: MoveBox[];
  items: MoveItem[];
  /** Derived from box / item rollups; used as a tie-breaker when
   *  multiple actions are valid for a target. */
  phase: WorkflowPhase;
  /** Optional: a box the user is currently "filling" — when present,
   *  scanning an item offers "Add to this box" as the primary. */
  focusedBoxId?: string;
}

/** Canonical action ids. Centralized so the dispatch hook and the UI
 *  agree on what each label means. */
export type ActionId =
  // Unknown-target actions
  | "add_as_box"
  | "add_as_item"
  | "ignore_scan"
  // Assign / re-assign a barcode to a box or object (opens the metadata
  // sheet). Valid for every target kind.
  | "assign_barcode"
  // Box lifecycle
  | "seal_box"
  | "stage_box"
  | "load_box"
  | "deliver_box"
  | "deliver_to_room"
  | "unpack_box"
  // Box admin
  | "edit_box"
  | "view_box_contents"
  | "edit_box_destination"
  | "add_item_to_box"
  | "print_box_label"
  // Item disposition
  | "choose_disposition"
  | "mark_keep"
  | "mark_sell"
  | "mark_donate"
  | "mark_recycle"
  | "mark_dump"
  | "mark_stage_only"
  | "mark_repair"
  // Item lifecycle
  | "assign_to_box"
  | "view_item_box"
  | "move_to_another_box"
  | "mark_unpacked_item"
  | "mark_installed"
  | "mark_complete"
  | "assign_destination_room"
  // Item admin
  | "edit_item"
  | "add_photo"
  | "print_item_label"
  | "view_scan_history"
  // Exception
  | "mark_missing"
  | "mark_damaged"
  | "mark_found"
  | "resolve_damage"
  // Removal terminal
  | "mark_removed";

export interface WorkflowAction {
  id: ActionId;
  label: string;
  description?: string;
  /** Render this one as the big primary button. Exactly one `primary`
   *  action per allowed set (the recommender enforces this). */
  primary?: boolean;
  /** Render in red — confirms before write. */
  danger?: boolean;
  /** Ask for an extra tap to confirm. Used for marks that can't be
   *  cleanly undone. */
  requiresConfirmation?: boolean;
}

/* -------------------------------------------------------------------- */
/*  Phase inference                                                      */
/* -------------------------------------------------------------------- */

/** Pick the earliest phase that still has outstanding work. Used to
 *  drive the Dashboard "Current focus" prompt and to break ties when
 *  multiple actions are valid (e.g. on a packed box during the load
 *  phase, prefer "Load now" over "Move to staging"). */
export function getMovePhase(boxes: MoveBox[], items: MoveItem[]): WorkflowPhase {
  const itemsActive = items.filter((i) => i.status !== "removed");
  if (itemsActive.length === 0) return "survey";

  const hasUnassessed = itemsActive.some(
    (i) => i.status === "surveyed" || i.disposition === "unassessed"
  );
  if (hasUnassessed) return "survey";

  const boxesActive = boxes;
  const anyPreparing = boxesActive.some((b) => b.status === "preparing");
  if (anyPreparing) return "pack";

  const anyPacked = boxesActive.some((b) => b.status === "packed");
  if (anyPacked) return "stage";

  const anyStaged = boxesActive.some((b) => b.status === "staged");
  if (anyStaged) return "load";

  const anyLoaded = boxesActive.some((b) => b.status === "loaded");
  if (anyLoaded) return "transit";

  const anyDelivered = boxesActive.some((b) => b.status === "delivered");
  if (anyDelivered) return "unpack";

  const anyUnpackedItems = itemsActive.some((i) => i.status === "unpacked");
  if (anyUnpackedItems) return "install";

  return "done";
}

/* -------------------------------------------------------------------- */
/*  Action tables                                                        */
/* -------------------------------------------------------------------- */

function unknownActions(): WorkflowAction[] {
  return [
    {
      id: "assign_barcode",
      label: "Assign barcode",
      description: "Bind this code to a box or object",
      primary: true,
    },
    { id: "add_as_box", label: "Add as new box" },
    { id: "add_as_item", label: "Add as new item" },
    { id: "ignore_scan", label: "Ignore", description: "Log the scan only" },
  ];
}

/** Box actions by lifecycle status. Phase-aware tweak: during the
 *  `load` phase we surface "Load" as primary even for `packed` boxes,
 *  since the user has clearly moved on past staging. */
function boxActions(box: MoveBox, ctx: WorkflowContext): WorkflowAction[] {
  const phase = ctx.phase;
  switch (box.status) {
    case "preparing":
      return [
        { id: "seal_box", label: "Seal box", primary: true },
        { id: "edit_box", label: "Edit box" },
        { id: "add_item_to_box", label: "Add item to box" },
        { id: "view_box_contents", label: "View contents" },
        { id: "print_box_label", label: "Print label" },
        { id: "mark_damaged", label: "Mark damaged" },
      ];
    case "packed":
      // During load phase, skip staging and go straight to load.
      return [
        phase === "load" || phase === "transit"
          ? { id: "load_box", label: "Load", primary: true }
          : { id: "stage_box", label: "Move to staging", primary: true },
        phase === "load" || phase === "transit"
          ? { id: "stage_box", label: "Move to staging" }
          : { id: "load_box", label: "Load now" },
        { id: "view_box_contents", label: "View contents" },
        { id: "edit_box_destination", label: "Edit destination" },
        { id: "mark_damaged", label: "Mark damaged" },
      ];
    case "staged":
      return [
        { id: "load_box", label: "Load", primary: true },
        { id: "view_box_contents", label: "View contents" },
        { id: "edit_box_destination", label: "Move to another zone" },
        { id: "mark_damaged", label: "Mark damaged" },
      ];
    case "loaded":
      return [
        { id: "deliver_box", label: "Mark arrived", primary: true },
        { id: "view_box_contents", label: "View contents" },
        { id: "mark_missing", label: "Mark missing" },
        { id: "mark_damaged", label: "Mark damaged" },
      ];
    case "delivered":
      // If the box has no destination room set, the "deliver to room"
      // action is the next sensible step. Otherwise unpack is primary.
      return box.destination_room_id
        ? [
            { id: "unpack_box", label: "Unpack", primary: true },
            { id: "view_box_contents", label: "View contents" },
            { id: "edit_box_destination", label: "Change destination room" },
            { id: "mark_missing", label: "Mark missing" },
            { id: "mark_damaged", label: "Mark damaged" },
          ]
        : [
            { id: "deliver_to_room", label: "Deliver to room", primary: true },
            { id: "unpack_box", label: "Unpack" },
            { id: "view_box_contents", label: "View contents" },
            { id: "edit_box_destination", label: "Set destination room" },
            { id: "mark_damaged", label: "Mark damaged" },
          ];
    case "unpacked":
      return [
        { id: "view_box_contents", label: "View contents", primary: true },
        { id: "edit_box", label: "Edit box" },
      ];
    default:
      return [{ id: "edit_box", label: "Edit box", primary: true }];
  }
}

function itemActions(item: MoveItem, ctx: WorkflowContext): WorkflowAction[] {
  // Disposition decisions short-circuit everything else when the item
  // has been marked sell/donate/recycle/dump — the user wants to
  // remove it, not move it.
  const removalDisposition =
    item.disposition === "sell" ||
    item.disposition === "donate" ||
    item.disposition === "recycle" ||
    item.disposition === "dump";

  if (removalDisposition && item.status !== "removed") {
    return [
      { id: "mark_removed", label: "Mark removed", primary: true, requiresConfirmation: true },
      { id: "edit_item", label: "Edit item" },
      { id: "view_scan_history", label: "View history" },
    ];
  }

  switch (item.status) {
    case "surveyed":
    case "awaiting_action":
      return [
        { id: "choose_disposition", label: "Choose disposition", primary: true },
        { id: "assign_destination_room", label: "Assign destination" },
        { id: "edit_item", label: "Edit item" },
        { id: "add_photo", label: "Add photo" },
        { id: "print_item_label", label: "Print label" },
      ];
    case "ready_to_pack":
      return [
        ctx.focusedBoxId
          ? { id: "assign_to_box", label: "Add to current box", primary: true }
          : { id: "assign_to_box", label: "Add to box", primary: true },
        { id: "assign_destination_room", label: "Change destination" },
        { id: "edit_item", label: "Edit item" },
        { id: "mark_donate", label: "Mark donate" },
        { id: "mark_sell", label: "Mark sell" },
        { id: "mark_dump", label: "Mark dump" },
      ];
    case "packed":
      return [
        { id: "view_item_box", label: "View box", primary: true },
        { id: "move_to_another_box", label: "Move to another box" },
        { id: "mark_missing", label: "Mark missing" },
        { id: "mark_damaged", label: "Mark damaged" },
      ];
    case "staged":
    case "loaded":
      return [
        { id: "view_item_box", label: "View box", primary: true },
        { id: "mark_missing", label: "Mark missing" },
        { id: "mark_damaged", label: "Mark damaged" },
      ];
    case "delivered":
      return [
        { id: "mark_unpacked_item", label: "Mark unpacked", primary: true },
        { id: "mark_installed", label: "Mark installed" },
        { id: "mark_damaged", label: "Mark damaged" },
        { id: "assign_destination_room", label: "Change destination room" },
      ];
    case "unpacked":
      return [
        { id: "mark_installed", label: "Mark installed", primary: true },
        { id: "edit_item", label: "Edit item" },
        { id: "mark_damaged", label: "Mark damaged" },
        { id: "mark_complete", label: "Mark complete" },
      ];
    case "installed":
      return [
        { id: "edit_item", label: "Edit item", primary: true },
        { id: "view_scan_history", label: "View history" },
      ];
    case "missing":
      return [
        { id: "mark_found", label: "Mark found", primary: true },
        { id: "view_scan_history", label: "View history" },
        { id: "edit_item", label: "Edit item" },
      ];
    case "damaged":
      return [
        { id: "resolve_damage", label: "Resolve damage", primary: true },
        { id: "add_photo", label: "Add photo" },
        { id: "view_scan_history", label: "View history" },
      ];
    case "removed":
      return [
        { id: "edit_item", label: "Edit item", primary: true },
        { id: "view_scan_history", label: "View history" },
      ];
    default:
      return [{ id: "edit_item", label: "Edit item", primary: true }];
  }
}

/* -------------------------------------------------------------------- */
/*  Public API                                                           */
/* -------------------------------------------------------------------- */

export function getActions(
  target: ResolvedTarget,
  ctx: WorkflowContext
): WorkflowAction[] {
  if (target.kind === "unknown") return unknownActions();
  // Known box / item: keep the lifecycle actions, and always offer
  // "Re-assign barcode" (opens the metadata sheet) as a secondary.
  const base =
    target.kind === "box"
      ? boxActions(target.record, ctx)
      : itemActions(target.record, ctx);
  return [...base, { id: "assign_barcode", label: "Re-assign barcode / edit details" }];
}

export function getRecommendedAction(
  target: ResolvedTarget,
  ctx: WorkflowContext
): WorkflowAction | null {
  const actions = getActions(target, ctx);
  return actions.find((a) => a.primary) ?? actions[0] ?? null;
}

/* -------------------------------------------------------------------- */
/*  Dashboard "next useful actions"                                      */
/* -------------------------------------------------------------------- */

export interface NextActionPrompt {
  id: string;
  label: string;
  /** Optional deep-link tab so the dashboard can route the user. */
  tab?: "dashboard" | "survey" | "move" | "problems" | "tools";
}

/** Compute a short list of human-readable prompts the user can act on
 *  right now. Mirrors the prompts listed in the design doc and updates
 *  live as data flows. */
export function getNextActionPrompts(ctx: WorkflowContext): NextActionPrompt[] {
  const prompts: NextActionPrompt[] = [];
  const { rooms, items, boxes } = ctx;

  const originRooms = rooms.filter((r) => r.side === "origin");
  const surveyedRoomIds = new Set(
    items.filter((i) => i.origin_room_id).map((i) => i.origin_room_id as string)
  );
  const unsurveyedRooms = originRooms.filter((r) => !surveyedRoomIds.has(r.id));
  if (unsurveyedRooms.length > 0) {
    prompts.push({
      id: "unsurveyed-rooms",
      label: `Survey ${unsurveyedRooms.length} room${unsurveyedRooms.length === 1 ? "" : "s"}.`,
      tab: "survey",
    });
  }

  const itemsActive = items.filter((i) => i.status !== "removed");
  const keptWithoutDestination = itemsActive.filter(
    (i) =>
      (i.disposition === "keep" || i.disposition === "stage_only") &&
      !i.destination_room_id
  );
  if (keptWithoutDestination.length > 0) {
    prompts.push({
      id: "needs-destination",
      label: `Assign destinations to ${keptWithoutDestination.length} kept item${keptWithoutDestination.length === 1 ? "" : "s"}.`,
      tab: "survey",
    });
  }

  const unassessed = itemsActive.filter((i) => i.disposition === "unassessed");
  if (unassessed.length > 0) {
    prompts.push({
      id: "unassessed-items",
      label: `Decide what to do with ${unassessed.length} item${unassessed.length === 1 ? "" : "s"}.`,
      tab: "survey",
    });
  }

  const boxesNoLabel = boxes.filter((b) => b.status === "preparing" && !b.barcode);
  if (boxesNoLabel.length > 0) {
    prompts.push({
      id: "boxes-need-labels",
      label: `Print labels for ${boxesNoLabel.length} box${boxesNoLabel.length === 1 ? "" : "es"}.`,
      tab: "tools",
    });
  }

  const dayOneNotPacked = boxes.filter(
    (b) => b.priority === "first_night" && b.status === "preparing"
  );
  if (dayOneNotPacked.length > 0) {
    prompts.push({
      id: "day-one-not-packed",
      label: `Pack ${dayOneNotPacked.length} day-one box${dayOneNotPacked.length === 1 ? "" : "es"}.`,
      tab: "move",
    });
  }

  const readyToLoad = boxes.filter(
    (b) => b.status === "packed" || b.status === "staged"
  );
  if (readyToLoad.length > 0 && (ctx.phase === "load" || ctx.phase === "stage")) {
    prompts.push({
      id: "ready-to-load",
      label: `Load ${readyToLoad.length} staged box${readyToLoad.length === 1 ? "" : "es"}.`,
      tab: "move",
    });
  }

  const delivered = boxes.filter((b) => b.status === "delivered");
  if (delivered.length > 0) {
    prompts.push({
      id: "delivered-to-unpack",
      label: `Unpack ${delivered.length} delivered box${delivered.length === 1 ? "" : "es"}.`,
      tab: "move",
    });
  }

  return prompts.slice(0, 6);
}

/* -------------------------------------------------------------------- */
/*  Display helpers                                                      */
/* -------------------------------------------------------------------- */

export function targetDisplayName(target: ResolvedTarget): string {
  if (target.kind === "unknown") return `Unknown code: ${target.code}`;
  if (target.kind === "box") return target.record.label;
  return target.record.name;
}

export function targetSubtitle(target: ResolvedTarget): string {
  if (target.kind === "unknown") return "This code isn't linked to anything yet.";
  if (target.kind === "box")
    return `Box · ${target.record.barcode} · ${target.record.status}`;
  return `Item · ${target.record.status}`;
}

export const PHASE_LABELS: Record<WorkflowPhase, string> = {
  survey: "Surveying",
  pack: "Packing",
  stage: "Staging",
  load: "Loading",
  transit: "In transit",
  unpack: "Unpacking",
  install: "Installing",
  done: "Done",
};
