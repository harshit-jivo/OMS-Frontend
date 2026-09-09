/**
 * Bill prints, fetched through axios instead of by browser navigation.
 *
 * THE BUG THIS FIXES
 * ------------------
 * The invoice PDF was reached by putting the endpoint straight into an
 * `<iframe src>` and an `<a href>`:
 *
 *     <iframe src={`${API_BASE_URL}/invoice/crystal/?docNum=...`} />
 *
 * Those are browser navigations, not XHRs. The browser attaches cookies and
 * nothing else — no `Authorization` header, because only our axios interceptor
 * adds one. And this project authenticates with `JWTAuthentication` ALONE
 * (`DEFAULT_AUTHENTICATION_CLASSES` in settings.py names no session class), on
 * a view that inherits the project-wide `IsAuthenticated`.
 *
 * So the request arrives anonymous and is refused. There is no cookie fallback
 * to save it: a user signs in with a token, never with a Django session.
 *
 * Going through axios fixes the cause and brings the rest of the shared
 * pipeline with it:
 *
 *   * the access token is attached, so the request is actually authorised;
 *   * a 401 refreshes the token and retries once, rather than rendering an
 *     empty frame the user can only respond to by reloading the whole page;
 *   * the correlation ID goes with it, so a failed print is findable in the
 *     server log;
 *   * a failure becomes a message instead of a blank rectangle — an `<iframe>`
 *     that receives JSON shows the reader nothing useful.
 */
import api from "./api";

export interface BillPrintRef {
  /** The human-facing invoice number. Either this or `docEntry` is required. */
  docNum?: string;
  /** SAP's internal key, when the caller already has it. */
  docEntry?: string;
  /** Used only to name the downloaded file. */
  party?: string;
  /**
   * Which company database to resolve against. Oil, Beverage and Mart are
   * SEPARATE SAP databases with separate Crystal reports — the same DocNum is a
   * different document in each — so omitting this silently prints the OIL
   * invoice with that number. See invariant 6 in the refactor plan.
   */
  branch?: string;
}

/** The query the backend expects. Empty values are omitted, not sent blank. */
export function billPrintParams(ref: BillPrintRef): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of ["docNum", "docEntry", "party", "branch"] as const) {
    const value = String(ref[key] ?? "").trim();
    if (value) params[key] = value;
  }
  return params;
}

/**
 * Fetch the PDF as a blob.
 *
 * `responseType: "blob"` matters twice over: it stops axios trying to parse a
 * binary body as JSON, and it means an error response arrives as a Blob too —
 * which is why `billPrintError` below exists to read the message back out.
 */
export async function fetchBillPrint(ref: BillPrintRef): Promise<Blob> {
  const response = await api.get<Blob>("/invoice/crystal/", {
    params: billPrintParams(ref),
    responseType: "blob",
  });
  return response.data;
}

/**
 * Turn a failed bill-print request into something worth showing a user.
 *
 * With `responseType: "blob"` the server's JSON error body is delivered as a
 * Blob, so the usual `error.response.data.error` read yields a Blob object and
 * renders as "[object Blob]". It has to be read back as text first.
 */
export async function billPrintError(error: unknown): Promise<string> {
  const response = (error as { response?: { status?: number; data?: unknown } })?.response;
  if (!response) {
    return "Could not reach the server. Check your connection and try again.";
  }

  const data = response.data;
  if (data instanceof Blob) {
    try {
      const text = await readBlobText(data);
      const parsed: unknown = JSON.parse(text);
      const message =
        (parsed as { error?: string; detail?: string; message?: string })?.error
        ?? (parsed as { detail?: string })?.detail
        ?? (parsed as { message?: string })?.message;
      if (message) return String(message);
      if (text.trim()) return text.trim().slice(0, 300);
    } catch {
      /* not JSON, or unreadable — fall through to the status message */
    }
  }

  if (response.status === 404) return "No invoice found with that Doc Number for this company.";
  if (response.status === 502) return "The Crystal report service did not respond.";
  return `The bill print failed (HTTP ${response.status ?? "?"}).`;
}

/**
 * Characters Windows and macOS refuse in a filename, plus control characters.
 *
 * Built with `new RegExp` from a string rather than a literal, so the control
 * range is written as an escape and never appears as raw bytes in this
 * file. A literal NUL in source is invisible in every editor, survives a
 * copy-paste as something else, and makes the file read as binary to tooling —
 * which is exactly what happened on the first attempt at this line.
 *
 * Mirrors `_BAD_FILENAME_CHARS` in invoice/views.py, with space added so the
 * name collapses runs of whitespace the same way the server does.
 *
 * `no-control-regex` is disabled deliberately: the rule exists to catch a
 * control character that got into a pattern by accident, and here matching
 * them is the entire purpose. The directive sits on the line immediately above
 * the code, because that is the only place it applies — separated by so much
 * as an explanatory comment line, it silently targets the comment instead and
 * reports itself as unused while the original error stands.
 */
// eslint-disable-next-line no-control-regex
const BAD_FILENAME_CHARS = new RegExp('[<>:"/\\\\|?*\\u0000-\\u001f ]+', "g");

/** `'<DocNum> <Party>.pdf'`, matching what the server names the download. */
export function billPrintFilename(ref: BillPrintRef): string {
  const party = String(ref.party ?? "").replace(BAD_FILENAME_CHARS, " ");
  const stem = [ref.docNum || ref.docEntry, party.trim()].filter(Boolean).join(" ").trim();
  return `${stem || "invoice"}.pdf`;
}

/**
 * Read a Blob as text, without assuming `Blob.prototype.text` exists.
 *
 * It is the obvious call and it is missing in more places than expected:
 * Safari only shipped it in 14, and jsdom — which this project's tests run in —
 * implements neither `text()` nor `arrayBuffer()`. `FileReader` is the older,
 * universally available path.
 *
 * That is not a concession to the test environment. This runs on whatever
 * browser a warehouse terminal happens to have, and the whole point of the
 * function is to salvage an error message; falling back to "[object Blob]"
 * because the modern API was absent would defeat it exactly when things are
 * already going wrong.
 */
function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the response"));
    reader.readAsText(blob);
  });
}
