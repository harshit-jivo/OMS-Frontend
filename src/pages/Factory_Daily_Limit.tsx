/**
 * Payments — Factory Daily Limit.
 *
 * Ziyaul's cap on each day's Factory payment requests, Oil and Beverages each
 * on its own (user, 2026-10-15/16): what counts is the server's
 * (`services/daily_limit.py`) — Department Factory or FACT_COM, or a factory
 * purpose (packing material, raw material other than oil, semi-finished,
 * fixed-asset consumables) in any department; never an oil purchase.
 *
 * Everyone who raises payments may read it; only Ziyaul sets it. With no
 * limit set today, the last one carries forward. Beside it, SAP's open bills
 * on factory spending other than oil, to set it by.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineBanknotes,
  HiOutlineBuildingOffice2,
  HiOutlineDocumentText,
  HiOutlineScale,
} from "react-icons/hi2";

import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
import { Button } from "../components/ui/button";
import { Field, Input } from "../components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  Notice,
  Page,
  PageHeader,
  Stat,
  StatRow,
} from "../components/ui/page";
import { SegmentedControl } from "../components/ui/segmented";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  advancePaymentError,
  advancePaymentService,
  type FactoryLimit,
  type FactoryLimitCompany,
} from "../services/advancePaymentService";

import { FACTORY_LIMIT_KEY } from "./advancePayments/factoryLimitData";
import { RupeeInput } from "./advancePayments/PaymentSections";
import { formatDateTime } from "./advancePayments/requestLabels";
import { formatDate, formatINR, todayIso } from "./advancePayments/rules";
import "./advancePayments/sapSkin.css";

const COMPANIES: ReadonlyArray<{ value: FactoryLimitCompany; label: string }> = [
  { value: "OIL", label: "Oil" },
  { value: "BEVERAGES", label: "Beverages" },
];

const STATUS: Record<string, { label: string; tone: "hold" | "info" | "ok" }> = {
  IN_APPROVAL: { label: "In approval", tone: "hold" },
  RETURNED: { label: "Returned", tone: "info" },
  COMPLETED: { label: "Completed", tone: "ok" },
};

const money = (value: string | null | undefined) => formatINR(Number(value ?? 0));

/** Ziyaul's box: the limit for today, or a later day set ahead. */
function SetLimit({ data }: { data: FactoryLimit }) {
  const client = useQueryClient();
  const today = todayIso();
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(today);
  const [message, setMessage] = useState("");
  const save = useMutation({
    mutationFn: () =>
      advancePaymentService.setFactoryLimit(data.company, amount, day === today ? undefined : day),
    onSuccess: (fresh) => {
      setMessage(`Saved: ${money(amount)} for ${formatDate(day)}.`);
      setAmount("");
      if (day === today) client.setQueryData([...FACTORY_LIMIT_KEY, data.company], fresh);
      void client.invalidateQueries({ queryKey: FACTORY_LIMIT_KEY });
    },
    onError: () => setMessage(""),
  });
  const value = Number(amount);
  return (
    <Card className="p-4 md:p-5">
      <CardHeader>
        <CardTitle>Set the limit</CardTitle>
      </CardHeader>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Limit" required>
          {(f) => (
            <RupeeInput
              {...f}
              inputMode="decimal"
              placeholder={data.limit ? data.limit.amount : "Enter amount"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field label="For">
          {(f) => (
            <Input
              {...f}
              type="date"
              min={today}
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" disabled={!(value > 0) || save.isPending}>
          {save.isPending ? "Saving…" : "Save limit"}
        </Button>
      </form>
      {save.isError ? (
        <Notice className="mt-3" tone="bad" title="Not saved">
          {advancePaymentError(save.error)}
        </Notice>
      ) : null}
      {message ? (
        <Notice className="mt-3" tone="ok" title="Factory daily limit">
          {message}
        </Notice>
      ) : null}
    </Card>
  );
}

function Body({ data }: { data: FactoryLimit }) {
  const limit = data.limit;
  const left = data.left === null ? null : Number(data.left);
  return (
    <div className="space-y-4">
      <StatRow>
        <Stat
          label="Today's limit"
          icon={HiOutlineScale}
          tone="brand"
          value={limit ? money(limit.amount) : "Not set"}
          hint={
            limit
              ? limit.carried
                ? `Carried from ${formatDate(limit.day)} (set by ${limit.set_by})`
                : `Set by ${limit.set_by}, ${formatDateTime(limit.set_on)}`
              : `Only ${data.setter} can set it.`
          }
        />
        <Stat
          label="Raised today"
          icon={HiOutlineBanknotes}
          value={money(data.used)}
          hint={`${data.requests.length} Factory ${data.requests.length === 1 ? "request" : "requests"}, oil excluded`}
        />
        <Stat
          label="Left today"
          icon={HiOutlineBuildingOffice2}
          tone={left === null ? "neutral" : left <= 0 ? "bad" : "ok"}
          value={left === null ? "—" : money(data.left)}
          hint={left !== null && left <= 0 ? "No more Factory requests today" : undefined}
        />
        <Stat
          label="Open SAP bills (Factory, not oil)"
          icon={HiOutlineDocumentText}
          tone="hold"
          value={data.open_bills ? formatINR(Math.round(Number(data.open_bills.open))) : "—"}
          hint={
            data.open_bills
              ? `${data.open_bills.bills} bills · packing material ${formatINR(Math.round(Number(data.open_bills.packing)))}`
              : "SAP could not be read"
          }
        />
      </StatRow>

      {data.can_set ? <SetLimit data={data} /> : null}

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>Today&apos;s Factory requests</CardTitle>
        </CardHeader>
        {data.requests.length === 0 ? (
          <p className="mt-3 text-[13px] text-subtle">None raised yet today.</p>
        ) : (
          <Table className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Pay to</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Raised by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-ink">{r.request_no}</TableCell>
                  <TableCell>{r.partner_name}</TableCell>
                  <TableCell>{r.budget_code || "—"}</TableCell>
                  <TableCell>{r.purpose_label || "—"}</TableCell>
                  <TableCell>
                    <Badge tone={STATUS[r.status]?.tone ?? "neutral"}>
                      {STATUS[r.status]?.label ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.raised_by}
                    <span className="block text-[11.5px] text-subtle">
                      {formatDateTime(r.raised_on)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {money(r.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>Last {data.history.length} days</CardTitle>
        </CardHeader>
        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              <TableHead className="text-right">Limit</TableHead>
              <TableHead className="text-right">Raised</TableHead>
              <TableHead className="text-right">Left / over</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.history.map((h) => {
              const rest = h.limit === null ? null : Number(h.limit) - Number(h.used);
              return (
                <TableRow key={h.day}>
                  <TableCell>{formatDate(h.day)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {h.limit === null ? "—" : money(h.limit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(h.used)}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${rest !== null && rest < 0 ? "font-semibold text-bad" : ""}`}
                  >
                    {rest === null ? "—" : rest < 0 ? `${formatINR(-rest)} over` : formatINR(rest)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {data.changes.length ? (
        <Card className="p-4 md:p-5">
          <CardHeader>
            <CardTitle>Changes to the limit</CardTitle>
          </CardHeader>
          <ul className="mt-3 list-none space-y-1.5 pl-0 text-[13px]">
            {data.changes.map((c, i) => (
              <li key={i}>
                <span className="font-medium text-ink">{formatDate(c.day)}</span>:{" "}
                {c.old === null ? "set to" : `${money(c.old)} →`} <b>{money(c.new)}</b>{" "}
                <span className="text-subtle">
                  by {c.by}, {formatDateTime(c.on)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export default function Factory_Daily_Limit() {
  const [company, setCompany] = useState<FactoryLimitCompany>("OIL");
  const crumbs = useMemo(() => [{ label: "Payments" }, { label: "Factory Daily Limit" }], []);
  const query = useQuery({
    queryKey: [...FACTORY_LIMIT_KEY, company],
    queryFn: () => advancePaymentService.factoryLimit(company),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return (
    <Page className="sap-skin">
      <Breadcrumbs items={crumbs} />
      <PageHeader
        eyebrow="Payments"
        title="Factory Daily Limit"
        description="How much may be raised each day in Factory payment requests — oil purchases excluded. Set by Ziyaul; a day without its own limit keeps the last one."
      />
      {query.data && !query.data.enabled ? (
        <Notice tone="hold" title="Switched off">
          The daily limit is not being applied: requests are not held back by it.
        </Notice>
      ) : null}
      <SegmentedControl
        aria-label="Company"
        value={company}
        onChange={setCompany}
        options={COMPANIES}
      />
      <div className="mt-4">
        {query.isError ? (
          <Notice tone="bad" title="Could not load the limit">
            {advancePaymentError(query.error)}
          </Notice>
        ) : query.data ? (
          <Body data={query.data} />
        ) : (
          <p className="text-[13px] text-subtle" role="status">
            Loading…
          </p>
        )}
      </div>
    </Page>
  );
}
