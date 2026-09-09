import { Link } from "react-router-dom";
import {
  HiOutlineBars3,
  HiOutlineBell,
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The top bar — Phase 2, minimal theme.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT WAS THERE
 * ─────────────────────────────────────────────────────────────────────────
 * A 92%-opaque white bar with a 20px drop shadow, a blue-gradient logo tile
 * with its own blue glow, and two hand-rolled `<button>`s carrying inline SVG
 * paths. The shadow made a 58px bar look like it was floating over the page,
 * and the tile's glow competed with the rail below it for the same job.
 *
 * It is a flat white bar with a hairline under it now — the same boundary the
 * cards use — so the only accent in the frame is the rail beside it and the
 * one nav item that is filled. Icons are the OUTLINE set at heroicons' own
 * 1.5 stroke, matching the rail, and both icon buttons go through `ui/button`
 * — see the note in that file about what a bare `<button>` looks like when
 * preflight is not imported.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * GEOMETRY IS STILL Sidebar.css's
 * ─────────────────────────────────────────────────────────────────────────
 * `.header` keeps the fixed position, the 58px height (60px below 768px) and
 * the z-index, because `.sidebar` is positioned against that height and the
 * two must not be able to disagree. This file sets nothing that moves the box.
 */

type AppHeaderProps = {
  displayName: string;
  roleLabel: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onToggleMenu: () => void;
  unreadCount: number;
  onOpenNotifications: () => void;
  /** Profile is a dialog the shell owns, not a route. */
  onOpenProfile: () => void;
};

/**
 * Two letters from the name, for the avatar.
 *
 * "A K Enterprises" gives AK; "Harman" gives HA rather than a lone letter,
 * because a single character in a 30px circle reads as a bullet point. Falls
 * back to a dash rather than rendering an empty ring.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function AppHeader({
  displayName,
  roleLabel,
  collapsed,
  onToggleCollapsed,
  onToggleMenu,
  unreadCount,
  onOpenNotifications,
  onOpenProfile,
}: AppHeaderProps) {
  const collapseLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <header
      data-slot="app-header"
      // `header` is the positioning hook in Sidebar.css.
      className="header border-b border-line bg-white px-3 shadow-none sm:px-4"
    >
      <div className="flex items-center gap-2">
        {/*
          The two toggles are exclusive: the hamburger where the rail is a
          drawer, the collapse toggle where it is a rail.

          `rail-drawer:` is a custom variant declared in styles/tailwind.css,
          not `lg:` and not `max-[1024px]:`. Both of those are off by a pixel
          against the `max-width: 1024px` in Sidebar.css that actually moves
          the rail, and at that one width the result is an app with the rail
          off-canvas and no button to bring it back. The variant exists so the
          two files cannot disagree; the reasoning is written out there.
        */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleMenu}
          aria-label="Open navigation"
          className="hidden rail-drawer:inline-flex"
        >
          <HiOutlineBars3 aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapsed}
          title={collapseLabel}
          aria-label={collapseLabel}
          className="rail-drawer:hidden"
        >
          {collapsed ? (
            <HiOutlineChevronDoubleRight aria-hidden="true" />
          ) : (
            <HiOutlineChevronDoubleLeft aria-hidden="true" />
          )}
        </Button>

        <Link
          to="/Home"
          className="ml-1 flex items-center gap-2.5 no-underline"
          aria-label="OMS home"
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface"
          >
            <img src="/logo.png" alt="" className="size-full object-contain" />
          </span>
          <span className="text-[13px] font-bold uppercase tracking-[0.22em] text-ink">OMS</span>
        </Link>
      </div>

      <div className="flex items-center gap-1">
        {/*
          Unconditional.

          The bell used to be gated to the four order-workflow roles
          (auditor, billing, manager, rate approver), which meant an ADMIN
          could never open notifications at all — including the history
          dialog. Nothing behind it is role-scoped in the client:
          `/orders/notifications/` decides for itself what a user may see, and
          the deep-link router already falls through to /View_Orders for a
          role it has no specific queue for. So the gate only ever hid a
          working feature from the people most likely to want it.
        */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenNotifications}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className="relative"
        >
          <HiOutlineBell aria-hidden="true" />
          {unreadCount > 0 ? (
            // `aria-hidden`: the count is already in the button's own label,
            // and a screen reader reading "3" beside "Notifications, 3
            // unread" says it twice.
            <span
              aria-hidden="true"
              className={cn(
                "absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center",
                "rounded-full bg-danger px-1 text-[9px] font-bold leading-none text-white",
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>

        <button
          type="button"
          onClick={onOpenProfile}
          title="View profile and application information"
          className={cn(
            // The DESIGN_SYSTEM §1.1 reset: preflight is not imported, so a
            // bare <button> keeps the UA border, background and font.
            "appearance-none border-0 bg-transparent [font-family:inherit] cursor-pointer",
            "ml-1 flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2",
            "transition-colors hover:bg-surface",
            "focus-visible:outline-none focus-visible:shadow-focus",
          )}
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand"
          >
            {initialsOf(displayName)}
          </span>
          {/*
            Hidden below 640px, where the name and role were the first things
            to collide with the logo. The avatar keeps the target tappable and
            the link keeps its accessible name from `title`.
          */}
          <span className="hidden flex-col items-start leading-tight sm:flex">
            <span className="text-[13px] font-semibold text-ink">{displayName}</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
              {roleLabel}
            </span>
          </span>
        </button>
      </div>
    </header>
  );
}
