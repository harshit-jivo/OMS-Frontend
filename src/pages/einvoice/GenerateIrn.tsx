import { useEffect, useState } from "react";
import { HiDocumentMagnifyingGlass, HiBolt } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import type { FromInvoicePreview, GenerateResponse, IrnResult } from "../../services/einvoiceService";
import {
  NicField, KeyValues, JsonView, ValidationList, ErrorAlert, SuccessAlert,
  StatusBadge, CompanyDbSelect,
} from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import QrViewer from "../../components/QrViewer";

export default function GenerateIrn() {
  const [docentry, setDocentry] = useState("");
  const [idType, setIdType] = useState<"docentry" | "docnum">("docentry");
  const [companyDb, setCompanyDb] = useState("JIVO_OIL_HANADB");
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

  const idLabel = idType === "docnum" ? "Doc Number" : "DocEntry";

  const doPreview = async () => {
    if (!docentry.trim()) return setError(`Enter a SAP invoice ${idLabel}.`);
    reset();
    setBusy("preview");
    try {
      setPreview(await einvoiceService.previewFromInvoice(docentry.trim(), companyDb.trim() || undefined, idType));
    } catch (err) {
      setError(messageFrom(err, "Request failed"));
    } finally {
      setBusy("");
    }
  };

  const doGenerate = async () => {
    if (!docentry.trim()) return setError(`Enter a SAP invoice ${idLabel}.`);
    setError("");
    setResult(null);
    setBusy("generate");
    try {
      const resp = await einvoiceService.generateFromInvoice(docentry.trim(), {
        companyDb: companyDb.trim() || undefined,
        idType,
      });
      setGenResp(resp);
      if (resp.result?.Irn) setResult(resp.result);
      else if (resp.error) setError(resp.error);
    } catch (err) {
      const e = err as { response?: { data?: GenerateResponse } };
      if (e.response?.data) {
        setGenResp(e.response.data);
        setError(e.response.data.error || messageFrom(err, "Request failed"));
      } else {
        setError(messageFrom(err, "Request failed"));
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
        Look up a SAP invoice by <strong>DocEntry</strong> (internal key) or <strong>Doc Number</strong>
        (the visible invoice no.). Preview maps and validates it without calling NIC; Generate registers
        the IRN and stores the signed invoice + QR.
      </p>

      <div className="nic-form-grid nic-form-grid--spaced-wide">
        <NicField label="Look up by">
          <select className="nic-select" value={idType}
            onChange={(e) => setIdType(e.target.value as "docentry" | "docnum")}>
            <option value="docentry">DocEntry (internal key)</option>
            <option value="docnum">Doc Number (visible no.)</option>
          </select>
        </NicField>
        <NicField label={`Invoice ${idLabel}`}
          hint={idType === "docnum" ? "Visible invoice no. (e.g. 626070166)" : "OINV DocEntry (e.g. 76038)"}>
          <input className="nic-input" value={docentry} inputMode="numeric"
            onChange={(e) => setDocentry(e.target.value)}
            placeholder={idType === "docnum" ? "626070166" : "76038"} />
        </NicField>
        <NicField label="Company DB"
          hint={idType === "docnum" ? "Tried first; other DBs are searched if not found here" : undefined}>
          <CompanyDbSelect value={companyDb} onChange={setCompanyDb} />
        </NicField>
      </div>

      <div className="nic-actions-row">
        <button className="ofs-secondary" onClick={() => void doPreview()} disabled={!!busy}>
          <HiDocumentMagnifyingGlass className="nic-icon-lead" />
          {busy === "preview" ? "Loading…" : "Preview & Validate"}
        </button>
        <button className="ofs-primary" onClick={() => void doGenerate()} disabled={!!busy}>
          <HiBolt className="nic-icon-lead" />
          {busy === "generate" ? "Generating…" : "Generate IRN"}
        </button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {genResp?.validation_errors ? <ValidationList errors={genResp.validation_errors} /> : null}

      {/* preview block */}
      {preview ? (
        <div className="nic-result">
          <div className="nic-row-inline">
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
          <SuccessAlert>
            IRN generated successfully{genResp?.company_db ? ` (from ${genResp.company_db})` : ""}.
          </SuccessAlert>
          {genResp?.test_warning ? (
            <div className="nic-alert nic-alert--err nic-alert--strong">
              <span>{genResp.test_warning}</span>
            </div>
          ) : null}
          <KeyValues
            items={[
              ["IRN", <span className="nic-mono">{result.Irn}</span>],
              ["Ack No", result.AckNo],
              ["Ack Date", result.AckDt],
              ["Status", result.Status],
              ["EWB No", result.EwbNo],
              ["Company DB", genResp?.company_db],
              ["Record ID", genResp?.record_id],
            ]}
          />
          {result.SignedQRCode ? (
            <div className="nic-block-offset">
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
            <div className="nic-alert nic-alert--err nic-alert--offset">
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
    einvoiceService.renderQr(data).then((r) => setUri(r.data_uri)).catch((e) => setErr(messageFrom(e, "Request failed")));
  }, [data]);
  if (err) return <span className="nic-note">QR render failed: {err}</span>;
  if (!uri) return <span className="nic-note">Rendering QR…</span>;
  return (
    <QrViewer src={uri} caption="Signed QR — print this on the invoice."
      irn={irn} ackNo={ackNo} ackDt={ackDt} docNo={docNo} />
  );
}
