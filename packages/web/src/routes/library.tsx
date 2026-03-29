import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  AlertCircle,
  Plus,
  Pencil,
  Users,
  MessageCircle,
  StickyNote,
  BookOpen,
  FolderOpen,
  Phone,
  Mail,
  MessageSquare,
  CalendarDays,
  ExternalLink,
  Pin,
  PinOff,
  Search,
  Upload,
} from "lucide-react";
import type {
  Contact,
  CommunicationLog,
  Note,
  ResearchItem,
  FileRecord,
  Project,
  Property,
} from "@hcc/shared";
import {
  CONTACT_ROLES,
  COMMUNICATION_TYPES,
  RESEARCH_CATEGORIES,
  FILE_CATEGORIES,
} from "@hcc/shared";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useList,
  useCreate,
  useUpdate,
  useRemove,
} from "@/hooks/use-query-helpers";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { formatCurrency, formatDate, formatPercent, capitalize } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type ListResponse<T> = { data: T[]; total: number };

export const Route = createFileRoute("/library")({
  component: LibraryPage,
});

const COMM_ICON: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  text: MessageSquare,
  meeting: CalendarDays,
};

function LibraryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("contacts");

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const [commModalOpen, setCommModalOpen] = useState(false);
  const [editingCommId, setEditingCommId] = useState<string | null>(null);
  const [commFilterType, setCommFilterType] = useState("");
  const [commFilterContact, setCommFilterContact] = useState("");

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteSearch, setNoteSearch] = useState("");

  const [researchModalOpen, setResearchModalOpen] = useState(false);
  const [editingResearchId, setEditingResearchId] = useState<string | null>(null);
  const [researchFilterCategory, setResearchFilterCategory] = useState("");

  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [fileFilterCategory, setFileFilterCategory] = useState("");

  const contactsQuery = useQuery({
    queryKey: ["contacts"],
    queryFn: () => apiGet<ListResponse<Contact>>("/contacts"),
  });
  const commsQuery = useQuery({
    queryKey: ["communications"],
    queryFn: () => apiGet<ListResponse<CommunicationLog>>("/communications"),
  });
  const notesQuery = useQuery({
    queryKey: ["notes"],
    queryFn: () => apiGet<ListResponse<Note>>("/notes"),
  });
  const researchQuery = useQuery({
    queryKey: ["research"],
    queryFn: () => apiGet<ListResponse<ResearchItem>>("/research"),
  });
  const filesQuery = useQuery({
    queryKey: ["files"],
    queryFn: () => apiGet<ListResponse<FileRecord>>("/files"),
  });
  const projectsQuery = useList<Project>("projects", "/projects");

  const contacts = contactsQuery.data?.data ?? [];
  const comms = commsQuery.data?.data ?? [];
  const notes = notesQuery.data?.data ?? [];
  const research = researchQuery.data?.data ?? [];
  const files = filesQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];

  const createContact = useCreate<Contact>("contacts", "/contacts");
  const updateContact = useUpdate<Contact>("contacts", "/contacts");
  const removeContact = useRemove("contacts", "/contacts");

  const createComm = useCreate<CommunicationLog>("communications", "/communications");
  const updateComm = useUpdate<CommunicationLog>("communications", "/communications");

  const createNote = useCreate<Note>("notes", "/notes");
  const updateNote = useUpdate<Note>("notes", "/notes");
  const removeNote = useRemove("notes", "/notes");

  const createResearch = useCreate<ResearchItem>("research", "/research");
  const updateResearch = useUpdate<ResearchItem>("research", "/research");
  const removeResearch = useRemove("research", "/research");

  const createFile = useCreate<FileRecord>("files", "/files");
  const updateFile = useUpdate<FileRecord>("files", "/files");

  const loading =
    contactsQuery.isLoading ||
    commsQuery.isLoading ||
    notesQuery.isLoading ||
    researchQuery.isLoading ||
    filesQuery.isLoading;

  const hasError =
    contactsQuery.isError ||
    commsQuery.isError ||
    notesQuery.isError ||
    researchQuery.isError ||
    filesQuery.isError;

  const tabDefs = [
    { id: "contacts", label: "Contacts", count: contacts.length },
    { id: "comms", label: "Comms", count: comms.length },
    { id: "notes", label: "Notes", count: notes.length },
    { id: "research", label: "Research", count: research.length },
    { id: "files", label: "Files", count: files.length },
  ];

  if (loading) {
    return (
      <PageShell title="Library">
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm">Loading library…</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Library">
      <div className="space-y-5 pb-4">
        {hasError && (
          <ErrorBanner text="Some library data failed to load. Try refreshing." />
        )}

        <Tabs tabs={tabDefs} active={tab} onChange={setTab} />

        {tab === "contacts" && (
          <>
            {selectedContactId ? (
              <ContactDetail
                contact={contacts.find((c) => c.id === selectedContactId)!}
                comms={comms.filter((c) => c.contact_id === selectedContactId)}
                onBack={() => setSelectedContactId(null)}
                onEdit={() => {
                  setEditingContactId(selectedContactId);
                  setContactModalOpen(true);
                }}
              />
            ) : (
              <ContactsTab
                contacts={contacts}
                onAdd={() => {
                  setEditingContactId(null);
                  setContactModalOpen(true);
                }}
                onEdit={(id) => {
                  setEditingContactId(id);
                  setContactModalOpen(true);
                }}
                onSelect={(id) => setSelectedContactId(id)}
                onDelete={(id) => removeContact.mutate(id)}
              />
            )}
          </>
        )}

        {tab === "comms" && (
          <CommsTab
            comms={comms}
            contacts={contacts}
            filterType={commFilterType}
            setFilterType={setCommFilterType}
            filterContact={commFilterContact}
            setFilterContact={setCommFilterContact}
            onAdd={() => {
              setEditingCommId(null);
              setCommModalOpen(true);
            }}
          />
        )}

        {tab === "notes" && (
          <NotesTab
            notes={notes}
            search={noteSearch}
            setSearch={setNoteSearch}
            onAdd={() => {
              setEditingNoteId(null);
              setNoteModalOpen(true);
            }}
            onEdit={(id) => {
              setEditingNoteId(id);
              setNoteModalOpen(true);
            }}
            onDelete={(id) => removeNote.mutate(id)}
          />
        )}

        {tab === "research" && (
          <ResearchTab
            research={research}
            filterCategory={researchFilterCategory}
            setFilterCategory={setResearchFilterCategory}
            onAdd={() => {
              setEditingResearchId(null);
              setResearchModalOpen(true);
            }}
            onEdit={(id) => {
              setEditingResearchId(id);
              setResearchModalOpen(true);
            }}
            onDelete={(id) => removeResearch.mutate(id)}
          />
        )}

        {tab === "files" && (
          <FilesTab
            files={files}
            filterCategory={fileFilterCategory}
            setFilterCategory={setFileFilterCategory}
            onAdd={() => setFileModalOpen(true)}
            onTogglePin={(file) =>
              updateFile.mutate({ id: file.id, data: { is_pinned: !file.is_pinned } })
            }
          />
        )}
      </div>

      <ContactModal
        key={editingContactId ?? "new-contact"}
        open={contactModalOpen}
        onClose={() => {
          setContactModalOpen(false);
          setEditingContactId(null);
        }}
        existing={editingContactId ? contacts.find((c) => c.id === editingContactId) : undefined}
        onSubmit={(payload) => {
          if (editingContactId) {
            updateContact.mutate(
              { id: editingContactId, data: payload },
              { onSuccess: () => { setContactModalOpen(false); setEditingContactId(null); } }
            );
          } else {
            createContact.mutate(payload, {
              onSuccess: () => setContactModalOpen(false),
            });
          }
        }}
        submitting={createContact.isPending || updateContact.isPending}
      />

      <CommModal
        key={editingCommId ?? "new-comm"}
        open={commModalOpen}
        onClose={() => {
          setCommModalOpen(false);
          setEditingCommId(null);
        }}
        contacts={contacts}
        existing={editingCommId ? comms.find((c) => c.id === editingCommId) : undefined}
        onSubmit={(payload) => {
          if (editingCommId) {
            updateComm.mutate(
              { id: editingCommId, data: payload },
              { onSuccess: () => { setCommModalOpen(false); setEditingCommId(null); } }
            );
          } else {
            createComm.mutate(payload, {
              onSuccess: () => setCommModalOpen(false),
            });
          }
        }}
        submitting={createComm.isPending || updateComm.isPending}
      />

      <NoteModal
        key={editingNoteId ?? "new-note"}
        open={noteModalOpen}
        onClose={() => {
          setNoteModalOpen(false);
          setEditingNoteId(null);
        }}
        projects={projects}
        existing={editingNoteId ? notes.find((n) => n.id === editingNoteId) : undefined}
        onSubmit={(payload) => {
          if (editingNoteId) {
            updateNote.mutate(
              { id: editingNoteId, data: payload },
              { onSuccess: () => { setNoteModalOpen(false); setEditingNoteId(null); } }
            );
          } else {
            createNote.mutate(payload, {
              onSuccess: () => setNoteModalOpen(false),
            });
          }
        }}
        submitting={createNote.isPending || updateNote.isPending}
      />

      <ResearchModal
        key={editingResearchId ?? "new-research"}
        open={researchModalOpen}
        onClose={() => {
          setResearchModalOpen(false);
          setEditingResearchId(null);
        }}
        existing={editingResearchId ? research.find((r) => r.id === editingResearchId) : undefined}
        onSubmit={(payload) => {
          if (editingResearchId) {
            updateResearch.mutate(
              { id: editingResearchId, data: payload },
              { onSuccess: () => { setResearchModalOpen(false); setEditingResearchId(null); } }
            );
          } else {
            createResearch.mutate(payload, {
              onSuccess: () => setResearchModalOpen(false),
            });
          }
        }}
        submitting={createResearch.isPending || updateResearch.isPending}
      />

      <FileMetadataModal
        open={fileModalOpen}
        onClose={() => setFileModalOpen(false)}
        onSubmit={(payload) => {
          createFile.mutate(payload, {
            onSuccess: () => setFileModalOpen(false),
          });
        }}
        submitting={createFile.isPending}
      />
    </PageShell>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

/* ---------- Contacts ---------- */

function ContactsTab({
  contacts,
  onAdd,
  onEdit,
  onSelect,
  onDelete,
}: {
  contacts: Contact[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Contacts</h2>
        <Button size="md" className="min-h-11 shrink-0" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<Users className="h-9 w-9" />}
              title="No contacts"
              description="Add agents, solicitors, brokers, and other contacts to keep track of your network."
              action={
                <Button className="min-h-11" onClick={onAdd}>
                  Add contact
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contacts.map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-4 space-y-2">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => onSelect(c.id)}
                >
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  {c.organisation && (
                    <p className="text-xs text-slate-500">{c.organisation}</p>
                  )}
                </button>

                {c.role_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.role_tags.map((role) => (
                      <Badge key={role} variant="default">{capitalize(role)}</Badge>
                    ))}
                  </div>
                )}

                <div className="text-sm text-slate-600 space-y-1">
                  {c.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a>
                    </p>
                  )}
                  {c.email && (
                    <p className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      <a href={`mailto:${c.email}`} className="hover:underline truncate">{c.email}</a>
                    </p>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <Button variant="secondary" size="sm" className="min-h-10" onClick={() => onEdit(c.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactDetail({
  contact,
  comms,
  onBack,
  onEdit,
}: {
  contact: Contact;
  comms: CommunicationLog[];
  onBack: () => void;
  onEdit: () => void;
}) {
  const sorted = useMemo(
    () =>
      [...comms].sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
      ),
    [comms]
  );

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="min-h-10" onClick={onBack}>
        ← Back to contacts
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">{contact.name}</CardTitle>
          <Button variant="secondary" size="sm" className="min-h-10" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {contact.organisation && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Organisation</span>
              <span className="font-medium text-slate-900">{contact.organisation}</span>
            </div>
          )}
          {contact.phone && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Phone</span>
              <a href={`tel:${contact.phone}`} className="font-medium text-slate-900 hover:underline">{contact.phone}</a>
            </div>
          )}
          {contact.email && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Email</span>
              <a href={`mailto:${contact.email}`} className="font-medium text-slate-900 hover:underline truncate">{contact.email}</a>
            </div>
          )}
          {contact.role_tags.length > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Roles</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {contact.role_tags.map((r) => (
                  <Badge key={r} variant="default">{capitalize(r)}</Badge>
                ))}
              </div>
            </div>
          )}
          {contact.notes && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Notes</p>
              <p className="text-slate-700 whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-slate-500" />
            Communications ({sorted.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 divide-y divide-slate-100">
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No communications logged for this contact.
            </p>
          ) : (
            sorted.map((c) => {
              const Icon = COMM_ICON[c.type] ?? MessageSquare;
              return (
                <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Icon className="h-3.5 w-3.5" />
                      {capitalize(c.type)}
                    </span>
                    <span className="text-xs text-slate-400">{formatDate(c.occurred_at)}</span>
                  </div>
                  {c.subject && <p className="text-sm font-medium text-slate-900">{c.subject}</p>}
                  <p className="text-sm text-slate-600 line-clamp-2 mt-0.5">{c.body}</p>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Comms ---------- */

function CommsTab({
  comms,
  contacts,
  filterType,
  setFilterType,
  filterContact,
  setFilterContact,
  onAdd,
}: {
  comms: CommunicationLog[];
  contacts: Contact[];
  filterType: string;
  setFilterType: (v: string) => void;
  filterContact: string;
  setFilterContact: (v: string) => void;
  onAdd: () => void;
}) {
  const filtered = useMemo(() => {
    let result = [...comms];
    if (filterType) result = result.filter((c) => c.type === filterType);
    if (filterContact) result = result.filter((c) => c.contact_id === filterContact);
    result.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
    return result;
  }, [comms, filterType, filterContact]);

  const contactMap = useMemo(() => {
    const m: Record<string, Contact> = {};
    for (const c of contacts) m[c.id] = c;
    return m;
  }, [contacts]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Communications</h2>
        <Button size="md" className="min-h-11 shrink-0" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Log communication
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          options={COMMUNICATION_TYPES.map((t) => ({ value: t, label: capitalize(t) }))}
          placeholder="All types"
        />
        <Select
          label="Contact"
          value={filterContact}
          onChange={(e) => setFilterContact(e.target.value)}
          options={contacts.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="All contacts"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<MessageCircle className="h-9 w-9" />}
              title="No communications"
              description="Log phone calls, emails, messages, and meetings to keep a record."
              action={
                <Button className="min-h-11" onClick={onAdd}>
                  Log communication
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const Icon = COMM_ICON[c.type] ?? MessageSquare;
            const contact = c.contact_id ? contactMap[c.contact_id] : null;
            return (
              <Card key={c.id}>
                <CardContent className="pt-3 pb-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm">
                      <Icon className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-900">
                        {contact ? contact.name : "Unknown"}
                      </span>
                    </span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {formatDate(c.occurred_at)}
                    </span>
                  </div>
                  {c.subject && (
                    <p className="text-sm font-medium text-slate-800">{c.subject}</p>
                  )}
                  <p className="text-sm text-slate-600 line-clamp-2">{c.body}</p>
                  {c.follow_up_date && (
                    <p className="text-xs text-amber-700">
                      Follow-up: {formatDate(c.follow_up_date)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Notes ---------- */

function NotesTab({
  notes,
  search,
  setSearch,
  onAdd,
  onEdit,
  onDelete,
}: {
  notes: Note[];
  search: string;
  setSearch: (v: string) => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter(
      (n) =>
        n.body.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [notes, search]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Notes</h2>
        <Button size="md" className="min-h-11 shrink-0" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add note
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<StickyNote className="h-9 w-9" />}
              title="No notes"
              description="Capture thoughts, meeting minutes, or reminders."
              action={
                <Button className="min-h-11" onClick={onAdd}>
                  Add note
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <Card key={n.id}>
              <CardContent className="pt-3 pb-3 space-y-2">
                <p className="text-sm text-slate-800 line-clamp-3 whitespace-pre-wrap">
                  {n.body}
                </p>
                {n.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {n.tags.map((tag) => (
                      <Badge key={tag} variant="default">{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{formatDate(n.created_at)}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="hover:text-slate-700 min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center"
                      onClick={() => onEdit(n.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Research ---------- */

function ResearchTab({
  research,
  filterCategory,
  setFilterCategory,
  onAdd,
  onEdit,
  onDelete,
}: {
  research: ResearchItem[];
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!filterCategory) return research;
    return research.filter((r) => r.category === filterCategory);
  }, [research, filterCategory]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Research</h2>
        <Button size="md" className="min-h-11 shrink-0" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add item
        </Button>
      </div>

      <Select
        label="Category"
        value={filterCategory}
        onChange={(e) => setFilterCategory(e.target.value)}
        options={RESEARCH_CATEGORIES.map((c) => ({ value: c, label: capitalize(c) }))}
        placeholder="All categories"
      />

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<BookOpen className="h-9 w-9" />}
              title="No research items"
              description="Save links, articles, and research notes."
              action={
                <Button className="min-h-11" onClick={onAdd}>
                  Add research
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-3 pb-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{r.title}</p>
                  <Badge variant="primary">{capitalize(r.category)}</Badge>
                </div>
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:underline flex items-center gap-1 truncate"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    {r.url}
                  </a>
                )}
                {r.notes && (
                  <p className="text-sm text-slate-600 line-clamp-2">{r.notes}</p>
                )}
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.tags.map((tag) => (
                      <Badge key={tag} variant="default">{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="secondary" size="sm" className="min-h-10" onClick={() => onEdit(r.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Files ---------- */

function FilesTab({
  files,
  filterCategory,
  setFilterCategory,
  onAdd,
  onTogglePin,
}: {
  files: FileRecord[];
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  onAdd: () => void;
  onTogglePin: (file: FileRecord) => void;
}) {
  const filtered = useMemo(() => {
    if (!filterCategory) return files;
    return files.filter((f) => f.category === filterCategory);
  }, [files, filterCategory]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => (a.is_pinned === b.is_pinned ? 0 : a.is_pinned ? -1 : 1)),
    [filtered]
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Files</h2>
        <Button size="md" className="min-h-11 shrink-0" onClick={onAdd}>
          <Upload className="h-4 w-4" />
          Add file
        </Button>
      </div>

      <Select
        label="Category"
        value={filterCategory}
        onChange={(e) => setFilterCategory(e.target.value)}
        options={FILE_CATEGORIES.map((c) => ({ value: c, label: capitalize(c) }))}
        placeholder="All categories"
      />

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<FolderOpen className="h-9 w-9" />}
              title="No files"
              description="Upload documents, reports, and other files."
              action={
                <Button className="min-h-11" onClick={onAdd}>
                  Add file
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((f) => (
            <Card key={f.id} className={f.is_pinned ? "border-primary-200" : ""}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {f.is_pinned && <Pin className="inline h-3 w-3 text-primary-500 mr-1" />}
                      {f.filename}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="default">{capitalize(f.category)}</Badge>
                      <span className="text-xs text-slate-400 tabular-nums">
                        {formatSize(f.size_bytes)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTogglePin(f)}
                    className="shrink-0 min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center text-slate-400 hover:text-primary-600"
                    aria-label={f.is_pinned ? "Unpin" : "Pin"}
                  >
                    {f.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Modals ---------- */

function ContactModal({
  open,
  onClose,
  existing,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  existing: Contact | undefined;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [roleTags, setRoleTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setEmail(existing.email ?? "");
      setPhone(existing.phone ?? "");
      setOrganisation(existing.organisation ?? "");
      setRoleTags([...existing.role_tags]);
      setNotes(existing.notes ?? "");
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setOrganisation("");
      setRoleTags([]);
      setNotes("");
    }
  }, [open, existing?.id]);

  const toggleRole = (role: string) => {
    setRoleTags((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit contact" : "New contact"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            name: name.trim(),
            email: email || undefined,
            phone: phone || undefined,
            organisation: organisation || undefined,
            role_tags: roleTags,
            notes: notes || undefined,
          });
        }}
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Organisation" value={organisation} onChange={(e) => setOrganisation(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Roles</p>
          <div className="flex flex-wrap gap-2">
            {CONTACT_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors min-h-[2.25rem] ${
                  roleTags.includes(role)
                    ? "bg-primary-100 text-primary-700 border border-primary-300"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {capitalize(role)}
              </button>
            ))}
          </div>
        </div>

        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting || !name.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CommModal({
  open,
  onClose,
  contacts,
  existing,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  existing: CommunicationLog | undefined;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [type, setType] = useState("call");
  const [contactId, setContactId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

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
    </Modal>
  );
}

function NoteModal({
  open,
  onClose,
  projects,
  existing,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  existing: Note | undefined;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setBody(existing.body);
      setTags(existing.tags.join(", "));
      setProjectId(existing.project_id ?? "");
    } else {
      setBody("");
      setTags("");
      setProjectId("");
    }
  }, [open, existing?.id]);

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit note" : "New note"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            body,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            project_id: projectId || undefined,
          });
        }}
      >
        <Textarea label="Note" value={body} onChange={(e) => setBody(e.target.value)} rows={5} required />
        <Input
          label="Tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="e.g. legal, finance, todo"
        />
        {projects.length > 0 && (
          <Select
            label="Linked project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="None"
          />
        )}

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting || !body.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResearchModal({
  open,
  onClose,
  existing,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  existing: ResearchItem | undefined;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("other");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setTitle(existing.title);
      setUrl(existing.url ?? "");
      setCategory(existing.category);
      setNotes(existing.notes ?? "");
      setTags(existing.tags.join(", "));
    } else {
      setTitle("");
      setUrl("");
      setCategory("other");
      setNotes("");
      setTags("");
    }
  }, [open, existing?.id]);

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit research" : "New research"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            title: title.trim(),
            url: url || undefined,
            category,
            notes: notes || undefined,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          });
        }}
      >
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Input label="URL" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={RESEARCH_CATEGORIES.map((c) => ({ value: c, label: capitalize(c) }))}
        />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        <Input
          label="Tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="e.g. suburb, pricing"
        />

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting || !title.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FileMetadataModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [filename, setFilename] = useState("");
  const [category, setCategory] = useState("other");

  useEffect(() => {
    if (!open) return;
    setFilename("");
    setCategory("other");
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Add file record">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            filename: filename.trim(),
            category,
            s3_key: "",
            mime_type: "application/octet-stream",
            size_bytes: 0,
            is_pinned: false,
          });
        }}
      >
        <Input label="Filename" value={filename} onChange={(e) => setFilename(e.target.value)} required />
        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={FILE_CATEGORIES.map((c) => ({ value: c, label: capitalize(c) }))}
        />
        <p className="text-xs text-slate-500">
          This creates a metadata record. File upload will be available in a future update.
        </p>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting || !filename.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
