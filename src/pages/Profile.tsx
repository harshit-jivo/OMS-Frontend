import { useMemo, useState } from "react";
import { webDeviceService } from "../services/webDeviceService";
import "../styles/Profile.css";
import { useAuth } from "@/auth";

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
    <div className="prf-row">
      <span className="prf-row-label">{label}</span>
      <span className="prf-row-right">
        <span className={`prf-row-value${mono ? " is-mono" : ""}`}>{value || "-"}</span>
        {action}
      </span>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="prf-card">
      <header className="prf-card-head">
        <h2 className="prf-card-title">{title}</h2>
        {subtitle && <p className="prf-card-sub">{subtitle}</p>}
      </header>
      <div>{children}</div>
    </section>
  );
}

export default function Profile() {
  // Snapshot once per mount — these values don't change while the page is open.
  const device = useMemo(() => webDeviceService.getSummary(), []);
  const [copied, setCopied] = useState(false);

  /* From the session, not five separate `localStorage` reads. Same values —
     `AuthProvider` loads them from the same keys — but the page no longer has
     its own opinion about how a session is stored. */
  const { session } = useAuth();
  const displayName = session?.name || session?.username || "User";
  const roleLabel = session?.roleDisplay || session?.role || "-";

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
    <div className="prf-page">
      <h1 className="prf-title">Profile</h1>
      <p className="prf-intro">
        Your account and the application build running in this browser.
      </p>

      <Card title="Account">
        <InfoRow label="Name" value={displayName} />
        <InfoRow label="Username" value={session?.username || ""} />
        <InfoRow label="Role" value={roleLabel} />
        <InfoRow label="Company" value={session?.companyName || ""} />
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
              className={`prf-copy${copied ? " is-copied" : ""}`}
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
