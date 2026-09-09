/**
 * The three formatters the SAP Sync tabs share.
 *
 * `dash` existed in four copies — Products, Branches, Logs and PartyDirectory
 * — which is harmless only while they agree. They did, on the em dash; the
 * risk is the fifth copy. `num` and `formatStamp` had two each.
 */

/** A blank cell reads as an em dash, never as an empty box. */
export const dash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

/** Indian digit grouping, which is what every count on these tabs uses. */
export const num = (value: unknown) => Number(value || 0).toLocaleString("en-IN");

/**
 * A timestamp, or the raw string if it will not parse.
 *
 * Returning the original rather than "Invalid Date" matters here: these values
 * come straight from SAP and a malformed one is a sync problem worth seeing.
 */
export const formatStamp = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};
