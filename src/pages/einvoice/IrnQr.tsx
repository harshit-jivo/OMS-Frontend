import { useState } from "react";
import { HiQrCode } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import { NicField, ErrorAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import QrViewer from "../../components/QrViewer";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { Card, CardHeader, CardTitle } from "@/components/ui/page";

export default function IrnQr() {
  const [irn, setIrn] = useState("");
  const [qrData, setQrData] = useState("");
  const [uri, setUri] = useState("");
  const [imgIrn, setImgIrn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const renderFromData = async () => {
    if (!qrData.trim()) return setError("Paste the SignedQRCode string.");
    setError(""); setUri(""); setImgIrn(""); setBusy(true);
    try {
      const r = await einvoiceService.renderQr(qrData.trim());
      setUri(r.data_uri);
    } catch (err) {
      setError(messageFrom(err, "Request failed"));
    } finally {
      setBusy(false);
    }
  };

  const showStored = () => {
    if (!irn.trim()) return setError("Enter an IRN.");
    setError(""); setUri("");
    setImgIrn(irn.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed QR Code</CardTitle>
      </CardHeader>
      <p className="text-[12.5px] leading-relaxed text-subtle">
        Render the NIC signed QR for printing. Use a stored IRN, or paste a raw
        <code> SignedQRCode</code> string.
      </p>

      <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))] mt-3.5">
        <NicField label="View stored QR by IRN">
          <Input className="font-mono" value={irn} onChange={(e) => setIrn(e.target.value)}
            placeholder="64-character IRN hash" />
        </NicField>
        <div className="flex items-end">
          <Button onClick={showStored}>Show stored QR</Button>
        </div>
      </div>

      <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))] mt-3.5">
        <NicField label="…or render from SignedQRCode string" full>
          <Textarea value={qrData} onChange={(e) => setQrData(e.target.value)}
            placeholder="Paste the SignedQRCode (JWS) string here" />
        </NicField>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button variant="primary" onClick={() => void renderFromData()} disabled={busy}>
          <HiQrCode aria-hidden="true" />
          {busy ? "Rendering…" : "Render QR"}
        </Button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      {imgIrn ? (
        <div className="mt-5 space-y-4">
          <QrViewer src={einvoiceService.qrImageUrl(imgIrn)} irn={imgIrn}
            caption={`Stored signed QR for IRN ${imgIrn.slice(0, 12)}…`} />
        </div>
      ) : null}
      {uri ? (
        <div className="mt-5 space-y-4">
          <QrViewer src={uri} caption="Rendered from the pasted string." />
        </div>
      ) : null}
    </Card>
  );
}
