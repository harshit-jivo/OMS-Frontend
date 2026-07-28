import type { DeviceStatus } from "../services/deviceAdminService";
import "./StatusBadge.css";

/**
 * StatusBadge — colour-coded pill for a device's derived activity status.
 *
 * The app had no shared Badge/Chip component (each page defined its own
 * `.xx-badge-*` classes), so this is the first one. Its colours are lifted from
 * the badges already in use (Device/Version Management) so it reads as the same
 * design system rather than a new style, and other pages can adopt it.
 *
 * Identity never rests on colour alone: every badge carries its text label, and
 * the dot is a CSS shape — no emoji.
 */
const LABELS: Record<DeviceStatus, string> = {
  online: "Online",
  idle: "Idle",
  offline: "Offline",
  inactive: "Inactive",
};

export default function StatusBadge({
  status,
  title,
}: {
  status: DeviceStatus;
  title?: string;
}) {
  const label = LABELS[status] ?? String(status);
  return (
    <span className={`status-badge status-badge-${status}`} title={title || label}>
      <span className="status-badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
