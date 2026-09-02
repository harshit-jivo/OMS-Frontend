/**
 * The five SAP master-data lists behind the Sap Sync tabs.
 *
 * WHY THEY SHARE A FILE
 * ---------------------
 * Parties, Addresses, Products, Branches and Logs are five copies of the same
 * page: fetch a list on mount, filter it by a search box, paginate it. Each one
 * carried its own `useState` + `useEffect` + try/catch/finally, and each one
 * got the same three things wrong in the same way — a `loading` flag that only
 * described the first load, an error swallowed into `console.log` leaving the
 * page showing "No parties found", and a refetch on every visit to a tab the
 * user is switching between.
 *
 * They are one tabbed screen, so switching tabs now renders from cache. That is
 * the whole reason these queries are keyed under a shared `["sap", …]` prefix
 * rather than declared inline: a future "sync finished" handler can invalidate
 * `["sap"]` and every tab reloads, which is what the Sync button ought to do
 * and currently cannot.
 *
 * The endpoints return a bare array, but two of the five pages already coerced
 * with `Array.isArray(...) ? data : []` and three did not. They all do now —
 * the coercion is in the query, so a page cannot forget it.
 */
import { useQuery } from "@tanstack/react-query";

import { sapService } from "../services/sapService";
import type { Address, Branch, Log, Party, Product } from "../services/sapService";

/** One array identity for every empty result, so `useMemo` consumers settle. */
const EMPTY: never[] = [];

/**
 * Accept a bare array, `{data: [...]}` or `{results: [...]}`.
 *
 * Started as `Array.isArray(data) ? data : EMPTY`, which was enough for the five
 * tabs. It is not enough for the pages Phase 3.1 moved onto these keys:
 * Scheme_Manager unwrapped `/sap/parties/` as
 * `Array.isArray(d) ? d : d?.results || d?.data || []` and Combo_Mapping as
 * `d?.results || []`. Three consumers independently reaching for an envelope
 * fallback is evidence the endpoint has answered with one; narrowing that to a
 * bare array here would turn a shape they survive into a silently empty list.
 */
const asList = <T>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  const body = data as { data?: unknown; results?: unknown } | null | undefined;
  if (Array.isArray(body?.data)) return body.data as T[];
  if (Array.isArray(body?.results)) return body.results as T[];
  return EMPTY;
};

/**
 * What every one of these pages needs, in the same shape.
 *
 * `isLoading` is the first load only — the thing the old `loading` flag was
 * trying to be. `isFetching` also covers a manual Refresh, which the old flag
 * conflated with it: pressing Refresh replaced the whole table with the word
 * "Loading…" instead of leaving the data up while it reloaded.
 */
type ListQuery<T> = {
  items: T[];
  isLoading: boolean;
  isFetching: boolean;
  /** True once the fetch has failed. The pages used to swallow the error into
   *  `console.log` and render an empty list, which reads as "no data". */
  isError: boolean;
  refetch: () => void;
};

function useSapList<T>(key: string, fetcher: () => Promise<unknown>): ListQuery<T> {
  const query = useQuery({
    queryKey: ["sap", key],
    queryFn: fetcher,
  });
  return {
    items: asList<T>(query.data),
    isLoading: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

export const useSapParties = () => useSapList<Party>("parties", sapService.getParties);
export const useSapAddresses = () => useSapList<Address>("addresses", sapService.getAddresses);
export const useSapProducts = () => useSapList<Product>("products", sapService.getProducts);
export const useSapBranches = () => useSapList<Branch>("branches", sapService.getBranches);
export const useSapLogs = () => useSapList<Log>("logs", sapService.getLogs);

/**
 * The variety (sub-group) list for one product category.
 *
 * Unlike the five lists above this one is PARAMETERISED and CONDITIONAL: App_User
 * only wants it once a category has been chosen in the user form. It lived in a
 * `useEffect` on the derived `selectedCategoryName` whose fetcher opened with a
 * synchronous `setVarietyOptions([])` before its first await — a
 * `react-hooks/set-state-in-effect` violation that was only legal because the
 * fetch below it made the effect unanalysable.
 *
 * `enabled` replaces both the effect and that clearing branch: with no category
 * the query never runs and `varieties` is the stable empty.
 *
 * NOTE the `isLoading` here is NOT `query.isPending`. A disabled TanStack v5
 * query reports `isPending: true` forever — it has no data and never will —
 * so a spinner bound to it would show permanently on a form nobody has touched.
 */
export function useProductVarieties(category: string) {
  const enabled = Boolean(category);
  const query = useQuery({
    queryKey: ["sap", "product-varieties", category],
    queryFn: () => sapService.getProductVarieties(category),
    enabled,
    // The endpoint has answered under both names. Picking one and hoping is how
    // the dropdown silently empties; both are accepted, once, here.
    select: (data): string[] =>
      Array.isArray(data?.sub_groups)
        ? data.sub_groups
        : Array.isArray(data?.varieties)
          ? data.varieties
          : EMPTY,
  });
  return {
    varieties: query.data ?? EMPTY,
    isLoading: enabled && query.isPending,
    isError: query.isError,
  };
}
