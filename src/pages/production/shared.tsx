/**
 * The pieces both Production Order pages share.
 *
 * Both head a list with the same counts, narrow it by the same two dimensions,
 * and render the same order summary — so these live here rather than being
 * written twice and drifting, which is what happened to the four copies of
 * `OrderItemsTable` before it was extracted.
 *
 * Components only. The formatting helpers live in `./format` because a file
 * exporting both breaks Fast Refresh.
 */
import { Badge, type BadgeTone } from "../../components/ui/badge";
import { cn } from "../../lib/utils";
import {
  PRODUCTION_COMPANIES,
  SAP_ORDER_STATUS_LABEL,
  SAP_ORDER_TYPE_LABEL,
  type ProductionCompany,
  type ProductionFlowStatus,
  type ProductionOrder,
} from "../../services/productionService";

/** `""` is every company — not a fourth company. */
export type CompanyFilter = "" | ProductionCompany;
export type StatusFilter = "" | ProductionFlowStatus;

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: "", label: "All orders" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  // Not a decision: SAP moved the order on before anyone judged it.
  { value: "OBSOLETE", label: "No longer planned" },
];

/**
 * Sized to sit at the right of a tab strip rather than in a filter card of
 * its own. `h-control-xs` is the token the Workflows header filter uses, so
 * these line up with the tabs beside them.
 */
const SELECT_CLASS = cn(
  "h-control-xs min-w-0 cursor-pointer rounded-sm",
  "border border-line bg-surface px-2.5",
  "[font-family:inherit] text-[12.5px] text-ink",
  "transition-colors hover:border-line-strong",
  "focus-visible:border-brand focus-visible:bg-card focus-visible:shadow-focus focus-visible:outline-none",
);

export function CompanyFilterSelect({
  value,
  onChange,
}: {
  value: CompanyFilter;
  onChange: (v: CompanyFilter) => void;
}) {
  return (
    <select
      aria-label="Filter production orders by company"
      value={value}
      onChange={(e) => onChange(e.target.value as CompanyFilter)}
      className={SELECT_CLASS}
    >
      <option value="">All companies</option>
      {PRODUCTION_COMPANIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

export function StatusFilterSelect({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  return (
    <select
      aria-label="Filter production orders by status"
      value={value}
      onChange={(e) => onChange(e.target.value as StatusFilter)}
      className={SELECT_CLASS}
    >
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ *
 * Badges
 * ------------------------------------------------------------------ */

// The project's badge vocabulary is neutral/info/ok/hold/bad/note — there
// is no "good". See components/ui/badge.tsx.
const FLOW_TONE: Record<ProductionFlowStatus, BadgeTone> = {
  PENDING: "info",
  APPROVED: "ok",
  REJECTED: "bad",
  OBSOLETE: "neutral",
};

const FLOW_LABEL: Record<ProductionFlowStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  OBSOLETE: "No longer planned",
};

export function FlowStatusBadge({ status }: { status?: ProductionFlowStatus | null }) {
  if (!status) return <span className="text-subtle">—</span>;
  return (
    <Badge tone={FLOW_TONE[status]} outlined>
      {FLOW_LABEL[status]}
    </Badge>
  );
}

/** What SAP currently says about the order itself, which is a different fact. */
export function SapStatusBadge({ order }: { order: ProductionOrder }) {
  return (
    <Badge tone={order.sap_status === "P" ? "info" : "neutral"} outlined>
      SAP: {SAP_ORDER_STATUS_LABEL[order.sap_status] ?? order.sap_status}
    </Badge>
  );
}

/**
 * Shown when SAP's release gate would not have stopped this order anyway.
 *
 * Not decoration. The OIL rule ends `AND A."UserSign" <> 33`, and that user
 * raised 2,888 of 3,152 eligible orders — so for most of production this
 * approval is a record, not a control. Saying so is the point.
 */
export function GateExemptBadge({ order }: { order: ProductionOrder }) {
  if (!order.gate_exempt) return null;
  return (
    <Badge
      tone="hold"
      outlined
      title={
        order.gate_exemption_reason ||
        "SAP would release this order without an approval, so this decision is a record rather than a control."
      }
    >
      not gated by SAP
    </Badge>
  );
}

export function OrderTypeBadge({ order }: { order: ProductionOrder }) {
  if (order.order_type === "S") return null;
  return (
    <Badge tone="neutral" outlined>
      {SAP_ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}
    </Badge>
  );
}
