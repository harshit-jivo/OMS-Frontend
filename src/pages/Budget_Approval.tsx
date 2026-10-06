/**
 * Budget Approval — decide the SAP expense drafts waiting on you.
 *
 * Someone saves an expense document in SAP (an A/P invoice, an expense
 * payment, a journal voucher…); SAP keeps it as a draft and will not post it
 * until its budget owner approves. OMS takes the draft in, splits it by budget
 * head, and each head's part waits here for its owner.
 *
 * Laid out like Production Approval on purpose — it is the same job:
 *
 *   * `Budget_Approval` opens the page (`routeAccess.ts`); being the stage's
 *     current user today decides whether a row can be acted on, and the server
 *     checks that on every decision. The queue IS the server's list of what
 *     this user may decide.
 *   * Every decision sends the item's `version`: a decision made on a screen
 *     that went stale (someone else moved it) is refused, not applied.
 *   * Rejecting is final for this version of the draft. If its creator changes
 *     the draft in SAP, it comes back for approval on its own.
 *   * The budget itself is deliberately not shown here: the business decided
 *     approvers decide on the document, not on a remaining-budget figure.
 *   * Several can be ticked and approved at once. Each is still decided on its
 *     own on the server (its own version check, its own SAP write), so one
 *     that went stale is refused without holding the others back.
 *   * A notification opens its item here (`?itemId=`), and the draft dialog
 *     carries Approve / Reject for the parts that are yours, plus the draft's
 *     SAP attachments.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiArrowPath,
  HiExclamationCircle,
  HiOutlineCheckCircle,
  HiOutlineEye,
  HiOutlineInbox,
  HiOutlinePaperClip,
  HiOutlineXCircle,
} from "react-icons/hi2";

import { showToast } from "@/lib/toastStore";
import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
import { Button } from "../components/ui/button";
import { DetailFields } from "../components/ui/detail";
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
import { Field, Select, Textarea } from "../components/ui/form";
import { Card, EmptyState, Page, PageHeader } from "../components/ui/page";
import { Pagination } from "../components/ui/pagination";
import { TableSkeleton } from "../components/ui/skeleton";
import { Tab, TabList } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import {
  budgetError,
  budgetService,
  draftLabel,
  routeLabel,
  type BudgetAttachment,
  type BudgetDraftDetail,
  type BudgetItem,
  type BudgetItemStatus,
} from "../services/budgetService";
import { useDeepLinkedItem } from "./budget/useDeepLinkedItem";

type TabKey = "queue" | "decided";
const PAGE_SIZE = 15;

const STATUS_TONE: Record<BudgetItemStatus, "hold" | "ok" | "bad" | "neutral"> = {
  PENDING: "hold",
  APPROVED: "ok",
  REJECTED: "bad",
  GONE: "neutral",
  SUPERSEDED: "neutral",
};

const STAGE_STATE: Record<string, { label: string; tone: "hold" | "ok" | "bad" | "neutral" | "info" }> = {
  CURRENT: { label: "Waiting", tone: "hold" },
  APPROVE: { label: "Approved", tone: "ok" },
  AUTO_APPROVE: { label: "Auto-approved", tone: "ok" },
  REJECT: { label: "Rejected", tone: "bad" },
  UPCOMING: { label: "Upcoming", tone: "neutral" },
};

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const money = (value: string | number) => inr.format(Number(value || 0));

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function BudgetApproval() {
  const [tab, setTab] = useState<TabKey>("queue");
  const [company, setCompany] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<BudgetItem | null>(null);
  const [deciding, setDeciding] = useState<{ item: BudgetItem; approve: boolean } | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(tab === "queue" ? await budgetService.queue() : await budgetService.history());
    } catch (err) {
      setError(budgetError(err));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setPage(1), [tab, company]);

  const filtered = company ? rows.filter((r) => r.company === company) : rows;
  // What can be ticked: only rows the server says are yours to decide, on the
  // queue. Derived, so a reload or a filter change never leaves a stale tick.
  const approvable = useMemo(
    () => (tab === "queue" ? filtered.filter((r) => r.can.approve) : []),
    [filtered, tab],
  );
  const selected = approvable.filter((r) => ticked.has(r.id));
  const toggle = (id: number) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageNumber = Math.min(page, totalPages);
  const shown = filtered.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);

  const shownApprovable = shown.filter((r) => tab === "queue" && r.can.approve);
  const allShownTicked = shownApprovable.length > 0 && shownApprovable.every((r) => ticked.has(r.id));
  const toggleShown = () =>
    setTicked((prev) => {
      const next = new Set(prev);
      for (const r of shownApprovable) {
        if (allShownTicked) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });

  useDeepLinkedItem(rows, !loading, setDetail);

  const retrySap = async (item: BudgetItem) => {
    setRetrying(item.id);
    try {
      showToast({ title: "SAP", message: await budgetService.retrySap(item.id), tone: "ok" });
      void load();
    } catch (err) {
      setError(budgetError(err));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Budget" }, { label: "Budget Approval" }]} />
      <PageHeader
        title="Budget Approval"
        description="Expense drafts in SAP waiting on your budget approval before they can be posted."
        actions={
          <Button variant="ghost" onClick={() => void load()}>
            <HiArrowPath aria-hidden="true" /> Refresh
          </Button>
        }
      />

      <TabList label="Budget approval views">
        <Tab selected={tab === "queue"} onClick={() => setTab("queue")}>
          My queue
        </Tab>
        <Tab selected={tab === "decided"} onClick={() => setTab("decided")}>
          Decided
        </Tab>
      </TabList>

      <FilterBar>
        <Field label="Company">
          {(control) => (
            <Select {...control} value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">All companies</option>
              <option value="OIL">Oil</option>
              <option value="BEVERAGES">Beverages</option>
            </Select>
          )}
        </Field>
        <FilterSpacer />
        {tab === "queue" && selected.length > 0 && (
          <Button variant="success" onClick={() => setBulkOpen(true)}>
            <HiOutlineCheckCircle aria-hidden="true" /> Approve selected ({selected.length})
          </Button>
        )}
        <FilterCount>
          {tab === "queue" ? "Waiting on you" : "Decided by you"}: {loading ? "—" : filtered.length}
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
        <TableSkeleton columns={9} label="Loading budget approvals" />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineInbox}
            title={tab === "queue" ? "Nothing waiting on you" : "You have not decided any yet"}
            hint={
              tab === "queue"
                ? "A draft appears here when its budget head's approval stage names you — or someone you are standing in for."
                : "Nothing matches this filter."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table density="compact" aria-label="Budget approvals">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  {tab === "queue" && (
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-brand"
                        aria-label="Select every approvable row on this page"
                        checked={allShownTicked}
                        disabled={shownApprovable.length === 0}
                        onChange={toggleShown}
                      />
                    </TableHead>
                  )}
                  <TableHead>Document</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead className="min-w-[200px]">Party</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>{tab === "queue" ? "Waiting since" : "Updated"}</TableHead>
                  <TableHead>Raised by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) => (
                  <TableRow key={row.id}>
                    {tab === "queue" && (
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-4 cursor-pointer accent-brand"
                          aria-label={`Select ${draftLabel(row.draft)} · ${routeLabel(row)}`}
                          checked={ticked.has(row.id)}
                          disabled={!row.can.approve}
                          onChange={() => toggle(row.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap font-semibold text-brand">{draftLabel(row.draft)}</TableCell>
                    <TableCell>{row.company}</TableCell>
                    <TableCell className="whitespace-nowrap">{routeLabel(row)}</TableCell>
                    <TableCell>{row.draft.card_name || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.amount)}</TableCell>
                    <TableCell className="whitespace-nowrap">{when(row.waiting_since || row.draft.created_at)}</TableCell>
                    <TableCell>{row.draft.sap_created_by || "—"}</TableCell>
                    <TableCell>
                      <Badge tone={STATUS_TONE[row.status]}>{row.status_label}</Badge>
                      {row.status === "PENDING" && row.current_stage ? (
                        <span className="block text-[11px] text-subtle">At {row.current_stage}</span>
                      ) : null}
                      {row.sap_status === "FAILED" ? (
                        <span className="block text-[11px] text-bad">SAP write failed</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDetail(row)}
                          aria-label={`View ${draftLabel(row.draft)}`}
                          title="View draft"
                        >
                          <HiOutlineEye aria-hidden="true" />
                        </Button>
                        {tab === "queue" && row.can.approve && (
                          <>
                            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
                            <Button size="sm" variant="success" onClick={() => setDeciding({ item: row, approve: true })}>
                              <HiOutlineCheckCircle aria-hidden="true" /> Approve
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setDeciding({ item: row, approve: false })}>
                              <HiOutlineXCircle aria-hidden="true" /> Reject
                            </Button>
                          </>
                        )}
                        {row.can.retry_sap && (
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
          summary={`Showing ${(pageNumber - 1) * PAGE_SIZE + 1}–${Math.min(pageNumber * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
        />
      )}

      <DraftDialog
        item={detail}
        onClose={() => setDetail(null)}
        onDecide={(item, approve) => {
          setDetail(null);
          setDeciding({ item, approve });
        }}
      />
      <BulkApproveDialog
        open={bulkOpen}
        items={selected}
        onClose={() => setBulkOpen(false)}
        onDone={(message, refused) => {
          showToast({ title: "Approved", message, tone: refused ? "bad" : "ok" });
          setTicked(new Set());
          void load();
        }}
      />
      <DecisionDialog
        pending={deciding}
        onClose={() => setDeciding(null)}
        onDone={(message, approved) => {
          showToast({ title: approved ? "Approved" : "Rejected", message, tone: approved ? "ok" : "bad" });
          void load();
        }}
      />
    </Page>
  );
}

/* ================================================================== *
 * The draft: its lines, and each budget head's stages and history
 * ================================================================== */

export function DraftDialog({
  item,
  onClose,
  onDecide,
}: {
  item: BudgetItem | null;
  onClose: () => void;
  /** Given on the approval desk: Approve / Reject for the parts that are yours. */
  onDecide?: (item: BudgetItem, approve: boolean) => void;
}) {
  // The answer is kept with the draft id it belongs to, and shown only while
  // that draft is the one open — so switching drafts needs no reset in the
  // effect (a set-state-in-effect), and a slow answer for the previous draft
  // can never land on the next one.
  const [loaded, setLoaded] = useState<{ id: number; draft?: BudgetDraftDetail; error?: string } | null>(null);
  const draftId = item?.draft.id;

  useEffect(() => {
    if (draftId === undefined) return;
    budgetService.draft(draftId).then(
      (detail) => setLoaded({ id: draftId, draft: detail }),
      (err) => setLoaded({ id: draftId, error: budgetError(err) }),
    );
  }, [draftId]);

  const current = loaded && loaded.id === draftId ? loaded : null;
  const draft = current?.draft ?? null;
  const error = current?.error ?? "";

  return (
    <Dialog open={Boolean(item)} onOpenChange={(next) => !next && onClose()}>
      {item && (
        <DialogContent title={draftLabel(item.draft)} className="max-w-4xl">
          <DialogHeader className="items-start">
            <div className="min-w-0">
              <DialogTitle>
                {item.company} · {draftLabel(item.draft)}
              </DialogTitle>
              <DialogDescription>
                {item.draft.card_name || "No party"} · raised in SAP by {item.draft.sap_created_by || "—"}
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && <p className="m-0 text-[13px] text-bad" role="alert">{error}</p>}
            {!draft && !error && <p className="m-0 text-[13px] text-subtle">Loading…</p>}
            {draft && (
              <>
                <DetailFields
                  items={[
                    ["Document date", draft.doc_date || "—"],
                    ["Draft", `${draft.draft_entry}`],
                    ["Taken in", when(draft.created_at)],
                    ["Comments", draft.comments || "—"],
                  ]}
                />
                <DraftAttachments draftId={draft.id} />
                {draft.items.map((part) => (
                  <section key={part.id} className="rounded-card border border-line p-3" aria-label={routeLabel(part)}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="m-0 text-[14px] font-semibold text-ink">{routeLabel(part)}</h3>
                      <Badge tone={STATUS_TONE[part.status]}>{part.status_label}</Badge>
                      <span className="text-[13px] tabular-nums text-subtle">{money(part.amount)}</span>
                      {part.sap_status ? (
                        <span className={`text-[11.5px] ${part.sap_status === "FAILED" ? "text-bad" : "text-subtle"}`}>
                          SAP: {part.sap_status_text}
                        </span>
                      ) : null}
                      {onDecide && part.can.approve && (
                        <span className="ml-auto flex gap-1">
                          <Button size="sm" variant="success" onClick={() => onDecide(part, true)}>
                            <HiOutlineCheckCircle aria-hidden="true" /> Approve
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => onDecide(part, false)}>
                            <HiOutlineXCircle aria-hidden="true" /> Reject
                          </Button>
                        </span>
                      )}
                    </div>

                    <ol className="m-0 mb-3 flex list-none flex-wrap gap-2 p-0" aria-label="Stages">
                      {(part.stages ?? []).map((stage) => {
                        const state = STAGE_STATE[stage.state] ?? { label: stage.state, tone: "neutral" as const };
                        return (
                          <li key={stage.stage_id} className="rounded-sm border border-line px-2 py-1 text-[12px]">
                            <span className="font-medium text-ink">{stage.name}</span> · {stage.user_name || "—"}{" "}
                            <Badge tone={state.tone}>{state.label}</Badge>
                          </li>
                        );
                      })}
                    </ol>

                    <Table density="compact" aria-label={`Lines of ${routeLabel(part)}`}>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Line</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead>Sub budget</TableHead>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {part.lines.map((ln) => (
                          <TableRow key={ln.line_num}>
                            <TableCell>{ln.line_num}</TableCell>
                            <TableCell>
                              {ln.acct_name || ln.acct_code}
                              <span className="block text-[11px] text-subtle">{ln.acct_code}</span>
                            </TableCell>
                            <TableCell>{ln.sub_budget_code || "—"}</TableCell>
                            <TableCell>{ln.effect_month || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(ln.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {(part.logs ?? []).length > 0 && (
                      <ul className="m-0 mt-3 list-none space-y-1 p-0 text-[12px]" aria-label="History">
                        {(part.logs ?? []).map((log, i) => (
                          <li key={i}>
                            <span className="text-subtle">{when(log.at)}</span> · <strong>{log.label}</strong>
                            {log.actor ? ` by ${log.actor.name}` : ""}
                            {log.stage ? ` at ${log.stage}` : ""}
                            {log.remarks ? ` — ${log.remarks}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
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
  pending: { item: BudgetItem; approve: boolean } | null;
  onClose: () => void;
  onDone: (message: string, approved: boolean) => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setRemarks("");
    setFormError("");
  }, [pending]);

  const approve = pending?.approve ?? true;

  const submit = async () => {
    if (!pending) return;
    if (!approve && !remarks.trim()) {
      setFormError("Say why, when rejecting.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const { item } = pending;
      const version = item.version;
      const result = approve
        ? await budgetService.approve(item.id, remarks.trim(), version)
        : await budgetService.reject(item.id, remarks.trim(), version);
      onDone(result.message || (approve ? "Approved." : "Rejected."), approve);
      onClose();
    } catch (err) {
      setFormError(budgetError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(next) => !next && onClose()}>
      {pending && (
        <DialogContent title={approve ? "Approve budget" : "Reject budget"}>
          <DialogHeader className="items-start">
            <div className="min-w-0">
              <DialogTitle>
                {approve ? "Approve" : "Reject"} {routeLabel(pending.item)} · {draftLabel(pending.item.draft)}
              </DialogTitle>
              <DialogDescription>
                {pending.item.draft.card_name || "No party"} · {money(pending.item.amount)} ·{" "}
                {pending.item.lines.length} line{pending.item.lines.length === 1 ? "" : "s"}
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {!approve && (
              <div className="rounded-sm border border-line bg-surface p-2.5 text-[12.5px] text-subtle">
                Rejecting does not delete the draft in SAP. SAP keeps refusing to post these lines; if the creator
                changes the draft in SAP, it comes back here for approval.
              </div>
            )}
            <Field label={approve ? "Remarks (optional)" : "Reason"} error={formError} required={!approve}>
              {(control) => (
                <Textarea
                  {...control}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder={approve ? "Anything worth recording…" : "Why is this being rejected?"}
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

/* ================================================================== *
 * The draft's attachments in SAP
 * ================================================================== */

/**
 * Open a file the API serves in a new tab. The request needs the login, so a
 * plain link cannot fetch it: the tab is opened SYNCHRONOUSLY (a browser only
 * allows `window.open` while it can tie it to the click), then pointed at the
 * blob. Blocked anyway, the file downloads instead.
 */
async function openFile(fetcher: () => Promise<Blob>, fileName: string): Promise<string> {
  const tab = window.open("", "_blank");
  let blob: Blob;
  try {
    blob = await fetcher();
  } catch (err) {
    tab?.close();
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    if (data instanceof Blob) {
      try {
        const parsed = JSON.parse(await data.text()) as { message?: string };
        if (parsed.message) return parsed.message;
      } catch {
        // Not JSON: the generic message below.
      }
    }
    return "Could not open the attachment.";
  }
  const url = URL.createObjectURL(blob);
  if (tab && !tab.closed) {
    tab.location.href = url;
    return "";
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return "";
}

export function DraftAttachments({ draftId }: { draftId: number }) {
  const [loaded, setLoaded] = useState<{ id: number; rows?: BudgetAttachment[]; error?: string } | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [openError, setOpenError] = useState("");

  useEffect(() => {
    budgetService.attachments(draftId).then(
      (rows) => setLoaded({ id: draftId, rows }),
      (err) => setLoaded({ id: draftId, error: budgetError(err) }),
    );
  }, [draftId]);

  const current = loaded && loaded.id === draftId ? loaded : null;

  const open = async (row: BudgetAttachment) => {
    setOpening(row.line);
    setOpenError("");
    setOpenError(await openFile(() => budgetService.attachmentFile(draftId, row.line), row.file_name));
    setOpening(null);
  };

  return (
    <section aria-label="Attachments" className="rounded-card border border-line p-3">
      <h3 className="m-0 mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <HiOutlinePaperClip aria-hidden="true" /> Attachments in SAP
      </h3>
      {!current && <p className="m-0 text-[12.5px] text-subtle">Loading…</p>}
      {current?.error && <p className="m-0 text-[12.5px] text-bad" role="alert">{current.error}</p>}
      {current?.rows && current.rows.length === 0 && (
        <p className="m-0 text-[12.5px] text-subtle">This draft has no attachment in SAP.</p>
      )}
      {current?.rows && current.rows.length > 0 && (
        <ul className="m-0 list-none space-y-1 p-0">
          {current.rows.map((row) => (
            <li key={row.line}>
              <button
                type="button"
                className="cursor-pointer text-left text-[13px] text-brand underline-offset-2 hover:underline disabled:opacity-60"
                disabled={opening === row.line}
                onClick={() => void open(row)}
              >
                {row.file_name}
              </button>
              {row.date ? <span className="ml-2 text-[11.5px] text-subtle">{row.date}</span> : null}
              {opening === row.line ? <span className="ml-2 text-[11.5px] text-subtle">Opening…</span> : null}
            </li>
          ))}
        </ul>
      )}
      {openError && <p className="m-0 mt-1 text-[12.5px] text-bad" role="alert">{openError}</p>}
    </section>
  );
}

/* ================================================================== *
 * Approve several at once
 * ================================================================== */

function BulkApproveDialog({
  open,
  items,
  onClose,
  onDone,
}: {
  open: boolean;
  items: BudgetItem[];
  onClose: () => void;
  onDone: (message: string, refused: number) => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");

  const total = items.reduce((sum, i) => sum + Number(i.amount || 0), 0);

  const close = () => {
    setRemarks("");
    setProblem("");
    onClose();
  };

  const submit = async () => {
    setSaving(true);
    setProblem("");
    try {
      const outcome = await budgetService.approveBulk(
        items.map((i) => ({ id: i.id, version: i.version })),
        remarks.trim(),
      );
      const refused = outcome.results.filter((r) => !r.ok);
      if (refused.length > 0) {
        // Keep the dialog open on what was refused, so it can be read and dealt with.
        const byId = new Map(items.map((i) => [i.id, i]));
        setProblem(
          refused
            .map((r) => {
              const it = byId.get(Number(r.id));
              return `${it ? `${draftLabel(it.draft)} · ${routeLabel(it)}` : `Item ${r.id}`}: ${r.message}`;
            })
            .join("\n"),
        );
        onDone(outcome.message, refused.length);
        return;
      }
      onDone(outcome.message, 0);
      close();
    } catch (err) {
      setProblem(budgetError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {open && (
        <DialogContent title="Approve selected">
          <DialogHeader className="items-start">
            <div className="min-w-0">
              <DialogTitle>
                Approve {items.length} item{items.length === 1 ? "" : "s"}
              </DialogTitle>
              <DialogDescription>{money(total)} in all. Each is decided on its own.</DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <ul className="m-0 max-h-48 list-none space-y-0.5 overflow-y-auto p-0 text-[12.5px]">
              {items.map((i) => (
                <li key={i.id}>
                  {draftLabel(i.draft)} · {routeLabel(i)} · {i.draft.card_name || "No party"} ·{" "}
                  <span className="tabular-nums">{money(i.amount)}</span>
                </li>
              ))}
            </ul>
            <Field label="Remarks (optional)">
              {(control) => (
                <Textarea
                  {...control}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="Recorded on every item approved"
                />
              )}
            </Field>
            {problem && (
              <p className="m-0 whitespace-pre-line text-[12.5px] text-bad" role="alert">
                {problem}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={close} disabled={saving}>
              {problem ? "Close" : "Cancel"}
            </Button>
            {!problem && (
              <Button variant="primary" onClick={() => void submit()} disabled={saving || items.length === 0}>
                {saving ? "Approving…" : `Approve ${items.length}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
