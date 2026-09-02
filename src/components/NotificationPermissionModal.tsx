import "../styles/Notifications.css";

/**
 * Custom "explain first" notification-permission modal for the web app.
 * Matches the OMS design system; shown BEFORE the browser permission dialog.
 * The OS prompt (`Notification.requestPermission()`) only fires from the
 * "Allow Notifications" button — never automatically, never via alert/confirm.
 */

type Props = {
  open: boolean;
  submitting?: boolean;
  onAllow: () => void;
  onDismiss: () => void;
};

const BENEFITS = [
  "Instant approval requests",
  "Billing assignments",
  "Auditor reviews",
  "Order status updates",
];

export default function NotificationPermissionModal({
  open,
  submitting = false,
  onAllow,
  onDismiss,
}: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="oms-notif-title"
      onClick={onDismiss}
      className="notif-modal-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="notif-modal-card"
      >
        <div aria-hidden="true" className="notif-modal-icon">
          <svg
            fill="none"
            viewBox="0 0 24 24"
            stroke="#2563eb"
            strokeWidth="1.8"
            className="notif-modal-icon-svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
        </div>

        <h2 id="oms-notif-title" className="notif-modal-title">
          Stay Updated
        </h2>
        <p className="notif-modal-subtitle">
          Never miss an important approval or workflow update.
        </p>

        <div className="notif-modal-benefits">
          {BENEFITS.map((benefit) => (
            <div key={benefit} className="notif-modal-benefit">
              <svg
                fill="none"
                viewBox="0 0 24 24"
                stroke="#22c55e"
                strokeWidth="2"
                className="notif-modal-benefit-icon"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="notif-modal-benefit-text">{benefit}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onAllow}
          disabled={submitting}
          className={`notif-modal-btn-allow${
            submitting ? " notif-modal-btn-allow--submitting" : ""
          }`}
        >
          {submitting ? "Please wait…" : "Allow Notifications"}
        </button>
        <button
          onClick={onDismiss}
          disabled={submitting}
          className="notif-modal-btn-dismiss"
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}
