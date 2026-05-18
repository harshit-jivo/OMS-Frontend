import { useEffect, useState } from "react";
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

  const syncActions = [
    { key: "all", label: "Sync All", hint: "Refresh everything" },
    { key: "products", label: "Products", hint: "Items and rates" },
    { key: "parties", label: "Parties", hint: "Customers and groups" },
    { key: "addresses", label: "Addresses", hint: "Billing and shipping" },
    { key: "branches", label: "Branches", hint: "Branch mapping" },
  ] as const;

  const syncMetrics = [
    { label: "Products", value: products.length },
    { label: "Parties", value: parties.length },
    { label: "Addresses", value: addresses.length },
    { label: "Branches", value: branches.length },
  ];

  return (
    <div className="st-page app-page">
      <section className="st-hero">
        <div className="st-hero-copy">
          <span className="app-chip st-chip">SAP Sync</span>
          <h1 className="st-title app-page-title">Sync Center</h1>
          <p className="st-subtitle app-page-subtitle">
            Manage SAP data refreshes with a cleaner control panel .
          </p>
          <div className="st-hero-strip">
            <div className="st-hero-strip-item">
              <span className="st-hero-strip-label">Sources</span>
              <strong className="st-hero-strip-value">4 Modules</strong>
            </div>
            <div className="st-hero-strip-item">
              <span className="st-hero-strip-label">Latest Run</span>
              <strong className="st-hero-strip-value">{lastSync?.type || "No sync yet"}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="st-layout">
        <section className="st-panel st-sync-panel">
          <div className="st-panel-head">
            <div>
              <div className="st-section-label">Manual Sync</div>
              <h2 className="st-panel-title">Choose an action</h2>
            </div>
            <div className="st-panel-note">Run a complete refresh or update one module at a time</div>
          </div>
          <div className="st-sync-grid">
            {syncActions.map((action) => (
              <button
                key={action.key}
                className={`st-sync-btn ${loading === action.key ? "st-sync-active" : ""}`}
                onClick={() => syncData(action.key)}
                disabled={loading !== null}
              >
                <span className="st-sync-btn-title">
                  {loading === action.key ? "Syncing..." : action.label}
                </span>
                <span className="st-sync-btn-hint">{action.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="st-side-stack">
          <section className="st-panel st-data-panel">
            <div className="st-panel-head">
              <div>
                <div className="st-section-label">Current Data</div>
                <h2 className="st-panel-title">Synced records</h2>
              </div>
            </div>
            <div className="st-stats-grid">
              {syncMetrics.map((metric) => (
                <div className="st-stat-card" key={metric.label}>
                  <div className="st-stat-number">{metric.value}</div>
                  <div className="st-stat-label">{metric.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="st-panel st-last-sync">
          <div className="st-last-title">Last Sync</div>
          <div className="st-last-row">
            <span className="st-last-label">Type</span>
            <span className="st-last-value">{lastSync?.type || "—"}</span>
          </div>
          <div className="st-last-row">
            <span className="st-last-label">Date</span>
            <span className="st-last-value">{lastSync?.date || "—"}</span>
          </div>
          <div className="st-last-row">
            <span className="st-last-label">Time</span>
            <span className="st-last-value">{lastSync?.time || "—"}</span>
          </div>
          <div className="st-last-row">
            <span className="st-last-label">Status</span>
            {lastSync?.status ? (
              <span className={`st-status-badge st-status-${lastSync.status}`}>
                {lastSync.status === "success" ? "Success" : "Failed"}
              </span>
            ) : (
              <span className="st-last-value">—</span>
            )}
          </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
