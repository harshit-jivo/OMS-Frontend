import { Link } from "react-router-dom";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Breadcrumbs — where this page sits, and the way back.
 *
 * The app has 108 screens behind a sidebar and no other sense of hierarchy:
 * a page tells you what it is, never what it is part of. That is tolerable on
 * a list reached from a nav link and genuinely confusing on a record opened
 * from a table, which until now announced itself only as an order number.
 *
 * It replaces the `eyebrow` on pages that have a trail. `eyebrow` said
 * "Orders" — the same information, minus the way back.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE LAST CRUMB IS NOT A LINK
 * ─────────────────────────────────────────────────────────────────────────
 * It is the page you are on, so it gets `aria-current="page"` and no anchor.
 * A trail whose final item links to itself is the most common breadcrumb bug
 * and it teaches people the trail is decorative.
 *
 * A crumb takes EITHER a `to` (a route) or an `onClick` (a view change within
 * one route, like closing a detail panel). View Orders needs the second: its
 * detail view is state, not a URL, so "View Orders" has to be a button that
 * clears that state rather than a link that would reload the page it is
 * already on.
 */

export type Crumb = {
  label: React.ReactNode;
  /** Route to navigate to. Mutually exclusive with `onClick`. */
  to?: string;
  /** In-page navigation, for a view that is state rather than a URL. */
  onClick?: () => void;
};

/**
 * Both crumb kinds look identical; only their element differs.
 *
 * The BUTTON kind goes through `ui/button`'s `link` variant rather than being
 * a hand-rolled `<button>`. Preflight is not imported in this app, so a bare
 * button keeps the UA's outset border and grey face — which is precisely how
 * this component first shipped.
 */
const linkClass =
  "rounded-sm text-subtle transition-colors hover:text-brand hover:underline " +
  "focus-visible:outline-none focus-visible:shadow-focus";

export function Breadcrumbs({
  items,
  className,
  ...props
}: Omit<React.ComponentProps<"nav">, "children"> & { items: Crumb[] }) {
  const trail = items.filter(Boolean);
  if (trail.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      data-slot="breadcrumbs"
      className={cn("mb-1", className)}
      {...props}
    >
      <ol className="m-0 flex flex-wrap items-center gap-1.5 p-0 text-[11px] font-medium">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 ? (
                // Decorative: the list structure already conveys the nesting,
                // so a screen reader should not read "slash" between items.
                <span aria-hidden="true" className="text-line-strong">
                  /
                </span>
              ) : null}

              {isLast ? (
                <span aria-current="page" className="text-body">
                  {crumb.label}
                </span>
              ) : crumb.to ? (
                <Link to={crumb.to} className={linkClass}>
                  {crumb.label}
                </Link>
              ) : crumb.onClick ? (
                <Button
                  variant="link"
                  size="inline"
                  onClick={crumb.onClick}
                  className={linkClass}
                >
                  {crumb.label}
                </Button>
              ) : (
                <span className="text-subtle">{crumb.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
