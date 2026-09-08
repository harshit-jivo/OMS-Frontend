/**
 * The Approval console's shared presentational pieces.
 *
 * These once filled the role a component library would, because the app had
 * none. It has one now, so every export here is a thin adapter onto
 * `components/ui/` — the names and props are unchanged so the ten files that
 * import them did not have to move, but nothing in this file draws its own
 * box any more.
 *
 * Keeping the adapters rather than rewriting ten call sites is deliberate:
 * `Modal`, `EmptyState` and `ErrorState` carry console-specific defaults
 * (unmount-based closing, the retry button's wording) that would otherwise be
 * repeated at each site.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { HiOutlineExclamationTriangle, HiOutlineInbox } from "react-icons/hi2";

import type { RequestStatus } from "../../services/approvalService";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchSelect as UiSearchSelect } from "@/components/ui/dropdown";
import { EmptyState as UiEmptyState } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

/**
 * Payment-request status -> shared badge tone (Phase 2.2).
 *
 * Kept as an explicit map rather than routed through `toneForStatus`: these are
 * a closed `RequestStatus` union, so the compiler checks every case is covered
 * here, which it cannot do for the string-keyed lookup.
 */
const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  DRAFT: "neutral",
  PENDING: "hold",
  APPROVED: "ok",
  REJECTED: "bad",
  CANCELLED: "neutral",
};

export function StatusPill({ status, label }: { status: RequestStatus; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{label || status}</Badge>;
}

export function ActivePill({ active }: { active: boolean }) {
  return <Badge tone={active ? "ok" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>;
}

// ---------------------------------------------------------------------------
// Async states
// ---------------------------------------------------------------------------

/**
 * A skeleton that is a `<tbody>`, because every call site drops it inside an
 * existing `<table>` whose header must stay put while the rows load. That is
 * why it is not `ui/skeleton`'s `TableSkeleton`, which renders its own block.
 */
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-3 py-2">
              <Skeleton className={"h-3.5 " + (c === 0 ? "w-2/3" : "w-1/2")} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return <UiEmptyState icon={HiOutlineInbox} title={title} hint={hint} action={action} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <UiEmptyState
      icon={HiOutlineExclamationTriangle}
      title="Could not load this"
      hint={message}
      action={onRetry ? <Button onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// Searchable select (combobox)
// ---------------------------------------------------------------------------

export interface ComboOption {
  value: number | string;
  /** Primary line — what the user reads and searches. */
  label: string;
  /** Optional secondary line (e.g. username, code). Also searched. */
  hint?: string;
}

/**
 * Type-to-filter picker.
 *
 * Was 150 lines of hand-written combobox: its own open state, an outside-click
 * listener, an active-index cursor, `scrollIntoView` on arrow keys, and a
 * `mousedown` handler that existed only because its own outside-click listener
 * would otherwise close the list before a click landed. `ui/dropdown`'s
 * `SearchSelect` is the same control (DESIGN_SYSTEM §5a), so this is now the
 * name adapter for the console's `ComboOption` shape.
 */
export function SearchSelect({
  id,
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyText = "No matches",
  disabled,
  loading,
}: {
  id?: string;
  options: ComboOption[];
  value: number | string | "";
  onChange: (value: number | string | "") => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <UiSearchSelect<string | number>
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={loading ? "Loading…" : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      disabled={disabled || loading}
    />
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

/**
 * The Approval console's modal — nine call sites behind one component.
 *
 * It draws through `ui/dialog`'s `panel` variant now rather than through
 * `.apv-modal`, which means it picks up `tw-page` as well: a dialog is
 * portaled to `body`, outside the `<Page>` that opened it, so without that
 * reset every control inside it rendered at the 18px root size
 * (DESIGN_SYSTEM §1.3).
 *
 * The props are unchanged, so all nine call sites are untouched — `Modal` is
 * mounted only when it is open, so `open` is a constant here and closing is
 * still reported through `onClose`.
 */
export function Modal({
  title,
  onClose,
  footer,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  /*
   * Restore focus by hand, because this component is UNMOUNTED rather than
   * closed.
   *
   * All nine call sites render `{condition && <Modal … />}`, so `onClose`
   * makes the parent drop the whole subtree — Dialog included — in the same
   * commit. Radix restores focus while tearing down a dialog that transitions
   * open -> closed; an abrupt unmount never gives it that transition, and
   * focus lands on <body>. Which is exactly the defect this conversion was
   * supposed to fix, so it is worth six lines rather than nine call-site
   * rewrites.
   *
   * A ref, not state: reading document.activeElement during the mount effect
   * is the last moment it still holds the element that opened the modal.
   */
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const opener = openerRef.current;
      // Only if it is still on the page and still focusable — a modal that
      // deletes the row its own button lived in must not throw here.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent title={title} size={wide ? "lg" : "md"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

/** Confirm dialog — replaces window.confirm so it matches the design system. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="m-0 text-[13px] text-body">{message}</p>
    </Modal>
  );
}
