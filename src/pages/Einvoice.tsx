import { useState } from "react";
import GenerateIrn from "./einvoice/GenerateIrn";
import InvoiceBrowser from "./einvoice/InvoiceBrowser";
import CancelIrn from "./einvoice/CancelIrn";
import IrnLookup from "./einvoice/IrnLookup";
import IrnQr from "./einvoice/IrnQr";
import EinvTools from "./einvoice/EinvTools";
import GenLogs from "./einvoice/GenLogs";
import "../styles/Order_Flow_Settings.css";
import "../styles/Einvoice.css";

const TABS = ["Invoices", "Generate", "Cancel", "Lookup", "QR Code", "Logs", "Tools"] as const;
type Tab = (typeof TABS)[number];

export default function Einvoice() {
  const [tab, setTab] = useState<Tab>("Invoices");

  return (
    <div className="nic-page">
      <div className="ofs-header">
        <div>
          <span className="ofs-kicker">GST · NIC e-Invoice</span>
          <h1>e-Invoice (IRN)</h1>
          <p>Generate, cancel and look up Invoice Reference Numbers, and render the signed QR.</p>
        </div>
      </div>

      <div className="nic-tabs">
        {TABS.map((t) => (
          <button key={t} className={`nic-tab ${tab === t ? "nic-tab-active" : ""}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="ofs-grid">
        {tab === "Invoices" && <InvoiceBrowser />}
        {tab === "Generate" && <GenerateIrn />}
        {tab === "Cancel" && <CancelIrn />}
        {tab === "Lookup" && <IrnLookup />}
        {tab === "QR Code" && <IrnQr />}
        {tab === "Logs" && <GenLogs />}
        {tab === "Tools" && <EinvTools />}
      </div>
    </div>
  );
}
