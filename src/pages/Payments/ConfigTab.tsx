import { useCallback, useEffect, useState } from "react";

import approvalService, {
  COMPANY_OPTIONS,
  type BankSyncMeta,
  type Company,
  type MethodMappingRow,
  type SapBank,
} from "../../services/approvalService";
import { ConfirmDialog, Modal } from "./ApprovalUI";
import { messageFrom } from "./useApprovalAdmin";

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
  const [rows, setRows] = useState<MethodMappingRow[]>([]);
  const [banks, setBanks] = useState<SapBank[]>([]);
  const [meta, setMeta] = useState<BankSyncMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MethodMappingRow | null>(null);
  const [choice, setChoice] = useState("");
  const [confirming, setConfirming] = useState<MethodMappingRow | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const [status, bankList] = await Promise.all([
          approvalService.methodMappingStatus(company, refresh),
          approvalService.listSapBanks(company, refresh),
        ]);
        setRows(status.rows);
        setMeta(status.meta);
        setBanks(bankList);
        setError(null);
      } catch (err) {
        // Say what happened. An empty table would read as "SAP has no banks",
        // which is a different and wrong message.
        setError(messageFrom(err, "Could not load bank configuration"));
      } finally {
        setLoading(false);
      }
    },
    [company],
  );

  useEffect(() => {
    void load();
  }, [load]);

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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
              <table className="apv-table">
                <thead>
                  <tr>
                    <th>Bank</th>
                    <th>Account Number</th>
                    <th>GL Account</th>
                    <th>Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {banks.map((b) => (
                    <tr key={b.key}>
                      <td>{b.display_name}</td>
                      <td>
                        <code>{b.account_number || "-"}</code>
                      </td>
                      <td>
                        <code>{b.gl_account}</code>
                      </td>
                      <td>{b.branch || "-"}</td>
                    </tr>
                  ))}
                  {!banks.length && !loading && (
                    <tr>
                      <td colSpan={4}>No accounts returned by SAP.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {meta && (
              <div className="apv-muted" style={{ marginTop: 8 }}>
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
              <table className="apv-table">
                <thead>
                  <tr>
                    <th>Payment Method</th>
                    <th>Company Deposit Account</th>
                    <th>GL Account</th>
                    <th>Account Number</th>
                    <th>Branch</th>
                    <th>Status</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.payment_method}>
                      <td>{r.label}</td>
                      <td>
                        {r.is_cash ? (
                          <span className="apv-muted">
                            Cash G/L (company mapping)
                          </span>
                        ) : (
                          r.bank_name || "-"
                        )}
                      </td>
                      <td>
                        <code>{r.gl_account || "-"}</code>
                      </td>
                      <td>
                        <code>{r.account_number || "-"}</code>
                      </td>
                      <td>{r.branch || "-"}</td>
                      <td>
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
                      </td>
                      {canEdit && (
                        <td style={{ textAlign: "right" }}>
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
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
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
