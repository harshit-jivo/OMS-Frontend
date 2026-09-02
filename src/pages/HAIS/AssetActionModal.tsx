import { useState } from "react";
import DateInput from "../../components/DateInput";
import { NicField, ErrorAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import {
  haisService,
  configSummary,
  type Asset,
  type ConfigFields,
} from "../../services/haisService";
import { useHaisOptions } from "./useHaisOptions";

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
  // Dropdown values, loaded from the DB masters.
  const { departments, storageTypes } = useHaisOptions();

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

  // Emp ID is optional here, but if entered it is auto-prefixed with the company
  // code (JWPL) and uppercased — same rule as the Add form.
  const setEmpId = (raw: string) => {
    const code = raw.toUpperCase().replace(/\s+/g, "").replace(/^(JWPL)+/, "");
    setToUserId(code ? `JWPL${code}` : "");
  };

  const submit = async () => {
    setError("");
    if (isHandover && !toUserName.trim()) {
      setError("New user's Name is required.");
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
      setError(messageFrom(err, "Request failed"));
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
          {storageTypes.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
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
      className="sb-modal-overlay hais-action-overlay"
      onClick={onClose}
    >
      <div
        className="sb-modal hais-action-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nic-modal-head nic-modal-head--tight-6">
          <h3 className="nic-modal-title">
            {isHandover ? "Handover" : "Update Configuration"} — <span className="nic-mono">{asset.asset_id}</span>
          </h3>
          <button onClick={onClose} className="nic-modal-close">
            &times;
          </button>
        </div>

        <p className="nic-note nic-note--flush">
          Currently with: <strong>{asset.current_user_name || asset.current_user_id || "—"}</strong>
          {" · "}Config: {configSummary(asset) || "—"}
        </p>

        {isHandover ? (
          <>
            <h4 className="nic-subsection-title">New Holder</h4>
            <div className="nic-form-grid">
              <NicField label="New User Name *">
                <input className="nic-input" value={toUserName} onChange={(e) => setToUserName(e.target.value.toUpperCase())} placeholder="e.g. PRIYA NAIR" />
              </NicField>
              <NicField label="New User ID (Emp ID)" hint="Auto-prefixed with JWPL">
                <input className="nic-input nic-mono" value={toUserId} onChange={(e) => setEmpId(e.target.value)} placeholder="JWPL0001" />
              </NicField>
              <NicField label="Department">
                <select className="nic-select" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="">— Select —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
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

            <label className="hais-upgrade-check">
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
            <p className="nic-note nic-note--flush">
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

        <div className="nic-actions-row nic-actions-row--top12">
          <button className="ofs-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : isHandover ? "Confirm Handover" : "Save Change"}
          </button>
          <button className="nic-tab" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
