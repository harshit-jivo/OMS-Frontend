import { useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import { ewaybillService } from "../../services/ewaybillService";
import { NicField, JsonView, DetailsView, ErrorAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Card, CardHeader, CardTitle } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";

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
      setError(messageFrom(err, "Request failed"));
    } finally {
      setBusy(false);
    }
  };

  const placeholder = { ewb: "391010809803", irn: "64-character IRN", gstin: "06AACCJ4223F1Z0", transporter: "Transporter ID" }[mode];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lookup</CardTitle>
      </CardHeader>

      <TabList label="Lookup by" className="mb-4">
        {MODES.map(([m, label]) => (
          <Tab
            key={m}
            selected={mode === m}
            onClick={() => { setMode(m); setData(null); setError(""); setValue(""); }}
          >
            {label}
          </Tab>
        ))}
      </TabList>

      <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        <NicField label={MODES.find(([m]) => m === mode)![1]} full>
          <Input className="font-mono" value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder} />
        </NicField>
      </div>

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
