import { useState } from "react";
import { HiMagnifyingGlass, HiQrCode, HiPencil, HiUserPlus } from "react-icons/hi2";
import { KeyValues, StatusBadge, ErrorAlert, apiErrorMessage } from "../../components/NicUI";
import { haisService, configSummary, holderLabel, type Asset } from "../../services/haisService";
import AssetHistory from "./AssetHistory";
import AssetActionModal from "./AssetActionModal";
import QrScanner from "./QrScanner";

type Props = {
  onEdit?: (assetId: string) => void;
};

// A scanned QR now carries a URL (…/hais/device/<serial>). Pull the serial out
// of it; if it's already a bare code, use it as-is.
function codeFromScan(text: string): string {
  const t = text.trim();
  const m = t.match(/\/hais\/device\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : t;
}

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

export default function AssetLookup({ onEdit }: Props) {
  const [assetId, setAssetId] = useState("");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Which action modal is open for the loaded asset (null = none).
  const [action, setAction] = useState<null | "handover" | "config">(null);
  // Whether the in-app camera scanner is open.
  const [scanning, setScanning] = useState(false);

  const run = async () => {
    const id = assetId.trim();
    if (!id) {
      setError("Enter an Asset ID to look up.");
      return;
    }
    setError("");
    setAsset(null);
    setBusy(true);
    try {
      setAsset(await haisService.get(id));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // A QR was scanned — its payload is the device URL (or serial). Resolve the
  // serial to the matching device and show it right here.
  const onScan = async (text: string) => {
    setScanning(false);
    const code = codeFromScan(text);
    setError("");
    setAsset(null);
    setAssetId(code);
    setBusy(true);
    try {
      setAsset(await haisService.getBySerial(code));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head">
        <span className="ofs-card-mark" />
        <h2>Asset Lookup</h2>
      </div>

      {/* Web is type-to-look-up only; QR scanning lives in the mobile app. */}
      <div className="nic-form-grid">
        <label className="nic-field nic-field--full">
          <span className="nic-label">Asset ID</span>
          <input
            className="nic-input nic-mono"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void run()}
            placeholder="Type the Asset ID"
          />
        </label>
      </div>

      <div className="nic-actions-row">
        <button className="ofs-primary" onClick={() => void run()} disabled={busy}>
          <HiMagnifyingGlass style={{ verticalAlign: "-3px", marginRight: 6 }} />
          {busy ? "Searching…" : "Look up"}
        </button>
        <button className="nic-tab" onClick={() => setScanning(true)} disabled={busy}>
          <HiQrCode style={{ verticalAlign: "-3px", marginRight: 6 }} />
          Scan QR
        </button>
      </div>

      {scanning && <QrScanner onDecode={(t) => void onScan(t)} onClose={() => setScanning(false)} />}

      <ErrorAlert>{error}</ErrorAlert>

      {asset && (
        <div className="nic-result" style={{ marginTop: 16 }}>
          <div className="nic-subsection">
            <h4 className="nic-subsection-title">
              {asset.asset_id}{" "}
              <StatusBadge tone={statusTone(asset.working_status as string)}>
                {(asset.working_status as string) || "—"}
              </StatusBadge>
            </h4>
            <KeyValues
              items={[
                ["Category", asset.asset_type],
                ["Company", asset.company],
                ["Model No.", asset.model_num],
                ["Serial No.", asset.serial_num],
                ["Configuration", configSummary(asset)],
                ["Warranty Ends", asset.warranty_ends],
                ["Current User", holderLabel(asset)],
                ["Previous User", asset.prev_user_name || asset.prev_user_id],
                ["Department", asset.department],
                ["Email ID", asset.email_id],
                ["Current Location", asset.current_location],
                ["Handover Date", asset.handover_date],
                ["Vendor", asset.vendor],
                ["Date of Last Service", asset.date_of_last_service],
              ]}
            />
          </div>

          {/* Full lifecycle — when the device moved, to whom, and why. */}
          <AssetHistory history={asset.history} />

          <div className="nic-actions-row">
            <button className="ofs-primary" onClick={() => setAction("handover")}>
              <HiUserPlus style={{ verticalAlign: "-3px", marginRight: 6 }} />
              Handover
            </button>
            <button className="nic-tab" onClick={() => onEdit?.(asset.asset_id)}>
              <HiPencil style={{ verticalAlign: "-3px", marginRight: 6 }} />
              Edit / Update Config
            </button>
          </div>
        </div>
      )}

      {asset && action && (
        <AssetActionModal
          asset={asset}
          mode={action}
          onClose={() => setAction(null)}
          onDone={(updated) => {
            setAsset(updated);
            setAction(null);
          }}
        />
      )}
    </section>
  );
}
