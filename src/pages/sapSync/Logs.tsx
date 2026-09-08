/**
 * SAP Sync · Logs — every sync run, newest first.
 */
import { useMemo, useState } from "react";
import {
  HiArrowPath,
  HiCheckCircle,
  HiClipboardDocumentList,
  HiXCircle,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterActions, FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { Card, CardHeader, CardTitle, EmptyState, Stat, StatRow } from "@/components/ui/page";
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
import type { Log } from "../../services/sapService";
import { useSapLogs } from "../../lib/sapQueries";
import { dash, num } from "./format";

const ITEMS_PER_PAGE = 15;

const isSuccess = (log: Log) => String(log.status || "").toLowerCase() === "success";

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
  const failedCount = logs.length - successCount;
  const processed = logs.reduce((sum, log) => sum + Number(log.records_processed || 0), 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <StatRow>
        <Stat label="Sync runs" value={num(logs.length)} icon={HiClipboardDocumentList} />
        <Stat label="Successful" value={num(successCount)} icon={HiCheckCircle} tone="ok" />
        <Stat
          label="Failed"
          value={num(failedCount)}
          icon={HiXCircle}
          tone={failedCount > 0 ? "bad" : "neutral"}
        />
        <Stat label="Records processed" value={num(processed)} icon={HiArrowPath} />
      </StatRow>

      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setCurrentPage(1);
          }}
          placeholder="Sync type, status or who triggered it…"
          fieldClassName="min-w-[280px]"
        />
        <FilterCount>
          {num(filteredLogs.length)} run{filteredLogs.length === 1 ? "" : "s"}
          {search ? " of " + num(logs.length) : ""}
        </FilterCount>
        <FilterActions>
          <Button onClick={() => void fetchLogs()} disabled={isFetching}>
            <HiArrowPath className={isFetching ? "animate-spin" : ""} aria-hidden="true" />
            {isFetching ? "Loading…" : "Refresh"}
          </Button>
        </FilterActions>
      </FilterBar>

      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 px-4 py-3">
          <CardTitle>Sync log</CardTitle>
        </CardHeader>

        {loading && logs.length === 0 ? (
          <TableSkeleton rows={8} columns={6} label="Loading sync history" />
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            icon={HiClipboardDocumentList}
            title={search ? "No runs match this search" : "Nothing has been synced yet"}
            hint={
              search
                ? "Try a status on its own — success or failed."
                : "Every sync started from the Status tab is recorded here."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sync Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Processed</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                    <TableHead className="text-right">Updated</TableHead>
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
                      <TableCell className="text-right tabular-nums">
                        {num(log.records_processed)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(log.records_created)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(log.records_updated)}
                      </TableCell>
                      <TableCell className="text-subtle">{dash(log.triggered_by)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredLogs.length > ITEMS_PER_PAGE && (
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                className="border-t border-line px-4 py-3"
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
