import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge } from "./badge";
import { toneForStatus } from "./statusTone";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableEmpty,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta = {
  title: "Table",
  component: Table,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Table>;

export default meta;

type Story = StoryObj<typeof meta>;

const ORDERS = [
  { no: "SO-2024-00318", party: "Metro Mart, Andheri", date: "29 Aug 2026", amount: 48250, status: "billed" },
  { no: "SO-2024-00322", party: "Shree Traders, Pune", date: "30 Aug 2026", amount: 12900, status: "pending" },
  { no: "SO-2024-00325", party: "Ganesh Distributors", date: "31 Aug 2026", amount: 76400, status: "need_approval" },
  { no: "SO-2024-00327", party: "Anand Provision Store", date: "1 Sep 2026", amount: 5600, status: "rejected" },
  { no: "SO-2024-00330", party: "Vijay Wholesale", date: "2 Sep 2026", amount: 31150, status: "posted_to_sap" },
];

const inr = (n: number) =>
  n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** The record-list density — App_User, Distributor, Mart_Approval. */
export const Default: Story = {
  render: () => (
    <Table density="comfortable">
      <TableCaption>Recent sales orders</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Order No</TableHead>
          <TableHead>Party</TableHead>
          <TableHead>Order Date</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ORDERS.map((o) => (
          <TableRow key={o.no}>
            <TableCell className="font-semibold text-ink">{o.no}</TableCell>
            <TableCell>{o.party}</TableCell>
            <TableCell>{o.date}</TableCell>
            <TableCell className="tabular-nums">{inr(o.amount)}</TableCell>
            <TableCell>
              <Badge tone={toneForStatus(o.status)}>{o.status.replace(/_/g, " ")}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="tabular-nums">
            {inr(ORDERS.reduce((sum, o) => sum + o.amount, 0))}
          </TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  ),
};

/** The dense-grid density — Einvoice, Ewaybill, line-item tables. */
export const Compact: Story = {
  render: () => (
    <Table density="compact">
      <TableHeader>
        <TableRow>
          <TableHead>Item Code</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Rate</TableHead>
          <TableHead>Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[
          { code: "FG-10231", desc: "Toned Milk 1L — Case of 12", qty: 40, rate: 620 },
          { code: "FG-10245", desc: "Curd Cup 200g — Tray of 24", qty: 25, rate: 480 },
          { code: "FG-10312", desc: "Ghee 1L Tin", qty: 10, rate: 690 },
        ].map((r) => (
          <TableRow key={r.code}>
            <TableCell className="font-medium">{r.code}</TableCell>
            <TableCell>{r.desc}</TableCell>
            <TableCell className="tabular-nums">{r.qty}</TableCell>
            <TableCell className="tabular-nums">{inr(r.rate)}</TableCell>
            <TableCell className="tabular-nums">{inr(r.qty * r.rate)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

/**
 * The "no rows" row stays INSIDE the table, so the header — and the columns
 * it names — stays visible while the reader works out what is missing.
 */
export const Empty: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order No</TableHead>
          <TableHead>Party</TableHead>
          <TableHead>Order Date</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty colSpan={5}>No orders match this filter</TableEmpty>
      </TableBody>
    </Table>
  ),
};
