import { useQuery } from "@tanstack/react-query";
import { einvoiceService } from "../../services/einvoiceService";

/**
 * The NIC identities this deployment can act as — one per PAN.
 *
 * Jivo Wellness (AACCJ4223F) and Jivo Mart (AAFCJ4102J) are separate legal
 * entities with separate NIC credentials. Cancel, lookup and the GSTIN master
 * all authenticate as a seller GSTIN, so a screen has to say which entity it
 * is acting as or it silently uses the default one.
 *
 * Kept out of `EntityToggle.tsx` because that file exports a component, and
 * mixing hooks with components there breaks react-refresh.
 */
export function useNicEntities() {
  const { data } = useQuery({
    queryKey: ["einvoice", "entities"],
    queryFn: () => einvoiceService.listEntities(),
    staleTime: 10 * 60 * 1000, // configuration, not live data
  });
  return data?.results ?? [];
}

/** The entity a screen should start on: the configured default, else the first. */
export function useDefaultEntity() {
  const entities = useNicEntities();
  return entities.find((e) => e.is_default)?.key ?? entities[0]?.key ?? "";
}
