import { useState } from "react";
import { HiXCircle } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import { NicField, KeyValues, JsonView, ErrorAlert, SuccessAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Card, CardHeader, CardTitle } from "@/components/ui/page";

const REASONS = [
  { code: "1", label: "1 — Duplicate" },
  { code: "2", label: "2 — Data entry mistake" },
  { code: "3", label: "3 — Order cancelled" },
  { code: "4", label: "4 — Other" },
];

export default function CancelIrn() {
  const [irn, setIrn] = useState("");
  const [reason, setReason] = useState("2");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const submit = async () => {
    if (!irn.trim()) return setError("IRN is required.");
    if (!remarks.trim()) return setError("Remarks are required.");
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const resp = await einvoiceService.cancel(irn.trim(), reason, remarks.trim());
      // NIC returns HTTP 200 even for business failures, so inspect the body.
      const failMsg = nicErrorMessage(resp);
      if (failMsg) {
        setError(friendlyCancelError(failMsg));
        return;
      }
      setResult((resp?.result as Record<string, unknown>) || resp);
    } catch (err) {
      const body = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const failMsg = body ? nicErrorMessage(body) : "";
      setError(failMsg ? friendlyCancelError(failMsg) : messageFrom(err, "Request failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cancel IRN</CardTitle>
      </CardHeader>
      <p className="text-[12.5px] leading-relaxed text-subtle">
        An IRN can be cancelled within <strong>24 hours</strong> of generation and only if no active
        e-Way Bill exists against it. The stored record is marked <code>CANCELLED</code>.
      </p>

      <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-5 gap-y-4">
        <NicField label="IRN" full hint="The 64-character IRN hash">
          <Input className="font-mono" value={irn} onChange={(e) => setIrn(e.target.value)}
            placeholder="e.g. 35dc2001edd8a0b07abb1126…" />
        </NicField>
        <NicField label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </Select>
        </NicField>
        <NicField label="Remarks" hint="Why it is being cancelled">
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)}
            placeholder="Data entry mistake" />
        </NicField>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button variant="primary" onClick={() => void submit()} disabled={busy}>
          <HiXCircle aria-hidden="true" />
          {busy ? "Cancelling…" : "Cancel IRN"}
        </Button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {result ? (
        <div className="mt-5 space-y-4">
          <SuccessAlert>IRN cancelled.</SuccessAlert>
          <KeyValues
            items={[
              ["IRN", <span className="font-mono text-[12px]">{String(result.Irn ?? irn)}</span>],
              ["Cancel Date", String(result.CancelDate ?? "")],
            ]}
          />
          <JsonView data={result} title="Full NIC response" />
        </div>
      ) : null}
    </Card>
  );
}

/* Pull the NIC business-error message out of a response body ({error, errors:[…]}). */
function nicErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as { error?: string; errors?: Array<{ code?: string; message?: string }> };
  if (!b.error && !b.errors?.length) return "";
  const first = b.errors?.[0];
  if (first?.message) return first.code ? `${first.message} (code ${first.code})` : first.message;
  return b.error || "";
}

/* Friendlier wording for the common cancel failures. */
function friendlyCancelError(msg: string): string {
  if (/not active|already cancel/i.test(msg)) {
    return `This IRN is already cancelled (or no longer active). ${msg}`;
  }
  if (/24 ?hour|time.*expire|cannot be cancelled/i.test(msg)) {
    return `Cancellation window has passed — an IRN can only be cancelled within 24 hours. ${msg}`;
  }
  if (/e-?way ?bill|ewb/i.test(msg)) {
    return `Cancel the active e-Way Bill first, then cancel the IRN. ${msg}`;
  }
  return msg;
}
