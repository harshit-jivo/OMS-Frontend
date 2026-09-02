import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HiArrowPath } from "react-icons/hi2";

import approvalService, {
  COMPANY_OPTIONS,
  type Company,
} from "../../../../services/approvalService";
import { EmptyState, ErrorState } from "../../ApprovalUI";
import { messageFrom } from "../../useApprovalAdmin";
import { Badge } from "@/components/ui/badge";

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
    <div className="apv-card">
      <div className="apv-card-head">
        <h3>Live preview</h3>
        <div className="apv-actions-row apv-actions-row-center">
          <select
            className="apv-select"
            value={previewCompany}
            onChange={(e) => setPreviewCompany(e.target.value as Company | "")}
            aria-label="Preview for company"
          >
            <option value="">All companies</option>
            {COMPANY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="apv-btn apv-btn-sm"
            onClick={() => void query.refetch()}
          >
            <HiArrowPath /> Refresh
          </button>
        </div>
      </div>

      {loading && <div className="apv-loading">Resolving approvers…</div>}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => void query.refetch()} />
      )}

      {!loading && !error && data && (
        <>
          {blocked.length > 0 && (
            <div className="apv-notice apv-notice-warn">
              <span>
                <strong>
                  {blocked.length} level{blocked.length > 1 ? "s have" : " has"} no
                  eligible approver.
                </strong>{" "}
                A document reaching{" "}
                {blocked.length > 1 ? "these levels" : "this level"} cannot move
                forward. Assign a role or named approvers.
              </span>
            </div>
          )}

          {data.levels.length === 0 ? (
            <EmptyState title="No active levels to preview" />
          ) : (
            <div className="apv-ladder">
              {data.levels.map((l) => (
                <div
                  key={l.sequence}
                  className={`apv-rung${l.blocked ? " is-blocked" : ""}`}
                >
                  <div className="apv-rung-seq">{l.sequence}</div>
                  <div className="apv-rung-main">
                    <div className="apv-rung-name">
                      {l.name}{" "}
                      {l.blocked && (
                        <Badge tone="bad">
                          No approver
                        </Badge>
                      )}
                    </div>
                    <div className="apv-rung-meta">
                      {l.role ? `Role: ${l.role} · ` : ""}
                      {l.eligible_count} eligible
                      {l.eligible_approvers.length > 0 && (
                        <> — {l.eligible_approvers.slice(0, 6).join(", ")}
                          {l.eligible_approvers.length > 6 &&
                            ` +${l.eligible_approvers.length - 6} more`}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
