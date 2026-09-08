/**
 * Add Scheme — the legacy per-state free-item schemes.
 *
 * One form (name, state, item) above the list of what exists. Editing a row
 * loads it into the same form, so the page never has two editors open.
 *
 * This is the OLD scheme model: one free item per state, matched by code.
 * `/Scheme_Manager` is the v2 engine (triggers, benefits, assignments). Both
 * are live, and Add Sales reads both — which is why this page still exists.
 */
import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlineSquaresPlus } from "react-icons/hi2";

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
import { SearchSelect } from "@/components/ui/dropdown";
import {
  FilterBar,
  FilterCheckbox,
  FilterCount,
  FilterSearch,
  FilterSpacer,
} from "@/components/ui/filter-bar";
import { Field, FormActions, FormGrid, Input } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, EmptyState, Page, PageHeader } from "@/components/ui/page";
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
import { cn } from "@/lib/utils";

import { useStates } from "../lib/authQueries";
import { ordersService } from "../services/ordersService";
import type { SchemeRow } from "../services/ordersService";

const EMPTY_FORM = { scheme_name: "", item_code: "", state_code: "" };

/** One identity for "no schemes", so `visibleSchemes` does not recompute forever. */
const NO_SCHEMES: SchemeRow[] = [];

// The API reports duplicate/validation problems per field; surface the first one
// rather than a generic "failed" alert.
const readApiError = (error: unknown, fallback: string): string => {
  const data = (error as { response?: { data?: unknown } })?.response?.data as
    | { message?: string; errors?: Record<string, string[] | string> }
    | undefined;
  if (data?.errors) {
    const first = Object.values(data.errors)[0];
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === "string") return first;
  }
  return data?.message || fallback;
};

export default function Add_Scheme() {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Shared with Scheme_Manager and App_User under ["auth","states"], so the
  // list of states is fetched once per session rather than once per page.
  const { states, isLoading: isLoadingStates } = useStates();
  const [formData, setFormData] = useState(EMPTY_FORM);

  // null = creating a new scheme; a number = editing that scheme_id.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<SchemeRow | null>(null);

  const payload = {
    scheme_name: formData.scheme_name,
    item_code: formData.item_code,
    state_code: formData.state_code,
  };

  /*
   * `includeInactive` is part of the key, not a dependency of a refetch. The
   * old `useCallback`/`useEffect` pair re-created the fetcher whenever the
   * checkbox moved and re-ran it — and, having thrown the previous result
   * away, showed a spinner every time you toggled back to a list it had
   * already downloaded. Two keys means both are cached.
   */
  const {
    data: schemeData,
    isPending: isLoadingSchemes,
    error: schemeError,
  } = useQuery({
    queryKey: ["schemes", "manage", { includeInactive }],
    queryFn: () => ordersService.getSchemesForManage({ include_inactive: includeInactive }),
  });
  const schemes = schemeData ?? NO_SCHEMES;

  /** Re-read after any create/update/deactivate/delete, both keys at once. */
  const reloadSchemes = () => queryClient.invalidateQueries({ queryKey: ["schemes", "manage"] });

  // Client-side filter: the list is small (tens of rows) so there is no need to
  // round-trip the server on every keystroke.
  const visibleSchemes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return schemes;
    return schemes.filter(
      (row) =>
        row.scheme_name?.toLowerCase().includes(term) ||
        row.item_code?.toLowerCase().includes(term) ||
        row.item_name?.toLowerCase().includes(term) ||
        row.state_code?.toLowerCase().includes(term),
    );
  }, [schemes, search]);

  const stateOptions = useMemo(
    () => states.map((state) => ({ value: state.code, label: state.name, hint: state.code })),
    [states],
  );

  const fail = (title: string, error: unknown, fallback: string) => {
    console.error(title, error);
    showToast({ title, message: readApiError(error, fallback) });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingId !== null) {
        await ordersService.updateScheme(editingId, payload);
        showToast({ title: `Scheme #${editingId} updated`, message: formData.scheme_name });
      } else {
        await ordersService.createScheme(payload);
        showToast({ title: "Scheme created", message: formData.scheme_name });
      }
      setFormData(EMPTY_FORM);
      setEditingId(null);
      await reloadSchemes();
    } catch (error) {
      fail(
        editingId !== null ? "Could not update the scheme" : "Could not create the scheme",
        error,
        "The server refused the request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (row: SchemeRow) => {
    setEditingId(row.scheme_id);
    setFormData({
      scheme_name: row.scheme_name ?? "",
      item_code: row.item_code ?? "",
      state_code: row.state_code ?? "",
    });
    // The form is above the list; bring it back into view. `body` is the
    // scroll box in this app (see DESIGN_SYSTEM.md §1.6), not the window.
    document.body.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const handleDeactivate = async (row: SchemeRow) => {
    setBusyId(row.scheme_id);
    try {
      const result = await ordersService.deleteScheme(row.scheme_id);
      showToast({
        title: "Scheme deactivated",
        message: result?.message || `${row.scheme_name} no longer applies to new orders.`,
      });
      setConfirmDeactivate(null);
      if (editingId === row.scheme_id) cancelEdit();
      await reloadSchemes();
    } catch (error) {
      fail("Could not deactivate the scheme", error, "The server refused the request.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReactivate = async (row: SchemeRow) => {
    setBusyId(row.scheme_id);
    try {
      await ordersService.updateScheme(row.scheme_id, { is_active: true });
      showToast({ title: "Scheme re-activated", message: row.scheme_name ?? "" });
      await reloadSchemes();
    } catch (error) {
      fail("Could not re-activate the scheme", error, "The server refused the request.");
    } finally {
      setBusyId(null);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Schemes" }, { label: "Add Scheme" }]} />

      <PageHeader
        title={editingId !== null ? `Edit Scheme #${editingId}` : "Add Scheme"}
        description={
          editingId !== null
            ? "Editing an existing scheme. Changes apply to future orders only."
            : "A free item for every order from one state. Add Sales picks it up automatically."
        }
      />

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormGrid>
            <Field label="Scheme name" required>
              {(control) => (
                <Input
                  {...control}
                  name="scheme_name"
                  placeholder="Enter scheme name"
                  value={formData.scheme_name}
                  onChange={handleChange}
                />
              )}
            </Field>
            <Field label="State" required>
              {(control) => (
                <SearchSelect
                  id={control.id}
                  value={formData.state_code}
                  onChange={(code) => setFormData((prev) => ({ ...prev, state_code: code }))}
                  options={stateOptions}
                  placeholder={isLoadingStates ? "Loading states…" : "Select state"}
                  searchPlaceholder="State name or code"
                  disabled={isLoadingStates}
                />
              )}
            </Field>
            <Field label="Item code" required hint="The SAP finished-good code, e.g. FG0000005.">
              {(control) => (
                <Input
                  {...control}
                  name="item_code"
                  placeholder="FG0000005"
                  value={formData.item_code}
                  onChange={handleChange}
                  autoComplete="off"
                />
              )}
            </Field>
          </FormGrid>

          <FormActions>
            {editingId !== null && (
              <Button type="button" onClick={cancelEdit} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !formData.state_code}
            >
              {isSubmitting ? "Saving…" : editingId !== null ? "Update scheme" : "Add scheme"}
            </Button>
          </FormActions>
        </form>
      </Card>

      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, item code or state"
          aria-label="Search name, item code or state"
          fieldClassName="min-w-[240px]"
        />
        <FilterCheckbox
          label="Show deactivated"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
        />
        <FilterSpacer />
      </FilterBar>

      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 border-b border-line px-4 py-3">
          <CardTitle>
            Existing schemes{" "}
            {/* `(2)` is what the e2e spec reads to tell loaded from loading
                from empty — blank while loading, a count otherwise. */}
            <span className="font-medium text-subtle">
              {isLoadingSchemes ? "" : `(${visibleSchemes.length})`}
            </span>
          </CardTitle>
          <FilterCount className="pb-0">
            {includeInactive ? "Active and deactivated" : "Active only"}
          </FilterCount>
        </CardHeader>

        {isLoadingSchemes ? (
          <TableSkeleton rows={5} columns={6} />
        ) : schemeError ? (
          <EmptyState
            icon={HiOutlineSquaresPlus}
            title="Could not load schemes"
            hint={readApiError(schemeError, "Check that you are signed in and try again.")}
          />
        ) : visibleSchemes.length === 0 ? (
          <EmptyState
            icon={HiOutlineSquaresPlus}
            title="No schemes found"
            hint={
              search.trim()
                ? "Nothing matches that search."
                : "Add one above — it applies to every order from the chosen state."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Scheme name</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Free item</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSchemes.map((row) => {
                  const isBusy = busyId === row.scheme_id;
                  return (
                    <TableRow
                      key={row.scheme_id}
                      className={cn(
                        editingId === row.scheme_id && "bg-brand-soft/50 hover:bg-brand-soft/50",
                      )}
                    >
                      <TableCell className="text-subtle">{row.scheme_id}</TableCell>
                      <TableCell
                        className={cn(
                          "font-medium",
                          row.is_active ? "text-ink" : "text-subtle line-through",
                        )}
                      >
                        {row.scheme_name}
                      </TableCell>
                      <TableCell>{row.state_code || "—"}</TableCell>
                      <TableCell>
                        {row.item_code || "—"}
                        {row.item_name ? (
                          <span className="mt-0.5 block text-[11px] text-subtle">
                            {row.item_name}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge tone={row.is_active ? "ok" : "neutral"} dot>
                          {row.is_active ? "Active" : "Deactivated"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => startEdit(row)}
                            disabled={isBusy}
                          >
                            Edit
                          </Button>
                          {row.is_active ? (
                            <Button
                              variant="danger"
                              size="xs"
                              onClick={() => setConfirmDeactivate(row)}
                              disabled={isBusy}
                            >
                              Turn off
                            </Button>
                          ) : (
                            <Button
                              variant="success"
                              size="xs"
                              onClick={() => void handleReactivate(row)}
                              disabled={isBusy}
                            >
                              {isBusy ? "…" : "Turn on"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog
        open={confirmDeactivate !== null}
        onOpenChange={(next) => {
          if (!next && busyId === null) setConfirmDeactivate(null);
        }}
      >
        {confirmDeactivate ? (
          <DialogContent title="Turn scheme off" size="sm">
            <DialogHeader>
              <DialogTitle>Turn off {confirmDeactivate.scheme_name}?</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-2 text-[13px] text-body">
              <p className="m-0">
                <strong className="font-semibold text-ink">
                  {confirmDeactivate.state_code || "no state"} /{" "}
                  {confirmDeactivate.item_code || "no item"}
                </strong>
              </p>
              <p className="m-0">
                It will stop appearing in Add Sales and stop adding free lines to new SAP
                orders. Existing orders keep their history, and you can turn it back on later.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirmDeactivate(null)} disabled={busyId !== null}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleDeactivate(confirmDeactivate)}
                disabled={busyId !== null}
              >
                {busyId !== null ? "Working…" : "Turn off"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </Page>
  );
}
