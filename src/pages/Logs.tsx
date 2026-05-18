import { useEffect, useState } from "react";
import { sapService } from "../services/sapService";
import type {Log} from "../services/sapService";
import "../styles/Logs.css";

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let data = await sapService.getLogs();
      setLogs(data);
    } catch (error) {
      console.log("Error fetching Logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) =>
    log.sync_type?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="lg-page">
      <div className="lg-toolbar">
        <span className="lg-count">Total: {filteredLogs.length}</span>
        <div className="lg-search-wrap">
          <input
            type="text"
            placeholder="Search by sync type..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="lg-search"
          />
          <div className="lg-search-line" />
        </div>
      </div>

      {loading ? (
        <p className="lg-loading">Loading logs...</p>
      ) : filteredLogs.length > 0 ? (
        <div className="lg-list">
          {filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((log) => (
            <div className="lg-card" key={log.id}>
              <div className="lg-card-head">
                <span className="lg-type">{log.sync_type}</span>
                <span className={log.status.toLowerCase() === "success" ? "lg-badge-ok" : "lg-badge-fail"}>
                  {log.status}
                </span>
              </div>
              <div className="lg-card-stats">
                <div className="lg-stat">
                  <span className="lg-stat-num">{log.records_processed}</span>
                  <span className="lg-stat-lbl">Processed</span>
                </div>
                <div className="lg-stat">
                  <span className="lg-stat-num">{log.records_created}</span>
                  <span className="lg-stat-lbl">Created</span>
                </div>
                <div className="lg-stat">
                  <span className="lg-stat-num">{log.records_updated}</span>
                  <span className="lg-stat-lbl">Updated</span>
                </div>
              </div>
              <div className="lg-card-footer">Triggered by: {log.triggered_by}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="lg-empty">No logs found</p>
      )}

      {filteredLogs.length > itemsPerPage && (
        <div className="lg-pagination">
          <button className="lg-pg-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>← Prev</button>
          <span className="lg-pg-info">{currentPage} / {Math.ceil(filteredLogs.length / itemsPerPage)}</span>
          <button className="lg-pg-btn" disabled={currentPage === Math.ceil(filteredLogs.length / itemsPerPage)} onClick={() => setCurrentPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
