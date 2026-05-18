import { useEffect, useState } from "react";
import { sapService } from "../services/sapService";
import type { Branch } from "../services/sapService";
import "../styles/Branches.css";

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      let data = await sapService.getBranches();
      setBranches(data);
    } catch (error) {
      console.log("Error fetching Branches:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBranches = branches.filter(
    (branch) =>
      branch.bpl_id?.toString().includes(search.toLowerCase()) ||
      branch.bpl_name?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="br-page">
      <div className="br-toolbar">
        <span className="br-count">Total: {filteredBranches.length}</span>
        <div className="br-search-wrap">
          <input
            type="text"
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="br-search"
          />
          <div className="br-search-line" />
        </div>
      </div>

      {loading ? (
        <p className="br-loading">Loading branches...</p>
      ) : filteredBranches.length > 0 ? (
        <div className="br-grid">
          {filteredBranches.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((branch) => (
            <div className="br-card" key={branch.id}>
              <div className="br-card-head">
                <span className="br-code">BPL-{branch.bpl_id}</span>
                <span className={branch.is_active ? "br-badge-active" : "br-badge-inactive"}>
                  {branch.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="br-card-name">{branch.bpl_name}</div>
              <div className="br-card-details">
                <span>Updated: {branch.updated_at}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="br-empty">No branches found</p>
      )}

      {filteredBranches.length > itemsPerPage && (
        <div className="br-pagination">
          <button className="br-pg-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>← Prev</button>
          <span className="br-pg-info">{currentPage} / {Math.ceil(filteredBranches.length / itemsPerPage)}</span>
          <button className="br-pg-btn" disabled={currentPage === Math.ceil(filteredBranches.length / itemsPerPage)} onClick={() => setCurrentPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
