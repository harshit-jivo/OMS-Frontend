/**
 * Production Approval — decide the production orders waiting on you.
 *
 * TWO CONDITIONS GOVERN THIS PAGE, AND ONLY ONE OF THEM IS A PERMISSION.
 *
 *   1. `Production_Order_Approval` — opens the page. Decided by
 *      `ProtectedPage` from `routeAccess.ts`, like every other route.
 *   2. being the workflow stage's current EFFECTIVE user — decides whether any
 *      particular order may be actioned.
 *
 * The second is enforced by the backend on every approve/reject, and this page
 * does not try to re-derive it: the queue only ever contains what the server
 * says this user may act on, so "can I see it" and "can I decide it" stay the
 * same question. Holding the key alone shows an empty queue, which is the
 * honest outcome rather than a wall of buttons that all 403.
 *
 * That `effective` user is also why a temporary replacement works with no code
 * here — during a delegation window the stand-in's queue fills and the
 * configured user's empties, with nothing reassigned.
 *
 * WHAT THIS PAGE CANNOT DO
 * A production order already exists in SAP by the time it appears here.
 * Rejecting does NOT cancel it — it records that OMS will not approve it, and
 * the planner cancels or re-raises in SAP. The rejection dialog says so,
 * because an approver who believes "Reject" stops production would be wrong.
 */
import { useCallback, useEffect, useState } from "react";
import { HiArrowPath, HiCheckCircle, HiExclamationCircle } from "react-icons/hi2";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Field, Textarea } from "../components/ui/form";
import { Card, EmptyState, Page, PageHeader, Stat, StatRow } from "../components/ui/page";
import { Skeleton } from "../components/ui/skeleton";
import { Tab, TabList } from "../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  productionError,
  productionService,
  type ProductionOrder,
} from "../services/productionService";
import { useDeepLinkedOrder } from "./production/useDeepLinkedOrder";
import { OrderDetailDialog } from "./Production_Orders";
import { fmtDate, fmtQty, orderNumber } from "./production/format";
import {
  CompanyFilterSelect,
  FlowStatusBadge,
  GateExemptBadge,
  OrderTypeBadge,
  type CompanyFilter,
} from "./production/shared";

type TabKey = "queue" | "decided";

export default function ProductionApproval() {
  const [tab, setTab] = useState<TabKey>("queue");
  const [company, setCompany] = useState<CompanyFilter>("");

  const [rows, setRows] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [detail, setDetail] = useState<ProductionOrder | null>(null);
  const [deciding, setDeciding] =
    useState<{ order: ProductionOrder; approve: boolean } | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data =
        tab === "queue"
          ? await productionService.approvalQueue({ company: company || undefined })
          : await productionService.approvalHistory({ company: company || undefined });
      setRows(data);
    } catch (err) {
      setError(productionError(err));
    } finally {
      setLoading(false);
    }
  }, [tab, company]);

  useEffect(() => {
    void load();
  }, [load]);

  // Arriving from a "needs your approval" notification: open that order's
  // detail dialog. The row behind it keeps its Approve and Reject buttons,
  // which are rendered from queue membership — the server's answer, not ours.
  useDeepLinkedOrder(rows, !loading, setDetail);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 6000);
  };

  const retrySap = async (order: ProductionOrder) => {
    setRetrying(order.id);
    try {
      await productionService.retrySap(order.id);
      flash(`SAP accepted the approval for PO ${orderNumber(order)}.`);
      void load();
    } catch (err) {
      setError(productionError(err));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Production Approval"
        description="Orders SAP has planned and is waiting on you to release."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <HiArrowPath aria-hidden /> Refresh
          </Button>
        }
      />

      {notice && (
        <Card className="border-good/40 bg-good/5">
          <div className="flex items-center gap-2 p-3 text-[13px]" role="status">
            <HiCheckCircle className="shrink-0 text-good" aria-hidden />
            {notice}
          </div>
        </Card>
      )}

      <StatRow>
        <Stat
          label={tab === "queue" ? "Waiting on you" : "Decided by you"}
          value={loading ? "—" : rows.length}
        />
      </StatRow>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <TabList label="Production approval views">
            <Tab selected={tab === "queue"} onClick={() => setTab("queue")}>
              My queue
            </Tab>
            <Tab selected={tab === "decided"} onClick={() => setTab("decided")}>
              Decided
            </Tab>
          </TabList>
          <div className="ml-auto">
            <CompanyFilterSelect value={company} onChange={setCompany} />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 text-[13px] text-bad" role="alert">
            <HiExclamationCircle className="mt-0.5 shrink-0" aria-hidden />
            <span className="whitespace-pre-line">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={tab === "queue" ? "Nothing waiting on you" : "You have not decided any yet"}
            hint={
              tab === "queue"
                ? "Orders appear here only when a workflow stage names you — or names someone you are standing in for."
                : undefined
            }
            className="py-10"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="min-w-[240px]">Item</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Raised by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-medium text-ink">
                      {orderNumber(row)}
                    </TableCell>
                    <TableCell>{row.company}</TableCell>
                    <TableCell className="min-w-[240px]">
                      <div className="font-medium text-ink">{row.item_code}</div>
                      <div className="text-[12px] text-subtle">{row.item_name}</div>
                    </TableCell>
                    <TableCell>{row.warehouse || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <div>{fmtQty(row.planned_qty)} pcs</div>
                      {row.planned_boxes && (
                        <div className="text-[12px] text-subtle">
                          {fmtQty(row.planned_boxes)} box
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmtDate(row.due_date)}
                    </TableCell>
                    <TableCell>{row.sap_created_by || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <FlowStatusBadge status={row.flow?.status} />
                        <OrderTypeBadge order={row} />
                        <GateExemptBadge order={row} />
                        {row.flow?.sap_status === "FAILED" && (
                          <Badge tone="bad" outlined>
                            SAP write failed
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="secondary" size="sm" onClick={() => setDetail(row)}>
                          Details
                        </Button>
                        {/* Only ever shown in the queue: that list IS the set the
                            server says this user may act on, so there is no
                            second permission check to duplicate here. */}
                        {tab === "queue" && row.flow?.current_stage && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setDeciding({ order: row, approve: false })}
                            >
                              Reject
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setDeciding({ order: row, approve: true })}
                            >
                              Approve
                            </Button>
                          </>
                        )}
                        {row.flow?.sap_status === "FAILED" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={retrying === row.id}
                            onClick={() => void retrySap(row)}
                          >
                            {retrying === row.id ? "Retrying…" : "Retry SAP"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <OrderDetailDialog order={detail} onClose={() => setDetail(null)} />

      <DecisionDialog
        pending={deciding}
        onClose={() => setDeciding(null)}
        onDone={(message) => {
          flash(message);
          void load();
        }}
      />
    </Page>
  );
}

/* ================================================================== *
 * Approve / reject
 * ================================================================== */

function DecisionDialog({
  pending,
  onClose,
  onDone,
}: {
  pending: { order: ProductionOrder; approve: boolean } | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setRemarks("");
    setFormError("");
  }, [pending]);

  const submit = async () => {
    if (!pending) return;
    const { order, approve } = pending;

    // The backend requires a reason to reject and answers a missing one with a
    // 400. Catching it here saves a round trip and puts the message on the
    // field rather than in the page-level error strip.
    if (!approve && !remarks.trim()) {
      setFormError("A reason is required when rejecting.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const result = approve
        ? await productionService.approve(order.id, remarks.trim())
        : await productionService.reject(order.id, remarks.trim());

      let message: string;
      if (!approve) {
        message = `PO ${orderNumber(order)} rejected.`;
      } else if (result.flow_status !== "APPROVED") {
        message = `PO ${orderNumber(order)} approved — it now moves to the next stage.`;
      } else if (result.sap_written === false) {
        // The approval is committed regardless; only the SAP write failed.
        message =
          `PO ${orderNumber(order)} approved, but SAP did not accept it. ` +
          `The approval stands and can be retried.`;
      } else {
        message = `PO ${orderNumber(order)} approved. SAP will now allow it to be released.`;
      }
      onDone(message);
      onClose();
    } catch (err) {
      setFormError(productionError(err));
    } finally {
      setSaving(false);
    }
  };

  const approve = pending?.approve ?? true;

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(next) => !next && onClose()}>
      {pending && (
        <DialogContent title={approve ? "Approve production order" : "Reject production order"}>
          <DialogHeader className="items-start">
            <div className="min-w-0">
              <DialogTitle>
                {approve ? "Approve" : "Reject"} PO {orderNumber(pending.order)}
              </DialogTitle>
              <DialogDescription>
                {pending.order.item_code} — {pending.order.item_name} ·{" "}
                {fmtQty(pending.order.planned_qty)} pcs at {pending.order.warehouse}
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-3">
            {approve && pending.order.gate_exempt && (
              <div className="rounded-sm border border-line bg-surface p-2.5 text-[12.5px] text-subtle">
                SAP would release this order without an approval, so this
                decision is recorded but not enforced.
              </div>
            )}

            {!approve && (
              <div className="rounded-sm border border-line bg-surface p-2.5 text-[12.5px] text-subtle">
                Rejecting does not cancel the order in SAP — it already exists
                there. It records that OMS will not approve it, so SAP will keep
                refusing to release it. The planner cancels or re-raises it in
                SAP.
              </div>
            )}

            {/* `Field`'s children is a RENDER PROP: it owns the generated id
                and the aria wiring, and hands them back to spread onto the
                control. Passing a plain element throws "children is not a
                function" at render — and only when this dialog opens, which
                is why it survived a typecheck of the page. */}
            <Field
              label={approve ? "Remarks (optional)" : "Reason"}
              error={formError}
              required={!approve}
            >
              {(control) => (
                <Textarea
                  {...control}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder={
                    approve ? "Anything worth recording…" : "Why is this being rejected?"
                  }
                />
              )}
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant={approve ? "primary" : "danger"} onClick={() => void submit()} disabled={saving}>
              {saving ? "Saving…" : approve ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
