/**
 * Choosing which batches an invoice line ships from.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ITS OWN MODULE
 * ─────────────────────────────────────────────────────────────────────────
 * This was private to `ContentsTab.tsx`, where the wizard allocates batches
 * as the invoice is built. It is needed a second time and much later: when a
 * post to SAP is refused for a batch or stock reason, Invoice Review offers
 * to re-read what is actually in the warehouse now and allocate again
 * (`invoiceReview/reallocateBatches.ts`).
 *
 * Two copies of a FEFO allocator would be two answers to "which batch does
 * this ship from", and the one that disagreed with SAP would be whichever
 * copy was not being looked at. So it moved here whole — same functions,
 * same behaviour, one owner.
 *
 * Nothing here touches the network or React: given batches and a quantity it
 * says which batches and how much of each. Fetching is the caller's job.
 */
import { toNumber } from "./salesInvoice.utils";
import { reservedBatchKey } from "./useSalesInvoice";

/**
 * A batch as HANA reports it.
 *
 * The identity fields are a long list because the batch number arrives under
 * a different key depending on which query answered — see `getBatchNumber`.
 */
export type BatchDetail = {
  BatchNum?: string;
  BatchNumber?: string;
  DistNumber?: string;
  BatchNo?: string;
  BatchCode?: string;
  BatchID?: string;
  BatchId?: string;
  Batch?: string;
  LotNumber?: string;
  MnfSerial?: string;
  InternalSerialNumber?: string;
  SerialNumber?: string;
  WhsCode: string;
  Quantity: number;
  PrdDate?: string | null;
  ExpDate?: string | null;
  InDate?: string | null;
  SystemSerialNumber?: number;
  SysNumber?: number;
  AbsEntry?: number;
  [key: string]: unknown;
};

/** How much of one batch a line takes. */
export type BatchAllocation = {
  batch: BatchDetail;
  quantity: number;
};

export const getSystemSerialNumber = (batch: BatchDetail) => {
  const value = batch.SystemSerialNumber ?? batch.SysNumber ?? batch.AbsEntry;
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
};

const getBatchDateTokens = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return new Set<string>();

  const tokens = new Set([text.toLowerCase().replace(/[^a-z0-9]/g, "")]);
  const dateOnly = text.split("T")[0]?.split(" ")[0] || text;
  const parts = dateOnly.split(/[/-]/).map((part) => part.trim()).filter(Boolean);

  if (parts.length === 3) {
    const [first, second, third] = parts;
    const year = first.length === 4 ? first : third;
    const month = second.padStart(2, "0");
    const day = first.length === 4 ? third.padStart(2, "0") : first.padStart(2, "0");

    if (year.length === 4) {
      tokens.add(`${year}${month}${day}`);
      tokens.add(`${day}${month}${year}`);
    }
  }

  return tokens;
};

const isBatchDateValue = (value: string, batch: BatchDetail) => {
  const candidateTokens = getBatchDateTokens(value);
  const dateTokens = [batch.ExpDate, batch.PrdDate, batch.InDate].reduce<Set<string>>(
    (tokens, dateValue) => {
      getBatchDateTokens(dateValue).forEach((token) => tokens.add(token));
      return tokens;
    },
    new Set(),
  );

  return [...candidateTokens].some((token) => token && dateTokens.has(token));
};

/**
 * The batch's number, whichever key this query happened to put it under.
 *
 * Some batches are legitimately NAMED after a date ("06/06/2026"), so a value
 * that merely looks like one is kept as a fallback rather than discarded —
 * dropping it would send SAP a line with no batch at all.
 */
export const getBatchNumber = (batch: BatchDetail) => {
  const source = batch as Record<string, unknown>;
  const candidateKeys = [
    "BatchNumber",
    "DistNumber",
    "BatchNo",
    "BatchCode",
    "BatchID",
    "BatchId",
    "Batch",
    "LotNumber",
    "BatchNum",
    "MnfSerial",
    "InternalSerialNumber",
    "SerialNumber",
  ];

  let dateLikeFallback = "";
  for (const key of candidateKeys) {
    const value = String(source[key] ?? "").trim();
    if (!value) continue;
    if (!isBatchDateValue(value, batch)) return value;
    if (!dateLikeFallback) dateLikeFallback = value;
  }

  return dateLikeFallback;
};

/** Allocations in the shape a SAP invoice line's `BatchNumbers` takes. */
export const toSapBatchNumbers = (allocations: BatchAllocation[]) =>
  allocations
    .map(({ batch, quantity }) => {
      const systemSerialNumber = getSystemSerialNumber(batch);
      const batchNumber = getBatchNumber(batch);
      return {
        ...(batchNumber ? { BatchNumber: batchNumber } : {}),
        ...(systemSerialNumber !== undefined ? { SystemSerialNumber: systemSerialNumber } : {}),
        Quantity: quantity,
      };
    })
    .filter(
      (batch) => (batch.BatchNumber || batch.SystemSerialNumber !== undefined) && batch.Quantity > 0,
    );

/** Expiry first, then goods-in date — the order stock should leave in. */
export const getBatchSortTime = (batch: BatchDetail) => {
  const expTime = batch.ExpDate ? new Date(batch.ExpDate).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isFinite(expTime)) return expTime;
  const inTime = batch.InDate ? new Date(batch.InDate).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(inTime) ? inTime : Number.POSITIVE_INFINITY;
};

/**
 * Stock left in a batch once other in-flight drafts have taken their share.
 *
 * A batch is a pool of pieces, not a single indivisible thing: one batch holds
 * thousands and is normally split across many invoices. `reserved` therefore
 * carries a QUANTITY per batch, and it is subtracted from the batch's stock —
 * treating the batch as untouchable because someone else took 20 pieces locked
 * the other 9,980 away for no reason.
 *
 * SAP does not know a batch is spoken for until the invoice actually posts,
 * which is why these holds are tracked here at all. A rejected log releases its
 * share, so those never appear.
 */
export const availableBatchQty = (
  batch: BatchDetail,
  options: { itemCode?: string; whsCode?: string; reserved?: Map<string, number> },
): number => {
  const stock = toNumber(batch.Quantity);
  const held =
    options.reserved?.get(
      reservedBatchKey(options.itemCode, options.whsCode, getBatchNumber(batch)),
    ) || 0;
  // Never negative: a hold bigger than the batch (stock moved in SAP since the
  // other draft was built) means nothing is free, not that we owe stock.
  return Math.max(0, stock - held);
};

/**
 * Nearest-expiry-first allocation, over what is actually free in each batch.
 *
 * A batch only drops out when other drafts have taken all of it; a part-held
 * batch still contributes whatever is left.
 */
export const allocateNearestExpiryBatches = (
  batches: BatchDetail[],
  requiredQty: number,
  options: { itemCode?: string; whsCode?: string; reserved?: Map<string, number> } = {},
): BatchAllocation[] => {
  let remainingQty = toNumber(requiredQty);
  const allocations: BatchAllocation[] = [];

  [...batches]
    .map((batch) => ({ batch, free: availableBatchQty(batch, options) }))
    .filter(({ free }) => free > 0)
    .sort((a, b) => getBatchSortTime(a.batch) - getBatchSortTime(b.batch))
    .some(({ batch, free }) => {
      const allocatedQty = Math.min(remainingQty, free);
      if (allocatedQty > 0) {
        allocations.push({ batch, quantity: allocatedQty });
        remainingQty -= allocatedQty;
      }
      return remainingQty <= 0;
    });

  return allocations;
};

export const getAllocationQuantity = (allocations: BatchAllocation[]) =>
  allocations.reduce((sum, allocation) => sum + toNumber(allocation.quantity), 0);

/** Tolerant by a whisker, because these are floats coming back from SAP. */
export const hasEnoughAllocation = (allocations: BatchAllocation[], requiredQty: number) =>
  getAllocationQuantity(allocations) + 0.0001 >= toNumber(requiredQty);
