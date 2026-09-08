/**
 * The terminal desk's payment form: three inputs, everything else derived.
 *
 * Every amount here mirrors the server's maths (`tracker/payments.py`):
 *
 *   payable base = net invoice − hold           (hold added back → net invoice)
 *   discount     = net invoice × discount %      (on the FULL net, held part included)
 *   TDS          = taxable × TDS %
 *   net payable  = payable base − discount − TDS (what this round can pay)
 *   total owed   = net invoice − discount − TDS  (the whole obligation)
 *   open balance = total owed − paid             (an un-released hold stays open)
 *
 * Paid auto-follows the net payable until the handler types a figure, so the
 * common case — pay what is due — is one click.
 */
import { useState } from "react";

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
import { Checkbox, Field, FormGrid, Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { Invoice, PaymentDetail } from "@/services/trackerService";

import { money } from "./format";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const READ_ONLY = "bg-surface-strong text-body";

export type PaymentSubmit = {
  discount_pct: string;
  tds_pct: string;
  hold_added_back: boolean;
  paid_amount: string;
  /** Whether the save closes the invoice — for the toast. */
  isPaid: boolean;
};

/** The three inputs, seeded from an existing (partial) payment if there is one. */
function seed(invoice: Invoice): { form: Partial<PaymentDetail>; paidEdited: boolean } {
  const p = invoice.payment;
  const blankZero = (v?: string) => (!v || Number(v) === 0 ? "" : v);
  if (
    p &&
    (Number(p.paid_amount) > 0 || Number(p.discount_pct) > 0 || Number(p.tds_pct) > 0)
  ) {
    // Editing an existing (e.g. partial) payment — restore the inputs and
    // treat the paid amount as user-set so it isn't auto-overwritten.
    return {
      form: {
        discount_pct: blankZero(p.discount_pct),
        tds_pct: blankZero(p.tds_pct),
        hold_added_back: p.hold_added_back,
        paid_amount: p.paid_amount,
      },
      paidEdited: true,
    };
  }
  return {
    form: { discount_pct: "", tds_pct: "", paid_amount: "", hold_added_back: false },
    paidEdited: false,
  };
}

export default function PaymentDialog({
  invoice,
  saving,
  onClose,
  onSave,
}: {
  invoice: Invoice;
  saving: boolean;
  onClose: () => void;
  onSave: (payment: PaymentSubmit) => void;
}) {
  const [{ form, paidEdited }, setState] = useState(() => seed(invoice));
  const patch = (next: Partial<PaymentDetail>) =>
    setState((s) => ({ ...s, form: { ...s.form, ...next } }));

  const invoiceValue = round2(Number(invoice.invoice_value || 0));
  const debit = round2(Number(invoice.debit_amount || 0));
  const netInvoice = round2(Number(invoice.net_invoice_value ?? invoiceValue));
  const hold = round2(Number(invoice.hold_amount || 0));
  const holdBack = !!form.hold_added_back;
  const payableBase = Math.max(0, holdBack ? netInvoice : round2(netInvoice - hold));
  const taxable = round2(Number(invoice.taxable_value || 0));
  const dpct = Number(form.discount_pct || 0);
  const tpct = Number(form.tds_pct || 0);
  const discountAmt = round2((netInvoice * dpct) / 100);
  const tdsAmt = round2((taxable * tpct) / 100);
  const netPayable = Math.max(0, round2(payableBase - discountAmt - tdsAmt));
  const totalOwed = Math.max(0, round2(netInvoice - discountAmt - tdsAmt));
  const paid = paidEdited ? Number(form.paid_amount || 0) : netPayable;
  const openBalance = round2(totalOwed - paid);
  const over = paid > netPayable + 0.005;
  const isPaid = !over && openBalance <= 0.005;

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent title={`Payment — ${invoice.invoice_number}`} size="lg">
        <DialogHeader className="items-start">
          <div className="min-w-0">
            <DialogTitle>Payment — {invoice.invoice_number}</DialogTitle>
            <DialogDescription>{invoice.party_name}</DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody>
          <FormGrid>
            <Field
              label={`Invoice value${debit > 0 ? " (after debit)" : ""}`}
              hint={debit > 0 ? `₹${money(invoiceValue)} − ₹${money(debit)} debit` : undefined}
            >
              {(c) => <Input {...c} readOnly className={READ_ONLY} value={`₹ ${money(netInvoice)}`} />}
            </Field>
            <Field label="Taxable value">
              {(c) => <Input {...c} readOnly className={READ_ONLY} value={`₹ ${money(taxable)}`} />}
            </Field>

            {hold > 0 && (
              <>
                <Field
                  label="Hold amount"
                  hint={
                    holdBack
                      ? "Released — added back to the payable."
                      : `Withheld — payable value ₹${money(round2(netInvoice - hold))}.`
                  }
                >
                  {(c) => (
                    <Input
                      {...c}
                      readOnly
                      className="bg-hold-soft font-semibold text-hold"
                      value={`₹ ${money(hold)}`}
                    />
                  )}
                </Field>
                <div className="flex items-end pb-2">
                  <Checkbox
                    label="Add the hold amount back to the invoice"
                    checked={holdBack}
                    onChange={(e) => patch({ hold_added_back: e.target.checked })}
                  />
                </div>
              </>
            )}

            <Field
              label="Discount %"
              hint={`On the invoice value (after debit${hold > 0 ? ", incl. held" : ""}).`}
            >
              {(c) => (
                <Input
                  {...c}
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={form.discount_pct ?? ""}
                  onChange={(e) => patch({ discount_pct: e.target.value })}
                />
              )}
            </Field>
            <Field label="Discount amount">
              {(c) => <Input {...c} readOnly className={READ_ONLY} value={`₹ ${money(discountAmt)}`} />}
            </Field>

            <Field label="TDS %" hint="On the taxable value.">
              {(c) => (
                <Input
                  {...c}
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={form.tds_pct ?? ""}
                  onChange={(e) => patch({ tds_pct: e.target.value })}
                />
              )}
            </Field>
            <Field label="TDS amount">
              {(c) => <Input {...c} readOnly className={READ_ONLY} value={`₹ ${money(tdsAmt)}`} />}
            </Field>

            <Field label="Net payable">
              {(c) => (
                <Input
                  {...c}
                  readOnly
                  className="bg-brand-soft font-bold text-brand"
                  value={`₹ ${money(netPayable)}`}
                />
              )}
            </Field>
            <Field
              label="Paid amount"
              error={over ? `Cannot exceed the net payable (₹${money(netPayable)}).` : undefined}
            >
              {(c) => (
                <Input
                  {...c}
                  type="number"
                  step="0.01"
                  min="0"
                  max={netPayable}
                  value={paidEdited ? (form.paid_amount ?? "") : netPayable.toFixed(2)}
                  onChange={(e) =>
                    setState((s) => ({
                      paidEdited: true,
                      form: { ...s.form, paid_amount: e.target.value },
                    }))
                  }
                />
              )}
            </Field>

            <Field
              label="Open balance"
              hint={
                hold > 0 && !holdBack
                  ? `Includes ₹${money(hold)} held back — release it to close the invoice.`
                  : undefined
              }
            >
              {(c) => (
                <Input
                  {...c}
                  readOnly
                  className={cn(
                    "font-semibold",
                    openBalance > 0.005 ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok",
                  )}
                  value={`₹ ${money(openBalance)}`}
                />
              )}
            </Field>
            <Field label="Status">
              {(c) => (
                <Input
                  {...c}
                  readOnly
                  className={READ_ONLY}
                  value={isPaid ? "PAID — completes on save" : "OPEN — stays for the balance"}
                />
              )}
            </Field>
          </FormGrid>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={saving || over}
            onClick={() =>
              onSave({
                discount_pct: form.discount_pct || "0",
                tds_pct: form.tds_pct || "0",
                hold_added_back: holdBack,
                paid_amount: String(round2(paid)),
                isPaid,
              })
            }
          >
            {saving ? "Saving…" : isPaid ? "Pay in full & close" : "Save partial payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
