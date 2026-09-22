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
 *
 * LAID OUT LIKE THE APPROVER QUEUE, DELIBERATELY
 * Breadcrumbs, a labelled filter bar, icon buttons for the passive actions and
 * a filled Approve / Reject pair for the decision — the same furniture as
 * `Rate_Approver_Order`, because this is the same job. An approver who works
 * both queues should not have to learn two screens.
 *
 * There is no KPI row. One `Stat` card holding one number ("Waiting on you")
 * took the full width of the page to say something the filter bar's count says
 * in four characters, so the count moved there.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiArrowPath,
  HiExclamationCircle,
  HiOutlineCheckCircle,
  HiOutlineEye,
  HiOutlineInbox,
  HiOutlineXCircle,
  HiOutlineXMark,
} from "react-icons/hi2";

import { showToast } from "@/lib/toastStore";
import type { ToastTone } from "@/lib/toastStore";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
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
import { FilterBar, FilterCount, FilterSpacer } from "../components/ui/filter-bar";
import { Field, Textarea } from "../components/ui/form";
import { Card, EmptyState, Page, PageHeader } from "../components/ui/page";
import { Pagination } from "../components/ui/pagination";
import { TableSkeleton } from "../components/ui/skeleton";
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
import { OrderDetailDialog } from "./Production_Orders";
import { fmtDateTime, fmtQty, orderNumber } from "./production/format";
import {
  CompanyFilterSelect,
  ItemCell,
  PlannedCell,
  StatusCell,
  StatusFilterSelect,
  type CompanyFilter,
  type StatusFilter,
} from "./production/shared";

type TabKey = "queue" | "decided";

const PAGE_SIZE = 10;

export default function ProductionApproval() {
  const [tab, setTab] = useState<TabKey>("queue");
  const [company, setCompany] = useState<CompanyFilter>("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          ? // The queue endpoint takes no status: everything in it is PENDING
            // by definition, because it is the set of orders whose workflow
            // stage currently names this user. The filter still applies below,
            // client-side, so picking "Rejected" here correctly shows nothing
            // rather than quietly ignoring the choice.
            await productionService.approvalQueue({ company: company || undefined })
          : await productionService.approvalHistory({
              company: company || undefined,
              status: status || undefined,
            });
      setRows(data);
    } catch (err) {
      setError(productionError(err));
    } finally {
      setLoading(false);
    }
  }, [tab, company, status]);

  useEffect(() => {
    void load();
  }, [load]);

  // Page 3 of the queue is not page 3 of the decided list, and landing past
  // the end of a shorter one shows an empty table that reads as "nothing here".
  useEffect(() => setPage(1), [tab, company, status]);

  const filtered = useMemo(
    () => (status ? rows.filter((r) => r.flow?.status === status) : rows),
    [rows, status],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageNumber = Math.min(page, totalPages);
  const paginated = filtered.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);

  /**
   * Confirm a decision in the corner rather than in the page.
   *
   * It was an in-page card above the table, which meant the confirmation for
   * an action taken in a dialog appeared behind that dialog and was scrolled
   * away by the time the list reloaded. It was also styled `bg-good/5
   * text-good` — and there is no `--color-good` token, so the "green" card had
   * never been green.
   *
   * `tone` is what makes approve and reject tell themselves apart at a glance:
   * the two buttons are a centimetre apart and the only other difference is a
   * sentence on a toast that dismisses itself in six seconds.
   */
  const flash = (message: string, tone: ToastTone = "ok") =>
    showToast({ title: tone === "ok" ? "Approved" : "Rejected", message, tone });

  const retrySap = async (order: ProductionOrder) => {
    setRetrying(order.id);
    try {
      await productionService.retrySap(order.id);
      flash(`SAP accepted the approval for PO ${orderNumber(order)}.`, "ok");
      void load();
    } catch (err) {
      setError(productionError(err));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Production" }, { label: "Production Approval" }]} />

      <PageHeader
        title="Production Approval"
        description="Orders SAP has planned and is waiting on you to release."
        actions={
          <Button variant="ghost" onClick={() => void load()}>
            <HiArrowPath aria-hidden="true" /> Refresh
          </Button>
        }
      />

      <TabList label="Production approval views">
        <Tab selected={tab === "queue"} onClick={() => setTab("queue")}>
          My queue
        </Tab>
        <Tab selected={tab === "decided"} onClick={() => setTab("decided")}>
          Decided
        </Tab>
      </TabList>

      <FilterBar>
        <CompanyFilterSelect value={company} onChange={setCompany} />
        <StatusFilterSelect value={status} onChange={setStatus} />
        {(company || status) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCompany("");
              setStatus("");
            }}
          >
            <HiOutlineXMark aria-hidden="true" /> Clear
          </Button>
        )}
        <FilterSpacer />
        {/* Where the "Waiting on you" card went. Same number, one line. */}
        <FilterCount>
          {tab === "queue" ? "Waiting on you" : "Decided by you"}:{" "}
          {loading ? "—" : filtered.length}
        </FilterCount>
      </FilterBar>

      {error && (
        <Card className="border-bad/40 bg-bad/5">
          <div className="flex items-start gap-2 p-3 text-[13px] text-bad" role="alert">
            <HiExclamationCircle className="mt-0.5 shrink-0" aria-hidden />
            <span className="whitespace-pre-line">{error}</span>
          </div>
        </Card>
      )}

      {loading ? (
        <TableSkeleton columns={9} label="Loading production orders" />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineInbox}
            title={tab === "queue" ? "Nothing waiting on you" : "You have not decided any yet"}
            hint={
              tab === "queue"
                ? "Orders appear here only when a workflow stage names you — or names someone you are standing in for."
                : "Nothing matches these filters."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead>PO</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="min-w-[240px]">Item</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  {/* Was "Due". The date an approver wants is how long this has
                      been sitting in front of them, not when SAP wants it
                      finished — the due date is still on the detail dialog. */}
                  <TableHead>Created</TableHead>
                  <TableHead>Raised by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-semibold text-brand">
                      {orderNumber(row)}
                    </TableCell>
                    <TableCell>{row.company}</TableCell>
                    <ItemCell order={row} />
                    <TableCell>{row.warehouse || "—"}</TableCell>
                    <PlannedCell order={row} />
                    <TableCell className="whitespace-nowrap">
                      {fmtDateTime(row.created_at)}
                    </TableCell>
                    <TableCell>{row.sap_created_by || "—"}</TableCell>
                    <StatusCell order={row} />
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDetail(row)}
                          aria-label={`View production order ${orderNumber(row)}`}
                          title="View order"
                        >
                          <HiOutlineEye aria-hidden="true" />
                        </Button>
                        {/* Only ever shown in the queue: that list IS the set the
                            server says this user may act on, so there is no
                            second permission check to duplicate here. */}
                        {tab === "queue" && row.flow?.current_stage && (
                          <>
                            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
                            <Button
                              size="sm"
                              variant="success"
                              onClick={() => setDeciding({ order: row, approve: true })}
                            >
                              <HiOutlineCheckCircle aria-hidden="true" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setDeciding({ order: row, approve: false })}
                            >
                              <HiOutlineXCircle aria-hidden="true" /> Reject
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
        </Card>
      )}

      {filtered.length > PAGE_SIZE && (
        <Pagination
          page={pageNumber}
          totalPages={totalPages}
          onPageChange={setPage}
          summary={`Showing ${(pageNumber - 1) * PAGE_SIZE + 1}–${Math.min(
            pageNumber * PAGE_SIZE,
            filtered.length,
          )} of ${filtered.length}`}
        />
      )}

      <OrderDetailDialog order={detail} onClose={() => setDetail(null)} />

      <DecisionDialog
        pending={deciding}
        onClose={() => setDeciding(null)}
        onDone={(message, tone) => {
          flash(message, tone);
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
  onDone: (message: string, tone: ToastTone) => void;
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
      onDone(message, approve ? "ok" : "bad");
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
