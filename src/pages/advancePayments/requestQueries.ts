/**
 * The requests both pages read, from `/advance-payments/requests/`.
 *
 * One query per list (the requester's own, the approval desk's) and one per
 * opened request. Every action answers with the request as it now stands,
 * which `useStoreRequest` writes into the cache and follows by refreshing the
 * lists, so a decision shows everywhere at once without a reload.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  advancePaymentService,
  type ApiRequest,
  type RequestScope,
} from "../../services/advancePaymentService";
import { fromApiRequest } from "./requestApi";

export const requestKeys = {
  all: ["advance-payments", "requests"] as const,
  list: (scope: RequestScope) => ["advance-payments", "requests", "list", scope] as const,
  detail: (id: number) => ["advance-payments", "requests", "detail", id] as const,
};

export function useRequestList(scope: RequestScope) {
  return useQuery({
    queryKey: requestKeys.list(scope),
    queryFn: async () => (await advancePaymentService.requests(scope)).map(fromApiRequest),
    staleTime: 15_000,
  });
}

export function useRequestDetail(id: number | null) {
  return useQuery({
    queryKey: requestKeys.detail(id ?? 0),
    queryFn: async () => fromApiRequest(await advancePaymentService.request(id as number)),
    enabled: id !== null,
  });
}

/** Keep what an action answered with, and have the lists catch up. */
export function useStoreRequest() {
  const client = useQueryClient();
  return (api: ApiRequest) => {
    client.setQueryData(requestKeys.detail(api.id), fromApiRequest(api));
    void client.invalidateQueries({ queryKey: [...requestKeys.all, "list"] });
    return fromApiRequest(api);
  };
}
