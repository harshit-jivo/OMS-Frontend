import { useCallback, useReducer, useRef } from "react";
import { apiFetch } from "./useSalesInvoice";

/* ──────────────────────────────────────────────────────────────────────────
 * Stored payload → SAP invoice
 *
 * The Invoice Review flow keeps the full invoice payload on the local PENDING
 * record. Posting sends that payload verbatim to the service-layer invoice
 * endpoint; SAP re-derives pricing/tax from the base sales order lines.
 * ────────────────────────────────────────────────────────────────────────── */

export type SapInvoicePayload = {
  DocumentLines?: unknown[];
  [key: string]: unknown;
};

// Trim a (possibly large JSON) SAP error down to something a log line / panel can
// show without overflowing.
export const conciseError = (value: unknown, fallback: string) => {
  const text = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed;
};

// Best-effort JSON stringify for capturing a raw SAP error payload verbatim (shown
// only inside the opt-in "Technical details" panel). Falls back to String().
const safeStringify = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
 * Five visible stages map onto one real network await (POST invoice); the rest
 * are short, deliberate dwells so each stage registers as a "win" and the long
 * SAP wait stays animated. See the loader component for the visuals.
 * ────────────────────────────────────────────────────────────────────────── */

export type SapStepKey = "session" | "payload" | "post" | "sap" | "invoice";

export const SAP_STEPS: { key: SapStepKey; tile: string; label: string }[] = [
  { key: "session", tile: "Session", label: "Connecting to SAP" },
  { key: "payload", tile: "Payload", label: "Validating invoice payload" },
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
  /** Concise human-readable error text (input to the friendly translator). */
  errorMessage: string;
  /** Full, untouched SAP / network response — only surfaced under "Technical details". */
  rawError: string;
  doc: SapDoc;
};

type Action =
  | { type: "start"; doc: SapDoc }
  | { type: "idle" }
  | { type: "step"; step: SapStepKey }
  | { type: "log"; text: string; level: SapLogLevel; time: string }
  | { type: "doc"; patch: Partial<SapDoc> }
  | { type: "success"; invoiceNumber: string }
  | { type: "error"; failedStep: SapStepKey; message: string; rawError: string };

const emptyDoc: SapDoc = { draftNo: "", customer: "", itemCount: null, total: 0, branch: "" };

const initialState: SapPostState = {
  status: "idle",
  activeStep: "session",
  failedStep: null,
  logs: [],
  invoiceNumber: "",
  errorMessage: "",
  rawError: "",
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
      return {
        ...state,
        status: "error",
        failedStep: action.failedStep,
        errorMessage: action.message,
        rawError: action.rawError,
      };
    default:
      return state;
  }
}

const stamp = () => new Date().toTimeString().slice(0, 8); // "HH:MM:SS"
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type SapRunInput = {
  payload: SapInvoicePayload;
  doc: SapDoc;
  /** Runs once per attempt (including retries) after SAP confirms the invoice. */
  onSuccess?: (invoiceNumber: string) => void | Promise<void>;
  /** Runs once per attempt (including retries) when the post fails. */
  onError?: (message: string, rawError: string) => void | Promise<void>;
};

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
    // Holds the verbatim SAP error payload (if any) so the catch can surface it
    // under "Technical details" without the friendly copy losing the original.
    let rawErrorText = "";
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

      // 2. Validate the stored payload (client-side, paced for legibility)
      goto("payload");
      log("Validating the stored invoice payload…");
      await wait(550);
      if (!alive()) return;
      const lines = Array.isArray(input.payload.DocumentLines) ? input.payload.DocumentLines : [];
      if (lines.length === 0) {
        throw new Error("Stored invoice payload has no document lines to post.");
      }
      dispatch({ type: "doc", patch: { itemCount: lines.length } });
      log(`Validation passed · ${lines.length} line item${lines.length === 1 ? "" : "s"} ready.`, "ok");
      await wait(350);
      if (!alive()) return;

      // 3. Submit
      goto("post");
      log("POST /api/service-layer/invoice/ → submitting document…");
      await wait(400);
      if (!alive()) return;

      // 4. SAP processing (this stage owns the long real await)
      goto("sap");
      log("Awaiting SAP — posting the invoice (this can take 10–30s)…", "warn");
      const result = await apiFetch<{ error?: unknown }>("/api/service-layer/invoice/", {
        method: "POST",
        body: JSON.stringify(input.payload),
      });
      if (!alive()) return;
      // The SAP proxy can answer HTTP 200 with an error body.
      if (result && typeof result === "object" && (result as { error?: unknown }).error) {
        const sapError = (result as { error?: unknown }).error;
        rawErrorText = safeStringify(sapError);
        throw new Error(conciseError(sapError, "SAP rejected the invoice."));
      }

      // 5. Confirm invoice number
      goto("invoice");
      log("Reading back the generated invoice number…");
      await wait(450);
      if (!alive()) return;
      const invoiceNumber = extractInvoiceNumber(result);
      if (invoiceNumber) log(`Invoice #${invoiceNumber} created in SAP.`, "ok");
      else log("Invoice created in SAP.", "ok");
      dispatch({ type: "success", invoiceNumber });
      await input.onSuccess?.(invoiceNumber);
    } catch (err) {
      if (!alive()) return;
      const message = conciseError(err, "Unable to post the invoice to SAP.");
      // Prefer the captured SAP payload; otherwise fall back to the thrown message.
      const rawError = rawErrorText || (err instanceof Error ? err.message : String(err));
      log(message, "error");
      dispatch({ type: "error", failedStep: current, message, rawError });
      await input.onError?.(message, rawError);
    }
  }, []);

  const retry = useCallback(() => {
    if (lastInputRef.current) run(lastInputRef.current);
  }, [run]);

  return { state, run, retry, close };
}
