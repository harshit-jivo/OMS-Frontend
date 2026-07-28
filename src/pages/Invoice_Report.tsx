import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  HiArrowTopRightOnSquare,
  HiDocumentText,
  HiMagnifyingGlass,
  HiXMark,
} from "react-icons/hi2";
import "../styles/Invoice_Report.css";

// The bill-print service lives on a separate host from the main backend. It
// always answers 200 + application/pdf (Content-Disposition: inline) and sends
// no CORS headers, so the PDF is embedded via an <iframe> instead of fetched.
const BILLPRINT_BASE = String(
  import.meta.env.VITE_BILLPRINT_API_URL || "http://103.89.45.75:8008",
).replace(/\/+$/, "");

const billPdfUrl = (docEntry: string) =>
  `${BILLPRINT_BASE}/api/billprint/${encodeURIComponent(docEntry)}`;

export default function Invoice_Report() {
  const role = (localStorage.getItem("role") || "").toLowerCase();

  const [docEntry, setDocEntry] = useState("");
  const [activeDocEntry, setActiveDocEntry] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState("");

  // Page is restricted to the billing role; anyone else is bounced to the
  // dashboard (mirrors how the sidebar hides the link).
  if (role !== "billing") {
    return <Navigate to="/Dashboard" replace />;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = docEntry.trim();
    if (!/^\d+$/.test(trimmed)) {
      setError("Enter a valid numeric Doc Entry.");
      return;
    }
    setError("");
    setPdfLoading(true);
    // Re-setting the same value must still reload the iframe, so clear first.
    if (trimmed === activeDocEntry) {
      setActiveDocEntry("");
      window.setTimeout(() => setActiveDocEntry(trimmed), 0);
    } else {
      setActiveDocEntry(trimmed);
    }
  };

  const handleClear = () => {
    setDocEntry("");
    setActiveDocEntry("");
    setError("");
    setPdfLoading(false);
  };

  return (
    <div className="invr-page">
      <div className="invr-header">
        <div>
          <h1 className="invr-title">Invoice Report</h1>
          <p className="invr-subtitle">
            Enter a Doc Entry to fetch and preview the invoice bill print.
          </p>
        </div>
      </div>

      <form className="invr-form-card" onSubmit={handleSubmit}>
        <div className="invr-field">
          <label className="invr-label" htmlFor="invr-docentry">
            Doc Entry
          </label>
          <input
            id="invr-docentry"
            className="invr-input"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 76600"
            value={docEntry}
            onChange={(e) => setDocEntry(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="invr-actions">
          <button className="invr-btn invr-btn-primary" type="submit">
            <HiMagnifyingGlass aria-hidden="true" />
            Get Invoice
          </button>
          {activeDocEntry && (
            <button
              className="invr-btn invr-btn-ghost"
              type="button"
              onClick={handleClear}
            >
              <HiXMark aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
        {error && <p className="invr-error">{error}</p>}
      </form>

      {activeDocEntry ? (
        <div className="invr-viewer-card">
          <div className="invr-viewer-head">
            <span className="invr-viewer-title">
              <HiDocumentText aria-hidden="true" />
              Bill_{activeDocEntry}.pdf
            </span>
            <a
              className="invr-btn invr-btn-ghost"
              href={billPdfUrl(activeDocEntry)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <HiArrowTopRightOnSquare aria-hidden="true" />
              Open in new tab
            </a>
          </div>
          {pdfLoading && <div className="invr-loading">Loading invoice…</div>}
          <iframe
            key={activeDocEntry}
            className="invr-pdf-frame"
            title={`Invoice ${activeDocEntry}`}
            src={billPdfUrl(activeDocEntry)}
            onLoad={() => setPdfLoading(false)}
          />
        </div>
      ) : (
        <div className="invr-empty">
          <HiDocumentText aria-hidden="true" />
          <p>No invoice loaded yet. Enter a Doc Entry above to preview its PDF.</p>
        </div>
      )}
    </div>
  );
}
