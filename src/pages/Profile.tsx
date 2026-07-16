import { useMemo, useState } from "react";
import { webDeviceService } from "../services/webDeviceService";

/**
 * Profile — read-only account and application information.
 *
 * The "Application Information" section exists so users and the support team
 * can identify exactly which build is running without asking for a screenshot
 * of the console. Every value comes from webDeviceService (the single source of
 * truth); nothing here is editable and nothing is hardcoded.
 */

const formatDateTime = (value?: string | null): string => {
  if (!value) return "Not synced yet";
  try {
    return new Date(value).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
};

const readLocal = (key: string): string => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

function InfoRow({
  label,
  value,
  mono,
  action,
}: {
  label: string;
  value: string;
  mono?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "12px 0",
        borderBottom: "1px solid #f1f5f9",
      }}
    >
      <span style={{ fontSize: "0.875rem", color: "#475569", fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
        <span
          style={{
            fontSize: "0.875rem",
            color: "#0f172a",
            fontWeight: 600,
            textAlign: "right",
            wordBreak: "break-all",
            fontFamily: mono
              ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
              : undefined,
          }}
        >
          {value || "-"}
        </span>
        {action}
      </span>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "#ffffff",
        borderRadius: "14px",
        border: "1px solid #e2e8f0",
        padding: "20px 24px",
        marginBottom: "20px",
      }}
    >
      <header style={{ marginBottom: "8px" }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
            {subtitle}
          </p>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}

export default function Profile() {
  // Snapshot once per mount — these values don't change while the page is open.
  const device = useMemo(() => webDeviceService.getSummary(), []);
  const [copied, setCopied] = useState(false);

  const displayName = readLocal("name") || readLocal("username") || "User";
  const roleLabel = readLocal("role_display") || readLocal("role") || "-";

  const copyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(device.device_id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (non-secure origin / denied) — id is still shown */
    }
  };

  const osText = device.os_version
    ? `${device.os_name} ${device.os_version}`
    : device.os_name;

  return (
    <div style={{ padding: "24px", maxWidth: "760px" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>
        Profile
      </h1>
      <p style={{ margin: "0 0 20px", fontSize: "0.85rem", color: "#64748b" }}>
        Your account and the application build running in this browser.
      </p>

      <Card title="Account">
        <InfoRow label="Name" value={displayName} />
        <InfoRow label="Username" value={readLocal("username")} />
        <InfoRow label="Role" value={roleLabel} />
        <InfoRow label="Company" value={readLocal("company_name")} />
      </Card>

      <Card
        title="Application Information"
        subtitle="Read-only. Share these details with support when reporting an issue."
      >
        <InfoRow label="Application Version" value={device.app_version} />
        <InfoRow label="Build Number" value={String(device.build_number)} />
        <InfoRow label="Browser" value={device.browser_name} />
        <InfoRow label="Browser Version" value={device.browser_version} />
        <InfoRow label="Operating System" value={osText} />
        <InfoRow label="Language" value={device.language} />
        <InfoRow label="Timezone" value={device.timezone} />
        <InfoRow label="Screen Resolution" value={device.screen_resolution} />
        <InfoRow label="Last Sync" value={formatDateTime(device.last_sync)} />
        <InfoRow
          label="Device ID"
          value={device.device_id}
          mono
          action={
            <button
              type="button"
              onClick={copyDeviceId}
              style={{
                border: "1px solid #cbd5e1",
                background: copied ? "#dcfce7" : "#f8fafc",
                color: copied ? "#166534" : "#334155",
                borderRadius: "8px",
                padding: "4px 10px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              aria-label="Copy device ID"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          }
        />
      </Card>
    </div>
  );
}
