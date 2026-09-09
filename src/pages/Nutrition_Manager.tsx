import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineBeaker,
  HiOutlineCheck,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineXMark,
} from "react-icons/hi2";
import api from "../services/api";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FormActions, FormGrid, Input } from "@/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Notice,
  Page,
  PageHeader,
} from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
/* The UNIT PICKER keeps this — a popover that also creates and renames units
   is a small application rather than a form control, and converting it is its
   own piece of work. Everything else on this page is the design system. */

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

/** Items + units load together (`Promise.all`): either both arrive or, on a
 *  failure, neither does — matching the original mount effect exactly. */
type Catalog = { items: Item[]; uoms: Uom[] };

/** Stable empties, so a query with no data yet does not hand out a new `[]`
 *  (and retrigger memos/effects) on every render. */
const EMPTY_ITEMS: Item[] = [];
const EMPTY_UOMS: Uom[] = [];
const EMPTY_NUTRITION: Nutrition[] = [];

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
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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

/* `useClickOutside` is gone with the two popovers it served — the units
   manager and the row kebab are a Dialog and two inline buttons now, and
   `ui/dialog` owns outside-click and Escape for the one that still needs it. */

/* The local `Field` wrapper is gone: `ui/form`'s does the same job and also
   wires `htmlFor`/`id` and `aria-describedby`, which this one did not. */

/* ── Unit pills + the units manager ───────────────────────────────────────── */

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
  /** The unit a delete has been asked about. It used to just happen. */
  const [confirmDelete, setConfirmDelete] = useState<Uom | null>(null);

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

  const remove = async () => {
    const target = confirmDelete;
    if (!target) return;
    setConfirmDelete(null);
    const ok = await uomApi.remove(target.id);
    if (ok && value === target.id) {
      const fallback = uoms.find((u) => u.id !== target.id);
      if (fallback) onChange(fallback.id);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {uoms.map((uom) => (
        <button
          key={uom.id}
          type="button"
          title={uom.uom_name}
          onClick={() => onChange(uom.id)}
          /* A unit chip. Hand-rolled with the DESIGN_SYSTEM 1.1 reset because
             it is a compact toggle inside a form row, not an action. */
          className={cn(
            "cursor-pointer appearance-none rounded-full border px-2.5 py-0.5 text-[12px] [font-family:inherit] transition-colors",
            value === uom.id
              ? "border-brand-line bg-brand text-white"
              : "border-line bg-card text-body hover:border-line-strong hover:bg-surface",
          )}
        >
          {uom.uom_unit}
        </button>
      ))}

      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label="Manage units"
        onClick={() => setOpen(true)}
      >
        <HiOutlinePlus />
      </Button>

      {/*
        A DIALOG, not the popover this replaces.

        It creates, renames and deletes units — a small piece of CRUD rather
        than a form control — and a popover gave it none of the focus trap,
        Escape handling or scroll lock that a thing with its own delete button
        deserves. It also needed a `useClickOutside` ref, which this does not.
      */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            setEditId(null);
          }
        }}
      >
        {open && (
          <DialogContent title="Units" size="sm">
            <DialogHeader className="items-start">
              <div className="min-w-0">
                <DialogTitle>Units of measure</DialogTitle>
                <DialogDescription>
                  Used by every nutrition row. Renaming one updates it everywhere.
                </DialogDescription>
              </div>
            </DialogHeader>

            <DialogBody className="space-y-3">
              {uoms.length === 0 ? (
                <p className="m-0 rounded-sm border border-line bg-surface px-3 py-4 text-center text-[12px] text-subtle">
                  No units yet.
                </p>
              ) : (
                <ul className="m-0 max-h-[280px] list-none divide-y divide-line overflow-y-auto rounded-sm border border-line p-0">
                  {uoms.map((uom) =>
                    editId === uom.id ? (
                      <li className="flex items-center gap-1.5 p-2" key={uom.id}>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Name"
                          aria-label={"Rename " + uom.uom_name}
                          className="h-control-sm flex-1"
                        />
                        <Input
                          value={editUnit}
                          onChange={(e) => setEditUnit(e.target.value)}
                          placeholder="Unit"
                          aria-label={"Unit symbol for " + uom.uom_name}
                          className="h-control-sm w-20"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Save unit"
                          disabled={!editName.trim() || !editUnit.trim()}
                          onClick={saveEdit}
                        >
                          <HiOutlineCheck />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Cancel"
                          onClick={() => setEditId(null)}
                        >
                          <HiOutlineXMark />
                        </Button>
                      </li>
                    ) : (
                      <li className="flex items-center gap-2 p-2 text-[13px]" key={uom.id}>
                        <span className="shrink-0 rounded-full bg-surface-strong px-2 py-0.5 font-mono text-[11px] text-ink">
                          {uom.uom_unit}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-body">{uom.uom_name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={"Edit " + uom.uom_name}
                          onClick={() => startEdit(uom)}
                        >
                          <HiOutlinePencilSquare />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={"Delete " + uom.uom_name}
                          onClick={() => setConfirmDelete(uom)}
                        >
                          <HiOutlineTrash />
                        </Button>
                      </li>
                    ),
                  )}
                </ul>
              )}

              <div className="flex items-end gap-1.5 border-t border-line pt-3">
                <Field label="Name" className="flex-1">
                  {(control) => (
                    <Input
                      {...control}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Calorie"
                      className="h-control-sm"
                      onKeyDown={(e) => e.key === "Enter" && submitNew()}
                    />
                  )}
                </Field>
                <Field label="Unit" className="w-24">
                  {(control) => (
                    <Input
                      {...control}
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="kcal"
                      className="h-control-sm"
                      onKeyDown={(e) => e.key === "Enter" && submitNew()}
                    />
                  )}
                </Field>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={submitNew}
                  disabled={!name.trim() || !unit.trim() || busy}
                  title={
                    !name.trim() || !unit.trim() ? "Give the unit a name and a symbol." : undefined
                  }
                >
                  Add
                </Button>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(next) => {
          if (!next) setConfirmDelete(null);
        }}
      >
        {confirmDelete && (
          <DialogContent title="Delete unit" size="sm">
            <DialogHeader>
              <DialogTitle>Delete {confirmDelete.uom_name}?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Notice tone="hold">
                Any nutrition row measured in{" "}
                <strong className="font-semibold">{confirmDelete.uom_unit}</strong> loses its unit.
                This cannot be undone, though the unit can be created again.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => void remove()}>
                Delete unit
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/* ── Row actions ──────────────────────────────────────────────────────────── */

/**
 * Edit and delete, as two buttons rather than a kebab menu.
 *
 * The menu was a popover with its own open state and a `useClickOutside` ref,
 * for two items. Every other table in the app puts its row actions inline as
 * ghost icon buttons; matching that costs one click less and no state at all.
 */
function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="flex justify-end gap-0.5">
      <Button variant="ghost" size="icon" aria-label="Edit row" onClick={onEdit}>
        <HiOutlinePencilSquare />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Delete row" onClick={onDelete}>
        <HiOutlineTrash />
      </Button>
    </span>
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
    <div className="space-y-4 rounded-md border border-brand-line bg-brand-soft/30 p-4">
      <FormGrid>
        <Field label="Nutrient" required>
          {(control) => (
            <Input
              {...control}
              autoFocus
              value={draft.nutrition_name}
              onChange={(e) => setDraft({ ...draft, nutrition_name: e.target.value })}
              placeholder="e.g. Energy"
            />
          )}
        </Field>
        <Field label="Per serving">
          {(control) => (
            <Input
              {...control}
              type="number"
              step="any"
              value={draft.per_serving}
              onChange={(e) => setDraft({ ...draft, per_serving: e.target.value })}
              placeholder="0"
              className="text-right tabular-nums"
            />
          )}
        </Field>
        <Field label="Per 100g">
          {(control) => (
            <Input
              {...control}
              type="number"
              step="any"
              value={draft.per_100gm}
              onChange={(e) => setDraft({ ...draft, per_100gm: e.target.value })}
              placeholder="0"
              className="text-right tabular-nums"
            />
          )}
        </Field>
      </FormGrid>

      {/* The unit picker keeps its own markup: it is a popover that also
          CREATES and renames units, which is a small application rather than
          a form control. See the note at the top of the file. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-body">Unit</span>
        <UomToggle
          uoms={uoms}
          value={draft.uom}
          onChange={(id) => setDraft({ ...draft, uom: id })}
          api={uomApi}
        />
      </div>

      <FormActions className="pt-3">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!valid || busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </FormActions>
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

  const blankDraft: Draft = {
    nutrition_name: "",
    per_serving: "",
    per_100gm: "",
    uom: uoms[0]?.id ?? null,
  };
  const draftFor = (row: Nutrition): Draft => ({
    nutrition_name: row.nutrition_name,
    per_serving: String(row.per_serving ?? ""),
    per_100gm: String(row.per_100gm ?? ""),
    uom: row.uom,
  });

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table density="compact">
          <TableHeader>
            <TableRow className="bg-surface hover:bg-surface">
              <TableHead>Nutrient</TableHead>
              <TableHead className="text-right">Per serving</TableHead>
              <TableHead className="text-right">Per 100g</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && editing !== "new" ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-subtle">
                  No nutrition data yet. Add the first row below.
                </TableCell>
              </TableRow>
            ) : null}

            {rows.map((row) =>
              // Editing replaces the row IN PLACE, spanning every column —
              // the numbers being corrected stay where they were rather than
              // the form appearing somewhere else on the page.
              editing === row.id ? (
                <TableRow key={row.id}>
                  <TableCell colSpan={5} className="p-2">
                    <NutritionForm
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
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-ink">{row.nutrition_name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(row.per_serving)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(row.per_100gm)}
                  </TableCell>
                  <TableCell>
                    <Badge tone="neutral">{uomUnit(row.uom)}</Badge>
                  </TableCell>
                  <TableCell>
                    <RowMenu
                      onEdit={() => setEditing(row.id)}
                      onDelete={() => onDelete(row.id)}
                    />
                  </TableCell>
                </TableRow>
              ),
            )}

            {editing === "new" ? (
              <TableRow>
                <TableCell colSpan={5} className="p-2">
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
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {editing !== "new" ? (
        <Button variant="ghost" block onClick={() => setEditing("new")}>
          <HiOutlinePlus aria-hidden="true" /> Add row
        </Button>
      ) : null}
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
    const ok =
      modal.mode === "add" ? await onAdd(name.trim()) : await onUpdate(modal.id, name.trim());
    setBusy(false);
    if (ok) setModal(null);
  };

  return (
    <>
      {/* The list SCROLLS and sticks, so a long catalogue does not push the
          nutrition table it is meant to sit beside off the bottom of the page.
          `min-h-0` on the scroller is load-bearing — a flex child defaults to
          `min-height: auto`, i.e. "as tall as my content", so without it the
          overflow never engages. */}
      <Card className="flex flex-col p-0 lg:sticky lg:top-[74px] lg:max-h-[calc(100svh-104px)]">
        <CardHeader className="shrink-0 px-4 pt-4">
          <CardTitle>Items</CardTitle>
          <Button size="sm" variant="ghost" onClick={openAdd}>
            <HiOutlinePlus aria-hidden="true" /> Add item
          </Button>
        </CardHeader>

        <div className="shrink-0 px-4 pb-3">
          <Field label="Search items" className="[&>label]:sr-only">
            {(control) => (
              <Input
                {...control}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items"
                className="h-control-sm"
              />
            )}
          </Field>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={HiOutlineMagnifyingGlass}
            title={search ? "No matches" : "No items yet"}
            hint={
              search
                ? "Nothing here matches that search."
                : "Add an item to record its nutrition panel."
            }
          />
        ) : (
          <ul className="m-0 min-h-0 flex-1 list-none divide-y divide-line overflow-y-auto border-t border-line p-0">
            {filtered.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 transition-colors",
                  item.id === selectedId && "bg-brand-soft/50",
                )}
              >
                <Button
                  variant="ghost"
                  onClick={() => onSelect(item.id)}
                  aria-current={item.id === selectedId ? "true" : undefined}
                  className="h-auto min-w-0 flex-1 flex-col items-start gap-0.5 px-2 py-1.5 text-left"
                >
                  <span className="w-full truncate text-[13px] font-semibold text-ink">
                    {item.item_name}
                  </span>
                  {item.created_at ? (
                    <span className="text-[11.5px] font-normal text-subtle">
                      {formatDate(item.created_at)}
                    </span>
                  ) : null}
                </Button>
                <RowMenu onEdit={() => openEdit(item)} onDelete={() => onDelete(item.id)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={Boolean(modal)}
        onOpenChange={(next) => {
          if (!next && !busy) setModal(null);
        }}
      >
        {modal ? (
          <DialogContent
            title={modal.mode === "add" ? "New item" : "Rename item"}
            size="sm"
            className="max-w-[420px]"
          >
            <DialogHeader>
              <DialogTitle>
                {modal.mode === "add" ? "New item" : "Rename item"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Field
                label="Item name"
                required
                hint="The name the label checker compares nutrition against."
              >
                {(control) => (
                  <Input
                    {...control}
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="e.g. Jivo Canola Oil 1 Ltr"
                  />
                )}
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setModal(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} disabled={!name.trim() || busy}>
                {busy ? "Saving…" : modal.mode === "add" ? "Add item" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────────────── */

export default function NutritionManager() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Items + units — one query, mirroring the original `Promise.all`: either
  // both arrive or, on a failure, neither does.
  const {
    data: catalog,
    isError: catalogFailed,
  } = useQuery<Catalog>({
    queryKey: ["legal", "items-uoms"],
    queryFn: async () => {
      const [itemsRes, uomsRes] = await Promise.all([api.get(ITEM_URL), api.get(UOM_URL)]);
      return { items: asArray<Item>(itemsRes.data), uoms: asArray<Uom>(uomsRes.data) };
    },
  });
  const items = catalog?.items ?? EMPTY_ITEMS;
  const uoms = catalog?.uoms ?? EMPTY_UOMS;

  /* Re-seed during render, never in an effect: the `seededFrom` identity guard
   * (same shape as Order_Flow_Settings' `config` adoption) fires once per new
   * catalog snapshot, and only picks a default when nothing is selected yet —
   * so it reproduces the old mount-effect's one-time auto-select without an
   * effect, and still recovers a default if the first load came back empty. */
  const [seededFrom, setSeededFrom] = useState<Catalog | undefined>(undefined);
  if (catalog && catalog !== seededFrom) {
    setSeededFrom(catalog);
    if (selectedId === null && catalog.items.length) setSelectedId(catalog.items[0].id);
  }

  // Nutrition facts for the selected item — fetched from the dedicated endpoint
  // (/legal/item-nutrition/?item_id=…) whenever the selection changes.
  const {
    data: rowsData,
    isFetching: rowsLoading,
    isError: rowsFailed,
  } = useQuery<Nutrition[]>({
    queryKey: ["legal", "nutrition", selectedId],
    queryFn: async () => {
      const { data } = await api.get(ITEM_NUTRITION_URL, { params: { item_id: selectedId } });
      return data && Array.isArray((data as { nutritional_facts?: unknown }).nutritional_facts)
        ? (data as { nutritional_facts: Nutrition[] }).nutritional_facts
        : asArray<Nutrition>(data);
    },
    enabled: selectedId != null,
  });
  const rows = rowsData ?? EMPTY_NUTRITION;

  const loadError = catalogFailed
    ? "Unable to load nutrition data."
    : rowsFailed
      ? "Unable to load nutrition facts."
      : "";

  const selectedItem = items.find((it) => it.id === selectedId) ?? null;

  /* Items — POST / PATCH /:id/ / DELETE /:id/. Each patches the shared
     ["legal","items-uoms"] cache directly — the local patch IS the
     persistence, same as it was against `setItems`/`setUoms`. */
  const patchCatalog = (updater: (base: Catalog) => Catalog) =>
    queryClient.setQueryData<Catalog>(["legal", "items-uoms"], (prev) =>
      updater(prev ?? { items: EMPTY_ITEMS, uoms: EMPTY_UOMS }),
    );

  const addItem = async (item_name: string): Promise<boolean> => {
    try {
      const { data } = await api.post<Item>(ITEM_URL, { item_name });
      patchCatalog((base) => ({ ...base, items: [data, ...base.items] }));
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
      patchCatalog((base) => ({ ...base, items: base.items.map((it) => (it.id === id ? data : it)) }));
      return true;
    } catch (err) {
      setError(errMessage(err, "Could not rename the item."));
      return false;
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await api.delete(`${ITEM_URL}${id}/`);
      patchCatalog((base) => ({ ...base, items: base.items.filter((it) => it.id !== id) }));
      setSelectedId((curr) =>
        curr === id ? (items.find((it) => it.id !== id)?.id ?? null) : curr,
      );
    } catch (err) {
      setError(errMessage(err, "Could not delete the item."));
    }
  };

  /* Units — POST / PATCH /:id/ / DELETE /:id/ */
  const createUom = async (uom_name: string, uom_unit: string): Promise<Uom | null> => {
    try {
      const { data } = await api.post<Uom>(UOM_URL, { uom_name, uom_unit });
      patchCatalog((base) => ({ ...base, uoms: [...base.uoms, data] }));
      return data;
    } catch (err) {
      setError(errMessage(err, "Could not add the unit."));
      return null;
    }
  };

  const updateUom = async (id: number, uom_name: string, uom_unit: string): Promise<boolean> => {
    try {
      const { data } = await api.patch<Uom>(`${UOM_URL}${id}/`, { uom_name, uom_unit });
      patchCatalog((base) => ({ ...base, uoms: base.uoms.map((u) => (u.id === id ? data : u)) }));
      return true;
    } catch (err) {
      setError(errMessage(err, "Could not update the unit."));
      return false;
    }
  };

  const deleteUom = async (id: number): Promise<boolean> => {
    try {
      await api.delete(`${UOM_URL}${id}/`);
      patchCatalog((base) => ({ ...base, uoms: base.uoms.filter((u) => u.id !== id) }));
      return true;
    } catch (err) {
      setError(errMessage(err, "Could not delete the unit."));
      return false;
    }
  };

  const uomApi: UomApi = { create: createUom, update: updateUom, remove: deleteUom };

  /* Nutrition — POST / PATCH /:id/ / DELETE /:id/. Patches the
     ["legal","nutrition",selectedId] cache the same way the catalogue
     mutations patch ["legal","items-uoms"] above. */
  const patchRows = (updater: (base: Nutrition[]) => Nutrition[]) =>
    queryClient.setQueryData<Nutrition[]>(["legal", "nutrition", selectedId], (prev) =>
      updater(prev ?? EMPTY_NUTRITION),
    );

  const addNutrition = async (payload: NutritionPayload): Promise<boolean> => {
    try {
      const { data } = await api.post<Nutrition>(NUTRITION_URL, payload);
      patchRows((base) => [...base, data]);
      return true;
    } catch (err) {
      setError(errMessage(err, "Could not add the nutrition row."));
      return false;
    }
  };

  const updateNutrition = async (id: number, payload: NutritionPayload): Promise<boolean> => {
    try {
      const { data } = await api.patch<Nutrition>(`${NUTRITION_URL}${id}/`, payload);
      patchRows((base) => base.map((n) => (n.id === id ? data : n)));
      return true;
    } catch (err) {
      setError(errMessage(err, "Could not update the nutrition row."));
      return false;
    }
  };

  const deleteNutrition = async (id: number) => {
    // Optimistic, matching the original: the row is gone from the cache
    // immediately, with no rollback if the request then fails.
    patchRows((base) => base.filter((n) => n.id !== id));
    try {
      await api.delete(`${NUTRITION_URL}${id}/`);
    } catch (err) {
      setError(errMessage(err, "Could not delete the row."));
    }
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Legal" }, { label: "Nutrition Manager" }]} />

      <PageHeader
        title="Nutrition Manager"
        description="The nutrition panel the Label Checker compares a label against. One record per item; the units are shared across all of them."
      />

      {error || loadError ? (
        <Notice tone="bad" title="Something went wrong">
          {error || loadError}
        </Notice>
      ) : null}

      {/* Master on the left, one item on the right — the same shape as
          Compliance Rules, and for the same reason: you pick from a list and
          edit one thing beside it. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr] lg:items-start">
        <ItemSelector
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={addItem}
          onUpdate={updateItem}
          onDelete={deleteItem}
        />

        <Card>
          {selectedItem ? (
            <>
              <CardHeader>
                <CardTitle>{selectedItem.item_name}</CardTitle>
                <Badge tone="neutral">
                  {rowsLoading
                    ? "Loading…"
                    : `${rows.length} ${rows.length === 1 ? "nutrient" : "nutrients"}`}
                </Badge>
              </CardHeader>
              {rowsLoading ? (
                <div className="space-y-2" role="status" aria-live="polite">
                  <span className="sr-only">Loading nutrition</span>
                  {[0, 1, 2].map((row) => (
                    <Skeleton key={row} className="h-10 w-full" />
                  ))}
                </div>
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
            </>
          ) : (
            <EmptyState
              icon={HiOutlineBeaker}
              title="Nothing selected"
              hint="Pick an item on the left to view and edit its nutrition data."
            />
          )}
        </Card>
      </div>
    </Page>
  );
}
