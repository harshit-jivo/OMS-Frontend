/**
 * How an item is counted on an order line, read off its SAP item-code prefix.
 *
 * FG  packed oil / beverages — sold in boxes of `sal_factor2` pieces, and
 *     `sal_pack_unit` (SAP OITM.SalPackUn) is the litres in one piece.
 * RM  loose oil — counted in pieces, but `sal_pack_unit` is still litres.
 * PM, CG, SC  packaging, consumables, gift articles — plain pieces. Their
 *     `sal_pack_unit` is SAP's default of 1 or an unrelated number, so
 *     qty x pack unit reported 25 empty tins as "25 litres".
 *
 * Mirrors the backend's `orders.services.litres`.
 */
const LITRE_ITEM_PREFIXES = ["FG", "RM"];
const BOXED_ITEM_PREFIXES = ["FG"];

const hasPrefix = (itemCode: string | null | undefined, prefixes: string[]) => {
  const code = String(itemCode || "").trim().toUpperCase();
  return prefixes.some((prefix) => code.startsWith(prefix));
};

/** Whether the line's LTRS figure means anything. */
export const isLitreItem = (itemCode: string | null | undefined) =>
  hasPrefix(itemCode, LITRE_ITEM_PREFIXES);

/**
 * Whether the item is sold in boxes. Every other item is entered and shown as
 * a plain count of pieces: its qty IS the pieces, with no Boxes or per-box Pcs.
 * An unknown code (no product resolved yet) is treated as boxed, the old
 * behaviour.
 */
export const isBoxedItem = (itemCode: string | null | undefined) =>
  !String(itemCode || "").trim() || hasPrefix(itemCode, BOXED_ITEM_PREFIXES);

export const litresPerPiece = (
  product: { item_code?: string | null; sal_pack_unit?: string | number | null } | null | undefined,
) => (product && isLitreItem(product.item_code) ? Number(product.sal_pack_unit) || 0 : 0);
