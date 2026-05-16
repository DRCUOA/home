/**
 * ScanActionSheet — the single generic modal that pops after any scan
 * (or "Open in workflow" tap) anywhere in the moving subsystem.
 *
 * It does three things and only three things:
 *
 *   1. Show the resolved target (or "unknown code") at the top.
 *   2. Render the one recommended action as a big primary button.
 *   3. Render every other allowed action under a "More actions"
 *      expander, visually de-emphasised.
 *
 * It is intentionally not aware of which tab the user is on. The
 * caller passes a `WorkflowContext` (which carries the current phase
 * and any focus state) and `getActions` / `getRecommendedAction` from
 * the workflow engine compute the rest.
 */

import { useMemo, useState } from "react";
import { ScanLine, ChevronDown, ChevronUp, Package, PackageOpen, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getActions,
  getRecommendedAction,
  targetDisplayName,
  targetSubtitle,
  type ResolvedTarget,
  type WorkflowAction,
  type WorkflowContext,
} from "@/lib/move-workflow";

interface ScanActionSheetProps {
  open: boolean;
  target: ResolvedTarget | null;
  context: WorkflowContext;
  onDispatch: (action: WorkflowAction, target: ResolvedTarget) => void | Promise<void>;
  onClose: () => void;
}

export function ScanActionSheet({
  open,
  target,
  context,
  onDispatch,
  onClose,
}: ScanActionSheetProps) {
  const [showMore, setShowMore] = useState(false);

  const actions = useMemo<WorkflowAction[]>(
    () => (target ? getActions(target, context) : []),
    [target, context]
  );
  const recommended = useMemo<WorkflowAction | null>(
    () => (target ? getRecommendedAction(target, context) : null),
    [target, context]
  );
  const secondary = useMemo<WorkflowAction[]>(
    () => actions.filter((a) => a.id !== recommended?.id),
    [actions, recommended]
  );

  if (!target) return null;

  const run = async (action: WorkflowAction) => {
    if (action.requiresConfirmation) {
      if (!confirm(`${action.label}: are you sure?`)) return;
    }
    await onDispatch(action, target);
    onClose();
    setShowMore(false);
  };

  return (
    <Modal open={open} onClose={() => { setShowMore(false); onClose(); }} title="Scan result">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            {target.kind === "box" ? (
              <Package className="h-7 w-7 text-primary-500" />
            ) : target.kind === "item" ? (
              <PackageOpen className="h-7 w-7 text-primary-500" />
            ) : (
              <ScanLine className="h-7 w-7 text-amber-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {targetDisplayName(target)}
              </p>
              {target.kind === "box" && (
                <StatusBadge status={target.record.status} />
              )}
              {target.kind === "item" && (
                <StatusBadge status={target.record.status} />
              )}
              {target.kind === "unknown" && <Badge variant="default">Unknown</Badge>}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {targetSubtitle(target)}
            </p>
          </div>
        </div>

        {recommended ? (
          <Button
            className="w-full min-h-14 text-base"
            variant={recommended.danger ? "danger" : "primary"}
            onClick={() => run(recommended)}
          >
            {recommended.label}
          </Button>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">
            No actions available.
          </p>
        )}

        {secondary.length > 0 && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              More actions ({secondary.length})
            </button>
            {showMore && (
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                {secondary.map((a) => (
                  <Button
                    key={a.id}
                    variant={a.danger ? "danger" : "secondary"}
                    className="min-h-10 justify-start text-sm"
                    onClick={() => run(a)}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => { setShowMore(false); onClose(); }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" />
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
