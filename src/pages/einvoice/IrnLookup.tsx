import { useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import { NicField, JsonView, DetailsView, ErrorAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import DateInput from "../../components/DateInput";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Card, CardHeader, CardTitle } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";

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
    <Card>
      <CardHeader>
        <CardTitle>Lookup</CardTitle>
      </CardHeader>

      <TabList label="Lookup by" className="mb-4">
        {([["irn", "By IRN"], ["doc", "By Document"], ["rejected", "Rejected IRNs"]] as [Mode, string][]).map(
          ([m, label]) => (
            <Tab
              key={m}
              selected={mode === m}
              onClick={() => { setMode(m); setData(null); setError(""); }}
            >
              {label}
            </Tab>
          )
        )}
      </TabList>

      {mode === "irn" ? (
        <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          <NicField label="IRN" full>
            <Input className="font-mono" value={irn} onChange={(e) => setIrn(e.target.value)}
              placeholder="64-character IRN hash" />
          </NicField>
        </div>
      ) : mode === "doc" ? (
        <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          <NicField label="Doc Type">
            <Select value={doctype} onChange={(e) => setDoctype(e.target.value)}>
              <option value="INV">INV</option>
              <option value="CRN">CRN</option>
              <option value="DBN">DBN</option>
            </Select>
          </NicField>
          <NicField label="Doc Number">
            <Input value={docnum} onChange={(e) => setDocnum(e.target.value)}
              placeholder="626070175" />
          </NicField>
          <NicField label="Doc Date" hint="dd/mm/yyyy">
            <DateInput value={docdate} onChange={setDocdate} placeholder="02/07/2026" />
          </NicField>
        </div>
      ) : (
        <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          <NicField label="Date" hint="dd/mm/yyyy — IRNs the taxpayer rejected on this date">
            <DateInput value={rejDate} onChange={setRejDate} placeholder="03/07/2026" />
          </NicField>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button variant="primary" onClick={() => void run()} disabled={busy}>
          <HiMagnifyingGlass aria-hidden="true" />
          {busy ? "Searching…" : "Search"}
        </Button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {data ? (
        <div className="mt-5 space-y-4">
          <DetailsView data={data} />
          <JsonView data={data} title="Raw JSON" />
        </div>
      ) : null}
    </Card>
  );
}
