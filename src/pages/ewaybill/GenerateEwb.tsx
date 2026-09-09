import { useState } from "react";
import { HiDocumentMagnifyingGlass, HiTruck } from "react-icons/hi2";
import { ewaybillService } from "../../services/ewaybillService";
import type { EwbFromInvoicePreview, EwbGenerateResponse, TransportOverrides } from "../../services/ewaybillService";
import {
  NicField, KeyValues, JsonView, ValidationList, ErrorAlert, SuccessAlert, StatusBadge,
  CompanyDbSelect,
} from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import DateInput from "../../components/DateInput";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Notice } from "@/components/ui/page";

const TRANS_MODES = [["", "—"], ["1", "1 — Road"], ["2", "2 — Rail"], ["3", "3 — Air"], ["4", "4 — Ship"]];

export default function GenerateEwb() {
  const [docentry, setDocentry] = useState("");
  const [companyDb, setCompanyDb] = useState("JIVO_OIL_HANADB");
  const [mode, setMode] = useState("auto");
  const [t, setT] = useState<TransportOverrides>({ transDistance: 0, transMode: "1", vehicleType: "R" });
  const [preview, setPreview] = useState<EwbFromInvoicePreview | null>(null);
  const [resp, setResp] = useState<EwbGenerateResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "generate">("");

  const setField = (k: keyof TransportOverrides, v: string) => setT((p) => ({ ...p, [k]: v }));

  const cleanTransport = (): TransportOverrides => {
    const out: TransportOverrides = {};
    Object.entries(t).forEach(([k, v]) => {
      if (v !== "" && v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
    });
    return out;
  };

  const doPreview = async () => {
    if (!docentry.trim()) return setError("Enter a SAP invoice DocEntry.");
    setError(""); setPreview(null); setResp(null); setBusy("preview");
    try {
      setPreview(await ewaybillService.previewFromInvoice(docentry.trim(), {
        companyDb: companyDb.trim() || undefined, mode,
      }));
    } catch (err) {
      setError(messageFrom(err, "Request failed"));
    } finally {
      setBusy("");
    }
  };

  const doGenerate = async () => {
    if (!docentry.trim()) return setError("Enter a SAP invoice DocEntry.");
    setError(""); setResp(null); setBusy("generate");
    try {
      const r = await ewaybillService.generateFromInvoice(docentry.trim(), { transport: cleanTransport() }, {
        companyDb: companyDb.trim() || undefined, mode,
      });
      setResp(r);
      if (r.error) setError(r.error);
    } catch (err) {
      const e = err as { response?: { data?: EwbGenerateResponse } };
      if (e.response?.data) { setResp(e.response.data); setError(e.response.data.error || messageFrom(err, "Request failed")); }
      else setError(messageFrom(err, "Request failed"));
    } finally {
      setBusy("");
    }
  };

  const result = resp?.result;
  const ewbNo = result?.EwbNo ?? result?.ewayBillNo;
  const validTill = result?.EwbValidTill ?? result?.validUpto;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate e-Way Bill from SAP Invoice</CardTitle>
      </CardHeader>
      <p className="text-[12.5px] leading-relaxed text-subtle">
        Auto-uses <strong>EWB-by-IRN</strong> when the invoice already has a generated IRN, else the
        standalone GENEWAYBILL. Transport details are usually entered at dispatch — fill them below.
      </p>

      <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))] mt-3.5">
        <NicField label="Invoice DocEntry">
          <Input value={docentry} inputMode="numeric"
            onChange={(e) => setDocentry(e.target.value)} placeholder="76029" />
        </NicField>
        <NicField label="Company DB">
          <CompanyDbSelect value={companyDb} onChange={setCompanyDb} />
        </NicField>
        <NicField label="Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="auto">Auto (prefer IRN)</option>
            <option value="irn">EWB by IRN</option>
            <option value="standalone">Standalone</option>
          </Select>
        </NicField>
      </div>

      {/* A second heading inside the same card, so it needs the separation the
          card's own top padding gives the first one. */}
      <CardHeader className="mt-5">
        <CardTitle className="text-[15px]">Transport (Part-B)</CardTitle>
      </CardHeader>
      <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        <NicField label="Transport Mode">
          <Select value={t.transMode ?? ""} onChange={(e) => setField("transMode", e.target.value)}>
            {TRANS_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </NicField>
        <NicField label="Distance (km)" hint="0 = NIC auto-computes from pincodes">
          <Input value={String(t.transDistance ?? "")} inputMode="numeric"
            onChange={(e) => setField("transDistance", e.target.value)} placeholder="0" />
        </NicField>
        <NicField label="Vehicle No">
          <Input value={t.vehicleNo ?? ""} onChange={(e) => setField("vehicleNo", e.target.value)}
            placeholder="HR55AB1234" />
        </NicField>
        <NicField label="Vehicle Type">
          <Select value={t.vehicleType ?? ""} onChange={(e) => setField("vehicleType", e.target.value)}>
            <option value="">—</option>
            <option value="R">R — Regular</option>
            <option value="O">O — Over Dimensional Cargo</option>
          </Select>
        </NicField>
        <NicField label="Transporter ID" hint="15-char GSTIN / Transporter ID">
          <Input className="font-mono" value={t.transporterId ?? ""}
            onChange={(e) => setField("transporterId", e.target.value)} placeholder="06AAA…" />
        </NicField>
        <NicField label="Transporter Doc No">
          <Input value={t.transDocNo ?? ""} onChange={(e) => setField("transDocNo", e.target.value)} />
        </NicField>
        <NicField label="Transporter Doc Date" hint="dd/mm/yyyy">
          <DateInput value={t.transDocDate ?? ""} onChange={(v) => setField("transDocDate", v)} />
        </NicField>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button onClick={() => void doPreview()} disabled={!!busy}>
          <HiDocumentMagnifyingGlass aria-hidden="true" />
          {busy === "preview" ? "Loading…" : "Preview & Validate"}
        </Button>
        <Button variant="primary" onClick={() => void doGenerate()} disabled={!!busy}>
          <HiTruck aria-hidden="true" />
          {busy === "generate" ? "Generating…" : "Generate e-Way Bill"}
        </Button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {resp?.validation_errors ? <ValidationList errors={resp.validation_errors} /> : null}

      {preview ? (
        <div className="mt-5 space-y-4">
          <div className="mb-1.5 flex items-center gap-2.5">
            <StatusBadge tone={preview.valid ? "ok" : "err"}>
              {preview.valid ? "Valid" : `${preview.error_count} issue(s)`}
            </StatusBadge>
            <StatusBadge tone="muted">{preview.mode === "ewb_by_irn" ? "EWB by IRN" : "Standalone"}</StatusBadge>
            {preview.irn ? <StatusBadge tone="muted">IRN {preview.irn.slice(0, 12)}…</StatusBadge> : null}
          </div>
          <ValidationList errors={preview.validation_errors} />
          <JsonView data={preview.payload} title="EWB payload to be sent" />
        </div>
      ) : null}

      {result && ewbNo ? (
        <div className="mt-5 space-y-4">
          <SuccessAlert>e-Way Bill generated.</SuccessAlert>
          <KeyValues
            items={[
              ["EWB No", <span className="font-mono text-[12px]">{String(ewbNo)}</span>],
              ["Valid Till", validTill ? String(validTill) : ""],
              ["Mode", resp?.mode],
              ["Record ID", resp?.record_id],
            ]}
          />
          {resp?.persistence_warning ? (
            <Notice tone="bad" className="mt-3">{resp.persistence_warning}</Notice>
          ) : null}
          <JsonView data={result} title="Full NIC response" />
        </div>
      ) : null}
    </Card>
  );
}
