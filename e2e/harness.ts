/**
 * The fixture that makes a screenshot of this app reproducible.
 *
 * Three jobs, in the order they have to happen:
 *
 *   1. Answer every API call from a fixture, so the image depends on the code
 *      rather than on what is in the database today.
 *   2. Seed a session, so the app renders the app instead of the login screen.
 *   3. Freeze everything that moves — the clock, animations, fonts — so two
 *      runs of unchanged code produce identical bytes.
 *
 * (3) is not polish. A visual test that flakes gets muted within a week, and a
 * muted test protects nothing; the whole value of this harness is that a red
 * result means something changed.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test as base, expect, type Page, type Route } from "@playwright/test";

import { fixtureFor } from "./fixtures";

/** The instant every test pretends it is. Chosen to be unambiguous in a diff. */
export const FROZEN_NOW = new Date("2026-06-15T09:30:00+05:30");

/**
 * A signed-in admin.
 *
 * Admin because a screenshot of a page the user is redirected away from is a
 * screenshot of the Dashboard, and 50 of those would look like passing tests
 * while covering nothing.
 */
const SESSION: Record<string, string> = {
  user_id: "1",
  username: "vrtester",
  name: "Visual Tester",
  role: "admin",
  role_display: "Admin",
  extra_roles: JSON.stringify(["admin"]),
  extra_pages: JSON.stringify([]),
  is_superuser: "true",
  is_staff: "true",
  company_id: "1",
  company_name: "Test Company",
  main_group_id: "1",
  main_group_name: "Main",
  // Stops the notification hook bouncing the tab to "/" before anything renders.
  sidebar_collapsed: "false",
};

/** A JWT that is valid well past the frozen clock. Only `exp` is ever read. */
function token(): string {
  const exp = Math.floor(FROZEN_NOW.getTime() / 1000) + 86_400;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `header.${payload}.signature`;
}

/**
 * Answer a request from `fixtures.ts`, falling back to an empty list.
 *
 * The fallback is a bare `[]` because that is what most of this API returns.
 * It is not always right — seven pages read an envelope field off the response
 * and crash on an array — and the error-boundary check in `gotoStable` is what
 * makes each of those loud instead of silently baselined.
 */
async function fulfil(route: Route) {
  const url = route.request().url();
  const fixture = fixtureFor(url);
  const body = fixture ?? [];

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
}

/* -------------------------------------------------------------------------
 * Fonts
 * ---------------------------------------------------------------------- */

const FONT_CACHE = join(dirname(fileURLToPath(import.meta.url)), "__fonts__");

/**
 * Serve Google Fonts from a committed cache instead of the network.
 *
 * The first version of this harness let the font requests through, reasoning
 * that blocking them would screenshot a fallback face no user ever sees. That
 * reasoning still holds — which is why this caches the real files rather than
 * blocking them. What does not hold is doing it over the network on every run.
 *
 * The cost showed up as a flake with a very specific fingerprint: about one run
 * in five, one page came out 900px tall instead of 911, and it was a different
 * page each time. Every page in that 11px cluster is one whose document height
 * comes from the SIDEBAR rather than its own content — so a hair of difference
 * in how Inter measured moved the whole page, on whichever route happened to
 * catch the slow fetch. Each one passed on its own, every time, which is the
 * worst possible failure mode: it reads as "that test is just flaky".
 *
 * Cached files are committed, so CI and an offline laptop render exactly what
 * the baselines were taken with. A cache miss fetches once and writes it.
 */
async function fulfilFont(route: Route) {
  const url = route.request().url();
  const key = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const body = join(FONT_CACHE, `${key}.bin`);
  const meta = join(FONT_CACHE, `${key}.json`);

  if (existsSync(body) && existsSync(meta)) {
    const { contentType } = JSON.parse(readFileSync(meta, "utf-8")) as { contentType: string };
    await route.fulfill({ status: 200, contentType, body: readFileSync(body) });
    return;
  }

  const response = await route.fetch();
  const buffer = await response.body();
  const contentType = response.headers()["content-type"] ?? "application/octet-stream";

  mkdirSync(FONT_CACHE, { recursive: true });
  writeFileSync(body, buffer);
  writeFileSync(meta, JSON.stringify({ url, contentType }, null, 2));

  await route.fulfill({ status: 200, contentType, body: buffer });
}

/**
 * Attach the font cache to a page. Exported because the signed-out login test
 * uses the bare `page` fixture — it has no session by design — and would
 * otherwise be the one baseline still taken over the network.
 */
export async function routeFonts(page: Page): Promise<void> {
  await page.route("https://fonts.googleapis.com/**", fulfilFont);
  await page.route("https://fonts.gstatic.com/**", fulfilFont);
}

/**
 * Re-run this page as a different role, for markup that only that role sees.
 *
 * Call it BEFORE navigating — both halves install `addInitScript`, which only
 * applies to subsequent loads.
 *
 * It writes the role in two places on purpose:
 *
 *   1. **`localStorage`**, which is what `AuthProvider` falls back to. Today
 *      that is the only one that matters, and by accident: `getCurrentUser`
 *      returns `response.data.data` (authService.ts:14), the `/auth/profile/`
 *      fixture does not exist, so the bare `[]` fallback makes that
 *      `undefined`, `sessionFromApi` throws on it and the provider keeps the
 *      stored session (AuthProvider.tsx:85-94).
 *   2. **The `/auth/profile/` response**, which is what would win the moment
 *      anyone adds that fixture. Without this half, adding it would silently
 *      revert every role-gated test to the fixture's role and the screenshots
 *      would keep passing while covering the wrong thing.
 *
 * `extra_roles` keeps `admin`, so route access is unchanged and the only thing
 * that moves is the primary role the gates read.
 */
export async function asRole(
  page: Page,
  role: "auditor" | "billing" | "manager",
  options: { suppressPushPrompt?: boolean } = {},
): Promise<void> {
  const { suppressPushPrompt = true } = options;

  await page.addInitScript(
    ({ role, suppress, now }) => {
      localStorage.setItem("role", role);
      localStorage.setItem("role_display", role.toUpperCase());
      localStorage.setItem("extra_roles", JSON.stringify([role, "admin"]));

      // The push-permission modal auto-opens for exactly these roles and would
      // sit on top of whatever the test came to photograph. "dismissed" is
      // re-shown only after seven days and the clock is frozen, so this holds.
      if (suppress) {
        localStorage.setItem(
          "oms_notif_permission_state",
          JSON.stringify({ status: "dismissed", lastPromptAt: now, dismissCount: 1 }),
        );
      }
    },
    { role, suppress: suppressPushPrompt, now: FROZEN_NOW.getTime() },
  );

  await page.route(/\/auth\/profile\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      // `getCurrentUser` reads `response.data.data`, hence the double wrap.
      body: JSON.stringify({
        data: {
          id: 1,
          username: "vrtester",
          full_name: "Visual Tester",
          role: role,
          role_display: role.toUpperCase(),
          roles: [role, "admin"],
          extra_pages: [],
          is_superuser: true,
          is_staff: true,
          company: { id: 1, name: "Test Company" },
          main_group: { id: 1, name: "Main" },
        },
      }),
    });
  });
}

export const test = base.extend<{ appPage: Page }>({
  appPage: async ({ page }, use) => {
    // ---- 1. Nothing reaches a real server ---------------------------------
    // Matched on the path, not the host, because the API origin comes from an
    // env var that differs between machines.
    await page.route("**/api/**", fulfil);
    await routeFonts(page);

    // ---- 2. A session, before any script runs -----------------------------
    await page.addInitScript(
      ({ session, jwt }) => {
        for (const [k, v] of Object.entries(session)) localStorage.setItem(k, v);
        localStorage.setItem("access", jwt);
        localStorage.setItem("refresh", "vr-refresh");
      },
      { session: SESSION, jwt: token() },
    );

    // ---- 3. Freeze the clock ----------------------------------------------
    // Installed via `addInitScript` rather than Playwright's clock API because
    // it must be in place before the first module evaluates — several pages
    // compute default date ranges at import time, not on render.
    await page.addInitScript((iso: string) => {
      const fixed = new Date(iso).getTime();
      const RealDate = Date;
      class FrozenDate extends RealDate {
        constructor(...args: unknown[]) {
          if (args.length === 0) super(fixed);
          else super(...(args as ConstructorParameters<typeof RealDate>));
        }
        static now() {
          return fixed;
        }
      }
      globalThis.Date = FrozenDate as unknown as DateConstructor;

      // `Math.random` seeds warehouse tone classes and a few keys. A fixed
      // sequence keeps those stable without changing what they mean.
      let seed = 42;
      Math.random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
    }, FROZEN_NOW.toISOString());

    await use(page);
  },
});

/**
 * Navigate and wait until the page is genuinely settled.
 *
 * Each wait is here because it caused a diff:
 *
 *   * `document.fonts.ready` — text reflows when Inter finishes loading, and a
 *     capture in between is a screenshot of the fallback font.
 *   * two animation frames — React commits, then the browser paints. Capturing
 *     between the two catches a half-rendered tree.
 *   * the loading placeholder disappearing — routes are lazily loaded, so the
 *     first navigation to one shows `PageLoading` before the real page.
 */
/**
 * Wait until the page has stopped changing, and freeze what is left.
 *
 * Split out of `gotoStable` so that a screenshot taken AFTER A CLICK waits the
 * same way a screenshot taken after a navigation does. Before this it was one
 * inline sequence, and `interactions.visual.spec.ts` would have had to either
 * duplicate it or approximate it — and an approximation of a settle wait is a
 * flake with a delay on it.
 *
 * Each wait is here because it caused a diff:
 *
 *   * `document.fonts.ready` — text reflows when Inter finishes loading, and a
 *     capture in between is a screenshot of the fallback font.
 *   * two animation frames — React commits, then the browser paints. Capturing
 *     between the two catches a half-rendered tree.
 *   * a repeating content signature — see below.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

  // ---- Wait for the layout to stop moving -------------------------------
  //
  // `networkidle` plus two frames is not the same as "settled". A page that
  // renders, then grows by a row height when a second request resolves, is
  // quiescent at both moments and different in each.
  //
  // This caught a real one: `/View_Orders` was captured at 1440x911 in one full
  // run and 1440x900 in the next three, and passed every time it was run on its
  // own. Eleven pixels of document height, appearing about one run in four — a
  // visual test that fails one time in four gets muted, and a muted test
  // protects nothing.
  //
  // Height alone is not enough either, and that cost a second failure:
  // `/Sales_Invoice` came out 81% different in one run and passed the next
  // four. Eighty-one percent is not a timing wobble, it is a different screen —
  // the page's OWN skeleton, still up. A skeleton is built to occupy the space
  // its content will, so the document height never moved.
  //
  // So the signature includes the text and the element count. Bounded, because
  // a page with a genuinely never-settling layout (a ticking clock, an endless
  // spinner) must fail the screenshot rather than hang for the full timeout.
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __omsLast?: string; __omsStable?: number };
      const signature = [
        document.documentElement.scrollHeight,
        document.body.innerText.length,
        document.querySelectorAll("*").length,
      ].join(":");
      if (w.__omsLast === signature) w.__omsStable = (w.__omsStable ?? 0) + 1;
      else w.__omsStable = 0;
      w.__omsLast = signature;
      return (w.__omsStable ?? 0) >= 3;
    },
    undefined,
    { timeout: 10_000, polling: 100 },
  );

  // ---- Refuse to screenshot a broken page --------------------------------
  //
  // This check exists because its absence produced exactly the failure it now
  // prevents. The first run captured `App_User`, `Einvoice` and `Ewaybill` as
  // "stable baselines" — all three were the ErrorBoundary, thrown because this
  // harness answered every request with `[]` and the pages expect an object.
  // Three error screens were recorded as the reference images those pages would
  // be compared against forever, and the suite passed twice.
  //
  // A screenshot of a crash is worse than no screenshot: it is stable, so it
  // never flakes, and it looks like coverage.
  const boundary = page.getByText("Something went wrong", { exact: false });
  if (await boundary.count()) {
    const detail = await page.evaluate(() => document.body.innerText.slice(0, 300));
    throw new Error(
      `The page rendered the error boundary instead of its content.

${detail}

` +
        "Add a fixture for the endpoint it needs in e2e/fixtures.ts. Do NOT " +
        "baseline this — a screenshot of a crash is stable, never flakes, and " +
        "looks exactly like coverage.",
    );
  }

  // Belt and braces on top of `reducedMotion` and `animations: "disabled"`:
  // an animation driven by JS rather than CSS ignores both.
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
    }`,
  });
}

/**
 * Navigate and wait until the page is genuinely settled.
 *
 * The lazy-route placeholder is waited for here rather than in `settle()`: it
 * only ever appears on a navigation, and a click never produces one.
 */
export async function gotoStable(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "networkidle" });

  await page
    .locator('[role="status"]')
    .filter({ hasText: "Loading" })
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(() => {
      // Absent already, which is the common case once a chunk is cached.
    });

  await settle(page);
}

export { expect };
