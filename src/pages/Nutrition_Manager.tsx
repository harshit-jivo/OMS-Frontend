import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  HiCheck,
  HiEllipsisVertical,
  HiMagnifyingGlass,
  HiPencilSquare,
  HiPlus,
  HiTrash,
  HiXMark,
} from "react-icons/hi2";
import api from "../services/api";
import "../styles/Nutrition_Manager.css";

/* ──────────────────────────────────────────────────────────────────────────
 * Nutrition Manager — single-page master/detail (vanilla CSS).
 *
 * Left  (master): searchable Items list (rename / delete per row) + Add modal.
 * Right (detail): the selected item's nutrition rows, edited inline. The unit is
 *                 chosen from a pill control; the "+" pill opens a Units manager
 *                 to create / rename / delete units without losing form state.
 *
 * Every table — item, uom, nutrition — uses the same REST shape:
 *   GET/POST   /api/legal/<table>/
 *   PATCH/DELETE /api/legal/<table>/<id>/
 * ────────────────────────────────────────────────────────────────────────── */

type Item = { id: number; item_name: string; created_at?: string };
type Uom = { id: number; uom_name: string; uom_unit: string };
type Nutrition = {
  id: number;
  nutrition_name: string;
  per_serving: string | number;
  per_100gm: string | number;
  label_item: number;
  uom: number;
};

type NutritionPayload = {
  uom: number;
  label_item: number;
  nutrition_name: string;
  per_serving: number;
  per_100gm: number;
};

type UomApi = {
  create: (name: string, unit: string) => Promise<Uom | null>;
  update: (id: number, name: string, unit: string) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
};

const ITEM_URL = "/legal/item/";
const UOM_URL = "/legal/uom/";
const NUTRITION_URL = "/legal/nutrition/";
const ITEM_NUTRITION_URL = "/legal/item-nutrition/";

const asArray = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["results", "data"]) if (Array.isArray(obj[key])) return obj[key] as T[];
  }
  return [];
};

const formatNum = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? String(n) : String(value);
};

const formatDate = (value?: string): string => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const errMessage = (error: unknown, fallback: string): string => {
  const e = error as { response?: { data?: unknown }; message?: string };
  const data = e?.response?.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const first = Object.values(data as Record<string, unknown>)[0];
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === "string") return first;
  }
  return e?.message || fallback;
};

function useClickOutside<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

/* ── Field wrapper ────────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="nm-field">
      <span className="nm-field-label">{label}</span>
      {children}
    </label>
  );
}

/* ── Unit pills + Units manager popover ────────────────────────────────────── */

function UomToggle({
  uoms,
  value,
  onChange,
  api: uomApi,
}: {
  uoms: Uom[];
  value: number | null;
  onChange: (id: number) => void;
  api: UomApi;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const ref = useClickOutside<HTMLDivElement>(() => {
    setOpen(false);
    setEditId(null);
  });

  const submitNew = async () => {
    if (!name.trim() || !unit.trim() || busy) return;
    setBusy(true);
    const created = await uomApi.create(name.trim(), unit.trim());
    setBusy(false);
    if (created) {
      onChange(created.id);
      setName("");
      setUnit("");
    }
  };

  const startEdit = (uom: Uom) => {
    setEditId(uom.id);
    setEditName(uom.uom_name);
    setEditUnit(uom.uom_unit);
  };

  const saveEdit = async () => {
    if (editId === null || !editName.trim() || !editUnit.trim()) return;
    const ok = await uomApi.update(editId, editName.trim(), editUnit.trim());
    if (ok) setEditId(null);
  };

  const remove = async (id: number) => {
    const ok = await uomApi.remove(id);
    if (ok && value === id) {
      const fallback = uoms.find((u) => u.id !== id);
      if (fallback) onChange(fallback.id);
    }
  };

  return (
    <div className="nm-uom">
      {uoms.map((uom) => (
        <button
          key={uom.id}
          type="button"
          title={uom.uom_name}
          onClick={() => onChange(uom.id)}
          className={`nm-pill${value === uom.id ? " is-active" : ""}`}
        >
          {uom.uom_unit}
        </button>
      ))}

      <div className="nm-uom-add-wrap" ref={ref}>
        <button type="button" aria-label="Manage units" onClick={() => setOpen((o) => !o)} className="nm-pill-add">
          <HiPlus />
        </button>

        {open && (
          <div className="nm-pop">
            <div className="nm-pop-title">Units</div>

            <div className="nm-unit-list">
              {uoms.length === 0 && <div className="nm-unit-empty">No units yet.</div>}
              {uoms.map((uom) =>
                editId === uom.id ? (
                  <div className="nm-unit-edit" key={uom.id}>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" className="nm-input nm-input-sm" />
                    <input value={editUnit} onChange={(e) => setEditUnit(e.target.value)} placeholder="Unit" className="nm-input nm-input-sm" />
                    <button type="button" aria-label="Save" className="nm-icon-btn" onClick={saveEdit}>
                      <HiCheck />
                    </button>
                    <button type="button" aria-label="Cancel" className="nm-icon-btn" onClick={() => setEditId(null)}>
                      <HiXMark />
                    </button>
                  </div>
                ) : (
                  <div className="nm-unit-row" key={uom.id}>
                    <span className="nm-unit-tag">{uom.uom_unit}</span>
                    <span className="nm-unit-name">{uom.uom_name}</span>
                    <button type="button" aria-label="Edit unit" className="nm-icon-btn" onClick={() => startEdit(uom)}>
                      <HiPencilSquare />
                    </button>
                    <button type="button" aria-label="Delete unit" className="nm-icon-btn is-danger" onClick={() => remove(uom.id)}>
                      <HiTrash />
                    </button>
                  </div>
                ),
              )}
            </div>

            <div className="nm-unit-add">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (e.g. Calorie)"
                className="nm-input nm-input-sm"
                onKeyDown={(e) => e.key === "Enter" && submitNew()}
              />
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Unit"
                className="nm-input nm-input-sm nm-input-unit"
                onKeyDown={(e) => e.key === "Enter" && submitNew()}
              />
              <button type="button" onClick={submitNew} disabled={!name.trim() || !unit.trim() || busy} className="nm-btn nm-btn-primary nm-btn-sm">
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Row actions (⋮) ──────────────────────────────────────────────────────── */

function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  return (
    <div className="nm-menu" ref={ref}>
      <button type="button" aria-label="Actions" onClick={() => setOpen((o) => !o)} className="nm-menu-btn">
        <HiEllipsisVertical />
      </button>
      {open && (
        <div className="nm-menu-list">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="nm-menu-item"
          >
            <HiPencilSquare /> Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="nm-menu-item is-danger"
          >
            <HiTrash /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Inline add/edit nutrition form ───────────────────────────────────────── */

type Draft = { nutrition_name: string; per_serving: string; per_100gm: string; uom: number | null };

function NutritionForm({
  uoms,
  initial,
  uomApi,
  onCancel,
  onSubmit,
}: {
  uoms: Uom[];
  initial: Draft;
  uomApi: UomApi;
  onCancel: () => void;
  onSubmit: (draft: Draft) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const valid = draft.nutrition_name.trim() !== "" && draft.uom !== null;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    await onSubmit(draft);
    setBusy(false);
  };

  return (
    <div className="nm-form">
      <div className="nm-form-grid">
        <Field label="Nutrient">
          <input
            autoFocus
            value={draft.nutrition_name}
            onChange={(e) => setDraft({ ...draft, nutrition_name: e.target.value })}
            placeholder="e.g. Energy"
            className="nm-input"
          />
        </Field>
        <Field label="Per serving">
          <input
            type="number"
            step="any"
            value={draft.per_serving}
            onChange={(e) => setDraft({ ...draft, per_serving: e.target.value })}
            placeholder="0"
            className="nm-input nm-input-num"
          />
        </Field>
        <Field label="Per 100g">
          <input
            type="number"
            step="any"
            value={draft.per_100gm}
            onChange={(e) => setDraft({ ...draft, per_100gm: e.target.value })}
            placeholder="0"
            className="nm-input nm-input-num"
          />
        </Field>
      </div>

      <div className="nm-form-unit">
        <span className="nm-field-label">Unit</span>
        <UomToggle uoms={uoms} value={draft.uom} onChange={(id) => setDraft({ ...draft, uom: id })} api={uomApi} />
      </div>

      <div className="nm-form-actions">
        <button type="button" onClick={onCancel} className="nm-btn nm-btn-text">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!valid || busy} className="nm-btn nm-btn-primary">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ── Nutrition data grid ──────────────────────────────────────────────────── */

function NutritionTable({
  itemId,
  rows,
  uoms,
  uomApi,
  onAdd,
  onUpdate,
  onDelete,
}: {
  itemId: number;
  rows: Nutrition[];
  uoms: Uom[];
  uomApi: UomApi;
  onAdd: (payload: NutritionPayload) => Promise<boolean>;
  onUpdate: (id: number, payload: NutritionPayload) => Promise<boolean>;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const uomUnit = (id: number) => uoms.find((u) => u.id === id)?.uom_unit ?? "—";

  const toPayload = (draft: Draft): NutritionPayload => ({
    label_item: itemId,
    uom: draft.uom as number,
    nutrition_name: draft.nutrition_name.trim(),
    per_serving: parseFloat(draft.per_serving) || 0,
    per_100gm: parseFloat(draft.per_100gm) || 0,
  });

  const blankDraft: Draft = { nutrition_name: "", per_serving: "", per_100gm: "", uom: uoms[0]?.id ?? null };
  const draftFor = (row: Nutrition): Draft => ({
    nutrition_name: row.nutrition_name,
    per_serving: String(row.per_serving ?? ""),
    per_100gm: String(row.per_100gm ?? ""),
    uom: row.uom,
  });

  return (
    <div className="nm-grid">
      <div className="nm-grid-head">
        <span className="nm-col-nutrient">Nutrient</span>
        <span className="nm-col-num">Per serving</span>
        <span className="nm-col-num">Per 100g</span>
        <span className="nm-col-unit">Unit</span>
        <span className="nm-col-act" />
      </div>

      {rows.length === 0 && editing !== "new" && (
        <div className="nm-grid-empty">No nutrition data yet. Add the first row below.</div>
      )}

      {rows.map((row) =>
        editing === row.id ? (
          <NutritionForm
            key={row.id}
            uoms={uoms}
            initial={draftFor(row)}
            uomApi={uomApi}
            onCancel={() => setEditing(null)}
            onSubmit={async (draft) => {
              const ok = await onUpdate(row.id, toPayload(draft));
              if (ok) setEditing(null);
              return ok;
            }}
          />
        ) : (
          <div className="nm-grid-row" key={row.id}>
            <span className="nm-col-nutrient nm-cell-name">{row.nutrition_name}</span>
            <span className="nm-col-num nm-cell-num">{formatNum(row.per_serving)}</span>
            <span className="nm-col-num nm-cell-num">{formatNum(row.per_100gm)}</span>
            <span className="nm-col-unit nm-cell-unit">{uomUnit(row.uom)}</span>
            <span className="nm-col-act">
              <RowMenu onEdit={() => setEditing(row.id)} onDelete={() => onDelete(row.id)} />
            </span>
          </div>
        ),
      )}

      {editing === "new" ? (
        <NutritionForm
          uoms={uoms}
          initial={blankDraft}
          uomApi={uomApi}
          onCancel={() => setEditing(null)}
          onSubmit={async (draft) => {
            const ok = await onAdd(toPayload(draft));
            if (ok) setEditing(null);
            return ok;
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="nm-addrow">
          <HiPlus /> Add row
        </button>
      )}
    </div>
  );
}

/* ── Master list ──────────────────────────────────────────────────────────── */

type ItemModal = { mode: "add" } | { mode: "edit"; id: number } | null;

function ItemSelector({
  items,
  selectedId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
}: {
  items: Item[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAdd: (name: string) => Promise<boolean>;
  onUpdate: (id: number, name: string) => Promise<boolean>;
  onDelete: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ItemModal>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((it) => it.item_name.toLowerCase().includes(q)) : items;
  }, [items, search]);

  const openAdd = () => {
    setName("");
    setModal({ mode: "add" });
  };
  const openEdit = (item: Item) => {
    setName(item.item_name);
    setModal({ mode: "edit", id: item.id });
  };

  const submit = async () => {
    if (!name.trim() || busy || !modal) return;
    setBusy(true);
    const ok = modal.mode === "add" ? await onAdd(name.trim()) : await onUpdate(modal.id, name.trim());
    setBusy(false);
    if (ok) setModal(null);
  };

  return (
    <aside className="nm-master">
      <div className="nm-master-head">
        <h2 className="nm-master-title">Items</h2>
        <button type="button" onClick={openAdd} className="nm-add-item">
          <HiPlus /> Add item
        </button>
      </div>

      <div className="nm-search">
        <HiMagnifyingGlass className="nm-search-icon" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items" className="nm-search-input" />
      </div>

      <div className="nm-item-list">
        {filtered.map((item) => (
          <div key={item.id} className={`nm-item${item.id === selectedId ? " is-active" : ""}`}>
            <button type="button" onClick={() => onSelect(item.id)} className="nm-item-btn">
              <span className="nm-item-name">{item.item_name}</span>
              {item.created_at && <span className="nm-item-date">{formatDate(item.created_at)}</span>}
            </button>
            <RowMenu onEdit={() => openEdit(item)} onDelete={() => onDelete(item.id)} />
          </div>
        ))}
        {filtered.length === 0 && <div className="nm-item-empty">{search ? "No matches." : "No items yet."}</div>}
      </div>

      {modal && (
        <div className="nm-modal-overlay" onClick={() => !busy && setModal(null)}>
          <div className="nm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="nm-modal-head">
              <span className="nm-modal-title">{modal.mode === "add" ? "New item" : "Rename item"}</span>
              <button type="button" aria-label="Close" onClick={() => setModal(null)} className="nm-modal-close">
                <HiXMark />
              </button>
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Item name"
              className="nm-input"
            />
            <div className="nm-modal-actions">
              <button type="button" onClick={() => setModal(null)} className="nm-btn nm-btn-text">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={!name.trim() || busy} className="nm-btn nm-btn-primary">
                {busy ? "Saving…" : modal.mode === "add" ? "Add item" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────────────── */

export default function NutritionManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [rows, setRows] = useState<Nutrition[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Items + units load once.
  useEffect(() => {
    (async () => {
      try {
        const [itemsRes, uomsRes] = await Promise.all([api.get(ITEM_URL), api.get(UOM_URL)]);
        const loadedItems = asArray<Item>(itemsRes.data);
        setItems(loadedItems);
        setUoms(asArray<Uom>(uomsRes.data));
        if (loadedItems.length) setSelectedId(loadedItems[0].id);
      } catch (err) {
        setError(errMessage(err, "Unable to load nutrition data."));
      }
    })();
  }, []);

  // Nutrition facts for the selected item — fetched from the dedicated endpoint
  // (/legal/item-nutrition/?item_id=…) whenever the selection changes.
  useEffect(() => {
    if (selectedId == null) {
      setRows([]);
      return;
    }
    let ignore = false;
    setRowsLoading(true);
    (async () => {
      try {
        const { data } = await api.get(ITEM_NUTRITION_URL, { params: { item_id: selectedId } });
        if (ignore) return;
        const facts =
          data && Array.isArray((data as { nutritional_facts?: unknown }).nutritional_facts)
            ? (data as { nutritional_facts: Nutrition[] }).nutritional_facts
            : asArray<Nutrition>(data);
        setRows(facts);
      } catch (err) {
        if (!ignore) {
          setRows([]);
          setError(errMessage(err, "Unable to load nutrition facts."));
        }
      } finally {
        if (!ignore) setRowsLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [selectedId]);

  const selectedItem = items.find((it) => it.id === selectedId) ?? null;

  /* Items — POST / PATCH /:id/ / DELETE /:id/ */
  const addItem = async (item_name: string): Promise<boolean> => {
    try {
      const { data } = await api.post<Item>(ITEM_URL, { item_name });
      setItems((prev) => [data, ...prev]);
      setSelectedId(data.id);
      return true;
    } catch (err) {
      setError(errMessage(err, "Could not add the item."));
      return false;
    }
  };

  const updateItem = async (id: number, item_name: string): Promise<boolean> => {
    try {
      const { data } = await api.patch<Item>(`${ITEM_URL}${id}/`, { item_name });
      setItems((prev) => prev.map((it) => (it.id === id ? data : it)));
      return true;
    } catch (err) {
      setError(errMessage(err, "Could not rename the item."));
      return false;
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await api.delete(`${ITEM_URL}${id}/`);
      setItems((prev) => prev.filter((it) => it.id !== id));
      setSelectedId((curr) => (curr === id ? items.find((it) => it.id !== id)?.id ?? null : curr));
    } catch (err) {
      setError(errMessage(err, "Could not delete the item."));
    }
  };

  /* Units — POST / PATCH /:id/ / DELETE /:id/ */
  const createUom = async (uom_name: string, uom_unit: string): Promise<Uom | null> => {
    try {
      const { data } = await api.post<Uom>(UOM_URL, { uom_name, uom_unit });
      setUoms((prev) => [...prev, data]);
      return data;
    } catch (err) {
      setError(errMessage(err, "Could not add the unit."));
      return null;
    }
  };

  const updateUom = async (id: number, uom_name: string, uom_unit: string): Promise<boolean> => {
    try {
      const { data } = await api.patch<Uom>(`${UOM_URL}${id}/`, { uom_name, uom_unit });
      setUoms((prev) => prev.map((u) => (u.id === id ? data : u)));
      return true;
    } catch (err) {
      setError(errMessage(err, "Could not update the unit."));
      return false;
    }
  };

  const deleteUom = async (id: number): Promise<boolean> => {
    try {
      await api.delete(`${UOM_URL}${id}/`);
      setUoms((prev) => prev.filter((u) => u.id !== id));
      return true;
    } catch (err) {
      setError(errMessage(err, "Could not delete the unit."));
      return false;
    }
  };

  const uomApi: UomApi = { create: createUom, update: updateUom, remove: deleteUom };

  /* Nutrition — POST / PATCH /:id/ / DELETE /:id/ */
  const addNutrition = async (payload: NutritionPayload): Promise<boolean> => {
    try {
      const { data } = await api.post<Nutrition>(NUTRITION_URL, payload);
      setRows((prev) => [...prev, data]);
      return true;
    } catch (err) {
      setError(errMessage(err, "Could not add the nutrition row."));
      return false;
    }
  };

  const updateNutrition = async (id: number, payload: NutritionPayload): Promise<boolean> => {
    try {
      const { data } = await api.patch<Nutrition>(`${NUTRITION_URL}${id}/`, payload);
      setRows((prev) => prev.map((n) => (n.id === id ? data : n)));
      return true;
    } catch (err) {
      setError(errMessage(err, "Could not update the nutrition row."));
      return false;
    }
  };

  const deleteNutrition = async (id: number) => {
    setRows((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.delete(`${NUTRITION_URL}${id}/`);
    } catch (err) {
      setError(errMessage(err, "Could not delete the row."));
    }
  };

  return (
    <div className="nm-root">
      <div className="nm-shell">
        <ItemSelector
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={addItem}
          onUpdate={updateItem}
          onDelete={deleteItem}
        />

        <section className="nm-detail">
          {error && (
            <div className="nm-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError("")} aria-label="Dismiss">
                <HiXMark />
              </button>
            </div>
          )}

          {selectedItem ? (
            <>
              <header className="nm-detail-head">
                <span className="nm-eyebrow">Nutrition facts</span>
                <h2 className="nm-detail-title">{selectedItem.item_name}</h2>
                <span className="nm-detail-count">
                  {rowsLoading ? "Loading…" : `${rows.length} ${rows.length === 1 ? "nutrient" : "nutrients"}`}
                </span>
              </header>
              <div className="nm-detail-body">
                {rowsLoading ? (
                  <div className="nm-loading">Loading nutrition…</div>
                ) : (
                  <NutritionTable
                    itemId={selectedItem.id}
                    rows={rows}
                    uoms={uoms}
                    uomApi={uomApi}
                    onAdd={addNutrition}
                    onUpdate={updateNutrition}
                    onDelete={deleteNutrition}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="nm-detail-empty">
              <HiMagnifyingGlass />
              <p>Select an item to view its nutrition data.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
