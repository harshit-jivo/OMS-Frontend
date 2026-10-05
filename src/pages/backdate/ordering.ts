import type { BackDateRequest } from "../../services/backdateService";

/**
 * Newest first, by the id the request was created with.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT LEFT TO THE SERVER
 * ─────────────────────────────────────────────────────────────────────────
 * The requester's list arrives already ordered (`-created_at`), but the
 * approval desk does not have one list: it MERGES the pending queue with the
 * decided history, two endpoints answering two questions. Concatenating them
 * ordered each part correctly and the whole thing not at all — every pending
 * request sat above every decided one regardless of age, so under "All" the
 * newest entry could appear halfway down the page.
 *
 * The id is the serial the request was created with, so it is the one key that
 * always means "latest first" — unlike any of the dates on a request, which
 * are typed by a person and can point anywhere.
 *
 * Sorting here is safe because neither endpoint paginates: both return the
 * whole set (the approval history caps at the server's own limit), so there is
 * no page for a client-side sort to reorder the wrong slice of.
 */
export function newestFirst(rows: BackDateRequest[]): BackDateRequest[] {
  return [...rows].sort((a, b) => b.id - a.id);
}
