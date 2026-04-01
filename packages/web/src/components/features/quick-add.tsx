import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Home,
  FileText,
  Phone,
  Upload,
  Calculator,
  CheckSquare,
  Plus,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import {
  TASK_PRIORITIES,
  COMMUNICATION_TYPES,
} from "@hcc/shared";
import { capitalize } from "@/lib/format";

type QuickAction = "property" | "note" | "call" | "file" | "scenario" | "task";

export function QuickAddFab() {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<QuickAction | null>(null);

  const actions = [
    { type: "property" as const, icon: Home, label: "Add Property" },
    { type: "note" as const, icon: FileText, label: "Add Note" },
    { type: "call" as const, icon: Phone, label: "Log Call" },
    { type: "task" as const, icon: CheckSquare, label: "Add Task" },
    { type: "scenario" as const, icon: Calculator, label: "New Scenario" },
  ];

  return (
    <>
      <div className="fixed bottom-20 right-4 z-50 flex flex-col-reverse items-end gap-2">
        {open &&
          actions.map((a) => (
            <button
              key={a.type}
              onClick={() => {
                setAction(a.type);
                setOpen(false);
              }}
              className="flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 pl-3 pr-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 dark:active:bg-slate-700"
            >
              <a.icon className="h-4 w-4" />
              {a.label}
            </button>
          ))}
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center justify-center h-14 w-14 rounded-full shadow-lg transition-transform ${
            open ? "bg-slate-700" : "bg-primary-600 hover:bg-primary-700"
          }`}
        >
          {open ? (
            <X className="h-6 w-6 text-white" />
          ) : (
            <Plus className="h-6 w-6 text-white" />
          )}
        </button>
      </div>

      {action === "note" && <QuickNoteModal onClose={() => setAction(null)} />}
      {action === "task" && <QuickTaskModal onClose={() => setAction(null)} />}
      {action === "call" && <QuickCallModal onClose={() => setAction(null)} />}
      {action === "property" && <QuickPropertyModal onClose={() => setAction(null)} />}
      {action === "scenario" && <QuickScenarioModal onClose={() => setAction(null)} />}
    </>
  );
}

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
