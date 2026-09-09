/**
 * Display formatters for the Approval console.
 *
 * Kept out of ApprovalUI.tsx so that file exports components only — mixing
 * the two breaks React Fast Refresh.
 */

export const formatDateTime = (value: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatMoney = (value: string | number): string => {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
};

/** "3d 4h" / "5h 12m" / "just now" — how long a request has been waiting. */
export const formatAge = (since: string | null): string => {
  if (!since) return "—";
  const start = new Date(since).getTime();
  if (Number.isNaN(start)) return "—";
  const mins = Math.floor((Date.now() - start) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
};
