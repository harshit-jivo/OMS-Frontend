/**
 * Types shared across the Scheme Manager page and its sub-components.
 *
 * Split out of `Scheme_Manager.tsx` (Phase 4) — unchanged from what that file
 * declared inline.
 */

/** A party as `/sap/parties/` returns it, narrowed to what this page reads. */
export type PartyOption = { card_code: string; card_name: string };

/** A product as `/sap/products/` returns it, narrowed to what this page reads. */
export type CatalogueItem = { item_code: string; item_name: string; category?: string };
