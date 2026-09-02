import { useState } from "react";
import { HiQrCode } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import { NicField, ErrorAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import QrViewer from "../../components/QrViewer";

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
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head">
        <span className="ofs-card-mark" />
        <h2>Signed QR Code</h2>
      </div>
      <p className="nic-note">
        Render the NIC signed QR for printing. Use a stored IRN, or paste a raw
        <code> SignedQRCode</code> string.
      </p>

      <div className="nic-form-grid nic-form-grid--spaced-wide">
        <NicField label="View stored QR by IRN">
          <input className="nic-input nic-mono" value={irn} onChange={(e) => setIrn(e.target.value)}
            placeholder="64-character IRN hash" />
        </NicField>
        <div className="nic-field-bottom">
          <button className="ofs-secondary" onClick={showStored}>Show stored QR</button>
        </div>
      </div>

      <div className="nic-form-grid nic-form-grid--spaced-wide">
        <NicField label="…or render from SignedQRCode string" full>
          <textarea className="nic-textarea" value={qrData} onChange={(e) => setQrData(e.target.value)}
            placeholder="Paste the SignedQRCode (JWS) string here" />
        </NicField>
      </div>
      <div className="nic-actions-row">
        <button className="ofs-primary" onClick={() => void renderFromData()} disabled={busy}>
          <HiQrCode className="nic-icon-lead" />
          {busy ? "Rendering…" : "Render QR"}
        </button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      {imgIrn ? (
        <div className="nic-result">
          <QrViewer src={einvoiceService.qrImageUrl(imgIrn)} irn={imgIrn}
            caption={`Stored signed QR for IRN ${imgIrn.slice(0, 12)}…`} />
        </div>
      ) : null}
      {uri ? (
        <div className="nic-result">
          <QrViewer src={uri} caption="Rendered from the pasted string." />
        </div>
      ) : null}
    </section>
  );
}
