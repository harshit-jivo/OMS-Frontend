/**
 * The homepage — every screen the signed-in user may open, as tiles under
 * module tabs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * `/Dashboard` used to be the landing page, the login target, AND the redirect
 * target for every denied route — which is why it could never be gated: taking
 * it away from anyone would strand them in a redirect loop. So a sales
 * analytics screen was permanently open to the legal reviewer, the tracker
 * clerk and the distributor, none of whom have any use for it.
 *
 * Splitting the two jobs is what unlocks the gate. This page is the one that
 * has to be open to everybody, and it costs nothing to open because it
 * contains nothing: it renders LINKS, each of which is already guarded at the
 * route. The analytics moved to `/Sales_Dashboard`, which is now behind the
 * `Sales_Dashboard` permission like any other page.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE SOURCE FOR "WHAT CAN I OPEN"
 * ─────────────────────────────────────────────────────────────────────────
 * The tiles are `SIDEBAR_SECTIONS` filtered through `canOpen` — the same table
 * the router enforces and the same call the rail makes. Not a second list of
 * pages: a second list is a list that drifts, and the failure mode is a tile
 * that navigates straight into a redirect.
 *
 * The consequence is that this page needs no maintenance. Adding a route with
 * a `routeAccess` rule and a `navigation.ts` line puts it here automatically,
 * for exactly the people who can open it.
 *
 * Not a security boundary — see `auth/permissions.ts`. Hiding a tile is
 * courtesy; the route guard and the server are the enforcement.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineArrowRight, HiOutlineLockClosed, HiOutlineSquares2X2 } from "react-icons/hi2";

import { useAuth } from "@/auth";
import { canOpen } from "@/auth/routeAccess";
import { SIDEBAR_SECTIONS, type SidebarLinkDef } from "@/components/layout/navigation";
import { EmptyState, Page, PageHeader, SectionHeading } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";

/** The pseudo-tab that shows every module at once. It is the default. */
const ALL = "__all__";

interface HomeGroup {
  label: string;
  links: SidebarLinkDef[];
}

/**
 * One page, as a button.
 *
 * A `Link`, not a `Button` with an `onClick` navigate: middle-click, ctrl-click
 * and "copy link address" are things people do with a launcher, and a button
 * silently does none of them.
 */
function Tile({ link }: { link: SidebarLinkDef }) {
  const Icon = link.icon;
  return (
    <Link
      to={link.to}
      className={[
        "group flex items-center gap-3 rounded-card border border-line bg-card p-3.5",
        "no-underline shadow-card transition-colors",
        "hover:border-brand-line hover:bg-brand-soft",
        "focus-visible:outline-none focus-visible:shadow-focus",
      ].join(" ")}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
        <Icon className="size-[18px] [stroke-width:1.5]" />
      </span>
      {/* Wraps rather than truncating. "Payments Dashboard" and "Party Product
          Assignment" both overflow 220px, and a launcher tile whose label
          reads "Payments Dash…" is a tile you have to hover to identify. */}
      <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-ink">
        {link.label}
      </span>
      {/* Appears on hover only: on a grid of twenty tiles, twenty permanent
          arrows are twenty things to look past. */}
      <HiOutlineArrowRight
        aria-hidden="true"
        className="size-4 shrink-0 text-brand opacity-0 transition-opacity group-hover:opacity-100"
      />
    </Link>
  );
}

function TileGrid({ links }: { links: SidebarLinkDef[] }) {
  return (
    <div className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
      {links.map((link) => (
        <Tile key={link.to} link={link} />
      ))}
    </div>
  );
}

export default function Home() {
  const { session } = useAuth();

  /*
   * A section survives only if at least one of its links does — the same rule
   * the rail uses, so the two never disagree about which modules a user has.
   * `gate ?? to` mirrors it as well: two Reports links are billing-only even
   * though their routes sit under the Reports grant.
   */
  const groups = useMemo<HomeGroup[]>(
    () =>
      SIDEBAR_SECTIONS.map((section) => ({
        label: section.label,
        links: section.links.filter((link) => canOpen(session, link.gate ?? link.to)),
      })).filter((group) => group.links.length > 0),
    [session],
  );

  const [tab, setTab] = useState<string>(ALL);

  /*
   * Derived, not stored. The session arrives after the first render, so the
   * set of tabs changes underneath this state at least once — and a selected
   * tab that no longer exists would render an empty panel with no way back.
   * Falling through to ALL means the page is always showing something real.
   */
  const selected = groups.some((group) => group.label === tab) ? tab : ALL;
  const shown = selected === ALL ? groups : groups.filter((g) => g.label === selected);
  const totalLinks = groups.reduce((sum, group) => sum + group.links.length, 0);

  const firstName = (session?.name || session?.username || "").split(" ")[0];

  return (
    <Page>
      <PageHeader
        eyebrow={session?.roleDisplay || undefined}
        title={firstName ? `Welcome, ${firstName}` : "Welcome"}
        description={
          totalLinks
            ? `${totalLinks} ${totalLinks === 1 ? "screen is" : "screens are"} open to you. Pick one to get started.`
            : "Your account is active, but no screens have been assigned to it yet."
        }
      />

      {groups.length === 0 ? (
        /* Not an error, and it must not read as one: the account works, it
           simply has no grants yet. It names who fixes it, because the user
           cannot. */
        <EmptyState
          icon={HiOutlineLockClosed}
          title="Nothing assigned yet"
          hint="Your administrator decides which screens your account can open. Ask them to grant the ones you need, then sign in again."
        />
      ) : (
        <>
          {/* One tab per module the user actually has. A single-module user —
              a distributor, a legal reviewer — gets "All" plus their one
              module, which is honest: it says the app is this big for them. */}
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <TabList label="Modules" className="w-max">
              <Tab
                id="home-tab-all"
                aria-controls="home-panel"
                selected={selected === ALL}
                onClick={() => setTab(ALL)}
              >
                <HiOutlineSquares2X2 aria-hidden="true" className="size-4 [stroke-width:1.5]" />
                All
              </Tab>
              {groups.map((group) => (
                <Tab
                  key={group.label}
                  id={`home-tab-${group.label}`}
                  aria-controls="home-panel"
                  selected={selected === group.label}
                  onClick={() => setTab(group.label)}
                >
                  {group.label}
                </Tab>
              ))}
            </TabList>
          </div>

          <div
            id="home-panel"
            role="tabpanel"
            aria-labelledby={selected === ALL ? "home-tab-all" : `home-tab-${selected}`}
            className="flex flex-col gap-5"
          >
            {shown.map((group) => (
              <section key={group.label} className="flex flex-col gap-2.5">
                {/* The heading stays on a single-module panel too. Without it
                    the tab is the only thing naming what the tiles are, and
                    that label is above the fold, not beside them. */}
                <SectionHeading>{group.label}</SectionHeading>
                <TileGrid links={group.links} />
              </section>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
