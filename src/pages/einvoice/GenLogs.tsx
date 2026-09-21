import { useState, Fragment, useEffect } from "react";
import { HiArrowPath } from "react-icons/hi2";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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
const PAGE_SIZE = 50;

export default function GenLogs() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  /* "" = every company. The list of companies comes from the response, so a
     company with no rows is still offered — the tab showing 0 is the useful
     signal, and its absence is what made this page look OIL-only. */
  const [company, setCompany] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);
  /* Only a failed RETRY lands here now. The load error is the query's own, so
     the two no longer overwrite each other — previously a retry failure was
     wiped by the reload that followed it, and a load failure was wiped by the
     next retry. */
  const [retryError, setRetryError] = useState("");

  // Changing either filter invalidates the current page number: page 4 of the
  // OIL list is not page 4 of the Beverage one, and landing past the end shows
  // an empty table that reads as "no logs".
  useEffect(() => setPage(0), [filter, company]);

  /*
   * `filter`, `company` and `page` are all query keys, not dependencies of a
   * hand-rolled refetch — each combination is its own cache entry, so going
   * back to a tab you have already seen is instant. `keepPreviousData` holds
   * the current rows on screen while the next page loads, so paging does not
   * flash an empty table.
   */
  const {
    data,
    isPending: loading,
    isFetching,
    error: loadError,
  } = useQuery({
    queryKey: ["einvoice", "logs", filter, company, page],
    queryFn: () =>
      einvoiceService.getLogs({
        outcome: filter || undefined,
        company_db: company || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
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

  const total = data?.total ?? 0;
  const firstRow = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastRow = page * PAGE_SIZE + (data?.count ?? 0);
  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <CardTitle>IRN Generation Logs</CardTitle>
        </div>
        <Button
          variant="ghost"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["einvoice", "logs"] })}
        >
          Refresh
        </Button>
      </CardHeader>
      <p className="text-[12.5px] leading-relaxed text-subtle">
        Every IRN attempt — raised by hand, on invoice creation, by the polling job, or by a
        retry. Failures show the exact NIC error / validation cause.
      </p>

      {data?.companies?.length ? (
        <TabList label="Filter logs by company">
          <Tab selected={company === ""} onClick={() => setCompany("")}>
            All companies
          </Tab>
          {data.companies.map((c) => (
            <Tab
              key={c.company_db}
              selected={company === c.company_db}
              onClick={() => setCompany(c.company_db)}
            >
              {c.label} ({c.rows})
            </Tab>
          ))}
        </TabList>
      ) : null}

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
        <p className="text-[12.5px] leading-relaxed text-subtle">
          No log entries{company ? " for this company" : ""}
          {filter ? ` with outcome ${filter}` : ""}.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-line">
            <Table density="compact">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead>When</TableHead><TableHead>Company</TableHead><TableHead>DocEntry</TableHead><TableHead>Doc No</TableHead><TableHead>Trigger</TableHead>
                  <TableHead>Attempt</TableHead><TableHead>Outcome</TableHead><TableHead>Cause / IRN</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((log) => (
                  <Fragment key={log.id}>
                    <TableRow>
                      <TableCell className="whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {data.companies.find((c) => c.company_db === log.company_db)?.label
                          || log.company_db
                          || "—"}
                      </TableCell>
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
                        <TableCell colSpan={9}>
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

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[12.5px] text-subtle" aria-live="polite">
              {firstRow}–{lastRow} of {total}
              {isFetching ? " · updating…" : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost"
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
                disabled={page === 0 || isFetching}>
                Previous
              </Button>
              <span className="text-[12.5px] text-subtle">
                Page {page + 1} of {lastPage + 1}
              </span>
              <Button size="sm" variant="ghost"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.has_more || isFetching}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
