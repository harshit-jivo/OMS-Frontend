import type { DeviceStatus } from "../services/deviceAdminService";
import { Badge } from "./ui/badge";
import { toneForStatus } from "./ui/statusTone";

/**
 * StatusBadge — the pill for a device's derived activity status.
 *
 * This was the app's first attempt at a shared badge, written when each page
 * still defined its own `.xx-badge-*` classes. Phase 2.2 finished the job it
 * started, so it is now a thin wrapper: `components/ui/badge.tsx` draws it and
 * `statusTone.ts` decides the colour, alongside every other status in the app.
 *
 * Kept as a named component rather than folded into its two call sites because
 * it owns something the primitive should not: the LABELS map, which turns a
 * device's internal status into the words a person reads. That is device
 * vocabulary, not badge behaviour.
 *
 * Identity never rests on colour alone: the text label is always present, and
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
    <Badge tone={toneForStatus(status)} outlined dot title={title || label}>
      {label}
    </Badge>
  );
}
