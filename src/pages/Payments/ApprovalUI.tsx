import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  HiChevronUpDown,
  HiExclamationTriangle,
  HiInbox,
  HiMagnifyingGlass,
  HiXMark,
} from "react-icons/hi2";

import type { RequestStatus } from "../../services/approvalService";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";

/**
 * Reusable presentational primitives for the Approval console.
 *
 * The app ships no component library, so these fill the role shadcn/ui would:
 * one implementation of table shell, modal, badge and the loading/empty/error
 * states, used by every tab.
 */

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

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c}>
              <div
                className={`apv-skeleton${c === 0 ? " apv-skeleton-first" : ""}`}
              />
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
  return (
    <div className="apv-empty">
      <HiInbox size={30} className="apv-empty-icon" />
      <div className="apv-empty-title">{title}</div>
      {hint && <div>{hint}</div>}
      {action && <div className="apv-empty-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="apv-error">
      <HiExclamationTriangle size={26} className="apv-error-icon" />
      <div>{message}</div>
      {onRetry && (
        <button type="button" className="apv-btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
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
 * Type-to-filter picker. A plain <select> is unusable once a list runs to
 * dozens of users, so this filters as you type and supports full keyboard
 * navigation (↑ ↓ Enter Escape).
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || (o.hint ? o.hint.toLowerCase().includes(q) : false),
    );
  }, [options, query]);

  /** Single entry point for open/close so the search state always resets. */
  const setOpenState = (next: boolean) => {
    setOpen(next);
    setQuery("");
    setActive(0);
  };

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setActive(0);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus the search box when the list opens. Query/highlight are reset by
  // the handlers that toggle `open`, not here — resetting state inside an
  // effect causes an extra render pass.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[active] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const commit = (option: ComboOption) => {
    onChange(option.value);
    setOpenState(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[active];
      if (option) commit(option);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpenState(false);
    }
  };

  return (
    <div className="apv-combo" ref={rootRef}>
      <button
        id={id}
        type="button"
        className="apv-combo-trigger"
        onClick={() => !disabled && setOpenState(!open)}
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "" : "apv-combo-placeholder"}>
          {loading ? "Loading…" : selected ? selected.label : placeholder}
        </span>
        <HiChevronUpDown className="apv-combo-caret" />
      </button>

      {open && (
        <div className="apv-combo-pop">
          <div className="apv-combo-search">
            <HiMagnifyingGlass className="apv-combo-search-icon" />
            <input
              ref={inputRef}
              className="apv-combo-input"
              value={query}
              placeholder={searchPlaceholder}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="apv-combo-empty">{emptyText}</div>
          ) : (
            <ul className="apv-combo-list" role="listbox" ref={listRef}>
              {filtered.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  className={
                    "apv-combo-item" +
                    (i === active ? " is-active" : "") +
                    (o.value === value ? " is-selected" : "")
                  }
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    // mousedown, not click — the outside-click handler would
                    // close the list before a click ever lands.
                    e.preventDefault();
                    commit(o);
                  }}
                >
                  <span className="apv-combo-item-label">{o.label}</span>
                  {o.hint && <span className="apv-combo-item-hint">{o.hint}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

/**
 * The Approval console's modal — nine call sites behind one component, which is
 * why this one is worth converting over the pages' one-off overlays.
 *
 * It had more of the behaviour than most hand-rolled modals in this codebase:
 * Escape, a body-scroll lock, `aria-modal` and a real accessible name. What it
 * still could not do is the part that is genuinely hard to hand-write:
 *
 *   * **Trap focus.** Tab walked straight out of the modal into the page
 *     behind, which stayed reachable and clickable.
 *   * **Hide the background from assistive tech.** `aria-modal` is advisory;
 *     the rest of the page stayed in the accessibility tree.
 *   * **Put focus back.** On close, focus fell to `<body>`, so the next Tab
 *     restarted from the top of the sidebar.
 *
 * The props are unchanged, so all nine call sites are untouched — `Modal` is
 * mounted only when it is open, so `open` is a constant here and closing is
 * still reported through `onClose`.
 *
 * `variant="bare"` because `.apv-modal` already sets the width, radius, shadow
 * and the head/body/foot flex column. The close button stays in the head where
 * that stylesheet positions it, so the primitive's own is switched off.
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
      <DialogContent
        title={title}
        variant="bare"
        size="auto"
        showClose={false}
        className={`apv-modal${wide ? " is-wide" : ""}`}
      >
        <div className="apv-modal-head">
          <h3>{title}</h3>
          <DialogClose type="button" className="apv-btn apv-btn-icon" aria-label="Close">
            <HiXMark />
          </DialogClose>
        </div>
        <div className="apv-modal-body">{children}</div>
        {footer && <div className="apv-modal-foot">{footer}</div>}
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
          <button type="button" className="apv-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`apv-btn ${danger ? "apv-btn-danger" : "apv-btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="apv-confirm-message">{message}</p>
    </Modal>
  );
}
