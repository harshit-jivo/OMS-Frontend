/**
 * The all-requests register: where every request stands, and the filters that
 * narrow it. Every filter is a list — empty means "any" — and they combine:
 * a request is shown only when it passes all of them.
 */
import { payeeOf, type AdvanceRequestEntry, type ApprovalStatus } from "./approvalData";
import { PARTNER_TYPES, PAYMENT_AGAINST_OPTIONS } from "./constants";
import { STATUS_LABEL, filterRequests } from "./requestLabels";

export interface RegisterFilters {
  search: string;
  statuses: ApprovalStatus[];
  /** Where it waits now: a stage's name, or "With creator". */
  desks: string[];
  companies: string[];
  types: string[];
  against: string[];
  /** The payee: a SAP code, or `name:<payee>` for one with none (an Expense). */
  partners: string[];
  /** Usernames: who decided on it, or whom it waits on now. */
  approvers: string[];
  /** The creator's username. */
  creators: string[];
  /** Raised on or after / on or before, `YYYY-MM-DD`. */
  from: string;
  to: string;
}

export const NO_REGISTER_FILTERS: RegisterFilters = {
  search: "",
  statuses: [],
  desks: [],
  companies: [],
  types: [],
  against: [],
  partners: [],
  approvers: [],
  creators: [],
  from: "",
  to: "",
};

export const RETURNED_DESK = "With creator";

/** Where it is now: the stage it waits at, with its creator, or nowhere (settled). */
export function deskOf(entry: AdvanceRequestEntry): string {
  if (entry.status === "PENDING") return entry.api.flow?.current_stage || "";
  if (entry.status === "RETURNED") return RETURNED_DESK;
  return "";
}

/** One line for the "Where now" column. */
export function whereNow(entry: AdvanceRequestEntry): string {
  const desk = deskOf(entry);
  if (entry.status === "PENDING") {
    const who = entry.api.flow?.current_user;
    return [desk || "Pending", who ? who.name || who.username : ""].filter(Boolean).join(" · ");
  }
  if (entry.status === "RETURNED") return `${RETURNED_DESK} · ${entry.requestedBy}`;
  return entry.status === "APPROVED" ? "Completed" : STATUS_LABEL[entry.status];
}

export function partnerKey(entry: AdvanceRequestEntry): string {
  return entry.form.partner || `name:${payeeOf(entry.form)}`;
}

/** Everyone who decided on it, then whom it waits on now. */
export function approverUsernames(entry: AdvanceRequestEntry): string[] {
  const names = (entry.api.approvers ?? []).map((p) => p.username);
  const now = entry.status === "PENDING" ? entry.api.flow?.current_user?.username : undefined;
  return now && !names.includes(now) ? [...names, now] : names;
}

/** The day it was raised, in the viewer's own time zone. */
export function raisedOn(entry: AdvanceRequestEntry): string {
  const d = new Date(entry.requestedOn);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const any = <T,>(chosen: readonly T[], value: T) => chosen.length === 0 || chosen.includes(value);

export function filterRegister(entries: AdvanceRequestEntry[], f: RegisterFilters): AdvanceRequestEntry[] {
  // The search box: the same match as every other request list.
  return filterRequests(entries, { search: f.search, company: "", status: "" }).filter((entry) => {
    const day = raisedOn(entry);
    return (
      any(f.statuses, entry.status) &&
      any(f.desks, deskOf(entry)) &&
      any(f.companies, entry.form.company as string) &&
      any(f.types, entry.form.type as string) &&
      any(f.against, entry.form.paymentAgainst as string) &&
      any(f.partners, partnerKey(entry)) &&
      (f.approvers.length === 0 || approverUsernames(entry).some((u) => f.approvers.includes(u))) &&
      any(f.creators, entry.api.created_by?.username ?? "") &&
      (!f.from || day >= f.from) &&
      (!f.to || day <= f.to)
    );
  });
}

/** How many filters are set — the "Clear filters (N)" count. */
export function activeFilterCount(f: RegisterFilters): number {
  const lists = [f.statuses, f.desks, f.companies, f.types, f.against, f.partners, f.approvers, f.creators];
  return lists.filter((l) => l.length > 0).length + [f.search.trim(), f.from, f.to].filter(Boolean).length;
}

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label);

/** Each picker's choices: the values the requests actually carry. */
export function registerOptions(entries: AdvanceRequestEntry[]) {
  const desks = new Map<string, Option>();
  const partners = new Map<string, Option>();
  const approvers = new Map<string, Option>();
  const creators = new Map<string, Option>();
  for (const e of entries) {
    const desk = deskOf(e);
    if (desk) desks.set(desk, { value: desk, label: desk });
    partners.set(partnerKey(e), {
      value: partnerKey(e),
      label: payeeOf(e.form) || e.form.partner || "—",
      hint: e.form.partner || undefined,
    });
    for (const p of e.api.approvers ?? []) {
      approvers.set(p.username, { value: p.username, label: p.name || p.username, hint: p.username });
    }
    const now = e.status === "PENDING" ? e.api.flow?.current_user : null;
    if (now) approvers.set(now.username, { value: now.username, label: now.name || now.username, hint: now.username });
    const by = e.api.created_by;
    if (by) creators.set(by.username, { value: by.username, label: by.name || by.username, hint: by.username });
  }
  return {
    statuses: (Object.keys(STATUS_LABEL) as ApprovalStatus[]).map((s) => ({
      value: s,
      label: s === "APPROVED" ? "Approved (completed)" : STATUS_LABEL[s],
    })),
    desks: [...desks.values()].sort(byLabel),
    types: PARTNER_TYPES.map((t) => ({ value: t.value as string, label: t.label as string })),
    against: PAYMENT_AGAINST_OPTIONS.map((o) => ({ value: o.value as string, label: o.label as string })),
    partners: [...partners.values()].sort(byLabel),
    approvers: [...approvers.values()].sort(byLabel),
    creators: [...creators.values()].sort(byLabel),
  };
}
