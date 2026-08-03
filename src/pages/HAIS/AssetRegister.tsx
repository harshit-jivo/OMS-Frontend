import { useCallback, useEffect, useState } from "react";
import { HiArrowPath, HiUserPlus, HiClipboardDocumentList, HiMagnifyingGlass, HiPencil, HiPlusCircle, HiQrCode } from "react-icons/hi2";
import { StatusBadge, ErrorAlert, apiErrorMessage } from "../../components/NicUI";
import { haisService, WORKING_STATUSES, type Asset } from "../../services/haisService";
import AssetHistory from "./AssetHistory";
import AssetActionModal from "./AssetActionModal";
import AssetDetails from "./AssetDetails";
import "../../styles/HAIS.css";

type Props = {
  /** Parent hook to jump into the edit form for a given asset. */
  onEdit?: (assetId: string) => void;
  /** Open the Add-asset form. */
  onAdd?: () => void;
  /** Open the Lookup page. */
  onLookup?: () => void;
};

function statusTone(status?: string): "ok" | "err" | "warn" | "muted" {
  switch ((status || "").toLowerCase()) {
    case "working":
      return "ok";
    case "under repair":
      return "warn";
    case "not working":
    case "scrapped":
      return "err";
    default:
      return "muted";
  }
}

export default function AssetRegister({ onEdit, onAdd, onLookup }: Props) {
  const [rows, setRows] = useState<Asset[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Asset whose history is shown in the modal (null = closed).
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);
  // Asset + action for the Handover / Update-Config modal (null = closed).
  const [actionState, setActionState] = useState<{ asset: Asset; mode: "handover" | "config" } | null>(null);
  // Asset shown in the full-details popup on row click (null = closed).
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await haisService.list({
        search: search.trim() || undefined,
        working_status: statusFilter || undefined,
      });
      setRows(data.results ?? []);
    } catch (err) {
      setError(apiErrorMessage(err));
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="ofs-card-mark" />
          <h2>Asset Register</h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ofs-primary" onClick={() => onAdd?.()}>
            <HiPlusCircle style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Add Asset
          </button>
          <button className="nic-tab" onClick={() => onLookup?.()}>
            <HiQrCode style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Lookup
          </button>
        </div>
      </div>

      {/* Filters — search, status and both buttons on one row. */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="nic-field" style={{ flex: "1 1 260px", marginBottom: 0 }}>
          <span className="nic-label">Search</span>
          <input
            className="nic-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
            placeholder="Asset ID, category, user, serial, company, model…"
          />
        </label>

        <label className="nic-field" style={{ flex: "0 1 180px", marginBottom: 0 }}>
          <span className="nic-label">Status</span>
          <select className="nic-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {WORKING_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <button className="ofs-primary" onClick={() => void load()} disabled={busy}>
          <HiMagnifyingGlass style={{ verticalAlign: "-3px", marginRight: 6 }} />
          {busy ? "Loading…" : "Search"}
        </button>
        <button className="nic-tab" onClick={() => { setSearch(""); setStatusFilter(""); void load(); }}>
          <HiArrowPath style={{ verticalAlign: "-3px", marginRight: 6 }} />
          Reset
        </button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      <div className="nic-table-wrap" style={{ marginTop: 16 }}>
        <table className="nic-table">
          <thead>
            <tr>
              <th>Asset ID</th>
              <th>Category</th>
              <th>Current User</th>
              <th>Handover</th>
              <th>Company</th>
              <th>Model No.</th>
              <th>Last Service</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="nic-note" style={{ textAlign: "center", padding: 24 }}>
                  {busy ? "Loading…" : "No assets found."}
                </td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr key={a.asset_id} className="hais-row" onClick={() => setDetailAsset(a)}>
                  <td className="nic-mono">{a.asset_id}</td>
                  <td>{a.asset_type || "—"}</td>
                  <td>{a.current_user_name || a.current_user_id || "—"}</td>
                  <td>{a.handover_date || "—"}</td>
                  <td>{a.company || "—"}</td>
                  <td>{a.model_num || "—"}</td>
                  <td>{a.date_of_last_service || "—"}</td>
                  <td>
                    <StatusBadge tone={statusTone(a.working_status as string)}>
                      {(a.working_status as string) || "—"}
                    </StatusBadge>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="hais-actions">
                      <button
                        className="hais-icon-btn hais-icon-btn--handover"
                        title="Handover to another user"
                        onClick={() => setActionState({ asset: a, mode: "handover" })}
                      >
                        <HiUserPlus />
                      </button>
                      <button
                        className="hais-icon-btn hais-icon-btn--history"
                        title="View device history"
                        onClick={() => setHistoryAsset(a)}
                      >
                        <HiClipboardDocumentList />
                      </button>
                      <button
                        className="hais-icon-btn hais-icon-btn--edit"
                        title="Edit / update configuration"
                        onClick={() => onEdit?.(a.asset_id)}
                      >
                        <HiPencil />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Device history modal */}
      {historyAsset && (
        <div
          className="sb-modal-overlay"
          onClick={() => setHistoryAsset(null)}
          style={{ zIndex: 1000, position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            className="sb-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 900, maxHeight: "85vh", overflowY: "auto", background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>
                History — <span className="nic-mono">{historyAsset.asset_id}</span>
                {historyAsset.asset_type ? ` (${historyAsset.asset_type})` : ""}
              </h3>
              <button
                onClick={() => setHistoryAsset(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, color: "#64748b", lineHeight: 1 }}
              >
                &times;
              </button>
            </div>
            <AssetHistory history={historyAsset.history} />
          </div>
        </div>
      )}

      {/* Handover / Update-Config modal */}
      {actionState && (
        <AssetActionModal
          asset={actionState.asset}
          mode={actionState.mode}
          onClose={() => setActionState(null)}
          onDone={() => {
            setActionState(null);
            void load();
          }}
        />
      )}

      {/* Full-details popup (row click) — all data, no history */}
      {detailAsset && (
        <AssetDetails
          asset={detailAsset}
          onClose={() => setDetailAsset(null)}
          onEdit={(id) => { setDetailAsset(null); onEdit?.(id); }}
          onHandover={(a) => { setDetailAsset(null); setActionState({ asset: a, mode: "handover" }); }}
          onHistory={(a) => { setDetailAsset(null); setHistoryAsset(a); }}
        />
      )}
    </section>
  );
}
