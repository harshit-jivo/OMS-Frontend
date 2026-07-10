import { useCallback, useEffect, useMemo, useState } from "react";
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
import api, { API_BASE_URL } from "../../services/api";

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

export type NextDocNumber = {
  NextNumber: number | string | null;
};

type ApiMessageResponse = {
  message?: unknown;
  detail?: unknown;
  error?: unknown;
  errors?: unknown;
  data?: unknown;
  result?: unknown;
  DocEntry?: unknown;
  DocNum?: unknown;
};

const createFreightRow = (): FreightRow => ({ expenseCode: "", expenseName: "", lineTotal: 0, taxCode: "" });

// Unique, time-ordered reference stamped on each invoice post so the resulting SAP
// document can be traced back to OMS. Capped at 15 characters to fit the SAP UDF:
// a base-36 millisecond timestamp (~8 chars, keeps refs sortable) plus a random
// suffix that guarantees uniqueness within the same millisecond.
const OMS_REF_MAX_LENGTH = 15;
const generateOmsRef = (): string => {
  let ref = Date.now().toString(36);
  while (ref.length < OMS_REF_MAX_LENGTH) {
    ref += Math.random().toString(36).slice(2);
  }
  return ref.slice(0, OMS_REF_MAX_LENGTH);
};

const linesToRecord = (lines: SelectedLine[]) =>
  Object.fromEntries(lines.map((line) => [lineKey(line.DocEntry, line.LineNum), line]));

export const resolveApiUrl = (url: string) => {
  if (/^https?:\/\//i.test(url)) return url;

  const normalizedUrl = url.startsWith("/") ? url : `/${url}`;
  const path = /\/api$/i.test(API_BASE_URL)
    ? normalizedUrl.replace(/^\/api(?=\/|$)/i, "")
    : normalizedUrl;

  return `${API_BASE_URL}${path}`;
};

// Map an app URL to the shared axios instance. Absolute URLs bypass Axios'
// baseURL so sale-invoice calls use the exact same configured API endpoint.
const toAxiosRequest = (url: string): { url: string; baseURL?: string } => {
  const resolved = resolveApiUrl(url);
  if (/^https?:\/\//i.test(resolved)) return { url: resolved, baseURL: "" };
  return { url: resolved.replace(/^\/api(?=\/|$)/i, "") || "/" };
};

// Normalise an axios error into the same Error(message) contract the previous
// fetch()-based helpers threw (never logs tokens).
const toRequestError = (error: any): Error => {
  const status = error?.response?.status;
  const data = error?.response?.data;
  let message: string | undefined;
  if (typeof data === "string") message = data;
  else if (data?.detail) message = String(data.detail);
  else if (data?.message) message = String(data.message);
  else if (data && typeof data === "object") {
    message = Object.entries(data)
      .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join(" ");
  }
  return new Error(
    message || error?.message || `Request failed with ${status ?? ""}`.trim(),
  );
};

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
      method: (init?.method || "GET") as any,
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

// Local invoice history log. We append one row per lifecycle event (draft created
// → PENDING, approved → APPROVED, rejected → REJECTED) so the full audit trail is
// preserved rather than mutating a single record.
export type InvoiceLogStatus = "PENDING" | "APPROVED" | "REJECTED";

export type InvoiceLogInput = {
  so_number?: string;
  party_name?: string;
  total_amount?: string | number;
  ref_id?: string;
  status: InvoiceLogStatus;
  created_by?: number | null;
  approved_by?: number | null;
  rejected_by?: number | null;
  rejection_reason?: string;
  invoice_payload?: unknown;
};

// Best-effort: a logging failure must never disrupt the actual draft/approval flow.
export const createInvoiceLog = async (input: InvoiceLogInput): Promise<void> => {
  try {
    await apiFetch("/api/invoice/log/create/", {
      method: "POST",
      body: JSON.stringify(input),
    });
  } catch (error) {
    console.error("Unable to create invoice log:", error);
  }
};

export const getCurrentUserId = (): number | null => Number(localStorage.getItem("user_id")) || null;

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
    const directMessage = source.message ?? source.detail ?? source.error ?? source.errors;
    if (typeof directMessage === "string" && directMessage.trim()) return directMessage.trim();
    if (directMessage && typeof directMessage === "object") return extractApiMessage(directMessage, fallback);

    const nestedMessage = source.data ?? source.result;
    if (nestedMessage) {
      const extracted = extractApiMessage(nestedMessage, "");
      if (extracted) return extracted;
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

// SAP's approval flow frequently rejects the post with code -2028 ("No matching
// records found") even though the draft was actually created. Detect that code
// anywhere in the (possibly deeply nested) error payload.
const isNoMatchingRecordsError = (value: unknown): boolean => {
  const text = typeof value === "string"
    ? value
    : (() => {
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      })();
  return text.includes("-2028");
};

// Interpret the /draft/verify response: find the draft record with this refId in
// SAP. The endpoint returns { data: [ ...matching records ] }, where each record
// echoes its U_OMS_REF. We return the matching row (so the caller can read its
// DocEntry/DocNum); when the row carries U_OMS_REF we confirm it matches the ref
// we posted to rule out a stray hit.
const findDraftRecordForRef = (response: unknown, refId: string): Record<string, unknown> | null => {
  const records =
    response && typeof response === "object" && Array.isArray((response as { data?: unknown }).data)
      ? ((response as { data: Array<Record<string, unknown>> }).data)
      : Array.isArray(response)
        ? (response as Array<Record<string, unknown>>)
        : [];

  if (records.length === 0) return null;
  return (
    records.find((row) => {
      const ref = row?.U_OMS_REF;
      return ref === undefined || ref === null || String(ref) === refId;
    }) || null
  );
};

// Ask SAP whether the draft for this reference id actually landed, returning the
// matching record (or null). A failed/absent verification yields null so the
// caller reports failure.
const verifyDraftRecord = async (refId: string): Promise<Record<string, unknown> | null> => {
  try {
    const data = await apiFetch<unknown>(`/api/hana/draft/verify?refId=${encodeURIComponent(refId)}`);
    return findDraftRecordForRef(data, refId);
  } catch (error) {
    console.error("Draft verification failed:", error);
    return null;
  }
};

// Pull a draft/document number out of an API response, digging into nested
// data/result wrappers. Prefers DocEntry (the draft key) but falls back to DocNum.
const extractDocNumber = (value: unknown): string => {
  const parsed = parsePossibleJson(value);
  if (!parsed || typeof parsed !== "object") return "";
  const source = parsed as ApiMessageResponse;
  const docNumber = source.DocEntry ?? source.DocNum;
  if (docNumber !== undefined && docNumber !== null && String(docNumber).trim()) {
    return String(docNumber).trim();
  }
  const nested = source.data ?? source.result;
  return nested ? extractDocNumber(nested) : "";
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
  const [parties, setParties] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [selectedLines, setSelectedLines] = useState<Record<string, SelectedLine>>({});
  const [freightOptions, setFreightOptions] = useState<FreightMaster[]>([]);
  const [nextDocNumber, setNextDocNumber] = useState("");
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

  useEffect(() => {
    const loadParties = async () => {
      setLoadingParties(true);
      setPartyError("");

      try {
        const data = await apiFetch<Party[]>("/api/hana/all-customers/");
        setParties(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        setPartyError("Unable to load customers.");
      } finally {
        setLoadingParties(false);
      }
    };

    loadParties();
  }, []);

  useEffect(() => {
    const loadNextDocNumber = async () => {
      try {
        const data = await apiFetch<NextDocNumber[]>("/api/hana/next-doc-number/?doc_type=13");
        const nextNumber = Array.isArray(data) ? data[0]?.NextNumber : "";
        setNextDocNumber(nextNumber === null || nextNumber === undefined ? "" : String(nextNumber));
      } catch (error) {
        console.error("Unable to load next document number:", error);
        setNextDocNumber("");
      }
    };

    loadNextDocNumber();
  }, []);

  useEffect(() => {
    const loadFreightOptions = async () => {
      try {
        const data = await apiFetch<FreightMaster[] | { data?: FreightMaster[]; results?: FreightMaster[] }>(
          "/api/hana/freight-masters/",
        );
        const options = Array.isArray(data) ? data : data.data || data.results || [];
        setFreightOptions(options);
      } catch (error) {
        console.error("Unable to load freight masters:", error);
      }
    };

    loadFreightOptions();
  }, []);

  const selectParty = useCallback(async (party: Party) => {
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
        `/api/hana/so/?card_code=${encodeURIComponent(party.CardCode)}`,
      );
      const orders = Array.isArray(data) ? data : data.data || data.results || [];
      setSalesOrders(orders.map(normalizeOrder));
    } catch (error) {
      console.error(error);
      setOrdersError("Unable to load open sales orders for this party.");
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const changeParty = () => {
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
    if (!selectedParty) return false;
    setLoadingDraftDetails(true);
    setDraftError("");

    try {
      const addressData = await apiFetch<PartyAddress[]>(
        `/api/hana/address/?card_code=${encodeURIComponent(selectedParty.CardCode)}`,
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
  }, [selectedParty]);

  const loadDraftDetails = useCallback(async () => {
    if (!selectedParty || !firstSelectedLine) return false;
    setLoadingDraftDetails(true);
    setDraftError("");

    try {
      const slpCode = firstSelectedLine.SlpCode ?? 0;
      const [customerData, salespersonData, addressData] = await Promise.all([
        apiFetch<CustomerDetails[]>(`/api/hana/customer-details/?card_code=${encodeURIComponent(selectedParty.CardCode)}`),
        apiFetch<SalespersonDetails[]>(`/api/hana/salesperson-details/?slp_code=${encodeURIComponent(String(slpCode))}`),
        apiFetch<PartyAddress[]>(`/api/hana/address/?card_code=${encodeURIComponent(selectedParty.CardCode)}`),
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
  }, [firstSelectedLine, selectedParty, selectedPayToCodes, selectedShipToCodes]);

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
    // The reference stamped on the payload doubles as the key we use to verify the
    // draft actually landed in SAP when the approval flow rejects the post with -2028.
    const refId = generateOmsRef();

    // Reference data shared by every ref-log entry for this attempt. The outcome
    // (status + error_message) is filled in per branch below.
    const refLogBase = {
      ref_id: refId,
      card_name: selectedParty?.CardName || "",
      doc_date: form.postingDate,
      so_number: uniqueTextValues(selectedLineList.map((line) => (line.DocNum ? String(line.DocNum) : ""))).join(", "),
      posted_by: Number(localStorage.getItem("user_id")) || null,
    };

    // Record the final outcome in the local ref log. Best-effort: a logging failure
    // must never change what the user sees about the actual post.
    const writeRefLog = async (status: "Success" | "Failed", errorMessage = "") => {
      try {
        await apiFetch("/api/invoice/refLogs/", {
          method: "POST",
          body: JSON.stringify({ ...refLogBase, status, error_message: errorMessage }),
        });
      } catch (logError) {
        console.error("Unable to write invoice ref log:", logError);
      }
    };

    // Append a PENDING history log when the draft lands in SAP. Carries the full
    // invoice payload so the approval screen has the original document on record.
    const logDraftCreated = () =>
      createInvoiceLog({
        so_number: refLogBase.so_number,
        party_name: selectedParty?.CardName || "",
        total_amount: String(totals.grandTotal),
        ref_id: refId,
        status: "PENDING",
        created_by: getCurrentUserId(),
        invoice_payload: { ...payload, U_OMS_REF: refId },
      });

    // A post can "fail" two ways: a thrown error (HTTP error) or a 200 with an error
    // body. Both funnel here. SAP's approval flow commonly returns -2028 ("No matching
    // records") even though the draft was created, so on that code we re-check SAP by
    // refId before deciding it failed. Any other error — or a -2028 with nothing in
    // SAP — is a genuine failure.
    const resolvePostFailure = async (errorValue: unknown) => {
      if (isNoMatchingRecordsError(errorValue)) {
        const record = await verifyDraftRecord(refId);
        if (record) {
          await writeRefLog("Success");
          await logDraftCreated();
          setPostedDocNum(extractDocNumber(record));
          setPostSuccess("Invoice draft created in SAP successfully.");
          return;
        }
      }
      const message = formatApiErrorMessage(errorValue, "Draft creation unsuccessful.");
      await writeRefLog("Failed", message);
      setPostError(message);
    };

    try {
      // Store the invoice draft in SAP via the service-layer endpoint (type=DRAFT).
      // A fresh unique U_OMS_REF is stamped on each attempt so the SAP document can be
      // cross-referenced back to OMS (and verified after a -2028 response).
      const data = await apiFetch<ApiMessageResponse>("/api/service-layer/invoice/?type=DRAFT", {
        method: "POST",
        body: JSON.stringify({ ...payload, U_OMS_REF: refId }),
      });
      // The SAP proxy can return HTTP 200 with an error body — run the same failure path.
      if (data && typeof data === "object" && data.error) {
        await resolvePostFailure(data);
        return;
      }
      await writeRefLog("Success");
      await logDraftCreated();
      setPostedDocNum(extractDocNumber(data));
      setPostSuccess("Invoice draft created in SAP successfully.");
    } catch (error) {
      console.error(error);
      await resolvePostFailure(error instanceof Error ? error.message : error);
    } finally {
      setPosting(false);
    }
  };

  return {
    step,
    setStep,
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
