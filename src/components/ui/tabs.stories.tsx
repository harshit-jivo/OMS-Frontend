import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Tab, TabList } from "./tabs";

const meta = {
  title: "Tabs",
  component: TabList,
  parameters: { layout: "padded" },
  // Both stories below supply their own `render` and build their own
  // `TabList`/`Tab` tree, but `label` is required — a well-typed default here
  // is what lets `StoryObj<typeof meta>` resolve without repeating it.
  args: { label: "Tabs" },
} satisfies Meta<typeof TabList>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * A Sap_Sync-style tablist: arrow keys / Home / End move both focus and
 * selection (automatic activation), and the panel is switched on the
 * caller's own state — the same shape Sap_Sync, ApprovalManagement and
 * Label_Checker already use, minus the missing keyboard behaviour.
 */
function SapSyncTabs() {
  const panels = [
    { id: "sales-orders", label: "Sales Orders", summary: "128 orders synced · 3 pending retry" },
    { id: "ap-invoices", label: "AP Invoices", summary: "64 invoices synced · 0 pending" },
    { id: "credit-notes", label: "Credit Notes", summary: "12 notes synced · 1 failed" },
    { id: "payments", label: "Payments", summary: "205 payments synced · 0 pending" },
  ];
  const [selected, setSelected] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <TabList label="SAP sync status">
        {panels.map((p, i) => (
          <Tab
            key={p.id}
            id={`tab-${p.id}`}
            selected={selected === i}
            aria-controls={`panel-${p.id}`}
            onClick={() => setSelected(i)}
          >
            {p.label}
          </Tab>
        ))}
      </TabList>
      {panels.map(
        (p, i) =>
          selected === i && (
            <div
              key={p.id}
              id={`panel-${p.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${p.id}`}
              className="rounded-xl border border-line bg-white p-4 text-[13px] text-body"
            >
              {p.summary}
            </div>
          ),
      )}
    </div>
  );
}

export const Default: Story = {
  render: () => <SapSyncTabs />,
};

/** A tab with nothing behind it yet — still focusable, never selected. */
export const WithDisabled: Story = {
  render: () => (
    <TabList label="Order stage">
      <Tab selected onClick={() => {}}>
        Pending
      </Tab>
      <Tab selected={false} onClick={() => {}}>
        Approved
      </Tab>
      <Tab selected={false} disabled onClick={() => {}}>
        Posted to SAP (unavailable)
      </Tab>
    </TabList>
  ),
};
