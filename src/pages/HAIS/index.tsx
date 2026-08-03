import { useState } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import AssetRegister from "./AssetRegister";
import AssetForm from "./AssetForm";
import AssetLookup from "./AssetLookup";
import "../../styles/Order_Flow_Settings.css";
import "../../styles/Einvoice.css";

type View = "list" | "add" | "edit" | "lookup";

export default function HAIS() {
  const [view, setView] = useState<View>("list");
  // The Asset ID currently loaded in the Edit view.
  const [editId, setEditId] = useState<string | null>(null);

  // Open the edit form for a specific asset (from the register / lookup).
  const editAsset = (assetId: string) => {
    setEditId(assetId);
    setView("edit");
  };

  const backToList = () => {
    setEditId(null);
    setView("list");
  };

  const BackBar = () => (
    <div className="nic-actions-row" style={{ marginBottom: 12 }}>
      <button className="nic-tab" onClick={backToList}>
        <HiArrowLeft style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Back to Assets
      </button>
    </div>
  );

  return (
    <div className="nic-page">
      <div className="ofs-header">
        <div>
          <span className="ofs-kicker">HAIS · Hardware Asset Identification</span>
          <h1>Hardware Assets</h1>
        </div>
      </div>

      <div className="ofs-grid">
        {view === "list" && (
          <AssetRegister
            onEdit={editAsset}
            onAdd={() => setView("add")}
            onLookup={() => setView("lookup")}
          />
        )}

        {view === "add" && (
          <>
            <BackBar />
            <AssetForm key="add" editId={null} onSaved={backToList} />
          </>
        )}

        {view === "edit" && (
          <>
            <BackBar />
            <AssetForm key={editId ?? "edit"} editId={editId} onSaved={backToList} />
          </>
        )}

        {view === "lookup" && (
          <>
            <BackBar />
            <AssetLookup onEdit={editAsset} />
          </>
        )}
      </div>
    </div>
  );
}
