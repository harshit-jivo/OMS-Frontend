/**
 * The order lists three pages fetch on mount.
 *
 * `loadCurrentUserOrderSummaries()` is the whole order history for the signed-in
 * user, and View_Orders, Order_Tracking and the distributor's Order_Tracking
 * each fetched it separately with their own `useState` + `useEffect` +
 * try/catch. They sit next to each other in the menu, so moving between them
 * refetched the same history every time.
 *
 * As with `reportQueries`, sharing the KEY is the point rather than sharing the
 * code: one key per dataset means the second page renders from cache. The
 * status list and the assigned-party list are here for the same reason — they
 * are per-user reference data that changes far more slowly than a page visit.
 */
import { useQuery } from "@tanstack/react-query";

import { ordersService } from "../services/ordersService";
import type { OrderStatus } from "../services/ordersService";
import { loadCurrentUserOrderSummaries } from "../utils/orderHistory";

type OrderSummary = Awaited<ReturnType<typeof loadCurrentUserOrderSummaries>>[number];

/** Stable empties, so consumers' `useMemo`s do not recompute forever. */
const NO_ORDERS: OrderSummary[] = [];
const NO_STATUSES: OrderStatus[] = [];

export function useCurrentUserOrders() {
  const { data, isPending } = useQuery({
    queryKey: ["orders", "current-user"],
    queryFn: loadCurrentUserOrderSummaries,
  });
  return { orders: data ?? NO_ORDERS, isOrdersLoading: isPending };
}

export function useOrderStatuses(): OrderStatus[] {
  const { data } = useQuery({
    queryKey: ["orders", "statuses"],
    // `getOrdersStatus` returns `response.data` untyped, and the page it feeds
    // renders `s.id`/`s.name` straight into <option>s — so the shape is
    // asserted here, once, instead of inferred as `any` at every use.
    queryFn: async () => (await ordersService.getOrdersStatus()) as OrderStatus[],
  });
  return data ?? NO_STATUSES;
}

/** One party per card code, sorted by name — the View_Orders party filter. */
export type PartyFilterOption = { cardCode: string; cardName: string };

export function useAssignedParties(): PartyFilterOption[] {
  const { data } = useQuery({
    queryKey: ["orders", "assigned-parties"],
    queryFn: ordersService.getPartyName,
    // The de-duplication used to run inside the fetch effect, so it re-ran on
    // every render that touched it. In `select` it runs once per fetch, and the
    // result is cached with the query.
    select: (raw): PartyFilterOption[] => {
      const parties = Array.isArray(raw) ? raw : [];
      const unique = new Map<string, PartyFilterOption>();

      parties.forEach((party) => {
        const cardCode = String(party.value || party.card_code || "").trim();
        const rawLabel = String(party.label || party.card_name || "").trim();
        // The list's label is "Name (CODE)"; the filter shows the name alone.
        const cardName = rawLabel.replace(/\s*\([^)]*\)\s*$/, "") || cardCode;
        const key = cardCode || cardName;
        if (!key) return;
        unique.set(key, { cardCode, cardName });
      });

      return Array.from(unique.values()).sort((a, b) => a.cardName.localeCompare(b.cardName));
    },
  });
  return data ?? [];
}
