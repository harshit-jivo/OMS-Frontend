/**
 * The Add Sales line item: its shape, a blank one, and the rules that decide
 * whether one can be confirmed.
 *
 * Split out of Add_Sales.tsx because a component file that also exports
 * helpers breaks Fast Refresh (`react-refresh/only-export-components`), and
 * because rules worth testing should not require mounting a 4,200-line page.
 */
import type { RowType } from "../services/ordersService";

export type SalesRowScheme = {
  scheme: string;
  schemeQty: string;
};

export type SalesRow = RowType & {
  /**
   * A stable identity for this line, for as long as the page is open.
   *
   * The scheme maps that live alongside `rows` — `schemeOptions` (what the
   * legacy picker offers) and `schemeProposals` (what the v2 engine resolved)
   * — used to be keyed by the row's POSITION in the array. Deleting a row then
   * meant renumbering every key above it by hand, and any operation that
   * reordered rows without that fix-up handed one row's schemes to another.
   * That is also why `useFieldArray` could not be adopted: its `remove` and
   * `move` renumber silently, with nothing to hook.
   *
   * Keyed by uid, deletion and reordering need no fix-up at all: a key either
   * belongs to a row that still exists or belongs to nothing.
   *
   * Not persisted, and never sent — it exists only between mount and unmount.
   */
  uid: string;
  confirmed: boolean;
  // schemeLtrs?: string;
  schemeItemCode?: string;
  schemes: SalesRowScheme[];
};

/**
 * A counter, not a UUID or a timestamp.
 *
 * Uids only have to be unique within one open page, and a counter is the one
 * generator that is also deterministic — the visual suite freezes `Date` and
 * seeds `Math.random`, and anything drawn from either would still differ
 * between a test run and a reload.
 */
let rowSequence = 0;
export const nextRowUid = () => `row-${++rowSequence}`;

export const createEmptyRow = (): SalesRow => ({
  uid: nextRowUid(),
  category: "",
  brand: "",
  variety: "",
  type: "",
  item: "",
  isScheme: false,
  scheme: "",
  schemeQty: "",
  // schemeLtrs: "",
  pcs: "",
  qty: "",
  ltrs: "",
  boxes: "",
  priceListBasic: "",
  basicPrice: "",
  tax: "",
  amount: "",
  confirmed: false,
  schemes: [],
});

/*
 * Returns WHY a row cannot be confirmed, or null if it can.
 *
 * It used to be a bare boolean, and both confirm buttons answered a failure
 * with "Please complete this item before confirming it." — a sentence that
 * names nothing. The field most likely to be at fault is the one the user
 * cannot do anything about: `pcs` is the pack size copied off the product
 * master (`sal_factor2`, lines 1457 and 2094) and BOTH of its inputs are
 * readOnly. Asking someone to complete a field with no keyboard path to it
 * produces a support ticket, not a corrected order.
 *
 * Same conditions in the same order as before — only the reporting changed.
 */
export const rowProblem = (row: SalesRow): string | null => {
  if (!row.category || !row.type || !row.item) {
    return "Choose a category, type and item for this line.";
  }
  // Master data, not input — so the message names the real owner of the fix.
  // The arithmetic already tolerates this (line 1503 falls back to a factor
  // of 1), which is why the row looks complete and only the Pcs cell is blank.
  if (Number(row.pcs) <= 0) {
    return (
      `${row.item} has no pack size in the item master, so it cannot be ` +
      `ordered. Ask for its pack size to be set, then reload this page.`
    );
  }
  if (Number(row.boxes) <= 0 || Number(row.qty) <= 0) {
    return "Enter boxes and quantity greater than 0.";
  }
  if (
    row.isScheme &&
    !row.schemes.every((scheme) => scheme.scheme && Number(scheme.schemeQty || 0) > 0)
  ) {
    return "Every scheme line needs a scheme and a quantity greater than 0.";
  }
  return null;
};
