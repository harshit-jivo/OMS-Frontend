import { useState } from "react";
import {
  HiArrowPath,
  HiBuildingOffice2,
  HiClipboardDocumentList,
  HiCube,
  HiUsers,
} from "react-icons/hi2";
import Status from "./Status";
import Products from "./Products";
import PartyDirectory from "./PartyDirectory";
import Branches from "./Branches";
import Logs from "./Logs";
import "../styles/Sap_Sync.css";

/* Parties and Addresses are one subject — a party and the places it bills/ships
 * to — so they share a single "Parties & Addresses" tab (see PartyDirectory).
 * Sales Invoice lives on its own route and is no longer a tab here. */
const TABS = [
  { key: "Status", label: "Status", icon: HiArrowPath, hint: "Counts and manual sync" },
  { key: "Products", label: "Products", icon: HiCube, hint: "Items and rates" },
  { key: "Directory", label: "Parties & Addresses", icon: HiUsers, hint: "Customers and their addresses" },
  { key: "Branches", label: "Branches", icon: HiBuildingOffice2, hint: "Branch mapping" },
  { key: "Logs", label: "Logs", icon: HiClipboardDocumentList, hint: "Sync history" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Sap_sync() {
  const [activeTab, setActiveTab] = useState<TabKey>("Status");

  const renderContent = () => {
    switch (activeTab) {
      case "Status":
        return <Status />;
      case "Products":
        return <Products />;
      case "Directory":
        return <PartyDirectory />;
      case "Branches":
        return <Branches />;
      case "Logs":
        return <Logs />;
      default:
        return null;
    }
  };

  const active = TABS.find((tab) => tab.key === activeTab);

  return (
    <div className="sap-page app-page">
      <div className="sap-head">
        <span className="sap-head-accent" aria-hidden="true" />
        <div className="sap-head-copy">
          <h1 className="sap-title">SAP Sync</h1>
          <p className="sap-subtitle">Pull master data straight from SAP and review what landed.</p>
        </div>
        <span className="sap-head-tag">{active?.hint}</span>
      </div>

      {/* ── TABS ── */}
      <div className="sap-tabs" role="tablist" aria-label="SAP sync sections">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`sap-tab ${isActive ? "sap-tab-active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon className="sap-tab-icon" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── CONTENT ── */}
      <div className="sap-content">{renderContent()}</div>
    </div>
  );
}
