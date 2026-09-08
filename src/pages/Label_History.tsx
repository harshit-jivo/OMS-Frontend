import { useEffect, useMemo, useState } from "react";
import {
  HiOutlineArrowLeft,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineFunnel,
} from "react-icons/hi2";

import {
  legalService,
  ruleErrorMessage,
  type LabelCheckSummary,
} from "../services/legalService";
import { API_ORIGIN } from "../services/apiPaths";
import FindingsChecklist from "../components/legal/FindingsChecklist";
import LabelImage from "../components/legal/LabelImage";
import MarkdownReport from "../components/legal/MarkdownReport";
import {
  buildReportMarkdown,
  summarise,
  type Finding,
  type LabelReport,
} from "../components/legal/labelReport";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  FilterBar,
  FilterCount,
  FilterSelect,
  FilterSpacer,
} from "@/components/ui/filter-bar";
import {
  Card,
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Stat,
  StatRow,
} from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tab, TabList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Label check history — every check that has been run, reopenable.
 *
 * The checks were always stored; nothing could open them. That is a real gap
 * rather than a convenience one: a compliance report is a record of what was
 * reviewed and when, and a record that can be seen only once is not a record.
 *
 * Reopening shows the report AS IT WAS — the same findings, the same
 * highlight boxes, because the regions were stored with the report. The
 * locator has changed twice since the first checks were run, and a record
 * that silently re-derived itself against today's code would be a different
 * document with the same date on it.
 *
 * The detail view reuses `LabelImage`, `FindingsChecklist` and
 * `MarkdownReport` unchanged. A past report and a fresh one are the same
 * thing; rendering them with different code would let them drift.
 */

const mediaUrl = (path: string): string =>
  !path
    ? ""
    : /^https?:\/\//i.test(path)
      ? path
      : `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

type Detail = LabelReport & {
  id: number;
  file_name?: string;
  uploaded_at?: string;
  checked_by_name?: string;
  item_name?: string;
};

export default function LabelHistory() {
  const [rows, setRows] = useState<LabelCheckSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [failedOnly, setFailedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"report" | "text">("report");
  const [showPasses, setShowPasses] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await legalService.listChecks({ page, failedOnly });
        if (cancelled) return;
        setRows(data.results);
        setTotalPages(data.pagination.total_pages);
        setTotal(data.pagination.total);
      } catch (e) {
        if (!cancelled) {
          setError(
            ruleErrorMessage(
              e,
              "Could not load the check history. If the server has not run " +
                "manage.py migrate legal yet, this is expected.",
            ),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, failedOnly]);

  async function open(id: number) {
    setOpenId(id);
    setDetailLoading(true);
    setActiveId(null);
    setError("");
    try {
      const data = (await legalService.getCheck(id)) as Detail;
      setDetail(data);
    } catch (e) {
      setError(ruleErrorMessage(e, "Could not open that check."));
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const findings = useMemo<Finding[]>(() => detail?.findings ?? [], [detail]);
  const summary = useMemo(
    () => detail?.summary ?? summarise(findings),
    [detail, findings],
  );
  const markdown = useMemo(
    () => (detail ? buildReportMarkdown(detail, detail.file_name ?? "label") : ""),
    [detail],
  );
  const locatedPasses = findings.filter(
    (finding) => finding.status === "PASS" && finding.regions?.length,
  ).length;

  /* ── Detail ───────────────────────────────────────────────────────────── */

  if (openId !== null) {
    return (
      /*
       * The detail view was its own page shell — `lc-page app-page`, a
       * hand-built topbar and a ghost button for the way back. It is the
       * app's page now, so a reader arriving here from the table gets the
       * same breadcrumbs, the same header and the same back affordance they
       * get everywhere else, and the viewer beside it is identical to the one
       * on Label Checker rather than a near-copy.
       */
      <Page>
        <Breadcrumbs
          items={[
            { label: "Legal" },
            {
              label: "Check History",
              onClick: () => {
                setOpenId(null);
                setDetail(null);
              },
            },
            { label: detail?.file_name ?? "Check" },
          ]}
        />

        <PageHeader
          title={detail?.file_name ?? "Check"}
          description={
            [
              detail?.uploaded_at ? formatWhen(detail.uploaded_at) : null,
              detail?.checked_by_name,
              detail?.item_name,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          badges={
            detail ? (
              <Badge tone={summary.compliant ? "ok" : "bad"}>
                {summary.compliant ? "Compliant" : `${summary.failed} failed`}
              </Badge>
            ) : null
          }
          actions={
            <Button
              onClick={() => {
                setOpenId(null);
                setDetail(null);
              }}
            >
              <HiOutlineArrowLeft aria-hidden="true" /> Back to history
            </Button>
          }
        />

        {detailLoading ? (
          <div
            className="flex flex-col items-center gap-2 px-5 py-14 text-center"
            role="status"
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className="size-[30px] rounded-full border-[3px] border-line-strong border-t-brand motion-safe:animate-spin"
            />
            <p className="m-0 text-[14.5px] text-body">Opening the report…</p>
          </div>
        ) : detail ? (
          /* The same two panes as Label Checker, and for the same reasons —
             see the long note there on why they are not `Card`s. */
          <div className="grid grid-cols-1 items-start gap-2.5 min-[900px]:grid-cols-[minmax(280px,0.85fr)_minmax(360px,1.15fr)] print:grid-cols-1">
            <section
              aria-label="Checked label"
              className={cn(
                "rounded-xl border-[0.5px] border-line bg-card p-4",
                "max-h-[420px] overflow-auto",
                "min-[900px]:sticky min-[900px]:top-3 min-[900px]:max-h-[calc(100svh-96px)]",
                "print:static print:max-h-none print:overflow-visible print:border-0 print:p-0",
              )}
            >
              {detail.image_url ? (
                <>
                  <div className="mb-2.5 flex flex-wrap items-center gap-3 text-[13px] text-body">
                    <span className="inline-flex items-center gap-1.5">
                      <i
                        aria-hidden="true"
                        className="size-[11px] rounded-[3px] border border-[#dc2626] bg-[rgba(220,38,38,0.14)]"
                      />{" "}
                      {summary.failed} failed
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <i
                        aria-hidden="true"
                        className="size-[11px] rounded-[3px] border border-[rgba(22,163,74,0.55)] bg-[rgba(22,163,74,0.07)]"
                      />{" "}
                      {locatedPasses} passed
                    </span>
                    <label className="ml-auto inline-flex cursor-pointer select-none items-center gap-1.5 print:hidden">
                      <input
                        type="checkbox"
                        checked={showPasses}
                        onChange={(event) => setShowPasses(event.target.checked)}
                        className="m-0 size-[13px] accent-brand"
                      />
                      Show passed
                    </label>
                  </div>
                  <LabelImage
                    src={mediaUrl(detail.image_url)}
                    alt={`Label: ${detail.file_name ?? "check"}`}
                    findings={findings}
                    activeId={activeId}
                    showPasses={showPasses}
                    onSelect={(ruleId) => {
                      setActiveId(ruleId);
                      setView("report");
                    }}
                  />
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-[9px] bg-surface px-4 py-10 text-center text-[14px] leading-relaxed text-body">
                  <HiOutlineClock aria-hidden="true" className="text-[18px]" />
                  <p className="m-0">
                    This check predates stored previews, so the artwork is not
                    available. The findings below are unaffected.
                  </p>
                </div>
              )}
            </section>

            <section
              aria-label="Compliance report"
              className="rounded-xl border-[0.5px] border-line bg-card p-4 print:border-0 print:p-0"
            >
              <div
                className={cn(
                  "mb-2.5 flex items-start gap-2.5 rounded-[10px] border-[0.5px] p-3 text-[14.5px]",
                  summary.compliant
                    ? "border-ok-soft bg-ok-soft text-ok"
                    : "border-danger-line bg-danger-soft text-[#b91c1c]",
                  "[&>svg]:mt-px [&>svg]:size-[18px] [&>svg]:flex-none",
                )}
              >
                {summary.compliant ? (
                  <HiOutlineCheckCircle aria-hidden="true" />
                ) : (
                  <HiOutlineExclamationTriangle aria-hidden="true" />
                )}
                <div className="flex flex-col gap-0.5">
                  <strong className="font-medium">
                    {summary.compliant
                      ? "Compliant — every rule passed"
                      : `${summary.failed} of ${summary.total} rules failed`}
                  </strong>
                  <span className="text-[13px] text-body">
                    {summary.passed} passed · {summary.failed} failed
                    {detail.ocr_available === false
                      ? " · OCR unavailable, AI review only"
                      : null}
                  </span>
                </div>
              </div>

              {/* Was a hand-rolled `role="tablist"` with two bare buttons —
                  no arrow-key handling and no `tabpanel` relationship.
                  `TabList` owns both. */}
              <TabList className="mb-3 print:hidden" label="Report view">
                <Tab selected={view === "report"} onClick={() => setView("report")}>
                  Report
                </Tab>
                <Tab selected={view === "text"} onClick={() => setView("text")}>
                  Plain text
                </Tab>
              </TabList>

              {view === "report" ? (
                <FindingsChecklist
                  findings={findings}
                  activeId={activeId}
                  onSelect={(ruleId) =>
                    setActiveId((prev) => (prev === ruleId ? null : ruleId))
                  }
                />
              ) : (
                <MarkdownReport source={markdown} />
              )}
            </section>
          </div>
        ) : null}
      </Page>
    );
  }

  /* ── List ─────────────────────────────────────────────────────────────── */

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Legal" }, { label: "Check History" }]} />

      <PageHeader
        title="Label Check History"
        description="Every label that has been checked, newest first. Opening one shows the report exactly as it was reported at the time."
      />

      <StatRow>
        <Stat
          icon={HiOutlineClock}
          tone="brand"
          label="Checks recorded"
          value={total}
          hint={failedOnly ? "with failures" : "all time"}
          loading={loading}
        />
      </StatRow>

      <FilterBar>
        <FilterSelect
          label="Result"
          icon={HiOutlineFunnel}
          // The only filter on this bar. Without a cap it takes the whole
          // width, which reads as a form rather than a toolbar.
          fieldClassName="max-w-[280px] flex-none"
          value={failedOnly ? "failed" : "all"}
          onChange={(event) => {
            setPage(1);
            setFailedOnly(event.target.value === "failed");
          }}
        >
          <option value="all">All checks</option>
          <option value="failed">Only checks with failures</option>
        </FilterSelect>
        <FilterSpacer />
        <FilterCount>
          {total} check{total === 1 ? "" : "s"}
        </FilterCount>
      </FilterBar>

      {error ? (
        <Notice tone="bad" title="Something went wrong">
          {error}
        </Notice>
      ) : null}

      {loading ? (
        <TableSkeleton columns={5} label="Loading history" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineClock}
            title={failedOnly ? "No failed checks" : "Nothing checked yet"}
            hint={
              failedOnly
                ? "Every check in this period passed. Switch the filter to see them all."
                : "Run a check from the Label Checker and it will be recorded here."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead>Label</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Checked by</TableHead>
                  <TableHead>Checked at</TableHead>
                  <TableHead>Rules</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const failed = row.summary?.failed ?? 0;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        {/* The file name opens the report — it is what a
                            reviewer recognises the record by, so it is the
                            link rather than a separate View action. */}
                        <Button
                          variant="link"
                          size="inline"
                          className="font-semibold text-brand hover:text-brand"
                          onClick={() => void open(row.id)}
                        >
                          {row.file_name}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Badge tone={failed ? "bad" : "ok"}>
                          {failed ? `${failed} failed` : "Compliant"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-ink">{row.item_name || "—"}</TableCell>
                      <TableCell>{row.checked_by_name || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatWhen(row.uploaded_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.summary?.total ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {totalPages > 1 ? (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      ) : null}
    </Page>
  );
}
