import { useMemo, useState } from "react";
import {
  HiArrowPath,
  HiCheckCircle,
  HiClipboardDocumentList,
  HiMagnifyingGlass,
  HiXCircle,
} from "react-icons/hi2";
import type { Log } from "../services/sapService";

import { useSapLogs } from "../lib/sapQueries";
import "../styles/SapData.css";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 15;

const dash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

const isSuccess = (log: Log) => String(log.status || "").toLowerCase() === "success";

const num = (value: unknown) => Number(value || 0).toLocaleString("en-IN");

export default function Logs() {
  // `isLoading` is the FIRST load; `isFetching` also covers a Refresh. They
  // were one `loading` flag, so pressing Refresh replaced the table with the
  // word "Loading…" instead of leaving the data up while it reloaded.
  const { items: logs, isLoading: loading, isFetching, refetch: fetchLogs } = useSapLogs();
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredLogs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter((log) =>
      [log.sync_type, log.status, log.triggered_by].some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(needle),
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
            placeholder="Search by sync type, status or who triggered it…" aria-label="Search by sync type, status or who triggered it"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <button type="button" className="sd-btn" onClick={fetchLogs} disabled={isFetching}>
          <HiArrowPath className={loading ? "sd-spin" : ""} aria-hidden="true" />
          {isFetching ? "Loading…" : "Refresh"}
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
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sync Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="sd-num">Processed</TableHead>
                    <TableHead className="sd-num">Created</TableHead>
                    <TableHead className="sd-num">Updated</TableHead>
                    <TableHead>Triggered By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge tone="info">{dash(log.sync_type)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge tone={isSuccess(log) ? "ok" : "bad"}>{dash(log.status)}</Badge>
                      </TableCell>
                      <TableCell className="sd-num">{num(log.records_processed)}</TableCell>
                      <TableCell className="sd-num">{num(log.records_created)}</TableCell>
                      <TableCell className="sd-num">{num(log.records_updated)}</TableCell>
                      <TableCell className="sd-dim">{dash(log.triggered_by)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredLogs.length > ITEMS_PER_PAGE && (
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
