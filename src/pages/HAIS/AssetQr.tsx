import { QRCodeCanvas } from "qrcode.react";
import { qrValueFor, type Asset } from "../../services/haisService";

type Props = {
  asset: Asset;
  /** Rendered size of the QR in px (default 128). */
  size?: number;
};

/**
 * The device's QR code — encodes a LINK to the device page (…/hais/device/<serial>).
 * Scanning it with any phone camera shows a tappable URL; opening it runs the API
 * and shows all the device details. A Print button lays out the QR + labels so it
 * can be stuck on the physical asset.
 */
export default function AssetQr({ asset, size = 128 }: Props) {
  const serial = asset.qr_code || qrValueFor(asset.serial_num);
  if (!serial) return null;
  // The QR carries a URL to the standalone device page, so a plain camera scan
  // yields a clickable link (not just raw text).
  const value = `${window.location.origin}/hais/device/${encodeURIComponent(serial)}`;

  const print = () => {
    const win = window.open("", "_blank", "width=360,height=460");
    if (!win) return;
    // Re-render the QR into the print window as a data URL.
    const canvas = document.getElementById("hais-qr-canvas") as HTMLCanvasElement | null;
    const dataUrl = canvas?.toDataURL("image/png") ?? "";
    win.document.write(`
      <html>
        <head><title>${asset.asset_id} — QR</title></head>
        <body style="font-family:system-ui,Arial,sans-serif;text-align:center;padding:16px;margin:0">
          <img src="${dataUrl}" style="width:220px;height:220px" />
          <div style="font-family:monospace;font-size:14px;margin-top:8px">${asset.asset_id}</div>
          <div style="font-size:12px;color:#444">S/N: ${serial}</div>
          <div style="font-size:12px;color:#444">${asset.company ?? ""} ${asset.model_num ?? ""}</div>
          <div style="font-size:11px;color:#777;margin-top:6px">Scan with your phone camera to open this device</div>
          <scr` + `ipt>window.onload=function(){window.print();}</scr` + `ipt>
        </body>
      </html>`);
    win.document.close();
  };

  return (
    <div className="hais-qr">
      <QRCodeCanvas id="hais-qr-canvas" value={value} size={size} level="M" includeMargin />
      <div className="hais-qr-caption">
        <span className="nic-mono">{serial}</span>
        <span className="hais-qr-hint">Scan with your phone camera to open this device</span>
        <button className="nic-tab" type="button" onClick={print}>
          Print QR
        </button>
      </div>
    </div>
  );
}
