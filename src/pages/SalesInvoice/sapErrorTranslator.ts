/* ──────────────────────────────────────────────────────────────────────────
 * SAP error translator
 *
 * SAP Business One / Service Layer surfaces failures as raw, developer-facing
 * payloads — and the useful part is usually buried. A typical response looks like
 *
 *   {"error":"SAP Error","details":{"error":{"code":"-1116","message":
 *     "(13000316) Credit Limit Exceeded! Current Limit is 10.00, Balance Amount is 262,500.20"}}}
 *
 * The top-level "error" is a generic wrapper; the real business reason is the deep
 * `message`. This module digs out that meaningful reason, promotes it to a clear
 * headline, pulls any amounts into structured facts, and renders calm, actionable
 * copy: WHAT happened, WHY, and WHAT TO DO next. The UI only ever shows the
 * translated result; the raw payload stays in an opt-in "Technical details" panel.
 * ────────────────────────────────────────────────────────────────────────── */

export type Fact = { label: string; value: string };

export type FriendlyError = {
  /** The business reason, shown as the largest text, e.g. "Credit Limit Exceeded". */
  title: string;
  /** A plain-English sentence: what happened and why (may be empty if the title says it all). */
  summary: string;
  /** Structured figures pulled from the message (e.g. credit limit / balance). */
  facts: Fact[];
  /** The next step the user can take. */
  action: string;
  /**
   * A cleaned, readable rendering of the system's own words (no JSON/braces/codes),
   * kept for context. Empty when SAP gave us nothing usable.
   */
  detail: string;
  /**
   * True when the failure is most likely temporary (network blip, SAP busy) and a
   * plain retry will probably succeed. False when something in the data/config has
   * to be corrected first. Either way no invoice was created, so retrying is safe —
   * this flag only tunes the reassurance copy.
   */
  transient: boolean;
};

/* ── Raw message extraction ───────────────────────────────────────────────
 * Walk the whole response (string, JSON envelope, or nested object) and pick the
 * single most meaningful sentence — skipping generic wrappers like "SAP Error",
 * empty strings and bare codes. */

const GENERIC_NOISE = new Set([
  "sap error",
  "error",
  "errors",
  "an error occurred",
  "server error",
  "internal server error",
  "bad request",
  "unknown error",
  "failure",
  "failed",
  "request failed",
  "exception",
  "null",
  "undefined",
]);

const collectStrings = (value: unknown, out: string[]): void => {
  if (value == null) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) out.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) collectStrings(nested, out);
  }
};

// Higher = more likely to be the real business reason.
const scoreMessage = (text: string): number => {
  if (GENERIC_NOISE.has(text.toLowerCase())) return -1;
  if (!/[a-z]/i.test(text)) return -1; // pure codes / numbers
  let score = Math.min(text.length, 200);
  if (/\s/.test(text.trim())) score += 25; // a real sentence, not a single token
  if (/exceed|not\s|cannot|can'?t|required|invalid|missing|insufficient|found|limit|locked|closed|denied|blocked|not\s*enough/i.test(text)) {
    score += 20;
  }
  return score;
};

const pickBusinessMessage = (value: unknown): string => {
  const found: string[] = [];
  collectStrings(value, found);
  let best = "";
  let bestScore = 0;
  for (const candidate of found) {
    const score = scoreMessage(candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
};

export const extractRawMessage = (input: unknown): string => {
  if (input == null) return "";
  if (typeof input === "object") return pickBusinessMessage(input);
  if (typeof input !== "string") return String(input);

  const text = input.trim();
  if (!text) return "";

  // Tolerate a JSON envelope and dig for the meaningful message inside.
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const picked = pickBusinessMessage(JSON.parse(text));
      if (picked) return picked;
    } catch {
      // Not valid JSON — fall through and treat the string itself as the message.
    }
  }
  // A bare string: keep it unless it's just a generic wrapper.
  return scoreMessage(text) < 0 ? "" : text;
};

/* ── Plain-language pass ───────────────────────────────────────────────────
 * Swap the SAP field names / codes that leak into error text for everyday words. */

const PLAIN_TERMS: Array<[RegExp, string]> = [
  [/type\s*\(\s*draft\s*\/\s*invoice\s*\)/gi, "document type"],
  [/\bcard\s*code\b/gi, "customer code"],
  [/\bcard\s*name\b/gi, "customer name"],
  [/\bbusiness\s*partner\b/gi, "customer"],
  [/\bwhs\s*code\b/gi, "warehouse"],
  [/\bwarehouse\s*code\b/gi, "warehouse"],
  [/\bship\s*to\s*code\b/gi, "delivery address"],
  [/\bpay\s*to\s*code\b/gi, "billing address"],
  [/\bdoc\s*due\s*date\b/gi, "due date"],
  [/\bdoc\s*date\b/gi, "document date"],
  [/\btax\s*date\b/gi, "tax date"],
  [/\bitem\s*code\b/gi, "item"],
  [/\bbatch\s*num(ber)?\b/gi, "batch number"],
  [/\bsales\s*person\s*code\b/gi, "salesperson"],
  [/\bdoc\s*entry\b/gi, "document"],
  [/\bdoc\s*num\b/gi, "document number"],
  [/\bnum\s*at\s*card\b/gi, "customer reference"],
];

const toPlainLanguage = (text: string): string =>
  PLAIN_TERMS.reduce((acc, [pattern, plain]) => acc.replace(pattern, plain), text);

const stripLeadingCode = (text: string): string =>
  text.replace(/^\(?-?\d{3,}\)?\s*[:.-]?\s*/, "").replace(/^[{[("'\s]+/, "");

/* ── Humanise the raw message ──────────────────────────────────────────────
 * Turn the extracted text into one clean, readable sentence. */

const DETAIL_MAX_LENGTH = 200;

export const humanizeSapMessage = (input: unknown): string => {
  let message = extractRawMessage(input);
  if (!message) return "";
  message = stripLeadingCode(message).replace(/[}\])"'\s]+$/g, "");
  message = toPlainLanguage(message).replace(/\s+/g, " ").trim();
  if (!message) return "";
  if (message.length > DETAIL_MAX_LENGTH) message = `${message.slice(0, DETAIL_MAX_LENGTH - 1).trimEnd()}…`;
  message = message.charAt(0).toUpperCase() + message.slice(1);
  if (!/[.!?…]$/.test(message)) message += ".";
  return message;
};

/* ── Amount / fact parsing ─────────────────────────────────────────────────
 * Lift "<label> is <amount>" figures out of the message into structured rows and
 * format them as currency (₹, Indian grouping). */

const formatAmount = (numberText: string): string => {
  const n = Number(numberText.replace(/,/g, ""));
  if (!Number.isFinite(n)) return numberText.trim();
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const titleCaseLabel = (label: string): string =>
  label.trim().replace(/\s+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

// Generic monetary facts: only numbers that look like money (have a "." or ",").
const parseAmountFacts = (message: string): Fact[] => {
  const facts: Fact[] = [];
  const pattern = /([A-Za-z][A-Za-z ]{2,28}?)\s+is\s+(\d[\d,]*(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(message)) !== null) {
    const number = match[2];
    if (!/[.,]/.test(number)) continue; // skip plain counts like "Quantity is 5"
    facts.push({ label: titleCaseLabel(match[1]), value: formatAmount(number) });
    if (facts.length >= 4) break;
  }
  return facts;
};

// Credit-specific facts with friendly labels.
const parseCreditFacts = (message: string): Fact[] => {
  const facts: Fact[] = [];
  const limit = message.match(/(?:credit\s*)?limit\s*(?:is|:)?\s*(\d[\d,]*(?:\.\d+)?)/i);
  const balance = message.match(/balance(?:\s*amount)?\s*(?:is|:)?\s*(\d[\d,]*(?:\.\d+)?)/i);
  if (limit) facts.push({ label: "Current Credit Limit", value: formatAmount(limit[1]) });
  if (balance) facts.push({ label: "Outstanding Balance", value: formatAmount(balance[1]) });
  return facts;
};

// Promote the first clause of an unrecognised message to a prominent headline.
const TITLE_MAX_LENGTH = 48;

const deriveTitle = (message: string): string => {
  let head = stripLeadingCode(message).split(/[!?.,;:]/)[0] ?? "";
  head = toPlainLanguage(head).replace(/\s+/g, " ").trim();
  if (!head) return "";
  if (head.length > TITLE_MAX_LENGTH) head = `${head.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
  return head.charAt(0).toUpperCase() + head.slice(1);
};

/* ── Mapping layer ─────────────────────────────────────────────────────────
 * Ordered rules: the first whose pattern matches the raw message wins, so put the
 * most specific patterns first. `enrich` adds runtime data (e.g. parsed amounts). */

type ErrorCopy = Omit<FriendlyError, "detail" | "facts">;
type Rule = { match: RegExp; result: ErrorCopy; enrich?: (message: string) => Partial<FriendlyError> };

const RULES: Rule[] = [
  // Credit limit exceeded — pull the limit + outstanding balance into facts.
  {
    match: /credit\s*limit/i,
    result: {
      title: "Credit Limit Exceeded",
      summary: "This customer has exceeded their allowed credit limit.",
      action: "The invoice can't be created until the credit issue is resolved.",
      transient: false,
    },
    enrich: (message) => ({ facts: parseCreditFacts(message) }),
  },
  // Missing / invalid document type — e.g. "Type(DRAFT / INVOICE) is Required".
  {
    match: /\btype\s*\(?\s*draft\s*\/\s*invoice|document\s*type|docobjectcode|object\s*type|type.*required/i,
    result: {
      title: "Document Type Missing",
      summary: "A required document type is missing from this invoice.",
      action: "Please verify the invoice configuration and try again.",
      transient: false,
    },
  },
  // Customer / business partner not found or invalid.
  {
    match: /cardcode|card\s*code|business\s*partner|\bbp\b.*(not\s*found|invalid|missing)|customer.*(not\s*found|invalid)/i,
    result: {
      title: "Customer Not Found",
      summary: "The selected customer could not be located in SAP.",
      action: "Please verify the customer details and try again.",
      transient: false,
    },
  },
  // Warehouse misconfiguration.
  {
    match: /warehouse|whscode|whs\s*code|\bwhse?\b/i,
    result: {
      title: "Warehouse Configuration Issue",
      summary: "One or more items reference an unavailable warehouse.",
      action: "Please review the item configuration and try again.",
      transient: false,
    },
  },
  // Batch / serial allocation problems.
  {
    match: /batch|serial/i,
    result: {
      title: "Batch Allocation Issue",
      summary: "Some items don't have a valid batch or serial assignment.",
      action: "Please review the batch details for each item and try again.",
      transient: false,
    },
  },
  // Insufficient / unavailable stock.
  {
    match: /insufficient|out\s*of\s*stock|not\s*enough|available\s*quantity|stock|on[-\s]?hand/i,
    result: {
      title: "Not Enough Stock",
      summary: "There isn't enough available stock to fulfil one or more items.",
      action: "Please review the item quantities or restock, then try again.",
      transient: false,
    },
  },
  // Our own guard: a draft that carries no line items.
  {
    match: /no\s*document\s*lines|document\s*lines|no\s*line\s*items|has\s*no\s*items/i,
    result: {
      title: "Invoice Has No Items",
      summary: "This invoice doesn't contain any line items to process.",
      action: "Please review the order contents and try again.",
      transient: false,
    },
  },
  // Pricing / tax derivation.
  {
    match: /price|pricing|\btax\b|\bvat\b|gst/i,
    result: {
      title: "Pricing Issue",
      summary: "There's a problem with the pricing or tax on one or more items.",
      action: "Please review the pricing details and try again.",
      transient: false,
    },
  },
  // Closed accounting period / posting date.
  {
    match: /posting\s*period|period\s*is\s*(locked|closed)|date.*(locked|closed|invalid)|closed\s*period/i,
    result: {
      title: "Accounting Period Closed",
      summary: "This invoice can't be posted in the current accounting period.",
      action: "Please contact your finance team to confirm the open period, then try again.",
      transient: false,
    },
  },
  // Authentication / session expiry.
  {
    match: /unauthor|forbidden|\b401\b|\b403\b|session|token|sign[\s-]?in|log[\s-]?in|credential/i,
    result: {
      title: "Session Expired",
      summary: "Your secure connection to SAP has expired.",
      action: "Please sign in again and retry.",
      transient: true,
    },
  },
  // Network / gateway / timeout / server error / SAP busy.
  {
    match: /failed\s*to\s*fetch|networkerror|network\s*error|timeout|timed\s*out|gateway|\b5\d{2}\b|request\s*failed|econnrefused|unavailable|temporarily/i,
    result: {
      title: "Connection Interrupted",
      summary: "We couldn't reach SAP just now. This is usually temporary.",
      action: "Please check your connection and try again in a moment.",
      transient: true,
    },
  },
];

const FALLBACK: ErrorCopy = {
  title: "Invoice Creation Stopped",
  summary: "Something stopped this invoice before it could be created.",
  action: "Please review the order details and try again.",
  transient: false,
};

/**
 * Translate a raw SAP / network error into calm, business-friendly copy.
 * Always returns a usable result. Recognised errors get curated copy (and any
 * parsed facts); unrecognised ones still surface the real reason by promoting it
 * to the headline — never a bare "SAP Error".
 */
export const translateSapError = (rawError: unknown): FriendlyError => {
  const message = extractRawMessage(rawError);
  const detail = humanizeSapMessage(message);

  if (!message) return { ...FALLBACK, detail: "", facts: [] };

  for (const rule of RULES) {
    if (rule.match.test(message)) {
      return { ...rule.result, detail, facts: [], ...(rule.enrich ? rule.enrich(message) : {}) };
    }
  }

  // Unrecognised: lead with the actual reason as the headline, lift any amounts.
  const title = deriveTitle(message);
  if (title) {
    return { title, summary: "", action: FALLBACK.action, detail, facts: parseAmountFacts(message), transient: false };
  }
  return { ...FALLBACK, summary: detail || FALLBACK.summary, detail, facts: [] };
};
