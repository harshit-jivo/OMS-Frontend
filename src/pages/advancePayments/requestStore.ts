/**
 * The advance requests both pages see — IN MEMORY, for this browser tab only.
 *
 * There is no create endpoint yet, so a submitted request has nowhere to go
 * but here. Holding it in one module-level store (rather than in each page's
 * state) is what makes the preview hang together: a request raised on
 * `/Advance_Payment_Request` appears on the approval desk as Pending, and the
 * approver's decision shows on the requester's Entries tab — without either
 * page knowing about the other.
 *
 * It starts from the sample requests and is lost on reload. When the backend
 * lands, `useRequests` becomes a query and `addRequest` / `updateRequest`
 * become mutations; the pages keep calling the same three names.
 */
import { useSyncExternalStore } from "react";

import { SAMPLE_REQUESTS, type AdvanceRequestEntry } from "./approvalData";
import type { MockAttachment } from "./attachments";
import type { RequestForm } from "./rules";

let entries: AdvanceRequestEntry[] = SAMPLE_REQUESTS;
const listeners = new Set<() => void>();

function emit(next: AdvanceRequestEntry[]) {
  entries = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every request, newest first. Re-renders the caller on any change. */
export function useRequests(): AdvanceRequestEntry[] {
  return useSyncExternalStore(subscribe, () => entries);
}

/** The next `AP-<year>-<nnnn>`, one past the highest number held. */
function nextRequestNo(): string {
  const year = new Date().getFullYear();
  const highest = entries.reduce((max, e) => {
    const n = Number(e.requestNo.split("-").pop());
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  return `AP-${year}-${String(highest + 1).padStart(4, "0")}`;
}

/** Raise a request: it joins the list as Pending, at the top. */
export function addRequest(
  form: RequestForm,
  files: MockAttachment[],
  requestedBy: string,
): AdvanceRequestEntry {
  const entry: AdvanceRequestEntry = {
    id: `r-${Date.now()}`,
    requestNo: nextRequestNo(),
    requestedBy,
    requestedOn: new Date().toISOString(),
    form,
    files,
    status: "PENDING",
  };
  emit([entry, ...entries]);
  return entry;
}

export function updateRequest(id: string, patch: Partial<AdvanceRequestEntry>) {
  emit(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

/** Back to the sample requests — for tests, which share the module. */
export function resetRequests() {
  emit(SAMPLE_REQUESTS);
}
