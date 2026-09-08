import { HiOutlineBellAlert, HiOutlineCheck } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  groupNotifications,
  type Notification,
} from "@/components/sidebar/notificationGrouping";
import { isWebPushSupported } from "@/services/webPushClient";

/**
 * The bell's dialog — Phase 2, minimal theme.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT WAS A `variant="bare"` PANEL, AND THAT WAS THE CONVERSION SHIM
 * ─────────────────────────────────────────────────────────────────────────
 * `ui/dialog`'s `bare` variant exists so a legacy modal can gain a focus trap,
 * Escape and a scroll lock without its stylesheet being rewritten in the same
 * change. This one used it with `className="sb-modal"` — a 320px, centre-
 * aligned box built for the two-button logout confirm beside it — and then
 * spent 180 lines of CSS and one inline `style={{ display: "flex" }}` undoing
 * that: a left-aligned header, a scrolling list, a hand-rolled close button
 * next to the one `DialogContent` already draws.
 *
 * It is a real `panel` now, so the header, the scrolling body and the close
 * button come from the primitive. The hand-rolled `&times;` is gone; so is
 * the inline style.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ROW IS STILL A DIV
 * ─────────────────────────────────────────────────────────────────────────
 * A notification row navigates, so it should be a button. It is one now —
 * `onClick` on a `<div>` is unreachable by keyboard, and this dialog is the
 * only route to an order for the roles that use it.
 */

type NotificationsDialogProps = {
  open: boolean;
  onClose: () => void;
  items: Notification[];
  unreadCount: number;
  filter: "all" | "unread";
  onChangeFilter: (filter: "all" | "unread") => void;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  onMarkAllRead: () => void;
  onSelect: (item: Notification) => void;
  /** "granted" | "denied" | "default" | "unsupported" — a string from the hook. */
  permission: string;
  submitting: boolean;
  onEnablePush: () => void;
};

export function NotificationsDialog({
  open,
  onClose,
  items,
  unreadCount,
  filter,
  onChangeFilter,
  hasMore,
  loading,
  onLoadMore,
  onMarkAllRead,
  onSelect,
  permission,
  submitting,
  onEnablePush,
}: NotificationsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open ? (
        <DialogContent title="Notifications" size="sm">
          <DialogHeader>
            <DialogTitle>Notifications</DialogTitle>
            {/*
              `mr-8` clears `DialogContent`'s own close button, which is
              absolutely positioned at `right-4 top-4`. Without it the two
              overlap at narrow widths — the previous version avoided the
              collision by drawing a second close button of its own.
            */}
            <div className="mr-8 flex items-center gap-2">
              {unreadCount > 0 ? (
                <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
                  <HiOutlineCheck aria-hidden="true" />
                  Mark all read
                </Button>
              ) : null}
            </div>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <div className="flex gap-2">
              {(["all", "unread"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChangeFilter(value)}
                  aria-pressed={filter === value}
                  className={cn(
                    // The reset, again — see ui/button's note on preflight.
                    "appearance-none [font-family:inherit] cursor-pointer",
                    "rounded-full border px-3 py-1 text-[12px] font-semibold",
                    "transition-colors focus-visible:outline-none focus-visible:shadow-focus",
                    filter === value
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-white text-body hover:bg-surface hover:text-ink",
                  )}
                >
                  {value === "all"
                    ? "All"
                    : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
                </button>
              ))}
            </div>

            {/* Desktop-notification status, and the way to turn them on. */}
            <div className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  permission === "granted" ? "bg-ok" : "bg-line-strong",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-ink">
                  Desktop notifications:{" "}
                  {permission === "granted" ? "Enabled" : "Disabled"}
                </p>
                {permission === "denied" ? (
                  <p className="mt-0.5 text-[11.5px] leading-snug text-subtle">
                    Blocked in this browser. Click the lock icon in the address bar →
                    Notifications → Allow, then reload.
                  </p>
                ) : null}
                {permission === "unsupported" ? (
                  <p className="mt-0.5 text-[11.5px] leading-snug text-subtle">
                    Requires HTTPS (or localhost) to enable desktop notifications.
                  </p>
                ) : null}
              </div>
              {permission === "default" && isWebPushSupported() ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onEnablePush}
                  disabled={submitting}
                >
                  {submitting ? "…" : "Enable"}
                </Button>
              ) : null}
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <HiOutlineBellAlert aria-hidden="true" className="size-6 text-line-strong" />
                <p className="text-[13px] text-subtle">
                  {loading ? "Loading…" : "No notifications."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupNotifications(items).map((group) => (
                  <div key={group.label}>
                    <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-subtle">
                      {group.label}
                    </p>
                    <div className="space-y-1.5">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelect(item)}
                          className={cn(
                            "appearance-none [font-family:inherit] cursor-pointer",
                            "flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left",
                            "transition-colors focus-visible:outline-none focus-visible:shadow-focus",
                            item.is_read
                              ? "border-line bg-white hover:bg-surface"
                              : "border-brand-line bg-brand-soft hover:bg-brand-soft",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "mt-1.5 size-2 shrink-0 rounded-full",
                              item.is_read ? "bg-transparent" : "bg-brand",
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] leading-snug text-ink">
                              {item.message}
                            </span>
                            <span className="mt-1 block text-[11px] text-subtle">
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {hasMore ? (
                  <Button block size="sm" onClick={onLoadMore} disabled={loading}>
                    {loading ? "Loading…" : "Load more"}
                  </Button>
                ) : null}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
