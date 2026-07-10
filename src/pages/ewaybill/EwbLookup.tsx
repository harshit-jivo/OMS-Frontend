import { useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import { ewaybillService } from "../../services/ewaybillService";
import { NicField, JsonView, DetailsView, ErrorAlert, apiErrorMessage } from "../../components/NicUI";

type Mode = "ewb" | "irn" | "gstin" | "transporter";
const MODES: [Mode, string][] = [
  ["ewb", "By EWB No"], ["irn", "By IRN"], ["gstin", "GSTIN Details"], ["transporter", "Transporter"],
];

export default function EwbLookup() {
  const [mode, setMode] = useState<Mode>("ewb");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<unknown>(null);

  const run = async () => {
    if (!value.trim()) return setError("Enter a value to look up.");
    setError(""); setData(null); setBusy(true);
    try {
      const v = value.trim();
      if (mode === "ewb") setData(await ewaybillService.getByNumber(v));
      else if (mode === "irn") setData(await ewaybillService.getByIrn(v));
      else if (mode === "gstin") setData(await ewaybillService.gstinDetails(v));
      else setData(await ewaybillService.transporterDetails(v));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const placeholder = { ewb: "391010809803", irn: "64-character IRN", gstin: "06AACCJ4223F1Z0", transporter: "Transporter ID" }[mode];

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head">
        <span className="ofs-card-mark" />
        <h2>Lookup</h2>
      </div>

      <div className="nic-tabs" style={{ margin: "0 0 16px" }}>
        {MODES.map(([m, label]) => (
          <button key={m} className={`nic-tab ${mode === m ? "nic-tab-active" : ""}`}
            onClick={() => { setMode(m); setData(null); setError(""); setValue(""); }}>
            {label}
          </button>
        ))}
      </div>

      <div className="nic-form-grid">
        <NicField label={MODES.find(([m]) => m === mode)![1]} full>
          <input className="nic-input nic-mono" value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder} />
        </NicField>
      </div>

      <div className="nic-actions-row">
        <button className="ofs-primary" onClick={() => void run()} disabled={busy}>
          <HiMagnifyingGlass style={{ verticalAlign: "-3px", marginRight: 6 }} />
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {data ? (
        <div className="nic-result">
          <DetailsView data={data} />
          <JsonView data={data} title="Raw JSON" />
        </div>
      ) : null}
    </section>
  );
}
