/**
 * SAP Sync · Branches — the BPL mapping as it landed locally.
 */
import { useMemo, useState } from "react";
import {
  HiArrowPath,
  HiBuildingOffice2,
  HiCheckCircle,
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
import { useSapBranches } from "../../lib/sapQueries";
import { dash, formatStamp, num } from "./format";

const ITEMS_PER_PAGE = 15;

export default function Branches() {
  // `isLoading` is the FIRST load; `isFetching` also covers a Refresh. They
  // were one `loading` flag, so pressing Refresh replaced the table with the
  // word "Loading…" instead of leaving the data up while it reloaded.
  const {
    items: branches,
    isLoading: loading,
    isFetching,
    refetch: fetchBranches,
  } = useSapBranches();
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredBranches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return branches;
    return branches.filter((branch) =>
      [branch.bpl_id, branch.bpl_name].some((field) =>
        String(field ?? "")
          .toLowerCase()
          .includes(needle),
      ),
    );
  }, [branches, search]);

  const totalPages = Math.max(1, Math.ceil(filteredBranches.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const visible = filteredBranches.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const activeCount = branches.filter((branch) => branch.is_active).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <StatRow>
        <Stat label="Branches" value={num(branches.length)} icon={HiBuildingOffice2} />
        <Stat label="Active" value={num(activeCount)} icon={HiCheckCircle} tone="ok" />
        <Stat
          label="Inactive"
          value={num(branches.length - activeCount)}
          icon={HiXCircle}
          tone={branches.length - activeCount > 0 ? "bad" : "neutral"}
        />
      </StatRow>

      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setCurrentPage(1);
          }}
          placeholder="BPL id or branch name…"
          fieldClassName="min-w-[260px]"
        />
        <FilterCount>
          {num(filteredBranches.length)} row{filteredBranches.length === 1 ? "" : "s"}
          {search ? " of " + num(branches.length) : ""}
        </FilterCount>
        <FilterActions>
          <Button onClick={() => void fetchBranches()} disabled={isFetching}>
            <HiArrowPath className={isFetching ? "animate-spin" : ""} aria-hidden="true" />
            {isFetching ? "Loading…" : "Refresh"}
          </Button>
        </FilterActions>
      </FilterBar>

      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 px-4 py-3">
          <CardTitle>Branches</CardTitle>
        </CardHeader>

        {loading && branches.length === 0 ? (
          <TableSkeleton rows={6} columns={4} label="Loading branches" />
        ) : filteredBranches.length === 0 ? (
          <EmptyState
            icon={HiBuildingOffice2}
            title={search ? "No branches match this search" : "No branches synced yet"}
            hint={
              search
                ? "Try the BPL number on its own."
                : "Run a Branches sync on the Status tab to pull the mapping from SAP."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>BPL ID</TableHead>
                    <TableHead>Branch Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((branch) => (
                    <TableRow key={branch.id}>
                      <TableCell className="font-mono text-[12px] text-ink">
                        BPL-{branch.bpl_id}
                      </TableCell>
                      <TableCell className="font-semibold text-ink">
                        {dash(branch.bpl_name)}
                      </TableCell>
                      <TableCell>
                        <Badge tone={branch.is_active ? "ok" : "bad"}>
                          {branch.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-subtle">
                        {formatStamp(branch.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredBranches.length > ITEMS_PER_PAGE && (
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
