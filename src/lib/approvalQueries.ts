/**
 * The order queues behind the three approval screens, plus the per-order detail.
 *
 * Billing_Order, Auditor_Order and Rate_Approver_Order are the same screen with
 * a different `getOrders(...)` argument: fetch a queue on mount, filter it by a
 * date range in the client, open one order in a detail panel, approve or reject.
 * Each carried its own `useState` + `useEffect` + try/catch, and each swallowed
 * the fetch error into `console.log` and rendered "No orders found" — which on
 * an approval queue reads as "there is nothing to approve".
 *
 * `["order-details", id]` is the key that actually pays: `getOrderDetails` is
 * called from EIGHT sites across these pages, twice per order on every one of
 * them — once to open the panel and again inside the Excel export, for the same
 * order the panel is already showing.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ordersService } from "../services/ordersService";
import type { Order } from "../services/ordersService";
import { sortOrders } from "../utils/orderHistory";

/** Stable empty, so the client-side date filter does not recompute forever. */
const NO_ORDERS: Order[] = [];

/**
 * One queue.
 *
 * `sortOrders` and any queue-specific filtering run in `select`, not in the
 * queryFn — so they are applied to cached data too, and a refetch that returns
 * an unchanged body does not re-sort.
 */
export function useOrderQueue(
  key: readonly unknown[],
  fetcher: () => Promise<Order[]>,
  filter?: (order: Order) => boolean,
) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: fetcher,
    select: (raw: Order[]) => {
      const list = Array.isArray(raw) ? raw : NO_ORDERS;
      return sortOrders(filter ? list.filter(filter) : list);
    },
  });
  return {
    orders: data ?? NO_ORDERS,
    isOrdersLoading: isPending,
    /** True once the queue has failed to load. Was a `console.log`. */
    ordersFailed: isError,
    refetchOrders: () => void refetch(),
  };
}

/**
 * One order's full detail, fetched on demand.
 *
 * Deliberately imperative rather than a `useQuery` keyed on a selected id. The
 * detail panel is opened from a row click AND from a `location.state` handoff,
 * and the three pages call this from inside handlers that also set unrelated
 * state; `fetchQuery` keeps that shape while still de-duplicating the two calls
 * per order (open the panel, then export it) through the shared cache.
 */
export function useOrderDetailsFetcher() {
  const queryClient = useQueryClient();
  return (orderId: number) =>
    queryClient.fetchQuery({
      queryKey: ["order-details", orderId],
      queryFn: () => ordersService.getOrderDetails(orderId),
    });
}
