/**
 * SAP Sync — one route, five tabs over the master data pulled from SAP.
 *
 * Parties and Addresses are one subject — a party and the places it bills and
 * ships to — so they share a single "Parties & Addresses" tab. Sales Invoice
 * lives on its own route and is no longer a tab here.
 */
import { useState } from "react";
import {
  HiArrowPath,
  HiBuildingOffice2,
  HiClipboardDocumentList,
  HiCube,
  HiUsers,
} from "react-icons/hi2";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Page, PageHeader } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";

import Branches from "./sapSync/Branches";
import Logs from "./sapSync/Logs";
import PartyDirectory from "./sapSync/PartyDirectory";
import Products from "./sapSync/Products";
import Status from "./sapSync/Status";

const TABS = [
  { key: "Status", label: "Status", icon: HiArrowPath, hint: "Counts and manual sync" },
  { key: "Products", label: "Products", icon: HiCube, hint: "Items and rates" },
  {
    key: "Directory",
    label: "Parties & Addresses",
    icon: HiUsers,
    hint: "Customers and their addresses",
  },
  { key: "Branches", label: "Branches", icon: HiBuildingOffice2, hint: "Branch mapping" },
  { key: "Logs", label: "Logs", icon: HiClipboardDocumentList, hint: "Sync history" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Sap_sync() {
  const [activeTab, setActiveTab] = useState<TabKey>("Status");

  const active = TABS.find((tab) => tab.key === activeTab);

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Order Config" }, { label: "SAP Sync" }]} />

      <PageHeader
        eyebrow="Order Config"
        title="SAP Sync"
        description="Pull master data straight from SAP and review what landed."
      />

      <TabList label="SAP sync sections">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <Tab
              key={tab.key}
              selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon aria-hidden="true" />
              {tab.label}
            </Tab>
          );
        })}
      </TabList>

      <div role="tabpanel" aria-label={active?.label}>
        {activeTab === "Status" && <Status />}
        {activeTab === "Products" && <Products />}
        {activeTab === "Directory" && <PartyDirectory />}
        {activeTab === "Branches" && <Branches />}
        {activeTab === "Logs" && <Logs />}
      </div>
    </Page>
  );
}
