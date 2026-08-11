import { useEffect, useState } from "react";
import {
  HiArrowPath,
  HiBuildingOffice2,
  HiCube,
  HiMapPin,
  HiUsers,
} from "react-icons/hi2";
import { sapService } from "../services/sapService";
import "../styles/Status.css";

interface LastSync {
  type: string;
  date: string;
  time: string;
  status: "success" | "failed";
}

export default function Status() {
  const [branches, setBranches] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<LastSync | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchAddresses();
    fetchParties();
    fetchBranches();

    const saved = localStorage.getItem("lastSync");
    if (saved) {
      setLastSync(JSON.parse(saved));
    }
  }, []);

  const fetchProducts = async () => {
    try {
      const data = await sapService.getProducts();
      setProducts(data);
    } catch (error) {
      console.log("Error fetching products:", error);
    }
  };

  const fetchAddresses = async () => {
    try {
      const data = await sapService.getAddresses();
      setAddresses(data);
    } catch (error) {
      console.log("Error fetching addresses:", error);
    }
  };

  const fetchParties = async () => {
    try {
      const data = await sapService.getParties();
      setParties(data);
    } catch (error) {
      console.log("Error fetching parties:", error);
    }
  };

  const fetchBranches = async () => {
    try {
      const data = await sapService.getBranches();
      setBranches(data);
    } catch (error) {
      console.log("Error fetching branches:", error);
    }
  };

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
        fetchProducts();
        fetchAddresses();
        fetchParties();
        fetchBranches();
        alert(data?.message || "Sync completed successfully");
      } else {
        alert("Sync failed: " + (data?.message || "Unknown error"));
      }
    } catch (err: any) {
      saveLastSync(syncType, "failed");
      alert(
        "Sync failed: " +
          (err?.response?.data?.message || err?.message || "Unknown error")
      );
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  // The KPI row and the sync buttons are keyed off the same list, so a count and
  // the button that refreshes it always describe the same module.
  const modules = [
    { key: "products", label: "Products", hint: "Items and rates", icon: HiCube, count: products.length },
    { key: "parties", label: "Parties", hint: "Customers and groups", icon: HiUsers, count: parties.length },
    { key: "addresses", label: "Addresses", hint: "Billing and shipping", icon: HiMapPin, count: addresses.length },
    { key: "branches", label: "Branches", hint: "Branch mapping", icon: HiBuildingOffice2, count: branches.length },
  ] as const;

  const totalRecords = modules.reduce((sum, module) => sum + module.count, 0);
  const busy = loading !== null;

  return (
    <div className="st-page app-page">
      {/* ── KPI cards ── */}
      <div className="st-kpi-row">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <article className={`st-kpi ${loading === module.key ? "st-kpi-busy" : ""}`} key={module.key}>
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
            <strong>{totalRecords.toLocaleString("en-IN")}</strong> records held locally across 4 modules
          </span>
          <span className="st-last-inline">
            Last run:{" "}
            <strong>{lastSync ? `${lastSync.type} · ${lastSync.date} ${lastSync.time}` : "No sync yet"}</strong>
            {lastSync?.status && (
              <span className={`st-status-badge st-status-${lastSync.status}`}>
                {lastSync.status === "success" ? "Success" : "Failed"}
              </span>
            )}
          </span>
        </div>
      </section>
    </div>
  );
}
