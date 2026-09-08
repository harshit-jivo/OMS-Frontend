/**
 * UI Label Management (admin only).
 *
 * Full CRUD over the dynamic field labels. Creating/renaming/deleting a label
 * refreshes the shared label cache immediately (optimistic) so any open screen —
 * and every client on its next login — reflects the change without a code
 * change or redeploy. `field_key` is set once on create and never editable
 * afterwards: clients depend on it as the stable key.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlinePencilSquare, HiOutlinePlus, HiOutlineTag, HiOutlineTrash } from "react-icons/hi2";

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
import { FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { Checkbox, Field, FieldGroup, FormGrid, Input } from "@/components/ui/form";
import { Card, EmptyState, Notice, Page, PageHeader } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { showToast } from "@/lib/toastStore";
import {
  applyLabelUpdate,
  applyFieldUpdate,
  loadUILabels,
  loadUIFields,
  removeLabel,
  removeField,
  uiLabelAdminService,
  type UILabelRow,
} from "../services/uiConfig";
import { errorBody, fieldError, messageFrom } from "@/lib/apiError";

const DISPLAY_NAME_MAX = 100;
const FIELD_KEY_MAX = 100;
// Keys are stable machine identifiers clients depend on: lowercase, digits, _.
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const LABELS_KEY = ["ui-labels"] as const;
/** One identity for "no rows yet", so the filter memo below settles. */
const NO_LABELS: UILabelRow[] = [];

export default function UILabels() {
  const queryClient = useQueryClient();
  const { data: labels = NO_LABELS, isPending: isLoading } = useQuery({
    queryKey: LABELS_KEY,
    queryFn: uiLabelAdminService.listLabels,
  });

  /**
   * Write the list in the cache.
   *
   * The three CRUD handlers below each patched a local `labels` array so the
   * table updated without a refetch. They still do — the array just lives in
   * the query cache now, which is what makes the patch survive a remount and
   * lets any other reader of this key see it.
   */
  const setLabelRows = (update: (rows: UILabelRow[]) => UILabelRow[]) =>
    queryClient.setQueryData<UILabelRow[]>(LABELS_KEY, (rows) => update(rows ?? []));
  const [search, setSearch] = useState("");

  // Form modal — shared by create ("add") and edit modes.
  const [showForm, setShowForm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editRow, setEditRow] = useState<UILabelRow | null>(null);
  const [fieldKey, setFieldKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  // Field-behaviour flags (apply when the key is an input field, e.g. po_number).
  const [isEnabled, setIsEnabled] = useState(true);
  const [isRequired, setIsRequired] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation.
  const [deleteRow, setDeleteRow] = useState<UILabelRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      normalizedSearch
        ? labels.filter((row) =>
            [row.field_key, row.display_name, row.description]
              .map((value) => String(value ?? "").toLowerCase())
              .some((value) => value.includes(normalizedSearch)),
          )
        : labels,
    [labels, normalizedSearch],
  );

  const openAdd = () => {
    setIsEditMode(false);
    setEditRow(null);
    setFieldKey("");
    setDisplayName("");
    setDescription("");
    setIsActive(true);
    setIsEnabled(true);
    setIsRequired(false);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (row: UILabelRow) => {
    setIsEditMode(true);
    setEditRow(row);
    setFieldKey(row.field_key);
    setDisplayName(row.display_name);
    setDescription(row.description || "");
    setIsActive(row.is_active);
    setIsEnabled(row.is_enabled);
    setIsRequired(row.is_required);
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setIsEditMode(false);
    setEditRow(null);
    setFormError("");
  };

  // Reflect a saved row into the live caches so open screens update now.
  //
  // Labels: inactive → drop so the wording falls back to the hardcoded default.
  // Fields: NEVER drop on inactive — an absent key would make the client fall
  // back to its built-in default (enabled), re-showing a field the admin just
  // turned off. Instead keep the key with the EFFECTIVE flags: inactive OR not
  // enabled ⇒ enabled:false (and a hidden field can't be required). This
  // mirrors the backend /fields/ logic exactly.
  const syncCache = (row: UILabelRow) => {
    if (row.is_active) {
      applyLabelUpdate(row.field_key, row.display_name);
    } else {
      removeLabel(row.field_key);
    }

    const effectiveEnabled = row.is_active && row.is_enabled;
    applyFieldUpdate(row.field_key, {
      label: row.display_name,
      enabled: effectiveEnabled,
      required: effectiveEnabled && row.is_required,
    });

    // Reconcile with the server's canonical maps in the background.
    void loadUILabels(true);
    void loadUIFields(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setFormError("Display Name is required.");
      return;
    }
    if (trimmedName.length > DISPLAY_NAME_MAX) {
      setFormError("Display Name must be at most " + DISPLAY_NAME_MAX + " characters.");
      return;
    }

    // field_key is only validated/sent on create — it is immutable afterwards.
    const trimmedKey = fieldKey.trim();
    if (!isEditMode) {
      if (!trimmedKey) {
        setFormError("Field Key is required.");
        return;
      }
      if (!FIELD_KEY_PATTERN.test(trimmedKey)) {
        setFormError(
          "Field Key must be lowercase letters, digits and underscores, starting with a letter (e.g. price_list).",
        );
        return;
      }
      if (labels.some((row) => row.field_key === trimmedKey)) {
        setFormError('Field Key "' + trimmedKey + '" already exists.');
        return;
      }
    }

    setIsSaving(true);
    setFormError("");
    try {
      if (isEditMode && editRow) {
        const updated = await uiLabelAdminService.updateLabel(editRow.id, {
          display_name: trimmedName,
          description: description.trim(),
          is_active: isActive,
          is_enabled: isEnabled,
          is_required: isRequired,
        });
        setLabelRows((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
        syncCache(updated);
        showToast({
          title: "Label updated",
          message: '"' + updated.field_key + '" is now "' + updated.display_name + '".',
        });
      } else {
        const created = await uiLabelAdminService.createLabel({
          field_key: trimmedKey,
          display_name: trimmedName,
          description: description.trim(),
          is_active: isActive,
          is_enabled: isEnabled,
          is_required: isRequired,
        });
        setLabelRows((rows) => [...rows, created]);
        syncCache(created);
        showToast({
          title: "Label created",
          message: '"' + created.field_key + '" → "' + created.display_name + '".',
        });
      }
      closeForm();
    } catch (error) {
      // Two NAMED fields, in a deliberate order — `messageFrom`'s "first field
      // wins" cannot express that, which is why this one keeps its own read.
      const errors = errorBody(error)?.errors as Record<string, unknown> | undefined;
      const serverMsg = fieldError(errors, "field_key") ?? fieldError(errors, "display_name");
      setFormError(serverMsg || messageFrom(error, "Could not save the label. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    setIsDeleting(true);
    try {
      await uiLabelAdminService.deleteLabel(deleteRow.id);
      setLabelRows((rows) => rows.filter((row) => row.id !== deleteRow.id));
      // Drop from the live caches — clients fall back to the hardcoded default.
      removeLabel(deleteRow.field_key);
      removeField(deleteRow.field_key);
      void loadUILabels(true);
      void loadUIFields(true);
      showToast({
        title: "Label deleted",
        message: '"' + deleteRow.field_key + '" was removed.',
      });
      setDeleteRow(null);
    } catch (error) {
      console.error("Failed to delete label:", error);
      showToast({
        title: "Delete failed",
        message: "Could not delete the label. Please try again.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Administration" }, { label: "UI Labels" }]} />

      <PageHeader
        eyebrow="Administration"
        title="UI Label Management"
        description="Rename field labels shown across web and mobile. Changes apply on each client's next login — no deployment or app rebuild needed."
        actions={
          <Button variant="primary" onClick={openAdd}>
            <HiOutlinePlus aria-hidden="true" />
            Add label
          </Button>
        }
      />

      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Field key, name or description…"
          fieldClassName="min-w-[280px]"
        />
        <FilterCount>
          {filtered.length} label{filtered.length === 1 ? "" : "s"}
          {normalizedSearch ? " of " + labels.length : ""}
        </FilterCount>
      </FilterBar>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <TableSkeleton columns={6} label="Loading labels" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={HiOutlineTag}
            title={search ? "No labels match this search" : "No labels defined"}
            hint={
              search
                ? "Try the field key on its own."
                : "Every field falls back to its built-in wording until a label overrides it."
            }
            action={
              search ? undefined : (
                <Button variant="primary" onClick={openAdd}>
                  <HiOutlinePlus aria-hidden="true" />
                  Add the first label
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Field Key</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Behaviour</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <code className="font-mono text-[12px] text-ink">{row.field_key}</code>
                    </TableCell>
                    <TableCell className="font-semibold text-ink">{row.display_name}</TableCell>
                    <TableCell className="text-subtle">
                      {row.description || <span className="text-subtle">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge tone={row.is_active ? "ok" : "neutral"}>
                        {row.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={row.is_enabled ? "ok" : "neutral"}>
                          {row.is_enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        {row.is_enabled && (
                          <Badge tone={row.is_required ? "hold" : "neutral"}>
                            {row.is_required ? "Required" : "Optional"}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(row)}
                          aria-label={"Edit " + row.field_key}
                        >
                          <HiOutlinePencilSquare />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteRow(row)}
                          aria-label={"Delete " + row.field_key}
                        >
                          <HiOutlineTrash />
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* ── Add / edit ── */}
      <Dialog
        open={showForm}
        onOpenChange={(next) => {
          if (!next) closeForm();
        }}
      >
        {showForm && (
          <DialogContent title="Label form" size="md">
            <DialogHeader>
              <DialogTitle>{isEditMode ? "Edit UI label" : "Add UI label"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => void handleSubmit(e)}>
              <DialogBody className="space-y-4">
                <FormGrid>
                  {/* Field key — editable on create, read-only on edit. */}
                  <Field
                    label="Field key"
                    required={!isEditMode}
                    className="sm:col-span-2"
                    hint={
                      isEditMode
                        ? "Permanent. Clients use this as the stable key, so it cannot be changed."
                        : "Lowercase letters, digits and underscores. Cannot be changed later — clients use this as the stable key."
                    }
                  >
                    {(control) => (
                      <Input
                        {...control}
                        value={fieldKey}
                        onChange={(e) =>
                          setFieldKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))
                        }
                        maxLength={FIELD_KEY_MAX}
                        placeholder="e.g. price_list"
                        readOnly={isEditMode}
                        disabled={isEditMode}
                        autoFocus={!isEditMode}
                        className="font-mono"
                      />
                    )}
                  </Field>

                  <Field
                    label="Display name"
                    required
                    className="sm:col-span-2"
                    hint={displayName.trim().length + " / " + DISPLAY_NAME_MAX}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        maxLength={DISPLAY_NAME_MAX}
                        placeholder="e.g. Distributor Price"
                        required
                        autoFocus={isEditMode}
                      />
                    )}
                  </Field>

                  <Field label="Description" className="sm:col-span-2">
                    {(control) => (
                      <Input
                        {...control}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional note for admins"
                      />
                    )}
                  </Field>
                </FormGrid>

                <Checkbox
                  label="Active"
                  hint="Untick to fall back to the built-in default wording."
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />

                {/* Field behaviour — only meaningful for input-field keys such
                    as po_number. Ignored by pure text labels like price_list. */}
                <FieldGroup
                  legend="Field behaviour"
                  hint="For input fields (e.g. po_number): whether the field shows, and whether it is mandatory. Text-only labels can ignore these."
                >
                  <Checkbox
                    label="Field enabled"
                    hint="Show this field on the form."
                    checked={isEnabled}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setIsEnabled(next);
                      // A hidden field cannot be required.
                      if (!next) setIsRequired(false);
                    }}
                  />
                  <Checkbox
                    label="Field required"
                    hint={
                      isEnabled
                        ? "Mandatory when shown."
                        : "A hidden field cannot be required — enable it first."
                    }
                    checked={isRequired}
                    disabled={!isEnabled}
                    onChange={(e) => setIsRequired(e.target.checked)}
                  />
                </FieldGroup>

                {formError && <Notice tone="bad">{formError}</Notice>}
              </DialogBody>
              <DialogFooter>
                <Button type="button" onClick={closeForm} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : isEditMode ? "Save label" : "Create label"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Delete ── */}
      <Dialog
        open={Boolean(deleteRow)}
        onOpenChange={(next) => {
          if (!next && !isDeleting) setDeleteRow(null);
        }}
      >
        {deleteRow && (
          <DialogContent title="Delete label" size="sm">
            <DialogHeader>
              <DialogTitle>Delete {deleteRow.display_name}?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Notice tone="hold">
                Every client falls back to the built-in wording for{" "}
                <code className="font-mono">{deleteRow.field_key}</code>, including any
                enabled/required behaviour set here. This cannot be undone, though the key can be
                created again.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setDeleteRow(null)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleDelete()} disabled={isDeleting}>
                {isDeleting ? "Deleting…" : "Delete label"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
