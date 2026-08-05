import { useEffect, useState } from "react";
import { haisService, type HaisOption } from "../../services/haisService";

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
  const [assetTypes, setAssetTypes] = useState<HaisOption[]>([]);
  const [departments, setDepartments] = useState<HaisOption[]>([]);
  const [storageTypes, setStorageTypes] = useState<HaisOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      haisService.options.assetTypes(),
      haisService.options.departments(),
      haisService.options.storageTypes(),
    ])
      .then(([at, dept, st]) => {
        if (!alive) return;
        setAssetTypes(at);
        setDepartments(dept);
        setStorageTypes(st);
      })
      .catch(() => {
        if (alive) setError("Could not load dropdown options from the server.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { assetTypes, departments, storageTypes, loading, error };
}
