import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  HiChevronUpDown,
  HiExclamationTriangle,
  HiInbox,
  HiMagnifyingGlass,
  HiXMark,
} from "react-icons/hi2";

import type { RequestStatus } from "../../services/approvalService";

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

const STATUS_TONE: Record<RequestStatus, string> = {
  DRAFT: "apv-badge-muted",
  PENDING: "apv-badge-warn",
  APPROVED: "apv-badge-ok",
  REJECTED: "apv-badge-err",
  CANCELLED: "apv-badge-muted",
};

export function StatusPill({ status, label }: { status: RequestStatus; label?: string }) {
  return (
    <span className={`apv-badge ${STATUS_TONE[status] ?? "apv-badge-muted"}`}>
      {label || status}
    </span>
  );
}

export function ActivePill({ active }: { active: boolean }) {
  return (
    <span className={`apv-badge ${active ? "apv-badge-ok" : "apv-badge-muted"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
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
              <div className="apv-skeleton" style={{ width: c === 0 ? "40%" : "70%" }} />
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
      <HiInbox size={30} style={{ opacity: 0.35, marginBottom: 8 }} />
      <div className="apv-empty-title">{title}</div>
      {hint && <div>{hint}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="apv-error">
      <HiExclamationTriangle size={26} style={{ marginBottom: 8 }} />
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
        o.label.toLowerCase().includes(q) ||
        (o.hint ? o.hint.toLowerCase().includes(q) : false),
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
  // Escape closes; body scroll is locked while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="apv-modal-overlay" onMouseDown={onClose}>
      <div
        className={`apv-modal${wide ? " is-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="apv-modal-head">
          <h3>{title}</h3>
          <button
            type="button"
            className="apv-btn apv-btn-icon"
            onClick={onClose}
            aria-label="Close"
          >
            <HiXMark />
          </button>
        </div>
        <div className="apv-modal-body">{children}</div>
        {footer && <div className="apv-modal-foot">{footer}</div>}
      </div>
    </div>
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
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}
