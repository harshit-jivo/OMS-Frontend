/**
 * Tracker configuration — stages, dropdown values, stage access, and the
 * tracker's own user accounts. Four tabs, one per thing an admin changes.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineCheck,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox, Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Page, PageHeader } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { cn } from "@/lib/utils";
import { TRACKER_ROLE_LABELS } from "../config/pageAccess";
import trackerService from "../services/trackerService";
import type { AdminUser, LookupKind, LookupRow, Stage, TrackerUser } from "../services/trackerService";

type TabKey = "stages" | "lookups" | "access" | "users";

/** What a tab reports back. Two arguments so a failure can name its reason. */
type Flash = (title: string, message?: string) => void;

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

const TABS: { key: TabKey; label: string }[] = [
  { key: "stages", label: "Stages" },
  { key: "lookups", label: "Lookups" },
  { key: "access", label: "Stage Access" },
  { key: "users", label: "Tracker Users" },
];

/** A ✓ or an em dash, for the boolean columns. */
function Tick({ on }: { on: boolean }) {
  return on ? (
    <HiOutlineCheck aria-label="yes" className="size-4 text-ok" />
  ) : (
    <span aria-label="no" className="text-subtle">
      —
    </span>
  );
}

export default function Tracker_Admin() {
  const [tab, setTab] = useState<TabKey>("stages");
  const flash: Flash = (title, message = "") => showToast({ title, message });

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Tracker" }, { label: "Tracker Admin" }]} />

      <PageHeader
        title="Tracker Admin"
        description="Manage stages, dropdown values, and who works each stage."
      />

      <TabList label="Configuration sections">
        {TABS.map((t) => (
          <Tab key={t.key} selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Tab>
        ))}
      </TabList>

      <div role="tabpanel">
        {tab === "stages" && <StagesTab flash={flash} />}
        {tab === "lookups" && <LookupsTab flash={flash} />}
        {tab === "access" && <AccessTab flash={flash} />}
        {tab === "users" && <UsersTab flash={flash} />}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
function StagesTab({ flash }: { flash: Flash }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<Stage> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Stage | null>(null);

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
      flash("Stage saved", editing.name || "");
      void load();
    } catch (err) {
      flash("Could not save the stage", messageFrom(err, "The server refused the request."));
    }
  };

  const remove = async (s: Stage) => {
    try {
      await trackerService.adminDeleteStage(s.id);
      setConfirmDelete(null);
      flash("Stage deleted", s.name);
      void load();
    } catch (err) {
      flash("Could not delete the stage", messageFrom(err, "The server refused the request."));
    }
  };

  return (
    <>
      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 border-b border-line px-4 py-3">
          <CardTitle>Stages ({stages.length})</CardTitle>
          <Button
            size="xs"
            variant="primary"
            onClick={() => setEditing({ ...EMPTY_STAGE, order: stages.length + 1 })}
          >
            <HiOutlinePlus aria-hidden="true" /> Add stage
          </Button>
        </CardHeader>

        <div className="overflow-x-auto">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Statuses</TableHead>
                <TableHead>Req. status</TableHead>
                <TableHead>Can return</TableHead>
                <TableHead>Terminal</TableHead>
                <TableHead className="text-right">Threshold (days)</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.length === 0 ? (
                <TableEmpty colSpan={10}>No stages configured yet.</TableEmpty>
              ) : (
                stages.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-right tabular-nums">{s.order}</TableCell>
                    <TableCell className="font-medium text-ink">{s.name}</TableCell>
                    <TableCell>
                      <code className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[11.5px]">
                        {s.code}
                      </code>
                    </TableCell>
                    <TableCell>
                      {s.status_choices.length ? s.status_choices.join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <Tick on={s.requires_status} />
                    </TableCell>
                    <TableCell>
                      <Tick on={s.can_return} />
                    </TableCell>
                    <TableCell>
                      <Tick on={s.is_terminal} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.threshold_days}</TableCell>
                    <TableCell>
                      <Badge tone={s.is_active ? "ok" : "neutral"} outlined>
                        {s.is_active ? "Active" : "Off"}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-px">
                      <div className="flex flex-nowrap justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit stage ${s.name}`}
                          title="Edit stage"
                          onClick={() => setEditing({ ...s })}
                        >
                          <HiOutlinePencilSquare aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-danger hover:bg-danger-soft hover:text-danger"
                          aria-label={`Delete stage ${s.name}`}
                          title="Delete stage"
                          onClick={() => setConfirmDelete(s)}
                        >
                          <HiOutlineTrash aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(next) => !next && setEditing(null)}>
        {editing && (
          <DialogContent title="Stage" size="lg">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit stage" : "New stage"}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <FormGrid>
                <Field label="Name">
                  {(c) => (
                    <Input
                      {...c}
                      value={editing.name || ""}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Code" hint="The unique key the flow refers to this stage by.">
                  {(c) => (
                    <Input
                      {...c}
                      value={editing.code || ""}
                      onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Order">
                  {(c) => (
                    <Input
                      {...c}
                      type="number"
                      value={editing.order ?? 1}
                      onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })}
                    />
                  )}
                </Field>
                <Field label="Threshold days" hint="Past this, an invoice shows as stuck.">
                  {(c) => (
                    <Input
                      {...c}
                      type="number"
                      value={editing.threshold_days ?? 3}
                      onChange={(e) =>
                        setEditing({ ...editing, threshold_days: Number(e.target.value) })
                      }
                    />
                  )}
                </Field>
                <Field
                  label="Status choices"
                  hint="Comma-separated, e.g. OK, HOLD, DEBIT, RETURN."
                  span="full"
                >
                  {(c) => (
                    <Input
                      {...c}
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
                  )}
                </Field>
                <div className="col-span-full grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                  <Checkbox
                    label="Requires status"
                    checked={!!editing.requires_status}
                    onChange={(e) => setEditing({ ...editing, requires_status: e.target.checked })}
                  />
                  <Checkbox
                    label="Can return"
                    checked={!!editing.can_return}
                    onChange={(e) => setEditing({ ...editing, can_return: e.target.checked })}
                  />
                  <Checkbox
                    label="Terminal (payment)"
                    checked={!!editing.is_terminal}
                    onChange={(e) => setEditing({ ...editing, is_terminal: e.target.checked })}
                  />
                  <Checkbox
                    label="Active"
                    checked={editing.is_active ?? true}
                    onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                  />
                </div>
              </FormGrid>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => void save()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(next) => !next && setConfirmDelete(null)}
      >
        {confirmDelete && (
          <DialogContent title="Delete stage" size="sm">
            <DialogHeader>
              <DialogTitle>Delete {confirmDelete.name}?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="m-0 text-[13px] text-body">
                Invoices that have passed through this stage keep their history, but nothing can be
                routed to it again.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => void remove(confirmDelete)}>
                <HiOutlineTrash aria-hidden="true" /> Delete stage
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
function LookupsTab({ flash }: { flash: Flash }) {
  const [kind, setKind] = useState<LookupKind>("categories");
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [draft, setDraft] = useState<Partial<LookupRow>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<LookupRow | null>(null);
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
      .catch(() => flash("Could not load the values"));
  // Only the fetch is left here. Clearing the draft belongs to the tab click
  // that changes `kind` (see `selectKind`) — done in the effect it reset the
  // form one render after the new tab had already drawn with the old one.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const canAdd = isRate ? Boolean(draft.label) && draft.rate !== "" : Boolean(draft.name);

  const add = async () => {
    try {
      await trackerService.adminCreateLookup(kind, draft);
      setDraft({});
      setShowAdd(false);
      flash(`${kindLabel} added`);
      load();
    } catch (err) {
      flash(`Could not add the ${kindLabel.toLowerCase()}`, messageFrom(err, "The server refused the request."));
    }
  };
  const update = async (row: LookupRow) => {
    try {
      await trackerService.adminUpdateLookup(kind, row.id, row);
      flash("Saved", row.name ?? row.label ?? "");
      load();
    } catch (err) {
      flash("Could not save", messageFrom(err, "The server refused the request."));
    }
  };
  const remove = async (row: LookupRow) => {
    try {
      await trackerService.adminDeleteLookup(kind, row.id);
      setConfirmDelete(null);
      flash("Deleted", row.name ?? row.label ?? "");
      load();
    } catch (err) {
      flash("Could not delete", messageFrom(err, "The server refused the request."));
    }
  };
  const patchRow = (id: number, patch: Partial<LookupRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabList label="Lookup kinds" className="flex-wrap">
          {LOOKUP_KINDS.map((k) => (
            <Tab
              key={k.kind}
              variant="subtle"
              selected={kind === k.kind}
              onClick={() => selectKind(k.kind)}
            >
              {k.label}
            </Tab>
          ))}
        </TabList>
        <Button variant="primary" onClick={openAdd}>
          <HiOutlinePlus aria-hidden="true" /> Add {kindLabel.toLowerCase()}
        </Button>
      </div>

      <Card className="overflow-hidden p-0" role="tabpanel">
        <div className="overflow-x-auto">
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={isRate ? 5 : 4}>
                  No values yet — add the first with the button above.
                </TableEmpty>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    {isRate ? (
                      <>
                        <TableCell>
                          <Input
                            className="h-control-sm"
                            value={r.label}
                            aria-label="Label"
                            onChange={(e) => patchRow(r.id, { label: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-control-sm w-24"
                            type="number"
                            step="0.01"
                            value={r.rate}
                            aria-label="Rate"
                            onChange={(e) => patchRow(r.id, { rate: e.target.value })}
                          />
                        </TableCell>
                      </>
                    ) : (
                      <TableCell>
                        <Input
                          className="h-control-sm"
                          value={r.name}
                          aria-label="Name"
                          onChange={(e) => patchRow(r.id, { name: e.target.value })}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Input
                        className="h-control-sm w-20"
                        type="number"
                        value={r.sort_order}
                        aria-label="Sort order"
                        onChange={(e) => patchRow(r.id, { sort_order: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-brand"
                        checked={r.is_active}
                        aria-label={`Active (${r.name ?? r.label})`}
                        onChange={(e) => patchRow(r.id, { is_active: e.target.checked })}
                      />
                    </TableCell>
                    <TableCell className="w-px">
                      <div className="flex flex-nowrap justify-end gap-1">
                        <Button
                          variant="success"
                          size="xs"
                          aria-label={`Save ${r.name ?? r.label}`}
                          title="Save"
                          onClick={() => void update(r)}
                        >
                          <HiOutlineCheck aria-hidden="true" /> Save
                        </Button>
                        <Button
                          variant="danger"
                          size="xs"
                          aria-label={`Delete ${r.name ?? r.label}`}
                          title="Delete"
                          onClick={() => setConfirmDelete(r)}
                        >
                          <HiOutlineTrash aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={showAdd} onOpenChange={(next) => !next && setShowAdd(false)}>
        {showAdd && (
          <DialogContent title={`Add ${kindLabel}`} size="sm">
            <DialogHeader>
              <DialogTitle>Add {kindLabel.toLowerCase()}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <FormGrid>
                {isRate ? (
                  <>
                    <Field label="Label">
                      {(c) => (
                        <Input
                          {...c}
                          placeholder="e.g. 18%"
                          value={draft.label || ""}
                          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Rate (%)">
                      {(c) => (
                        <Input
                          {...c}
                          type="number"
                          step="0.01"
                          placeholder="18"
                          value={draft.rate || ""}
                          onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
                        />
                      )}
                    </Field>
                  </>
                ) : (
                  <Field label="Name" span="full">
                    {(c) => (
                      <Input
                        {...c}
                        placeholder="New value…"
                        value={draft.name || ""}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                    )}
                  </Field>
                )}
                <Field label="Sort order">
                  {(c) => (
                    <Input
                      {...c}
                      type="number"
                      value={draft.sort_order ?? rows.length}
                      onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
                    />
                  )}
                </Field>
              </FormGrid>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setShowAdd(false)}>Cancel</Button>
              {/* Disabled with a reason, not an alert after the click. */}
              <Button
                variant="primary"
                onClick={() => void add()}
                disabled={!canAdd}
                title={canAdd ? undefined : "Fill in the value first."}
              >
                <HiOutlinePlus aria-hidden="true" /> Add
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(next) => !next && setConfirmDelete(null)}
      >
        {confirmDelete && (
          <DialogContent title="Delete value" size="sm">
            <DialogHeader>
              <DialogTitle>
                Delete {confirmDelete.name ?? confirmDelete.label}?
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="m-0 text-[13px] text-body">
                It disappears from the dropdowns. Invoices already using it keep the value.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => void remove(confirmDelete)}>
                <HiOutlineTrash aria-hidden="true" /> Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage access (user <-> stage matrix)
// ---------------------------------------------------------------------------
function AccessTab({ flash }: { flash: Flash }) {
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
      .catch(() => flash("Could not load the users"));

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      flash("Stage access saved", u.username);
    } catch (err) {
      flash("Could not save the access", messageFrom(err, "The server refused the request."));
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <CardHeader className="mb-0 flex-wrap gap-3 border-b border-line px-4 py-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            loadUsers(search);
          }}
        >
          <Input
            type="search"
            className="h-control-sm w-56"
            placeholder="Search users…"
            aria-label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button size="sm" type="submit">
            Search
          </Button>
        </form>
        <p className="m-0 text-[12.5px] text-subtle">
          Tick the stages each user may see and act on.
        </p>
      </CardHeader>

      <div className="overflow-x-auto">
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              {orderedStages.map((s) => (
                <TableHead key={s.id} title={s.name} className="text-center">
                  {s.name}
                </TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableEmpty colSpan={orderedStages.length + 3}>
                No users match this search.
              </TableEmpty>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <span className="font-medium text-ink">{u.username}</span>
                    <span className="mt-0.5 block text-[11.5px] text-subtle">{u.name}</span>
                  </TableCell>
                  <TableCell>{u.role || "—"}</TableCell>
                  {orderedStages.map((s) => (
                    <TableCell key={s.id} className="text-center">
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-brand"
                        checked={u.stage_ids.includes(s.id)}
                        aria-label={`${u.username} works ${s.name}`}
                        onChange={() => toggle(u.id, s.id)}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="w-px text-right">
                    <Button
                      variant="success"
                      size="xs"
                      disabled={!dirty.has(u.id)}
                      onClick={() => void saveUser(u)}
                    >
                      <HiOutlineCheck aria-hidden="true" /> Save
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
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

function UsersTab({ flash }: { flash: Flash }) {
  const [users, setUsers] = useState<TrackerUser[]>([]);
  const [draft, setDraft] = useState({ ...EMPTY_NEW_USER, is_active: true });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TrackerUser | null>(null);

  const load = () =>
    trackerService
      .adminListTrackerUsers()
      .then(setUsers)
      .catch(() => flash("Could not load the users"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // A new user needs both; an edit keeps the existing password when blank.
  const canSave = Boolean(editingId) || (draft.username.trim() && draft.password.trim());

  const save = async () => {
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
        flash("User updated", draft.username);
      } else {
        await trackerService.adminCreateTrackerUser(draft);
        flash("User created", draft.username);
      }
      resetForm();
      load();
    } catch (err) {
      flash("Could not save the user", messageFrom(err, "The server refused the request."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: TrackerUser) => {
    try {
      const res = await trackerService.adminDeleteTrackerUser(u.id);
      setConfirmDelete(null);
      flash(
        res.deactivated ? "User deactivated" : "User deleted",
        res.deactivated ? `${u.username} has history, so the account was kept but switched off.` : u.username,
      );
      if (editingId === u.id) resetForm();
      load();
    } catch (err) {
      flash("Could not delete the user", messageFrom(err, "The server refused the request."));
    }
  };

  const roleOptions = Object.entries(TRACKER_ROLE_LABELS);

  return (
    <>
      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 border-b border-line px-4 py-3">
          <CardTitle>Tracker users ({users.length})</CardTitle>
          <Button size="xs" variant="primary" onClick={openCreate}>
            <HiOutlinePlus aria-hidden="true" /> Add user
          </Button>
        </CardHeader>

        <div className="overflow-x-auto">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableEmpty colSpan={7}>No tracker users yet.</TableEmpty>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} className={cn(!u.is_active && "opacity-60")}>
                    <TableCell className="font-medium text-ink">{u.username}</TableCell>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>
                      <Badge tone="info" outlined>
                        {u.role_display || TRACKER_ROLE_LABELS[u.role] || u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{u.email || "—"}</TableCell>
                    <TableCell>{u.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge tone={u.is_active ? "ok" : "bad"} outlined>
                        {u.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-px">
                      <div className="flex flex-nowrap justify-end gap-1">
                        <Button variant="ghost" size="xs" onClick={() => startEdit(u)}>
                          <HiOutlinePencilSquare aria-hidden="true" /> Edit
                        </Button>
                        <Button variant="danger" size="xs" onClick={() => setConfirmDelete(u)}>
                          <HiOutlineTrash aria-hidden="true" /> Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={(next) => !next && resetForm()}>
        {showModal && (
          <DialogContent title="Tracker user" size="lg">
            <DialogHeader>
              <DialogTitle>
                {editingId ? `Edit user ${draft.username}` : "Add a tracker user"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <FormGrid>
                <Field label="Username" required={!editingId}>
                  {(c) => (
                    <Input
                      {...c}
                      value={draft.username}
                      disabled={!!editingId}
                      onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Full name">
                  {(c) => (
                    <Input
                      {...c}
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  )}
                </Field>
                <Field
                  label={editingId ? "New password" : "Password"}
                  required={!editingId}
                  hint={editingId ? "Leave blank to keep the current one." : undefined}
                >
                  {(c) => (
                    <Input
                      {...c}
                      type="password"
                      value={draft.password}
                      onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Role">
                  {(c) => (
                    <Select
                      {...c}
                      value={draft.role}
                      onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                    >
                      {roleOptions.map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Email" hint="Optional.">
                  {(c) => (
                    <Input
                      {...c}
                      type="email"
                      value={draft.email}
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Phone" hint="Optional.">
                  {(c) => (
                    <Input
                      {...c}
                      value={draft.phone}
                      onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    />
                  )}
                </Field>
                {editingId && (
                  <Field label="Status">
                    {(c) => (
                      <Select
                        {...c}
                        value={draft.is_active ? "1" : "0"}
                        onChange={(e) => setDraft({ ...draft, is_active: e.target.value === "1" })}
                      >
                        <option value="1">Active</option>
                        <option value="0">Inactive</option>
                      </Select>
                    )}
                  </Field>
                )}
              </FormGrid>
            </DialogBody>
            <DialogFooter>
              <Button onClick={resetForm}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => void save()}
                disabled={saving || !canSave}
                title={canSave ? undefined : "A username and password are required."}
              >
                {editingId ? (
                  <>
                    <HiOutlineCheck aria-hidden="true" /> {saving ? "Saving…" : "Save changes"}
                  </>
                ) : (
                  <>
                    <HiOutlinePlus aria-hidden="true" /> {saving ? "Creating…" : "Create user"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(next) => !next && setConfirmDelete(null)}
      >
        {confirmDelete && (
          <DialogContent title="Delete tracker user" size="sm">
            <DialogHeader>
              <DialogTitle>Delete {confirmDelete.username}?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="m-0 text-[13px] text-body">
                If this user has acted on any invoice the account is deactivated instead, so the
                history keeps its author.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => void remove(confirmDelete)}>
                <HiOutlineTrash aria-hidden="true" /> Delete user
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
