import { useEffect, useState } from "react";

import { AUTO_DISMISS_MS, dismissToast, subscribeToToasts } from "@/lib/toastStore";
import type { ToastData } from "@/lib/toastStore";
import "../styles/Notifications.css";

/**
 * Non-intrusive in-app notification popup (Phase 3, Task 3).
 *
 * A tiny external store drives a stack of auto-dismissing toasts rendered
 * top-right. `showToast()` can be called from anywhere; mount
 * <NotificationToaster/> once near the app root.
 */

function ToastCard({ toast }: { toast: ToastData }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id]);

  return (
    <div role="status" aria-live="polite" className="notif-toast-card">
      <div aria-hidden="true" className="notif-toast-icon">
        <svg
          fill="none"
          viewBox="0 0 24 24"
          stroke="#2563eb"
          strokeWidth="1.8"
          className="notif-toast-icon-svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      </div>

      <div className="notif-toast-body">
        <div className="notif-toast-head">
          <span className="notif-toast-title">{toast.title}</span>
          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            className="notif-toast-close"
          >
            &times;
          </button>
        </div>
        <p className="notif-toast-message">{toast.message}</p>
        {toast.orderNumber ? (
          <p className="notif-toast-order">Order #{toast.orderNumber}</p>
        ) : null}
        {toast.onAction ? (
          <button
            onClick={() => {
              toast.onAction?.();
              dismissToast(toast.id);
            }}
            className="notif-toast-action"
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

  useEffect(() => subscribeToToasts(setItems), []);

  if (!items.length) return null;

  return (
    <div className="notif-toast-container">
      {items.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
