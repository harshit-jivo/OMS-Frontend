import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { KeyValues, StatusBadge, ErrorAlert, apiErrorMessage } from "../../components/NicUI";
import { haisService, configSummary, holderLabel, type Asset } from "../../services/haisService";
import AssetHistory from "./AssetHistory";
import "../../styles/Einvoice.css";
import "../../styles/HAIS.css";

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

/**
 * Standalone device page opened by scanning a device's QR. The QR encodes a URL
 * pointing here; opening it runs the API (getBySerial) and shows the device's
 * latest details — current holder, previous holder / Unassigned, config, history.
 * Needs an OMS session (the API is authenticated); if there is none, it says so.
 */
export default function AssetPublicView() {
  const { code = "" } = useParams();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    haisService
      .getBySerial(code)
      .then((a) => alive && setAsset(a))
      .catch((err) => alive && setError(apiErrorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div className="hais-public">
      <div className="hais-public-card">
        <div className="hais-public-head">
          <span className="ofs-kicker">OMS · Hardware Asset</span>
        </div>

        {loading ? (
          <p className="nic-note">Loading device…</p>
        ) : error ? (
          <>
            <ErrorAlert>{error}</ErrorAlert>
            <p className="nic-note">
              You may need to <Link to="/">log in to OMS</Link> to view this device,
              then scan again.
            </p>
          </>
        ) : asset ? (
          <>
            <h2 style={{ margin: "4px 0 12px" }}>
              <span className="nic-mono">{asset.asset_id}</span>{" "}
              <StatusBadge tone={statusTone(asset.working_status as string)}>
                {(asset.working_status as string) || "—"}
              </StatusBadge>
            </h2>

            <h4 className="nic-subsection-title">Device</h4>
            <KeyValues
              items={[
                ["Category", asset.asset_type],
                ["Company", asset.company],
                ["Model No.", asset.model_num],
                ["Serial No.", asset.serial_num],
                ["Configuration", configSummary(asset)],
                ["Warranty Ends", asset.warranty_ends],
                ["Working Status", asset.working_status],
              ]}
            />

            <h4 className="nic-subsection-title">Assignment</h4>
            <KeyValues
              items={[
                ["Current User", holderLabel(asset)],
                ["Current User ID", asset.current_user_id],
                ["Previous User", asset.prev_user_name || asset.prev_user_id],
                ["Department", asset.department],
                ["Email ID", asset.email_id],
                ["Current Location", asset.current_location],
                ["Handover Date", asset.handover_date],
              ]}
            />

            {/* Full lifecycle — who had it, when, and why. */}
            <AssetHistory history={asset.history} />
          </>
        ) : null}
      </div>
    </div>
  );
}
