import { useEffect, useMemo, useState } from "react";
import {
  HiArrowPath,
  HiCheckCircle,
  HiClipboardDocumentList,
  HiMagnifyingGlass,
  HiXCircle,
} from "react-icons/hi2";
import { sapService } from "../services/sapService";
import type { Log } from "../services/sapService";
import "../styles/SapData.css";

const ITEMS_PER_PAGE = 15;

const dash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

const isSuccess = (log: Log) => String(log.status || "").toLowerCase() === "success";

const num = (value: unknown) => Number(value || 0).toLocaleString("en-IN");

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await sapService.getLogs();
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error fetching Logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter((log) =>
      [log.sync_type, log.status, log.triggered_by].some((field) =>
        String(field || "").toLowerCase().includes(needle),
      ),
    );
  }, [logs, search]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const visible = filteredLogs.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const successCount = logs.filter(isSuccess).length;
  const processed = logs.reduce((sum, log) => sum + Number(log.records_processed || 0), 0);
  const kpis = [
    { label: "Sync Runs", value: logs.length, icon: HiClipboardDocumentList, tone: "" },
    { label: "Successful", value: successCount, icon: HiCheckCircle, tone: "sd-kpi-ok" },
    { label: "Failed", value: logs.length - successCount, icon: HiXCircle, tone: "sd-kpi-bad" },
    { label: "Records Processed", value: processed, icon: HiArrowPath, tone: "" },
  ];

  return (
    <div className="sd-page">
      <div className="sd-kpis">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article className={`sd-kpi ${kpi.tone}`} key={kpi.label}>
              <span className="sd-kpi-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="sd-kpi-body">
                <span className="sd-kpi-value">{kpi.value.toLocaleString("en-IN")}</span>
                <span className="sd-kpi-label">{kpi.label}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="sd-toolbar">
        <div className="sd-search-wrap">
          <HiMagnifyingGlass className="sd-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="sd-search"
            placeholder="Search by sync type, status or who triggered it…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <button type="button" className="sd-btn" onClick={fetchLogs} disabled={loading}>
          <HiArrowPath className={loading ? "sd-spin" : ""} aria-hidden="true" />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="sd-table-card">
        <div className="sd-table-head">
          <h2 className="sd-table-title">Sync Log</h2>
          <span className="sd-table-note">
            {filteredLogs.length.toLocaleString("en-IN")} row{filteredLogs.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading && logs.length === 0 ? (
          <p className="sd-loading">Loading logs…</p>
        ) : filteredLogs.length === 0 ? (
          <p className="sd-empty">No logs found</p>
        ) : (
          <>
            <div className="sd-table-scroll">
              <table className="sd-table">
                <thead>
                  <tr>
                    <th>Sync Type</th>
                    <th>Status</th>
                    <th className="sd-num">Processed</th>
                    <th className="sd-num">Created</th>
                    <th className="sd-num">Updated</th>
                    <th>Triggered By</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <span className="sd-badge sd-badge-accent">{dash(log.sync_type)}</span>
                      </td>
                      <td>
                        <span className={`sd-badge ${isSuccess(log) ? "sd-badge-ok" : "sd-badge-fail"}`}>
                          {dash(log.status)}
                        </span>
                      </td>
                      <td className="sd-num">{num(log.records_processed)}</td>
                      <td className="sd-num">{num(log.records_created)}</td>
                      <td className="sd-num">{num(log.records_updated)}</td>
                      <td className="sd-dim">{dash(log.triggered_by)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredLogs.length > ITEMS_PER_PAGE && (
              <div className="sd-pagination">
                <button
                  type="button"
                  className="sd-pg-btn"
                  disabled={page === 1}
                  onClick={() => setCurrentPage(page - 1)}
                >
                  ← Prev
                </button>
                <span className="sd-pg-info">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="sd-pg-btn"
                  disabled={page === totalPages}
                  onClick={() => setCurrentPage(page + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
