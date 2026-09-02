import { EmptyState, ErrorState, TableSkeleton } from "../../ApprovalUI";

/** AsyncBoundary that renders its states as a full-width table row. */
export default function AsyncBoundaryTable({
  loading,
  error,
  isEmpty,
  onRetry,
  cols,
  emptyTitle,
  emptyHint,
  emptyAction,
  children,
}: {
  loading: boolean;
  error: string;
  isEmpty: boolean;
  onRetry: () => void;
  cols: number;
  emptyTitle: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (loading) return <TableSkeleton cols={cols} />;
  if (error) {
    return (
      <tbody>
        <tr>
          <td colSpan={cols}>
            <ErrorState message={error} onRetry={onRetry} />
          </td>
        </tr>
      </tbody>
    );
  }
  if (isEmpty) {
    return (
      <tbody>
        <tr>
          <td colSpan={cols}>
            <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />
          </td>
        </tr>
      </tbody>
    );
  }
  return <>{children}</>;
}
