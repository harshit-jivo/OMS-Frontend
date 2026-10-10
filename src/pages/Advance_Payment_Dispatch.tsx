/**
 * Payments — Send Bills & POs.
 *
 * Open SAP bills and POs, sent to someone who can raise payment requests, who raises the
 * payment request from them: the document lands under "Assigned to Me" on
 * their Payments page, and opening it starts the request form already filled
 * from the document. The SENT tab follows what became of each.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlinePaperAirplane } from "react-icons/hi2";

import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
import { Button } from "../components/ui/button";
import { SearchSelect } from "../components/ui/dropdown";
import { Field, FormGrid, Input, Select } from "../components/ui/form";
import { Card, CardHeader, CardTitle, Notice, Page, PageHeader } from "../components/ui/page";
import { Pagination } from "../components/ui/pagination";
import { SegmentedControl } from "../components/ui/segmented";
import { Tab, TabList } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type ApiAssignment,
  type SapOpenInvoice,
  type SapOpenPurchaseOrder,
} from "../services/advancePaymentService";

import { COMPANIES } from "./advancePayments/constants";
import { formatDateTime } from "./advancePayments/requestLabels";
import { formatDate, formatINR } from "./advancePayments/rules";
import "./advancePayments/sapSkin.css";

type Kind = "BILL" | "PO";
type PageTab = "send" | "sent";

const STATUS = {
  OPEN: { tone: "hold", label: "Waiting" },
  RAISED: { tone: "ok", label: "Request raised" },
  DISMISSED: { tone: "neutral", label: "Dismissed" },
  WITHDRAWN: { tone: "neutral", label: "Withdrawn" },
} as const;

const money = (value: string | undefined) => formatINR(Number(value ?? 0));

const PAGE_SIZE = 50;

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The first day of last month, as YYYY-MM-DD: by default the list shows last month and this month. */
function lastMonthStart(today = new Date()): string {
  return isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1));
}

/** A bill and a PO name their open amount differently. */
const openOf = (row: SapOpenInvoice | SapOpenPurchaseOrder) =>
  "balance_due" in row ? row.balance_due : row.open_amount;

function SendTab({ onSent }: { onSent: (message: string) => void }) {
  const [company, setCompany] = useState<AdvancePaymentCompany | "">("");
  const [kind, setKind] = useState<Kind>("BILL");
  const [vendor, setVendor] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [page, setPage] = useState(1);
  const defaultFrom = useMemo(() => lastMonthStart(), []);
  const today = useMemo(() => isoDate(new Date()), []);
  /** Posted on or after this; blank shows every open document, however old. */
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [recipient, setRecipient] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const client = useQueryClient();

  const vendors = useQuery({
    queryKey: ["advance-payments", "dispatch-vendors", company, vendorSearch],
    queryFn: () => advancePaymentService.vendors(company as AdvancePaymentCompany, vendorSearch || "VENDA"),
    enabled: company !== "",
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const documents = useQuery({
    queryKey: ["advance-payments", "dispatch-documents", kind, company, vendor, search, fromDate, page],
    queryFn: () =>
      advancePaymentService.openForDispatch(kind, company as AdvancePaymentCompany, {
        cardCode: vendor,
        search,
        fromDate,
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
    enabled: company !== "",
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const recipients = useQuery({
    queryKey: ["advance-payments", "assignment-recipients"],
    queryFn: () => advancePaymentService.assignmentRecipients(),
    staleTime: 5 * 60_000,
  });
  const rows = documents.data?.rows ?? [];
  const total = documents.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const send = useMutation({
    mutationFn: () =>
      advancePaymentService.sendAssignments({
        company: company as AdvancePaymentCompany,
        assigned_to: Number(recipient),
        documents: [...picked].map((entry) => ({ kind, sap_doc_entry: entry })),
        note,
      }),
    onSuccess: (made) => {
      const who = recipients.data?.find((r) => r.id === recipient)?.name ?? "them";
      setPicked(new Set());
      setNote("");
      setError("");
      void client.invalidateQueries({ queryKey: ["advance-payments", "assignments"] });
      onSent(`${made.length} ${made.length === 1 ? "document" : "documents"} sent to ${who}.`);
    },
    onError: (err) => setError(advancePaymentError(err)),
  });

  const toggle = (entry: number) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(entry)) next.delete(entry);
      else next.add(entry);
      return next;
    });
  /** A new list: back to its first page, and nothing ticked from the old one. */
  const clearPicks = () => {
    setPicked(new Set());
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-5">
        <FormGrid className="md:grid-cols-2 xl:grid-cols-5">
          <Field label="Company" required>
            {(f) => (
              <Select
                {...f}
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value as AdvancePaymentCompany | "");
                  setVendor("");
                  clearPicks();
                }}
              >
                <option value="">Select company</option>
                {COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Show">
            {() => (
              <SegmentedControl
                aria-label="Bills or POs"
                value={kind}
                onChange={(next) => {
                  setKind(next as Kind);
                  clearPicks();
                }}
                options={[
                  { value: "BILL", label: "Bills" },
                  { value: "PO", label: "Purchase Orders" },
                ]}
              />
            )}
          </Field>
          <Field label="Vendor" hint="Optional: every vendor's when none is chosen.">
            {(f) => (
              <SearchSelect<string>
                id={f.id}
                value={vendor}
                onChange={(next) => {
                  setVendor(next);
                  clearPicks();
                }}
                onQueryChange={setVendorSearch}
                clearLabel="All vendors"
                disabled={!company}
                placeholder="All vendors"
                searchPlaceholder="Search vendor…"
                loading={vendors.isFetching}
                options={(vendors.data ?? [])
                  .filter((v) => v.card_code.startsWith("VENDA"))
                  .map((v) => ({ value: v.card_code, label: v.card_name, hint: v.card_code }))}
              />
            )}
          </Field>
          <Field label="Search" hint="Document number or vendor reference.">
            {(f) => (
              <Input
                {...f}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                disabled={!company}
              />
            )}
          </Field>
          <Field label="Posted From" hint="Clear it to see older documents too.">
            {(f) => (
              <div className="flex items-center gap-2">
                <Input
                  {...f}
                  type="date"
                  max={today}
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    clearPicks();
                  }}
                  disabled={!company}
                />
                {fromDate !== defaultFrom ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setFromDate(defaultFrom);
                      clearPicks();
                    }}
                    disabled={!company}
                  >
                    Reset
                  </Button>
                ) : null}
              </div>
            )}
          </Field>
        </FormGrid>
      </Card>

      {/* Right under the filters, and pinned while the list scrolls: tick, then
          send, without going to the bottom of a 50-row page. */}
      <Card className="sticky top-2 z-10 p-4 shadow-sm md:p-5" aria-label="Send to">
        <div className="grid items-start gap-3 md:grid-cols-[minmax(14rem,1fr)_minmax(14rem,2fr)_auto]">
          <Field
            label="Send To"
            required
            hint="Everyone who can raise payment requests."
            error={recipients.isError ? advancePaymentError(recipients.error) : undefined}
          >
            {(f) => (
              <SearchSelect<number>
                id={f.id}
                value={recipient}
                onChange={setRecipient}
                placeholder="Select user"
                searchPlaceholder="Search user…"
                loading={recipients.isFetching}
                options={(recipients.data ?? []).map((r) => ({ value: r.id, label: r.name, hint: r.username }))}
              />
            )}
          </Field>
          <Field label="Note" hint="Shown to them with the documents.">
            {(f) => (
              <Input {...f} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
            )}
          </Field>
          <div className="flex flex-col gap-1.5 md:pt-[22px]">
            <Button
              onClick={() => send.mutate()}
              disabled={!company || !picked.size || recipient === "" || send.isPending}
            >
              <HiOutlinePaperAirplane className="size-4" aria-hidden />
              {send.isPending ? "Sending…" : `Send ${picked.size || ""} ${picked.size === 1 ? "Document" : "Documents"}`}
            </Button>
            <span className="text-center text-[11.5px] text-subtle">
              {picked.size ? `${picked.size} selected` : "Tick documents below"}
            </span>
          </div>
        </div>
        {error ? (
          <p role="alert" className="m-0 mt-3 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </Card>

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>
            Open {kind === "BILL" ? "Bills" : "Purchase Orders"} in SAP {total ? `(${total})` : ""}
          </CardTitle>
          <span className="text-[12px] text-subtle">
            {!fromDate
              ? "All dates"
              : fromDate === defaultFrom
                ? `Posted since ${formatDate(fromDate)}: last month and this month`
                : `Posted since ${formatDate(fromDate)}`}
          </span>
        </CardHeader>
        {!company ? <p className="m-0 text-[13px] text-subtle">Choose a company to see its open documents.</p> : null}
        {documents.isFetching && !documents.data ? (
          <p className="m-0 text-[13px] text-subtle">Reading SAP…</p>
        ) : null}
        {documents.isError ? (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {advancePaymentError(documents.error)}
          </p>
        ) : null}
        {company && documents.data ? (
          <div className="overflow-x-auto">
            <Table aria-label="Open documents">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>
                    <span className="sr-only">Select</span>
                  </TableHead>
                  <TableHead>{kind === "BILL" ? "Bill" : "PO"}</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Document Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Open in SAP</TableHead>
                  <TableHead className="text-right">Held in OMS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="py-6 text-center text-subtle">
                      Nothing open matches.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const held = row.oms ? Number(row.oms.reserved) + Number(row.oms.paid) : 0;
                    const fullyHeld = row.oms ? Number(row.oms.available) <= 0 : false;
                    const number = row.doc_num ?? row.doc_entry;
                    return (
                      <TableRow key={row.doc_entry} data-picked={picked.has(row.doc_entry) ? "true" : undefined}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Select ${number}`}
                            checked={picked.has(row.doc_entry)}
                            disabled={fullyHeld}
                            title={fullyHeld ? "Other OMS requests already hold all of it." : undefined}
                            onChange={() => toggle(row.doc_entry)}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-ink">
                          {number}
                          {"party_ref" in row && row.party_ref ? (
                            <span className="block text-[11px] text-subtle">Ref {row.party_ref}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {row.card_name}
                          <span className="block text-[11px] text-subtle">{row.card_code}</span>
                        </TableCell>
                        <TableCell>
                          {row.document_date || row.doc_date ? formatDate((row.document_date || row.doc_date) as string) : "—"}
                        </TableCell>
                        <TableCell>{row.due_date ? formatDate(row.due_date) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.doc_total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(openOf(row))}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {held ? formatINR(held) : "—"}
                          {fullyHeld ? <span className="block text-[11px] text-subtle">Fully held</span> : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        ) : null}
        {company && total > PAGE_SIZE ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            summary={`Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
            className="mt-3 border-t border-line pt-3"
          />
        ) : null}
      </Card>

    </div>
  );
}

function SentTab() {
  const client = useQueryClient();
  const sent = useQuery({
    queryKey: ["advance-payments", "assignments", "sent"],
    queryFn: () => advancePaymentService.assignments("sent"),
  });
  const withdraw = useMutation({
    mutationFn: (id: number) => advancePaymentService.assignmentAction(id, "withdraw"),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["advance-payments", "assignments"] }),
  });
  const rows: ApiAssignment[] = sent.data ?? [];
  return (
    <Card className="p-4 md:p-5">
      {sent.isError ? (
        <p role="alert" className="m-0 mb-3 text-[13px] text-danger">
          {advancePaymentError(sent.error)}
        </p>
      ) : null}
      {withdraw.isError ? (
        <p role="alert" className="m-0 mb-3 text-[13px] text-danger">
          {advancePaymentError(withdraw.error)}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <Table aria-label="Sent documents">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Document</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Open When Sent</TableHead>
              <TableHead>Sent To</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-6 text-center text-subtle">
                  {sent.isLoading ? "Loading…" : "Nothing sent yet."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-ink">
                    {row.kind === "BILL" ? "Bill" : "PO"} {row.sap_doc_num}
                    <span className="block text-[11px] text-subtle">{row.company}</span>
                  </TableCell>
                  <TableCell>{row.card_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(row.open_amount)}</TableCell>
                  <TableCell>{row.assigned_to.name}</TableCell>
                  <TableCell>{formatDateTime(row.created_on)}</TableCell>
                  <TableCell>
                    <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                    {row.request ? (
                      <span className="block text-[11px] text-subtle">{row.request.request_no}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.status === "OPEN" ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => withdraw.mutate(row.id)}
                        disabled={withdraw.isPending}
                      >
                        Withdraw
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export default function Advance_Payment_Dispatch() {
  const [tab, setTab] = useState<PageTab>("send");
  const [notice, setNotice] = useState("");
  const crumbs = useMemo(() => [{ label: "Payments" }, { label: "Send Bills & POs" }], []);
  return (
    <Page className="sap-skin">
      <Breadcrumbs items={crumbs} />
      <PageHeader
        eyebrow="Payments"
        title="Send Bills & POs"
        description="Send open SAP bills and POs to someone who can raise payment requests; they raise the request from them."
      />
      {notice ? (
        <Notice tone="ok" title="Sent">
          {notice}
        </Notice>
      ) : null}
      <TabList label="Send Bills & POs">
        <Tab selected={tab === "send"} onClick={() => setTab("send")}>
          Send
        </Tab>
        <Tab
          selected={tab === "sent"}
          onClick={() => {
            setTab("sent");
            setNotice("");
          }}
        >
          Sent
        </Tab>
      </TabList>
      {tab === "send" ? <SendTab onSent={setNotice} /> : <SentTab />}
    </Page>
  );
}
