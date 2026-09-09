/**
 * HAIS — Hardware Asset Identification System.
 *
 * One route, seven tabs. "edit" is a sub-view reached from the register or the
 * lookup, not a tab: it belongs to the register, so the register's tab stays
 * selected and the breadcrumb trail is what takes you back.
 */
import { useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Page, PageHeader } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";
import { haisService } from "../../services/haisService";

import AssetForm from "./AssetForm";
import AssetLookup from "./AssetLookup";
import AssetRegister from "./AssetRegister";
import HaisReports from "./HaisReports";
import OptionManager from "./OptionManager";

type Tab = "list" | "add" | "lookup" | "asset-types" | "departments" | "storage-types" | "reports";
type View = Tab | "edit";

const TABS: { key: Tab; label: string }[] = [
  { key: "list", label: "Asset Register" },
  { key: "add", label: "Add Asset" },
  { key: "lookup", label: "Lookup" },
  { key: "asset-types", label: "Asset Type" },
  { key: "departments", label: "Departments" },
  { key: "storage-types", label: "Storage Type" },
  { key: "reports", label: "Reports" },
];

export default function HAIS() {
  const [view, setView] = useState<View>("list");
  // The Asset ID currently loaded in the Edit view.
  const [editId, setEditId] = useState<string | null>(null);

  const openTab = (key: Tab) => {
    setEditId(null);
    setView(key);
  };

  // Open the edit form for a specific asset (from the register / lookup).
  const editAsset = (assetId: string) => {
    setEditId(assetId);
    setView("edit");
  };

  const backToList = () => {
    setEditId(null);
    setView("list");
  };

  // Which tab should read as active (edit belongs to the register).
  const activeTab: Tab = view === "edit" ? "list" : view;
  const activeLabel = TABS.find((t) => t.key === activeTab)?.label ?? "";

  return (
    <Page>
      <Breadcrumbs
        items={
          view === "edit"
            ? [
                { label: "HAIS" },
                { label: "Asset Register", onClick: backToList },
                { label: editId ?? "Edit" },
              ]
            : [{ label: "HAIS" }, { label: activeLabel }]
        }
      />

      <PageHeader
        eyebrow="HAIS · Hardware Asset Identification"
        title="Hardware Assets"
        description="Every device the company owns: who holds it, what is in it, and where it has been."
      />

      <TabList label="Hardware asset views">
        {TABS.map((t) => (
          <Tab key={t.key} selected={activeTab === t.key} onClick={() => openTab(t.key)}>
            {t.label}
          </Tab>
        ))}
      </TabList>

      <div role="tabpanel">
        {view === "list" && (
          <AssetRegister
            onEdit={editAsset}
            onAdd={() => setView("add")}
            onLookup={() => setView("lookup")}
          />
        )}

        {view === "add" && <AssetForm key="add" editId={null} onSaved={backToList} />}

        {view === "edit" && (
          <AssetForm key={editId ?? "edit"} editId={editId} onSaved={backToList} />
        )}

        {view === "lookup" && <AssetLookup onEdit={editAsset} />}

        {view === "asset-types" && (
          <OptionManager
            title="Asset Types"
            singular="Asset Type"
            load={haisService.options.assetTypes}
            create={haisService.options.createAssetType}
          />
        )}

        {view === "departments" && (
          <OptionManager
            title="Departments"
            singular="Department"
            load={haisService.options.departments}
            create={haisService.options.createDepartment}
          />
        )}

        {view === "storage-types" && (
          <OptionManager
            title="Storage Types"
            singular="Storage Type"
            load={haisService.options.storageTypes}
            create={haisService.options.createStorageType}
          />
        )}

        {view === "reports" && <HaisReports />}
      </div>
    </Page>
  );
}
