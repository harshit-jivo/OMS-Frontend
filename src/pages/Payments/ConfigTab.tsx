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
    queryFn: async () => {
      const [status, bankList] = await Promise.all([
        approvalService.methodMappingStatus(company, false),
        approvalService.listSapBanks(company, false),
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
    const [status, bankList] = await Promise.all([
      approvalService.methodMappingStatus(company, true),
      approvalService.listSapBanks(company, true),
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
        company,
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
      <div className="apv-card">
        <div className="apv-card-head">
          <h3>Payment Method Mapping</h3>
          <div className="apv-actions-row apv-actions-row-center">
            <select
              className="apv-select"
              value={company}
              onChange={(e) => setCompany(e.target.value as Company)}
              aria-label="Company"
            >
              {(companies ?? []).map((c) => (
                <option key={c.company} value={c.company}>
                  {c.display_name}
                </option>
              ))}
            </select>
            <button
              className="apv-btn"
              onClick={() => void load(true)}
              disabled={loading}
            >
              Sync Banks From SAP
            </button>
            {/* Kept from the removed bank panel: it is the only thing telling
                an admin whether the accounts behind these mappings were read
                from SAP just now or served from cache. */}
            {meta?.synced_at && (
              <span className="apv-muted">
                {meta.stale ? "Stale — " : ""}
                synced {new Date(meta.synced_at).toLocaleString("en-GB")}
              </span>
            )}
          </div>
        </div>

        <div className="apv-note">
          Configure which of OUR bank accounts each payment method is deposited
          into, and therefore which G/L account SAP posts to. Accounts come from
          SAP and cannot be edited here. For a cheque this is where we bank it —
          the customer's own bank is entered by the collector on the payment.
        </div>

        {broken.length > 0 && (
          <div className="apv-note apv-note-err">
            <strong>Configuration error.</strong> {broken.length} payment method
            {broken.length === 1 ? "" : "s"} cannot post:{" "}
            {broken.map((r) => `${r.label} (${r.error})`).join("   ")}
          </div>
        )}

        {error && <div className="apv-note apv-note-err">{error}</div>}

        {/* One section now. The "Available SAP Bank Accounts" panel that sat
            beside this listed SAP's house banks as a reference table — the
            same accounts the picker already offers, so it duplicated the
            mapping without configuring anything. The account each method
            posts to is named in the table below. */}
        <div>
          <section>
            <h4 className="apv-sub">Payment Method Mapping</h4>
            <div className="apv-table-wrap">
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
                      <TableCell>{r.account_name || "-"}</TableCell>
                      <TableCell>
                        <code>{r.gl_account || "-"}</code>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`apv-pill${r.valid ? " ok" : " err"}`}
                          title={r.error || undefined}
                        >
                          {r.valid
                            ? "Active"
                            : r.configured
                              ? "Invalid"
                              : "Not set"}
                        </span>
                      </TableCell>
                      {canEdit && (
                        <TableCell className="apv-cell-right">
                          {/* Cash edits its G/L rather than picking a bank,
                              but it IS editable — the account lives in this
                              same mapping table now. */}
                          {r.is_cash ? (
                            <div className="apv-row-actions">
                              <button
                                className="apv-btn"
                                onClick={() => {
                                  setEditing(r);
                                  setChoice(r.gl_account);
                                }}
                                aria-label={`Edit ${r.label} G/L account`}
                              >
                                Edit
                              </button>
                            </div>
                          ) : (
                            <div className="apv-row-actions">
                              <button
                                className="apv-btn"
                                onClick={() => {
                                  setEditing(r);
                                  setChoice(r.bank_key);
                                }}
                                aria-label={`Edit ${r.label} mapping`}
                              >
                                {r.configured ? "Edit" : "Map"}
                              </button>
                              {r.configured && (
                                <button
                                  className="apv-btn"
                                  onClick={() => setConfirming(r)}
                                  aria-label={`Remove ${r.label} mapping`}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      </div>

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
              <button className="apv-btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className="apv-btn primary"
                disabled={!choice || busy}
                onClick={save}
              >
                {busy ? "Saving..." : "Save"}
              </button>
            </>
          }
        >
          <label className="apv-field">
            <span>Payment method</span>
            <input value={editing.label} readOnly />
          </label>
          {editing.is_cash ? (
            /* Cash has no house bank to pick from — SAP publishes bank
               accounts as DSC1 rows and a drawer has none — so its G/L is
               typed directly. The value is never defaulted here: it comes
               from the row the API returned, and the backend owns what is
               valid. */
            <label className="apv-field">
              <span>G/L account</span>
              <input
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                placeholder="Cash G/L account code"
                inputMode="numeric"
              />
              <span className="apv-hint">
                The account cash receipts debit, and the same account a
                deposit of that cash credits.
              </span>
            </label>
          ) : (
            <label className="apv-field">
              <span>Company deposit account</span>
              <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">Select an account...</option>
                {banks.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.display_name} - {b.account_number} - GL {b.gl_account}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Modal>
      )}
    </>
  );
}
