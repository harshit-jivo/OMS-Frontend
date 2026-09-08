/**
 * The invoice register — every tracker invoice and where it is now.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineArrowDownTray,
  HiOutlineClock,
  HiOutlineFunnel,
  HiOutlineMapPin,
  HiOutlineTrash,
} from "react-icons/hi2";
import { saveAs } from "file-saver";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FilterActions,
  FilterBar,
  FilterDate,
  FilterSearch,
  FilterSelect,
} from "@/components/ui/filter-bar";
import { Card, Page, PageHeader, Stat, StatRow } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDate, fmtMonth, money } from "@/components/tracker/format";
import InvoiceTimelineDialog from "@/components/tracker/InvoiceTimelineDialog";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { cn } from "@/lib/utils";
import trackerService from "../services/trackerService";
import type { AllInvoiceFilters, Invoice } from "../services/trackerService";

// A tracker admin may delete an invoice up to this stage order (inclusive).
const DELETE_MAX_ORDER = 5;

const EMPTY: AllInvoiceFilters = {};

const COLUMNS = 12;

export default function Tracker_Invoices() {
  const queryClient = useQueryClient();

  /*
   * `filters` is the DRAFT the form edits; `applied` is what the table is
   * showing. The old code kept only one and passed it to `load()` on Apply,
   * which meant the request and the inputs could not disagree — and also that
   * nothing could re-run the current search without re-reading the form. As a
   * query key, `applied` gives both: Apply is a `setState`, and going back to
   * a previous filter set is a cache hit rather than a round trip.
   */
  const [filters, setFilters] = useState<AllInvoiceFilters>({ ...EMPTY });
  const [applied, setApplied] = useState<AllInvoiceFilters>({ ...EMPTY });
  const [exporting, setExporting] = useState(false);
  const [timelineInv, setTimelineInv] = useState<Invoice | null>(null);
  const [delInv, setDelInv] = useState<Invoice | null>(null);

  const { data: lookups = null } = useQuery({
    queryKey: ["tracker", "lookups"],
    queryFn: () => trackerService.getLookups(),
    // Stages and dropdown values change when an admin edits them, which is
    // rare and never mid-session for the person reading this page.
    staleTime: 5 * 60_000,
  });

  const { data: rows = [], isPending } = useQuery({
    queryKey: ["tracker", "all-invoices", applied],
    queryFn: () => trackerService.adminAllInvoices(applied),
  });

  const load = (next: AllInvoiceFilters = filters) => setApplied(next);

  // Stage order for an invoice (from lookups); used to gate the delete button.
  const stageOrder = (inv: Invoice) =>
    lookups?.stages.find((s) => s.code === inv.current_stage_code)?.order ?? 99;
  const canDelete = (inv: Invoice) => stageOrder(inv) <= DELETE_MAX_ORDER;

  /*
   * Delete as a mutation rather than an async handler.
   *
   * The difference that matters is the last line: invalidating the key
   * refreshes whatever list is on screen, including a filtered one. The old
   * `load()` re-ran with the CURRENT form state, so deleting a row after
   * editing a filter without pressing Apply silently changed the table
   * underneath the user.
   */
  const del = useMutation({
    mutationFn: (invoice: Invoice) => trackerService.deleteInvoice(invoice.id),
    onSuccess: (_data, invoice) => {
      showToast({
        title: "Invoice deleted",
        message: `${invoice.invoice_number} is out of the tracker.`,
      });
      setDelInv(null);
      void queryClient.invalidateQueries({ queryKey: ["tracker", "all-invoices"] });
    },
    onError: (error: unknown) =>
      showToast({
        title: "Could not delete the invoice",
        message: messageFrom(error, "The server refused the request."),
      }),
  });
  const deleting = del.isPending;

  const setF = (k: keyof AllInvoiceFilters, v: string | number) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));

  const openTimeline = async (id: number) => {
    try {
      setTimelineInv(await trackerService.getInvoice(id));
    } catch {
      /* ignore */
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const blob = await trackerService.exportAllInvoices(filters);
      saveAs(blob, "invoice-register.xlsx");
    } catch (error) {
      showToast({
        title: "Export failed",
        message: messageFrom(error, "The server refused the request."),
      });
    } finally {
      setExporting(false);
    }
  };

  const counts = {
    total: rows.length,
    completed: rows.filter((r) => r.status === "COMPLETED").length,
    overdue: rows.filter((r) => r.is_overdue && r.status !== "COMPLETED").length,
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Tracker" }, { label: "All Invoices" }]} />

      <PageHeader
        title="All Invoices"
        description="Every invoice and its current stage. Completed ones are faded; overdue ones are flagged."
        actions={
          <Button onClick={() => void exportExcel()} disabled={exporting}>
            <HiOutlineArrowDownTray aria-hidden="true" />{" "}
            {exporting ? "Exporting…" : "Export Excel"}
          </Button>
        }
      />

      <StatRow>
        <Stat label="Invoices" value={counts.total} loading={isPending} />
        <Stat label="Completed" value={counts.completed} tone="ok" loading={isPending} />
        <Stat
          label="Overdue"
          value={counts.overdue}
          tone={counts.overdue ? "bad" : "neutral"}
          loading={isPending}
        />
      </StatRow>

      <FilterBar>
        <FilterSearch
          label="Party"
          value={filters.party || ""}
          onChange={(e) => setF("party", e.target.value)}
          placeholder="Party name"
        />
        <FilterSearch
          label="Invoice no."
          value={filters.invoice_number || ""}
          onChange={(e) => setF("invoice_number", e.target.value)}
          placeholder="Invoice #"
        />
        <FilterDate
          label="Effective month"
          type="month"
          value={filters.effective_month || ""}
          onChange={(e) => setF("effective_month", e.target.value)}
        />
        <FilterSelect
          label="Stage"
          value={filters.stage || ""}
          onChange={(e) => setF("stage", e.target.value)}
        >
          <option value="">All stages</option>
          {lookups?.stages.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Completion"
          value={filters.status || ""}
          onChange={(e) => setF("status", e.target.value)}
        >
          <option value="">Any</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="COMPLETED">Completed</option>
        </FilterSelect>
        <FilterSelect
          label="Threshold"
          value={filters.overdue || ""}
          onChange={(e) => setF("overdue", e.target.value)}
        >
          <option value="">Any</option>
          <option value="true">Overdue only</option>
          <option value="false">Within threshold</option>
        </FilterSelect>
        <FilterSelect
          label="Category"
          value={filters.category || ""}
          onChange={(e) => setF("category", Number(e.target.value))}
        >
          <option value="">All</option>
          {lookups?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Unit"
          value={filters.unit || ""}
          onChange={(e) => setF("unit", Number(e.target.value))}
        >
          <option value="">All</option>
          {lookups?.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Branch"
          value={filters.branch || ""}
          onChange={(e) => setF("branch", Number(e.target.value))}
        >
          <option value="">All</option>
          {lookups?.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </FilterSelect>
        <FilterActions>
          <Button variant="primary" onClick={() => load()}>
            <HiOutlineFunnel aria-hidden="true" /> Apply
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setFilters({ ...EMPTY });
              load({});
            }}
          >
            Reset
          </Button>
        </FilterActions>
      </FilterBar>

      <Card className="overflow-hidden p-0">
        {isPending ? (
          <TableSkeleton rows={6} columns={COLUMNS} />
        ) : (
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No.</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Inv. date</TableHead>
                  <TableHead>Eff. month</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>GST</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit / branch</TableHead>
                  <TableHead>Current stage</TableHead>
                  <TableHead>Days here</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableEmpty colSpan={COLUMNS}>No invoices match these filters.</TableEmpty>
                ) : (
                  rows.map((inv) => {
                    const completed = inv.status === "COMPLETED";
                    const overdue = inv.is_overdue && !completed;
                    return (
                      <TableRow key={inv.id} className={cn(completed && "opacity-60")}>
                        <TableCell className="whitespace-nowrap font-medium text-ink">
                          {inv.invoice_number}
                        </TableCell>
                        <TableCell>{inv.party_name}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {fmtDate(inv.invoice_date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {fmtMonth(inv.effective_month)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          ₹{money(inv.invoice_value)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {inv.gst_type_name} {inv.gst_rate_label}
                        </TableCell>
                        <TableCell>{inv.category_name}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {inv.unit_name} / {inv.branch_name}
                        </TableCell>
                        <TableCell>
                          <Badge tone="info" outlined>
                            {inv.current_stage_name}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge outlined tone={overdue ? "bad" : "neutral"}>
                            <HiOutlineClock aria-hidden="true" className="size-3" />{" "}
                            {inv.days_at_stage}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge tone={completed ? "ok" : "hold"} outlined>
                            {completed ? "Completed" : "In progress"}
                          </Badge>
                        </TableCell>
                        <TableCell className="w-px">
                          <div className="flex flex-nowrap justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => void openTimeline(inv.id)}
                            >
                              <HiOutlineMapPin aria-hidden="true" /> Track
                            </Button>
                            {canDelete(inv) && (
                              <Button
                                variant="danger"
                                size="xs"
                                title="Delete invoice (allowed up to stage 5)"
                                onClick={() => setDelInv(inv)}
                              >
                                <HiOutlineTrash aria-hidden="true" /> Delete
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <InvoiceTimelineDialog invoice={timelineInv} onClose={() => setTimelineInv(null)} />

      {/* Delete confirmation (tracker admin, up to stage 5) */}
      <Dialog
        open={Boolean(delInv)}
        onOpenChange={(next) => {
          if (!next && !deleting) setDelInv(null);
        }}
      >
        {delInv && (
          <DialogContent title="Delete invoice" size="sm">
            <DialogHeader>
              <DialogTitle>Delete {delInv.invoice_number}?</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-2 text-[13px] text-body">
              <p className="m-0">
                <strong className="font-semibold text-ink">{delInv.party_name}</strong> · ₹
                {money(delInv.invoice_value)}
              </p>
              <p className="m-0">
                Currently at <strong className="font-semibold text-ink">
                  {delInv.current_stage_name}
                </strong>
                . It will be removed from the tracker — a soft delete, so the record is kept but
                hidden.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button disabled={deleting} onClick={() => setDelInv(null)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={deleting} onClick={() => del.mutate(delInv)}>
                <HiOutlineTrash aria-hidden="true" /> {deleting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
