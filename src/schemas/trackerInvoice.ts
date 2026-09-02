/**
 * The tracker invoice form, as a schema.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A SCHEMA RATHER THAN THE `validate()` IT REPLACES
 * ─────────────────────────────────────────────────────────────────────────
 * The hand-rolled version was thirteen `if (!form.x) e.x = "Required"` lines,
 * and it had the two problems that shape always has:
 *
 *   * **The rule and the type were separate claims.** `InvoiceWrite` says
 *     `gst_type: number`, `validate()` says it must be truthy, and nothing
 *     connected them — so `gst_type: 0` type-checked, failed validation, and
 *     the reason lived in a different file from the type. Here the schema
 *     produces the type: `TrackerInvoiceInput` is inferred, so a rule and a
 *     field cannot drift apart.
 *   * **It only ran on submit.** Errors appeared as a batch after pressing
 *     Review, including for a field the user had already fixed. A resolver
 *     re-runs per field on change once a field has been touched.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE MESSAGES ARE THE UI
 * ─────────────────────────────────────────────────────────────────────────
 * "Required" is what every one of the thirteen said. It is accurate and it is
 * the least useful thing a message can say when eleven fields are empty at
 * once, so each field names itself. This is the sort of thing that is easy to
 * fix once, here, and never worth fixing thirteen times in an `if` chain.
 */
import { z } from "zod";

/** `YYYY-MM-DD` for today, in local time — the max an invoice date may be. */
export function todayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * A dropdown whose ids start at 1, so 0 is "nothing chosen".
 *
 * Modelled explicitly rather than as `z.number().min(1)` because the message
 * for "you have not picked one" should not read like a range error.
 */
const chosen = (what: string) =>
  z.number().int().refine((value) => value > 0, { message: `Choose a ${what}` });

const required = (what: string) =>
  z.string().trim().min(1, { message: `Enter the ${what}` });

export const trackerInvoiceSchema = z
  .object({
    invoice_date: required("invoice date").refine(
      (value) => value <= todayISO(),
      // The old message was "Cannot be a future date", which describes the
      // rule. This describes the fix.
      { message: "Invoice date cannot be later than today" },
    ),
    /** Held as `YYYY-MM` by the month picker; widened to a date on submit. */
    effective_month: required("effective month"),
    party_name: required("party name"),
    /** Filled in only when a SAP vendor is picked; free text is allowed. */
    party_code: z.string().default(""),
    party_gstin: z.string().default(""),
    invoice_number: required("invoice number"),
    taxable_value: required("taxable value").refine(
      (value) => Number(value) > 0,
      { message: "Taxable value must be more than zero" },
    ),
    gst_type: chosen("GST type"),
    gst_rate: chosen("GST rate"),
    additional_charge_type: z.string().default(""),
    additional_charge_amount: z.string().default(""),
    category: chosen("category"),
    unit: chosen("unit"),
    branch: chosen("branch"),
    mode: chosen("mode"),
  })
  /*
   * A rule the `if` chain could not express, and therefore did not have: an
   * additional charge with no amount silently posted as zero. The backend
   * needs a number either way, so this is not a server-side error waiting to
   * happen — it is a data-entry mistake that used to be invisible.
   */
  .refine(
    (form) =>
      !form.additional_charge_type || Number(form.additional_charge_amount) > 0,
    {
      message: "Enter the amount for the additional charge",
      path: ["additional_charge_amount"],
    },
  );

export type TrackerInvoiceInput = z.input<typeof trackerInvoiceSchema>;
export type TrackerInvoiceOutput = z.output<typeof trackerInvoiceSchema>;

/**
 * Form values → the API's payload.
 *
 * The two shape differences the form has always had, kept in one place rather
 * than inline at the submit call: the month picker gives `YYYY-MM` where the
 * API stores a date, and a blank charge amount must post as `"0"` rather than
 * an empty string.
 */
export function toInvoicePayload(form: TrackerInvoiceOutput) {
  return {
    ...form,
    effective_month: form.effective_month ? `${form.effective_month}-01` : "",
    additional_charge_amount: form.additional_charge_type
      ? form.additional_charge_amount || "0"
      : "0",
  };
}
