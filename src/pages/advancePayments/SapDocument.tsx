/**
 * SAP documents as the SAP Business One client shows them.
 *
 * A document number carries SAP's golden link arrow; following it opens the
 * document in a window laid out like the client's own form — the header
 * fields in two columns, a tab strip, and the totals block at the bottom
 * right — and as dense as the client: small type, tight fields, thin rules.
 * Linked documents carry their own arrows, so a bill leads to its goods
 * receipt, PO and payments, and each of those back, window over window.
 *
 * Four documents: A/P Invoice (`/bill-breakdown/`), Purchase Order
 * (`/purchase-order/`), Goods Receipt PO (`/goods-receipt/`) and Outgoing
 * Payment (`/outgoing-payment/`). Each is read live from SAP when its window
 * opens, never before: the desk lists many documents and opens few.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapDocumentLink,
} from "../../services/advancePaymentService";

import { DocumentHistory } from "./DocumentHistory";
import { formatDate, formatINR } from "./rules";
import { SapAttachmentList } from "./SapAttachmentLink";

type DocKind = "bill" | "po" | "grpo" | "payment";

const TITLE: Record<DocKind, string> = {
  bill: "A/P Invoice",
  po: "Purchase Order",
  grpo: "Goods Receipt PO",
  payment: "Outgoing Payment",
};
const money = (value: string | null | undefined) => formatINR(Number(value ?? 0) || 0);
const date = (value: string | null | undefined) => (value ? formatDate(value) : "");
const account = (code: string, name: string) => (code ? (name ? `${code} - ${name}` : code) : "");
const numberOf = (d: { doc_num: number | null; doc_entry: number }) => String(d.doc_num ?? d.doc_entry);

/** SAP's own palette: field borders, the grid head, the window ground. */
const LINE = "border-[#c4c9d0]";

/* ── The pieces SAP's forms are made of ─────────────────────────────────── */

/** SAP's link arrow: the small golden button beside a linked value. */
export function GoldenArrow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-grid size-[13px] shrink-0 place-items-center rounded-[2px] bg-[#f0ab00] text-white hover:bg-[#d48f00] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d48f00]"
    >
      <svg viewBox="0 0 8 8" className="size-[7px]" aria-hidden="true">
        <path d="M2 1 L6 4 L2 7 Z" fill="currentColor" />
      </svg>
    </button>
  );
}

/** A label and its value, as one row of a SAP header: the value in a field box. */
function SapField({ label, value, link }: { label: string; value: React.ReactNode; link?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-1.5">
      <span className="truncate text-[11px] text-[#4a5361]">{label}</span>
      <span
        className={cn(
          "flex h-[20px] min-w-0 items-center gap-1 rounded-[2px] border bg-white px-1.5 text-[11.5px] text-ink",
          LINE,
        )}
      >
        {link}
        <span className="truncate">{value || " "}</span>
      </span>
    </div>
  );
}

/** The totals block at the bottom right of every SAP marketing document. */
function SapTotals({ rows }: { rows: Array<{ label: string; value: string; strong?: boolean } | null> }) {
  return (
    <div className="ml-auto grid w-full max-w-[19rem] gap-[3px]">
      {rows.map((row) =>
        row ? (
          <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-1.5">
            <span className={cn("text-right text-[11px]", row.strong ? "font-semibold text-ink" : "text-[#4a5361]")}>
              {row.label}
            </span>
            <span
              className={cn(
                "flex h-[20px] items-center justify-end rounded-[2px] border bg-white px-1.5 text-[11.5px] tabular-nums text-ink",
                LINE,
                row.strong && "font-semibold",
              )}
            >
              {row.value}
            </span>
          </div>
        ) : null,
      )}
    </div>
  );
}

/** A SAP matrix: the grid of a document's rows, with its column heads. */
function SapGrid({
  label,
  columns,
  rows,
  empty,
}: {
  label: string;
  columns: Array<{ head: string; right?: boolean }>;
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (!rows.length) return <p className="m-0 px-1 py-2 text-[11.5px] text-subtle">{empty}</p>;
  return (
    <div className={cn("overflow-x-auto border", LINE)}>
      <table aria-label={label} className="w-full border-collapse text-[11.5px] leading-tight">
        <thead>
          <tr className="bg-[#e4e8ee]">
            <th className={cn("w-6 border-b px-1.5 py-[3px] text-left font-semibold text-[#4a5361]", LINE)}>#</th>
            {columns.map((c) => (
              <th
                key={c.head}
                className={cn(
                  "whitespace-nowrap border-b border-l px-1.5 py-[3px] font-semibold text-[#4a5361]",
                  LINE,
                  c.right ? "text-right" : "text-left",
                )}
              >
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="odd:bg-white even:bg-[#f6f7f9] hover:bg-[#fff7dd]">
              <td className="border-b border-[#e1e4e9] px-1.5 py-[2px] text-subtle">{i + 1}</td>
              {cells.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    "border-b border-l border-[#e1e4e9] px-1.5 py-[2px] text-ink",
                    columns[j]?.right ? "text-right tabular-nums" : "",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** SAP's tab strip: small flat tabs, the open one joined to its page. */
function SapTabs({
  tabs,
  current,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  current: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Document" className={cn("flex flex-wrap gap-[2px] border-b", LINE)}>
      {tabs.map((t) => {
        const selected = t.id === current;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px rounded-t-[3px] border px-2.5 py-[3px] text-[11.5px]",
              LINE,
              selected ? "border-b-white bg-white font-semibold text-ink" : "bg-[#e4e8ee] text-[#4a5361] hover:bg-[#eef1f5]",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** The window: header, tab strip, a tab's page, and the totals. */
function SapWindow({
  header,
  tabs,
  totals,
}: {
  header: { left: React.ReactNode; right: React.ReactNode };
  tabs: Array<{ id: string; label: string; body: React.ReactNode }>;
  totals?: React.ReactNode;
}) {
  const [tab, setTab] = React.useState(tabs[0]?.id ?? "");
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <div className="flex flex-col gap-2 bg-[#f2f4f7] p-2">
      <div className="grid gap-x-5 gap-y-[3px] md:grid-cols-2">
        <div className="grid content-start gap-[3px]">{header.left}</div>
        <div className="grid content-start gap-[3px]">{header.right}</div>
      </div>
      <div>
        <SapTabs tabs={tabs} current={current?.id ?? ""} onChange={setTab} />
        <div role="tabpanel" className={cn("min-h-[7rem] border border-t-0 bg-white p-1.5", LINE)}>
          {current?.body}
        </div>
      </div>
      {totals}
    </div>
  );
}

function Status({ query }: { query: { isPending: boolean; isError: boolean; error: unknown } }) {
  if (query.isPending) return <p className="m-0 p-3 text-[12px] text-subtle">Reading the document from SAP…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="m-0 p-3 text-[12px] text-danger">
        {advancePaymentError(query.error)}
      </p>
    );
  }
  return null;
}

/** A linked document's number: with its arrow where OMS can open it. */
function LinkedNumber({ company, link }: { company: AdvancePaymentCompany; link: SapDocumentLink }) {
  return <SapDocLink company={company} kind={link.kind} docEntry={link.doc_entry} number={numberOf(link)} />;
}

function LinksGrid({ company, links }: { company: AdvancePaymentCompany; links: SapDocumentLink[] }) {
  return (
    <SapGrid
      label="Linked documents"
      columns={[{ head: "Document" }, { head: "No." }, { head: "Date" }, { head: "Amount", right: true }]}
      rows={links.map((l) => [l.kind_label, <LinkedNumber company={company} link={l} />, date(l.doc_date) || "—", money(l.amount)])}
      empty="Nothing linked in SAP."
    />
  );
}

/* ── A/P Invoice ────────────────────────────────────────────────────────── */

function BillWindow({ company, docEntry }: { company: AdvancePaymentCompany; docEntry: number }) {
  const query = useQuery({
    queryKey: ["advance-payments", "bill-breakdown", company, docEntry],
    queryFn: () => advancePaymentService.billBreakdown(company, docEntry),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  if (!query.data) return <Status query={query} />;
  const { header: h, lines, gst, tds, links } = query.data;

  return (
    <SapWindow
      header={{
        left: (
          <>
            <SapField label="Vendor" value={<SapPartnerLink company={company} cardCode={h.card_code} name={h.card_code} />} />
            <SapField label="Name" value={h.card_name} />
            <SapField label="Vendor Ref. No." value={h.vendor_ref} />
            <SapField label="Payable Account" value={account(h.payable_account, h.payable_account_name)} />
          </>
        ),
        right: (
          <>
            <SapField label="No." value={numberOf(h)} />
            <SapField label="Status" value={h.status} />
            <SapField label="Posting Date" value={date(h.doc_date)} />
            <SapField label="Due Date" value={date(h.due_date)} />
            <SapField label="Document Date" value={date(h.document_date)} />
          </>
        ),
      }}
      tabs={[
        {
          id: "contents",
          label: "Contents",
          body: (
            <SapGrid
              label={`Contents of A/P invoice ${numberOf(h)}`}
              columns={[
                { head: "Item / Description" },
                { head: "G/L Account" },
                { head: "Tax Code" },
                { head: "Total (LC)", right: true },
                { head: "Tax Amount", right: true },
              ]}
              rows={lines.map((l) => [
                [l.item_code, l.description].filter(Boolean).join(" - ") || "—",
                account(l.account, l.account_name) || "—",
                l.tax_code || "—",
                money(l.taxable),
                money(l.gst),
              ])}
              empty="No lines."
            />
          ),
        },
        {
          id: "accounting",
          label: "Accounting",
          body: (
            <div className="grid gap-1.5">
              <SapField label="Payable Account" value={account(h.payable_account, h.payable_account_name)} />
              <SapGrid
                label="Tax"
                columns={[
                  { head: "Tax" },
                  { head: "Account" },
                  { head: "Base Amount", right: true },
                  { head: "Amount", right: true },
                ]}
                rows={[
                  ...gst.map((g) => [g.code, account(g.account, g.account_name) || "—", money(g.base), money(g.amount)]),
                  ...tds.map((t) => [
                    `WTax ${t.code} @ ${Number(t.rate) || 0}%${t.name ? ` — ${t.name}` : ""}`,
                    account(t.account, t.account_name) || "—",
                    money(t.taxable),
                    `− ${money(t.amount)}`,
                  ]),
                ]}
                empty="No GST or TDS on this invoice."
              />
            </div>
          ),
        },
        {
          id: "attachments",
          label: "Attachments",
          body: <SapAttachmentList company={company} kind="bill" docEntry={docEntry} />,
        },
        { id: "links", label: "Linked Documents", body: <LinksGrid company={company} links={links} /> },
        {
          id: "oms",
          label: "OMS Payments",
          body: <DocumentHistory target={{ company, kind: "bill", docEntry, line: 0 }} />,
        },
      ]}
      totals={
        <SapTotals
          rows={[
            { label: "Total Before Discount", value: money(h.taxable) },
            Number(h.discount) ? { label: "Discount", value: money(h.discount) } : null,
            Number(h.freight) ? { label: "Freight", value: money(h.freight) } : null,
            { label: "Tax", value: money(h.gst) },
            { label: "WTax Amount", value: Number(h.tds) ? `− ${money(h.tds)}` : formatINR(0) },
            Number(h.rounding) ? { label: "Rounding", value: money(h.rounding) } : null,
            { label: "Total Payment Due", value: money(h.net), strong: true },
            { label: "Applied Amount", value: money(h.paid) },
            { label: "Balance Due", value: money(h.balance), strong: true },
          ]}
        />
      }
    />
  );
}

/* ── Purchase Order ─────────────────────────────────────────────────────── */

function PoWindow({ company, docEntry }: { company: AdvancePaymentCompany; docEntry: number }) {
  const query = useQuery({
    queryKey: ["advance-payments", "purchase-order", company, docEntry],
    queryFn: () => advancePaymentService.purchaseOrder(company, docEntry),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  if (!query.data) return <Status query={query} />;
  const { header: h, lines, follow_on } = query.data;
  const before = lines.reduce((sum, l) => sum + (Number(l.line_total) || 0), 0);

  return (
    <SapWindow
      header={{
        left: (
          <>
            <SapField label="Vendor" value={<SapPartnerLink company={company} cardCode={h.card_code} name={h.card_code} />} />
            <SapField label="Name" value={h.card_name} />
            <SapField label="Vendor Ref. No." value={h.vendor_ref} />
            <SapField label="Pay To" value={h.pay_to} />
            <SapField label="Branch" value={h.branch} />
          </>
        ),
        right: (
          <>
            <SapField label="No." value={numberOf(h)} />
            <SapField label="Status" value={h.status} />
            <SapField label="Posting Date" value={date(h.doc_date)} />
            <SapField label="Delivery Date" value={date(h.delivery_date)} />
            <SapField label="Document Date" value={date(h.document_date)} />
          </>
        ),
      }}
      tabs={[
        {
          id: "contents",
          label: "Contents",
          body: (
            <SapGrid
              label={`Contents of purchase order ${numberOf(h)}`}
              columns={[
                { head: "Item No." },
                { head: "Description" },
                { head: "Quantity", right: true },
                { head: "Open Qty", right: true },
                { head: "Unit Price", right: true },
                { head: "Tax Code" },
                { head: "Total (LC)", right: true },
                { head: "Whse" },
              ]}
              rows={lines.map((l) => [
                l.item_code || "—",
                l.description || "—",
                l.quantity ?? "—",
                l.open_quantity ?? "—",
                money(l.price),
                l.tax_code || "—",
                money(l.line_total),
                l.warehouse || "—",
              ])}
              empty="No lines."
            />
          ),
        },
        {
          id: "links",
          label: "Linked Documents",
          body: (
            <SapGrid
              label="Linked documents"
              columns={[
                { head: "Document" },
                { head: "No." },
                { head: "Date" },
                { head: "Vendor Ref." },
                { head: "Total", right: true },
                { head: "Status" },
              ]}
              rows={follow_on.map((d) => [
                d.kind_label,
                <SapDocLink company={company} kind={d.kind} docEntry={d.doc_entry} number={numberOf(d)} />,
                date(d.doc_date) || "—",
                d.vendor_ref || "—",
                money(d.doc_total),
                d.status || "—",
              ])}
              empty="Nothing made from it yet."
            />
          ),
        },
        {
          id: "attachments",
          label: "Attachments",
          body: <SapAttachmentList company={company} kind="po" docEntry={docEntry} />,
        },
        {
          id: "oms",
          label: "OMS Payments",
          body: <DocumentHistory target={{ company, kind: "po", docEntry, line: 0 }} />,
        },
      ]}
      totals={
        <SapTotals
          rows={[
            { label: "Total Before Discount", value: formatINR(before) },
            Number(h.discount) ? { label: "Discount", value: money(h.discount) } : null,
            Number(h.freight) ? { label: "Freight", value: money(h.freight) } : null,
            { label: "Tax", value: money(h.tax) },
            Number(h.rounding) ? { label: "Rounding", value: money(h.rounding) } : null,
            { label: "Total Payment Due", value: money(h.doc_total), strong: true },
            { label: "Received", value: money(h.paid_to_date) },
          ]}
        />
      }
    />
  );
}

/* ── Goods Receipt PO ───────────────────────────────────────────────────── */

function GrpoWindow({ company, docEntry }: { company: AdvancePaymentCompany; docEntry: number }) {
  const query = useQuery({
    queryKey: ["advance-payments", "goods-receipt", company, docEntry],
    queryFn: () => advancePaymentService.goodsReceipt(company, docEntry),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  if (!query.data) return <Status query={query} />;
  const { header: h, lines, links } = query.data;

  return (
    <SapWindow
      header={{
        left: (
          <>
            <SapField label="Vendor" value={<SapPartnerLink company={company} cardCode={h.card_code} name={h.card_code} />} />
            <SapField label="Name" value={h.card_name} />
            <SapField label="Vendor Ref. No." value={h.vendor_ref} />
            <SapField label="Branch" value={h.branch} />
          </>
        ),
        right: (
          <>
            <SapField label="No." value={numberOf(h)} />
            <SapField label="Status" value={h.status} />
            <SapField label="Posting Date" value={date(h.doc_date)} />
            <SapField label="Delivery Date" value={date(h.due_date)} />
            <SapField label="Document Date" value={date(h.document_date)} />
          </>
        ),
      }}
      tabs={[
        {
          id: "contents",
          label: "Contents",
          body: (
            <SapGrid
              label={`Contents of goods receipt ${numberOf(h)}`}
              columns={[
                { head: "Item No." },
                { head: "Description" },
                { head: "Quantity", right: true },
                { head: "Unit Price", right: true },
                { head: "Tax Code" },
                { head: "Total (LC)", right: true },
                { head: "Whse" },
                { head: "G/L Account" },
              ]}
              rows={lines.map((l) => [
                l.item_code || "—",
                l.description || "—",
                Number(l.quantity).toLocaleString("en-IN"),
                money(l.price),
                l.tax_code || "—",
                money(l.line_total),
                l.warehouse || "—",
                account(l.account, l.account_name) || "—",
              ])}
              empty="No lines."
            />
          ),
        },
        { id: "links", label: "Linked Documents", body: <LinksGrid company={company} links={links} /> },
        {
          id: "attachments",
          label: "Attachments",
          body: <SapAttachmentList company={company} kind="grpo" docEntry={docEntry} />,
        },
        ...(h.remarks
          ? [{ id: "remarks", label: "Remarks", body: <p className="m-0 p-1 text-[11.5px] text-ink">{h.remarks}</p> }]
          : []),
      ]}
      totals={
        <SapTotals
          rows={[
            { label: "Total Before Discount", value: money(h.before_discount) },
            Number(h.discount) ? { label: "Discount", value: money(h.discount) } : null,
            Number(h.freight) ? { label: "Freight", value: money(h.freight) } : null,
            { label: "Tax", value: money(h.tax) },
            Number(h.rounding) ? { label: "Rounding", value: money(h.rounding) } : null,
            { label: "Total", value: money(h.total), strong: true },
          ]}
        />
      }
    />
  );
}

/* ── Outgoing Payment ───────────────────────────────────────────────────── */

function PaymentWindow({ company, docEntry }: { company: AdvancePaymentCompany; docEntry: number }) {
  const query = useQuery({
    queryKey: ["advance-payments", "outgoing-payment", company, docEntry],
    queryFn: () => advancePaymentService.outgoingPayment(company, docEntry),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  if (!query.data) return <Status query={query} />;
  const { header: h, documents, accounts } = query.data;

  return (
    <SapWindow
      header={{
        left: (
          <>
            <SapField label={h.paid_to === "Account" ? "Paid To" : h.paid_to} value={h.card_code} />
            <SapField label="Name" value={h.card_name} />
            <SapField label="Reference" value={h.reference} />
            <SapField label="Branch" value={h.branch} />
          </>
        ),
        right: (
          <>
            <SapField label="No." value={numberOf(h)} />
            <SapField label="Status" value={h.status} />
            <SapField label="Posting Date" value={date(h.doc_date)} />
            <SapField label="Due Date" value={date(h.due_date)} />
            <SapField label="Document Date" value={date(h.document_date)} />
          </>
        ),
      }}
      tabs={[
        {
          id: "paid",
          label: h.paid_to === "Account" ? "Accounts" : "Documents Paid",
          body:
            h.paid_to === "Account" ? (
              <SapGrid
                label="Accounts paid"
                columns={[{ head: "G/L Account" }, { head: "Description" }, { head: "Amount", right: true }]}
                rows={accounts.map((a) => [account(a.account, a.account_name) || "—", a.description || "—", money(a.applied)])}
                empty="No account lines."
              />
            ) : (
              <SapGrid
                label="Documents paid"
                columns={[
                  { head: "Document" },
                  { head: "No." },
                  { head: "Vendor Ref." },
                  { head: "WTax", right: true },
                  { head: "Total Payment", right: true },
                ]}
                rows={documents.map((d) => [
                  d.kind_label,
                  d.inv_type === 18 ? (
                    <SapDocLink company={company} kind="bill" docEntry={d.doc_entry} number={numberOf(d)} />
                  ) : (
                    numberOf(d)
                  ),
                  d.vendor_ref || "—",
                  Number(d.tds) ? money(d.tds) : "—",
                  money(d.applied),
                ])}
                empty="Paid on account: applied to no document."
              />
            ),
        },
        {
          id: "means",
          label: "Payment Means",
          body: (
            <div className="grid gap-[3px] md:max-w-[32rem]">
              <SapField label="Bank Transfer G/L" value={account(h.transfer_account, h.transfer_account_name)} />
              <SapField label="Transfer Date" value={date(h.transfer_date)} />
              <SapField label="Transfer Reference" value={h.transfer_ref} />
              <SapField label="Transfer Amount" value={Number(h.transfer_sum) ? money(h.transfer_sum) : ""} />
              {Number(h.cash_sum) ? (
                <>
                  <SapField label="Cash G/L" value={account(h.cash_account, h.cash_account_name)} />
                  <SapField label="Cash Amount" value={money(h.cash_sum)} />
                </>
              ) : null}
              {Number(h.check_sum) ? <SapField label="Cheque Amount" value={money(h.check_sum)} /> : null}
            </div>
          ),
        },
        {
          id: "fields",
          label: "User Fields",
          body: (
            <div className="grid gap-[3px] md:max-w-[32rem]">
              <SapField label="Payment Mode" value={h.payment_mode} />
              <SapField label="Urgency" value={h.urgency === "H" ? "HIGH" : h.urgency} />
              <SapField label="Type of Advance" value={h.type_of_advance} />
              <SapField label="Adv. Settlement Date" value={date(h.settle_by)} />
            </div>
          ),
        },
        {
          id: "attachments",
          label: "Attachments",
          body: <SapAttachmentList company={company} kind="payment" docEntry={docEntry} />,
        },
        ...(h.remarks || h.journal_memo
          ? [
              {
                id: "remarks",
                label: "Remarks",
                body: (
                  <div className="grid gap-[3px]">
                    <SapField label="Remarks" value={h.remarks} />
                    <SapField label="Journal Remarks" value={h.journal_memo} />
                  </div>
                ),
              },
            ]
          : []),
      ]}
      totals={
        <SapTotals
          rows={[
            Number(h.on_account) ? { label: "Payment on Account", value: money(h.on_account) } : null,
            { label: "Total Amount Due", value: money(h.total), strong: true },
          ]}
        />
      }
    />
  );
}

/* ── Business Partner: the account (open items) ───────────────────────── */

/** SAP object type of a ledger line -> the window that opens it, where there is one. */
const LEDGER_WINDOW: Partial<Record<number, DocKind>> = { 18: "bill", 46: "payment", 22: "po", 20: "grpo" };

function LedgerWindow({ company, cardCode, name }: { company: AdvancePaymentCompany; cardCode: string; name: string }) {
  const query = useQuery({
    queryKey: ["advance-payments", "partner-ledger", company, cardCode],
    queryFn: () => advancePaymentService.partnerLedger(company, cardCode),
    staleTime: 60_000,
    retry: 1,
  });
  if (!query.data) return <Status query={query} />;
  const { summary, results } = query.data;

  return (
    <SapWindow
      header={{
        left: (
          <>
            <SapField label="Code" value={cardCode} />
            <SapField label="Name" value={name} />
          </>
        ),
        right: (
          <>
            <SapField label="Open Items" value={String(summary.open_count)} />
            <SapField label="Overdue" value={summary.overdue_count ? String(summary.overdue_count) : "None"} />
          </>
        ),
      }}
      tabs={[
        {
          id: "open",
          label: "Open Items",
          body: (
            <SapGrid
              label={`Open items of ${name}`}
              columns={[
                { head: "Document" },
                { head: "No." },
                { head: "Ref." },
                { head: "Posting Date" },
                { head: "Due Date" },
                { head: "Overdue", right: true },
                { head: "Debit", right: true },
                { head: "Credit", right: true },
              ]}
              rows={results.map((row) => {
                const kind = row.doc_type_code != null ? LEDGER_WINDOW[row.doc_type_code] : undefined;
                const open = money(row.open_amount);
                return [
                  row.doc_type,
                  kind && row.doc_entry != null ? (
                    <SapDocLink company={company} kind={kind} docEntry={row.doc_entry} number={row.doc_num} />
                  ) : (
                    row.doc_num || "—"
                  ),
                  row.party_ref || "—",
                  date(row.posting_date) || "—",
                  date(row.due_date) || "—",
                  (row.days_overdue ?? 0) > 0 ? (
                    <span className="font-semibold text-danger">{row.days_overdue} d</span>
                  ) : (
                    "—"
                  ),
                  row.direction === "DEBIT" ? open : "",
                  row.direction === "CREDIT" ? open : "",
                ];
              })}
              empty="Nothing open in SAP."
            />
          ),
        },
      ]}
      totals={
        <SapTotals
          rows={[
            { label: "Open Debit", value: money(summary.open_debit) },
            { label: "Open Credit", value: money(summary.open_credit) },
            {
              label: `Balance${summary.net_open_means ? ` (${summary.net_open_means})` : ""}`,
              value: money(summary.net_open),
              strong: true,
            },
          ]}
        />
      }
    />
  );
}

/** A business partner with SAP's golden arrow; the arrow opens their account. */
export function SapPartnerLink({
  company,
  cardCode,
  name,
}: {
  company: AdvancePaymentCompany;
  cardCode: string;
  name: string;
}) {
  const [open, setOpen] = React.useState(false);
  const shown = name || cardCode;
  return (
    <span className="inline-flex items-center gap-1">
      <GoldenArrow label={`Open the ledger of ${shown}`} onClick={() => setOpen(true)} />
      <span>{shown}</span>
      {open ? (
        <Dialog open onOpenChange={(next) => (next ? null : setOpen(false))}>
          <DialogContent
            title={`Business Partner ${shown}`}
            description={`Open items in SAP, in ${company}.`}
            size="xl"
            className="max-w-[1080px] rounded-md"
          >
            <DialogHeader className={cn("gap-2 border-b bg-[#dfe4ea] px-3 py-1.5 pr-12", LINE)}>
              <DialogTitle className="text-[13px] font-semibold">Business Partner — Account Balance</DialogTitle>
              <span className="text-[11px] text-subtle">{company}</span>
            </DialogHeader>
            <DialogBody className="p-0">
              <LedgerWindow company={company} cardCode={cardCode} name={name || cardCode} />
            </DialogBody>
          </DialogContent>
        </Dialog>
      ) : null}
    </span>
  );
}

/* ── The link ───────────────────────────────────────────────────────────── */

const WINDOWS: Record<DocKind, (props: { company: AdvancePaymentCompany; docEntry: number }) => React.ReactElement> = {
  bill: BillWindow,
  po: PoWindow,
  grpo: GrpoWindow,
  payment: PaymentWindow,
};

/** A document number with SAP's golden arrow; the arrow opens the document. */
export function SapDocLink({
  company,
  kind,
  docEntry,
  number,
}: {
  company: AdvancePaymentCompany;
  kind: DocKind;
  docEntry: number;
  number: string;
}) {
  const [open, setOpen] = React.useState(false);
  const Window = WINDOWS[kind];
  return (
    <span className="inline-flex items-center gap-1">
      <GoldenArrow label={`Open ${TITLE[kind]} ${number}`} onClick={() => setOpen(true)} />
      <span>{number}</span>
      {open ? (
        <Dialog open onOpenChange={(next) => (next ? null : setOpen(false))}>
          <DialogContent
            title={`${TITLE[kind]} ${number}`}
            description={`As SAP holds it, in ${company}.`}
            size="xl"
            className="max-w-[1080px] rounded-md"
          >
            {/* SAP's title bar: the document type and number, slim. */}
            <DialogHeader className={cn("gap-2 border-b bg-[#dfe4ea] px-3 py-1.5 pr-12", LINE)}>
              <DialogTitle className="text-[13px] font-semibold">
                {TITLE[kind]} {number}
              </DialogTitle>
              <span className="text-[11px] text-subtle">{company}</span>
            </DialogHeader>
            <DialogBody className="p-0">
              <Window company={company} docEntry={docEntry} />
            </DialogBody>
          </DialogContent>
        </Dialog>
      ) : null}
    </span>
  );
}
