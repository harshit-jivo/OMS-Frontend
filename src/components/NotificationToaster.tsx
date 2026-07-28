import { useEffect, useState } from "react";

/**
 * Non-intrusive in-app notification popup (Phase 3, Task 3).
 *
 * A tiny external store drives a stack of auto-dismissing toasts rendered
 * top-right. `showToast()` can be called from anywhere; mount
 * <NotificationToaster/> once near the app root.
 */

export type ToastData = {
  id: number;
  title: string;
  message: string;
  orderNumber?: string | null;
  onAction?: () => void;
  actionLabel?: string;
};

type ToastInput = Omit<ToastData, "id">;

const AUTO_DISMISS_MS = 6000;

let seq = 1;
let toasts: ToastData[] = [];
const listeners = new Set<(items: ToastData[]) => void>();

const emit = () => listeners.forEach((l) => l([...toasts]));

export const showToast = (input: ToastInput): number => {
  const id = seq++;
  toasts = [{ id, ...input }, ...toasts].slice(0, 4); // cap the stack
  emit();
  return id;
};

export const dismissToast = (id: number) => {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
};

function ToastCard({ toast }: { toast: ToastData }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        pointerEvents: "auto",
        width: "340px",
        background: "#ffffff",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
        padding: "14px 16px",
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          background: "#eff6ff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          fill="none"
          viewBox="0 0 24 24"
          stroke="#2563eb"
          strokeWidth="1.8"
          style={{ width: "20px", height: "20px" }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}
          >
            {toast.title}
          </span>
          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "18px",
              lineHeight: 1,
              color: "#94a3b8",
              padding: 0,
            }}
          >
            &times;
          </button>
        </div>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: "0.85rem",
            color: "#475569",
            lineHeight: 1.4,
          }}
        >
          {toast.message}
        </p>
        {toast.orderNumber ? (
          <p
            style={{
              margin: "6px 0 0",
              fontSize: "0.75rem",
              color: "#64748b",
              fontWeight: 600,
            }}
          >
            Order #{toast.orderNumber}
          </p>
        ) : null}
        {toast.onAction ? (
          <button
            onClick={() => {
              toast.onAction?.();
              dismissToast(toast.id);
            }}
            style={{
              marginTop: "10px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "6px 14px",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {toast.actionLabel || "View order"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function NotificationToaster() {
  const [items, setItems] = useState<ToastData[]>([]);

  useEffect(() => {
    const listener = (next: ToastData[]) => setItems(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (!items.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        pointerEvents: "none",
      }}
    >
      {items.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
