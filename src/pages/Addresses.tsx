import { useEffect, useState } from "react";
import { sapService } from "../services/sapService";
import type { Address } from "../services/sapService";
import "../styles/Addresses.css";

export default function Addresses() {
  
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    fetchAddresses();
  }, []);

  const fetchAddresses = async () => {
    setLoading(true);
    try {
      let data = await sapService.getAddresses();
      setAddresses(data);
    } catch (error) {
      console.log("Error fetching addresses:", error);
    } finally {
      setLoading(false);
    }
  };

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
            placeholder="Search by code, name or city..."
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
                  <span className="ad-badge">{address.address_type === "S" ? "Shipping" : "Billing"}</span>
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
