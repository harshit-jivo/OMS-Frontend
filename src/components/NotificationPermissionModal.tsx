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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#fff",
          borderRadius: "16px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
          padding: "28px 24px 22px",
          textAlign: "center",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: "68px",
            height: "68px",
            borderRadius: "50%",
            background: "#EFF6FF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <svg
            fill="none"
            viewBox="0 0 24 24"
            stroke="#2563eb"
            strokeWidth="1.8"
            style={{ width: "34px", height: "34px" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
        </div>

        <h2
          id="oms-notif-title"
          style={{
            margin: 0,
            fontSize: "1.4rem",
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Stay Updated
        </h2>
        <p
          style={{
            margin: "6px 0 18px",
            fontSize: "0.9rem",
            color: "#64748b",
            lineHeight: 1.5,
          }}
        >
          Never miss an important approval or workflow update.
        </p>

        <div
          style={{
            textAlign: "left",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginBottom: "22px",
          }}
        >
          {BENEFITS.map((benefit) => (
            <div
              key={benefit}
              style={{ display: "flex", alignItems: "center", gap: "10px" }}
            >
              <svg
                fill="none"
                viewBox="0 0 24 24"
                stroke="#22c55e"
                strokeWidth="2"
                style={{ width: "18px", height: "18px", flexShrink: 0 }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span style={{ fontSize: "0.88rem", color: "#334155" }}>
                {benefit}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={onAllow}
          disabled={submitting}
          style={{
            width: "100%",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "10px",
            padding: "12px",
            fontSize: "0.95rem",
            fontWeight: 700,
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Please wait…" : "Allow Notifications"}
        </button>
        <button
          onClick={onDismiss}
          disabled={submitting}
          style={{
            width: "100%",
            background: "none",
            color: "#64748b",
            border: "none",
            padding: "12px",
            marginTop: "4px",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}
