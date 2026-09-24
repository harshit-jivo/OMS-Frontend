import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reallocateInvoiceBatches } from "./reallocateBatches";
import type { InvoiceRecord } from "./types";

/**
 * Re-reading the warehouse for an invoice SAP refused.
 *
 * The thing to protect here is restraint. This action reposts to SAP against
 * stock the reviewer has not seen, so the rules that matter are the ones
 * about when it must NOT write: a short allocation, an unreadable warehouse,
 * a line with no warehouse to read. Getting those wrong ships an invoice
 * nobody approved.
 */
vi.mock("../SalesInvoice/useSalesInvoice", () => ({
  apiFetch: vi.fn(),
  reservedBatchKey: (item?: string, whs?: string, batch?: string) =>
    `${String(item || "").trim().toUpperCase()}|${String(whs || "").trim().toUpperCase()}|${String(batch || "").trim().toUpperCase()}`,
  withBranch: (url: string, branch: string) =>
    `${url}${url.includes("?") ? "&" : "?"}branch=${encodeURIComponent(branch)}`,
}));

const { apiFetch } = await import("../SalesInvoice/useSalesInvoice");
const fetchMock = apiFetch as unknown as ReturnType<typeof vi.fn>;

const batch = (number: string, quantity: number, expDate: string) => ({
  BatchNumber: number,
  Quantity: quantity,
  ExpDate: expDate,
  WhsCode: "DL-MP",
  SystemSerialNumber: Number(number.replace(/\D/g, "")) || 1,
});

const record = (lines: unknown[], over: Partial<InvoiceRecord> = {}): InvoiceRecord => ({
  id: 7,
  branch: "OIL",
  warehouse: "DL-MP",
  invoice_payload: { CardCode: "C1", DocumentLines: lines },
  ...over,
}) as InvoiceRecord;

const line = (over: Record<string, unknown> = {}) => ({
  ItemCode: "FG001",
  WarehouseCode: "DL-MP",
  Quantity: 30,
  BatchNumbers: [{ BatchNumber: "OLD-1", Quantity: 30 }],
  ...over,
});

/** Answer the reserved-batches call, then every batch-details call. */
const serve = (batches: unknown[], reserved: unknown[] = []) => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("reserved-batches")) return { data: reserved };
    return batches;
  });
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const linesOf = (payload: { DocumentLines?: unknown[] }) =>
  (payload.DocumentLines || []) as Array<{ BatchNumbers?: Array<{ BatchNumber?: string; Quantity?: number }> }>;

describe("re-allocating against current stock", () => {
  it("replaces stale batches with what the warehouse holds now", async () => {
    serve([batch("NEW-1", 100, "2027-01-01")]);

    const result = await reallocateInvoiceBatches(record([line()]));

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(linesOf(result.payload)[0].BatchNumbers).toEqual([
      { BatchNumber: "NEW-1", SystemSerialNumber: 1, Quantity: 30 },
    ]);
  });

  it("takes nearest expiry first, splitting across batches", async () => {
    // FEFO is the whole point: stock that expires first must leave first.
    serve([
      batch("LATER", 100, "2027-06-01"),
      batch("SOONER", 20, "2026-06-01"),
    ]);

    const result = await reallocateInvoiceBatches(record([line({ Quantity: 30 })]));

    expect(result.ok).toBe(true);
    expect(linesOf(result.payload)[0].BatchNumbers?.map((b) => [b.BatchNumber, b.Quantity])).toEqual([
      ["SOONER", 20],
      ["LATER", 10],
    ]);
  });

  it("reports no change when the batches it already held are still right", async () => {
    // Worth distinguishing: if SAP refuses this again, the reason is not the
    // batches, and the reviewer should not keep pressing the same button.
    serve([batch("OLD-1", 100, "2027-01-01")]);

    const result = await reallocateInvoiceBatches(record([line()]));

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
  });

  it("excludes this invoice's own holds when asking what is reserved", async () => {
    // A failed log sits in ERROR, which the endpoint counts as holding stock.
    // Without this it would find its own pieces taken — by itself.
    serve([batch("NEW-1", 100, "2027-01-01")]);

    await reallocateInvoiceBatches(record([line()], { id: 42 }));

    const reservedCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("reserved-batches"),
    );
    expect(String(reservedCall?.[0])).toContain("exclude_log=42");
  });

  it("leaves stock other drafts have claimed alone", async () => {
    serve(
      [batch("SHARED", 100, "2027-01-01")],
      [{ item_code: "FG001", warehouse_code: "DL-MP", batch_number: "SHARED", quantity: 80 }],
    );

    // 20 free of 100, so a 30-piece line cannot be filled.
    const result = await reallocateInvoiceBatches(record([line({ Quantity: 30 })]));

    expect(result.ok).toBe(false);
    expect(result.problem).toContain("only 20 of 30");
  });

  it("does not give two lines of the same item the same batch stock", async () => {
    // The live failure: three FG0000005 lines each took the nearest-expiry
    // batch (843 left) for 300 + 600 + 400, and SAP refused with 10001153.
    serve([
      batch("SOONER", 843, "2026-06-01"),
      batch("LATER", 23040, "2027-06-01"),
    ]);

    const result = await reallocateInvoiceBatches(record([
      line({ Quantity: 300 }),
      line({ Quantity: 600 }),
      line({ Quantity: 400 }),
    ]));

    expect(result.ok).toBe(true);
    expect(linesOf(result.payload).map((l) => l.BatchNumbers?.map((b) => [b.BatchNumber, b.Quantity]))).toEqual([
      [["SOONER", 300]],
      [["SOONER", 543], ["LATER", 57]],
      [["LATER", 400]],
    ]);
  });
});

describe("what it refuses to change", () => {
  it("keeps the original batches when stock is short", async () => {
    // Posting a partial allocation would be refused by SAP anyway, and
    // overwriting good batch numbers loses what the invoice was approved on.
    serve([batch("NEW-1", 10, "2027-01-01")]);

    const result = await reallocateInvoiceBatches(record([line({ Quantity: 30 })]));

    expect(result.ok).toBe(false);
    expect(linesOf(result.payload)[0].BatchNumbers).toEqual([
      { BatchNumber: "OLD-1", Quantity: 30 },
    ]);
  });

  it("says so when the warehouse holds nothing for the item", async () => {
    serve([]);

    const result = await reallocateInvoiceBatches(record([line()]));

    expect(result.ok).toBe(false);
    expect(result.problem).toContain("no stock in DL-MP");
  });

  it("does not guess a warehouse for a line that has none", async () => {
    // There is no safe default, and shipping from the wrong warehouse is
    // worse than failing the post again.
    const result = await reallocateInvoiceBatches(
      record([line({ WarehouseCode: "" })], { warehouse: "" }),
    );

    expect(result.lines[0].status).toBe("skipped");
    expect(linesOf(result.payload)[0].BatchNumbers).toEqual([
      { BatchNumber: "OLD-1", Quantity: 30 },
    ]);
    // Nothing was read for it.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("batch-details"))).toBe(false);
  });

  it("falls back to the invoice's own warehouse when the line omits one", async () => {
    serve([batch("NEW-1", 100, "2027-01-01")]);

    const result = await reallocateInvoiceBatches(
      record([line({ WarehouseCode: "" })], { warehouse: "BH-PS" }),
    );

    expect(result.ok).toBe(true);
    const detailCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("batch-details"),
    );
    expect(String(detailCall?.[0])).toContain("whs_code=BH-PS");
  });

  it("reports a stock lookup that failed rather than treating it as empty", async () => {
    // "Could not read" and "there is none" lead to different next steps.
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("reserved-batches")) return { data: [] };
      throw new Error("HANA timeout");
    });

    const result = await reallocateInvoiceBatches(record([line()]));

    expect(result.ok).toBe(false);
    expect(result.lines[0].status).toBe("failed");
    expect(result.problem).toContain("could not read stock");
  });

  it("carries on when the reserved-batches lookup fails", async () => {
    // Best effort: without the holds it allocates over gross stock, which is
    // what the app did before they were tracked at all.
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("reserved-batches")) throw new Error("down");
      return [batch("NEW-1", 100, "2027-01-01")];
    });

    const result = await reallocateInvoiceBatches(record([line()]));

    expect(result.ok).toBe(true);
  });

  it("leaves quantities, prices and the customer untouched", async () => {
    serve([batch("NEW-1", 100, "2027-01-01")]);

    const result = await reallocateInvoiceBatches(
      record([line({ Quantity: 30, UnitPrice: 107, TaxCode: "GST18" })]),
    );

    const [changed] = linesOf(result.payload) as unknown as Record<string, unknown>[];
    expect(changed.Quantity).toBe(30);
    expect(changed.UnitPrice).toBe(107);
    expect(changed.TaxCode).toBe("GST18");
    expect((result.payload as { CardCode?: string }).CardCode).toBe("C1");
  });

  it("skips a zero-quantity line instead of asking the warehouse about it", async () => {
    serve([batch("NEW-1", 100, "2027-01-01")]);

    const result = await reallocateInvoiceBatches(record([line({ Quantity: 0 })]));

    expect(result.lines[0].status).toBe("skipped");
    expect(result.ok).toBe(true);
  });
});
