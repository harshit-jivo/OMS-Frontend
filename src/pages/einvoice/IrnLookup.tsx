import { useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import { NicField, JsonView, DetailsView, ErrorAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import DateInput from "../../components/DateInput";

type Mode = "irn" | "doc" | "rejected";

export default function IrnLookup() {
  const [mode, setMode] = useState<Mode>("irn");
  const [irn, setIrn] = useState("");
  const [doctype, setDoctype] = useState("INV");
  const [docnum, setDocnum] = useState("");
  const [docdate, setDocdate] = useState("");
  const [rejDate, setRejDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<unknown>(null);

  const run = async () => {
    setError("");
    setData(null);
    setBusy(true);
    try {
      if (mode === "irn") {
        if (!irn.trim()) throw new Error("IRN is required.");
        setData(await einvoiceService.getByIrn(irn.trim()));
      } else if (mode === "doc") {
        if (!docnum.trim() || !docdate.trim()) throw new Error("Doc number and date are required.");
        setData(await einvoiceService.getByDoc(doctype, docnum.trim(), docdate.trim()));
      } else {
        if (!rejDate.trim()) throw new Error("Date is required.");
        setData(await einvoiceService.getRejected(rejDate.trim()));
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
        <h2>Lookup</h2>
      </div>

      <div className="nic-tabs" style={{ margin: "0 0 16px" }}>
        {([["irn", "By IRN"], ["doc", "By Document"], ["rejected", "Rejected IRNs"]] as [Mode, string][]).map(
          ([m, label]) => (
            <button key={m} className={`nic-tab ${mode === m ? "nic-tab-active" : ""}`}
              onClick={() => { setMode(m); setData(null); setError(""); }}>
              {label}
            </button>
          )
        )}
      </div>

      {mode === "irn" ? (
        <div className="nic-form-grid">
          <NicField label="IRN" full>
            <input className="nic-input nic-mono" value={irn} onChange={(e) => setIrn(e.target.value)}
              placeholder="64-character IRN hash" />
          </NicField>
        </div>
      ) : mode === "doc" ? (
        <div className="nic-form-grid">
          <NicField label="Doc Type">
            <select className="nic-select" value={doctype} onChange={(e) => setDoctype(e.target.value)}>
              <option value="INV">INV</option>
              <option value="CRN">CRN</option>
              <option value="DBN">DBN</option>
            </select>
          </NicField>
          <NicField label="Doc Number">
            <input className="nic-input" value={docnum} onChange={(e) => setDocnum(e.target.value)}
              placeholder="626070175" />
          </NicField>
          <NicField label="Doc Date" hint="dd/mm/yyyy">
            <DateInput value={docdate} onChange={setDocdate} placeholder="02/07/2026" />
          </NicField>
        </div>
      ) : (
        <div className="nic-form-grid">
          <NicField label="Date" hint="dd/mm/yyyy — IRNs the taxpayer rejected on this date">
            <DateInput value={rejDate} onChange={setRejDate} placeholder="03/07/2026" />
          </NicField>
        </div>
      )}

      <div className="nic-actions-row">
        <button className="ofs-primary" onClick={() => void run()} disabled={busy}>
          <HiMagnifyingGlass className="nic-icon-lead" />
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
