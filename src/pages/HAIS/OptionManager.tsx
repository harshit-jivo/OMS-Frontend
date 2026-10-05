/**
 * Generic master-data screen: lists every value from a DB dropdown table and
 * lets the user add a new one. Input is forced to CAPITAL letters as you type,
 * matching how the values are stored.
 *
 * For Asset Types it also carries the per-type FIELD PICKER: the admin ticks
 * which asset-creation fields that type shows, and the choice is saved as the
 * type's `field_config`. That is how a Laptop shows RAM/SSD while a Keyboard
 * shows none — all controlled here, no DB change.
 */
import { useEffect, useState } from "react";
import { HiOutlineArrowUturnLeft, HiOutlineCheck, HiOutlinePencilSquare, HiOutlinePlus } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, EmptyState, SectionHeading } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { type HaisOption } from "../../services/haisService";

import {
  ALL_ASSET_FIELD_KEYS,
  ASSET_FIELD_GROUPS,
  type AssetFieldKey,
} from "./assetShared";
import { NOTE } from "./assetTone";

type Props = {
  /** Plural title, e.g. "Departments". */
  title: string;
  /** Singular label, e.g. "Department". */
  singular: string;
  /** Load all rows from the DB master. */
  load: () => Promise<HaisOption[]>;
  /** Create a new row (name is stored in CAPITALS by the service). `fields` is
   *  the per-type field list, sent only for Asset Types. */
  create: (name: string, fields?: string[]) => Promise<HaisOption>;
  /** Update an existing row. When present, each row gets an Edit action. */
  update?: (id: number, name: string, fields?: string[]) => Promise<HaisOption>;
  /** Asset Types only: show the per-type field picker + a "Fields" column. */
  fieldPicker?: boolean;
};

export default function OptionManager({ title, singular, load, create, update, fieldPicker }: Props) {
  const [rows, setRows] = useState<HaisOption[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  // The row being edited (null = the form is adding a new row).
  const [editingId, setEditingId] = useState<number | null>(null);
  // Field picker (Asset Types only). New types start with EVERY field ticked.
  const [selected, setSelected] = useState<Set<AssetFieldKey>>(
    () => new Set(ALL_ASSET_FIELD_KEYS),
  );

  useEffect(() => {
    let alive = true;
    load()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setLoadError(`Could not load ${title} from the server.`))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load, title]);

  const toggleField = (key: AssetFieldKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setSelected(new Set(ALL_ASSET_FIELD_KEYS));
    setError("");
  };

  // Load a row into the form for editing. Empty field_config = "all fields".
  const startEdit = (row: HaisOption) => {
    setEditingId(row.id);
    setName(row.name);
    setSelected(
      new Set(row.field_config && row.field_config.length ? (row.field_config as AssetFieldKey[]) : ALL_ASSET_FIELD_KEYS),
    );
    setError("");
  };

  const save = async () => {
    const value = name.trim().toUpperCase();
    setError("");
    if (!value) {
      setError(`${singular} name is required.`);
      return;
    }
    // A duplicate name is only a problem against OTHER rows, not the one we edit.
    if (rows.some((r) => r.name.toUpperCase() === value && r.id !== editingId)) {
      setError(`"${value}" already exists.`);
      return;
    }
    setBusy(true);
    try {
      // For asset types, send the ticked fields in catalogue order. For the
      // other masters, `fieldPicker` is off and no field list is sent.
      const fields = fieldPicker ? ALL_ASSET_FIELD_KEYS.filter((k) => selected.has(k)) : undefined;
      if (editingId != null && update) {
        await update(editingId, value, fields);
        showToast({ title: `${singular} updated`, message: value });
      } else {
        await create(value, fields);
        showToast({ title: `${singular} added`, message: value });
      }
      resetForm();
      setRows(await load());
    } catch (err) {
      showToast({
        title: `Could not save the ${singular.toLowerCase()}`,
        message: messageFrom(err, "The server refused the request."),
      });
    } finally {
      setBusy(false);
    }
  };

  const example =
    singular === "Department" ? "ACCOUNTS" : singular === "Storage Type" ? "SSD" : "LAPTOP";

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <Field
              label={editingId != null ? `Edit ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}
              hint={error ? undefined : "Stored in CAPITAL letters"}
              error={error || undefined}
              className="min-w-[240px] max-w-[420px] flex-1"
            >
              {(c) => (
                <Input
                  {...c}
                  value={name}
                  // Force uppercase as the user types.
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder={`e.g. ${example}`}
                  autoComplete="off"
                />
              )}
            </Field>
            {/* The field always has a line under it (hint or error), so the
                button sits on the control, not the caption. */}
            <Button type="submit" variant="primary" disabled={busy} className="mb-[21px]">
              {editingId != null ? (
                <>
                  <HiOutlineCheck aria-hidden="true" /> {busy ? "Saving…" : `Update ${singular.toLowerCase()}`}
                </>
              ) : (
                <>
                  <HiOutlinePlus aria-hidden="true" /> {busy ? "Adding…" : `Add ${singular.toLowerCase()}`}
                </>
              )}
            </Button>
            {editingId != null && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                className="mb-[21px]"
                onClick={resetForm}
              >
                <HiOutlineArrowUturnLeft className="text-warning" aria-hidden="true" /> Cancel
              </Button>
            )}
          </div>

          {fieldPicker && (
            <fieldset className="space-y-4 border-t border-line pt-4">
              <div>
                <SectionHeading>Fields shown when creating this asset</SectionHeading>
                <p className={`${NOTE} mt-1`}>
                  Tick the fields this type needs. Serial number, asset type and working status are
                  always shown. e.g. a Laptop keeps Processor / RAM / Storage; a Keyboard can turn
                  them off.
                </p>
              </div>
              {ASSET_FIELD_GROUPS.map((g) => (
                <div key={g.group} className="space-y-2">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-subtle">
                    {g.group}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    {g.fields.map((f) => (
                      <Checkbox
                        key={f.key}
                        label={f.label}
                        checked={selected.has(f.key)}
                        onChange={() => toggleField(f.key)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          )}
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 border-b border-line px-4 py-3">
          <CardTitle>
            {title}{" "}
            <span className="font-medium text-subtle">{loading ? "" : `(${rows.length})`}</span>
          </CardTitle>
        </CardHeader>
        {loading ? (
          <TableSkeleton rows={4} columns={fieldPicker ? 4 : 3} />
        ) : loadError ? (
          <EmptyState title={`Could not load ${title.toLowerCase()}`} hint={loadError} />
        ) : rows.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()} yet`} hint="Add one above." />
        ) : (
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>{singular}</TableHead>
                {fieldPicker && <TableHead className="w-48">Fields shown</TableHead>}
                {update && <TableHead className="w-px text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id} className={editingId === r.id ? "bg-brand-soft" : undefined}>
                  <TableCell className="text-subtle">{i + 1}</TableCell>
                  <TableCell className="font-medium text-ink">{r.name}</TableCell>
                  {fieldPicker && (
                    <TableCell>
                      {!r.field_config || r.field_config.length === 0 ? (
                        <Badge tone="neutral">All fields</Badge>
                      ) : (
                        <Badge tone="info">
                          {r.field_config.length} of {ALL_ASSET_FIELD_KEYS.length} fields
                        </Badge>
                      )}
                    </TableCell>
                  )}
                  {update && (
                    <TableCell className="w-px text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={`Edit ${r.name}`}
                        aria-label={`Edit ${r.name}`}
                        onClick={() => startEdit(r)}
                      >
                        <HiOutlinePencilSquare className="text-ok" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
