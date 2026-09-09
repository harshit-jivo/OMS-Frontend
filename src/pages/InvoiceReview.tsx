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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE STATUS FILTERS ARE A TABLIST NOW
 * ─────────────────────────────────────────────────────────────────────────
 * They were `<button aria-pressed>` inside a `<nav>` — which describes seven
 * independent toggles, when in fact exactly one is ever active and choosing
 * one replaces the table below. That is a tablist, and saying so is not
 * decoration: `ui/tabs` brings the roving tabindex (one Tab press gets past
 * the strip instead of seven) and Left/Right/Home/End, neither of which the
 * buttons had.
 */
import { HiOutlineArrowPath } from "react-icons/hi2";

import { useAction } from "../auth/actions";
import MissionControlLoader from "../components/MissionControlLoader";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, Notice, Page, PageHeader } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";
import ConfirmActionDialog from "./invoiceReview/components/ConfirmActionDialog";
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
    <Page>
      <Breadcrumbs items={[{ label: "Invoices" }, { label: "Invoice Review" }]} />

      <PageHeader
        title="Invoice Review"
        description="Submitted sales invoices, approved or rejected here before they post to SAP."
        actions={
          <Button variant="ghost" onClick={loadInvoices} disabled={loading}>
            <HiOutlineArrowPath
              aria-hidden="true"
              className={loading ? "motion-safe:animate-spin" : undefined}
            />
            Refresh
          </Button>
        }
      />

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabList label="Filter invoices by status" className="w-max">
          {visibleFilters.map((filter) => {
            const count = counts[filter.key] ?? 0;
            const selected = statusFilter === filter.key;
            return (
              <Tab
                key={filter.key}
                id={`ir-tab-${filter.key}`}
                aria-controls="ir-invoice-panel"
                selected={selected}
                onClick={() => setStatusFilter(filter.key)}
              >
                {filter.label}
                {count > 0 ? (
                  /* On the selected tab the count sits on a brand fill, where
                     a `neutral` badge's pale grey would vanish. */
                  <Badge
                    tone={selected ? "neutral" : "info"}
                    className={selected ? "bg-white/20 text-white" : undefined}
                  >
                    {count > 99 ? "99+" : count}
                  </Badge>
                ) : null}
              </Tab>
            );
          })}
        </TabList>
      </div>

      {/* Outcomes of the last action, and the load failure. `Notice` carries
          `role="status"`, so a screen reader hears the result of a decision it
          could not otherwise know had landed. */}
      {actionMessage ? <Notice tone="ok">{actionMessage}</Notice> : null}
      {actionError ? <Notice tone="bad">{actionError}</Notice> : null}
      {error ? (
        <Notice tone="bad" title="Could not load invoices">
          {error}
        </Notice>
      ) : null}

      <Card
        id="ir-invoice-panel"
        role="tabpanel"
        aria-labelledby={`ir-tab-${statusFilter}`}
        className="overflow-hidden p-0"
      >
        <InvoiceTable view={view} />
      </Card>

      {/* The one question every verb asks. Was five `window.confirm`s and a
          `window.prompt` for the rejection reason. */}
      <ConfirmActionDialog view={view} />
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
    </Page>
  );
}
