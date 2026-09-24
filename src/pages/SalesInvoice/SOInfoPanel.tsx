/**
 * What a sales order actually says, for the (i) on the picker and the draft.
 *
 * Every field here is already on the wire. `get_sales_orders_for_party`
 * selects `ShipToCode`, `PayToCode`, `NumAtCard`, `Comments`, `DocTotal`,
 * `DocDate`, `DocDueDate` and `DocStatus` from ORDR, and `group_sales_orders`
 * hands all of them to the client on the order header — they were simply never
 * drawn. The address DETAIL (city, state, GSTIN) comes from the party's CRD1
 * rows, which the draft already loads to populate its Bill To / Ship To
 * pickers. So this costs no request.
 *
 * An unknown value is an em dash, never a zero or a blank: a biller reading
 * this out over the phone has to be able to tell "nothing recorded" from
 * "recorded as nothing".
 */
import { describeAddress, formatDateDisplay, formatMoney } from "./salesInvoice.utils";
import type { PartyAddress } from "./salesInvoice.utils";
import type { SalesOrder } from "./useSalesInvoice";

const DASH = "—";

const clean = (value: unknown) => String(value ?? "").trim();

/** SAP's one-letter document status, in words. */
const STATUS_LABELS: Record<string, string> = { O: "Open", C: "Closed" };

function AddressBlock({
  label,
  code,
  addresses,
}: {
  label: string;
  code?: string;
  addresses: PartyAddress[];
}) {
  const address = describeAddress(clean(code), addresses);

  return (
    <div className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-0.5">
      <span className="text-subtle">{label}</span>
      {address ? (
        <span className="min-w-0">
          <span className="block font-medium text-ink">{address.code}</span>
          {address.place && <span className="block text-subtle">{address.place}</span>}
          {address.gstin && (
            <span className="block tabular-nums text-subtle">GSTIN {address.gstin}</span>
          )}
        </span>
      ) : (
        <span className="text-subtle">{DASH}</span>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-subtle">{label}</dt>
      <dd className="m-0 text-right tabular-nums text-ink">{value || DASH}</dd>
    </>
  );
}

/** The header line: which order this is, and whether SAP still has it open. */
export function SOInfoHeading({ order }: { order: SalesOrder }) {
  const status = STATUS_LABELS[clean(order.DocStatus)] || clean(order.DocStatus);

  return (
    <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-line pb-1.5">
      <strong className="text-[13px] font-semibold text-ink">
        SO #{order.DocNum || order.DocEntry}
      </strong>
      {status && <span className="text-[11.5px] text-subtle">{status}</span>}
    </div>
  );
}

/** The references, dates and value — everything that is not an address. */
export function SOInfoFacts({ order }: { order: SalesOrder }) {
  const comments = clean(order.Comments);

  return (
    <>
      <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1">
        <Fact label="Customer PO" value={clean(order.NumAtCard)} />
        <Fact label="Order date" value={formatDateDisplay(clean(order.DocDate))} />
        <Fact label="Due date" value={formatDateDisplay(clean(order.DocDueDate))} />
        <Fact label="Order total" value={formatMoney(Number(order.DocTotal) || 0)} />
      </dl>

      {comments && (
        <p className="m-0 mt-2 border-t border-line pt-1.5 text-subtle">
          <span className="font-medium text-body">Comments </span>
          {comments}
        </p>
      )}
    </>
  );
}

/**
 * One whole sales order — the shape the SO picker shows.
 */
export default function SOInfoPanel({
  order,
  addresses,
}: {
  order: SalesOrder;
  addresses: PartyAddress[];
}) {
  return (
    <div>
      <SOInfoHeading order={order} />
      <div className="space-y-1.5">
        <AddressBlock label="Bill to" code={clean(order.PayToCode)} addresses={addresses} />
        <AddressBlock label="Ship to" code={clean(order.ShipToCode)} addresses={addresses} />
      </div>
      <div className="mt-2 border-t border-line pt-1.5">
        <SOInfoFacts order={order} />
      </div>
    </div>
  );
}

export { AddressBlock };

/**
 * Every sales order behind the current draft — the shape the draft page shows.
 *
 * Bill To and Ship To are drawn ONCE, above the list, because they are the
 * same for every order here by construction: `selectedOrderAddressError` in
 * `useSalesInvoice` refuses a draft whose selected orders disagree on either,
 * so a draft that reached this screen has one of each. Repeating them per
 * order would be three copies of one fact and would invite the reader to go
 * looking for a difference that cannot exist.
 */
export function DraftSOInfoPanel({
  orders,
  addresses,
}: {
  orders: SalesOrder[];
  addresses: PartyAddress[];
}) {
  if (orders.length === 0) {
    return <p className="m-0 text-subtle">No sales order is attached to this draft.</p>;
  }

  const [first] = orders;

  return (
    <div>
      <div className="mb-2 border-b border-line pb-2">
        <div className="space-y-1.5">
          <AddressBlock label="Bill to" code={clean(first.PayToCode)} addresses={addresses} />
          <AddressBlock label="Ship to" code={clean(first.ShipToCode)} addresses={addresses} />
        </div>
      </div>

      <p className="m-0 mb-1.5 text-[11px] uppercase tracking-wide text-subtle">
        {orders.length === 1 ? "Sales order" : `${orders.length} sales orders`}
      </p>

      <ul className="m-0 list-none space-y-2 p-0">
        {orders.map((order) => (
          <li className="rounded-sm border border-line bg-surface px-2.5 py-2" key={order.DocEntry}>
            <SOInfoHeading order={order} />
            <SOInfoFacts order={order} />
          </li>
        ))}
      </ul>
    </div>
  );
}
