import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Calculator,
  CheckSquare,
  FileText,
  Home,
  Phone,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import { TASK_PRIORITIES, COMMUNICATION_TYPES } from "@hcc/shared";
import { capitalize } from "@/lib/format";

export type QuickAction = "property" | "note" | "call" | "file" | "scenario" | "task";

/**
 * The desktop app triggers Quick Add from the TopBar "+ New" menu. The
 * modals themselves are hosted here as a single controlled component that
 * the AppShell mounts near the top of the tree.
 */
export function QuickAddHost({
  action,
  onClose,
}: {
  action: QuickAction | null;
  onClose: () => void;
}) {
  if (action === "note")     return <QuickNoteModal     onClose={onClose} />;
  if (action === "task")     return <QuickTaskModal     onClose={onClose} />;
  if (action === "call")     return <QuickCallModal     onClose={onClose} />;
  if (action === "property") return <QuickPropertyModal onClose={onClose} />;
  if (action === "scenario") return <QuickScenarioModal onClose={onClose} />;
  return null;
}

export const QUICK_ADD_ITEMS: ReadonlyArray<{
  type: QuickAction;
  icon: typeof Home;
  label: string;
}> = [
  { type: "property", icon: Home,        label: "Add property" },
  { type: "note",     icon: FileText,    label: "Add note" },
  { type: "call",     icon: Phone,       label: "Log communication" },
  { type: "task",     icon: CheckSquare, label: "Add task" },
  { type: "scenario", icon: Calculator,  label: "New scenario" },
];

function QuickNoteModal({ onClose }: { onClose: () => void }) {
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: any) => apiPost("/notes", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes"] }); onClose(); },
  });

  return (
    <Modal open title="Quick Note" onClose={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (body.trim()) mutation.mutate({ body }); }}
        className="space-y-4"
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What do you want to remember?"
          autoFocus
          rows={4}
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending || !body.trim()}>
          {mutation.isPending ? "Saving..." : "Save Note"}
        </Button>
      </form>
    </Modal>
  );
}

function QuickTaskModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: any) => apiPost("/tasks", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); onClose(); },
  });

  return (
    <Modal open title="Quick Task" onClose={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (title.trim()) mutation.mutate({ title, due_date: dueDate || undefined, priority }); }}
        className="space-y-4"
      >
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <Select
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          options={TASK_PRIORITIES.map((p) => ({ value: p, label: capitalize(p) }))}
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending || !title.trim()}>
          {mutation.isPending ? "Saving..." : "Add Task"}
        </Button>
      </form>
    </Modal>
  );
}

function QuickCallModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState("call");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: any) => apiPost("/communications", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["communications"] }); onClose(); },
  });

  return (
    <Modal open title="Log Communication" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) mutation.mutate({ type, subject: subject || undefined, body, occurred_at: new Date().toISOString() });
        }}
        className="space-y-4"
      >
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={COMMUNICATION_TYPES.map((t) => ({ value: t, label: capitalize(t) }))}
        />
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea label="Notes" value={body} onChange={(e) => setBody(e.target.value)} autoFocus rows={4} />
        <Button type="submit" className="w-full" disabled={mutation.isPending || !body.trim()}>
          {mutation.isPending ? "Saving..." : "Save"}
        </Button>
      </form>
    </Modal>
  );
}

function QuickPropertyModal({ onClose }: { onClose: () => void }) {
  const [address, setAddress] = useState("");
  const [url, setUrl] = useState("");
  const [projectId, setProjectId] = useState("");
  const qc = useQueryClient();
  const enrichMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/properties/${id}/enrich`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["properties"] }); },
  });
  const mutation = useMutation({
    mutationFn: (data: any) => apiPost("/properties", data),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      const created = result.data;
      if (created.listing_url || created.address) {
        enrichMutation.mutate(created.id);
      }
      onClose();
    },
  });

  return (
    <Modal open title="Add Property" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim() && projectId) {
            mutation.mutate({ address, listing_url: url || undefined, project_id: projectId });
          }
        }}
        className="space-y-4"
      >
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} autoFocus required />
        <Input label="Listing URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} type="url" />
        <Input label="Project ID" value={projectId} onChange={(e) => setProjectId(e.target.value)} required placeholder="Paste project ID" />
        <Button type="submit" className="w-full" disabled={mutation.isPending || !address.trim() || !projectId}>
          {mutation.isPending ? "Saving..." : "Add Property"}
        </Button>
      </form>
    </Modal>
  );
}

function QuickScenarioModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: any) => apiPost("/financial-scenarios", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["financial-scenarios"] }); onClose(); },
  });

  return (
    <Modal open title="New Financial Scenario" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && projectId) {
            mutation.mutate({
              name,
              project_id: projectId,
              purchase_price: purchasePrice ? parseFloat(purchasePrice) : undefined,
            });
          }
        }}
        className="space-y-4"
      >
        <Input label="Scenario name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        <Input label="Project ID" value={projectId} onChange={(e) => setProjectId(e.target.value)} required placeholder="Paste project ID" />
        <Input label="Purchase price" inputMode="decimal" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
        <Button type="submit" className="w-full" disabled={mutation.isPending || !name.trim() || !projectId}>
          {mutation.isPending ? "Creating..." : "Create Scenario"}
        </Button>
      </form>
    </Modal>
  );
}

/**
 * Backward-compat shim: some routes import `QuickAddFab` as a floating
 * launcher. In the desktop refactor the launcher lives in the TopBar and
 * the modals are hosted at the AppShell level. This component is now a
 * no-op so existing route imports keep compiling.
 */
export function QuickAddFab() {
  return null;
}
