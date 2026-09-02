import AnalyticsTab from "./AnalyticsTab";
import ApproversTab from "./approvalManagement/components/ApproversTab";
import LevelsTab from "./approvalManagement/components/LevelsTab";
import MastersTab from "./approvalManagement/components/MastersTab";
import WorkflowsTab from "./approvalManagement/components/WorkflowsTab";
import { useApprovalManagement } from "./approvalManagement/useApprovalManagement";
import type { Tab } from "./approvalManagement/types";
import "../../styles/Approval_Admin.css";
import "../../styles/Payments_Dashboard.css";
import "../../styles/Payments_Dashboard_Table.css";
import { Tab as TabButton, TabList } from "@/components/ui/tabs";

/**
 * Approval Workflow Management — single admin console for the Payments module.
 *
 * One page, six tabs. Everything an administrator needs to run approvals for
 * Receive Payment and Bank Deposit (and, via document_type, future modules)
 * without touching the database.
 *
 * Backend: /api/approvals/ (workflows, levels, approvers, requests) and
 * /api/payments/ for the master lists. Endpoints that do not exist yet are
 * typed in approvalService and render a real empty/error state rather than
 * mock data.
 *
 * Phase 4: this file used to hold all five tabs, their state and their data
 * fetching (~2,400 lines). It is now a thin composition — the tab shell plus
 * routing between them — with each tab's state, mutations and markup in
 * `approvalManagement/`: one `useXxxTab` hook per tab (data-fetching and
 * effects, Phase 3.1'd from `useResource` onto `useQuery`/`useMutation`) and
 * one component per tab. `useApprovalManagement` owns what the shell itself
 * needs: the tab selector, the toast, and the one workflows list three tabs
 * share.
 */

// Analytics is first and default — the page is now a dashboard that also
// carries its configuration, rather than a configuration console.
//
// The former Overview and Requests tabs are gone: Overview counted workflows
// and pending requests, which the dashboard now reports in money terms, and
// Requests duplicated the approval queue the operators work from in the app.
// The four configuration tabs stay, because without them nobody can add an
// approver, change an approval level or map a payment method to a SAP bank.
const TABS: { id: Tab; label: string }[] = [
  { id: "analytics", label: "Analytics" },
  { id: "workflows", label: "Workflows" },
  { id: "levels", label: "Levels" },
  { id: "approvers", label: "Approvers" },
  { id: "masters", label: "Masters" },
];

export default function PaymentsDashboard() {
  const {
    tab,
    setTab,
    toast,
    flash,
    isAdmin,
    selectedWorkflowId,
    setSelectedWorkflowId,
    workflows,
    openLevels,
    openApprovers,
  } = useApprovalManagement();

  return (
    <div className="apv-page app-page">
      <div className="apv-header">
        <div>
          <h1>Payments Dashboard</h1>
          <div className="apv-sub">
            Track and analyze payment and deposit activities.
          </div>
        </div>
      </div>

      {/* Analytics is read-only for everyone, so the configuration warning
          would be noise there. */}
      {!isAdmin && tab !== "analytics" && (
        <div className="apv-notice apv-notice-warn">
          <span>
            Configuration is read-only for this account. Editing needs
            administrator rights or the Payments Dashboard permission — the
            server rejects changes without one of them.
          </span>
        </div>
      )}

      <TabList className="apv-tabs" label="Approval sections">
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            selected={tab === t.id}
            className={`apv-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </TabButton>
        ))}
      </TabList>

      {tab === "analytics" && <AnalyticsTab />}

      {tab === "workflows" && (
        <WorkflowsTab
          resource={workflows}
          canEdit={isAdmin}
          flash={flash}
          onOpenLevels={openLevels}
          onOpenApprovers={openApprovers}
        />
      )}

      {tab === "levels" && (
        <LevelsTab
          workflows={workflows.data}
          selectedId={selectedWorkflowId}
          onSelect={setSelectedWorkflowId}
          canEdit={isAdmin}
          flash={flash}
          onWorkflowsChanged={workflows.reload}
        />
      )}

      {tab === "approvers" && (
        <ApproversTab
          workflows={workflows.data}
          selectedId={selectedWorkflowId}
          onSelect={setSelectedWorkflowId}
          canEdit={isAdmin}
          flash={flash}
        />
      )}

      {tab === "masters" && <MastersTab canEdit={isAdmin} flash={flash} />}


      {toast && (
        <div className={`apv-toast${toast.kind === "err" ? " is-err" : ""}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
