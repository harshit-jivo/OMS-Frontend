import { useEffect, useState } from "react";
import { sapService } from "../services/sapService";
import type { Party } from "../services/sapService";
import "../styles/Parties.css";

export default function Parties() {

  const [parties, setParties] = useState<Party[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
  
  useEffect(() => {
    fetchParties();
  }, []);

  const fetchParties = async () => {
    setLoading(true);
    try {
      const data = await sapService.getParties();
      setParties(data);
    } catch (error) {
      console.log("Error fetching parties:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredParties = parties.filter(
    (party) =>
      party.card_code?.toLowerCase().includes(search.toLowerCase()) ||
      party.card_name?.toLowerCase().includes(search.toLowerCase()) ||
      party.main_group?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="pt-page">
      <div className="pt-toolbar">
        <span className="pt-count">Total: {filteredParties.length}</span>
        <div className="pt-search-wrap">
          <input
            type="text"
            placeholder="Search by code, name or group..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="pt-search"
          />
          <div className="pt-search-line" />
        </div>
      </div>

      {loading ? (
        <p className="pt-loading">Loading parties...</p>
      ) : filteredParties.length > 0 ? (
        <div className="pt-grid">
          {filteredParties.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((party) => (
            <div className="pt-card" key={party.id}>
              <div className="pt-card-head">
                <span className="pt-code">{party.card_code}</span>
                {party.category && <span className="pt-badge">{party.category}</span>}
              </div>
              <div className="pt-card-name">{party.card_name}</div>
              <div className="pt-card-details">
                <span>State: {party.state}</span>
                <span>Group: {party.main_group}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="pt-empty">No parties found</p>
      )}

      {filteredParties.length > itemsPerPage && (
        <div className="pt-pagination">
          <button className="pt-pg-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>← Prev</button>
          <span className="pt-pg-info">{currentPage} / {Math.ceil(filteredParties.length / itemsPerPage)}</span>
          <button className="pt-pg-btn" disabled={currentPage === Math.ceil(filteredParties.length / itemsPerPage)} onClick={() => setCurrentPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );

}
