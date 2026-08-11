import { useEffect, useMemo, useState } from "react";
import {
  HiArrowPath,
  HiBuildingOffice2,
  HiCheckCircle,
  HiMagnifyingGlass,
  HiXCircle,
} from "react-icons/hi2";
import { sapService } from "../services/sapService";
import type { Branch } from "../services/sapService";
import "../styles/SapData.css";

const ITEMS_PER_PAGE = 15;

const dash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

const formatStamp = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const data = await sapService.getBranches();
      setBranches(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error fetching Branches:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBranches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return branches;
    return branches.filter((branch) =>
      [branch.bpl_id, branch.bpl_name].some((field) =>
        String(field ?? "").toLowerCase().includes(needle),
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
    { label: "Inactive", value: branches.length - activeCount, icon: HiXCircle, tone: "sd-kpi-bad" },
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
            placeholder="Search by BPL id or branch name…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <button type="button" className="sd-btn" onClick={fetchBranches} disabled={loading}>
          <HiArrowPath className={loading ? "sd-spin" : ""} aria-hidden="true" />
          {loading ? "Loading…" : "Refresh"}
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
              <table className="sd-table">
                <thead>
                  <tr>
                    <th>BPL ID</th>
                    <th>Branch Name</th>
                    <th>Status</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((branch) => (
                    <tr key={branch.id}>
                      <td className="sd-code">BPL-{branch.bpl_id}</td>
                      <td className="sd-strong">{dash(branch.bpl_name)}</td>
                      <td>
                        <span className={`sd-badge ${branch.is_active ? "sd-badge-ok" : "sd-badge-fail"}`}>
                          {branch.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="sd-dim sd-nowrap">{formatStamp(branch.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredBranches.length > ITEMS_PER_PAGE && (
              <div className="sd-pagination">
                <button
                  type="button"
                  className="sd-pg-btn"
                  disabled={page === 1}
                  onClick={() => setCurrentPage(page - 1)}
                >
                  ← Prev
                </button>
                <span className="sd-pg-info">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="sd-pg-btn"
                  disabled={page === totalPages}
                  onClick={() => setCurrentPage(page + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
