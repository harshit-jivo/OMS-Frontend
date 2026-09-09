/**
 * The order header — party, addresses, dispatch, dates, company, PO — as a
 * schema.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE HEADER FIRST, AND ONLY THE HEADER
 * ─────────────────────────────────────────────────────────────────────────
 * Plan step 5 stops here on purpose. The line items carry their own array
 * state, two scheme maps and a confirm gate, and moving them is step 6; the
 * header is eight flat strings and is where the rules currently disagree with
 * each other.
 *
 * They disagree in three places, all of which this file settles:
 *
 *   * **The wizard checks the header; `validateBeforeSave` does not.**
 *     `canAdvance(1)` requires a party, both addresses, a dispatch branch and
 *     a delivery date, and `canAdvance(3)` requires a company. The save path
 *     checks NONE of them — it validates the items and the PO field and stops.
 *     On the legacy form, which has no `canAdvance` at all, that is the only
 *     validation there is: its own `required` attributes for those four fields
 *     sit on `type="hidden"` inputs, which the HTML spec bars from constraint
 *     validation. An order with no ship-to address could be saved from it, and
 *     `Number("")` reaches the backend as `null`.
 *   * **The two gates were written twice**, in two files, in two styles.
 *   * **An address must be a NUMBER to survive the trip.** `submitOrder` sends
 *     `Number(formData.billAddress)`, so a non-numeric value becomes `NaN` and
 *     serialises to `null` — an order saved against no address, silently. The
 *     id fields are checked as digits here rather than as "not empty".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MESSAGES NAME THE FIX, NOT THE RULE
 * ─────────────────────────────────────────────────────────────────────────
 * Every message says which control to go and use, because the header can fail
 * on a step the user is no longer looking at.
 */
import { z } from "zod";

/**
 * A picked-from-a-list id: present, and numeric, because it is sent as one.
 *
 * One `superRefine` rather than `.min(1).regex(...)`, because those are not
 * short-circuited — an empty value fails both and the field reports two
 * messages, one of which ("could not be read") is wrong for a field nobody has
 * touched yet. A field gets one problem at a time.
 */
const idOf = (what: string) =>
  z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (!value) {
        ctx.addIssue({ code: "custom", message: `Choose a ${what}.` });
      } else if (!/^\d+$/.test(value)) {
        ctx.addIssue({
          code: "custom",
          message: `The ${what} could not be read — choose it again.`,
        });
      }
    });

const chosen = (what: string) =>
  z
    .string()
    .trim()
    .min(1, { message: `Choose a ${what}.` });

/**
 * How the PO field is configured for this user, which is admin-controlled and
 * therefore not something a static schema can know.
 *
 * `canEdit` is `poField.enabled` and, in edit mode, the original
 * `allowPoNumber` guard; `required` is the admin flag. PO is mandatory only
 * when both are true — it used to be blocked whenever the field was merely
 * visible, which made the flag a lie.
 */
export type PoFieldConfig = {
  canEdit: boolean;
  required: boolean;
  label: string;
};

/** The header fields, exactly as `formData` holds them (all strings). */
export type OrderHeaderInput = {
  parties: string;
  billAddress: string;
  shipAddress: string;
  dispatch: string;
  Deliverydate: string;
  company: string;
  poNumber: string;
};

export const orderHeaderSchema = (po: PoFieldConfig) =>
  z
    .object({
      parties: chosen("party"),
      billAddress: idOf("bill-to address"),
      shipAddress: idOf("ship-to address"),
      dispatch: idOf("dispatch branch"),
      Deliverydate: chosen("delivery date"),
      company: idOf("company"),
      poNumber: z.string(),
    })
    .superRefine((header, ctx) => {
      if (po.canEdit && po.required && !header.poNumber.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["poNumber"],
          message: `${po.label} is required.`,
        });
      }
    });

/**
 * The fields step 1 of the wizard is responsible for.
 *
 * Company lives on step 3 and PO is optional, so gating step 1 on the whole
 * header would trap the user on a screen that cannot fix it.
 */
const STEP_ONE_FIELDS = [
  "parties",
  "billAddress",
  "shipAddress",
  "dispatch",
  "Deliverydate",
] as const;

/** Every problem with the header, in field order. */
export const headerIssues = (
  header: OrderHeaderInput,
  po: PoFieldConfig,
): { field: keyof OrderHeaderInput; message: string }[] => {
  const result = orderHeaderSchema(po).safeParse(header);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    field: issue.path[0] as keyof OrderHeaderInput,
    message: issue.message,
  }));
};

/** The first problem with the header, or null. What the alert says today. */
export const headerProblem = (header: OrderHeaderInput, po: PoFieldConfig): string | null =>
  headerIssues(header, po)[0]?.message ?? null;

/** Whether every field the given wizard step owns is filled in and usable. */
export const stepOneComplete = (header: OrderHeaderInput, po: PoFieldConfig): boolean =>
  !headerIssues(header, po).some((issue) =>
    (STEP_ONE_FIELDS as readonly string[]).includes(issue.field),
  );

/** Whether step 3's own field — the company — is usable. */
export const stepThreeComplete = (header: OrderHeaderInput, po: PoFieldConfig): boolean =>
  !headerIssues(header, po).some((issue) => issue.field === "company");
