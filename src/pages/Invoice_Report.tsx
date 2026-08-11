import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  HiArrowTopRightOnSquare,
  HiDocumentText,
  HiMagnifyingGlass,
  HiXMark,
} from "react-icons/hi2";
import { API_BASE_URL } from "../services/api";
import "../styles/Invoice_Report.css";

// Bill prints are proxied through our own backend (it resolves DocNum ->
// DocEntry against OINV, then streams the Crystal PDF back). The response is
// application/pdf, so the PDF is embedded via an <iframe> instead of fetched.
const billPdfUrl = (docNum: string) =>
  `${API_BASE_URL}/invoice/crystal/?docNum=${encodeURIComponent(docNum)}`;

export default function Invoice_Report() {
  const role = (localStorage.getItem("role") || "").toLowerCase();

  const [docNum, setDocNum] = useState("");
  const [activeDocNum, setActiveDocNum] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState("");

  // Page is restricted to the billing role; anyone else is bounced to the
  // dashboard (mirrors how the sidebar hides the link).
  if (role !== "billing") {
    return <Navigate to="/Dashboard" replace />;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = docNum.trim();
    if (!/^\d+$/.test(trimmed)) {
      setError("Enter a valid numeric Doc Number.");
      return;
    }
    setError("");
    setPdfLoading(true);
    // Re-setting the same value must still reload the iframe, so clear first.
    if (trimmed === activeDocNum) {
      setActiveDocNum("");
      window.setTimeout(() => setActiveDocNum(trimmed), 0);
    } else {
      setActiveDocNum(trimmed);
    }
  };

  const handleClear = () => {
    setDocNum("");
    setActiveDocNum("");
    setError("");
    setPdfLoading(false);
  };

  return (
    <div className="invr-page">
      <div className="invr-header">
        <div>
          <h1 className="invr-title">Invoice Report</h1>
          <p className="invr-subtitle">
            Enter a Doc Number to fetch and preview the invoice bill print.
          </p>
        </div>
      </div>

      <form className="invr-form-card" onSubmit={handleSubmit}>
        <div className="invr-field">
          <label className="invr-label" htmlFor="invr-docnum">
            Doc Number
          </label>
          <input
            id="invr-docnum"
            className="invr-input"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 626070545"
            value={docNum}
            onChange={(e) => setDocNum(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="invr-actions">
          <button className="invr-btn invr-btn-primary" type="submit">
            <HiMagnifyingGlass aria-hidden="true" />
            Get Invoice
          </button>
          {activeDocNum && (
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

      {activeDocNum ? (
        <div className="invr-viewer-card">
          <div className="invr-viewer-head">
            <span className="invr-viewer-title">
              <HiDocumentText aria-hidden="true" />
              Bill_{activeDocNum}.pdf
            </span>
            <a
              className="invr-btn invr-btn-ghost"
              href={billPdfUrl(activeDocNum)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <HiArrowTopRightOnSquare aria-hidden="true" />
              Open in new tab
            </a>
          </div>
          {pdfLoading && <div className="invr-loading">Loading invoice…</div>}
          <iframe
            key={activeDocNum}
            className="invr-pdf-frame"
            title={`Invoice ${activeDocNum}`}
            src={billPdfUrl(activeDocNum)}
            onLoad={() => setPdfLoading(false)}
          />
        </div>
      ) : (
        <div className="invr-empty">
          <HiDocumentText aria-hidden="true" />
          <p>No invoice loaded yet. Enter a Doc Number above to preview its PDF.</p>
        </div>
      )}
    </div>
  );
}
