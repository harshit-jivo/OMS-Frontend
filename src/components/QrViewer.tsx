import {
  HiOutlineArrowDownTray,
  HiOutlineArrowsPointingOut,
  HiOutlinePrinter,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";

type QrViewerProps = {
  /** Image source — a data: URI (from /qr/) or the qr.png URL. */
  src: string;
  caption?: string;
  /** Details printed alongside the QR. */
  irn?: string;
  ackNo?: string | number;
  ackDt?: string;
  docNo?: string;
  downloadName?: string;
};

/**
 * Displays a NIC signed QR with Print / Download / Open actions.
 * Print opens a clean popup sized for a label and calls window.print().
 *
 * Converted late and for a reason: it wore `nic-qr-box` / `nic-qr-actions` /
 * `ofs-primary`, all defined in `Einvoice.css` — which stopped being imported
 * anywhere the moment HAIS converted, its last two callers. So the three
 * e-Invoice QR panels were rendering an unstyled box with UA-chrome buttons,
 * and nothing pointed at this file to say so. The `styles/` grep after a
 * module conversion has to include the SHARED components that module fed.
 */
export default function QrViewer({ src, caption, irn, ackNo, ackDt, docNo, downloadName }: QrViewerProps) {
  const printQr = () => {
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) return;
    const rows = [
      docNo ? `<div class="row"><span>Doc No</span><b>${escapeHtml(docNo)}</b></div>` : "",
      ackNo ? `<div class="row"><span>Ack No</span><b>${escapeHtml(String(ackNo))}</b></div>` : "",
      ackDt ? `<div class="row"><span>Ack Date</span><b>${escapeHtml(ackDt)}</b></div>` : "",
      irn ? `<div class="irn"><span>IRN</span><code>${escapeHtml(irn)}</code></div>` : "",
    ].join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>e-Invoice QR</title>
<style>
  *{box-sizing:border-box;font-family:Inter,Arial,sans-serif}
  body{margin:0;padding:24px;color:#0f172a;text-align:center}
  h3{margin:0 0 12px;font-size:14px;letter-spacing:.04em;color:#334155}
  img{width:280px;height:280px;image-rendering:pixelated}
  .meta{margin-top:14px;text-align:left;display:inline-block;min-width:260px}
  .row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px dashed #e2e8f0}
  .row span{color:#64748b}
  .irn{margin-top:8px;font-size:11px}
  .irn span{color:#64748b;display:block;margin-bottom:2px}
  .irn code{word-break:break-all;font-size:10px;color:#0f172a}
  @media print{body{padding:0}}
</style></head><body>
  <h3>e-Invoice Signed QR</h3>
  <img src="${src}" alt="Signed QR" />
  <div class="meta">${rows}</div>
  <script>
    var img=document.querySelector('img');
    function go(){setTimeout(function(){window.focus();window.print();},150);}
    if(img.complete)go();else img.onload=go;
  </script>
</body></html>`);
    w.document.close();
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = downloadName || `einvoice-qr${irn ? "-" + irn.slice(0, 10) : ""}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="flex w-fit flex-col items-center gap-3 rounded-card border border-line bg-surface p-4 text-center">
      {/* `pixelated`: a signed QR scaled with smoothing is a QR that will not
          scan. Same reason the print popup sets it. */}
      <img
        src={src}
        alt={caption || "Signed QR code"}
        className="size-[220px] rounded-sm bg-white p-2 [image-rendering:pixelated]"
      />
      {caption ? (
        <span className="max-w-[240px] text-[12px] leading-snug text-subtle">{caption}</span>
      ) : null}
      <div className="flex flex-wrap justify-center gap-1.5">
        <Button type="button" size="sm" variant="primary" onClick={printQr}>
          <HiOutlinePrinter aria-hidden="true" /> Print
        </Button>
        <Button type="button" size="sm" onClick={download}>
          <HiOutlineArrowDownTray aria-hidden="true" /> Download
        </Button>
        <Button type="button" size="sm" onClick={() => window.open(src, "_blank")}>
          <HiOutlineArrowsPointingOut aria-hidden="true" /> Open
        </Button>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
