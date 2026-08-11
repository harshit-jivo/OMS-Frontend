import { HiUserPlus, HiClipboardDocumentList, HiPencil } from "react-icons/hi2";
import { StatusBadge } from "../../components/NicUI";
import { configSummary, holderLabel, type Asset } from "../../services/haisService";
import AssetQr from "./AssetQr";

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

type Row = [string, unknown];

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
  if (shown.length === 0) return null;
  return (
    <>
      <div className="hais-detail-section-title">{title}</div>
      <div className="hais-detail-grid">
        {shown.map(([k, v]) => (
          <div className="hais-detail-item" key={k}>
            <span className="k">{k}</span>
            <span className="v">{String(v)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

type Props = {
  asset: Asset;
  onClose: () => void;
  onEdit?: (assetId: string) => void;
  onHandover?: (asset: Asset) => void;
  onHistory?: (asset: Asset) => void;
};

/** Read-only popup showing ALL data for a device (no history timeline). */
export default function AssetDetails({ asset, onClose, onEdit, onHandover, onHistory }: Props) {
  return (
    <div className="hais-detail-overlay" onClick={onClose}>
      <div className="hais-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hais-detail-head">
          <h3>
            <span className="nic-mono">{asset.asset_id}</span>
            <StatusBadge tone={statusTone(asset.working_status as string)}>
              {(asset.working_status as string) || "—"}
            </StatusBadge>
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="hais-detail-sub">{asset.asset_type || "Asset"}</span>
            <button className="hais-detail-close" onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
        </div>

        <div className="hais-detail-body">
          <div className="hais-detail-idrow">
            <div className="hais-detail-idrow-info">
              <Section
                title="Identification"
                rows={[
                  ["Asset ID", asset.asset_id],
                  ["Category", asset.asset_type],
                  ["Company", asset.company],
                  ["Model No.", asset.model_num],
                  ["Serial No.", asset.serial_num],
                  ["Warranty Ends", asset.warranty_ends],
                ]}
              />
            </div>
            <AssetQr asset={asset} />
          </div>

          <Section
            title="Configuration"
            rows={[
              ["Processor", asset.processor],
              ["Memory (RAM)", asset.memory],
              ["Operating System", asset.operating_system],
              ["Storage Type", asset.storage_type],
              ["Storage", asset.storage],
              ["Summary", configSummary(asset)],
            ]}
          />

          <Section
            title="Assignment & Tracking"
            rows={[
              ["Current User", holderLabel(asset)],
              ["Current User ID", asset.current_user_id],
              ["Previous User", asset.prev_user_name || asset.prev_user_id],
              ["Department", asset.department],
              ["Email ID", asset.email_id],
              ["Current Location", asset.current_location],
              ["Handover Date", asset.handover_date],
            ]}
          />

          <Section
            title="Purchase"
            rows={[
              ["Invoice No.", asset.purchase_invoice_no],
              ["Invoice Date", asset.purchase_invoice_date],
              ["Vendor", asset.vendor],
              ["Amount", asset.amount != null && asset.amount !== "" ? `₹ ${asset.amount}` : ""],
            ]}
          />

          <Section
            title="Maintenance"
            rows={[
              ["Date of Last Service", asset.date_of_last_service],
              ["Working Status", asset.working_status],
              ["Remarks", asset.remarks],
            ]}
          />
        </div>

        <div className="hais-detail-foot">
          <button className="ofs-primary" onClick={() => onHandover?.(asset)}>
            <HiUserPlus style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Handover
          </button>
          <button className="nic-tab" onClick={() => onHistory?.(asset)}>
            <HiClipboardDocumentList style={{ verticalAlign: "-3px", marginRight: 6 }} />
            History
          </button>
          <button className="nic-tab" onClick={() => onEdit?.(asset.asset_id)}>
            <HiPencil style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Edit / Update Config
          </button>
        </div>
      </div>
    </div>
  );
}
