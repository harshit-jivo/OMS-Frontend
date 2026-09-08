import { QRCodeCanvas } from "qrcode.react";
import { HiOutlinePrinter } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { APP_ORIGIN } from "../../services/apiPaths";
import { qrValueFor, type Asset } from "../../services/haisService";

import { MONO } from "./assetTone";

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
 *
 * THE LINK POINTS AT THE WEB APP, NOT THE API.
 *
 * It used to be built from `API_ORIGIN`, which is the Django host — so every
 * sticker printed carried `http://<api-host>:8081/hais/device/<serial>`, and
 * `/hais/device/:code` is a route in THIS app, not a URL Django serves. Every
 * scan landed on the server's own 404 page.
 *
 * `APP_ORIGIN` is `VITE_PUBLIC_APP_URL` when the environment sets it, and the
 * current origin otherwise. Set it wherever stickers are printed from: a QR is
 * physical, and one printed from a dev session is wrong for the life of the
 * device.
 */
const QR_BASE = APP_ORIGIN;

export default function AssetQr({ asset, size = 128 }: Props) {
  const serial = asset.qr_code || qrValueFor(asset.serial_num);
  if (!serial) return null;
  // The QR carries a URL to the standalone device page, so a plain camera scan
  // yields a clickable link (not just raw text).
  const value = `${QR_BASE}/hais/device/${encodeURIComponent(serial)}`;

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
          <img src="${dataUrl}" alt="${asset.asset_id} QR code" style="width:220px;height:220px" />
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
    <div className="flex w-[180px] shrink-0 flex-col items-center gap-2 rounded-md border border-line bg-surface p-3 text-center">
      <QRCodeCanvas id="hais-qr-canvas" value={value} size={size} level="M" includeMargin />
      <span className={MONO}>{serial}</span>
      <span className="text-[11px] leading-snug text-subtle">
        Scan with your phone camera to open this device
      </span>
      <Button size="xs" variant="ghost" type="button" onClick={print}>
        <HiOutlinePrinter aria-hidden="true" /> Print QR
      </Button>
    </div>
  );
}
