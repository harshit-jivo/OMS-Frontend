/**
 * Litres per piece of an item, for an order line's LTRS column.
 *
 * `sal_pack_unit` is SAP's OITM.SalPackUn. JIVO keeps it equal to the litres in
 * one piece only for liquid stock: FG (packed oil / beverages, e.g. 15 on a
 * 15 LTR tin) and RM (loose oil). On PM, CG and SC items (packaging,
 * consumables, gift articles) it is SAP's default of 1 or an unrelated number,
 * so multiplying it by qty turned 25 empty tins into "25 litres". Those items
 * carry no litres. Mirrors the backend's `orders.services.litres`.
 */
const LITRE_ITEM_PREFIXES = ["FG", "RM"];

export const isLitreItem = (itemCode: string | null | undefined) => {
  const code = String(itemCode || "").trim().toUpperCase();
  return LITRE_ITEM_PREFIXES.some((prefix) => code.startsWith(prefix));
};

export const litresPerPiece = (
  product: { item_code?: string | null; sal_pack_unit?: string | number | null } | null | undefined,
) => (product && isLitreItem(product.item_code) ? Number(product.sal_pack_unit) || 0 : 0);
