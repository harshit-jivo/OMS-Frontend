import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildInvoicePayload,
  calculateTotals,
  emptyForm,
  lineKey,
  normalizeDateInput,
  toNumber,
  type CustomerDetails,
  type InvoiceForm,
  type Party,
  type SalespersonDetails,
  type SelectedLine,
} from "./salesInvoice.utils";

export type SalesOrderLine = {
  LineNum: number;
  ItemCode: string;
  Dscription: string;
  OpenQty: number;
  Price: number;
  PriceBefDi?: number;
  DiscPrcnt?: number;
  VatPrcnt?: number;
  TaxCode?: string;
  VatGroup?: string;
  WhsCode?: string;
  OcrCode?: string;
  [key: string]: unknown;
};

export type SalesOrder = {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  DocDueDate: string;
  SlpCode?: number;
  DocTotal?: number;
  lines?: SalesOrderLine[];
  Lines?: SalesOrderLine[];
  DocumentLines?: SalesOrderLine[];
  Document_Lines?: SalesOrderLine[];
  [key: string]: unknown;
};

const apiFetch = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const token = localStorage.getItem("access");
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

const pick = <T,>(source: Record<string, unknown>, keys: string[], fallback: T): T => {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value as T;
  }
  return fallback;
};

const normalizeLine = (line: SalesOrderLine, index: number): SalesOrderLine => ({
  ...line,
  LineNum: toNumber(pick(line, ["LineNum", "LineNo", "Line_No", "VisOrder"], index)),
  ItemCode: String(pick(line, ["ItemCode", "Item_Code", "item_code"], "")),
  Dscription: String(pick(line, ["Dscription", "Description", "ItemName", "Item_Name", "item_name"], "")),
  OpenQty: toNumber(pick(line, ["OpenQty", "OpenQuantity", "Open_Qty", "OpenQuantity"], 0)),
  Price: toNumber(pick(line, ["Price", "UnitPrice", "Unit_Price"], 0)),
  PriceBefDi: toNumber(pick(line, ["PriceBefDi", "PriceBeforeDiscount", "Price_Bef_Di", "Price"], 0)),
  DiscPrcnt: toNumber(pick(line, ["DiscPrcnt", "DiscountPercent", "Discount_Percent"], 0)),
  VatPrcnt: toNumber(pick(line, ["VatPrcnt", "TaxPercent", "Tax_Percent"], 0)),
  TaxCode: String(pick(line, ["TaxCode", "VatGroup", "Tax_Code"], "")),
  VatGroup: String(pick(line, ["VatGroup", "TaxCode"], "")),
  WhsCode: String(pick(line, ["WhsCode", "WarehouseCode", "Warehouse_Code"], "")),
  OcrCode: String(pick(line, ["OcrCode", "CostingCode"], "")),
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
    DocTotal: toNumber(pick(source, ["DocTotal", "Doc_Total", "doc_total"], 0)),
    lines,
  };
};

const getOrderLines = (order: SalesOrder) => order.lines || [];

export function useSalesInvoice() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [parties, setParties] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [selectedLines, setSelectedLines] = useState<Record<string, SelectedLine>>({});
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails | null>(null);
  const [salespersonDetails, setSalespersonDetails] = useState<SalespersonDetails | null>(null);
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

  useEffect(() => {
    const loadParties = async () => {
      setLoadingParties(true);
      setPartyError("");

      try {
        const data = await apiFetch<Party[]>("/api/hana/open-parties/");
        setParties(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        setPartyError("Unable to load open parties.");
      } finally {
        setLoadingParties(false);
      }
    };

    loadParties();
  }, []);

  const selectParty = useCallback(async (party: Party) => {
    setSelectedParty({ CardCode: party.CardCode, CardName: party.CardName });
    setStep(2);
    setSalesOrders([]);
    setSelectedLines({});
    setCustomerDetails(null);
    setSalespersonDetails(null);
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
    setCustomerDetails(null);
    setSalespersonDetails(null);
    setForm(emptyForm());
  };

  const makeSelectedLine = (order: SalesOrder, line: SalesOrderLine): SelectedLine => ({
    DocEntry: order.DocEntry,
    DocNum: order.DocNum,
    DocDate: order.DocDate,
    DocDueDate: order.DocDueDate,
    SlpCode: order.SlpCode,
    LineNum: line.LineNum,
    ItemCode: line.ItemCode,
    Dscription: line.Dscription,
    OpenQty: toNumber(line.OpenQty),
    Price: toNumber(line.Price),
    PriceBefDi: toNumber(line.PriceBefDi ?? line.Price),
    DiscPrcnt: toNumber(line.DiscPrcnt),
    VatPrcnt: toNumber(line.VatPrcnt),
    TaxCode: line.TaxCode || line.VatGroup || "",
    WhsCode: line.WhsCode || "",
    OcrCode: line.OcrCode || "",
    invoiceQty: toNumber(line.OpenQty),
  });

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

  const selectedLineList = useMemo(() => Object.values(selectedLines), [selectedLines]);
  const firstSelectedLine = selectedLineList[0];
  const totals = useMemo(
    () => calculateTotals(selectedLineList, form.discountPercent),
    [form.discountPercent, selectedLineList],
  );
  const payload = useMemo(
    () => buildInvoicePayload(selectedParty, selectedLines, form),
    [form, selectedLines, selectedParty],
  );

  const loadDraftDetails = useCallback(async () => {
    if (!selectedParty || !firstSelectedLine) return false;
    setLoadingDraftDetails(true);
    setDraftError("");

    try {
      const slpCode = firstSelectedLine.SlpCode ?? 0;
      const [customerData, salespersonData] = await Promise.all([
        apiFetch<CustomerDetails[]>(`/api/hana/customer-details/?card_code=${encodeURIComponent(selectedParty.CardCode)}`),
        apiFetch<SalespersonDetails[]>(`/api/hana/salesperson-details/?slp_code=${encodeURIComponent(String(slpCode))}`),
      ]);
      const customer = Array.isArray(customerData) ? customerData[0] || null : null;
      const salesperson = Array.isArray(salespersonData) ? salespersonData[0] || null : null;

      setCustomerDetails(customer);
      setSalespersonDetails(salesperson);
      setForm((current) => ({
        ...current,
        dueDate: normalizeDateInput(firstSelectedLine.DocDueDate),
        shipTo: current.shipTo || customer?.ShipToDef || "",
        payTo: current.payTo || customer?.BillToDef || "",
      }));
      return true;
    } catch (error) {
      console.error(error);
      setDraftError("Unable to load customer or salesperson details.");
      return false;
    } finally {
      setLoadingDraftDetails(false);
    }
  }, [firstSelectedLine, selectedParty]);

  const createInvoiceDraft = async () => {
    if (selectedLineList.length === 0) return;
    setStep(3);
  };

  const proceedToDraft = async () => {
    if (selectedLineList.length === 0) return;
    const ok = await loadDraftDetails();
    if (ok) setStep(4);
  };

  useEffect(() => {
    if (step === 4 && selectedParty && !customerDetails && !loadingDraftDetails) {
      loadDraftDetails();
    }
  }, [customerDetails, loadDraftDetails, loadingDraftDetails, selectedParty, step]);

  const resetStep3Form = () => {
    setForm((current) => ({
      ...emptyForm(),
      dueDate: normalizeDateInput(firstSelectedLine?.DocDueDate),
      shipTo: customerDetails?.ShipToDef || "",
      payTo: customerDetails?.BillToDef || "",
      discountPercent: current.discountPercent,
    }));
  };

  const saveDraft = () => {
    localStorage.setItem("sales_invoice_draft", JSON.stringify({ selectedParty, selectedLines, form }));
  };

  const postInvoice = async () => {
    setPostError("");
    setPostSuccess("");

    if (selectedLineList.length === 0) {
      setPostError("Select at least one line before posting.");
      return;
    }

    if (!form.postingDate || !form.dueDate || !form.documentDate) {
      setPostError("Posting date, due date, and document date are required.");
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
      await apiFetch("/api/sap/service-layer/invoices/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setPostSuccess("Invoice posted to SAP HANA successfully.");
    } catch (error) {
      console.error(error);
      setPostError("Unable to post invoice to SAP HANA.");
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
    customerDetails,
    salespersonDetails,
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
    selectParty,
    changeParty,
    toggleLine,
    toggleOrder,
    updateLine,
    removeLine,
    updateForm,
    createInvoiceDraft,
    proceedToDraft,
    resetStep3Form,
    saveDraft,
    postInvoice,
    getOrderLines,
  };
}

export type SalesInvoiceState = ReturnType<typeof useSalesInvoice>;
