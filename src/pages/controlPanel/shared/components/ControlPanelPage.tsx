/**
 * The frame every Control Panel page sits in.
 *
 * THE PAGE HEADER LIVES IN THE TOP BAR. The page body is production C_Panel's
 * own page, edge to edge (EmbeddedControlPanel), so a title card above it
 * would only push C_Panel's layout down. The title and the page's actions are
 * portalled into the top bar's centre slot (components/layout/headerSlot.ts).
 * Only the Control Panel pages do this; every other OMS page keeps its
 * `PageHeader`.
 *
 * Outside the shell (tests) there is no slot, and the same box renders
 * inline at the top of the page.
 *
 * The box is also the breadcrumb: Control Panel › parent › this page. The
 * parent is the page the user came from (a link, then the way back), or the
 * page's group in the sidebar (plain text — context, not a destination).
 */
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { HiChevronRight } from "react-icons/hi2";

import { useHeaderSlot } from "@/components/layout/headerSlot";
import { Page } from "@/components/ui/page";
import { cn } from "@/lib/utils";

export interface ControlPanelCrumb {
  label: string;
  /** A route to go back to; omitted for a group heading. */
  to?: string;
}

export function ControlPanelPage({
  title,
  description,
  parent,
  actions,
  children,
}: {
  title: string;
  /** The middle crumb (see above). */
  parent?: ControlPanelCrumb;
  /** Shown as the title's tooltip — there is no room for a sentence in the bar. */
  description?: string;
  /** Buttons for the bar (Reload, Open in new tab). Icon-only below `sm`. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const slot = useHeaderSlot();

  const box = (
    <nav
      aria-label="Breadcrumb"
      data-slot="cp-header"
      className={cn(
        // `tw-page`: the portal lands outside `Page`, so it needs the
        // control-font reset `Page` carries (see ui/page.tsx) or its buttons
        // render at the 18px root size.
        "tw-page",
        "flex h-10 min-w-0 max-w-full items-center gap-2 rounded-full border border-line bg-surface pl-3.5 pr-1.5",
        "[&_[data-slot=button]]:h-7 [&_[data-slot=button]]:px-2.5 [&_[data-slot=button]]:text-[12px]",
        !slot && "m-3 self-start",
      )}
    >
      <Link
        to="/Control_Panel"
        className="hidden shrink-0 text-[12px] font-medium text-subtle no-underline hover:text-brand lg:inline"
      >
        Control Panel
      </Link>
      <HiChevronRight className="hidden size-3 shrink-0 text-subtle lg:block" aria-hidden="true" />
      {parent ? (
        <>
          {parent.to ? (
            <Link
              to={parent.to}
              className="hidden max-w-[11rem] shrink-0 truncate text-[12px] font-medium text-subtle no-underline hover:text-brand sm:inline"
            >
              {parent.label}
            </Link>
          ) : (
            <span className="hidden shrink-0 text-[12px] font-medium text-subtle sm:inline">{parent.label}</span>
          )}
          <HiChevronRight className="hidden size-3 shrink-0 text-subtle sm:block" aria-hidden="true" />
        </>
      ) : null}
      <h1
        className="m-0 min-w-0 truncate text-[14px] font-bold tracking-tight text-ink sm:text-[15px]"
        title={description}
      >
        {title}
      </h1>
      {actions ? <span className="flex shrink-0 items-center gap-1">{actions}</span> : null}
    </nav>
  );

  return (
    // Edge to edge: the embedded page brings its own padding and background.
    <Page className="space-y-0 p-0 sm:space-y-0 sm:p-0 md:p-0">
      {slot ? createPortal(box, slot) : box}
      {children}
    </Page>
  );
}
