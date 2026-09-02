/**
 * The queries the three manager reports share.
 *
 * Daily_Report, PersonWise_Report and Sales_Report each fetched the same three
 * things on mount — the manager order history, the user list and the main-group
 * list — with three near-identical copies of the same try/catch/setState block
 * per page. Nine copies for three pieces of data.
 *
 * Sharing the KEY is the point, not sharing the code. All three pages sit
 * behind the same Reports menu and people move between them; with one key per
 * dataset, the second and third page render from cache instead of refetching
 * a full order history that has not changed in the two seconds since.
 *
 * `loadManagerOrders` in particular is the expensive one — it is the whole
 * history the reports filter down — and it was being refetched in full on every
 * navigation between the three.
 *
 * The user list and the main-group list used to live here too. They are `/auth/`
 * lookups that six pages share, not report data, so they moved to
 * `authQueries.ts` when Phase 3.1 gave App_User, Party_Assignment and
 * Page_Permissions the same keys. Import `useUserList` / `useMainGroups` from
 * there.
 */
import { useQuery } from "@tanstack/react-query";

import { loadManagerOrders } from "../utils/orderHistory";

/**
 * Stable empties, so a page with no data yet does not hand its `useMemo`s a new
 * array identity on every render — which is what makes them recompute forever.
 */
const NO_ORDERS: Awaited<ReturnType<typeof loadManagerOrders>> = [];

export function useManagerOrders() {
  const { data, isPending } = useQuery({
    queryKey: ["manager-orders"],
    queryFn: loadManagerOrders,
  });
  return { orders: data ?? NO_ORDERS, isOrdersLoading: isPending };
}
