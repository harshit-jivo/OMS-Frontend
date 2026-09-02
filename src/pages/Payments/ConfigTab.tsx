import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import approvalService, {
  COMPANY_OPTIONS,
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
  const [company, setCompany] = useState<Company>(
    (COMPANY_OPTIONS[0]?.value as Company) ?? "OIL",
  );
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
    if (!editing || !choice) return;
    setBusy(true);
    try {
      await approvalService.saveMethodMapping({
        id: editing.mapping_id ?? undefined,
        company,
        payment_method: editing.payment_method,
        bank_key: choice,
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
              {COMPANY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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

        {/* Side by side on a desktop, stacked on a phone — see .apv-config-grid */}
        <div className="apv-config-grid">
          <section>
            <h4 className="apv-sub">Available SAP Bank Accounts</h4>
            <div className="apv-table-wrap">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank</TableHead>
                    <TableHead>Account Number</TableHead>
                    <TableHead>GL Account</TableHead>
                    <TableHead>Branch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {banks.map((b) => (
                    <TableRow key={b.key}>
                      <TableCell>{b.display_name}</TableCell>
                      <TableCell>
                        <code>{b.account_number || "-"}</code>
                      </TableCell>
                      <TableCell>
                        <code>{b.gl_account}</code>
                      </TableCell>
                      <TableCell>{b.branch || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {!banks.length && !loading && (
                    <TableRow>
                      <TableCell colSpan={4}>No accounts returned by SAP.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {meta && (
              <div className="apv-muted apv-muted-spaced">
                Last sync:{" "}
                {meta.synced_at
                  ? new Date(meta.synced_at).toLocaleString()
                  : "never"}
                {" | "}
                {meta.stale
                  ? "Cached (SAP unreachable)"
                  : meta.source === "cache"
                    ? "Cached"
                    : "Live from SAP"}
                {" | "}
                {meta.bank_count} account{meta.bank_count === 1 ? "" : "s"}
              </div>
            )}
          </section>

          <section>
            <h4 className="apv-sub">Payment Method Mapping</h4>
            <div className="apv-table-wrap">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Company Deposit Account</TableHead>
                    <TableHead>GL Account</TableHead>
                    <TableHead>Account Number</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.payment_method}>
                      <TableCell>{r.label}</TableCell>
                      <TableCell>
                        {r.is_cash ? (
                          <span className="apv-muted">
                            Cash G/L (company mapping)
                          </span>
                        ) : (
                          r.bank_name || "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <code>{r.gl_account || "-"}</code>
                      </TableCell>
                      <TableCell>
                        <code>{r.account_number || "-"}</code>
                      </TableCell>
                      <TableCell>{r.branch || "-"}</TableCell>
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
                          {/* Cash has no house bank account to choose. */}
                          {r.is_cash ? (
                            <span className="apv-muted">-</span>
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
          title={`${editing.label} - company deposit account`}
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
        </Modal>
      )}
    </>
  );
}
