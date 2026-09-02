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

import { useSapAddresses } from "../lib/sapQueries";
import "../styles/Addresses.css";

export default function Addresses() {
  const { items: addresses, isLoading: loading } = useSapAddresses();
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const filteredAddresses = addresses.filter(
    (address) =>
      address.card_code?.toLowerCase().includes(search.toLowerCase()) ||
      address.address_name?.toLowerCase().includes(search.toLowerCase()) ||
      address.city?.toLowerCase().includes(search.toLowerCase()),
  );
  const paginatedAddresses = filteredAddresses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <div className="ad-page">
      <div className="ad-toolbar">
        <span className="ad-count">Total: {filteredAddresses.length}</span>
        <div className="ad-search-wrap">
          <input
            type="text"
            placeholder="Search by code, name or city..." aria-label="Search by code, name or city"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="ad-search"
          />
          <div className="ad-search-line" />
        </div>
      </div>

      {loading ? (
        <p className="ad-loading">Loading addresses...</p>
      ) : filteredAddresses.length > 0 ? (
        <>
          <div className="ad-grid">
            {paginatedAddresses.map((address) => (
              <div className="ad-card" key={address.id}>
                <div className="ad-card-head">
                  <span className="ad-code">{address.card_code}</span>
                  <span className="ad-badge">
                    {address.address_type === "S" ? "Shipping" : "Billing"}
                  </span>
                </div>
                <div className="ad-card-name">{address.address_name}</div>
                {address.full_address && <div className="ad-card-addr">{address.full_address}</div>}
                <div className="ad-card-details">
                  <span>City: {address.city}</span>
                  <span>State: {address.state}</span>
                  <span>PIN: {address.zip_code}</span>
                  {address.gst_number && <span>GST: {address.gst_number}</span>}
                </div>
              </div>
            ))}
          </div>

          {filteredAddresses.length > itemsPerPage && (
            <div className="ad-pagination">
              <button
                className="ad-pg-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => page - 1)}
              >
                ← Prev
              </button>
              <span className="ad-pg-info">
                {currentPage} / {Math.ceil(filteredAddresses.length / itemsPerPage)}
              </span>
              <button
                className="ad-pg-btn"
                disabled={currentPage === Math.ceil(filteredAddresses.length / itemsPerPage)}
                onClick={() => setCurrentPage((page) => page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="ad-empty">No addresses found</p>
      )}
    </div>
  );
}
