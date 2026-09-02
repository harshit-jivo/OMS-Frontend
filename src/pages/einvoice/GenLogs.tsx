import { useState, Fragment } from "react";
import { HiArrowPath } from "react-icons/hi2";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { einvoiceService } from "../../services/einvoiceService";
import type { GenerationLog } from "../../services/einvoiceService";
import { StatusBadge, ValidationList, JsonView, ErrorAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const FILTERS = ["", "FAILED", "SUCCESS", "SKIPPED"] as const;

export default function GenLogs() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);
  /* Only a failed RETRY lands here now. The load error is the query's own, so
     the two no longer overwrite each other — previously a retry failure was
     wiped by the reload that followed it, and a load failure was wiped by the
     next retry. */
  const [retryError, setRetryError] = useState("");

  /*
   * `filter` is the query key, not a dependency of a hand-rolled refetch. The
   * old `useCallback`/`useEffect` pair rebuilt the fetcher on every tab click
   * and threw the previous outcome's rows away, so moving All → Failed → All
   * downloaded the same list twice. Four tabs, four cache entries.
   */
  const {
    data,
    isPending: loading,
    error: loadError,
  } = useQuery({
    queryKey: ["einvoice", "logs", filter],
    queryFn: () => einvoiceService.getLogs({ outcome: filter || undefined, limit: 200 }),
  });

  const error = retryError || (loadError ? messageFrom(loadError, "Request failed") : "");

  const retry = async (log: GenerationLog) => {
    setRetrying(log.id);
    setRetryError("");
    try {
      await einvoiceService.retryGeneration(log.docentry, log.company_db || undefined);
      // Every tab, not just the one on screen: a retry that succeeds moves the
      // row from FAILED to SUCCESS, so the Failed tab and the All tab are both
      // wrong afterwards. `load()` only ever refreshed the visible one.
      await queryClient.invalidateQueries({ queryKey: ["einvoice", "logs"] });
    } catch (err) {
      setRetryError(messageFrom(err, "Request failed"));
    } finally {
      setRetrying(null);
    }
  };

  const tone = (o: string) => (o === "SUCCESS" ? "ok" : o === "FAILED" ? "err" : "muted");

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head nic-head--split">
        <div className="nic-head-title">
          <span className="ofs-card-mark" />
          <h2>Auto-Generation Logs</h2>
        </div>
        <button
          className="ofs-refresh"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["einvoice", "logs"] })}
        >
          Refresh
        </button>
      </div>
      <p className="nic-note">
        Every automatic IRN attempt (from invoice creation, the polling job, or a manual retry).
        Failures show the exact NIC error / validation cause.
      </p>

      {data ? (
        <div className="nic-totals">
          <StatusBadge tone="ok">{data.totals.SUCCESS} success</StatusBadge>
          <StatusBadge tone="err">{data.totals.FAILED} failed</StatusBadge>
          <StatusBadge tone="muted">{data.totals.SKIPPED} skipped</StatusBadge>
        </div>
      ) : null}

      <div className="nic-tabs nic-tabs--tight">
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
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead><TableHead>DocEntry</TableHead><TableHead>Doc No</TableHead><TableHead>Trigger</TableHead>
                <TableHead>Attempt</TableHead><TableHead>Outcome</TableHead><TableHead>Cause / IRN</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.results.map((log) => (
                <Fragment key={log.id}>
                  <TableRow>
                    <TableCell className="nic-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell>{log.docentry}</TableCell>
                    <TableCell>{log.doc_no || "—"}</TableCell>
                    <TableCell>{log.trigger}</TableCell>
                    <TableCell>{log.attempt_no}</TableCell>
                    <TableCell><StatusBadge tone={tone(log.outcome)}>{log.outcome}</StatusBadge></TableCell>
                    <TableCell>
                      {log.irn ? (
                        <span className="nic-mono" title={log.irn}>{log.irn.slice(0, 18)}…</span>
                      ) : null}
                      {log.outcome === "SUCCESS" && log.error_message ? (
                        <div className={`nic-note nic-note--err${log.irn ? " nic-note--stacked" : ""}`}>
                          {log.error_message}
                        </div>
                      ) : null}
                      {log.outcome !== "SUCCESS" && (log.error_code || log.error_message) ? (
                        <div className={`nic-note${log.irn ? " nic-note--stacked" : ""}`}>
                          {log.error_code ? <code className="nic-code">{log.error_code}</code> : null}
                          {log.error_message}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="nic-nowrap">
                      {log.validation_errors?.length ? (
                        <button className="ofs-secondary nic-btn-xs"
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                          Details
                        </button>
                      ) : null}
                      {log.outcome !== "SUCCESS" && !log.irn ? (
                        <button className="ofs-primary nic-btn-xs nic-btn-xs--next"
                          onClick={() => void retry(log)} disabled={retrying === log.id}>
                          <HiArrowPath className="nic-icon-inline" />
                          {retrying === log.id ? "…" : "Retry"}
                        </button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                  {expanded === log.id && log.validation_errors?.length ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <ValidationList errors={log.validation_errors} />
                        <JsonView data={log} title="Full log entry" />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
