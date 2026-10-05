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
import type { MasterOrderParams, OrderStatus } from "../services/ordersService";
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

/**
 * The Order Master feed — every order in scope with its stage trail.
 *
 * Server-paginated, so unlike the other hooks here the filters are part of the
 * key: each (page, filter) combination is its own cached page rather than one
 * blob the page slices client-side. `placeholderData` keeps the previous page
 * on screen while the next loads, so paging does not blank the table.
 */
export function useMasterOrders(params: MasterOrderParams) {
  const { data, isPending, isFetching, error } = useQuery({
    queryKey: ["orders", "master", params],
    queryFn: () => ordersService.getMasterOrders(params),
    placeholderData: (previous) => previous,
  });

  return {
    orders: data?.results ?? [],
    pagination: data?.pagination,
    isLoading: isPending,
    isRefreshing: isFetching && !isPending,
    error,
  };
}

/**
 * The master page's creator filter. Reference data — it changes only when
 * somebody raises their first order — so it is cached under its own key rather
 * than refetched with each page of results.
 */
export function useMasterOrderCreators() {
  const { data } = useQuery({
    queryKey: ["orders", "master", "creators"],
    queryFn: ordersService.getMasterOrderCreators,
  });
  return data ?? [];
}

/**
 * One order's full detail, for the master page's info dialog.
 *
 * Shares the `["order-details", id]` key with `useOrderDetailsFetcher`, so an
 * order opened here and then opened on an approval screen is fetched once.
 * Declarative rather than imperative because this caller genuinely is a
 * selected id — the dialog is open on an order or it is not — which is the
 * shape `fetchQuery` was avoiding for the pages that open a detail panel from
 * a handler doing three other things.
 */
export function useOrderDetail(orderId: number | null) {
  const { data, isPending, error } = useQuery({
    queryKey: ["order-details", orderId],
    queryFn: () => ordersService.getOrderDetails(orderId as number),
    enabled: orderId !== null,
  });

  return { order: data ?? null, isLoading: orderId !== null && isPending, error };
}
