/**
 * Resolved ladder preview.
 *
 * The `blocked` flag is the reason this exists: it is the only way to see
 * that a level has nobody able to approve it BEFORE a real document
 * deadlocks there.
 *
 * Phase 3.1: was a `useResource` fetch/effect keyed on
 * `[workflowId, previewCompany]`; now `useQuery` on the same pair, which
 * gives the same "changing either refetches" behaviour for free.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HiOutlineArrowPath } from "react-icons/hi2";

import approvalService, {
  COMPANY_OPTIONS,
  type Company,
} from "../../../../services/approvalService";
import { EmptyState, ErrorState } from "../../ApprovalUI";
import { messageFrom } from "../../useApprovalAdmin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Notice } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function PreviewCard({
  workflowId,
  company,
}: {
  workflowId: number;
  company: Company | "";
}) {
  const [previewCompany, setPreviewCompany] = useState<Company | "">(company);
  const query = useQuery({
    queryKey: ["approvals", "preview", workflowId, previewCompany],
    queryFn: () => approvalService.previewWorkflow(workflowId, previewCompany),
  });
  const loading = query.isFetching;
  const error = query.error ? messageFrom(query.error, "Failed to load") : "";
  const data = query.data ?? null;

  const blocked = data?.levels.filter((l) => l.blocked) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live preview</CardTitle>
        <div className="flex items-center gap-2">
          <Select
            value={previewCompany}
            onChange={(e) => setPreviewCompany(e.target.value as Company | "")}
            aria-label="Preview for company"
            className="h-control-sm w-auto"
          >
            <option value="">All companies</option>
            {COMPANY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={() => void query.refetch()}>
            <HiOutlineArrowPath className={loading ? "animate-spin" : ""} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </CardHeader>

      {loading && (
        <div className="space-y-2" aria-label="Resolving approvers">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={() => void query.refetch()} />}

      {!loading && !error && data && (
        <>
          {blocked.length > 0 && (
            <Notice tone="bad" className="mb-3">
              <strong className="font-semibold">
                {blocked.length} level{blocked.length > 1 ? "s have" : " has"} no eligible
                approver.
              </strong>{" "}
              A document reaching {blocked.length > 1 ? "these levels" : "this level"} cannot move
              forward. Assign a role or named approvers.
            </Notice>
          )}

          {data.levels.length === 0 ? (
            <EmptyState title="No active levels to preview" />
          ) : (
            <ol className="m-0 list-none space-y-1.5 p-0">
              {data.levels.map((l) => (
                <li
                  key={l.sequence}
                  className={
                    "flex items-start gap-3 rounded-sm border p-2.5 " +
                    (l.blocked ? "border-bad/40 bg-bad-soft" : "border-line bg-surface")
                  }
                >
                  <span
                    className={
                      "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold " +
                      (l.blocked ? "bg-bad text-white" : "bg-brand-soft text-brand")
                    }
                  >
                    {l.sequence}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink">
                      {l.name}
                      {l.blocked && <Badge tone="bad">No approver</Badge>}
                    </span>
                    <span className="block text-[11.5px] text-subtle">
                      {l.role ? "Role: " + l.role + " · " : ""}
                      {l.eligible_count} eligible
                      {l.eligible_approvers.length > 0 && (
                        <>
                          {" — "}
                          {l.eligible_approvers.slice(0, 6).join(", ")}
                          {l.eligible_approvers.length > 6 &&
                            " +" + (l.eligible_approvers.length - 6) + " more"}
                        </>
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Card>
  );
}
