import { useState } from "react";
import type { FormEvent } from "react";
import {
  HiArrowTopRightOnSquare,
  HiDocumentText,
  HiMagnifyingGlass,
  HiXMark,
} from "react-icons/hi2";
import { useBillPrint, openBillPrint } from "../hooks/useBillPrint";
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
// DocEntry against the branch's OINV, then streams the Crystal PDF back).
//
// The URL used to be put straight into the <iframe> and the "open in new tab"
// link. That could not work: those are browser navigations, so no
// Authorization header is attached, and this project authenticates with JWT
// alone — no session cookie to fall back on. The request arrived anonymous at
// a view inheriting IsAuthenticated.
//
// It now goes through axios (services/invoicePrint.ts), which attaches the
// token, refreshes and retries on a 401, and turns a failure into a message
// instead of a blank rectangle.

export default function Invoice_Report() {

  const [docNum, setDocNum] = useState("");
  const [branch, setBranch] = useState<Branch>("OIL");
  // The branch the currently previewed PDF was fetched with — switching the
  // selector must not silently repoint the open preview.
  const [activeBranch, setActiveBranch] = useState<Branch>("OIL");
  const [activeDocNum, setActiveDocNum] = useState("");
  const [error, setError] = useState("");

  // Holds the PDF as an object URL and revokes the previous one on every
  // replacement — a preview per invoice, over a long session, otherwise pins
  // every PDF in memory for the life of the tab.
  const preview = useBillPrint();

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
    setActiveBranch(branch);
    setActiveDocNum(trimmed);
    // No clear-then-reset dance any more. That existed because the iframe only
    // reloaded when its `src` changed, so re-submitting the same Doc Number
    // did nothing; fetching explicitly re-runs whether or not anything changed.
    preview.load({ docNum: trimmed, branch });
  };

  const handleClear = () => {
    setDocNum("");
    setActiveDocNum("");
    setError("");
    preview.load(null);
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
            {/* A button, not a link: the PDF has to be FETCHED with the access
                token before there is anything to open, and an <a href> to the
                endpoint sends no token at all. `openBillPrint` opens the tab
                synchronously and points it at the blob afterwards, so the
                popup blocker still attributes it to this click. */}
            <button
              type="button"
              className="invr-btn invr-btn-ghost"
              disabled={preview.loading}
              onClick={() => {
                void openBillPrint({ docNum: activeDocNum, branch: activeBranch })
                  .then((message) => setError(message));
              }}
            >
              <HiArrowTopRightOnSquare aria-hidden="true" />
              Open in new tab
            </button>
          </div>
          {preview.loading && <div className="invr-loading">Loading invoice…</div>}
          {preview.error && <p className="invr-error">{preview.error}</p>}
          {/* An <iframe> handed an error response renders a blank rectangle or
              raw JSON, so it is only mounted once there is a real PDF. */}
          {preview.url && (
            <iframe
              className="invr-pdf-frame"
              title={`Invoice ${activeDocNum}`}
              src={preview.url}
            />
          )}
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
