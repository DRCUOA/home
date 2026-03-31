import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  History,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Contact, CommunicationLog, AuditLog } from "@hcc/shared";
import { COMMUNICATION_TYPES } from "@hcc/shared";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { apiGet } from "@/lib/api";
import { capitalize } from "@/lib/format";

type ListResponse<T> = { data: T[]; total: number };

interface CommModalProps {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  existing: CommunicationLog | undefined;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}

export function CommModal({
  open,
  onClose,
  contacts,
  existing,
  onSubmit,
  submitting,
}: CommModalProps) {
  const [type, setType] = useState("call");
  const [contactId, setContactId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setType(existing.type);
      setContactId(existing.contact_id ?? "");
      setSubject(existing.subject ?? "");
      setBody(existing.body);
      setOccurredAt(existing.occurred_at?.slice(0, 10) ?? "");
      setFollowUpDate(existing.follow_up_date?.slice(0, 10) ?? "");
    } else {
      setType("call");
      setContactId("");
      setSubject("");
      setBody("");
      setOccurredAt(new Date().toISOString().slice(0, 10));
      setFollowUpDate("");
    }
    setHistoryOpen(false);
  }, [open, existing?.id]);

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit communication" : "Log communication"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            type,
            contact_id: contactId || undefined,
            subject: subject || undefined,
            body,
            occurred_at: occurredAt || new Date().toISOString(),
            follow_up_date: followUpDate || undefined,
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={COMMUNICATION_TYPES.map((t) => ({ value: t, label: capitalize(t) }))}
          />
          <Select
            label="Contact"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            options={contacts.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Select…"
          />
        </div>
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea label="Body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
        <div className="grid grid-cols-2 gap-3">
          <Input type="date" label="Date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          <Input type="date" label="Follow-up date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting || !body.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>

      {existing && (
        <AuditHistory entityId={existing.id} expanded={historyOpen} onToggle={() => setHistoryOpen(!historyOpen)} />
      )}
    </Modal>
  );
}

function AuditHistory({
  entityId,
  expanded,
  onToggle,
}: {
  entityId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const query = useQuery({
    queryKey: ["audit-logs", "communication", entityId],
    queryFn: () =>
      apiGet<ListResponse<AuditLog>>(
        `/audit-logs?entity_type=communication&entity_id=${encodeURIComponent(entityId)}`
      ),
    enabled: expanded,
  });

  const logs = query.data?.data ?? [];

  return (
    <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
      >
        <History className="h-3.5 w-3.5" />
        Change history
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 ml-auto" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 ml-auto" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 max-h-60 overflow-y-auto">
          {query.isLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          )}

          {!query.isLoading && logs.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-2 text-center">
              No history recorded yet.
            </p>
          )}

          {logs.map((log) => (
            <AuditEntry key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}

function AuditEntry({ log }: { log: AuditLog }) {
  const actionLabel: Record<string, string> = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
  };

  const ts = new Date(log.created_at).toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const changes = log.changes as Record<string, { old?: unknown; new?: unknown }>;
  const fieldKeys = Object.keys(changes).filter(
    (k) => !["id", "user_id", "created_at", "updated_at"].includes(k)
  );

  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2.5 text-xs space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {actionLabel[log.action] ?? log.action} by {log.user_name}
        </span>
        <span className="text-slate-400 dark:text-slate-500 whitespace-nowrap">{ts}</span>
      </div>

      {log.action === "update" && fieldKeys.length > 0 && (
        <div className="space-y-1 text-slate-600 dark:text-slate-400">
          {fieldKeys.map((key) => {
            const { old: oldVal, new: newVal } = changes[key];
            return (
              <div key={key} className="flex flex-col gap-0.5">
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  {capitalize(key)}
                </span>
                <div className="flex flex-wrap gap-1 items-baseline">
                  <span className="line-through text-slate-400 dark:text-slate-500 break-all">
                    {formatAuditValue(oldVal)}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">→</span>
                  <span className="text-slate-800 dark:text-slate-200 break-all">
                    {formatAuditValue(newVal)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {log.action === "create" && (
        <p className="text-slate-500 dark:text-slate-400">Record created</p>
      )}

      {log.action === "delete" && (
        <p className="text-slate-500 dark:text-slate-400">Record deleted</p>
      )}
    </div>
  );
}

function formatAuditValue(val: unknown): string {
  if (val === null || val === undefined) return "(empty)";
  if (typeof val === "string") {
    if (val.length > 120) return val.slice(0, 120) + "…";
    return val;
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}
