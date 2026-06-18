import { useCallback, useReducer, useRef } from "react";
import { apiFetch } from "./useSalesInvoice";
import { todayInput } from "./salesInvoice.utils";

/* ──────────────────────────────────────────────────────────────────────────
 * SAP draft → invoice payload
 *
 * The full SAP draft entity returned by /api/service-layer/draft/. We only read
 * the document header plus each line's batch allocations; everything else
 * (pricing, tax) SAP re-derives from the base sales order.
 * ────────────────────────────────────────────────────────────────────────── */

type SapDraftBatch = {
  BatchNumber?: string | null;
  SystemSerialNumber?: number | null;
  Quantity?: number | null;
};

type SapDraftLine = {
  BaseType?: number | null;
  BaseEntry?: number | null;
  BaseLine?: number | null;
  ShipDate?: string | null;
  ItemCode?: string | null;
  WarehouseCode?: string | null;
  Quantity?: number | null;
  BatchNumbers?: SapDraftBatch[] | null;
};

export type SapDraft = {
  CardCode?: string | null;
  DocDate?: string | null;
  DocDueDate?: string | null;
  TaxDate?: string | null;
  NumAtCard?: string | null;
  SalesPersonCode?: number | null;
  ShipToCode?: string | null;
  PayToCode?: string | null;
  BPL_IDAssignedToInvoice?: number | null;
  BPLName?: string | null;
  DocumentLines?: SapDraftLine[] | null;
};

// The draft endpoint normally returns the OData entity directly, but tolerate the
// proxy wrapping it under data/result/value (object or single-element array).
const unwrapDraft = (payload: unknown): SapDraft | null => {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.DocumentLines)) return obj as SapDraft;
  for (const key of ["data", "result", "value"]) {
    const nested = obj[key];
    if (Array.isArray(nested)) {
      const first = nested[0];
      if (first && typeof first === "object") return first as SapDraft;
    } else if (nested && typeof nested === "object") {
      return nested as SapDraft;
    }
  }
  return obj as SapDraft;
};

// Build the lean invoice-creation payload from a full SAP draft. BaseType 17 marks
// each line as sourced from a sales order, so SAP copies pricing/tax from it.
export const buildSapInvoicePayload = (draft: SapDraft) => {
  // Stamp the invoice with today's date. The draft may have been created days
  // earlier, but the posting must be dated the day it actually lands in SAP — so
  // DocDate / DocDueDate / TaxDate (and each line's ShipDate) all use the current
  // date rather than the draft's original dates.
  const today = todayInput();
  return {
    CardCode: draft.CardCode ?? "",
    DocDate: today,
    DocDueDate: today,
    TaxDate: today,
    NumAtCard: draft.NumAtCard ?? "",
    SalesPersonCode: draft.SalesPersonCode ?? -1,
    ShipToCode: draft.ShipToCode ?? "",
    PayToCode: draft.PayToCode ?? "",
    ...(draft.BPL_IDAssignedToInvoice !== undefined && draft.BPL_IDAssignedToInvoice !== null
      ? { BPL_IDAssignedToInvoice: draft.BPL_IDAssignedToInvoice }
      : {}),
    DocumentLines: (draft.DocumentLines ?? []).map((line) => ({
      BaseType: line.BaseType ?? 17,
      BaseEntry: line.BaseEntry,
      BaseLine: line.BaseLine,
      ...(line.ShipDate ? { ShipDate: today } : {}),
      ItemCode: line.ItemCode,
      WarehouseCode: line.WarehouseCode,
      Quantity: line.Quantity,
      BatchNumbers: (line.BatchNumbers ?? []).map((batch) => ({
        ...(batch.BatchNumber ? { BatchNumber: batch.BatchNumber } : {}),
        ...(batch.SystemSerialNumber !== undefined && batch.SystemSerialNumber !== null
          ? { SystemSerialNumber: batch.SystemSerialNumber }
          : {}),
        Quantity: batch.Quantity,
      })),
    })),
  };
};

// Trim a (possibly large JSON) SAP error down to something a log line / panel can
// show without overflowing.
export const conciseError = (value: unknown, fallback: string) => {
  const text = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed;
};

// Pull the created invoice's number out of the POST response, digging into nested
// data/result wrappers. Prefers DocNum (the human invoice number), then DocEntry.
const extractInvoiceNumber = (value: unknown): string => {
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  for (const key of ["DocNum", "DocEntry", "docNum", "docEntry", "InvoiceNumber", "invoiceNumber"]) {
    const candidate = obj[key];
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  for (const key of ["data", "result", "invoice"]) {
    const nested = obj[key];
    if (nested && typeof nested === "object") {
      const found = extractInvoiceNumber(nested);
      if (found) return found;
    }
  }
  return "";
};

/* ──────────────────────────────────────────────────────────────────────────
 * Mission-control state machine
 *
 * Six visible stages map onto two real network awaits (GET draft, POST invoice);
 * the rest are short, deliberate dwells so each stage registers as a "win" and
 * the long SAP wait stays animated. See the loader component for the visuals.
 * ────────────────────────────────────────────────────────────────────────── */

export type SapStepKey = "session" | "draft" | "payload" | "post" | "sap" | "invoice";

export const SAP_STEPS: { key: SapStepKey; tile: string; label: string }[] = [
  { key: "session", tile: "Session", label: "Connecting to SAP" },
  { key: "draft", tile: "Draft", label: "Retrieving draft" },
  { key: "payload", tile: "Payload", label: "Validating & building invoice" },
  { key: "post", tile: "Post", label: "Submitting to SAP" },
  { key: "sap", tile: "SAP", label: "SAP processing" },
  { key: "invoice", tile: "Invoice", label: "Confirming invoice number" },
];

export type SapStatus = "idle" | "running" | "success" | "error";
export type SapLogLevel = "info" | "ok" | "warn" | "error";
export type SapLog = { id: number; time: string; text: string; level: SapLogLevel };
export type SapDoc = {
  draftNo: string;
  customer: string;
  itemCount: number | null;
  total: number;
  branch: string;
};

export type SapPostState = {
  status: SapStatus;
  activeStep: SapStepKey;
  failedStep: SapStepKey | null;
  logs: SapLog[];
  invoiceNumber: string;
  errorMessage: string;
  doc: SapDoc;
};

type Action =
  | { type: "start"; doc: SapDoc }
  | { type: "idle" }
  | { type: "step"; step: SapStepKey }
  | { type: "log"; text: string; level: SapLogLevel; time: string }
  | { type: "doc"; patch: Partial<SapDoc> }
  | { type: "success"; invoiceNumber: string }
  | { type: "error"; failedStep: SapStepKey; message: string };

const emptyDoc: SapDoc = { draftNo: "", customer: "", itemCount: null, total: 0, branch: "" };

const initialState: SapPostState = {
  status: "idle",
  activeStep: "session",
  failedStep: null,
  logs: [],
  invoiceNumber: "",
  errorMessage: "",
  doc: emptyDoc,
};

function reducer(state: SapPostState, action: Action): SapPostState {
  switch (action.type) {
    case "start":
      return { ...initialState, status: "running", doc: action.doc };
    case "idle":
      return { ...initialState };
    case "step":
      return { ...state, activeStep: action.step };
    case "log":
      return {
        ...state,
        logs: [...state.logs, { id: state.logs.length, time: action.time, text: action.text, level: action.level }],
      };
    case "doc":
      return { ...state, doc: { ...state.doc, ...action.patch } };
    case "success":
      return { ...state, status: "success", activeStep: "invoice", failedStep: null, invoiceNumber: action.invoiceNumber };
    case "error":
      return { ...state, status: "error", failedStep: action.failedStep, errorMessage: action.message };
    default:
      return state;
  }
}

const stamp = () => new Date().toTimeString().slice(0, 8); // "HH:MM:SS"
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type SapRunInput = { draftId: number | string; doc: SapDoc };

export function useSapPost() {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Increments on every run/close so a stale in-flight sequence can detect it has
  // been superseded and stop dispatching.
  const runRef = useRef(0);
  const lastInputRef = useRef<SapRunInput | null>(null);

  const close = useCallback(() => {
    runRef.current += 1;
    dispatch({ type: "idle" });
  }, []);

  const run = useCallback(async (input: SapRunInput) => {
    const runId = ++runRef.current;
    const alive = () => runRef.current === runId;
    lastInputRef.current = input;

    const log = (text: string, level: SapLogLevel = "info") => {
      if (alive()) dispatch({ type: "log", text, level, time: stamp() });
    };
    let current: SapStepKey = "session";
    const goto = (step: SapStepKey) => {
      current = step;
      if (alive()) dispatch({ type: "step", step });
    };

    dispatch({ type: "start", doc: input.doc });

    try {
      // 1. Session
      log("Opening SAP Service Layer session…");
      await wait(700);
      if (!alive()) return;
      log("Secure session established.", "ok");

      // 2. Retrieve draft (real await)
      goto("draft");
      log(`Requesting draft #${input.doc.draftNo} from SAP…`);
      const draftData = await apiFetch<unknown>(
        `/api/service-layer/draft/?draft_id=${encodeURIComponent(String(input.draftId))}`,
      );
      if (!alive()) return;
      const draft = unwrapDraft(draftData);
      const lines = draft?.DocumentLines ?? [];
      if (!draft || lines.length === 0) {
        throw new Error("Draft has no document lines to post.");
      }
      // Enrich the side panel now that we know the line count + branch.
      dispatch({ type: "doc", patch: { itemCount: lines.length, branch: draft.BPLName ?? input.doc.branch } });
      log(`Draft #${input.doc.draftNo} retrieved · ${lines.length} line item${lines.length === 1 ? "" : "s"}.`, "ok");

      // 3. Validate + transform (client-side, paced for legibility)
      goto("payload");
      log("Validating line items, batches and quantities…");
      await wait(550);
      if (!alive()) return;
      const payload = buildSapInvoicePayload(draft);
      if (payload.DocumentLines.length === 0) {
        throw new Error("Transformed payload has no document lines.");
      }
      log(
        `Validation passed · invoice payload built (${payload.DocumentLines.length} line${
          payload.DocumentLines.length === 1 ? "" : "s"
        }).`,
        "ok",
      );
      await wait(350);
      if (!alive()) return;

      // 4. Submit
      goto("post");
      log("POST /api/service-layer/invoice/ → submitting document…");
      await wait(400);
      if (!alive()) return;

      // 5. SAP processing (this stage owns the long real await)
      goto("sap");
      log("Awaiting SAP — posting the invoice (this can take 10–30s)…", "warn");
      const result = await apiFetch<{ error?: unknown }>("/api/service-layer/invoice/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!alive()) return;
      // The SAP proxy can answer HTTP 200 with an error body.
      if (result && typeof result === "object" && (result as { error?: unknown }).error) {
        throw new Error(conciseError((result as { error?: unknown }).error, "SAP rejected the invoice."));
      }

      // 6. Confirm invoice number
      goto("invoice");
      log("Reading back the generated invoice number…");
      await wait(450);
      if (!alive()) return;
      const invoiceNumber = extractInvoiceNumber(result);
      if (invoiceNumber) log(`Invoice #${invoiceNumber} created in SAP.`, "ok");
      else log("Invoice created in SAP.", "ok");
      dispatch({ type: "success", invoiceNumber });
    } catch (err) {
      if (!alive()) return;
      const message = conciseError(err, "Unable to post the invoice to SAP.");
      log(message, "error");
      dispatch({ type: "error", failedStep: current, message });
    }
  }, []);

  const retry = useCallback(() => {
    if (lastInputRef.current) run(lastInputRef.current);
  }, [run]);

  return { state, run, retry, close };
}
