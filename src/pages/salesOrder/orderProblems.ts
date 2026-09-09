/**
 * Everything wrong with an order, addressed to the control that can fix it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES
 * ─────────────────────────────────────────────────────────────────────────
 * A chain of `alert()` calls, each of which returned at the first failure. That
 * has three problems, and they compound:
 *
 *   * **One at a time.** Six empty fields meant six submits, each answered by a
 *     modal dialog the user has to dismiss before they can go and look at the
 *     form again.
 *   * **Nowhere.** "Choose a ship-to address." names the field but not where it
 *     is, and on the wizard it can be two steps behind the one you are on.
 *   * **Nothing to test.** An `alert` is a browser dialog; a test that wants to
 *     assert a validation message has to intercept `window.alert` and take the
 *     page's word for what it means.
 *
 * So this returns the problems as data — a map from field to message, plus one
 * map from row uid to message — and the forms render them. The alert-based
 * `validateBeforeSave` becomes a lookup against the same structure, so the two
 * cannot disagree.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KEYED BY UID, NOT BY INDEX
 * ─────────────────────────────────────────────────────────────────────────
 * Row messages are keyed by `row.uid` for the same reason the scheme maps are
 * (see `SalesRow`): a message that follows the row it belongs to cannot end up
 * under a different one after a delete.
 */
import { headerIssues, type OrderHeaderInput, type PoFieldConfig } from "./orderHeaderSchema";
import { rowProblem, type SalesRow } from "../salesOrderRow";

export type OrderProblems = {
  /** By header field name, as `formData` holds them. */
  header: Partial<Record<keyof OrderHeaderInput, string>>;
  /** By `row.uid`. */
  rows: Record<string, string>;
  /** About the item list as a whole, which belongs to no single row. */
  items: string | null;
};

export const NO_PROBLEMS: OrderProblems = { header: {}, rows: {}, items: null };

export const hasProblems = (problems: OrderProblems): boolean =>
  Boolean(problems.items) ||
  Object.keys(problems.header).length > 0 ||
  Object.keys(problems.rows).length > 0;

/**
 * The first message, in the order the old `alert` chain produced them: the item
 * list, then the rows, then the header. Used where a single line is all there
 * is room for — a toast, a summary heading, a test.
 */
export const firstProblem = (problems: OrderProblems): string | null => {
  if (problems.items) return problems.items;
  const firstRow = Object.values(problems.rows)[0];
  if (firstRow) return firstRow;
  return Object.values(problems.header)[0] ?? null;
};

/**
 * Judge a whole order.
 *
 * The row rules are `rowProblem`'s — the same ones the confirm button uses, so
 * a row that could not be confirmed and a row that cannot be saved give the
 * same reason. They are re-checked here because a loaded order arrives with
 * `confirmed: true` from `mapOrderToRows` and never passes the confirm gate at
 * all.
 */
export const orderProblems = (
  header: OrderHeaderInput,
  po: PoFieldConfig,
  rows: SalesRow[],
): OrderProblems => {
  const problems: OrderProblems = { header: {}, rows: {}, items: null };

  for (const issue of headerIssues(header, po)) {
    // First message per field: the schema reports one per field, and if that
    // ever changes the first is the one the user should act on.
    problems.header[issue.field] ??= issue.message;
  }

  const confirmed = rows.filter((row) => row.confirmed);
  if (confirmed.length === 0) {
    problems.items = "Add at least one item, and confirm it, before saving.";
  } else if (rows.some((row) => !row.confirmed && row.item)) {
    // An item half-entered is not a saved item, and the row it sits in looks
    // finished. Naming it is the difference between "something is wrong" and
    // "press Confirm on that line".
    problems.items = "Confirm the item you are still editing before saving.";
  }

  for (const row of confirmed) {
    const problem = rowProblem(row);
    if (problem) problems.rows[row.uid] = problem;
  }

  return problems;
};
