/**
 * TDS on a vendor payment, deducted at the Payment stage: tick it, pick the
 * rate, then the section at that rate. The section is a SAP TDS code, which
 * fixes the 2133xxx account the TDS is booked to; the vendor's own SAP codes
 * come first. Blocked when a bill being paid already had TDS deducted in SAP.
 * Read-only everywhere but the Payment stage.
 */
import { useQuery } from "@tanstack/react-query";

import { Checkbox, Field, FormGrid, Select } from "../../components/ui/form";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type TdsCode,
} from "../../services/advancePaymentService";

import { FormSection } from "./PaymentSections";
import { tdsAmountFor, type PayoutDetails } from "./payout";
import { formatINR } from "./rules";

export interface TdsContext {
  company: AdvancePaymentCompany;
  cardCode: string;
  /** The bills the request pays (DocEntries): any with SAP TDS blocks this. */
  bills: number[];
}

const codeLabel = (code: TdsCode) =>
  `${code.name} (${code.code})${code.assigned ? " · vendor's code" : ""}`;

export function TdsSection({
  value,
  onChange,
  requestAmount,
  context,
  readOnly,
}: {
  value: PayoutDetails;
  onChange: (next: PayoutDetails) => void;
  requestAmount: number;
  context: TdsContext;
  readOnly: boolean;
}) {
  const query = useQuery({
    queryKey: ["advance-payments", "tds-options", context.company, context.cardCode, context.bills.join(",")],
    queryFn: () => advancePaymentService.tdsOptions(context.company, context.cardCode, context.bills),
    enabled: !readOnly,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const tds = value.tds;

  if (readOnly) {
    return (
      <FormSection title="TDS">
        <p className="m-0 text-[13px] text-body">
          {tds
            ? `${formatINR(tds.amount)} deducted at ${tds.rate}% under ${tds.label || tds.code} ` +
              `(account ${tds.account}). The payee receives ${formatINR(requestAmount - tds.amount)}.`
            : "No TDS deducted."}
        </p>
      </FormSection>
    );
  }

  const options = query.data;
  const blocked = options?.bills_with_tds ?? [];
  const rate = tds ? String(tds.rate) : "";
  const atRate = (options?.codes ?? []).filter((c) => c.rate === rate);

  /** Choose a code: its rate, account and amount come with it. The single method follows the net. */
  const choose = (code: TdsCode | null) => {
    const amount = code ? tdsAmountFor(requestAmount, Number(code.rate)) : 0;
    const oldNet = requestAmount - (tds?.amount ?? 0);
    const newNet = requestAmount - amount;
    const lines =
      value.lines.length === 1 && Number(value.lines[0].amount) === oldNet
        ? [{ ...value.lines[0], amount: String(newNet) }]
        : value.lines;
    onChange({
      ...value,
      lines,
      tds: code
        ? { code: code.code, label: code.name, rate: Number(code.rate), account: code.account, amount }
        : null,
    });
  };
  const firstAt = (r: string) => (options?.codes ?? []).find((c) => c.rate === r) ?? null;

  return (
    <FormSection
      title="TDS"
      description={readOnly ? undefined : "Deducted from this vendor payment; booked to SAP with it, at Final."}
    >
      {query.isError ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {advancePaymentError(query.error)}
        </p>
      ) : null}
      {blocked.length ? (
        <p className="m-0 text-[13px] text-subtle">
          TDS cannot be deducted here: SAP already deducted it on{" "}
          {blocked.map((b) => `bill ${b.doc_num ?? b.doc_entry} (${formatINR(Number(b.tds))})`).join(", ")}.
        </p>
      ) : null}
      <Checkbox
        label="Deduct TDS"
        checked={tds !== null}
        disabled={!options || blocked.length > 0 || options.rates.length === 0}
        onChange={(e) => choose(e.target.checked ? firstAt(options?.rates[0] ?? "") : null)}
      />
      {tds ? (
        <FormGrid className="md:grid-cols-3">
          <Field label="TDS Rate" required>
            {(f) => (
              <Select {...f} value={rate} onChange={(e) => choose(firstAt(e.target.value))}>
                {(options?.rates ?? []).map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="TDS Section" required hint={`Booked to account ${tds.account}.`}>
            {(f) => (
              <Select
                {...f}
                value={tds.code}
                onChange={(e) => choose(atRate.find((c) => c.code === e.target.value) ?? null)}
              >
                {atRate.map((c) => (
                  <option key={c.code} value={c.code}>
                    {codeLabel(c)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="TDS Amount">
            {(f) => (
              <output id={f.id} className="flex h-control items-center text-[13px] tabular-nums text-ink">
                <strong>{formatINR(tds.amount)}</strong>
                <span className="ml-2 text-subtle">payee receives {formatINR(requestAmount - tds.amount)}</span>
              </output>
            )}
          </Field>
        </FormGrid>
      ) : null}
    </FormSection>
  );
}
