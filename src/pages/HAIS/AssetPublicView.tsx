/**
 * Standalone device page opened by scanning a device's QR sticker.
 *
 * IT WORKS WITHOUT AN ACCOUNT, and that is the whole point. The sticker is
 * read by whatever phone is to hand — usually somebody who found the laptop in
 * a meeting room and has no OMS login and never will. It used to call the
 * authenticated endpoint and tell that person to go and log in, which made the
 * QR useful only to the team that already had the register open.
 *
 * TWO VIEWS, ONE PAGE
 * -------------------
 * Signed in  → the full record: previous holder, employee IDs, purchase
 *              details and the complete handover history.
 * Anonymous  → the device, who has it, and how to reach them. Nothing else.
 *
 * The narrowing is enforced on the SERVER (`PublicAssetSerializer`), not here:
 * a field this component chose not to render would still have been in the
 * response for anyone reading the network tab. What this file does is pick
 * which endpoint to ask. Because the withheld fields arrive undefined,
 * `DetailFields hideWhenEmpty` drops their rows on its own and one set of
 * markup serves both.
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
import { loadSession } from "@/auth";
import { haisService, configSummary, holderLabel, type Asset } from "../../services/haisService";

import AssetHistory from "./AssetHistory";
import { MONO, NOTE, assetStatusTone } from "./assetTone";

export default function AssetPublicView() {
  const { code = "" } = useParams();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* Read once, at mount. A session cannot appear while somebody stands at a
     sticker, and re-reading it would mean re-fetching the device. */
  const [signedIn] = useState(() => Boolean(loadSession()));

  useEffect(() => {
    let alive = true;
    // The authenticated endpoint returns strictly more, so a signed-in scanner
    // — the IT admin doing an audit — gets the full record from the same URL.
    const fetchDevice = signedIn
      ? haisService.getBySerial(code)
      : haisService.getPublicBySerial(code);
    fetchDevice
      .then((a) => alive && setAsset(a))
      .catch((err) => alive && setError(messageFrom(err, "Request failed")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code, signedIn]);

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
              {/* No longer "you need to log in": an anonymous scan is expected
                  to work, so a failure here means the code did not match a
                  device — not that the reader lacks an account. */}
              Check that the whole code was scanned. If this sticker is damaged,
              the device can be found in OMS by its serial number.
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

            {/* Full lifecycle — who had it, when, and why. Signed-in only:
                it is a movement record of named staff, so the public endpoint
                does not return it and there is nothing to draw. */}
            {asset.history?.length ? <AssetHistory history={asset.history} /> : null}

            {!signedIn && (
              <p className={NOTE}>
                Found this device?{" "}
                {asset.email_id
                  ? "Contact the person above, or your IT team."
                  : "Contact your IT team."}{" "}
                <Link to="/" className="font-medium text-brand hover:underline">
                  Sign in
                </Link>{" "}
                for the full record.
              </p>
            )}
          </>
        ) : null}
      </Card>
    </div>
  );
}
