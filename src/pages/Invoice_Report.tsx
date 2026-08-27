import { useState } from "react";
import type { FormEvent } from "react";
import {
  HiArrowTopRightOnSquare,
  HiDocumentText,
  HiMagnifyingGlass,
  HiXMark,
} from "react-icons/hi2";
import { API_BASE_URL } from "../services/api";
import "../styles/Invoice_Report.css";

// Oil, beverage and mart are separate SAP company databases with separate
// Crystal reports, and the same DocNum exists in all three meaning a DIFFERENT
// invoice — so the branch travels with the request and decides which one is
// resolved and rendered. Getting it wrong prints someone else's invoice, not an
// error.
const BRANCHES = [
  { value: "OIL", label: "Oil" },
  { value: "BEVERAGE", label: "Beverage" },
  { value: "MART", label: "Mart" },
] as const;

type Branch = (typeof BRANCHES)[number]["value"];

const branchLabel = (value: Branch) =>
  BRANCHES.find((b) => b.value === value)?.label ?? value;

// Bill prints are proxied through our own backend (it resolves DocNum ->
// DocEntry against the branch's OINV, then streams the Crystal PDF back). The
// response is application/pdf, so the PDF is embedded via an <iframe> instead
// of fetched.
const billPdfUrl = (docNum: string, branch: Branch) =>
  `${API_BASE_URL}/invoice/crystal/?docNum=${encodeURIComponent(docNum)}&branch=${branch}`;

export default function Invoice_Report() {

  const [docNum, setDocNum] = useState("");
  const [branch, setBranch] = useState<Branch>("OIL");
  // The branch the currently previewed PDF was fetched with — switching the
  // selector must not silently repoint the open preview.
  const [activeBranch, setActiveBranch] = useState<Branch>("OIL");
  const [activeDocNum, setActiveDocNum] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Route access: now decided once, in components/ProtectedPage.tsx ───────
  // The guard that used to sit here is commented out below rather than removed.
  //
  // It was not merely redundant, it was WRONG, and in the direction that hurts:
  // `role !== "billing"` bounced an administrator off a page the sidebar showed
  // them and the API served them, because it compared the primary role string
  // alone — no `extra_roles`, no `is_superuser`, no `is_staff`. Two guards that
  // disagree are worse than one, and this was the one that was mistaken.
  //
  //   const role = (localStorage.getItem("role") || "").toLowerCase();
  //   if (role !== "billing") return <Navigate to="/Dashboard" replace />;
  //
  // `auth/routeAccess.ts` carries the same rule (`roles: ["billing"]`) with the
  // admin bypass every other route gets.

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = docNum.trim();
    if (!/^\d+$/.test(trimmed)) {
      setError("Enter a valid numeric Doc Number.");
      return;
    }
    setError("");
    setPdfLoading(true);
    setActiveBranch(branch);
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
            Pick a company and enter a Doc Number to fetch and preview the
            invoice bill print.
          </p>
        </div>
      </div>

      <form className="invr-form-card" onSubmit={handleSubmit}>
        <div className="invr-field invr-field-branch">
          <span className="invr-label" id="invr-branch-label">
            Company
          </span>
          <div
            className="invr-segmented"
            role="radiogroup"
            aria-labelledby="invr-branch-label"
          >
            {BRANCHES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={branch === option.value}
                className={`invr-segment${
                  branch === option.value ? " invr-segment-active" : ""
                }`}
                onClick={() => setBranch(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
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
              <span className="invr-viewer-branch">{branchLabel(activeBranch)}</span>
            </span>
            <a
              className="invr-btn invr-btn-ghost"
              href={billPdfUrl(activeDocNum, activeBranch)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <HiArrowTopRightOnSquare aria-hidden="true" />
              Open in new tab
            </a>
          </div>
          {pdfLoading && <div className="invr-loading">Loading invoice…</div>}
          <iframe
            key={`${activeBranch}-${activeDocNum}`}
            className="invr-pdf-frame"
            title={`Invoice ${activeDocNum}`}
            src={billPdfUrl(activeDocNum, activeBranch)}
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
