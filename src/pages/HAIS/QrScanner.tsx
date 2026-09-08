import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Notice } from "@/components/ui/page";

import { NOTE } from "./assetTone";

type Props = {
  /** Fired once with the decoded text when a QR is read. */
  onDecode: (text: string) => void;
  onClose: () => void;
};

const READER_ID = "hais-qr-reader";

/**
 * In-app QR scanner. Opens the device camera, decodes the first QR it sees,
 * hands the text back to the parent, and shuts the camera down. No external
 * scanner app is involved — everything happens inside our app.
 */
export default function QrScanner({ onDecode, onClose }: Props) {
  const [error, setError] = useState("");
  // Guard so we only report the first successful read and never double-stop.
  const doneRef = useRef(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    // Browsers only allow the camera on a secure context (HTTPS or localhost).
    // On a plain http:// server the camera API is unavailable, so explain the
    // working alternative rather than failing with a generic camera error.
    if (!window.isSecureContext) {
      setError(
        "In-app camera scanning needs HTTPS. On an http server, scan the device's " +
          "QR with your phone's normal camera app instead — it opens the device page.",
      );
      return;
    }

    const scanner = new Html5Qrcode(READER_ID);
    scannerRef.current = scanner;

    const stop = async () => {
      try {
        if (scanner.isScanning) await scanner.stop();
        scanner.clear();
      } catch {
        /* camera already released */
      }
    };

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (doneRef.current) return;
          doneRef.current = true;
          void stop().then(() => onDecode(decodedText.trim()));
        },
        () => {
          /* per-frame decode miss — ignore, this fires constantly */
        },
      )
      .catch((err) => {
        setError(
          err?.toString?.().includes("NotAllowed")
            ? "Camera permission was denied. Allow camera access and try again."
            : "Could not start the camera. Check that a camera is available.",
        );
      });

    return () => {
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent title="Scan device QR" size="sm">
        <DialogHeader>
          <DialogTitle>Scan device QR</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {/* The library draws the video into this box; the fixed height keeps
              the dialog from jumping as the camera starts. */}
          <div id={READER_ID} className="min-h-[280px] overflow-hidden rounded-md bg-ink" />
          <p className={`${NOTE} text-center`}>Point the camera at the QR sticker on the device.</p>
          {error && <Notice tone="bad">{error}</Notice>}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
