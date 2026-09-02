/**
 * Pure formatting/normalisation helpers for the Dashboard page. Pulled out of
 * `Dashboard.tsx` verbatim (Phase 4 decomposition) — none of these read
 * component state.
 */
import { currencyPrefix } from "./constants";
import type { SupportedRole } from "./types";

export const fmt = (n: number | string) =>
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const fmtCurrency = (n: number | string) =>
  `${currencyPrefix}${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtCompactCurrency = (value: number | string) => {
  const amount = Number(value || 0);
  if (amount >= 10000000) return `${currencyPrefix}${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `${currencyPrefix}${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${currencyPrefix}${(amount / 1000).toFixed(1)}K`;
  return `${currencyPrefix}${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

export const normalizeRole = (role?: string): SupportedRole => {
  const value = role?.toLowerCase();
  if (
    value === "admin" ||
    value === "auditor" ||
    value === "manager" ||
    value === "billing" ||
    value === "approver"
  ) {
    return value;
  }
  return "manager";
};

export const mergeRejectedStatuses = <T extends { status: string; label: string; count: number }>(
  items: T[],
) => {
  const merged: Array<{ status: string; label: string; count: number }> = [];
  let rejectedItem: { status: string; label: string; count: number } | null = null;

  for (const item of items) {
    const statusValue = `${item.status} ${item.label}`.toLowerCase();

    if (statusValue.includes("rejected")) {
      if (!rejectedItem) {
        rejectedItem = { status: "rejected", label: "Rejected", count: 0 };
        merged.push(rejectedItem);
      }
      rejectedItem.count += item.count;
      continue;
    }

    merged.push(item);
  }

  return merged;
};

export const getStatusDisplayLabel = (item: { status: string; label: string }) => {
  const statusValue = `${item.status} ${item.label}`.toLowerCase();

  if (statusValue.includes("rate approval")) return "Rate Approver Pending";
  if (statusValue.includes("auditor approval")) return "Auditor Pending";
  if (statusValue.includes("billing") && !statusValue.includes("rejected"))
    return "Billing Pending";

  return item.label;
};

export const normalizeStatusLabels = <T extends { status: string; label: string; count: number }>(
  items: T[],
) =>
  items.map((item) => ({
    ...item,
    label: getStatusDisplayLabel(item),
  }));

export const shouldHideStatus = (item: { status: string; label: string }) => {
  const statusValue = `${item.status} ${item.label}`.toLowerCase();
  return statusValue.includes("order created");
};
