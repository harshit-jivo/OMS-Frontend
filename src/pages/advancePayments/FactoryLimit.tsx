/**
 * The Factory daily limit on the request form: Ziyaul's cap on today's
 * Factory requests in the company, what they already use, and what is left —
 * shown while a Factory request is being raised, and the reason Submit is
 * refused when this one would go past it. The server checks again on save
 * (`services/daily_limit.py`): two people raising at once cannot both slip under.
 */
import { Notice } from "../../components/ui/page";
import { advancePaymentError } from "../../services/advancePaymentService";
import { COMPANY_LABEL, factoryLimitError, type useFactoryLimit } from "./factoryLimitData";
import { formatINR } from "./rules";

/** The strip under the amount: the limit, used, left — red when this request goes over. */
export function FactoryLimitStrip({
  counts,
  query,
  amount,
}: ReturnType<typeof useFactoryLimit> & { amount: number }) {
  if (!counts) return null;
  if (query.isError) {
    return (
      <Notice tone="hold" title="Factory daily limit">
        Could not read today&apos;s limit: {advancePaymentError(query.error)}. It is checked again
        when you submit.
      </Notice>
    );
  }
  const data = query.data;
  if (!data) return null;
  const company = COMPANY_LABEL[data.company] ?? data.company;
  // Whose limit it is and what it covers — said on the form (user, 2026-10-16).
  const whose = (
    <span className="block">
      Set by Ziyaul for {company}&apos;s <b>Factory requests</b>: Department Factory or FACT_COM, or
      packing material, raw material (not oil), semi-finished goods or fixed-asset spares. Oil
      purchases are not counted.
    </span>
  );
  const enforced = data.enabled ? null : (
    <span className="mt-1 block">Not applied yet: requests are not held back by it.</span>
  );
  if (!data.limit) {
    return (
      <Notice tone="info" title={`Factory daily limit · ${company}`}>
        {whose}
        <span className="mt-1 block" data-testid="factory-limit">
          No limit set yet · raised today {formatINR(Number(data.used))}
        </span>
        {enforced}
      </Notice>
    );
  }
  const over = factoryLimitError(data, amount);
  return (
    <Notice tone={over ? "bad" : "info"} title={`Factory daily limit · ${company}`}>
      {whose}
      <span className="mt-1 block" data-testid="factory-limit">
        Limit <b>{formatINR(Number(data.limit.amount))}</b>
        {data.limit.carried ? " (carried from an earlier day)" : ""} · raised today{" "}
        <b>{formatINR(Number(data.used))}</b> · left <b>{formatINR(Number(data.left))}</b>
      </span>
      {over ? <span className="mt-1 block font-semibold">{over}</span> : null}
      {enforced}
    </Notice>
  );
}
