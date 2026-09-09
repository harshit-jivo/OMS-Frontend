import { useState, Fragment } from "react";
import { HiArrowPath } from "react-icons/hi2";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { einvoiceService } from "../../services/einvoiceService";
import type { GenerationLog } from "../../services/einvoiceService";
import { StatusBadge, ValidationList, JsonView, ErrorAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <CardTitle>Auto-Generation Logs</CardTitle>
        </div>
        <Button
          variant="ghost"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["einvoice", "logs"] })}
        >
          Refresh
        </Button>
      </CardHeader>
      <p className="text-[12.5px] leading-relaxed text-subtle">
        Every automatic IRN attempt (from invoice creation, the polling job, or a manual retry).
        Failures show the exact NIC error / validation cause.
      </p>

      {data ? (
        <div className="my-3 flex flex-wrap gap-2">
          <StatusBadge tone="ok">{data.totals.SUCCESS} success</StatusBadge>
          <StatusBadge tone="err">{data.totals.FAILED} failed</StatusBadge>
          <StatusBadge tone="muted">{data.totals.SKIPPED} skipped</StatusBadge>
        </div>
      ) : null}

      <TabList label="Filter logs by outcome">
        {FILTERS.map((f) => (
          <Tab key={f || "all"} selected={filter === f} onClick={() => setFilter(f)}>
            {f || "All"}
          </Tab>
        ))}
      </TabList>

      <ErrorAlert>{error}</ErrorAlert>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-subtle" role="status"><span className="size-4 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden="true" /><span>Loading logs…</span></div>
      ) : !data?.results.length ? (
        <p className="text-[12.5px] leading-relaxed text-subtle">No log entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <Table density="compact">
            <TableHeader>
              <TableRow className="bg-surface hover:bg-surface">
                <TableHead>When</TableHead><TableHead>DocEntry</TableHead><TableHead>Doc No</TableHead><TableHead>Trigger</TableHead>
                <TableHead>Attempt</TableHead><TableHead>Outcome</TableHead><TableHead>Cause / IRN</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.results.map((log) => (
                <Fragment key={log.id}>
                  <TableRow>
                    <TableCell className="whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell>{log.docentry}</TableCell>
                    <TableCell className="whitespace-nowrap">{log.doc_no || "—"}</TableCell>
                    <TableCell>{log.trigger}</TableCell>
                    <TableCell>{log.attempt_no}</TableCell>
                    <TableCell><StatusBadge tone={tone(log.outcome)}>{log.outcome}</StatusBadge></TableCell>
                    <TableCell>
                      {log.irn ? (
                        <span className="font-mono text-[12px]" title={log.irn}>{log.irn.slice(0, 18)}…</span>
                      ) : null}
                      {log.outcome === "SUCCESS" && log.error_message ? (
                        <div className={`text-[12.5px] font-semibold leading-relaxed text-danger${log.irn ? " mt-1" : ""}`}>
                          {log.error_message}
                        </div>
                      ) : null}
                      {log.outcome !== "SUCCESS" && (log.error_code || log.error_message) ? (
                        <div className={`text-[12.5px] leading-relaxed text-subtle${log.irn ? " mt-1" : ""}`}>
                          {log.error_code ? <code className="mr-1.5 font-mono text-[12px]">{log.error_code}</code> : null}
                          {log.error_message}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {log.validation_errors?.length ? (
                        <Button size="sm"
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                          Details
                        </Button>
                      ) : null}
                      {log.outcome !== "SUCCESS" && !log.irn ? (
                        <Button size="sm" variant="primary"
                          onClick={() => void retry(log)} disabled={retrying === log.id}>
                          <HiArrowPath aria-hidden="true" />
                          {retrying === log.id ? "…" : "Retry"}
                        </Button>
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
    </Card>
  );
}
