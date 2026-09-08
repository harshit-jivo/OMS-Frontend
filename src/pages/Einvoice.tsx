/**
 * e-Invoice (IRN) — seven tools behind one tab strip.
 *
 * The shell only. Each tab mounts a panel from `einvoice/`, and the panels
 * share `components/NicUI` for their fields, alerts and NIC-response
 * rendering — which is why they are all one conversion rather than seven.
 *
 * `Einvoice.css` is imported by nothing now — HAIS, its last user, has
 * converted — and is on the retired list in DESIGN_SYSTEM.md §9.
 */
import { useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Page, PageHeader } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";
import CancelIrn from "./einvoice/CancelIrn";
import EinvTools from "./einvoice/EinvTools";
import GenLogs from "./einvoice/GenLogs";
import GenerateIrn from "./einvoice/GenerateIrn";
import InvoiceBrowser from "./einvoice/InvoiceBrowser";
import IrnLookup from "./einvoice/IrnLookup";
import IrnQr from "./einvoice/IrnQr";

const TABS = ["Invoices", "Generate", "Cancel", "Lookup", "QR Code", "Logs", "Tools"] as const;
type Tab = (typeof TABS)[number];

export default function Einvoice() {
  const [tab, setTab] = useState<Tab>("Invoices");

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Invoices" }, { label: "e-Invoice (IRN)" }]} />

      <PageHeader
        eyebrow="GST · NIC e-Invoice"
        title="e-Invoice (IRN)"
        description="Generate, cancel and look up Invoice Reference Numbers, and render the signed QR."
      />

      {/* Seven tabs overflow a narrow viewport, so the strip scrolls rather
          than wrapping into two rows that shift the page under the cursor. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabList label="e-Invoice tools" className="w-max">
          {TABS.map((t) => (
            <Tab
              key={t}
              id={`einv-tab-${t}`}
              aria-controls="einv-panel"
              selected={tab === t}
              onClick={() => setTab(t)}
            >
              {t}
            </Tab>
          ))}
        </TabList>
      </div>

      <div id="einv-panel" role="tabpanel" aria-labelledby={`einv-tab-${tab}`}>
        {tab === "Invoices" && <InvoiceBrowser />}
        {tab === "Generate" && <GenerateIrn />}
        {tab === "Cancel" && <CancelIrn />}
        {tab === "Lookup" && <IrnLookup />}
        {tab === "QR Code" && <IrnQr />}
        {tab === "Logs" && <GenLogs />}
        {tab === "Tools" && <EinvTools />}
      </div>
    </Page>
  );
}
