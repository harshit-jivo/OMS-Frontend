import { useState } from "react";
import { HiBolt } from "react-icons/hi2";
import { ewaybillService } from "../../services/ewaybillService";
import { NicField, JsonView, ErrorAlert, SuccessAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import DateInput from "../../components/DateInput";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardHeader, CardTitle } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";

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
    <Card>
      <CardHeader>
        <CardTitle>Manage e-Way Bill</CardTitle>
      </CardHeader>

      <TabList label="Action" className="mb-4">
        {MODES.map(([m, label]) => (
          <Tab
            key={m}
            selected={mode === m}
            onClick={() => { setMode(m); setResult(null); setError(""); }}
          >
            {label}
          </Tab>
        ))}
      </TabList>

      {mode === "partb" || mode === "extend" ? (
        <>
          <p className="text-[12.5px] leading-relaxed text-subtle">
            {mode === "partb"
              ? "VEHEWB — update Part B (vehicle/place/mode). Provide the NIC payload."
              : "EXTENDVALIDITY — extend an EWB nearing expiry. Provide the NIC payload."}
          </p>
          <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))] mt-3">
            <NicField label="Payload (JSON)" full>
              <Textarea value={json} onChange={(e) => setJson(e.target.value)} />
            </NicField>
          </div>
        </>
      ) : (
        <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          <NicField label="EWB Number">
            <Input className="font-mono" value={ewbNo} inputMode="numeric"
              onChange={(e) => setEwbNo(e.target.value)} placeholder="391010809803" />
          </NicField>
          {mode === "cancel" ? (
            <NicField label="Reason">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                {CANCEL_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </NicField>
          ) : null}
          {mode === "close" ? (
            <NicField label="Closure Date" hint="dd/mm/yyyy">
              <DateInput value={closureDate} onChange={setClosureDate} placeholder="03/07/2026" />
            </NicField>
          ) : null}
          {mode === "transporter" ? (
            <NicField label="Transporter ID" hint="15-char GSTIN / Transporter ID">
              <Input className="font-mono" value={transporterId}
                onChange={(e) => setTransporterId(e.target.value)} placeholder="06AAA…" />
            </NicField>
          ) : null}
          {mode === "cancel" || mode === "close" ? (
            <NicField label="Remarks">
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)}
                placeholder={mode === "close" ? "Delivered" : "Reason remarks"} />
            </NicField>
          ) : null}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button variant="primary" onClick={() => void run()} disabled={busy}>
          <HiBolt aria-hidden="true" />
          {busy ? "Working…" : "Submit"}
        </Button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {result ? (
        <div className="mt-5 space-y-4">
          <SuccessAlert>Done.</SuccessAlert>
          <JsonView data={result} title="NIC response" open />
        </div>
      ) : null}
    </Card>
  );
}
