import { useEffect, useMemo, useState } from "react";
import {
  HiCheck,
  HiPlusCircle,
  HiTrash,
  HiPencilSquare,
} from "react-icons/hi2";
import trackerService from "../services/trackerService";
import type { AdminUser, LookupKind, Stage, TrackerUser } from "../services/trackerService";
import { TRACKER_ROLE_LABELS } from "../config/pageAccess";
import "../styles/Tracker.css";

type Tab = "stages" | "lookups" | "access" | "users";

const LOOKUP_KINDS: { kind: LookupKind; label: string }[] = [
  { kind: "categories", label: "Categories" },
  { kind: "units", label: "Units" },
  { kind: "branches", label: "Branches" },
  { kind: "modes", label: "Modes" },
  { kind: "gst_types", label: "GST Types" },
  { kind: "gst_rates", label: "GST Rates" },
];

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
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2800); };

  return (
    <div className="trk-page">
      <div className="trk-header">
        <div>
          <h1>Tracker Configuration</h1>
          <div className="trk-sub">Manage stages, dropdown values, and who works each stage.</div>
        </div>
      </div>

      <div className="trk-tabs">
        {([["stages", "Stages"], ["lookups", "Lookups"], ["access", "Stage Access"], ["users", "Tracker Users"]] as const).map(
          ([t, label]) => (
            <button key={t} className={"trk-tab" + (tab === t ? " active" : "")}
              onClick={() => setTab(t as Tab)}>{label}</button>
          )
        )}
      </div>

      {tab === "stages" && <StagesTab flash={flash} />}
      {tab === "lookups" && <LookupsTab flash={flash} />}
      {tab === "access" && <AccessTab flash={flash} />}
      {tab === "users" && <UsersTab flash={flash} />}

      {toast && <div className="trk-toast">{toast}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
function StagesTab({ flash }: { flash: (m: string) => void }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [editing, setEditing] = useState<Partial<Stage> | null>(null);

  const load = () =>
    trackerService.adminGetStages()
      .then((s) => setStages(s.sort((a, b) => a.order - b.order)))
      .catch(() => flash("Failed to load stages"));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    try {
      const payload = { ...editing };
      if (editing.id) await trackerService.adminUpdateStage(editing.id, payload);
      else await trackerService.adminCreateStage(payload);
      setEditing(null);
      flash("Stage saved");
      load();
    } catch (err: any) {
      flash(err?.response?.data?.detail || JSON.stringify(err?.response?.data) || "Save failed");
    }
  };

  const remove = async (s: Stage) => {
    if (!confirm(`Delete stage "${s.name}"?`)) return;
    try { await trackerService.adminDeleteStage(s.id); flash("Deleted"); load(); }
    catch (err: any) { flash(err?.response?.data?.detail || "Delete failed"); }
  };

  return (
    <div className="trk-card">
      <div style={{ marginBottom: 12 }}>
        <button className="trk-btn trk-btn-primary" onClick={() => setEditing({ ...EMPTY_STAGE, order: stages.length + 1 })}>
          <HiPlusCircle /> Add stage
        </button>
      </div>
      <div className="trk-table-wrap">
        <table className="trk-table">
          <thead>
            <tr>
              <th>Order</th><th>Name</th><th>Code</th><th>Statuses</th>
              <th>Req. status</th><th>Can return</th><th>Terminal</th>
              <th>Threshold (days)</th><th>Active</th><th></th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.id}>
                <td>{s.order}</td>
                <td>{s.name}</td>
                <td><code>{s.code}</code></td>
                <td>{s.status_choices.length ? s.status_choices.join(", ") : "—"}</td>
                <td>{s.requires_status ? "✓" : "—"}</td>
                <td>{s.can_return ? "✓" : "—"}</td>
                <td>{s.is_terminal ? "✓" : "—"}</td>
                <td>{s.threshold_days}</td>
                <td>{s.is_active ? <span className="trk-badge trk-badge-ok">Active</span> : <span className="trk-badge trk-badge-muted">Off</span>}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="trk-btn trk-btn-ghost" style={{ padding: "5px 9px" }} onClick={() => setEditing({ ...s })}>
                    <HiPencilSquare />
                  </button>
                  <button className="trk-btn trk-btn-danger" style={{ padding: "5px 9px" }} onClick={() => remove(s)}>
                    <HiTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="trk-modal-overlay" onClick={() => setEditing(null)}>
          <div className="trk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trk-modal-head"><h3>{editing.id ? "Edit stage" : "New stage"}</h3></div>
            <div className="trk-modal-body">
              <div className="trk-form-grid">
                <div className="trk-field"><label>Name</label>
                  <input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div className="trk-field"><label>Code (unique key)</label>
                  <input value={editing.code || ""} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></div>
                <div className="trk-field"><label>Order</label>
                  <input type="number" value={editing.order ?? 1} onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })} /></div>
                <div className="trk-field"><label>Threshold days</label>
                  <input type="number" value={editing.threshold_days ?? 3} onChange={(e) => setEditing({ ...editing, threshold_days: Number(e.target.value) })} /></div>
                <div className="trk-field" style={{ gridColumn: "1 / -1" }}>
                  <label>Status choices (comma-separated, e.g. OK, HOLD, DEBIT, RETURN)</label>
                  <input value={(editing.status_choices || []).join(", ")}
                    onChange={(e) => setEditing({ ...editing, status_choices: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })} /></div>
                <label className="trk-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={!!editing.requires_status} onChange={(e) => setEditing({ ...editing, requires_status: e.target.checked })} /> Requires status
                </label>
                <label className="trk-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={!!editing.can_return} onChange={(e) => setEditing({ ...editing, can_return: e.target.checked })} /> Can return
                </label>
                <label className="trk-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={!!editing.is_terminal} onChange={(e) => setEditing({ ...editing, is_terminal: e.target.checked })} /> Terminal (payment)
                </label>
                <label className="trk-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Active
                </label>
              </div>
            </div>
            <div className="trk-modal-foot">
              <button className="trk-btn trk-btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="trk-btn trk-btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
function LookupsTab({ flash }: { flash: (m: string) => void }) {
  const [kind, setKind] = useState<LookupKind>("categories");
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState<any>({});
  const [showAdd, setShowAdd] = useState(false);
  const isRate = kind === "gst_rates";
  const kindLabel = LOOKUP_KINDS.find((k) => k.kind === kind)?.label || "value";

  const load = () =>
    trackerService.adminGetLookup(kind).then(setRows).catch(() => flash("Failed to load"));
  useEffect(() => { load(); setDraft({}); setShowAdd(false); }, [kind]);

  const blankDraft = () =>
    isRate ? { label: "", rate: "", sort_order: rows.length, is_active: true }
           : { name: "", sort_order: rows.length, is_active: true };

  const openAdd = () => { setDraft(blankDraft()); setShowAdd(true); };

  const add = async () => {
    if (isRate ? (!draft.label || draft.rate === "") : !draft.name) {
      flash("Fill in the value first"); return;
    }
    try { await trackerService.adminCreateLookup(kind, draft); setDraft({}); setShowAdd(false); flash("Added"); load(); }
    catch (err: any) { flash(err?.response?.data?.detail || JSON.stringify(err?.response?.data) || "Add failed"); }
  };
  const update = async (row: any) => {
    try { await trackerService.adminUpdateLookup(kind, row.id, row); flash("Saved"); load(); }
    catch (err: any) { flash(err?.response?.data?.detail || "Save failed"); }
  };
  const remove = async (row: any) => {
    if (!confirm("Delete this value?")) return;
    try { await trackerService.adminDeleteLookup(kind, row.id); flash("Deleted"); load(); }
    catch (err: any) { flash(err?.response?.data?.detail || "Delete failed"); }
  };
  const patchRow = (id: number, patch: any) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="trk-card">
      <div className="trk-header" style={{ marginBottom: 14 }}>
        <div className="trk-tabs" style={{ margin: 0 }}>
          {LOOKUP_KINDS.map((k) => (
            <button key={k.kind} className={"trk-tab" + (kind === k.kind ? " active" : "")}
              onClick={() => setKind(k.kind)}>{k.label}</button>
          ))}
        </div>
        <button className="trk-btn trk-btn-primary" onClick={openAdd}>
          <HiPlusCircle /> Add {kindLabel.replace(/s$/, "")}
        </button>
      </div>

      {showAdd && (
        <div className="trk-modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="trk-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="trk-modal-head"><h3>Add {kindLabel.replace(/s$/, "")}</h3></div>
            <div className="trk-modal-body">
              <div className="trk-form-grid">
                {isRate ? (
                  <>
                    <div className="trk-field">
                      <label>Label</label>
                      <input placeholder="e.g. 18%" value={draft.label || ""}
                        onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                    </div>
                    <div className="trk-field">
                      <label>Rate (%)</label>
                      <input type="number" step="0.01" placeholder="18" value={draft.rate || ""}
                        onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
                    </div>
                  </>
                ) : (
                  <div className="trk-field">
                    <label>Name</label>
                    <input placeholder="New value…" value={draft.name || ""}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </div>
                )}
                <div className="trk-field">
                  <label>Sort order</label>
                  <input type="number" value={draft.sort_order ?? rows.length}
                    onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} />
                </div>
              </div>
            </div>
            <div className="trk-modal-foot">
              <button className="trk-btn trk-btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="trk-btn trk-btn-primary" onClick={add}><HiPlusCircle /> Add</button>
            </div>
          </div>
        </div>
      )}

      <div className="trk-table-wrap">
        <table className="trk-table">
          <thead>
            <tr>
              {isRate ? (<><th>Label</th><th>Rate</th></>) : <th>Name</th>}
              <th>Sort</th><th>Active</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {isRate ? (
                  <>
                    <td><input value={r.label} onChange={(e) => patchRow(r.id, { label: e.target.value })} /></td>
                    <td><input type="number" step="0.01" value={r.rate} onChange={(e) => patchRow(r.id, { rate: e.target.value })} style={{ width: 80 }} /></td>
                  </>
                ) : (
                  <td><input value={r.name} onChange={(e) => patchRow(r.id, { name: e.target.value })} /></td>
                )}
                <td><input type="number" value={r.sort_order} onChange={(e) => patchRow(r.id, { sort_order: Number(e.target.value) })} style={{ width: 64 }} /></td>
                <td><input type="checkbox" checked={r.is_active} onChange={(e) => patchRow(r.id, { is_active: e.target.checked })} /></td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="trk-btn trk-btn-success" style={{ padding: "5px 9px" }} onClick={() => update(r)}><HiCheck /></button>
                  <button className="trk-btn trk-btn-danger" style={{ padding: "5px 9px" }} onClick={() => remove(r)}><HiTrash /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={isRate ? 5 : 4}><div className="trk-empty">No values yet — use “Add”.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage access (user <-> stage matrix)
// ---------------------------------------------------------------------------
function AccessTab({ flash }: { flash: (m: string) => void }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState<Set<number>>(new Set());

  const loadStages = () =>
    trackerService.adminGetStages().then((s) => setStages(s.filter((x) => x.is_active).sort((a, b) => a.order - b.order)));
  const loadUsers = (q = "") =>
    trackerService.adminGetUsers(q).then(setUsers).catch(() => flash("Failed to load users"));

  useEffect(() => { loadStages(); loadUsers(); }, []);

  const orderedStages = useMemo(() => stages, [stages]);

  const toggle = (userId: number, stageId: number) => {
    setUsers((us) => us.map((u) => {
      if (u.id !== userId) return u;
      const has = u.stage_ids.includes(stageId);
      return { ...u, stage_ids: has ? u.stage_ids.filter((x) => x !== stageId) : [...u.stage_ids, stageId] };
    }));
    setDirty((d) => new Set(d).add(userId));
  };

  const saveUser = async (u: AdminUser) => {
    try {
      await trackerService.adminSetUserStages(u.id, u.stage_ids);
      setDirty((d) => { const n = new Set(d); n.delete(u.id); return n; });
      flash(`Saved ${u.username}`);
    } catch (err: any) {
      flash(err?.response?.data?.detail || "Save failed");
    }
  };

  return (
    <div className="trk-card">
      <div className="trk-actionbar" style={{ marginBottom: 14 }}>
        <input placeholder="Search users…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadUsers(search)} />
        <button className="trk-btn trk-btn-ghost" onClick={() => loadUsers(search)}>Search</button>
        <span className="trk-sub">Tick the stages each user may see and act on.</span>
      </div>

      <div className="trk-table-wrap">
        <table className="trk-table">
          <thead>
            <tr>
              <th>User</th><th>Role</th>
              {orderedStages.map((s) => <th key={s.id} title={s.name}>{s.name}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.username}</b><div className="trk-sub">{u.name}</div></td>
                <td>{u.role || "—"}</td>
                {orderedStages.map((s) => (
                  <td key={s.id} style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={u.stage_ids.includes(s.id)}
                      onChange={() => toggle(u.id, s.id)} />
                  </td>
                ))}
                <td>
                  <button className="trk-btn trk-btn-success" style={{ padding: "5px 10px" }}
                    disabled={!dirty.has(u.id)} onClick={() => saveUser(u)}>
                    <HiCheck /> Save
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={orderedStages.length + 3}><div className="trk-empty">No users.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracker Users — create / delete tracker users (tracker roles only)
// ---------------------------------------------------------------------------
const EMPTY_NEW_USER = {
  username: "", password: "", name: "", email: "", phone: "", role: "tracker_user",
};

function UsersTab({ flash }: { flash: (m: string) => void }) {
  const [users, setUsers] = useState<TrackerUser[]>([]);
  const [draft, setDraft] = useState({ ...EMPTY_NEW_USER, is_active: true });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => trackerService.adminListTrackerUsers().then(setUsers).catch(() => flash("Failed to load users"));
  useEffect(() => { load(); }, []);

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
      username: u.username, password: "", name: u.name, email: u.email,
      phone: u.phone, role: u.role, is_active: u.is_active,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!editingId && (!draft.username.trim() || !draft.password.trim())) {
      flash("Username and password are required"); return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await trackerService.adminUpdateTrackerUser(editingId, {
          name: draft.name, role: draft.role, email: draft.email,
          phone: draft.phone, is_active: draft.is_active,
          ...(draft.password.trim() ? { password: draft.password } : {}),
        });
        flash(`User "${draft.username}" updated`);
      } else {
        await trackerService.adminCreateTrackerUser(draft);
        flash(`User "${draft.username}" created`);
      }
      resetForm();
      load();
    } catch (err: any) {
      flash(err?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: TrackerUser) => {
    if (!window.confirm(`Delete tracker user "${u.username}"? This cannot be undone.`)) return;
    try {
      const res = await trackerService.adminDeleteTrackerUser(u.id);
      flash(res.deactivated ? `"${u.username}" had history — deactivated instead` : `"${u.username}" deleted`);
      if (editingId === u.id) resetForm();
      load();
    } catch (err: any) {
      flash(err?.response?.data?.detail || "Delete failed");
    }
  };

  const roleOptions = Object.entries(TRACKER_ROLE_LABELS);

  return (
    <div className="trk-card">
      <div className="trk-header" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Tracker users ({users.length})</h3>
        <button className="trk-btn trk-btn-primary" onClick={openCreate}>
          <HiPlusCircle /> Add User
        </button>
      </div>

      {showModal && (
        <div className="trk-modal-overlay" onClick={resetForm}>
          <div className="trk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trk-modal-head">
              <h3>{editingId ? `Edit user "${draft.username}"` : "Add a tracker user"}</h3>
            </div>
            <div className="trk-modal-body">
              <div className="trk-form-grid">
                <div className="trk-field">
                  <label>Username</label>
                  <input value={draft.username} disabled={!!editingId}
                    onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
                </div>
                <div className="trk-field">
                  <label>Full name</label>
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="trk-field">
                  <label>{editingId ? "New password (leave blank to keep)" : "Password"}</label>
                  <input type="password" value={draft.password}
                    placeholder={editingId ? "Leave blank to keep current" : ""}
                    onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
                </div>
                <div className="trk-field">
                  <label>Role</label>
                  <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                    {roleOptions.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                </div>
                <div className="trk-field">
                  <label>Email (optional)</label>
                  <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                </div>
                <div className="trk-field">
                  <label>Phone (optional)</label>
                  <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                </div>
                {editingId && (
                  <div className="trk-field">
                    <label>Status</label>
                    <select value={draft.is_active ? "1" : "0"}
                      onChange={(e) => setDraft({ ...draft, is_active: e.target.value === "1" })}>
                      <option value="1">Active</option>
                      <option value="0">Inactive</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="trk-modal-foot">
              <button className="trk-btn trk-btn-ghost" onClick={resetForm}>Cancel</button>
              <button className="trk-btn trk-btn-primary" onClick={save} disabled={saving}>
                {editingId ? <><HiCheck /> {saving ? "Saving…" : "Save changes"}</>
                  : <><HiPlusCircle /> {saving ? "Creating…" : "Create user"}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="trk-table-wrap">
        <table className="trk-table">
          <thead>
            <tr><th>Username</th><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.is_active ? "" : "trk-row-locked"}>
                <td>{u.username}</td>
                <td>{u.name}</td>
                <td><span className="trk-badge trk-badge-stage">{u.role_display || TRACKER_ROLE_LABELS[u.role] || u.role}</span></td>
                <td>{u.email || "-"}</td>
                <td>{u.phone || "-"}</td>
                <td>
                  {u.is_active
                    ? <span className="trk-badge trk-badge-ok">Active</span>
                    : <span className="trk-badge trk-badge-muted">Inactive</span>}
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="trk-btn trk-btn-ghost" style={{ padding: "5px 9px" }} onClick={() => startEdit(u)}>
                    <HiPencilSquare /> Edit
                  </button>
                  <button className="trk-btn trk-btn-danger" style={{ padding: "5px 9px" }} onClick={() => remove(u)}>
                    <HiTrash /> Delete
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7}><div className="trk-empty">No tracker users yet.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
