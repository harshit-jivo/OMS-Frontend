/**
 * Look one device up by Asset ID, or by scanning its QR with the camera.
 */
import { useState, Suspense, lazy } from "react";
import {
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlineQrCode,
  HiOutlineUserPlus,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailFields } from "@/components/ui/detail";
import { Field, Input } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Notice } from "@/components/ui/page";
import { messageFrom } from "@/lib/apiError";
import { haisService, configSummary, holderLabel, type Asset } from "../../services/haisService";

import AssetActionModal from "./AssetActionModal";
import AssetHistory from "./AssetHistory";
import { MONO, assetStatusTone } from "./assetTone";

/*
 * The camera scanner is loaded when the user asks to scan.
 *
 * `html5-qrcode` is ~350 kB and was pulled in by the HAIS page chunk, so
 * looking up an asset by typing its code downloaded a camera library that
 * would never be used. It only ever renders behind `scanning &&`, which makes
 * it the cleanest possible split: the component's own mount condition IS the
 * moment the code is needed.
 */
const QrScanner = lazy(() => import("./QrScanner"));

type Props = {
  onEdit?: (assetId: string) => void;
};

// A scanned QR now carries a URL (…/hais/device/<serial>). Pull the serial out
// of it; if it's already a bare code, use it as-is.
function codeFromScan(text: string): string {
  const t = text.trim();
  const m = t.match(/\/hais\/device\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : t;
}

export default function AssetLookup({ onEdit }: Props) {
  const [assetId, setAssetId] = useState("");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Which action modal is open for the loaded asset (null = none).
  const [action, setAction] = useState<null | "handover" | "config">(null);
  // Whether the in-app camera scanner is open.
  const [scanning, setScanning] = useState(false);

  const run = async () => {
    const id = assetId.trim();
    if (!id) {
      setError("Enter an Asset ID to look up.");
      return;
    }
    setError("");
    setAsset(null);
    setBusy(true);
    try {
      setAsset(await haisService.get(id));
    } catch (err) {
      setError(messageFrom(err, "Request failed"));
    } finally {
      setBusy(false);
    }
  };

  // A QR was scanned — its payload is the device URL (or serial). Resolve the
  // serial to the matching device and show it right here.
  const onScan = async (text: string) => {
    setScanning(false);
    const code = codeFromScan(text);
    setError("");
    setAsset(null);
    setAssetId(code);
    setBusy(true);
    try {
      setAsset(await haisService.getBySerial(code));
    } catch (err) {
      setError(messageFrom(err, "Request failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Asset Lookup</CardTitle>
        </CardHeader>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <Field label="Asset ID" error={error || undefined} className="min-w-[240px] flex-1">
            {(c) => (
              <Input
                {...c}
                className={MONO}
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                placeholder="Type the Asset ID"
                autoComplete="off"
              />
            )}
          </Field>
          {/* Sits on the field's control line even when the field grows an
              error line below it. */}
          <div className={`flex gap-1.5 ${error ? "self-start pt-[22px]" : ""}`}>
            <Button type="submit" variant="primary" disabled={busy}>
              <HiOutlineMagnifyingGlass aria-hidden="true" /> {busy ? "Searching…" : "Look up"}
            </Button>
            <Button type="button" onClick={() => setScanning(true)} disabled={busy}>
              <HiOutlineQrCode aria-hidden="true" /> Scan QR
            </Button>
          </div>
        </form>
      </Card>

      {scanning && (
        // No fallback: the scanner is a dialog, and flashing a placeholder
        // before the real one is worse than a brief pause on the button.
        <Suspense fallback={null}>
          <QrScanner onDecode={(t) => void onScan(t)} onClose={() => setScanning(false)} />
        </Suspense>
      )}

      {asset && (
        <>
          <Card className="space-y-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className={`${MONO} text-[15px]`}>{asset.asset_id}</span>
                <Badge tone={assetStatusTone(asset.working_status as string)} dot>
                  {(asset.working_status as string) || "—"}
                </Badge>
              </CardTitle>
              <div className="flex gap-1.5">
                <Button size="xs" variant="ghost" onClick={() => onEdit?.(asset.asset_id)}>
                  <HiOutlinePencilSquare aria-hidden="true" /> Edit / update config
                </Button>
                <Button size="xs" onClick={() => setAction("handover")}>
                  <HiOutlineUserPlus aria-hidden="true" /> Handover
                </Button>
              </div>
            </CardHeader>
            <DetailFields
              hideWhenEmpty
              items={[
                ["Category", asset.asset_type],
                ["Company", asset.company],
                ["Model No.", asset.model_num],
                ["Serial No.", asset.serial_num],
                ["Configuration", configSummary(asset)],
                ["Warranty ends", asset.warranty_ends],
                ["Current user", holderLabel(asset)],
                ["Previous user", asset.prev_user_name || asset.prev_user_id],
                ["Department", asset.department],
                ["Email ID", asset.email_id],
                ["Current location", asset.current_location],
                ["Handover date", asset.handover_date],
                ["Vendor", asset.vendor],
                ["Date of last service", asset.date_of_last_service],
              ]}
            />
          </Card>

          {/* Full lifecycle — when the device moved, to whom, and why. */}
          <Card>
            <AssetHistory history={asset.history} />
          </Card>
        </>
      )}

      {!asset && !busy && !error ? (
        <Notice tone="info">
          Type an Asset ID above, or scan the QR sticker on the device.
        </Notice>
      ) : null}

      {asset && action && (
        <AssetActionModal
          asset={asset}
          mode={action}
          onClose={() => setAction(null)}
          onDone={(updated) => {
            setAsset(updated);
            setAction(null);
          }}
        />
      )}
    </div>
  );
}
