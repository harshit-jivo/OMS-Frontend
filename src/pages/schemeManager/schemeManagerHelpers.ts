/**
 * Small pure helpers shared by the Scheme Manager page and its sub-components.
 * Split out of `Scheme_Manager.tsx` (Phase 4) verbatim.
 */

/** SAP item codes are prefixed by kind: FG finished goods, PM packing material,
 *  RM raw material, plus CG and SC. Only FG is sellable, so only FG can appear
 *  in a scheme. */
export const isFinishedGood = (itemCode: string | undefined | null) =>
  !!itemCode && itemCode.trim().toUpperCase().startsWith("FG");

export const CATEGORIES = ["OIL", "BEVERAGES", "MART"];

/** Pull the API's message / errors out of an axios rejection without `any`. */
export const apiErrorText = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string; errors?: unknown } } })?.response
    ?.data;
  if (data?.errors) return `${fallback}: ${JSON.stringify(data.errors)}`;
  return data?.message || fallback;
};
