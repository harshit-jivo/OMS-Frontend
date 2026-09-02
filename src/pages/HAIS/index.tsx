import { useState } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import AssetRegister from "./AssetRegister";
import AssetForm from "./AssetForm";
import AssetLookup from "./AssetLookup";
import OptionManager from "./OptionManager";
import HaisReports from "./HaisReports";
import { haisService } from "../../services/haisService";
import "../../styles/Order_Flow_Settings.css";
import "../../styles/Einvoice.css";

// Tabs shown across the top. "edit" is a sub-view (reached from the register /
// lookup), not a tab, so it is not listed here.
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

  return (
    <div className="nic-page">
      <div className="ofs-header">
        <div>
          <span className="ofs-kicker">HAIS · Hardware Asset Identification</span>
          <h1>Hardware Assets</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div className="nic-tabs nic-tabs--tight">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`nic-tab ${activeTab === t.key ? "nic-tab-active" : ""}`}
            onClick={() => openTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ofs-grid">
        {view === "list" && (
          <AssetRegister
            onEdit={editAsset}
            onAdd={() => setView("add")}
            onLookup={() => setView("lookup")}
          />
        )}

        {view === "add" && <AssetForm key="add" editId={null} onSaved={backToList} />}

        {view === "edit" && (
          <>
            <div className="nic-actions-row nic-actions-row--offset">
              <button className="nic-tab" onClick={backToList}>
                <HiArrowLeft className="nic-icon-lead" />
                Back to Assets
              </button>
            </div>
            <AssetForm key={editId ?? "edit"} editId={editId} onSaved={backToList} />
          </>
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
    </div>
  );
}
