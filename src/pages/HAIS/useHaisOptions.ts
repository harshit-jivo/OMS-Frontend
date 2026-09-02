import { useQuery } from "@tanstack/react-query";
import { haisService, type HaisOption } from "../../services/haisService";

/** Stable empties, so a consumer's `useMemo` does not recompute forever. */
const NONE: HaisOption[] = [];

type Options = {
  assetTypes: HaisOption[];
  departments: HaisOption[];
  storageTypes: HaisOption[];
  loading: boolean;
  error: string;
};

/**
 * Loads the HAIS dropdown masters (Asset Type / Department / Storage Type) from
 * the DB once. Working Status is NOT here — it stays a static code list.
 */
export function useHaisOptions(): Options {
  /*
   * One key for all three masters. They are fetched together, they change
   * together, and every consumer needs all three — splitting them would mean
   * three cache entries that can disagree about how stale they are.
   *
   * `AssetForm` used to DISCARD the `loading` flag, so an edit record rendered
   * a blank Asset Type select while the masters were still in flight and it
   * looked like the record had no type.
   */
  const { data, isPending, isError } = useQuery({
    queryKey: ["hais", "options"],
    queryFn: async () => {
      const [assetTypes, departments, storageTypes] = await Promise.all([
        haisService.options.assetTypes(),
        haisService.options.departments(),
        haisService.options.storageTypes(),
      ]);
      return { assetTypes, departments, storageTypes };
    },
  });

  return {
    assetTypes: data?.assetTypes ?? NONE,
    departments: data?.departments ?? NONE,
    storageTypes: data?.storageTypes ?? NONE,
    loading: isPending,
    error: isError ? "Could not load dropdown options from the server." : "",
  };
}
