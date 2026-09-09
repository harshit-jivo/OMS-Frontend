/**
 * One place that turns a thrown request into a sentence a person can read.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS THE FIX FOR THE `catch (error: any)` COUNT
 * ─────────────────────────────────────────────────────────────────────────
 * 36 of the codebase's `any`s are `catch (error: any)`, and they are `any`
 * because each site reaches into a different corner of the response by hand:
 *
 *     err?.response?.data?.detail        14 sites
 *     error?.response?.data?.message     12
 *     error?.response?.data?.sap_error    1
 *     error?.response?.data?.error        1
 *     error?.response?.data?.details      1
 *     error?.message                      5
 *
 * Typing each of those individually needs a response type per endpoint, which
 * the backend cannot yet give us (see types/api.ts). Extracting them once does
 * not: the shapes a Django REST API can return are a short, closed list, and
 * this file is that list.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS CHANGES WHAT USERS SEE, AND THE CHANGE IS THE POINT
 * ─────────────────────────────────────────────────────────────────────────
 * A site that read only `detail` showed its own generic fallback whenever the
 * server answered with `message` instead — "Action failed" in place of the
 * reason. Trying the keys in a fixed order means the server's own wording wins
 * wherever it exists, and the caller's fallback is what it was always meant to
 * be: the last resort.
 *
 * The order below is not alphabetical. `detail` is DRF's own key for raised
 * exceptions and is the most specific thing available when present; the field
 * map is last because "code: This field must be unique." is accurate but reads
 * worse than a sentence written for a person.
 *
 * Promoted from `pages/Payments/useApprovalAdmin.ts`, which had this right for
 * one module while 36 other sites each did it worse.
 */
import { isAxiosError } from "axios";

/** Shapes a DRF endpoint in this project actually returns on an error. */
type ErrorBody = {
  detail?: unknown;
  message?: unknown;
  error?: unknown;
  /** The SAP Service Layer's own message, forwarded verbatim. */
  sap_error?: unknown;
  details?: unknown;
  non_field_errors?: unknown;
  errors?: Record<string, unknown>;
};

/*
 * Order matters, and it is not alphabetical.
 *
 * `detail` is DRF's own key for a raised exception and is the most specific
 * thing available when present. `sap_error` sits ABOVE the generic `error`
 * because a SAP Service Layer failure sends both — the generic one says
 * "Failed to post", the SAP one names the item or the account, and
 * MartApproval had already worked that out by hand (index.tsx:131). The field
 * map is last: "code: This field must be unique." is accurate but reads worse
 * than a sentence written for a person.
 */
const KEYS = ["detail", "message", "sap_error", "error", "details"] as const;

function firstString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && value.length) return firstString(value[0]);
  return "";
}

/**
 * @param fallback what to say when the server said nothing usable. Keep it
 *   specific to the action ("Payment save failed"), not generic — it is the
 *   only text the user gets when the response is empty or unparseable.
 */
export function messageFrom(error: unknown, fallback = "Something went wrong"): string {
  // Not an HTTP failure at all — a TypeError from our own mapping code, say.
  // Its `.message` is developer text, so it must not reach the screen.
  if (!isAxiosError(error)) {
    return fallback;
  }

  const response = error.response;
  if (!response) {
    // No response object means the request never completed: DNS, offline,
    // CORS, or a timeout. None of those are worth a server-shaped message.
    return "Network error — check your connection and try again.";
  }

  const data = response.data as ErrorBody | string | undefined;

  if (typeof data === "string" && data.trim()) return data.trim();

  if (data && typeof data === "object") {
    for (const key of KEYS) {
      const text = firstString(data[key]);
      if (text) return text;
    }

    const nonField = firstString(data.non_field_errors);
    if (nonField) return nonField;

    // DRF field errors: {"code": ["This field must be unique."]}. Named,
    // because "This field" on its own does not say which field.
    const fields = data.errors ?? (data as Record<string, unknown>);
    for (const [field, value] of Object.entries(fields)) {
      const text = firstString(value);
      if (text) return field === "detail" ? text : `${field}: ${text}`;
    }
  }

  // Nothing in the body. Status alone is more use than "Something went wrong".
  if (response.status === 403) return "You do not have permission to do this.";
  if (response.status === 404) return "Not found — it may have been deleted.";
  if (response.status >= 500) return "The server failed to handle that. Try again.";

  return fallback;
}

/**
 * The response body, typed as "an object of unknowns" rather than `any`.
 *
 * `messageFrom` covers the sites that just want a sentence. Four do not: they
 * route a specific field's error to a specific place — a duplicate invoice
 * number onto the invoice-number input, an import's error list into a summary.
 * Those need the body itself, and this is what lets them read it without the
 * `catch (error: any)` that was the only reason they were `any` at all.
 *
 * Returns undefined when there is no response or the body is not an object, so
 * callers get optional chaining rather than a guard they might forget.
 */
export function errorBody(error: unknown): Record<string, unknown> | undefined {
  if (!isAxiosError(error)) return undefined;
  const data = error.response?.data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
}

/**
 * First string in a DRF field-error array: `{"field": ["msg", …]}` → `"msg"`.
 *
 * Exported because the sites above index a KNOWN field by name, which
 * `messageFrom`'s "first field wins" cannot express.
 */
export function fieldError(
  body: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = body?.[field];
  const text = firstString(value);
  return text || undefined;
}
