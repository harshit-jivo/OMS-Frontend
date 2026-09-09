import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  type DialogSize,
} from "./dialog";

const meta = {
  title: "Dialog",
  component: Dialog,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Dialog>;

export default meta;

type Story = StoryObj<typeof meta>;

const triggerClass =
  "inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-[12px] font-semibold text-body hover:bg-surface";

/**
 * `variant="panel"` (the default) — new dialogs, built entirely from the
 * primitive's own header/body/footer parts. This is the shape ~13 of the
 * tracker modals were converted to structurally.
 */
function ConfirmCancelOrderDialog({ size }: { size: DialogSize }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={triggerClass}>Cancel order…</DialogTrigger>
      <DialogContent size={size} title="Cancel order SO-2024-00318">
        <DialogHeader>
          <DialogTitle>Cancel order SO-2024-00318?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            Metro Mart, Andheri — 18 line items, ₹48,250.00. This cannot be
            undone once the order has moved past Pending Approval.
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <button className={triggerClass} onClick={() => setOpen(false)}>
            Keep order
          </button>
          <button
            className="inline-flex h-9 items-center rounded-lg bg-bad px-3.5 text-[12px] font-semibold text-white hover:opacity-90"
            onClick={() => setOpen(false)}
          >
            Cancel order
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Default: Story = {
  render: () => <ConfirmCancelOrderDialog size="sm" />,
};

/**
 * `variant="bare"` — how the other 35 conversions were done. Radix still owns
 * focus trap / Escape / scroll lock / the accessible name; the caller keeps
 * its own panel markup and stylesheet untouched. Stood in for here with
 * inline utility classes playing the part of a page's own `.ir-modal` rule,
 * reproducing Invoice_Review's history trail.
 */
function BareInvoiceTimelineDialog() {
  const [open, setOpen] = useState(false);
  const entries = [
    { status: "Draft", by: "R. Kulkarni", at: "29 Aug, 10:12" },
    { status: "Pending Approval", by: "R. Kulkarni", at: "29 Aug, 10:14" },
    { status: "Edited", by: "S. Iyer", at: "29 Aug, 15:40" },
    { status: "Posted to SAP", by: "system", at: "31 Aug, 09:02" },
  ];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={triggerClass}>View timeline…</DialogTrigger>
      <DialogContent
        variant="bare"
        size="auto"
        title="Invoice INV-2024-00214 timeline"
        showClose={false}
        className="w-[420px] rounded-2xl bg-white p-6 shadow-panel"
      >
        <h3 className="mb-4 text-[15px] font-bold text-ink">
          Invoice INV-2024-00214 — history
        </h3>
        <ol className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.status} className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-body">{e.status}</span>
              <span className="text-subtle">
                {e.by} · {e.at}
              </span>
            </li>
          ))}
        </ol>
        <button
          className={`${triggerClass} mt-5 w-full justify-center`}
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </DialogContent>
    </Dialog>
  );
}

export const Bare: Story = {
  render: () => <BareInvoiceTimelineDialog />,
};
