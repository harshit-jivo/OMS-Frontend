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
  if (!data?.enabled) return null;
  const company = COMPANY_LABEL[data.company] ?? data.company;
  if (!data.limit) {
    return (
      <Notice tone="info" title={`Factory daily limit · ${company}`}>
        No limit has been set yet. {formatINR(Number(data.used))} of Factory requests raised today.
      </Notice>
    );
  }
  const over = factoryLimitError(data, amount);
  return (
    <Notice tone={over ? "bad" : "info"} title={`Factory daily limit · ${company}`}>
      <span data-testid="factory-limit">
        Limit {formatINR(Number(data.limit.amount))}
        {data.limit.carried ? " (carried from an earlier day)" : ""} · raised today{" "}
        {formatINR(Number(data.used))} · left {formatINR(Number(data.left))}
      </span>
      {over ? <span className="mt-1 block font-semibold">{over}</span> : null}
    </Notice>
  );
}
