/**
 * SAP Sync · Status — the counts, and the buttons that refresh them.
 *
 * The tab exists to answer one question: did the data arrive? So the two
 * things it must never do are report a failure as a zero, and report a
 * success without saying what changed.
 */
import { useState } from "react";
import { HiArrowPath, HiBuildingOffice2, HiCube, HiMapPin, HiUsers } from "react-icons/hi2";
import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, Notice, Stat, StatRow } from "@/components/ui/page";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import {
  useSapAddresses,
  useSapBranches,
  useSapParties,
  useSapProducts,
} from "../../lib/sapQueries";
import { sapService } from "../../services/sapService";
import { num } from "./format";

interface LastSync {
  type: string;
  date: string;
  time: string;
  status: "success" | "failed";
}

/**
 * The last sync, as the previous visit left it.
 *
 * Read with a lazy initialiser rather than in an effect. The old mount effect
 * did four fetches AND `setLastSync(JSON.parse(saved))`, and that setState was
 * only legal because the fetches above it made the effect unanalysable — take
 * the fetches away and it becomes a `react-hooks/set-state-in-effect` error.
 * Reading it during the first render is also simply more correct: the badge is
 * painted once, instead of once blank and again a frame later.
 *
 * `JSON.parse` is guarded because this key is whatever a previous build wrote —
 * an unparseable value used to throw straight out of the effect and blank the
 * whole tab.
 */
const readLastSync = (): LastSync | null => {
  try {
    const saved = localStorage.getItem("lastSync");
    return saved ? (JSON.parse(saved) as LastSync) : null;
  } catch {
    return null;
  }
};

export default function Status() {
  /*
   * The four counts come from the same `["sap", …]` queries the other four
   * tabs render from, so switching to Products or Branches is now a cache hit
   * instead of a second download of the same list. It also fixes a real fault:
   * these four fetchers assigned `response.data` straight into state with no
   * `Array.isArray` guard, so a non-array body made `.length` undefined and
   * the "records held locally" total read `NaN`. The queries coerce.
   */
  const { items: products, isError: productsFailed } = useSapProducts();
  const { items: parties, isError: partiesFailed } = useSapParties();
  const { items: addresses, isError: addressesFailed } = useSapAddresses();
  const { items: branches, isError: branchesFailed } = useSapBranches();

  const queryClient = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<LastSync | null>(readLastSync);

  const saveLastSync = (type: string, status: "success" | "failed") => {
    const now = new Date();
    const entry: LastSync = {
      type,
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      status,
    };
    localStorage.setItem("lastSync", JSON.stringify(entry));
    setLastSync(entry);
  };

  const syncData = async (syncType: string, label: string) => {
    setLoading(syncType);

    try {
      const data = await sapService.syncData(syncType);

      // Backend returns { success: true|false, message: "..." }
      const isSuccess = data?.success === true;

      saveLastSync(syncType, isSuccess ? "success" : "failed");

      if (isSuccess) {
        // One invalidation for all five SAP tabs, which is what this button was
        // always meant to do and could not: it used to re-run only THIS tab's
        // four fetchers, leaving Products, Parties & Addresses, Branches and
        // Logs showing pre-sync data until the page was reloaded.
        void queryClient.invalidateQueries({ queryKey: ["sap"] });
        showToast({
          title: label + " synced",
          message: data?.message || "The counts above are up to date.",
        });
      } else {
        showToast({
          title: label + " sync failed",
          message: data?.message || "SAP reported a failure but gave no reason.",
        });
      }
    } catch (err) {
      saveLastSync(syncType, "failed");
      showToast({ title: label + " sync failed", message: messageFrom(err, "Unknown error") });
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  // The KPI row and the sync buttons are keyed off the same list, so a count and
  // the button that refreshes it always describe the same module.
  const modules = [
    {
      key: "products",
      label: "Products",
      hint: "Items and rates",
      icon: HiCube,
      count: products.length,
      failed: productsFailed,
    },
    {
      key: "parties",
      label: "Parties",
      hint: "Customers and groups",
      icon: HiUsers,
      count: parties.length,
      failed: partiesFailed,
    },
    {
      key: "addresses",
      label: "Addresses",
      hint: "Billing and shipping",
      icon: HiMapPin,
      count: addresses.length,
      failed: addressesFailed,
    },
    {
      key: "branches",
      label: "Branches",
      hint: "Branch mapping",
      icon: HiBuildingOffice2,
      count: branches.length,
      failed: branchesFailed,
    },
  ] as const;

  const totalRecords = modules.reduce((sum, module) => sum + module.count, 0);
  const busy = loading !== null;

  /*
   * Which lists failed to load. All four errors used to go to `console.log`
   * and leave the count at 0 — so "0 Products" meant either a genuinely empty
   * SAP table or a dead endpoint, and the page drew them identically. A zero
   * that is really a failure is the worst possible thing for a screen whose
   * entire job is telling you whether the data arrived.
   */
  const failed = modules.filter((module) => module.failed).map((module) => module.label);

  return (
    <div className="space-y-4 sm:space-y-6">
      {failed.length > 0 && (
        <Notice tone="bad" title="Some counts are missing">
          Could not load {failed.join(", ")}. The totals below are incomplete — a zero here may
          mean the list is empty, or that the request for it failed.
        </Notice>
      )}

      <StatRow>
        {modules.map((module) => (
          <Stat
            key={module.key}
            // A count that failed to load shows a dash rather than a zero, for
            // the reason in the comment above.
            value={module.failed ? "—" : num(module.count)}
            label={module.label}
            hint={module.hint}
            icon={module.icon}
            tone={module.failed ? "bad" : "neutral"}
          />
        ))}
      </StatRow>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Pull fresh data from SAP</CardTitle>
            <p className="m-0 mt-1 text-[12px] text-subtle">
              {num(totalRecords)} records held locally across 4 modules
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => void syncData("all", "Everything")}
            disabled={busy}
          >
            <HiArrowPath className={loading === "all" ? "animate-spin" : ""} aria-hidden="true" />
            {loading === "all" ? "Syncing everything…" : "Sync all"}
          </Button>
        </CardHeader>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
          {modules.map((module) => {
            const Icon = module.icon;
            const isActive = loading === module.key;
            return (
              <Button
                key={module.key}
                onClick={() => void syncData(module.key, module.label)}
                disabled={busy}
                // Two lines of copy, so this cannot keep the 40px field height.
                // `h-auto` only wins because `Button` runs its classes through
                // `cn`, which has been taught the `h-control` token — see the
                // tailwind-merge trap in DESIGN_SYSTEM §1.4.
                className="h-auto items-start justify-start gap-3 px-3 py-3 text-left"
              >
                <Icon
                  className={
                    "mt-px shrink-0 text-[15px] text-brand" + (isActive ? " animate-spin" : "")
                  }
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold text-ink">
                    {isActive ? "Syncing…" : "Sync " + module.label}
                  </span>
                  <span className="text-[12px] font-normal text-subtle">{module.hint}</span>
                </span>
              </Button>
            );
          })}
        </div>

        <p className="m-0 mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[12px] text-subtle">
          Last run:{" "}
          <strong className="font-semibold text-ink">
            {lastSync ? lastSync.type + " · " + lastSync.date + " " + lastSync.time : "No sync yet"}
          </strong>
          {lastSync?.status && (
            <Badge tone={lastSync.status === "success" ? "ok" : "bad"}>
              {lastSync.status === "success" ? "Success" : "Failed"}
            </Badge>
          )}
        </p>
      </Card>
    </div>
  );
}
