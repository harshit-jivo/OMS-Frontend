import { useEffect, useState, useCallback, Fragment } from "react";
import { HiArrowPath } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import type { GenerationLog, GenerationLogsResponse } from "../../services/einvoiceService";
import { StatusBadge, ValidationList, JsonView, ErrorAlert, apiErrorMessage } from "../../components/NicUI";

const FILTERS = ["", "FAILED", "SUCCESS", "SKIPPED"] as const;

export default function GenLogs() {
  const [data, setData] = useState<GenerationLogsResponse | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await einvoiceService.getLogs({ outcome: filter || undefined, limit: 200 }));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const retry = async (log: GenerationLog) => {
    setRetrying(log.id);
    try {
      await einvoiceService.retryGeneration(log.docentry, log.company_db || undefined);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setRetrying(null);
    }
  };

  const tone = (o: string) => (o === "SUCCESS" ? "ok" : o === "FAILED" ? "err" : "muted");

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="ofs-card-mark" />
          <h2>Auto-Generation Logs</h2>
        </div>
        <button className="ofs-refresh" onClick={() => void load()}>Refresh</button>
      </div>
      <p className="nic-note">
        Every automatic IRN attempt (from invoice creation, the polling job, or a manual retry).
        Failures show the exact NIC error / validation cause.
      </p>

      {data ? (
        <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
          <StatusBadge tone="ok">{data.totals.SUCCESS} success</StatusBadge>
          <StatusBadge tone="err">{data.totals.FAILED} failed</StatusBadge>
          <StatusBadge tone="muted">{data.totals.SKIPPED} skipped</StatusBadge>
        </div>
      ) : null}

      <div className="nic-tabs" style={{ margin: "0 0 14px" }}>
        {FILTERS.map((f) => (
          <button key={f || "all"} className={`nic-tab ${filter === f ? "nic-tab-active" : ""}`}
            onClick={() => setFilter(f)}>
            {f || "All"}
          </button>
        ))}
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      {loading ? (
        <div className="ofs-loading"><span className="ofs-spinner" /><span>Loading logs…</span></div>
      ) : !data?.results.length ? (
        <p className="nic-note">No log entries yet.</p>
      ) : (
        <div className="nic-table-wrap">
          <table className="nic-table">
            <thead>
              <tr>
                <th>When</th><th>DocEntry</th><th>Doc No</th><th>Trigger</th>
                <th>Attempt</th><th>Outcome</th><th>Cause / IRN</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((log) => (
                <Fragment key={log.id}>
                  <tr>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(log.created_at).toLocaleString()}</td>
                    <td>{log.docentry}</td>
                    <td>{log.doc_no || "—"}</td>
                    <td>{log.trigger}</td>
                    <td>{log.attempt_no}</td>
                    <td><StatusBadge tone={tone(log.outcome)}>{log.outcome}</StatusBadge></td>
                    <td>
                      {log.irn ? (
                        <span className="nic-mono" title={log.irn}>{log.irn.slice(0, 18)}…</span>
                      ) : null}
                      {log.outcome === "SUCCESS" && log.error_message ? (
                        <div className="nic-note" style={{ marginTop: log.irn ? 4 : 0, color: "#dc2626", fontWeight: 600 }}>
                          {log.error_message}
                        </div>
                      ) : null}
                      {log.outcome !== "SUCCESS" && (log.error_code || log.error_message) ? (
                        <div className="nic-note" style={{ marginTop: log.irn ? 4 : 0 }}>
                          {log.error_code ? <code style={{ marginRight: 6 }}>{log.error_code}</code> : null}
                          {log.error_message}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {log.validation_errors?.length ? (
                        <button className="ofs-secondary" style={{ minHeight: 30, padding: "0 10px", fontSize: 11 }}
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                          Details
                        </button>
                      ) : null}
                      {log.outcome !== "SUCCESS" && !log.irn ? (
                        <button className="ofs-primary" style={{ minHeight: 30, padding: "0 10px", fontSize: 11, marginLeft: 6 }}
                          onClick={() => void retry(log)} disabled={retrying === log.id}>
                          <HiArrowPath style={{ verticalAlign: "-2px", marginRight: 4 }} />
                          {retrying === log.id ? "…" : "Retry"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {expanded === log.id && log.validation_errors?.length ? (
                    <tr>
                      <td colSpan={8}>
                        <ValidationList errors={log.validation_errors} />
                        <JsonView data={log} title="Full log entry" />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
