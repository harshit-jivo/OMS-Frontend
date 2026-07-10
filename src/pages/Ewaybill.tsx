import { useState } from "react";
import GenerateEwb from "./ewaybill/GenerateEwb";
import ManageEwb from "./ewaybill/ManageEwb";
import EwbLookup from "./ewaybill/EwbLookup";
import "../styles/Order_Flow_Settings.css";
import "../styles/Einvoice.css";

const TABS = ["Generate", "Manage", "Lookup"] as const;
type Tab = (typeof TABS)[number];

export default function Ewaybill() {
  const [tab, setTab] = useState<Tab>("Generate");

  return (
    <div className="nic-page">
      <div className="ofs-header">
        <div>
          <span className="ofs-kicker">GST · NIC e-Way Bill</span>
          <h1>e-Way Bill</h1>
          <p>Generate e-Way Bills from invoices, and cancel, close, extend or update them.</p>
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
        {tab === "Generate" && <GenerateEwb />}
        {tab === "Manage" && <ManageEwb />}
        {tab === "Lookup" && <EwbLookup />}
      </div>
    </div>
  );
}
