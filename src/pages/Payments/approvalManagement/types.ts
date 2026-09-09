/**
 * Shared types for the Approval console's tab modules (Phase 4 split of
 * ApprovalManagement.tsx).
 */

export type Tab = "analytics" | "workflows" | "levels" | "approvers" | "masters";

export type Flash = (text: string, kind?: "ok" | "err") => void;

/**
 * The shape every tab's list query is adapted to.
 *
 * Phase 3.1 moved each tab's fetch from `useResource` (hand-rolled
 * useState/useEffect, see ../useApprovalAdmin.ts) to `useQuery`. Adapting the
 * query back to this shape — the one `useResource` already returned — means
 * the JSX in every tab component keeps reading `resource.data` /
 * `.loading` / `.error` / `.reload` unchanged; only what sits behind those
 * four fields moved.
 */
export interface Resource<T> {
  data: T;
  loading: boolean;
  /** Empty string when the last load succeeded. */
  error: string;
  reload: () => void;
}

/**
 * The Levels and Approvers tabs both show the same workflow's levels (one
 * lists them for reordering, the other for assigning approvers to each). A
 * shared key — rather than each tab declaring its own — lets `useQuery`
 * de-duplicate the two, so switching between the two tabs does not refetch
 * data the other just loaded, and a mutation from either tab's `reload()`
 * refreshes both.
 */
export const levelsQueryKey = (workflowId: number | null) =>
  ["approvals", "levels", workflowId] as const;
