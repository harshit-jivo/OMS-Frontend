/**
 * Re-reading the warehouse and allocating an invoice's batches again.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE FAILURE THIS ANSWERS
 * ─────────────────────────────────────────────────────────────────────────
 * An invoice picks its batches when it is BUILT and posts when it is
 * approved, and those can be days apart. In between, the stock it chose can
 * be sold, moved or written off by someone else. SAP then refuses the post —
 * "batch not found", "quantity falls into negative inventory" — and a plain
 * Retry sends the same dead batch numbers straight back, which fails again
 * for the same reason, forever.
 *
 * The fix is not to retry but to ask the warehouse what is there NOW and
 * allocate again over that. The allocator itself is the wizard's, unchanged
 * (`SalesInvoice/batchAllocation.ts`) — this module is the part that knows
 * where to read stock from and how to rebuild the payload around the answer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES NOT TOUCH
 * ─────────────────────────────────────────────────────────────────────────
 * Quantities, prices, the customer, the lines themselves. Only
 * `BatchNumbers` is rewritten, and only for lines that have a quantity to
 * fill. The invoice stays the invoice that was approved; what changes is
 * which physical stock it draws on.
 *
 * A line whose warehouse is unknown is left exactly as it was rather than
 * guessed at — there is no safe default for "which warehouse", and shipping
 * from the wrong one is worse than failing the post again.
 */
import {
  allocateNearestExpiryBatches,
  getAllocationQuantity,
  hasEnoughAllocation,
  holdBatches,
  toSapBatchNumbers,
  type BatchDetail,
} from "../SalesInvoice/batchAllocation";
import { toNumber } from "../SalesInvoice/salesInvoice.utils";
import { apiFetch, reservedBatchKey, withBranch } from "../SalesInvoice/useSalesInvoice";

import { parsePayload, trimmed } from "./helpers";
import type { InvoiceLine, InvoicePayload, InvoiceRecord } from "./types";

/** What happened to one line. */
export type LineOutcome = {
  itemCode: string;
  warehouse: string;
  required: number;
  allocated: number;
  /**
   * `filled`    the line's whole quantity found fresh batches
   * `short`     some stock, but not enough
   * `none`      the warehouse holds nothing usable for this item
   * `skipped`   no quantity, or no warehouse to read — left untouched
   * `failed`    the stock lookup itself errored
   */
  status: "filled" | "short" | "none" | "skipped" | "failed";
};

export type Reallocation = {
  /** The payload with fresh `BatchNumbers`, ready to post. */
  payload: InvoicePayload;
  lines: LineOutcome[];
  /** True when every line that needed batches got its full quantity. */
  ok: boolean;
  /** True when at least one line's batches actually changed. */
  changed: boolean;
  /** Reviewer-facing account of what could not be filled. "" when `ok`. */
  problem: string;
};

type ReservedBatch = {
  item_code?: string;
  warehouse_code?: string;
  batch_number?: string;
  quantity?: number | string;
};

const batchesOf = (payload: InvoicePayload): InvoiceLine[] =>
  Array.isArray(payload.DocumentLines) ? payload.DocumentLines : [];

/** The same batch list, compared by number and quantity, to spot a no-op. */
const batchFingerprint = (line: InvoiceLine) =>
  (line.BatchNumbers || [])
    .map((batch) => `${trimmed(batch.BatchNumber)}:${toNumber(batch.Quantity)}`)
    .sort()
    .join("|");

/**
 * Holds on stock from OTHER in-flight invoices.
 *
 * `exclude_log` is this record's own id, and it matters: a failed invoice sits
 * in ERROR, which the endpoint counts as a holding status, so without it the
 * invoice would find its own pieces reserved — by itself — and report a
 * shortage that does not exist.
 *
 * Best effort. If this cannot be read the allocation still runs, over gross
 * stock rather than free stock, which is what the app did before these holds
 * were tracked at all.
 */
const loadReserved = async (
  branch: string,
  logId: InvoiceRecord["id"],
): Promise<Map<string, number>> => {
  const reserved = new Map<string, number>();
  if (!branch) return reserved;
  try {
    const query = `/api/invoice/reserved-batches/?branch=${encodeURIComponent(branch)}${
      logId === undefined || logId === null ? "" : `&exclude_log=${encodeURIComponent(String(logId))}`
    }`;
    const response = await apiFetch<{ data?: ReservedBatch[] }>(query);
    (Array.isArray(response?.data) ? response.data : []).forEach((entry) => {
      reserved.set(
        reservedBatchKey(entry.item_code, entry.warehouse_code, entry.batch_number),
        toNumber(entry.quantity),
      );
    });
  } catch (error) {
    console.error("Unable to load reserved batches for re-allocation", error);
  }
  return reserved;
};

/** What HANA currently holds for one item in one warehouse. */
const loadBatches = async (
  branch: string,
  itemCode: string,
  whsCode: string,
): Promise<BatchDetail[]> => {
  const url = withBranch(
    `/api/hana/batch-details/?item_code=${encodeURIComponent(itemCode)}&whs_code=${encodeURIComponent(whsCode)}`,
    branch,
  );
  const response = await apiFetch<BatchDetail[] | { data?: BatchDetail[] }>(url);
  if (Array.isArray(response)) return response;
  return Array.isArray(response?.data) ? response.data : [];
};

const describe = (outcome: LineOutcome) => {
  const name = outcome.itemCode || "an item";
  if (outcome.status === "none") return `${name}: no stock in ${outcome.warehouse}`;
  if (outcome.status === "short") {
    return `${name}: only ${outcome.allocated} of ${outcome.required} available in ${outcome.warehouse}`;
  }
  if (outcome.status === "failed") return `${name}: could not read stock`;
  return "";
};

/**
 * Re-allocate every batched line of this invoice against current stock.
 *
 * Lines are read one at a time rather than in parallel: this runs against
 * HANA through the service layer, an invoice is a handful of lines, and a
 * burst of simultaneous queries is how the batch picker used to time the
 * warehouse out.
 */
export const reallocateInvoiceBatches = async (
  record: InvoiceRecord,
): Promise<Reallocation> => {
  const payload = parsePayload(record.invoice_payload);
  const branch = trimmed(record.branch);
  // Other drafts' holds, plus each line's allocation as it is made: two lines
  // of this invoice for the same item draw on the same batches.
  let reserved = await loadReserved(branch, record.id);

  const lines = batchesOf(payload);
  const outcomes: LineOutcome[] = [];
  const nextLines: InvoiceLine[] = [];
  let changed = false;

  for (const line of lines) {
    const itemCode = trimmed(line.ItemCode);
    // The line's own warehouse, falling back to the one the whole invoice
    // ships from. Never guessed beyond that.
    const whsCode = trimmed(line.WarehouseCode) || trimmed(record.warehouse);
    const required = toNumber(line.Quantity);

    if (!itemCode || !whsCode || required <= 0) {
      outcomes.push({ itemCode, warehouse: whsCode, required, allocated: 0, status: "skipped" });
      nextLines.push(line);
      continue;
    }

    let batches: BatchDetail[];
    try {
      batches = await loadBatches(branch, itemCode, whsCode);
    } catch (error) {
      console.error(`Unable to read batches for ${itemCode} in ${whsCode}`, error);
      outcomes.push({ itemCode, warehouse: whsCode, required, allocated: 0, status: "failed" });
      nextLines.push(line);
      continue;
    }

    const allocations = allocateNearestExpiryBatches(batches, required, {
      itemCode,
      whsCode,
      reserved,
    });
    const allocated = getAllocationQuantity(allocations);
    const enough = hasEnoughAllocation(allocations, required);

    outcomes.push({
      itemCode,
      warehouse: whsCode,
      required,
      allocated,
      status: enough ? "filled" : allocated > 0 ? "short" : "none",
    });

    /*
     * A line that could not be filled keeps its ORIGINAL batches.
     *
     * Posting a short allocation would have SAP refuse it again, and replacing
     * good batch numbers with a partial set loses the record of what the
     * invoice was approved against. Nothing is written until the whole
     * invoice can be filled — see `ok` below, which the caller checks before
     * saving or posting anything.
     */
    if (!enough) {
      nextLines.push(line);
      continue;
    }

    const next = { ...line, BatchNumbers: toSapBatchNumbers(allocations) };
    reserved = holdBatches(reserved, [{ itemCode, whsCode, batches: next.BatchNumbers }]);
    if (batchFingerprint(next) !== batchFingerprint(line)) changed = true;
    nextLines.push(next);
  }

  const problems = outcomes.map(describe).filter(Boolean);

  return {
    payload: { ...payload, DocumentLines: nextLines },
    lines: outcomes,
    ok: problems.length === 0,
    changed,
    problem: problems.join(". "),
  };
};
