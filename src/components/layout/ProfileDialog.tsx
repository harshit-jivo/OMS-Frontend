/**
 * Profile — read-only account and application information.
 *
 * A dialog rather than a route. It is reference material you read and close,
 * not a place you navigate TO: the whole reason it exists is to be readable
 * while support asks "what build are you on?", and a route meant leaving
 * whatever screen the problem was on to find out.
 *
 * The "Application information" section exists so users and the support team
 * can identify exactly which build is running without asking for a screenshot
 * of the console. Every value comes from webDeviceService (the single source of
 * truth); nothing here is editable and nothing is hardcoded.
 */
import { useMemo, useState } from "react";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineCheck,
  HiOutlineClipboard,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DetailSection } from "@/components/ui/detail";
import { useAuth } from "@/auth";
import { webDeviceService } from "../../services/webDeviceService";
import { initialsOf } from "./AppHeader";

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

/**
 * One label/value line.
 *
 * Not `ui/detail`'s `DetailField`, which lays its label above its value in a
 * grid — this list is read down the left edge and across, and it has to hold
 * an action on one row.
 */
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
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
      <span className="shrink-0 text-[12px] text-subtle">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={
            "truncate text-[13px] text-ink " + (mono ? "font-mono text-[12px]" : "font-medium")
          }
        >
          {value || "—"}
        </span>
        {action}
      </span>
    </div>
  );
}

export default function ProfileDialog({
  open,
  onOpenChange,
  onLogout,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * Sign out, asked for from here.
   *
   * The rail already has a Logout row, but the rail is COLLAPSED to icons for
   * a lot of people and hidden entirely under 1024px — and "sign out" is the
   * thing you look for under your own name. This does not sign anyone out
   * itself: it closes this dialog and hands off to the same confirm the rail
   * uses, so there is one sign-out path and one confirmation, not two.
   */
  onLogout?: () => void;
}) {
  // Snapshot once per mount — these values don't change while it is open.
  const device = useMemo(() => webDeviceService.getSummary(), []);
  const [copied, setCopied] = useState(false);

  /* From the session, not five separate `localStorage` reads. Same values —
     `AuthProvider` loads them from the same keys — but this no longer has
     its own opinion about how a session is stored. */
  const { session } = useAuth();
  const displayName = session?.name || session?.username || "User";
  const roleLabel = session?.roleDisplay || session?.role || "—";

  const copyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(device.device_id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (non-secure origin / denied) — id is still shown */
    }
  };

  const osText = device.os_version ? device.os_name + " " + device.os_version : device.os_name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title="Profile" size="md">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand"
                >
                  {initialsOf(displayName)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{displayName}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">
                    {roleLabel}
                  </span>
                </span>
              </span>
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <DetailSection title="Account">
              <div>
                <InfoRow label="Name" value={displayName} />
                <InfoRow label="Username" value={session?.username || ""} />
                <InfoRow label="Role" value={roleLabel} />
                <InfoRow label="Company" value={session?.companyName || ""} />
              </div>
            </DetailSection>

            <DetailSection title="Application information">
              <p className="m-0 mb-1 text-[11.5px] text-subtle">
                Read-only. Share these details with support when reporting an issue.
              </p>
              <div>
                <InfoRow label="Application version" value={device.app_version} />
                <InfoRow label="Build number" value={String(device.build_number)} />
                <InfoRow label="Browser" value={device.browser_name} />
                <InfoRow label="Browser version" value={device.browser_version} />
                <InfoRow label="Operating system" value={osText} />
                <InfoRow label="Language" value={device.language} />
                <InfoRow label="Timezone" value={device.timezone} />
                <InfoRow label="Screen resolution" value={device.screen_resolution} />
                <InfoRow label="Last sync" value={formatDateTime(device.last_sync)} />
                <InfoRow
                  label="Device ID"
                  value={device.device_id}
                  mono
                  action={
                    <Button
                      size="xs"
                      onClick={() => void copyDeviceId()}
                      aria-label="Copy device ID"
                    >
                      {copied ? (
                        <HiOutlineCheck aria-hidden="true" />
                      ) : (
                        <HiOutlineClipboard aria-hidden="true" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  }
                />
              </div>
            </DetailSection>
          </DialogBody>

          {onLogout ? (
            <DialogFooter>
              <Button variant="danger" onClick={onLogout}>
                <HiOutlineArrowRightOnRectangle aria-hidden="true" /> Sign out
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      )}
    </Dialog>
  );
}
