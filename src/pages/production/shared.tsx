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
import { HiOutlineBuildingOffice2, HiOutlineFunnel } from "react-icons/hi2";

import { Badge, type BadgeTone } from "../../components/ui/badge";
import { FilterSelect } from "../../components/ui/filter-bar";
import { TableCell } from "../../components/ui/table";
import {
  PRODUCTION_COMPANIES,
  SAP_ORDER_STATUS_LABEL,
  SAP_ORDER_TYPE_LABEL,
  type ProductionCompany,
  type ProductionFlowStatus,
  type ProductionOrder,
} from "../../services/productionService";
import { fmtQty } from "./format";

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
 * Both filters are `FilterSelect`s now — the labelled field the Approver Queue
 * and every other list in the app uses.
 *
 * They were bare `<select>`s sized to perch at the end of a tab strip, which
 * made these two pages the only lists in the module whose filters were
 * unlabelled grey boxes. `filter-bar.tsx` documents why the visible caption
 * matters: "All companies" reads as a label only until something is selected,
 * after which a row of identical selects is nameless to everyone, not just to
 * a screen reader.
 */
export function CompanyFilterSelect({
  value,
  onChange,
}: {
  value: CompanyFilter;
  onChange: (v: CompanyFilter) => void;
}) {
  return (
    <FilterSelect
      label="Company"
      icon={HiOutlineBuildingOffice2}
      value={value}
      onChange={(e) => onChange(e.target.value as CompanyFilter)}
    >
      <option value="">All companies</option>
      {PRODUCTION_COMPANIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </FilterSelect>
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
    <FilterSelect
      label="Status"
      icon={HiOutlineFunnel}
      value={value}
      onChange={(e) => onChange(e.target.value as StatusFilter)}
    >
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </FilterSelect>
  );
}

/* ------------------------------------------------------------------ *
 * Row cells
 * ------------------------------------------------------------------ *
 * The three cells both tables render identically. They were duplicated, and
 * the duplication had already started to cost: `planned_boxes` is rendered
 * with a falsy check that hides a legitimate "0", in both copies, so a fix
 * had to be made twice or not at all.
 */

/** Item code over item name. */
export function ItemCell({ order }: { order: ProductionOrder }) {
  return (
    <TableCell className="min-w-[240px]">
      <div className="font-medium text-ink">{order.item_code}</div>
      <div className="text-[12px] text-subtle">{order.item_name}</div>
    </TableCell>
  );
}

/** Planned pieces, with the box equivalent beneath when the pack size is known. */
export function PlannedCell({ order }: { order: ProductionOrder }) {
  return (
    <TableCell className="whitespace-nowrap text-right tabular-nums">
      <div>{fmtQty(order.planned_qty)} pcs</div>
      {/* `!= null` rather than truthy: "0" is a real answer and was being
          swallowed along with null. */}
      {order.planned_boxes != null && order.planned_boxes !== "" && (
        <div className="text-[12px] text-subtle">{fmtQty(order.planned_boxes)} box</div>
      )}
    </TableCell>
  );
}

/** Flow status plus the qualifiers that change what the status MEANS. */
export function StatusCell({ order }: { order: ProductionOrder }) {
  return (
    <TableCell>
      <div className="flex flex-wrap items-center gap-1">
        <FlowStatusBadge status={order.flow?.status} />
        <OrderTypeBadge order={order} />
        <GateExemptBadge order={order} />
        {order.flow?.sap_status === "FAILED" && (
          <Badge tone="bad" outlined>
            SAP write failed
          </Badge>
        )}
      </div>
    </TableCell>
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
