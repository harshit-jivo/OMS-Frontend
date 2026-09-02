import { useState } from "react";
import { HiBolt } from "react-icons/hi2";
import { ewaybillService } from "../../services/ewaybillService";
import { NicField, JsonView, ErrorAlert, SuccessAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import DateInput from "../../components/DateInput";

type Mode = "cancel" | "close" | "reject" | "transporter" | "partb" | "extend";
const MODES: [Mode, string][] = [
  ["cancel", "Cancel"], ["close", "Close (Delivered)"], ["reject", "Reject"],
  ["transporter", "Update Transporter"], ["partb", "Update Part-B"], ["extend", "Extend Validity"],
];
const CANCEL_REASONS = [["1", "1 — Duplicate"], ["2", "2 — Order cancelled"], ["3", "3 — Data entry mistake"], ["4", "4 — Others"]];

export default function ManageEwb() {
  const [mode, setMode] = useState<Mode>("cancel");
  const [ewbNo, setEwbNo] = useState("");
  const [reason, setReason] = useState("2");
  const [remarks, setRemarks] = useState("");
  const [closureDate, setClosureDate] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [json, setJson] = useState("{\n  \"ewbNo\": 0\n}");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<unknown>(null);

  const run = async () => {
    setError(""); setResult(null); setBusy(true);
    try {
      if (mode === "partb" || mode === "extend") {
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(json); } catch { throw new Error("Payload is not valid JSON."); }
        setResult(mode === "partb" ? await ewaybillService.updatePartB(payload) : await ewaybillService.extendValidity(payload));
      } else {
        if (!ewbNo.trim()) throw new Error("EWB number is required.");
        if (mode === "cancel") setResult(await ewaybillService.cancel(ewbNo.trim(), Number(reason), remarks.trim() || "Cancelled"));
        else if (mode === "close") {
          if (!closureDate.trim()) throw new Error("Closure date (dd/mm/yyyy) is required.");
          setResult(await ewaybillService.close(ewbNo.trim(), closureDate.trim(), remarks.trim() || "Delivered"));
        } else if (mode === "reject") setResult(await ewaybillService.reject(ewbNo.trim()));
        else if (mode === "transporter") {
          if (!transporterId.trim()) throw new Error("Transporter ID is required.");
          setResult(await ewaybillService.updateTransporter(ewbNo.trim(), transporterId.trim()));
        }
      }
    } catch (err) {
      setError(messageFrom(err, "Request failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head">
        <span className="ofs-card-mark" />
        <h2>Manage e-Way Bill</h2>
      </div>

      <div className="nic-tabs nic-tabs--mb16">
        {MODES.map(([m, label]) => (
          <button key={m} className={`nic-tab ${mode === m ? "nic-tab-active" : ""}`}
            onClick={() => { setMode(m); setResult(null); setError(""); }}>
            {label}
          </button>
        ))}
      </div>

      {mode === "partb" || mode === "extend" ? (
        <>
          <p className="nic-note">
            {mode === "partb"
              ? "VEHEWB — update Part B (vehicle/place/mode). Provide the NIC payload."
              : "EXTENDVALIDITY — extend an EWB nearing expiry. Provide the NIC payload."}
          </p>
          <div className="nic-form-grid nic-form-grid--spaced">
            <NicField label="Payload (JSON)" full>
              <textarea className="nic-textarea" value={json} onChange={(e) => setJson(e.target.value)} />
            </NicField>
          </div>
        </>
      ) : (
        <div className="nic-form-grid">
          <NicField label="EWB Number">
            <input className="nic-input nic-mono" value={ewbNo} inputMode="numeric"
              onChange={(e) => setEwbNo(e.target.value)} placeholder="391010809803" />
          </NicField>
          {mode === "cancel" ? (
            <NicField label="Reason">
              <select className="nic-select" value={reason} onChange={(e) => setReason(e.target.value)}>
                {CANCEL_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </NicField>
          ) : null}
          {mode === "close" ? (
            <NicField label="Closure Date" hint="dd/mm/yyyy">
              <DateInput value={closureDate} onChange={setClosureDate} placeholder="03/07/2026" />
            </NicField>
          ) : null}
          {mode === "transporter" ? (
            <NicField label="Transporter ID" hint="15-char GSTIN / Transporter ID">
              <input className="nic-input nic-mono" value={transporterId}
                onChange={(e) => setTransporterId(e.target.value)} placeholder="06AAA…" />
            </NicField>
          ) : null}
          {mode === "cancel" || mode === "close" ? (
            <NicField label="Remarks">
              <input className="nic-input" value={remarks} onChange={(e) => setRemarks(e.target.value)}
                placeholder={mode === "close" ? "Delivered" : "Reason remarks"} />
            </NicField>
          ) : null}
        </div>
      )}

      <div className="nic-actions-row">
        <button className="ofs-primary" onClick={() => void run()} disabled={busy}>
          <HiBolt className="nic-icon-lead" />
          {busy ? "Working…" : "Submit"}
        </button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {result ? (
        <div className="nic-result">
          <SuccessAlert>Done.</SuccessAlert>
          <JsonView data={result} title="NIC response" open />
        </div>
      ) : null}
    </section>
  );
}
