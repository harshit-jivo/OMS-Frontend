import { useMemo, useState } from "react";
import {
  HiArrowPath,
  HiBuildingOffice2,
  HiCheckCircle,
  HiMagnifyingGlass,
  HiXCircle,
} from "react-icons/hi2";
import { useSapBranches } from "../lib/sapQueries";
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

const formatStamp = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

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
  const kpis = [
    { label: "Branches", value: branches.length, icon: HiBuildingOffice2, tone: "" },
    { label: "Active", value: activeCount, icon: HiCheckCircle, tone: "sd-kpi-ok" },
    {
      label: "Inactive",
      value: branches.length - activeCount,
      icon: HiXCircle,
      tone: "sd-kpi-bad",
    },
  ];

  return (
    <div className="sd-page">
      <div className="sd-kpis sd-kpis-3">
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
            placeholder="Search by BPL id or branch name…" aria-label="Search by BPL id or branch name"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <button type="button" className="sd-btn" onClick={fetchBranches} disabled={isFetching}>
          <HiArrowPath className={loading ? "sd-spin" : ""} aria-hidden="true" />
          {isFetching ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="sd-table-card">
        <div className="sd-table-head">
          <h2 className="sd-table-title">Branches</h2>
          <span className="sd-table-note">
            {filteredBranches.length.toLocaleString("en-IN")} row
            {filteredBranches.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading && branches.length === 0 ? (
          <p className="sd-loading">Loading branches…</p>
        ) : filteredBranches.length === 0 ? (
          <p className="sd-empty">No branches found</p>
        ) : (
          <>
            <div className="sd-table-scroll">
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
                      <TableCell className="sd-code">BPL-{branch.bpl_id}</TableCell>
                      <TableCell className="sd-strong">{dash(branch.bpl_name)}</TableCell>
                      <TableCell>
                        <Badge tone={branch.is_active ? "ok" : "bad"}>
                          {branch.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="sd-dim sd-nowrap">
                        {formatStamp(branch.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredBranches.length > ITEMS_PER_PAGE && (
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
