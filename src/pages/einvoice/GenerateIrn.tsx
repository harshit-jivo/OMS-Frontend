import { useEffect, useState } from "react";
import { HiDocumentMagnifyingGlass, HiBolt } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import type { FromInvoicePreview, GenerateResponse, IrnResult } from "../../services/einvoiceService";
import {
  NicField, KeyValues, JsonView, ValidationList, ErrorAlert, SuccessAlert,
  StatusBadge, apiErrorMessage,
} from "../../components/NicUI";
import QrViewer from "../../components/QrViewer";

export default function GenerateIrn() {
  const [docentry, setDocentry] = useState("");
  const [companyDb, setCompanyDb] = useState("");
  const [preview, setPreview] = useState<FromInvoicePreview | null>(null);
  const [result, setResult] = useState<IrnResult | null>(null);
  const [genResp, setGenResp] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "generate">("");

  const reset = () => {
    setPreview(null);
    setResult(null);
    setGenResp(null);
    setError("");
  };

  const doPreview = async () => {
    if (!docentry.trim()) return setError("Enter a SAP invoice DocEntry.");
    reset();
    setBusy("preview");
    try {
      setPreview(await einvoiceService.previewFromInvoice(docentry.trim(), companyDb.trim() || undefined));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const doGenerate = async () => {
    if (!docentry.trim()) return setError("Enter a SAP invoice DocEntry.");
    setError("");
    setResult(null);
    setBusy("generate");
    try {
      const resp = await einvoiceService.generateFromInvoice(docentry.trim(), {
        companyDb: companyDb.trim() || undefined,
      });
      setGenResp(resp);
      if (resp.result?.Irn) setResult(resp.result);
      else if (resp.error) setError(resp.error);
    } catch (err) {
      const e = err as { response?: { data?: GenerateResponse } };
      if (e.response?.data) {
        setGenResp(e.response.data);
        setError(e.response.data.error || apiErrorMessage(err));
      } else {
        setError(apiErrorMessage(err));
      }
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head">
        <span className="ofs-card-mark" />
        <h2>Generate IRN from SAP Invoice</h2>
      </div>
      <p className="nic-note">
        Enter a SAP invoice <strong>DocEntry</strong> (OINV). Preview maps and validates it without
        calling NIC; Generate registers the IRN and stores the signed invoice + QR.
      </p>

      <div className="nic-form-grid" style={{ marginTop: 14 }}>
        <NicField label="Invoice DocEntry" hint="OINV DocEntry (e.g. 76038)">
          <input className="nic-input" value={docentry} inputMode="numeric"
            onChange={(e) => setDocentry(e.target.value)} placeholder="76038" />
        </NicField>
        <NicField label="Company DB (optional)" hint="Defaults to the server's configured company">
          <input className="nic-input" value={companyDb}
            onChange={(e) => setCompanyDb(e.target.value)} placeholder="JIVO_OIL_HANADB" />
        </NicField>
      </div>

      <div className="nic-actions-row">
        <button className="ofs-secondary" onClick={() => void doPreview()} disabled={!!busy}>
          <HiDocumentMagnifyingGlass style={{ verticalAlign: "-3px", marginRight: 6 }} />
          {busy === "preview" ? "Loading…" : "Preview & Validate"}
        </button>
        <button className="ofs-primary" onClick={() => void doGenerate()} disabled={!!busy}>
          <HiBolt style={{ verticalAlign: "-3px", marginRight: 6 }} />
          {busy === "generate" ? "Generating…" : "Generate IRN"}
        </button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {genResp?.validation_errors ? <ValidationList errors={genResp.validation_errors} /> : null}

      {/* preview block */}
      {preview ? (
        <div className="nic-result">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <StatusBadge tone={preview.valid ? "ok" : "err"}>
              {preview.valid ? "Valid — ready to generate" : `${preview.error_count} issue(s)`}
            </StatusBadge>
            {preview.doc_no ? <StatusBadge tone="muted">Doc No {preview.doc_no}</StatusBadge> : null}
            {preview.company_db ? <StatusBadge tone="muted">{preview.company_db}</StatusBadge> : null}
          </div>
          <ValidationList errors={preview.validation_errors} />
          <JsonView data={preview.invoice} title="Mapped IRN payload" />
        </div>
      ) : null}

      {/* success block */}
      {result ? (
        <div className="nic-result">
          <SuccessAlert>IRN generated successfully.</SuccessAlert>
          <KeyValues
            items={[
              ["IRN", <span className="nic-mono">{result.Irn}</span>],
              ["Ack No", result.AckNo],
              ["Ack Date", result.AckDt],
              ["Status", result.Status],
              ["EWB No", result.EwbNo],
              ["Record ID", genResp?.record_id],
            ]}
          />
          {result.SignedQRCode ? (
            <div style={{ marginTop: 16 }}>
              <QrFromData
                data={result.SignedQRCode}
                irn={result.Irn}
                ackNo={result.AckNo}
                ackDt={result.AckDt}
                docNo={preview?.doc_no || (genResp?.docentry ? `DocEntry ${genResp.docentry}` : undefined)}
              />
            </div>
          ) : null}
          {genResp?.persistence_warning ? (
            <div className="nic-alert nic-alert--err" style={{ marginTop: 12 }}>
              <span>{genResp.persistence_warning}</span>
            </div>
          ) : null}
          <JsonView data={result} title="Full NIC response" />
        </div>
      ) : null}
    </section>
  );
}

/* renders a SignedQRCode string via the /qr/ endpoint, with print/download */
function QrFromData({ data, irn, ackNo, ackDt, docNo }: {
  data: string; irn?: string; ackNo?: string | number; ackDt?: string; docNo?: string;
}) {
  const [uri, setUri] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    einvoiceService.renderQr(data).then((r) => setUri(r.data_uri)).catch((e) => setErr(apiErrorMessage(e)));
  }, [data]);
  if (err) return <span className="nic-note">QR render failed: {err}</span>;
  if (!uri) return <span className="nic-note">Rendering QR…</span>;
  return (
    <QrViewer src={uri} caption="Signed QR — print this on the invoice."
      irn={irn} ackNo={ackNo} ackDt={ackDt} docNo={docNo} />
  );
}
