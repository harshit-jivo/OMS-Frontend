import { useState } from "react";
import { HiArrowPath, HiBuildingOffice2, HiCube, HiMapPin, HiUsers } from "react-icons/hi2";
import { useQueryClient } from "@tanstack/react-query";
import { sapService } from "../services/sapService";
import { useSapAddresses, useSapBranches, useSapParties, useSapProducts } from "../lib/sapQueries";
import "../styles/Status.css";
import { Badge } from "@/components/ui/badge";
import { messageFrom } from "@/lib/apiError";

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

  const syncData = async (syncType: string) => {
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
        alert(data?.message || "Sync completed successfully");
      } else {
        alert("Sync failed: " + (data?.message || "Unknown error"));
      }
    } catch (err) {
      saveLastSync(syncType, "failed");
      alert("Sync failed: " + messageFrom(err, "Unknown error"));
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
  const failed = modules
    .filter((module) => module.failed)
    .map((module) => module.label);

  return (
    <div className="st-page app-page">
      {failed.length > 0 && (
        <p className="st-load-error" role="alert">
          Could not load {failed.join(", ")} — the counts below are incomplete.
        </p>
      )}

      {/* ── KPI cards ── */}
      <div className="st-kpi-row">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <article
              className={`st-kpi ${loading === module.key ? "st-kpi-busy" : ""}`}
              key={module.key}
            >
              <span className="st-kpi-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="st-kpi-body">
                <span className="st-kpi-value">{module.count.toLocaleString("en-IN")}</span>
                <span className="st-kpi-label">{module.label}</span>
                <span className="st-kpi-hint">{module.hint}</span>
              </div>
            </article>
          );
        })}
      </div>

      {/* ── Sync actions ── */}
      <section className="st-panel st-sync-panel">
        <div className="st-panel-head">
          <div>
            <div className="st-section-label">Manual Sync</div>
            <h2 className="st-panel-title">Pull fresh data from SAP</h2>
          </div>
          <button
            type="button"
            className={`st-sync-all ${loading === "all" ? "st-sync-all-busy" : ""}`}
            onClick={() => syncData("all")}
            disabled={busy}
          >
            <HiArrowPath className={loading === "all" ? "st-spin" : ""} aria-hidden="true" />
            {loading === "all" ? "Syncing everything…" : "Sync All"}
          </button>
        </div>

        <div className="st-sync-grid">
          {modules.map((module) => {
            const Icon = module.icon;
            const isActive = loading === module.key;
            return (
              <button
                key={module.key}
                type="button"
                className={`st-sync-btn ${isActive ? "st-sync-active" : ""}`}
                onClick={() => syncData(module.key)}
                disabled={busy}
              >
                <span className="st-sync-btn-icon" aria-hidden="true">
                  <Icon className={isActive ? "st-spin" : ""} />
                </span>
                <span className="st-sync-btn-copy">
                  <span className="st-sync-btn-title">
                    {isActive ? "Syncing…" : `Sync ${module.label}`}
                  </span>
                  <span className="st-sync-btn-hint">{module.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="st-sync-foot">
          <span>
            <strong>{totalRecords.toLocaleString("en-IN")}</strong> records held locally across 4
            modules
          </span>
          <span className="st-last-inline">
            Last run:{" "}
            <strong>
              {lastSync ? `${lastSync.type} · ${lastSync.date} ${lastSync.time}` : "No sync yet"}
            </strong>
            {lastSync?.status && (
              <Badge tone={lastSync.status === "success" ? "ok" : "bad"}>
                {lastSync.status === "success" ? "Success" : "Failed"}
              </Badge>
            )}
          </span>
        </div>
      </section>
    </div>
  );
}
