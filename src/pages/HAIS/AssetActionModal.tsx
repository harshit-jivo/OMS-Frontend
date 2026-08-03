import { useState } from "react";
import DateInput from "../../components/DateInput";
import { NicField, ErrorAlert, apiErrorMessage } from "../../components/NicUI";
import {
  haisService,
  configSummary,
  DEPARTMENTS,
  STORAGE_TYPES,
  type Asset,
  type ConfigFields,
} from "../../services/haisService";

type Mode = "handover" | "config";

type Props = {
  asset: Asset;
  mode: Mode;
  onClose: () => void;
  onDone: (updated: Asset) => void;
};

const pickConfig = (a: Asset): ConfigFields => ({
  processor: a.processor ?? "",
  memory: a.memory ?? "",
  operating_system: a.operating_system ?? "",
  storage_type: a.storage_type ?? "",
  storage: a.storage ?? "",
});

export default function AssetActionModal({ asset, mode, onClose, onDone }: Props) {
  const isHandover = mode === "handover";

  // Handover fields
  const [toUserId, setToUserId] = useState("");
  const [toUserName, setToUserName] = useState("");
  const [department, setDepartment] = useState(asset.department ?? "");
  const [location, setLocation] = useState(asset.current_location ?? "");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [alsoUpgrade, setAlsoUpgrade] = useState(false);

  // Config fields (shared: handover-upgrade + config-only update)
  const [config, setConfig] = useState<ConfigFields>(pickConfig(asset));
  const setCfg = (k: keyof ConfigFields) => (v: string) => setConfig((c) => ({ ...c, [k]: v }));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (isHandover && !toUserId.trim()) {
      setError("New user's Emp ID is required.");
      return;
    }
    if (!isHandover && !reason.trim()) {
      setError("Please describe what changed (reason).");
      return;
    }
    setBusy(true);
    try {
      const updated = isHandover
        ? await haisService.handover(asset.asset_id, {
            to_user_id: toUserId.trim(),
            to_user_name: toUserName.trim() || undefined,
            department: department || undefined,
            location: location || undefined,
            handover_date: date || undefined,
            reason: reason.trim() || undefined,
            config: alsoUpgrade ? config : undefined,
          })
        : await haisService.updateConfig(asset.asset_id, {
            config,
            service_date: date || undefined,
            reason: reason.trim() || undefined,
          });
      onDone(updated);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const ConfigInputs = (
    <div className="nic-form-grid">
      <NicField label="Processor">
        <input className="nic-input" value={config.processor ?? ""} onChange={(e) => setCfg("processor")(e.target.value)} />
      </NicField>
      <NicField label="Memory (RAM)">
        <input className="nic-input" value={config.memory ?? ""} onChange={(e) => setCfg("memory")(e.target.value)} placeholder="e.g. 16 GB" />
      </NicField>
      <NicField label="Operating System">
        <input className="nic-input" value={config.operating_system ?? ""} onChange={(e) => setCfg("operating_system")(e.target.value)} />
      </NicField>
      <NicField label="Storage Type">
        <select className="nic-select" value={config.storage_type ?? ""} onChange={(e) => setCfg("storage_type")(e.target.value)}>
          <option value="">— Select —</option>
          {STORAGE_TYPES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </NicField>
      <NicField label="Storage">
        <input className="nic-input" value={config.storage ?? ""} onChange={(e) => setCfg("storage")(e.target.value)} placeholder="e.g. 512 GB" />
      </NicField>
    </div>
  );

  return (
    <div
      className="sb-modal-overlay"
      onClick={onClose}
      style={{ zIndex: 1000, position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        className="sb-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 720, maxHeight: "88vh", overflowY: "auto", background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>
            {isHandover ? "Handover" : "Update Configuration"} — <span className="nic-mono">{asset.asset_id}</span>
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, color: "#64748b", lineHeight: 1 }}>
            &times;
          </button>
        </div>

        <p className="nic-note" style={{ marginTop: 0 }}>
          Currently with: <strong>{asset.current_user_name || asset.current_user_id || "—"}</strong>
          {" · "}Config: {configSummary(asset) || "—"}
        </p>

        {isHandover ? (
          <>
            <h4 className="nic-subsection-title">New Holder</h4>
            <div className="nic-form-grid">
              <NicField label="New User ID (Emp ID) *">
                <input className="nic-input" value={toUserId} onChange={(e) => setToUserId(e.target.value)} placeholder="e.g. EMP2210" />
              </NicField>
              <NicField label="New User Name">
                <input className="nic-input" value={toUserName} onChange={(e) => setToUserName(e.target.value)} />
              </NicField>
              <NicField label="Department">
                <select className="nic-select" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="">— Select —</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </NicField>
              <NicField label="Location">
                <input className="nic-input" value={location} onChange={(e) => setLocation(e.target.value)} />
              </NicField>
              <NicField label="Handover Date">
                <DateInput value={date} onChange={setDate} />
              </NicField>
              <NicField label="Reason" full>
                <input className="nic-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Previous user left / role change" />
              </NicField>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 4px" }}>
              <input type="checkbox" checked={alsoUpgrade} onChange={(e) => setAlsoUpgrade(e.target.checked)} />
              <span>Also change configuration for the new user (e.g. hardware team increases RAM)</span>
            </label>
            {alsoUpgrade && (
              <>
                <h4 className="nic-subsection-title">New Configuration</h4>
                {ConfigInputs}
              </>
            )}
          </>
        ) : (
          <>
            <p className="nic-note" style={{ marginTop: 0 }}>
              Use this when only the hardware changed (no new user). The before → after change is saved in the device history.
            </p>
            <h4 className="nic-subsection-title">New Configuration</h4>
            {ConfigInputs}
            <div className="nic-form-grid">
              <NicField label="Change / Service Date">
                <DateInput value={date} onChange={setDate} />
              </NicField>
              <NicField label="Reason / Note *" full>
                <input className="nic-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. RAM upgraded on user request" />
              </NicField>
            </div>
          </>
        )}

        <ErrorAlert>{error}</ErrorAlert>

        <div className="nic-actions-row" style={{ marginTop: 12 }}>
          <button className="ofs-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : isHandover ? "Confirm Handover" : "Save Change"}
          </button>
          <button className="nic-tab" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
