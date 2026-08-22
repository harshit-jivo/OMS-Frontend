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
  import.meta.env.VITE_BILLPRINT_API_URL || "http://138.252.101.118:8008",
).replace(/\/+$/, "");

/**
 * Companies the bill-print service can render, in the order they're offered.
 * `slug` is the path segment it expects; each maps to that company's ODBC DSN
 * and HANA schema on the service side.
 *
 * DocEntry is a PER-COMPANY sequence — the same number is a different invoice
 * in each company — so the company is part of the lookup, never a cosmetic
 * label. Getting it wrong prints someone else's invoice, not an error.
 */
const COMPANIES = [
  { slug: "oil", label: "Oil", schema: "JIVO_OIL_HANADB" },
  { slug: "bev", label: "Beverages", schema: "JIVO_BEVERAGES_HANADB" },
  { slug: "mart", label: "Mart", schema: "JIVO_MART_HANADB" },
] as const;

type CompanySlug = (typeof COMPANIES)[number]["slug"];

const billPdfUrl = (company: CompanySlug, docEntry: string) =>
  `${BILLPRINT_BASE}/api/billprint/${company}/${encodeURIComponent(docEntry)}`;

export default function Invoice_Report() {
  const role = (localStorage.getItem("role") || "").toLowerCase();

  const [company, setCompany] = useState<CompanySlug>("oil");
  const [docEntry, setDocEntry] = useState("");
  // What the viewer is currently showing — company included, since the same
  // DocEntry in another company is a different invoice.
  const [active, setActive] = useState<{ company: CompanySlug; docEntry: string } | null>(null);
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
    // Re-submitting the same company + DocEntry must still reload the iframe,
    // so clear first.
    if (active && active.company === company && active.docEntry === trimmed) {
      setActive(null);
      window.setTimeout(() => setActive({ company, docEntry: trimmed }), 0);
    } else {
      setActive({ company, docEntry: trimmed });
    }
  };

  const activeCompany = COMPANIES.find((c) => c.slug === active?.company);

  const handleClear = () => {
    setDocEntry("");
    setActive(null);
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
          <label className="invr-label" htmlFor="invr-company">
            Company
          </label>
          <select
            id="invr-company"
            className="invr-input"
            value={company}
            onChange={(e) => setCompany(e.target.value as CompanySlug)}
          >
            {COMPANIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
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
          {active && (
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

      {active ? (
        <div className="invr-viewer-card">
          <div className="invr-viewer-head">
            <span className="invr-viewer-title">
              <HiDocumentText aria-hidden="true" />
              Bill_{activeCompany?.label}_{active.docEntry}.pdf
              <span className="invr-viewer-schema">{activeCompany?.schema}</span>
            </span>
            <a
              className="invr-btn invr-btn-ghost"
              href={billPdfUrl(active.company, active.docEntry)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <HiArrowTopRightOnSquare aria-hidden="true" />
              Open in new tab
            </a>
          </div>
          {pdfLoading && <div className="invr-loading">Loading invoice…</div>}
          <iframe
            key={`${active.company}:${active.docEntry}`}
            className="invr-pdf-frame"
            title={`Invoice ${active.docEntry} (${activeCompany?.label})`}
            src={billPdfUrl(active.company, active.docEntry)}
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
