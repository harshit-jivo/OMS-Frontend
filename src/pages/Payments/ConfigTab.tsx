/**
 * Which SAP house bank account each payment method posts to.
 *
 * NOT a bank master: SAP owns the accounts and this page never creates one. It
 * stores only the business decision of which account a tender uses, because a
 * single bank can expose several G/L accounts and OMS cannot guess which. Set
 * once here, and no collector ever sees a G/L number.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlineArrowPath } from "react-icons/hi2";

import approvalService, {
  COMPANY_OPTIONS,
  type Company,
  type MethodMappingRow,
  type SapBank,
} from "../../services/approvalService";
import { ConfirmDialog, Modal } from "./ApprovalUI";
import { messageFrom } from "./useApprovalAdmin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Notice, SectionHeading } from "@/components/ui/page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Stable empties, so `broken` and the row map settle. */
const NO_ROWS: MethodMappingRow[] = [];
const NO_BANKS: SapBank[] = [];

type Flash = (text: string, kind?: "ok" | "err") => void;

export default function ConfigTab({ canEdit, flash }: { canEdit: boolean; flash: Flash }) {
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
      flash(row.label + " mapping removed");
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
            {COMPANY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Button size="xs" onClick={() => void load(true)} disabled={loading}>
            <HiOutlineArrowPath className={loading ? "animate-spin" : ""} aria-hidden="true" />
            Sync banks from SAP
          </Button>
        </div>
      </CardHeader>

      <div className="space-y-4 p-4">
        <p className="m-0 text-[12px] text-subtle">
          Configure which of OUR bank accounts each payment method is deposited into, and
          therefore which G/L account SAP posts to. Accounts come from SAP and cannot be edited
          here. For a cheque this is where we bank it — the customer&apos;s own bank is entered
          by the collector on the payment.
        </p>

        {broken.length > 0 && (
          <Notice tone="bad" title="Configuration error">
            {broken.length} payment method{broken.length === 1 ? "" : "s"} cannot post:{" "}
            {broken.map((r) => r.label + " (" + r.error + ")").join(", ")}
          </Notice>
        )}

        {error && <Notice tone="bad">{error}</Notice>}

        {/* Side by side on a desktop, stacked on a phone. */}
        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          <section className="space-y-2">
            <SectionHeading>Available SAP bank accounts</SectionHeading>
            <div className="overflow-x-auto rounded-sm border border-line">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank</TableHead>
                    <TableHead>Account number</TableHead>
                    <TableHead>G/L account</TableHead>
                    <TableHead>Branch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {banks.map((b) => (
                    <TableRow key={b.key}>
                      <TableCell className="font-semibold text-ink">{b.display_name}</TableCell>
                      <TableCell>
                        <code className="font-mono text-[12px]">{b.account_number || "—"}</code>
                      </TableCell>
                      <TableCell>
                        <code className="font-mono text-[12px]">{b.gl_account}</code>
                      </TableCell>
                      <TableCell>{b.branch || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!banks.length && !loading && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-subtle">
                        No accounts returned by SAP.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {meta && (
              <p className="m-0 text-[11.5px] text-subtle">
                Last sync:{" "}
                {meta.synced_at ? new Date(meta.synced_at).toLocaleString() : "never"}
                {" · "}
                {meta.stale
                  ? "Cached (SAP unreachable)"
                  : meta.source === "cache"
                    ? "Cached"
                    : "Live from SAP"}
                {" · "}
                {meta.bank_count} account{meta.bank_count === 1 ? "" : "s"}
              </p>
            )}
          </section>

          <section className="space-y-2">
            <SectionHeading>Payment method mapping</SectionHeading>
            <div className="overflow-x-auto rounded-sm border border-line">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment method</TableHead>
                    <TableHead>Company deposit account</TableHead>
                    <TableHead>G/L account</TableHead>
                    <TableHead>Account number</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead className="text-right" aria-label="Actions" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.payment_method}>
                      <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                      <TableCell>
                        {r.is_cash ? (
                          <span className="text-subtle">Cash G/L (company mapping)</span>
                        ) : (
                          r.bank_name || "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="font-mono text-[12px]">{r.gl_account || "—"}</code>
                      </TableCell>
                      <TableCell>
                        <code className="font-mono text-[12px]">{r.account_number || "—"}</code>
                      </TableCell>
                      <TableCell>{r.branch || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          tone={r.valid ? "ok" : r.configured ? "bad" : "neutral"}
                          title={r.error || undefined}
                        >
                          {r.valid ? "Active" : r.configured ? "Invalid" : "Not set"}
                        </Badge>
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          {/* Cash has no house bank account to choose. */}
                          {r.is_cash ? (
                            <span className="flex justify-end text-subtle">—</span>
                          ) : (
                            <span className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setEditing(r);
                                  setChoice(r.bank_key);
                                }}
                                aria-label={"Edit " + r.label + " mapping"}
                              >
                                {r.configured ? "Edit" : "Map"}
                              </Button>
                              {r.configured && (
                                <Button
                                  size="sm"
                                  onClick={() => setConfirming(r)}
                                  aria-label={"Remove " + r.label + " mapping"}
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
          </section>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Remove mapping"
          message={
            "Remove the deposit account for " +
            confirming.label +
            "? Payments using this method cannot post to SAP until it is mapped again."
          }
          confirmLabel="Remove"
          danger
          busy={busy}
          onConfirm={() => void remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}

      {editing && (
        <Modal
          title={editing.label + " — company deposit account"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!choice || busy}
                onClick={() => void save()}
                title={choice ? undefined : "Choose an account first."}
              >
                {busy ? "Saving…" : "Save"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Payment method">
              {(control) => <Input {...control} value={editing.label} readOnly disabled />}
            </Field>
            <Field
              label="Company deposit account"
              required
              hint="The account SAP posts this tender into."
            >
              {(control) => (
                <Select
                  {...control}
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                  autoFocus
                >
                  <option value="">Select an account…</option>
                  {banks.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.display_name} — {b.account_number} — GL {b.gl_account}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}
