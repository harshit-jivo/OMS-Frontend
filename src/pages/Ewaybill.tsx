/**
 * e-Way Bill — three tools behind one tab strip. The sibling of `Einvoice`,
 * and converted with it: they share `components/NicUI` and the same panel
 * shape.
 */
import { useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Page, PageHeader } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";
import EwbLookup from "./ewaybill/EwbLookup";
import GenerateEwb from "./ewaybill/GenerateEwb";
import ManageEwb from "./ewaybill/ManageEwb";

const TABS = ["Generate", "Manage", "Lookup"] as const;
type Tab = (typeof TABS)[number];

export default function Ewaybill() {
  const [tab, setTab] = useState<Tab>("Generate");

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Invoices" }, { label: "e-Way Bill" }]} />

      <PageHeader
        eyebrow="GST · NIC e-Way Bill"
        title="e-Way Bill"
        description="Generate e-Way Bills from invoices, and cancel, close, extend or update them."
      />

      <TabList label="e-Way Bill tools">
        {TABS.map((t) => (
          <Tab
            key={t}
            id={`ewb-tab-${t}`}
            aria-controls="ewb-panel"
            selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </Tab>
        ))}
      </TabList>

      <div id="ewb-panel" role="tabpanel" aria-labelledby={`ewb-tab-${tab}`}>
        {tab === "Generate" && <GenerateEwb />}
        {tab === "Manage" && <ManageEwb />}
        {tab === "Lookup" && <EwbLookup />}
      </div>
    </Page>
  );
}
