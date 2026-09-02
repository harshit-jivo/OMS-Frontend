import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildInvoicePayload,
  calculateTotals,
  emptyForm,
  lineKey,
  normalizeDateInput,
  toNumber,
  type CustomerDetails,
  type FreightRow,
  type InvoiceForm,
  type Party,
  type PartyAddress,
  type SalespersonDetails,
  type SelectedLine,
} from "./salesInvoice.utils";
import type { Method } from "axios";

import api from "../../services/api";
import { resolveApiUrl, toBasePath } from "../../services/apiPaths";
import { requestIdOf } from "../../services/requestId";
import { loadSession } from "@/auth";

export type SalesOrderLine = {
  LineNum: number;
  ItemCode: string;
  Dscription: string;
  Quantity?: number;
  OpenQty: number;
  Price: number;
  PriceBefDi?: number;
  DiscPrcnt?: number;
  VatPrcnt?: number;
  TaxCode?: string;
  VatGroup?: string;
  WhsCode?: string;
  OcrCode?: string;
  ShipDate?: string;
  [key: string]: unknown;
};

export type SalesOrder = {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  DocDueDate: string;
  SlpCode?: number;
  ShipToCode?: string;
  PayToCode?: string;
  BPL_Id?: number;
  DocTotal?: number;
  lines?: SalesOrderLine[];
  Lines?: SalesOrderLine[];
  DocumentLines?: SalesOrderLine[];
  Document_Lines?: SalesOrderLine[];
  [key: string]: unknown;
};

export type FreightMaster = {
  ExpnsCode: number;
  ExpnsName: string;
};

/** A batch another in-flight invoice log is already holding. */
export type ReservedBatch = {
  item_code: string;
  warehouse_code: string;
  batch_number: string;
  quantity: number;
  log_id: number;
  status: string;
};

/** Key a batch is reserved under: item, warehouse and batch number together. */
export const reservedBatchKey = (itemCode?: string, whsCode?: string, batchNumber?: string) =>
  `${String(itemCode || "").trim().toUpperCase()}|${String(whsCode || "").trim().toUpperCase()}|${String(batchNumber || "").trim().toUpperCase()}`;

/** A sales order already carried by an in-flight invoice log. */
export type UsedSalesOrder = {
  so_number: string;
  log_id: number;
  status: string;
  sap_doc_num?: string;
  created_at?: string;
};

export type NextDocNumber = {
  NextNumber: number | string | null;
};

type ApiMessageResponse = {
  message?: unknown;
  detail?: unknown;
  details?: unknown;
  error?: unknown;
  errors?: unknown;
  // SAP Service Layer nests the human text as message: { lang, value }.
  value?: unknown;
  data?: unknown;
  result?: unknown;
  DocEntry?: unknown;
  DocNum?: unknown;
};

const createFreightRow = (): FreightRow => ({ expenseCode: "", expenseName: "", lineTotal: 0, taxCode: "" });

const linesToRecord = (lines: SelectedLine[]) =>
  Object.fromEntries(lines.map((line) => [lineKey(line.DocEntry, line.LineNum), line]));

/**
 * Re-exported so the ~20 files importing it from here keep working.
 *
 * The implementation moved to `services/apiPaths.ts`. It used to decide whether
 * to strip a caller's `/api` prefix by testing `/\/api$/` against the base URL,
 * which quietly stops matching the moment the base names a version — sending
 * every `apiFetch("/api/...")` call to `/api/v1/api/...`. It also had no
 * business living in a Sales Invoice hook.
 */
export { resolveApiUrl };

// Map an app URL to the shared axios instance. Absolute URLs bypass Axios'
// baseURL so sale-invoice calls use the exact same configured API endpoint.
const toAxiosRequest = (url: string): { url: string; baseURL?: string } => {
  if (/^https?:\/\//i.test(url)) return { url, baseURL: "" };
  return { url: toBasePath(url) };
};

// Best-effort stringify that never throws (circular refs fall back to String()).
const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

// Error thrown by the api* helpers. Carries the raw response body so callers
// that need to inspect the payload (e.g. SAP error-code detection) aren't
// limited to the flattened message string.
export class RequestError extends Error {
  status?: number;
  data?: unknown;
  /**
   * The `X-Request-ID` this call was made with — the string the server logged
   * every line of this request against. Empty when the request never left the
   * browser. See services/requestId.ts.
   */
  requestId?: string;
}

// Normalise an axios error into the same Error(message) contract the previous
// fetch()-based helpers threw (never logs tokens).
const toRequestError = (error: unknown): RequestError => {
  // Narrowed once, here, rather than typed `any` and dereferenced blind. An
  // `any` in a catch is how an error handler ends up throwing INSIDE the
  // catch — turning a readable server message into a hard crash.
  const failure = error as {
    response?: { status?: number; data?: unknown };
    message?: string;
  } | null | undefined;
  const status = failure?.response?.status;
  const data = failure?.response?.data as
    | Record<string, unknown>
    | string
    | undefined;
  let message: string | undefined;
  if (typeof data === "string") message = data;
  else if (typeof data?.detail === "string" && data.detail) message = data.detail;
  else if (typeof data?.message === "string" && data.message) message = data.message;
  // Several OMS endpoints report failures as {"error": "..."}; without this the
  // generic branch below renders them as "error: <text>".
  else if (typeof data?.error === "string" && data.error) message = data.error;
  else if (data && typeof data === "object") {
    message = Object.entries(data)
      .map(([field, value]) => {
        const text = Array.isArray(value)
          ? value.join(", ")
          : value !== null && typeof value === "object"
            ? safeJsonStringify(value)
            : String(value);
        return `${field}: ${text}`;
      })
      .join(" ");
  }
  const reference = requestIdOf(error);

  const requestError = new RequestError(
    withReference(
      message || failure?.message || `Request failed with ${status ?? ""}`.trim(),
      status,
      reference,
    ),
  );
  requestError.status = status;
  requestError.data = data;
  requestError.requestId = reference;

  // Always in the console, whatever the status. This is where a developer
  // looks first, it costs the user nothing, and it covers the 4xx cases that
  // deliberately do not carry the reference in their visible message.
  if (reference) {
    console.error(`[${reference}] ${status ?? "network"} ${requestError.message}`);
  }
  return requestError;
};

/**
 * Append a support reference — but only where it helps.
 *
 * A 4xx is the server telling the user something true and actionable ("A
 * rejection reason is required"). Tacking an opaque ID onto that makes a clear
 * sentence look like a crash, and trains people to ignore the ID, so by the
 * time one actually matters nobody reads it.
 *
 * A 5xx or a network failure is the opposite: the message says nothing useful
 * because there is nothing useful to say, and the only way anyone finds out
 * what happened is by quoting this string to whoever can read the server log.
 *
 * 401 and 403 are excluded for the same reason as the other 4xxs — and a 401
 * is usually invisible anyway, being retried after a token refresh.
 */
function withReference(message: string, status: number | undefined, reference: string): string {
  if (!reference) return message;
  const serverSideOrUnreachable = status === undefined || status >= 500;
  if (!serverSideOrUnreachable) return message;
  return `${message} (ref: ${reference})`;
}

/**
 * JSON request through the ONE shared axios instance (services/api.ts), so it
 * automatically gets the Authorization header, JWT refresh + retry, and central
 * error handling. Signature/behaviour preserved: 204 → undefined, otherwise the
 * parsed body; throws Error(message) on failure.
 */
export const apiFetch = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const { url: axiosUrl, baseURL } = toAxiosRequest(url);
  try {
    const response = await api.request<T>({
      url: axiosUrl,
      method: (init?.method || "GET") as Method,
      ...(baseURL !== undefined ? { baseURL } : {}),
      // Pass the already-serialized JSON body straight through.
      ...(init?.body !== undefined ? { data: init.body } : {}),
      ...(init?.headers ? { headers: init.headers as Record<string, string> } : {}),
    });
    if (response.status === 204) return undefined as T;
    return response.data as T;
  } catch (error) {
    throw toRequestError(error);
  }
};

/**
 * Multipart upload (FormData) through the shared axios instance. Returns the
 * parsed body, or null on 204. Setting Content-Type to multipart/form-data lets
 * axios' browser adapter attach the correct boundary.
 */
export const apiUpload = async <T,>(
  url: string,
  formData: FormData,
  method: "POST" | "PUT" | "PATCH" = "POST",
): Promise<T | null> => {
  const { url: axiosUrl, baseURL } = toAxiosRequest(url);
  try {
    const response = await api.request<T>({
      url: axiosUrl,
      method,
      data: formData,
      ...(baseURL !== undefined ? { baseURL } : {}),
      headers: { "Content-Type": "multipart/form-data" },
    });
    if (response.status === 204) return null;
    return response.data as T;
  } catch (error) {
    throw toRequestError(error);
  }
};

/** DELETE through the shared axios instance. Returns null on 204, else body. */
export const apiDelete = async <T,>(url: string): Promise<T | null> => {
  const { url: axiosUrl, baseURL } = toAxiosRequest(url);
  try {
    const response = await api.request<T>({
      url: axiosUrl,
      method: "DELETE",
      ...(baseURL !== undefined ? { baseURL } : {}),
    });
    if (response.status === 204) return null;
    return response.data as T;
  } catch (error) {
    throw toRequestError(error);
  }
};

/** The signed-in user's id, for the `created_by` on a saved invoice. Reads the
 *  session rather than the raw key, so a half-written session (a token with no
 *  user id) answers null here instead of 0. */
export const getCurrentUserId = (): number | null => Number(loadSession()?.userId) || null;

// The Sales Invoice flow runs against exactly one company branch at a time.
// Every /api/hana/ endpoint requires it as a query param (OIL | BEVERAGE).
export type InvoiceBranch = "OIL" | "BEVERAGE";

export const withBranch = (url: string, branch: string) =>
  `${url}${url.includes("?") ? "&" : "?"}branch=${encodeURIComponent(branch)}`;

const normalizeBranch = (value: unknown): InvoiceBranch =>
  String(value || "").trim().toUpperCase() === "BEVERAGE" ? "BEVERAGE" : "OIL";

// The /api/hana/ endpoints use the branch as stored (OIL | BEVERAGE), but the
// /api/service-layer/ endpoints expect the plural BEVERAGES for beverages.
// Map here so callers can pass the value stored on the log/wizard.
export const serviceLayerBranch = (value: unknown): "OIL" | "BEVERAGES" =>
  normalizeBranch(value) === "BEVERAGE" ? "BEVERAGES" : "OIL";

// Module-scoped mirror of the wizard's active branch so deeply nested pickers
// (item picker, batch picker, tabs) can build /api/hana/ URLs without the
// branch being threaded through every prop chain. Only one Sales Invoice
// wizard is ever mounted at a time.
let activeBranch: InvoiceBranch = "OIL";

export const hanaUrl = (url: string) => withBranch(url, activeBranch);

/* ──────────────────────────────────────────────────────────────────────────
 * Edit-and-resubmit handoff
 *
 * When a rejected invoice is reopened from the Invoice Review page, its stored
 * payload is stashed under this key and the wizard rebuilds its state from it:
 * party → open orders → matching lines (with the payload quantities). Batches
 * are deliberately NOT restored — the draft step re-runs auto-allocation
 * against current stock, which is the whole point of editing here.
 * ────────────────────────────────────────────────────────────────────────── */

export const EDIT_RESTORE_STORAGE_KEY = "sales_invoice_edit_restore";

export type EditRestorePayload = {
  CardCode?: string;
  DocumentLines?: Array<{
    BaseEntry?: number | string;
    BaseLine?: number | string;
    ItemCode?: string;
    Quantity?: number | string;
  }>;
  DocumentAdditionalExpenses?: Array<{
    ExpenseCode?: number | string;
    LineTotal?: number | string;
    VatGroup?: string;
  }>;
  [key: string]: unknown;
};

export type EditRestore = { logId?: number | string; branch?: string; payload: EditRestorePayload };

const readEditRestore = (): EditRestore | null => {
  try {
    const raw = sessionStorage.getItem(EDIT_RESTORE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditRestore;
    return parsed && typeof parsed === "object" && parsed.payload && typeof parsed.payload === "object"
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const pick = <T,>(source: Record<string, unknown>, keys: string[], fallback: T): T => {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value as T;
  }
  return fallback;
};

const parsePossibleJson = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const extractApiMessage = (value: unknown, fallback: string): string => {
  const parsed = parsePossibleJson(value);
  if (!parsed) return fallback;
  if (typeof parsed === "string") return parsed || fallback;

  if (Array.isArray(parsed)) {
    const messages = parsed.map((item) => extractApiMessage(item, "")).filter(Boolean);
    return messages.length ? messages.join(" ") : fallback;
  }

  if (typeof parsed === "object") {
    const source = parsed as ApiMessageResponse;

    // Direct human-readable text wins outright.
    for (const candidate of [source.message, source.detail, source.value]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }

    // Dig into nested wrappers for the most specific message. The top-level
    // `error` is often just a generic label ("SAP Error") while the real text
    // sits deeper, e.g. { error: "SAP Error", details: { error: { message } } }.
    for (const nested of [source.message, source.detail, source.details, source.error, source.errors, source.data, source.result]) {
      if (nested && typeof nested === "object") {
        const extracted = extractApiMessage(nested, "");
        if (extracted) return extracted;
      }
    }

    // Generic string labels only as a last resort.
    for (const candidate of [source.error, source.errors]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }

    const docNumber = source.DocNum ?? source.DocEntry;
    if (docNumber !== undefined && docNumber !== null && String(docNumber).trim()) {
      return `Invoice posted to SAP HANA successfully. Document: ${docNumber}`;
    }
  }

  return fallback;
};

const formatApiErrorMessage = (value: unknown, fallback: string): string => {
  const parsed = parsePossibleJson(value);
  if (!parsed) return fallback;
  if (typeof parsed === "string") return parsed || fallback;

  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return extractApiMessage(parsed, fallback);
  }
};

const normalizeLine = (line: SalesOrderLine, index: number): SalesOrderLine => ({
  ...line,
  LineNum: toNumber(pick(line, ["LineNum", "LineNo", "Line_No", "VisOrder"], index)),
  ItemCode: String(pick(line, ["ItemCode", "Item_Code", "item_code"], "")),
  Dscription: String(pick(line, ["Dscription", "Description", "ItemName", "Item_Name", "item_name"], "")),
  Quantity: toNumber(pick(line, ["Quantity", "Qty", "OrderQty", "Order_Qty"], 0)),
  OpenQty: toNumber(pick(line, ["OpenQty", "OpenQuantity", "Open_Qty", "OpenQuantity"], 0)),
  Price: toNumber(pick(line, ["Price", "UnitPrice", "Unit_Price"], 0)),
  PriceBefDi: toNumber(pick(line, ["PriceBefDi", "PriceBeforeDiscount", "Price_Bef_Di", "Price"], 0)),
  DiscPrcnt: toNumber(pick(line, ["DiscPrcnt", "DiscountPercent", "Discount_Percent"], 0)),
  VatPrcnt: toNumber(pick(line, ["VatPrcnt", "TaxPercent", "Tax_Percent"], 0)),
  TaxCode: String(pick(line, ["TaxCode", "VatGroup", "Tax_Code"], "")),
  VatGroup: String(pick(line, ["VatGroup", "TaxCode"], "")),
  WhsCode: String(pick(line, ["WhsCode", "WarehouseCode", "Warehouse_Code"], "")),
  OcrCode: String(pick(line, ["OcrCode", "CostingCode"], "")),
  ShipDate: String(pick(line, ["ShipDate", "Ship_Date", "ship_date"], "")),
});

const getRawOrderLines = (order: SalesOrder) => {
  const source = order as Record<string, unknown>;
  const rawLines = pick<unknown>(source, ["lines", "Lines", "DocumentLines", "Document_Lines", "rows", "Rows"], []);
  return Array.isArray(rawLines) ? rawLines as SalesOrderLine[] : [];
};

const normalizeOrder = (order: SalesOrder): SalesOrder => {
  const source = order as Record<string, unknown>;
  const lines = getRawOrderLines(order).map((line, index) => normalizeLine(line, index));

  return {
    ...order,
    DocEntry: toNumber(pick(source, ["DocEntry", "Doc_Entry", "doc_entry"], 0)),
    DocNum: toNumber(pick(source, ["DocNum", "Doc_Num", "doc_num"], 0)),
    DocDate: String(pick(source, ["DocDate", "Doc_Date", "doc_date"], "")),
    DocDueDate: String(pick(source, ["DocDueDate", "Doc_Due_Date", "doc_due_date"], "")),
    SlpCode: toNumber(pick(source, ["SlpCode", "SalesPersonCode", "Slp_Code"], 0)),
    ShipToCode: String(pick(source, ["ShipToCode", "Ship_To_Code", "ship_to_code"], "")),
    PayToCode: String(pick(source, ["PayToCode", "Pay_To_Code", "pay_to_code"], "")),
    BPL_Id: toNumber(pick(source, ["BPL_Id", "BPLId", "BPL_ID", "BPL_IDAssignedToInvoice"], 0)),
    DocTotal: toNumber(pick(source, ["DocTotal", "Doc_Total", "doc_total"], 0)),
    lines,
  };
};

const getOrderLines = (order: SalesOrder) => order.lines || [];

const getAddressCode = (address: PartyAddress) => String(address.Address || "").trim();

const normalizeAddresses = (addresses: PartyAddress[], addressType: "B" | "S") => {
  const seen = new Set<string>();

  return addresses.filter((address) => {
    if (address.AdresType !== addressType) return false;

    const key = [
      getAddressCode(address),
      address.City || "",
      address.State || "",
      address.GSTRegnNo || "",
    ].join("|");

    if (!getAddressCode(address) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const uniqueTextValues = (values: Array<string | undefined>) => {
  const seen = new Set<string>();
  const unique: string[] = [];

  values.forEach((value) => {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    unique.push(text);
  });

  return unique;
};

const normalizeAddressCode = (value?: string) => String(value || "").trim();

const mergeSalesOrderAddressCodes = (
  addresses: PartyAddress[],
  salesOrderCodes: string[],
  addressType: "B" | "S",
  cardCode: string,
) => {
  const used = new Set<string>();
  const merged: PartyAddress[] = [];

  const addAddress = (address: PartyAddress) => {
    const code = getAddressCode(address);
    if (!code || used.has(code)) return;
    used.add(code);
    merged.push(address);
  };

  salesOrderCodes.forEach((code) => {
    const matchingAddress = addresses.find((address) => getAddressCode(address) === code);
    addAddress(matchingAddress || { Address: code, AdresType: addressType, CardCode: cardCode });
  });

  addresses.forEach(addAddress);

  return merged;
};

const resolveDefaultAddress = (
  currentValue: string,
  salesOrderDefault: string | undefined,
  customerDefault: string | undefined,
  addresses: PartyAddress[],
) => {
  const addressCodes = addresses.map((address) => getAddressCode(address));
  if (salesOrderDefault) return salesOrderDefault;
  if (currentValue && addressCodes.includes(currentValue)) return currentValue;
  if (customerDefault) return customerDefault;
  return addressCodes[0] || "";
};

export function useSalesInvoice() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  // No branch selected yet → the wizard shows the branch gate and loads nothing.
  const [branch, setBranch] = useState<InvoiceBranch | null>(null);

  // Keep the module-scoped mirror (used by hanaUrl in nested pickers) in sync.
  useEffect(() => {
    if (branch) activeBranch = branch;
  }, [branch]);
  const [parties, setParties] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [selectedLines, setSelectedLines] = useState<Record<string, SelectedLine>>({});
  const [freightOptions, setFreightOptions] = useState<FreightMaster[]>([]);
  const [nextDocNumber, setNextDocNumber] = useState("");
  // SOs an invoice log already covers. SAP only closes an order once its
  // invoice posts, so without this two people can invoice the same SO twice.
  const [usedSalesOrders, setUsedSalesOrders] = useState<Record<string, UsedSalesOrder>>({});
  // Batches another draft already holds. SAP does not know a batch is spoken
  // for until the invoice posts, so without this two drafts allocate the same
  // stock. A rejected log releases its batches — the backend leaves those out.
  const [reservedBatches, setReservedBatches] = useState<ReservedBatch[]>([]);
  const [freightRows, setFreightRows] = useState<FreightRow[]>([]);
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails | null>(null);
  const [salespersonDetails, setSalespersonDetails] = useState<SalespersonDetails | null>(null);
  const [billToAddresses, setBillToAddresses] = useState<PartyAddress[]>([]);
  const [shipToAddresses, setShipToAddresses] = useState<PartyAddress[]>([]);
  const [form, setForm] = useState<InvoiceForm>(() => emptyForm());
  const [loadingParties, setLoadingParties] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingDraftDetails, setLoadingDraftDetails] = useState(false);
  const [posting, setPosting] = useState(false);
  const [partyError, setPartyError] = useState("");
  const [ordersError, setOrdersError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [postError, setPostError] = useState("");
  const [postSuccess, setPostSuccess] = useState("");
  const [postedDocNum, setPostedDocNum] = useState("");

  // Customers, next doc number and freight masters are all branch-specific, so
  // they load (and re-load) once a branch is selected.
  useEffect(() => {
    if (!branch) return;
    const loadParties = async () => {
      setLoadingParties(true);
      setPartyError("");
      setParties([]);

      try {
        const data = await apiFetch<Party[]>(withBranch("/api/hana/all-customers/", branch));
        setParties(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        setPartyError("Unable to load customers.");
      } finally {
        setLoadingParties(false);
      }
    };

    loadParties();
  }, [branch]);

  const loadReservedBatches = useCallback(async () => {
    if (!branch) {
      setReservedBatches([]);
      return;
    }
    try {
      const data = await apiFetch<{ data?: ReservedBatch[] }>(
        `/api/invoice/reserved-batches/?branch=${encodeURIComponent(branch)}`,
      );
      setReservedBatches(Array.isArray(data?.data) ? data.data : []);
    } catch (error) {
      // Best effort: without it auto-allocation simply behaves as before.
      console.error("Unable to load reserved batches", error);
      setReservedBatches([]);
    }
  }, [branch]);

  useEffect(() => {
    void loadReservedBatches();
  }, [loadReservedBatches]);

  /**
   * How much of each batch other in-flight drafts hold — a QUANTITY per batch,
   * not a flag.
   *
   * One batch commonly carries thousands of pieces and is shared across many
   * invoices. Treating it as taken the moment another draft touched it locked
   * the whole batch away over a handful of pieces, which in practice meant the
   * batch could not be used at all. Netting the held quantity off the batch's
   * stock leaves the rest available, and the batch only drops out once it is
   * genuinely exhausted.
   */
  const reservedBatchQty = useMemo(() => {
    const held = new Map<string, number>();
    for (const row of reservedBatches) {
      const key = reservedBatchKey(row.item_code, row.warehouse_code, row.batch_number);
      held.set(key, (held.get(key) || 0) + toNumber(row.quantity));
    }
    return held;
  }, [reservedBatches]);

  useEffect(() => {
    if (!branch) return;
    const loadNextDocNumber = async () => {
      try {
        const data = await apiFetch<NextDocNumber[]>(withBranch("/api/hana/next-doc-number/?doc_type=13", branch));
        const nextNumber = Array.isArray(data) ? data[0]?.NextNumber : "";
        setNextDocNumber(nextNumber === null || nextNumber === undefined ? "" : String(nextNumber));
      } catch (error) {
        console.error("Unable to load next document number:", error);
        setNextDocNumber("");
      }
    };

    loadNextDocNumber();
  }, [branch]);

  useEffect(() => {
    if (!branch) return;
    const loadFreightOptions = async () => {
      try {
        const data = await apiFetch<FreightMaster[] | { data?: FreightMaster[]; results?: FreightMaster[] }>(
          withBranch("/api/hana/freight-masters/", branch),
        );
        const options = Array.isArray(data) ? data : data.data || data.results || [];
        setFreightOptions(options);
      } catch (error) {
        console.error("Unable to load freight masters:", error);
      }
    };

    loadFreightOptions();
  }, [branch]);

  /* ── Edit-and-resubmit link ─────────────────────────────────────────────
   * Set while the wizard is rebuilding a rejected invoice. It pins the customer
   * (a replacement for invoice X must stay on X's customer — otherwise it is a
   * different invoice wearing X's history) and carries the source log id, which
   * postInvoice sends as `edited_from` so the backend retires the original.
   *
   * Leaving the customer — Change party / Change branch — drops the link rather
   * than blocking: the submission then becomes an ordinary new invoice and the
   * rejected log keeps its REJECTED status and reason.
   *
   * Mirrored in a ref because the guards below run inside callbacks created
   * before the corresponding state exists. */
  type EditLink = { logId?: number | string; cardCode: string };
  const editLinkRef = useRef<EditLink | null>(null);
  const [editLink, setEditLinkState] = useState<EditLink | null>(null);
  const setEditLink = useCallback((next: EditLink | null) => {
    editLinkRef.current = next;
    setEditLinkState(next);
  }, []);

  // Drop the link and tell the user the rejected invoice is no longer being
  // replaced. No-op when there was no link to begin with.
  const releaseEditLink = useCallback(() => {
    const link = editLinkRef.current;
    if (!link) return;
    setEditLink(null);
    setPartyError(
      `No longer editing rejected invoice${link.logId ? ` #${link.logId}` : ""} — it keeps its rejection. Anything you submit now is a new invoice.`,
    );
  }, [setEditLink]);

  const selectParty = useCallback(async (party: Party) => {
    if (!branch) return [];
    // A replacement invoice cannot change customer: picking a different one
    // detaches from the rejected invoice instead of carrying its identity over.
    if (editLinkRef.current && party.CardCode !== editLinkRef.current.cardCode) {
      releaseEditLink();
    }
    setSelectedParty({
      CardCode: party.CardCode,
      CardName: party.CardName,
      State1: party.State1,
      U_Main_Group: party.U_Main_Group,
      U_Chain: party.U_Chain,
      ListNum: party.ListNum,
    });
    setStep(2);
    setSalesOrders([]);
    setSelectedLines({});
    setFreightRows([]);
    setCustomerDetails(null);
    setSalespersonDetails(null);
    setBillToAddresses([]);
    setShipToAddresses([]);
    setForm(emptyForm());
    setOrdersError("");
    setLoadingOrders(true);

    try {
      const data = await apiFetch<SalesOrder[] | { data?: SalesOrder[]; results?: SalesOrder[] }>(
        withBranch(`/api/hana/so/?card_code=${encodeURIComponent(party.CardCode)}`, branch),
      );
      const orders = Array.isArray(data) ? data : data.data || data.results || [];
      const normalized = orders.map(normalizeOrder);
      setSalesOrders(normalized);

      // Best effort: the SO list is still usable without the badges, so a
      // failure here must not fail the step.
      try {
        const used = await apiFetch<{ data?: UsedSalesOrder[] }>(
          `/api/invoice/used-sales-orders/?card_code=${encodeURIComponent(party.CardCode)}&branch=${encodeURIComponent(branch || "")}`,
        );
        const byNumber: Record<string, UsedSalesOrder> = {};
        (used?.data || []).forEach((row) => {
          if (row?.so_number) byNumber[String(row.so_number)] = row;
        });
        setUsedSalesOrders(byNumber);
      } catch (error) {
        console.error("Unable to load in-flight invoice logs", error);
        setUsedSalesOrders({});
      }

      return normalized;
    } catch (error) {
      console.error(error);
      setOrdersError("Unable to load open sales orders for this party.");
      return [];
    } finally {
      setLoadingOrders(false);
    }
  }, [branch, releaseEditLink]);

  const changeParty = () => {
    releaseEditLink();
    setStep(1);
    setSelectedParty(null);
    setSalesOrders([]);
    setSelectedLines({});
    setFreightRows([]);
    setCustomerDetails(null);
    setSalespersonDetails(null);
    setBillToAddresses([]);
    setShipToAddresses([]);
    setForm(emptyForm());
    setPostSuccess("");
    setPostedDocNum("");
    setPostError("");
  };

  // Pick the company branch the invoice runs against. Everything downstream
  // (customers, orders, prices, batches) is branch-specific, so choosing one
  // resets the whole flow and reloads the masters.
  const selectBranch = (next: InvoiceBranch) => {
    if (next === branch) return;
    setBranch(next);
    setParties([]);
    changeParty();
  };

  // Back to the branch gate (also clears any in-progress invoice).
  const changeBranch = () => {
    setBranch(null);
    setParties([]);
    changeParty();
  };

  const makeSelectedLine = (order: SalesOrder, line: SalesOrderLine): SelectedLine => {
    const salesOrderWhsCode = line.WhsCode || "";

    return {
      DocEntry: order.DocEntry,
      DocNum: order.DocNum,
      DocDate: order.DocDate,
      DocDueDate: order.DocDueDate,
      SlpCode: order.SlpCode,
      ShipToCode: order.ShipToCode,
      PayToCode: order.PayToCode,
      BPL_Id: order.BPL_Id,
      LineNum: line.LineNum,
      ItemCode: line.ItemCode,
      Dscription: line.Dscription,
      OpenQty: toNumber(line.OpenQty),
      Price: toNumber(line.Price),
      PriceBefDi: toNumber(line.PriceBefDi ?? line.Price),
      DiscPrcnt: toNumber(line.DiscPrcnt),
      VatPrcnt: toNumber(line.VatPrcnt),
      TaxCode: line.TaxCode || line.VatGroup || "",
      WhsCode: salesOrderWhsCode,
      SalesOrderWhsCode: salesOrderWhsCode,
      OcrCode: line.OcrCode || "",
      ShipDate: line.ShipDate || "",
      invoiceQty: toNumber(line.OpenQty),
    };
  };

  const toggleLine = (order: SalesOrder, line: SalesOrderLine) => {
    const key = lineKey(order.DocEntry, line.LineNum);
    setSelectedLines((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = makeSelectedLine(order, line);
      return next;
    });
  };

  const toggleOrder = (order: SalesOrder) => {
    const lines = getOrderLines(order).filter((line) => toNumber(line.OpenQty) > 0);
    const everySelected = lines.every((line) => selectedLines[lineKey(order.DocEntry, line.LineNum)]);

    setSelectedLines((current) => {
      const next = { ...current };
      lines.forEach((line) => {
        const key = lineKey(order.DocEntry, line.LineNum);
        if (everySelected) delete next[key];
        else if (!next[key]) next[key] = makeSelectedLine(order, line);
      });
      return next;
    });
  };

  const updateLine = (key: string, patch: Partial<SelectedLine>) => {
    setSelectedLines((current) => {
      const line = current[key];
      if (!line) return current;
      const next = { ...line, ...patch };
      next.invoiceQty = Math.min(Math.max(toNumber(next.invoiceQty), 1), toNumber(next.OpenQty));
      if (next.BatchNumbers?.length) {
        if (patch.invoiceQty !== undefined) {
          let remainingQty = next.invoiceQty;
          next.BatchNumbers = next.BatchNumbers
            .map((batch, index) => {
              const isLastBatch = index === next.BatchNumbers!.length - 1;
              const quantity = isLastBatch ? remainingQty : Math.min(toNumber(batch.Quantity), remainingQty);
              remainingQty = Math.max(remainingQty - quantity, 0);
              return { ...batch, Quantity: quantity };
            })
            .filter((batch) => toNumber(batch.Quantity) > 0);
        }
      }
      return { ...current, [key]: next };
    });
  };

  const removeLine = (key: string) => {
    setSelectedLines((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const updateForm = (patch: Partial<InvoiceForm>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateFreightRow = (index: number, patch: Partial<FreightRow>) => {
    setFreightRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };

  const addFreightRow = () => {
    setFreightRows((current) => [...current, createFreightRow()]);
  };

  const removeFreightRow = (index: number) => {
    setFreightRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  };

  const selectedLineList = useMemo(() => Object.values(selectedLines), [selectedLines]);
  const firstSelectedLine = selectedLineList[0];
  const selectedShipToCodes = useMemo(
    () => uniqueTextValues(selectedLineList.map((line) => line.ShipToCode)),
    [selectedLineList],
  );
  const selectedPayToCodes = useMemo(
    () => uniqueTextValues(selectedLineList.map((line) => line.PayToCode)),
    [selectedLineList],
  );
  const selectedOrderAddressError = useMemo(() => {
    const selectedOrders = new Map<number, { docEntry: number; docNum: number; shipTo: string; payTo: string }>();

    selectedLineList.forEach((line) => {
      if (selectedOrders.has(line.DocEntry)) return;
      selectedOrders.set(line.DocEntry, {
        docEntry: line.DocEntry,
        docNum: line.DocNum,
        shipTo: normalizeAddressCode(line.ShipToCode),
        payTo: normalizeAddressCode(line.PayToCode),
      });
    });

    if (selectedOrders.size <= 1) return "";

    const selectedOrderList = [...selectedOrders.values()];
    const shipToValues = new Set(selectedOrderList.map((order) => order.shipTo));
    const payToValues = new Set(selectedOrderList.map((order) => order.payTo));
    if (shipToValues.size <= 1 && payToValues.size <= 1) return "";

    const mismatchedFields = [
      payToValues.size > 1 ? "Bill To" : "",
      shipToValues.size > 1 ? "Ship To" : "",
    ].filter(Boolean);
    const orderLabels = selectedOrderList
      .map((order) => `DocEntry ${order.docEntry || order.docNum}`)
      .join(", ");

    return `${mismatchedFields.join(" and ")} must be same for selected sales orders (${orderLabels}).`;
  }, [selectedLineList]);
  const selectedLineBatchError = useMemo(
    () =>
      selectedLineList.some((line) => {
        const batchQty = line.BatchNumbers?.reduce((sum, batch) => sum + toNumber(batch.Quantity), 0) || 0;
        return !line.BatchNumbers?.length || Math.abs(batchQty - toNumber(line.invoiceQty)) >= 0.0001;
      })
        ? "Choose matching batch quantity for every selected line."
        : "",
    [selectedLineList],
  );
  const totals = useMemo(
    () => calculateTotals(selectedLineList, form.discountPercent, freightRows),
    [form.discountPercent, freightRows, selectedLineList],
  );
  const payload = useMemo(
    () => buildInvoicePayload(selectedParty, selectedLines, form, freightRows),
    [form, freightRows, selectedLines, selectedParty],
  );

  const loadPartyAddresses = useCallback(async () => {
    if (!selectedParty || !branch) return false;
    setLoadingDraftDetails(true);
    setDraftError("");

    try {
      const addressData = await apiFetch<PartyAddress[]>(
        withBranch(`/api/hana/address/?card_code=${encodeURIComponent(selectedParty.CardCode)}`, branch),
      );
      const addresses = Array.isArray(addressData) ? addressData : [];
      const billingAddresses = normalizeAddresses(addresses, "B");
      const shippingAddresses = normalizeAddresses(addresses, "S");

      setCustomerDetails({
        CardCode: selectedParty.CardCode,
        CardName: selectedParty.CardName,
        State1: selectedParty.State1 || undefined,
        U_Chain: selectedParty.U_Chain || undefined,
        BillToDef: billingAddresses[0]?.Address || "",
        ShipToDef: shippingAddresses[0]?.Address || "",
      });
      setSalespersonDetails(null);
      setBillToAddresses(billingAddresses);
      setShipToAddresses(shippingAddresses);
      setForm((current) => ({
        ...current,
        payTo: resolveDefaultAddress(current.payTo, undefined, undefined, billingAddresses),
        shipTo: resolveDefaultAddress(current.shipTo, undefined, undefined, shippingAddresses),
      }));
      return true;
    } catch (error) {
      console.error(error);
      setDraftError("Unable to load customer addresses.");
      return false;
    } finally {
      setLoadingDraftDetails(false);
    }
  }, [branch, selectedParty]);

  const loadDraftDetails = useCallback(async () => {
    if (!selectedParty || !firstSelectedLine || !branch) return false;
    setLoadingDraftDetails(true);
    setDraftError("");

    try {
      const slpCode = firstSelectedLine.SlpCode ?? 0;
      const [customerData, salespersonData, addressData] = await Promise.all([
        apiFetch<CustomerDetails[]>(
          withBranch(`/api/hana/customer-details/?card_code=${encodeURIComponent(selectedParty.CardCode)}`, branch),
        ),
        apiFetch<SalespersonDetails[]>(
          withBranch(`/api/hana/salesperson-details/?slp_code=${encodeURIComponent(String(slpCode))}`, branch),
        ),
        apiFetch<PartyAddress[]>(
          withBranch(`/api/hana/address/?card_code=${encodeURIComponent(selectedParty.CardCode)}`, branch),
        ),
      ]);
      const customer = Array.isArray(customerData) ? customerData[0] || null : null;
      const salesperson = Array.isArray(salespersonData) ? salespersonData[0] || null : null;
      const addresses = Array.isArray(addressData) ? addressData : [];
      const billingAddresses = mergeSalesOrderAddressCodes(
        normalizeAddresses(addresses, "B"),
        selectedPayToCodes,
        "B",
        selectedParty.CardCode,
      );
      const shippingAddresses = mergeSalesOrderAddressCodes(
        normalizeAddresses(addresses, "S"),
        selectedShipToCodes,
        "S",
        selectedParty.CardCode,
      );

      setCustomerDetails(customer);
      setSalespersonDetails(salesperson);
      setBillToAddresses(billingAddresses);
      setShipToAddresses(shippingAddresses);
      setForm((current) => {
        const postingDate = normalizeDateInput();
        const dueDate = normalizeDateInput(firstSelectedLine.DocDueDate);
        const adjustedDueDate = dueDate < postingDate ? postingDate : dueDate;
        return {
          ...current,
          postingDate,
          dueDate: adjustedDueDate,
          shipTo: resolveDefaultAddress(current.shipTo, selectedShipToCodes[0], customer?.ShipToDef, shippingAddresses),
          payTo: resolveDefaultAddress(current.payTo, selectedPayToCodes[0], customer?.BillToDef, billingAddresses),
        };
      });
      return true;
    } catch (error) {
      console.error(error);
      setDraftError("Unable to load customer or salesperson details.");
      return false;
    } finally {
      setLoadingDraftDetails(false);
    }
  }, [branch, firstSelectedLine, selectedParty, selectedPayToCodes, selectedShipToCodes]);

  const createInvoiceDraft = async () => {
    if (selectedLineList.length === 0) return;
    if (selectedOrderAddressError) {
      setDraftError(selectedOrderAddressError);
      return;
    }
    setStep(3);
  };

  const proceedToDraft = async () => {
    if (selectedLineList.length === 0) return false;
    if (selectedOrderAddressError) {
      setDraftError(selectedOrderAddressError);
      return false;
    }
    const ok = await loadDraftDetails();
    if (ok) setStep(4);
    return ok;
  };

  const proceedToDraftFromItems = async (lines: SelectedLine[]) => {
    if (!selectedParty || lines.length === 0) return false;
    setDraftError("");
    setSelectedLines(linesToRecord(lines));
    const ok = await loadPartyAddresses();
    if (ok) setStep(4);
    return ok;
  };

  /* ── Edit-and-resubmit restore ──────────────────────────────────────────
   * A rejected invoice reopened from the Invoice Review page arrives via
   * sessionStorage (EDIT_RESTORE_STORAGE_KEY). Phase 1 selects the party and
   * rebuilds the selected lines from that party's live open orders using the
   * payload quantities. Phase 2 runs on a later render (proceedToDraftFromItems
   * needs the re-rendered selectedParty) and jumps to the draft step, where
   * batch auto-allocation re-runs against current stock. */
  const [editRestore] = useState<EditRestore | null>(() => readEditRestore());
  const editRestoreStartedRef = useRef(false);
  const [restoreStaged, setRestoreStaged] = useState<{ lines: SelectedLine[]; warning: string } | null>(null);

  useEffect(() => {
    if (!editRestore || editRestoreStartedRef.current) return;
    // The reopened invoice dictates the branch — skip the branch gate and let
    // the branch-scoped masters (parties etc.) load for it.
    if (!branch) {
      setBranch(normalizeBranch(editRestore.branch));
      return;
    }
    if (loadingParties || parties.length === 0) return;
    editRestoreStartedRef.current = true;
    sessionStorage.removeItem(EDIT_RESTORE_STORAGE_KEY);

    const payload = editRestore.payload;
    const cardCode = String(payload.CardCode || "");
    const party = parties.find((candidate) => candidate.CardCode === cardCode);
    if (!party) {
      setPartyError(
        `Unable to reopen the invoice: customer ${cardCode || "(unknown)"} is not in the open-party list.`,
      );
      return;
    }

    // Pin the customer and remember which log this submission replaces. Set
    // before selectParty so its guard sees the matching card code.
    setEditLink({ logId: editRestore.logId, cardCode });

    (async () => {
      const orders = await selectParty(party);
      const payloadLines = (payload.DocumentLines || []).filter(
        (line) => line.BaseEntry !== undefined && line.BaseEntry !== null,
      );
      const restored: SelectedLine[] = [];
      const missing: string[] = [];

      payloadLines.forEach((payloadLine) => {
        const order = orders.find((candidate) => toNumber(candidate.DocEntry) === toNumber(payloadLine.BaseEntry));
        const orderLine = order
          ? getOrderLines(order).find((candidate) => toNumber(candidate.LineNum) === toNumber(payloadLine.BaseLine))
          : undefined;
        if (!order || !orderLine || toNumber(orderLine.OpenQty) < 1) {
          missing.push(String(payloadLine.ItemCode || `SO line ${payloadLine.BaseEntry}/${payloadLine.BaseLine}`));
          return;
        }
        const line = makeSelectedLine(order, orderLine);
        // Requested quantity, clamped to what is still open on the sales order.
        const requested = toNumber(payloadLine.Quantity);
        if (requested >= 1) line.invoiceQty = Math.min(requested, line.OpenQty);
        restored.push(line);
      });

      if (restored.length === 0) {
        setOrdersError(
          "Unable to reopen the invoice: none of its sales-order lines are still open. Build the invoice again from the open orders below.",
        );
        return;
      }

      // Freight comes back as stored; batches deliberately do not — the draft
      // step re-runs auto-allocation against current stock.
      const expenses = payload.DocumentAdditionalExpenses || [];
      if (expenses.length) {
        setFreightRows(
          expenses.map((expense) => ({
            expenseCode: String(expense.ExpenseCode ?? ""),
            expenseName:
              freightOptions.find((option) => toNumber(option.ExpnsCode) === toNumber(expense.ExpenseCode))?.ExpnsName
              || "",
            lineTotal: toNumber(expense.LineTotal),
            taxCode: String(expense.VatGroup || ""),
          })),
        );
      }

      const warning = missing.length
        ? `Reopened with ${restored.length} line${restored.length === 1 ? "" : "s"}. Not restored (no longer open on the sales order): ${missing.join(", ")}.`
        : "";
      setRestoreStaged({ lines: restored, warning });
    })();
  }, [branch, editRestore, freightOptions, loadingParties, parties, selectParty, setEditLink]);

  useEffect(() => {
    if (!restoreStaged || !selectedParty) return;
    setRestoreStaged(null);
    (async () => {
      await proceedToDraftFromItems(restoreStaged.lines);
      if (restoreStaged.warning) setDraftError(restoreStaged.warning);
    })();
    // proceedToDraftFromItems is recreated every render; the restoreStaged guard
    // makes this effect run its body exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreStaged, selectedParty]);

  
  useEffect(() => {
    if (step === 4 && selectedParty && !customerDetails && !loadingDraftDetails) {
      loadDraftDetails();
    }
  }, [customerDetails, loadDraftDetails, loadingDraftDetails, selectedParty, step]);

  const resetStep3Form = () => {
    const postingDate = normalizeDateInput();
    const dueDate = normalizeDateInput(firstSelectedLine?.DocDueDate);
    const adjustedDueDate = dueDate < postingDate ? postingDate : dueDate;
    setForm((current) => ({
      ...emptyForm(),
      postingDate,
      dueDate: adjustedDueDate,
      shipTo: selectedShipToCodes[0] || shipToAddresses[0]?.Address || customerDetails?.ShipToDef || "",
      payTo: selectedPayToCodes[0] || billToAddresses[0]?.Address || customerDetails?.BillToDef || "",
      discountPercent: current.discountPercent,
    }));
  };

  const saveDraft = () => {
    localStorage.setItem("sales_invoice_draft", JSON.stringify({ selectedParty, selectedLines, freightRows, form }));
  };

  const postInvoice = async () => {
    setPostError("");
    setPostSuccess("");
    setPostedDocNum("");

    if (selectedLineList.length === 0) {
      setPostError("Select at least one line before posting.");
      return;
    }

    if (!form.postingDate || !form.dueDate || !form.documentDate) {
      setPostError("Posting date, due date, and document date are required.");
      return;
    }

    if (form.postingDate > form.dueDate) {
      setPostError("Document date must be less than or equal to due date.");
      return;
    }

    if (selectedLineBatchError) {
      setPostError(selectedLineBatchError);
      return;
    }

    const invalidLine = selectedLineList.find(
      (line) => toNumber(line.invoiceQty) < 1 || toNumber(line.invoiceQty) > toNumber(line.OpenQty),
    );

    if (invalidLine) {
      setPostError("Every selected line must have a valid invoice quantity.");
      return;
    }

    setPosting(true);
    try {
      // Store the invoice locally as a PENDING record for review/approval instead of
      // creating a draft in SAP. The Invoice Review page approves it and posts it to
      // SAP HANA later.
      const createdBy = getCurrentUserId();
      // Only claim to replace the rejected log when this really is its
      // replacement — same customer, link never released. Otherwise the original
      // stays REJECTED and this is simply a new invoice.
      const link = editLinkRef.current;
      const editedFrom =
        link && link.logId !== undefined && link.logId !== null && selectedParty?.CardCode === link.cardCode
          ? link.logId
          : null;
      const pendingPayload = {
        so_number: uniqueTextValues(selectedLineList.map((line) => (line.DocNum ? String(line.DocNum) : ""))).join(", "),
        party_name: selectedParty?.CardName || "",
        total_amount: totals.grandTotal,
        status: "PENDING",
        // The branch this invoice was built against; warehouse is the WHS code
        // of the payload's first line.
        branch: branch || "OIL",
        warehouse: payload.DocumentLines[0]?.WarehouseCode || "",
        ...(createdBy ? { created_by: createdBy } : {}),
        ...(editedFrom !== null ? { edited_from: editedFrom } : {}),
        invoice_payload: payload,
      };
      const data = await apiFetch<ApiMessageResponse>("/api/invoice/pending/", {
        method: "POST",
        body: JSON.stringify(pendingPayload),
      });
      // The original has been retired by the backend; a further submit from this
      // session must not try to retire anything again.
      if (editedFrom !== null) setEditLink(null);
      setPostSuccess(extractApiMessage(data, "Invoice submitted for review and approval."));
      // The batches this invoice just claimed are now held — pick them up so the
      // next draft in this session does not allocate them again.
      void loadReservedBatches();
    } catch (error) {
      console.error(error);
      setPostError(formatApiErrorMessage(error instanceof Error ? error.message : error, "Unable to submit invoice for review."));
    } finally {
      setPosting(false);
    }
  };

  return {
    step,
    setStep,
    branch,
    selectBranch,
    changeBranch,
    parties,
    selectedParty,
    salesOrders,
    selectedLines,
    selectedLineList,
    selectedOrderAddressError,
    selectedLineBatchError,
    freightOptions,
    freightRows,
    customerDetails,
    salespersonDetails,
    billToAddresses,
    shipToAddresses,
    usedSalesOrders,
    reservedBatches,
    reservedBatchQty,
    refreshReservedBatches: loadReservedBatches,
    nextDocNumber,
    form,
    totals,
    payload,
    loadingParties,
    loadingOrders,
    loadingDraftDetails,
    posting,
    partyError,
    ordersError,
    draftError,
    postError,
    postSuccess,
    postedDocNum,
    // Non-null while this invoice is a replacement for a rejected one.
    editLink,
    selectParty,
    changeParty,
    toggleLine,
    toggleOrder,
    updateLine,
    removeLine,
    updateForm,
    updateFreightRow,
    addFreightRow,
    removeFreightRow,
    createInvoiceDraft,
    proceedToDraft,
    proceedToDraftFromItems,
    loadPartyAddresses,
    resetStep3Form,
    saveDraft,
    postInvoice,
    getOrderLines,
  };
}

export type SalesInvoiceState = ReturnType<typeof useSalesInvoice>;
