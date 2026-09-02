import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiCheck, HiPlusCircle, HiTrash, HiPencilSquare } from "react-icons/hi2";
import trackerService from "../services/trackerService";
import type { AdminUser, LookupKind, LookupRow, Stage, TrackerUser } from "../services/trackerService";
import { TRACKER_ROLE_LABELS } from "../config/pageAccess";
import "../styles/Tracker.css";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toast } from "@/components/ui/toast";
import { messageFrom } from "@/lib/apiError";

type Tab = "stages" | "lookups" | "access" | "users";

/*
 * `singular` is spelt out rather than derived. The button and the dialog title
 * used to say `label.replace(/s$/, "")`, which reads "Add Categorie" — the one
 * label here whose plural is not a trailing "s".
 */
const LOOKUP_KINDS: { kind: LookupKind; label: string; singular: string }[] = [
  { kind: "categories", label: "Categories", singular: "Category" },
  { kind: "units", label: "Units", singular: "Unit" },
  { kind: "branches", label: "Branches", singular: "Branch" },
  { kind: "modes", label: "Modes", singular: "Mode" },
  { kind: "gst_types", label: "GST Types", singular: "GST Type" },
  { kind: "gst_rates", label: "GST Rates", singular: "GST Rate" },
];

/** Stable identity so `stages` does not change on every render. */
const EMPTY_STAGES: Stage[] = [];

const EMPTY_STAGE: Partial<Stage> = {
  name: "",
  code: "",
  order: 1,
  threshold_days: 3,
  status_choices: [],
  requires_status: false,
  can_return: true,
  is_terminal: false,
  is_active: true,
};

export default function Tracker_Admin() {
  const [tab, setTab] = useState<Tab>("stages");
  const [toast, setToast] = useState("");
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2800);
  };

  return (
    <div className="trk-page">
      <div className="trk-header">
        <div>
          <h1>Tracker Configuration</h1>
          <div className="trk-sub">Manage stages, dropdown values, and who works each stage.</div>
        </div>
      </div>

      <div className="trk-tabs">
        {(
          [
            ["stages", "Stages"],
            ["lookups", "Lookups"],
            ["access", "Stage Access"],
            ["users", "Tracker Users"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            className={"trk-tab" + (tab === t ? " active" : "")}
            onClick={() => setTab(t as Tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "stages" && <StagesTab flash={flash} />}
      {tab === "lookups" && <LookupsTab flash={flash} />}
      {tab === "access" && <AccessTab flash={flash} />}
      {tab === "users" && <UsersTab flash={flash} />}

      <Toast message={toast} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
function StagesTab({ flash }: { flash: (m: string) => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<Stage> | null>(null);

  /*
   * Stages are read by four places — this tab, the queue's stage tabs, the
   * delete gate on Tracker_Invoices, and the assignment grid below. They were
   * four independent fetches with four independent copies; keyed once, an edit
   * here invalidates all of them.
   *
   * The sort lives in `select` rather than after the fetch so the cached value
   * is sorted too: a second reader of this key gets ordered stages without
   * re-sorting, and without the chance of forgetting to.
   */
  const { data: stages = EMPTY_STAGES } = useQuery({
    queryKey: ["tracker", "admin", "stages"],
    queryFn: () => trackerService.adminGetStages(),
    select: (rows) => [...rows].sort((a, b) => a.order - b.order),
    staleTime: 5 * 60_000,
  });

  const load = () => queryClient.invalidateQueries({ queryKey: ["tracker", "admin", "stages"] });

  const save = async () => {
    if (!editing) return;
    try {
      const payload = { ...editing };
      if (editing.id) await trackerService.adminUpdateStage(editing.id, payload);
      else await trackerService.adminCreateStage(payload);
      setEditing(null);
      flash("Stage saved");
      void load();
    } catch (err) {
      flash(messageFrom(err, "Save failed"));
    }
  };

  const remove = async (s: Stage) => {
    if (!confirm(`Delete stage "${s.name}"?`)) return;
    try {
      await trackerService.adminDeleteStage(s.id);
      flash("Deleted");
      void load();
    } catch (err) {
      flash(messageFrom(err, "Delete failed"));
    }
  };

  return (
    <div className="trk-card">
      <div className="trk-block-tight">
        <button
          className="trk-btn trk-btn-primary"
          onClick={() => setEditing({ ...EMPTY_STAGE, order: stages.length + 1 })}
        >
          <HiPlusCircle /> Add stage
        </button>
      </div>
      <div className="trk-table-wrap">
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Statuses</TableHead>
              <TableHead>Req. status</TableHead>
              <TableHead>Can return</TableHead>
              <TableHead>Terminal</TableHead>
              <TableHead>Threshold (days)</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.order}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell>
                  <code>{s.code}</code>
                </TableCell>
                <TableCell>{s.status_choices.length ? s.status_choices.join(", ") : "—"}</TableCell>
                <TableCell>{s.requires_status ? "✓" : "—"}</TableCell>
                <TableCell>{s.can_return ? "✓" : "—"}</TableCell>
                <TableCell>{s.is_terminal ? "✓" : "—"}</TableCell>
                <TableCell>{s.threshold_days}</TableCell>
                <TableCell>
                  {s.is_active ? (
                    <Badge tone="ok" outlined>
                      Active
                    </Badge>
                  ) : (
                    <Badge outlined>Off</Badge>
                  )}
                </TableCell>
                <TableCell className="trk-row-actions">
                  <button
                    className="trk-btn trk-btn-ghost trk-btn--sm"
                    aria-label={`Edit stage ${s.name}`}
                    title="Edit stage"
                    onClick={() => setEditing({ ...s })}
                  >
                    <HiPencilSquare />
                  </button>
                  <button
                    className="trk-btn trk-btn-danger trk-btn--sm"
                    aria-label={`Delete stage ${s.name}`}
                    title="Delete stage"
                    onClick={() => remove(s)}
                  >
                    <HiTrash />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(next) => {
          if (!next) (() => setEditing(null))();
        }}
      >
        {editing && (
          <DialogContent title="Stage">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit stage" : "New stage"}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="trk-form-grid">
                <div className="trk-field">
                  <label>Name</label>
                  <input
                    aria-label="Name"
                    value={editing.name || ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div className="trk-field">
                  <label>Code (unique key)</label>
                  <input
                    aria-label="Code (unique key)"
                    value={editing.code || ""}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                  />
                </div>
                <div className="trk-field">
                  <label>Order</label>
                  <input
                    type="number"
                    aria-label="Order"
                    value={editing.order ?? 1}
                    onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })}
                  />
                </div>
                <div className="trk-field">
                  <label>Threshold days</label>
                  <input
                    type="number"
                    aria-label="Threshold days"
                    value={editing.threshold_days ?? 3}
                    onChange={(e) =>
                      setEditing({ ...editing, threshold_days: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="trk-field trk-field--full">
                  <label>Status choices (comma-separated, e.g. OK, HOLD, DEBIT, RETURN)</label>
                  <input
                    aria-label="Status choices (comma-separated, e.g. OK, HOLD, DEBIT, RETURN)"
                    value={(editing.status_choices || []).join(", ")}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        status_choices: e.target.value
                          .split(",")
                          .map((x) => x.trim().toUpperCase())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
                <label
                  className="trk-field trk-field--row"
                >
                  <input
                    type="checkbox"
                    checked={!!editing.requires_status}
                    onChange={(e) => setEditing({ ...editing, requires_status: e.target.checked })}
                  />{" "}
                  Requires status
                </label>
                <label
                  className="trk-field trk-field--row"
                >
                  <input
                    type="checkbox"
                    checked={!!editing.can_return}
                    onChange={(e) => setEditing({ ...editing, can_return: e.target.checked })}
                  />{" "}
                  Can return
                </label>
                <label
                  className="trk-field trk-field--row"
                >
                  <input
                    type="checkbox"
                    checked={!!editing.is_terminal}
                    onChange={(e) => setEditing({ ...editing, is_terminal: e.target.checked })}
                  />{" "}
                  Terminal (payment)
                </label>
                <label
                  className="trk-field trk-field--row"
                >
                  <input
                    type="checkbox"
                    checked={editing.is_active ?? true}
                    onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                  />{" "}
                  Active
                </label>
              </div>
            </DialogBody>
            <DialogFooter>
              <button className="trk-btn trk-btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="trk-btn trk-btn-primary" onClick={save}>
                Save
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
function LookupsTab({ flash }: { flash: (m: string) => void }) {
  const [kind, setKind] = useState<LookupKind>("categories");
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [draft, setDraft] = useState<Partial<LookupRow>>({});
  const [showAdd, setShowAdd] = useState(false);
  const isRate = kind === "gst_rates";
  const kindLabel = LOOKUP_KINDS.find((k) => k.kind === kind)?.singular || "value";

  /*
   * NOT converted to useQuery, deliberately.
   *
   * `patchRow` below edits a row in place before `update` saves it, so `rows`
   * is a DRAFT of server state, not server state. Putting it in the query
   * cache means a background refetch can overwrite what someone is halfway
   * through typing — the cache is authoritative and the keystrokes are not.
   * Doing this properly means separating the draft from the fetched rows,
   * which is real work rather than a mechanical swap. Same for the user
   * assignment grid, which toggles checkboxes into `users` before saving.
   */
  const load = () =>
    trackerService
      .adminGetLookup(kind)
      .then(setRows)
      .catch(() => flash("Failed to load"));
  // Only the fetch is left here. Clearing the draft belongs to the tab click
  // that changes `kind` (see `selectKind`) — done in the effect it reset the
  // form one render after the new tab had already drawn with the old one.
  useEffect(() => {
    load();
  }, [kind]);

  const selectKind = (next: LookupKind) => {
    setKind(next);
    setDraft({});
    setShowAdd(false);
  };

  const blankDraft = () =>
    isRate
      ? { label: "", rate: "", sort_order: rows.length, is_active: true }
      : { name: "", sort_order: rows.length, is_active: true };

  const openAdd = () => {
    setDraft(blankDraft());
    setShowAdd(true);
  };

  const add = async () => {
    if (isRate ? !draft.label || draft.rate === "" : !draft.name) {
      flash("Fill in the value first");
      return;
    }
    try {
      await trackerService.adminCreateLookup(kind, draft);
      setDraft({});
      setShowAdd(false);
      flash("Added");
      load();
    } catch (err) {
      flash(messageFrom(err, "Add failed"));
    }
  };
  const update = async (row: LookupRow) => {
    try {
      await trackerService.adminUpdateLookup(kind, row.id, row);
      flash("Saved");
      load();
    } catch (err) {
      flash(messageFrom(err, "Save failed"));
    }
  };
  const remove = async (row: LookupRow) => {
    if (!confirm("Delete this value?")) return;
    try {
      await trackerService.adminDeleteLookup(kind, row.id);
      flash("Deleted");
      load();
    } catch (err) {
      flash(messageFrom(err, "Delete failed"));
    }
  };
  const patchRow = (id: number, patch: Partial<LookupRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="trk-card">
      <div className="trk-header trk-header--offset">
        <div className="trk-tabs trk-tabs--flush">
          {LOOKUP_KINDS.map((k) => (
            <button
              key={k.kind}
              className={"trk-tab" + (kind === k.kind ? " active" : "")}
              onClick={() => selectKind(k.kind)}
            >
              {k.label}
            </button>
          ))}
        </div>
        <button className="trk-btn trk-btn-primary" onClick={openAdd}>
          <HiPlusCircle /> Add {kindLabel}
        </button>
      </div>

      <Dialog
        open={Boolean(showAdd)}
        onOpenChange={(next) => {
          if (!next) (() => setShowAdd(false))();
        }}
      >
        {showAdd && (
          <DialogContent title="Add entry">
            <DialogHeader>
              <DialogTitle>Add {kindLabel}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="trk-form-grid">
                {isRate ? (
                  <>
                    <div className="trk-field">
                      <label>Label</label>
                      <input
                        placeholder="e.g. 18%"
                        aria-label="Label"
                        value={draft.label || ""}
                        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                      />
                    </div>
                    <div className="trk-field">
                      <label>Rate (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="18"
                        aria-label="Rate (%)"
                        value={draft.rate || ""}
                        onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="trk-field">
                    <label>Name</label>
                    <input
                      placeholder="New value…"
                      aria-label="Name"
                      value={draft.name || ""}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </div>
                )}
                <div className="trk-field">
                  <label>Sort order</label>
                  <input
                    type="number"
                    aria-label="Sort order"
                    value={draft.sort_order ?? rows.length}
                    onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <button className="trk-btn trk-btn-ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button className="trk-btn trk-btn-primary" onClick={add}>
                <HiPlusCircle /> Add
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <div className="trk-table-wrap">
        <Table density="compact">
          <TableHeader>
            <TableRow>
              {isRate ? (
                <>
                  <TableHead>Label</TableHead>
                  <TableHead>Rate</TableHead>
                </>
              ) : (
                <TableHead>Name</TableHead>
              )}
              <TableHead>Sort</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                {isRate ? (
                  <>
                    <TableCell>
                      <input
                        value={r.label}
                        aria-label="Label"
                        onChange={(e) => patchRow(r.id, { label: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="number"
                        step="0.01"
                        value={r.rate}
                        aria-label="Rate"
                        onChange={(e) => patchRow(r.id, { rate: e.target.value })}
                        className="trk-col-80"
                      />
                    </TableCell>
                  </>
                ) : (
                  <TableCell>
                    <input
                      value={r.name}
                      aria-label="Name"
                      onChange={(e) => patchRow(r.id, { name: e.target.value })}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <input
                    type="number"
                    value={r.sort_order}
                    aria-label="Sort order"
                    onChange={(e) => patchRow(r.id, { sort_order: Number(e.target.value) })}
                    className="trk-col-64"
                  />
                </TableCell>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={r.is_active}
                    aria-label={`Active (${r.name ?? r.label})`}
                    onChange={(e) => patchRow(r.id, { is_active: e.target.checked })}
                  />
                </TableCell>
                <TableCell className="trk-row-actions">
                  <button
                    className="trk-btn trk-btn-success trk-btn--sm"
                    aria-label={`Save ${r.name ?? r.label}`}
                    title="Save"
                    onClick={() => update(r)}
                  >
                    <HiCheck />
                  </button>
                  <button
                    className="trk-btn trk-btn-danger trk-btn--sm"
                    aria-label={`Delete ${r.name ?? r.label}`}
                    title="Delete"
                    onClick={() => remove(r)}
                  >
                    <HiTrash />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={isRate ? 5 : 4}>
                  <div className="trk-empty">No values yet — use “Add”.</div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage access (user <-> stage matrix)
// ---------------------------------------------------------------------------
function AccessTab({ flash }: { flash: (m: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState<Set<number>>(new Set());

  /*
   * The same key StagesTab writes through, so adding or renaming a stage over
   * there updates this grid without either tab knowing about the other. It was
   * previously a second, independent fetch of the same endpoint, which is why
   * editing a stage and switching tabs showed the old name until a reload.
   */
  const { data: stages = EMPTY_STAGES } = useQuery({
    queryKey: ["tracker", "admin", "stages"],
    queryFn: () => trackerService.adminGetStages(),
    select: (rows) => rows.filter((x) => x.is_active).sort((a, b) => a.order - b.order),
    staleTime: 5 * 60_000,
  });
  const loadUsers = (q = "") =>
    trackerService
      .adminGetUsers(q)
      .then(setUsers)
      .catch(() => flash("Failed to load users"));

  useEffect(() => {
    loadUsers();
  }, []);

  const orderedStages = useMemo(() => stages, [stages]);

  const toggle = (userId: number, stageId: number) => {
    setUsers((us) =>
      us.map((u) => {
        if (u.id !== userId) return u;
        const has = u.stage_ids.includes(stageId);
        return {
          ...u,
          stage_ids: has ? u.stage_ids.filter((x) => x !== stageId) : [...u.stage_ids, stageId],
        };
      }),
    );
    setDirty((d) => new Set(d).add(userId));
  };

  const saveUser = async (u: AdminUser) => {
    try {
      await trackerService.adminSetUserStages(u.id, u.stage_ids);
      setDirty((d) => {
        const n = new Set(d);
        n.delete(u.id);
        return n;
      });
      flash(`Saved ${u.username}`);
    } catch (err) {
      flash(messageFrom(err, "Save failed"));
    }
  };

  return (
    <div className="trk-card">
      <div className="trk-actionbar trk-actionbar--offset">
        <input
          placeholder="Search users…"
          aria-label="Search users"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadUsers(search)}
        />
        <button className="trk-btn trk-btn-ghost" onClick={() => loadUsers(search)}>
          Search
        </button>
        <span className="trk-sub">Tick the stages each user may see and act on.</span>
      </div>

      <div className="trk-table-wrap">
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              {orderedStages.map((s) => (
                <TableHead key={s.id} title={s.name}>
                  {s.name}
                </TableHead>
              ))}
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <b>{u.username}</b>
                  <div className="trk-sub">{u.name}</div>
                </TableCell>
                <TableCell>{u.role || "—"}</TableCell>
                {orderedStages.map((s) => (
                  <TableCell key={s.id} className="trk-cell-center">
                    <input
                      type="checkbox"
                      checked={u.stage_ids.includes(s.id)}
                      onChange={() => toggle(u.id, s.id)}
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <button
                    className="trk-btn trk-btn-success trk-btn--sm-wide"
                    disabled={!dirty.has(u.id)}
                    onClick={() => saveUser(u)}
                  >
                    <HiCheck /> Save
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={orderedStages.length + 3}>
                  <div className="trk-empty">No users.</div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracker Users — create / delete tracker users (tracker roles only)
// ---------------------------------------------------------------------------
const EMPTY_NEW_USER = {
  username: "",
  password: "",
  name: "",
  email: "",
  phone: "",
  role: "tracker_user",
};

function UsersTab({ flash }: { flash: (m: string) => void }) {
  const [users, setUsers] = useState<TrackerUser[]>([]);
  const [draft, setDraft] = useState({ ...EMPTY_NEW_USER, is_active: true });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () =>
    trackerService
      .adminListTrackerUsers()
      .then(setUsers)
      .catch(() => flash("Failed to load users"));
  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setDraft({ ...EMPTY_NEW_USER, is_active: true });
    setShowModal(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setDraft({ ...EMPTY_NEW_USER, is_active: true });
    setShowModal(true);
  };

  const startEdit = (u: TrackerUser) => {
    setEditingId(u.id);
    setDraft({
      username: u.username,
      password: "",
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      is_active: u.is_active,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!editingId && (!draft.username.trim() || !draft.password.trim())) {
      flash("Username and password are required");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await trackerService.adminUpdateTrackerUser(editingId, {
          name: draft.name,
          role: draft.role,
          email: draft.email,
          phone: draft.phone,
          is_active: draft.is_active,
          ...(draft.password.trim() ? { password: draft.password } : {}),
        });
        flash(`User "${draft.username}" updated`);
      } else {
        await trackerService.adminCreateTrackerUser(draft);
        flash(`User "${draft.username}" created`);
      }
      resetForm();
      load();
    } catch (err) {
      flash(messageFrom(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: TrackerUser) => {
    if (!window.confirm(`Delete tracker user "${u.username}"? This cannot be undone.`)) return;
    try {
      const res = await trackerService.adminDeleteTrackerUser(u.id);
      flash(
        res.deactivated
          ? `"${u.username}" had history — deactivated instead`
          : `"${u.username}" deleted`,
      );
      if (editingId === u.id) resetForm();
      load();
    } catch (err) {
      flash(messageFrom(err, "Delete failed"));
    }
  };

  const roleOptions = Object.entries(TRACKER_ROLE_LABELS);

  return (
    <div className="trk-card">
      <div className="trk-header trk-header--tight">
        <h3 className="trk-heading-flush">Tracker users ({users.length})</h3>
        <button className="trk-btn trk-btn-primary" onClick={openCreate}>
          <HiPlusCircle /> Add User
        </button>
      </div>

      <Dialog
        open={Boolean(showModal)}
        onOpenChange={(next) => {
          if (!next) resetForm();
        }}
      >
        {showModal && (
          <DialogContent title="Tracker user">
            <DialogHeader>
              <DialogTitle>
                {editingId ? `Edit user "${draft.username}"` : "Add a tracker user"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="trk-form-grid">
                <div className="trk-field">
                  <label>Username</label>
                  <input
                    aria-label="Username"
                    value={draft.username}
                    disabled={!!editingId}
                    onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                  />
                </div>
                <div className="trk-field">
                  <label>Full name</label>
                  <input
                    aria-label="Full name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="trk-field">
                  <label>{editingId ? "New password (leave blank to keep)" : "Password"}</label>
                  <input
                    type="password"
                    aria-label={editingId ? "New password (leave blank to keep)" : "Password"}
                    value={draft.password}
                    placeholder={editingId ? "Leave blank to keep current" : ""}
                    onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                  />
                </div>
                <div className="trk-field">
                  <label>Role</label>
                  <select
                    aria-label="Role"
                    value={draft.role}
                    onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                  >
                    {roleOptions.map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="trk-field">
                  <label>Email (optional)</label>
                  <input
                    aria-label="Email (optional)"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                </div>
                <div className="trk-field">
                  <label>Phone (optional)</label>
                  <input
                    aria-label="Phone (optional)"
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  />
                </div>
                {editingId && (
                  <div className="trk-field">
                    <label>Status</label>
                    <select
                      aria-label="Status"
                      value={draft.is_active ? "1" : "0"}
                      onChange={(e) => setDraft({ ...draft, is_active: e.target.value === "1" })}
                    >
                      <option value="1">Active</option>
                      <option value="0">Inactive</option>
                    </select>
                  </div>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <button className="trk-btn trk-btn-ghost" onClick={resetForm}>
                Cancel
              </button>
              <button className="trk-btn trk-btn-primary" onClick={save} disabled={saving}>
                {editingId ? (
                  <>
                    <HiCheck /> {saving ? "Saving…" : "Save changes"}
                  </>
                ) : (
                  <>
                    <HiPlusCircle /> {saving ? "Creating…" : "Create user"}
                  </>
                )}
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <div className="trk-table-wrap">
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={u.is_active ? "" : "trk-row-locked"}>
                <TableCell>{u.username}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell>
                  <Badge tone="info" outlined>
                    {u.role_display || TRACKER_ROLE_LABELS[u.role] || u.role}
                  </Badge>
                </TableCell>
                <TableCell>{u.email || "-"}</TableCell>
                <TableCell>{u.phone || "-"}</TableCell>
                <TableCell>
                  {u.is_active ? (
                    <Badge tone="ok" outlined>
                      Active
                    </Badge>
                  ) : (
                    <Badge tone="bad" outlined>
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="trk-row-actions">
                  <button
                    className="trk-btn trk-btn-ghost trk-btn--sm"
                    onClick={() => startEdit(u)}
                  >
                    <HiPencilSquare /> Edit
                  </button>
                  <button
                    className="trk-btn trk-btn-danger trk-btn--sm"
                    onClick={() => remove(u)}
                  >
                    <HiTrash /> Delete
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="trk-empty">No tracker users yet.</div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
