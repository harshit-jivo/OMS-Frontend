import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import approvalService, {
  type Company,
  type MethodMappingRow,
  type SapBank,
} from "../../services/approvalService";
import { ConfirmDialog, Modal } from "./ApprovalUI";

/** Stable empties, so `broken` and the row map settle. */
const NO_ROWS: MethodMappingRow[] = [];
const NO_BANKS: SapBank[] = [];
import { messageFrom } from "./useApprovalAdmin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Notice } from "@/components/ui/page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Flash = (text: string, kind?: "ok" | "err") => void;

/**
 * Which SAP house bank account each payment method posts to.
 *
 * NOT a bank master: SAP owns the accounts and this page never creates one. It
 * stores only the business decision of which account a tender uses, because a
 * single bank can expose several G/L accounts and OMS cannot guess which. Set
 * once here, and no collector ever sees a G/L number.
 */
export default function ConfigTab({
  canEdit,
  flash,
}: {
  canEdit: boolean;
  flash: Flash;
}) {
  // Companies come from the server, not a frontend constant: the canonical
  // list lives in CATEGORY_CHOICES and a company added or renamed there must
  // not need a release here.
  const { data: companies } = useQuery({
    queryKey: ["payments", "companies"],
    queryFn: () => approvalService.listCompanies(),
  });
  const [company, setCompany] = useState<Company | "">("");
  // Settle on the first company the server offers, once, without overriding a
  // choice the user has already made.
  useEffect(() => {
    if (!company && companies?.length) setCompany(companies[0].company);
  }, [companies, company]);

  const queryClient = useQueryClient();
  /*
   * Mappings and banks stay in ONE queryFn, as the original `Promise.all` did:
   * every row's dropdown is populated from `banks`, so the two must describe the
   * same moment or a mapping can point at a bank the list no longer offers.
   */
  const {
    data,
    isFetching: loading,
    error: loadError,
  } = useQuery({
    queryKey: ["payments", "bank-config", company],
    // Not until a company has settled. `company` starts empty while the list
    // loads, and asking the API for the mappings of "" is a request that can
    // only fail — it is also what made this component not typecheck, because
    // the service takes a Company and this state is `Company | ""`.
    enabled: Boolean(company),
    queryFn: async () => {
      const target = company as Company;
      const [status, bankList] = await Promise.all([
        approvalService.methodMappingStatus(target, false),
        approvalService.listSapBanks(target, false),
      ]);
      return { rows: status.rows, meta: status.meta, banks: bankList };
    },
  });
  const rows = data?.rows ?? NO_ROWS;
  const banks = data?.banks ?? NO_BANKS;
  const meta = data?.meta ?? null;
  // Say what happened. An empty table would read as "SAP has no banks", which
  // is a different and wrong message.
  const error = loadError ? messageFrom(loadError, "Could not load bank configuration") : null;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MethodMappingRow | null>(null);
  const [choice, setChoice] = useState("");
  const [confirming, setConfirming] = useState<MethodMappingRow | null>(null);

  /**
   * Re-read. `refresh` is NOT a plain refetch: it goes to the server as a query
   * PARAM telling it to re-pull banks from SAP rather than serve its cache
   * (approvalService.ts:520-537). `invalidateQueries` cannot send it, so the
   * Sync button runs the request itself and seeds the cache with the result.
   */
  const load = async (refresh = false) => {
    if (!refresh) {
      await queryClient.invalidateQueries({ queryKey: ["payments", "bank-config"] });
      return;
    }
    // Only reachable from the Sync button, which is inside the card that
    // renders once a company is chosen.
    const target = company as Company;
    const [status, bankList] = await Promise.all([
      approvalService.methodMappingStatus(target, true),
      approvalService.listSapBanks(target, true),
    ]);
    queryClient.setQueryData(["payments", "bank-config", company], {
      rows: status.rows,
      meta: status.meta,
      banks: bankList,
    });
  };

  const save = async () => {
    // CASH is configured by its G/L, every other tender by its house bank —
    // the backend refuses the wrong one for either, so only the relevant
    // field is sent. `mapping_id` makes this a PATCH of the existing row
    // rather than a second one.
    if (!editing) return;
    if (!(editing.is_cash ? choice.trim() : choice)) return;
    setBusy(true);
    try {
      await approvalService.saveMethodMapping({
        id: editing.mapping_id ?? undefined,
        // Same narrowing as the query above: the edit modal opens from a row,
        // and rows only exist once a company is chosen.
        company: company as Company,
        payment_method: editing.payment_method,
        bank_key: editing.is_cash ? "" : choice,
        ...(editing.is_cash ? { gl_account: choice.trim() } : {}),
      });
      flash("Mapping saved");
      setEditing(null);
      await load();
    } catch (err) {
      flash(messageFrom(err, "Save failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  /** Clear a mapping. Deletes the row, so the method returns to "Not set". */
  const remove = async (row: MethodMappingRow) => {
    if (!row.mapping_id) return;
    setBusy(true);
    try {
      await approvalService.deleteMethodMapping(row.mapping_id);
      flash(`${row.label} mapping removed`);
      setConfirming(null);
      await load();
    } catch (err) {
      flash(messageFrom(err, "Delete failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  const broken = rows.filter((r) => !r.valid);

  return (
    <>
      <Card className="p-0">
        <CardHeader className="mb-0 flex-wrap border-b border-line px-4 py-3">
          <CardTitle>Payment method mapping</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={company}
              onChange={(e) => setCompany(e.target.value as Company)}
              aria-label="Company"
              className="h-control-xs w-auto text-[12.5px]"
            >
              {(companies ?? []).map((c) => (
                <option key={c.company} value={c.company}>
                  {c.display_name}
                </option>
              ))}
            </Select>
            <Button size="xs" onClick={() => void load(true)} disabled={loading}>
              Sync banks from SAP
            </Button>
            {/* Kept from the removed bank panel: it is the only thing telling
                an admin whether the accounts behind these mappings were read
                from SAP just now or served from cache. */}
            {meta?.synced_at && (
              <span className="text-[11.5px] text-subtle">
                {meta.stale ? "Stale — " : ""}
                synced {new Date(meta.synced_at).toLocaleString("en-GB")}
              </span>
            )}
          </div>
        </CardHeader>

        <Notice tone="info" className="m-4 mb-0">
          Configure which of OUR bank accounts each payment method is deposited into, and
          therefore which G/L account SAP posts to. Accounts come from SAP and cannot be
          edited here. For a cheque this is where we bank it — the customer's own bank is
          entered by the collector on the payment.
        </Notice>

        {broken.length > 0 && (
          <Notice tone="bad" title="Configuration error" className="m-4 mb-0">
            {broken.length} payment method{broken.length === 1 ? "" : "s"} cannot post:{" "}
            {broken.map((r) => `${r.label} (${r.error})`).join(" · ")}
          </Notice>
        )}

        {error && (
          <Notice tone="bad" className="m-4 mb-0">
            {error}
          </Notice>
        )}

        {/* One section now. The "Available SAP Bank Accounts" panel that sat
            beside this listed SAP's house banks as a reference table — the
            same accounts the picker already offers, so it duplicated the
            mapping without configuring anything. The account each method
            posts to is named in the table below. */}
        <div className="mt-4 overflow-x-auto">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Company Deposit Account</TableHead>
                    <TableHead>GL Account</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.payment_method}>
                      <TableCell>{r.label}</TableCell>
                      {/* SAP's own name for the account, which already
                          carries its number — so cash reads "CASH SALE" and a
                          bank reads "ICICI BANK LTD - 629305042195", and the
                          separate number and branch columns are unnecessary. */}
                      <TableCell>{r.account_name || "—"}</TableCell>
                      <TableCell>
                        <code className="font-mono text-[12px]">{r.gl_account || "—"}</code>
                      </TableCell>
                      <TableCell>
                        <span title={r.error || undefined}>
                          <Badge tone={r.valid ? "ok" : r.configured ? "bad" : "neutral"}>
                            {r.valid ? "Active" : r.configured ? "Invalid" : "Not set"}
                          </Badge>
                        </span>
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          {/* Cash edits its G/L rather than picking a bank,
                              but it IS editable — the account lives in this
                              same mapping table now. */}
                          {r.is_cash ? (
                            <span className="flex justify-end gap-1">
                              <Button
                                size="xs"
                                onClick={() => {
                                  setEditing(r);
                                  setChoice(r.gl_account);
                                }}
                                aria-label={`Edit ${r.label} G/L account`}
                              >
                                Edit
                              </Button>
                            </span>
                          ) : (
                            <span className="flex justify-end gap-1">
                              <Button
                                size="xs"
                                onClick={() => {
                                  setEditing(r);
                                  setChoice(r.bank_key);
                                }}
                                aria-label={`Edit ${r.label} mapping`}
                              >
                                {r.configured ? "Edit" : "Map"}
                              </Button>
                              {r.configured && (
                                <Button
                                  variant="danger"
                                  size="xs"
                                  onClick={() => setConfirming(r)}
                                  aria-label={`Remove ${r.label} mapping`}
                                >
                                  Remove
                                </Button>
                              )}
                            </span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
        </div>
      </Card>

      {confirming && (
        <ConfirmDialog
          title="Remove mapping"
          message={`Remove the deposit account for ${confirming.label}? Payments using this method cannot post to SAP until it is mapped again.`}
          confirmLabel="Remove"
          danger
          busy={busy}
          onConfirm={() => void remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}

      {editing && (
        <Modal
          title={
            editing.is_cash
              ? `${editing.label} - G/L account`
              : `${editing.label} - company deposit account`
          }
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!choice || busy} onClick={save}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </>
          }
        >
          <Field label="Payment method">
            {(control) => <Input {...control} value={editing.label} readOnly />}
          </Field>
          {editing.is_cash ? (
            /* Cash has no house bank to pick from — SAP publishes bank
               accounts as DSC1 rows and a drawer has none — so its G/L is
               typed directly. The value is never defaulted here: it comes
               from the row the API returned, and the backend owns what is
               valid. */
            <Field
              label="G/L account"
              hint="The account cash receipts debit, and the same account a deposit of that cash credits."
            >
              {(control) => (
                <Input
                  {...control}
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                  placeholder="Cash G/L account code"
                  inputMode="numeric"
                  className="font-mono"
                />
              )}
            </Field>
          ) : (
            <Field label="Company deposit account">
              {(control) => (
                <Select {...control} value={choice} onChange={(e) => setChoice(e.target.value)}>
                  <option value="">Select an account…</option>
                  {banks.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.display_name} — {b.account_number} — GL {b.gl_account}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </Modal>
      )}
    </>
  );
}
