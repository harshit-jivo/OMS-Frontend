/**
 * Standalone device page opened by scanning a device's QR. The QR encodes a URL
 * pointing here; opening it runs the API (getBySerial) and shows the device's
 * latest details — current holder, previous holder / Unassigned, config, history.
 * Needs an OMS session (the API is authenticated); if there is none, it says so.
 *
 * It renders OUTSIDE the app shell (no sidebar, no header): the person
 * opening it is holding a phone at a sticker, so it is one column with the
 * page's own canvas painted here.
 */
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { DetailFields } from "@/components/ui/detail";
import { Card, Notice, SectionHeading } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { messageFrom } from "@/lib/apiError";
import { haisService, configSummary, holderLabel, type Asset } from "../../services/haisService";

import AssetHistory from "./AssetHistory";
import { MONO, NOTE, assetStatusTone } from "./assetTone";

export default function AssetPublicView() {
  const { code = "" } = useParams();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    haisService
      .getBySerial(code)
      .then((a) => alive && setAsset(a))
      .catch((err) => alive && setError(messageFrom(err, "Request failed")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code]);

  // `font-sans`: the app shell sets Inter on `.app-page`, and this route
  // renders outside it.
  return (
    <div className="tw-page min-h-svh bg-canvas p-3 font-sans text-ink-soft sm:p-6">
      <Card className="mx-auto max-w-[720px] space-y-5">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-brand">
          OMS · Hardware Asset
        </p>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <>
            <Notice tone="bad">{error}</Notice>
            <p className={NOTE}>
              You may need to{" "}
              <Link to="/" className="font-medium text-brand hover:underline">
                log in to OMS
              </Link>{" "}
              to view this device, then scan again.
            </p>
          </>
        ) : asset ? (
          <>
            {/* Explicit margins: `m-0` would also cancel the Card's `space-y`. */}
            <h1 className="mb-4 mt-0 flex flex-wrap items-center gap-2 text-[22px] font-bold text-ink">
              <span className={`${MONO} text-[20px]`}>{asset.asset_id}</span>
              <Badge tone={assetStatusTone(asset.working_status as string)} dot>
                {(asset.working_status as string) || "—"}
              </Badge>
            </h1>

            <section className="space-y-2.5">
              <SectionHeading>Device</SectionHeading>
              <DetailFields
                hideWhenEmpty
                items={[
                  ["Category", asset.asset_type],
                  ["Company", asset.company],
                  ["Model No.", asset.model_num],
                  ["Serial No.", asset.serial_num],
                  ["Configuration", configSummary(asset)],
                  ["Warranty ends", asset.warranty_ends],
                  ["Working status", asset.working_status],
                ]}
              />
            </section>

            <section className="space-y-2.5">
              <SectionHeading>Assignment</SectionHeading>
              <DetailFields
                hideWhenEmpty
                items={[
                  ["Current user", holderLabel(asset)],
                  ["Current user ID", asset.current_user_id],
                  ["Previous user", asset.prev_user_name || asset.prev_user_id],
                  ["Department", asset.department],
                  ["Email ID", asset.email_id],
                  ["Current location", asset.current_location],
                  ["Handover date", asset.handover_date],
                ]}
              />
            </section>

            {/* Full lifecycle — who had it, when, and why. */}
            <AssetHistory history={asset.history} />
          </>
        ) : null}
      </Card>
    </div>
  );
}
