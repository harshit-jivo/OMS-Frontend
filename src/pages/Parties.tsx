/**
 * DEAD FILE — nothing imports this.
 *
 * Sap_Sync's "Parties & Addresses" tab renders `PartyDirectory`, which fetches
 * and joins both lists itself; this standalone page was superseded when those
 * two tabs were merged and no route or import survived the change. It is left
 * in place rather than deleted (see the repo's standing rule on removals), and
 * it was carried through the TanStack Query conversion so that adopting it
 * again — if the split view is ever wanted back — does not mean converting it
 * then.
 *
 * If you are looking for the live parties screen, it is `PartyDirectory.tsx`.
 */
import { useState } from "react";

import { useSapParties } from "../lib/sapQueries";
import "../styles/Parties.css";

export default function Parties() {
  const { items: parties, isLoading: loading } = useSapParties();
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

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
            placeholder="Search by code, name or group..." aria-label="Search by code, name or group"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="pt-search"
          />
          <div className="pt-search-line" />
        </div>
      </div>

      {loading ? (
        <p className="pt-loading">Loading parties...</p>
      ) : filteredParties.length > 0 ? (
        <div className="pt-grid">
          {filteredParties
            .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
            .map((party) => (
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
          <button
            className="pt-pg-btn"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            ← Prev
          </button>
          <span className="pt-pg-info">
            {currentPage} / {Math.ceil(filteredParties.length / itemsPerPage)}
          </span>
          <button
            className="pt-pg-btn"
            disabled={currentPage === Math.ceil(filteredParties.length / itemsPerPage)}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
