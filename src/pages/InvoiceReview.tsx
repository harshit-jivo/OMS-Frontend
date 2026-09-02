/**
 * Invoice Review — Phase 4 split.
 *
 * Everything the page KNOWS moved into `invoiceReview/useInvoiceReview.ts`
 * (state, queries, handlers) and `invoiceReview/helpers.ts` (pure formatting /
 * status logic); the sub-views that used to be inline JSX moved into
 * `invoiceReview/components/`. What is left here is the header, the filter
 * tabs, the action banners, and composition of the pieces below — the same
 * shape as `Add_Sales.tsx` + `salesOrder/`.
 *
 * This file keeps its exact path so nothing that imports it (routes, tests)
 * needs to change.
 */
import { HiArrowPath } from "react-icons/hi2";

import { useAction } from "../auth/actions";
import MissionControlLoader from "../components/MissionControlLoader";
import "../styles/InvoiceReview.css";
import CreditLimitFlowDialog from "./invoiceReview/components/CreditLimitFlowDialog";
import CreditLimitRequestDialog from "./invoiceReview/components/CreditLimitRequestDialog";
import InvoiceDetailDialog from "./invoiceReview/components/InvoiceDetailDialog";
import InvoiceHistoryDialog from "./invoiceReview/components/InvoiceHistoryDialog";
import InvoiceTable from "./invoiceReview/components/InvoiceTable";
import { useInvoiceReview } from "./invoiceReview/useInvoiceReview";

export default function InvoiceReview() {
  // Two desks share this screen and do opposite halves of the job: the factory
  // approver decides Approve/Reject, billing posts the approved invoice to SAP.
  // Both rules come from `auth/actions.ts` rather than from a raw
  // `localStorage.getItem("role")` read, which saw only the primary role and so
  // ignored a desk granted through `extra_roles`.
  //
  // WARNING, and it is a real one: the entry for `invoice.approve` records that
  // the server does NOT enforce this. `InvoicelogStatusUpdateView` carries only
  // the project-wide `IsAuthenticated`, so any signed-in user can PATCH an
  // invoice to APPROVED directly. These booleans are therefore the only thing
  // in front of that endpoint, which is not a job a browser can do. The fix is
  // a permission class on the view; this comment stays until there is one.
  const canApproveReject = useAction("invoice.approve");
  const canPostToSap = useAction("invoice.postToSap");
  const view = useInvoiceReview({ canApproveReject, canPostToSap });
  const {
    loading,
    loadInvoices,
    visibleFilters,
    counts,
    statusFilter,
    setStatusFilter,
    actionMessage,
    actionError,
    error,
    sapPost,
    postingRecord,
    sapErrorIsCreditLimit,
    closeSapLoader,
    raiseClFromLoader,
    openLoaderReport,
  } = view;

  return (
    <div className="ir-page">
      <header className="ir-header">
        <div>
          <h1>Invoice Review</h1>
          {/* <p>Review submitted sales invoices and approve or reject them before they post to SAP HANA.</p> */}
        </div>
        <button
          type="button"
          className="ir-btn ir-btn-ghost"
          onClick={loadInvoices}
          disabled={loading}
        >
          <HiArrowPath className={loading ? "ir-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <nav className="ir-filters" aria-label="Filter invoices by status">
        {visibleFilters.map((filter) => {
          const count = counts[filter.key] ?? 0;
          const isActive = statusFilter === filter.key;
          return (
            <button
              key={filter.key}
              type="button"
              className={`ir-filter${isActive ? " is-active" : ""}`}
              aria-pressed={isActive}
              onClick={() => setStatusFilter(filter.key)}
            >
              {filter.label}
              {count > 0 && <span className="ir-filter-badge">{count > 99 ? "99+" : count}</span>}
            </button>
          );
        })}
      </nav>

      {actionMessage && <div className="ir-banner ir-banner-success">{actionMessage}</div>}
      {actionError && <div className="ir-banner ir-banner-error">{actionError}</div>}
      {error && <div className="ir-banner ir-banner-error">{error}</div>}

      <section className="ir-card">
        <InvoiceTable view={view} />
      </section>

      <InvoiceDetailDialog view={view} />
      <InvoiceHistoryDialog view={view} />

      {/* Credit-limit request form (credit-limit ERROR records only) */}
      <CreditLimitRequestDialog view={view} />

      {/* Credit-limit approval flow (CL Raised records) */}
      <CreditLimitFlowDialog view={view} />

      {/* Mission Control loader — drives the live post-to-SAP transaction and
          shows success or the translated SAP error (with retry) in place. */}
      <MissionControlLoader
        state={sapPost.state}
        onClose={closeSapLoader}
        onRetry={sapPost.retry}
        onRaiseCl={
          canPostToSap && sapErrorIsCreditLimit && postingRecord ? raiseClFromLoader : undefined
        }
        onOpenReport={openLoaderReport}
      />
    </div>
  );
}
