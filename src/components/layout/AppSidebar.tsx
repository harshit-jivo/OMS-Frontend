import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineArrowRightOnRectangle } from "react-icons/hi2";

import { cn } from "@/lib/utils";
import {
  HOME_LINK,
  SIDEBAR_SECTIONS,
  type SidebarLinkDef,
} from "./navigation";

/**
 * The navigation rail — Phase 2, minimal theme.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DARK, AND BLUE ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────
 * The rail carries the app's one accent surface: `--color-rail` is the brand
 * hue driven down to near-black, and the item you are ON is filled with the
 * brand itself. Everything else in the frame is white, grey or a hairline, so
 * that single saturated shape is unambiguous — see the token note in
 * styles/tailwind.css for what was tried before it.
 *
 * What is gone from the version it replaces is the chrome, not the darkness:
 * the 180deg gradient, the blue-tinted border, the 30px drop shadow, the 14px
 * pill radius and the `translateX(2px)` nudge on hover. Flat surface, hairline
 * edge, 6px radius.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIN ICONS
 * ─────────────────────────────────────────────────────────────────────────
 * Outline (`HiOutline*`), not solid, at `stroke-width: 1.25` rather than
 * heroicons' own 1.5. Forty solid glyphs in a column read as forty filled
 * blobs — the shapes stop being distinguishable at 18px and the eye gets no
 * help from them. Hairline outlines at this size read as line drawings, which
 * is the whole point of an icon in a list you scan rather than look at.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * GEOMETRY IS Sidebar.css's
 * ─────────────────────────────────────────────────────────────────────────
 * That file still owns where this box is — fixed, 230px, 72px collapsed,
 * off-canvas below 1024px — because five unconverted stylesheets position
 * their fixed footer bars against those numbers. The split is: CSS says where
 * the box is, this file says what it looks like. See the header comment there.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COLLAPSED IS A RENDER, NOT A FONT SIZE
 * ─────────────────────────────────────────────────────────────────────────
 * The old rail collapsed with `font-size: 0` on the anchor, which hides the
 * label from sight while leaving it in the accessibility tree at zero pixels,
 * and takes the icon's sizing with it. Here the label is `sr-only` when
 * collapsed and the anchor carries a `title` — legible to a screen reader,
 * and a native tooltip for a mouse user.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOVER TO PEEK
 * ─────────────────────────────────────────────────────────────────────────
 * A collapsed rail expands while the pointer is inside it, and again while
 * FOCUS is inside it, so a keyboard user is not left with forty unlabelled
 * icons. It overlays the page rather than pushing it — see the note in
 * `Sidebar.css`, which owns the width.
 *
 * BECAUSE COLLAPSED IS A RENDER, CSS ALONE CANNOT DO THIS. The labels are
 * `sr-only` and the section captions are replaced by hairlines, and both of
 * those are decided here in JSX. So the peek is state, and everything
 * downstream reads `showLabels` rather than `collapsed`.
 *
 * The `matchMedia` guard matters: a touch device synthesises a hover that
 * never ends, so without it the first tap near the rail would un-collapse
 * forty labels inside a 72px box and leave them there.
 */

/**
 * Can this viewport peek at all?
 *
 * Asked at the moment of the event rather than subscribed to: the answer only
 * matters while a pointer is entering the rail, and a listener would be a
 * subscription kept alive for the life of the app to serve one branch.
 */
const canPeek = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: hover) and (min-width: 1025px)").matches;

type AppSidebarProps = {
  open: boolean;
  collapsed: boolean;
  /** `canOpen(session, path)`, passed in so this file knows nothing about auth. */
  canShow: (path: string) => boolean;
  isLinkActive: (to: string) => boolean;
  onNavigate: () => void;
  onLogout: () => void;
};

/**
 * One row of the rail. A link and the logout button share it, because they
 * are the same shape and drifting apart is exactly what happened last time
 * (`.sidebar a` had a 14px radius and `.sb-logout` had its own copy of it).
 */
const rowClass = [
  "group flex h-9 w-full items-center gap-2.5 rounded-md px-2.5",
  "text-[12.5px] font-medium text-rail-text no-underline",
  "transition-colors duration-150",
  "hover:bg-rail-hover hover:text-white",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
].join(" ");

/** Collapsed: the icon is the whole row, so centre it and drop the gap. */
const collapsedRowClass = "justify-center gap-0 px-0";

/**
 * `[stroke-width:1.25]` as an arbitrary PROPERTY, not `stroke-[1.25]`.
 *
 * heroicons ships the width as a presentation attribute on the `<svg>`, and a
 * CSS declaration beats a presentation attribute — so this is what actually
 * thins them. The bracket-property form is used elsewhere in `ui/` for the
 * same reason: it emits exactly the CSS it says.
 */
const iconClass = "size-[18px] [stroke-width:1.25]";

function NavIcon({
  icon: Icon,
  active,
}: {
  icon: SidebarLinkDef["icon"];
  active?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center",
        "transition-colors duration-150",
        active ? "text-white" : "text-rail-muted group-hover:text-white",
      )}
    >
      <Icon className={iconClass} />
    </span>
  );
}

function NavLink({
  link,
  active,
  collapsed,
  onNavigate,
}: {
  link: SidebarLinkDef;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        to={link.to}
        onClick={onNavigate}
        // Only useful while collapsed — expanded, the label is right there and
        // a tooltip repeating it is noise.
        title={collapsed ? link.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          rowClass,
          collapsed && collapsedRowClass,
          // The accent, unmuted, and the only saturated shape on screen.
          active &&
            "bg-brand font-semibold text-white hover:bg-brand hover:text-white",
        )}
      >
        <NavIcon icon={link.icon} active={active} />
        <span className={cn("truncate", collapsed && "sr-only")}>{link.label}</span>
      </Link>
    </li>
  );
}

export function AppSidebar({
  open,
  collapsed,
  canShow,
  isLinkActive,
  onNavigate,
  onLogout,
}: AppSidebarProps) {
  const [peek, setPeek] = useState(false);

  // The rail is only VISUALLY collapsed when it is collapsed and not being
  // peeked at. Every row and caption below reads this, never `collapsed`.
  const showLabels = !collapsed || peek;

  const openPeek = () => {
    if (collapsed && canPeek()) setPeek(true);
  };
  const closePeek = () => setPeek(false);

  return (
    <aside
      data-slot="app-sidebar"
      data-peek={peek || undefined}
      onPointerEnter={openPeek}
      onPointerLeave={closePeek}
      // Capture, because focus lands on a DESCENDANT link and `onFocus` does
      // not bubble. Closing on `onBlurCapture` is safe: focus moving between
      // two rows fires blur then focus, and the false-then-true settles in the
      // same tick with nothing painted in between.
      onFocusCapture={openPeek}
      onBlurCapture={closePeek}
      // `sidebar` / `open` / `collapsed` / `peek` are the POSITIONING hooks in
      // Sidebar.css. Everything after them is this file's business.
      className={cn(
        "sidebar",
        open && "open",
        collapsed && "collapsed",
        peek && "peek",
        "flex flex-col border-r border-black/25 bg-rail",
        showLabels ? "px-2.5 py-3" : "px-2 py-3",
        // Only while peeking: it is floating over the page, and a rail that
        // overlays content without an edge reads as part of the content.
        peek && "shadow-[8px_0_24px_rgba(15,23,42,0.28)]",
        /*
         * A minimal scrollbar.
         *
         * Fifty links overflow the rail on most laptops, and the platform
         * default is a pale chunky track down a near-black surface — the
         * loudest thing in the frame, beside navigation meant to be scanned
         * rather than looked at. Six pixels, no track, and a thumb that only
         * firms up under the cursor.
         *
         * Both syntaxes, because they are read by different engines and
         * neither is universal: `scrollbar-width` / `scrollbar-color` for
         * Firefox, the `::-webkit-scrollbar` pseudo-elements for Chrome and
         * Safari.
         */
        "[scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.18)_transparent]",
        "[&::-webkit-scrollbar]:w-1.5",
        "[&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15",
        "hover:[&::-webkit-scrollbar-thumb]:bg-white/25",
      )}
    >
      <nav aria-label="Main" className="flex-1">
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {/*
            Unconditional, where the old Dashboard row was hidden from the
            tracker sub-roles. `/Home` lists whatever the viewer can open, so
            for a tracker clerk it is their tracker pages — there is no role
            for which it is empty of everything but a dead end. It is also the
            redirect target for a denied route, so a rail without a way back
            to it would be a rail with a hole in it.
          */}
          <NavLink
            link={HOME_LINK}
            active={isLinkActive(HOME_LINK.to)}
            collapsed={!showLabels}
            onNavigate={onNavigate}
          />

          {SIDEBAR_SECTIONS.map((section) => {
            const visible = section.links.filter((link) => canShow(link.gate ?? link.to));
            if (visible.length === 0) return null;
            return (
              <Fragment key={section.label}>
                {/*
                  Collapsed, the rail is 72px of icons and a section caption
                  cannot fit — a hairline stands in for it, so the grouping
                  survives the collapse instead of the list going flat.
                */}
                {!showLabels ? (
                  <li aria-hidden="true" className="mx-2 my-1.5 h-px bg-rail-line" />
                ) : (
                  <li className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-rail-muted">
                    {section.label}
                  </li>
                )}
                {visible.map((link) => (
                  <NavLink
                    key={link.to}
                    link={link}
                    active={isLinkActive(link.to)}
                    collapsed={!showLabels}
                    onNavigate={onNavigate}
                  />
                ))}
              </Fragment>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto border-t border-rail-line pt-2">
        {/*
          A hand-rolled <button>, and it has to reset itself — preflight is not
          imported, so a bare button keeps the UA's outset border and grey
          face. `ui/button` is not used here because none of its variants is
          this shape: a full-width nav row that happens to be destructive.
        */}
        <button
          type="button"
          onClick={onLogout}
          title={!showLabels ? "Logout" : undefined}
          className={cn(
            "appearance-none border border-transparent bg-transparent",
            "[font-family:inherit] cursor-pointer",
            rowClass,
            !showLabels && collapsedRowClass,
            "hover:bg-danger/20 hover:text-white",
          )}
        >
          <span
            aria-hidden="true"
            className="flex size-[18px] shrink-0 items-center justify-center text-rail-muted transition-colors duration-150 group-hover:text-white"
          >
            <HiOutlineArrowRightOnRectangle className={iconClass} />
          </span>
          <span className={cn("truncate", collapsed && "sr-only")}>Logout</span>
        </button>
      </div>
    </aside>
  );
}
