/**
 * Phase 0.6 — the login -> order -> submit path.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE, AND WHY IT DOES NOT USE `appPage`
 * ─────────────────────────────────────────────────────────────────────────
 * Every other spec in this suite (`routes.visual.spec.ts`,
 * `interactions.visual.spec.ts`) runs on the `appPage` fixture, which seeds a
 * signed-in session straight into `localStorage` before the first paint (see
 * harness.ts). That is deliberate there — 33+ route baselines re-typing a
 * password each would be paying for the login screen over and over for no
 * benefit — but it also means nothing in the suite has ever driven a real
 * sign-in — the Jivo Auth `/auth/login/` call, the OMS `/auth/profile/` call
 * that follows it, the notice `handleLogin` shows, or the redirect it
 * schedules (Login.tsx `handleLogin`). A seeded session would make that
 * untestable from this file too: Login's own "already signed in" effect calls
 * `resolveStartupSession()` on mount and navigates away before the form could
 * be touched.
 *
 * So this file uses the bare `page` fixture and assembles the same wiring
 * `appPage` provides by hand (fonts, the fixture-backed `**\/api\/**` catch-all)
 * MINUS the seeded session, so the Login screen is the true entry point.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS ALREADY COVERED, AND WHAT IS NOT
 * ─────────────────────────────────────────────────────────────────────────
 * `interactions.visual.spec.ts`'s "add sales wizard" block already drives the
 * wizard to Review and posts to `/orders/create/` — twice — but only to
 * inspect the REQUEST body via a route it installs. Neither of those tests
 * looks at what the user is shown back. This file's last assertion is the
 * "Saved" dialog itself (Add_Sales.tsx:148-181): the order id and the next
 * approval stage the backend named, which is the actual success state a
 * person submitting an order sees and nothing else exercises.
 */
import type { Route } from "@playwright/test";

import { fixtureFor } from "./fixtures";
import { expect, gotoStable, routeFonts, settle, test } from "./harness";

/**
 * The same "answer from a fixture, fall back to `[]`" job `fulfil` does in
 * harness.ts, duplicated rather than imported: it is not exported from there,
 * and this file needs it wired to the bare `page` fixture rather than
 * `appPage`. See the file header for why `appPage` cannot be used here.
 */
async function fulfilFromFixtures(route: Route) {
  const url = route.request().url();
  const body = fixtureFor(url) ?? [];
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
}

/**
 * A JWT valid a day past "now" — real wall-clock time, not `FROZEN_NOW`. This
 * file does not freeze the clock the way `appPage` does (nothing here is
 * screenshotted, so there is nothing for a moving clock to make flaky) and
 * `isAccessTokenValid` (services/api.ts:128) reads `exp` against `Date.now()`.
 */
function realToken(): string {
  const exp = Math.floor(Date.now() / 1000) + 86_400;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `header.${payload}.signature`;
}

test.describe("smoke path: login to order submission", () => {
  test("logs in for real, builds an order, and submits it", async ({ page }) => {
    // ---- Wiring -------------------------------------------------------
    await routeFonts(page);
    await page.route("**/api/**", fulfilFromFixtures);

    // Sign-in is two calls now, and neither has a `fixtures.ts` entry that
    // would do: Jivo Auth's `/auth/login/` (nothing else in the suite calls
    // it), and OMS's `/auth/profile/`, whose fixture is a thin user that is
    // not an admin as far as `sessionFromApi` is concerned. Both registered
    // AFTER the generic handler above so they win — Playwright runs the
    // most-recently-added matching route first (the same ordering
    // `capturePost` in interactions.visual.spec.ts relies on for
    // `/orders/create/`).
    //
    // `/auth/login/` matches on the path alone, so it answers whichever Jivo
    // Auth the build points at (`VITE_AUTH_BASE_URL`). The request is kept to
    // check below that it carried what Jivo Auth expects and nothing more.
    const signIns: { body: Record<string, unknown>; headers: Record<string, string> }[] = [];
    await page.route(/\/auth\/login\//, async (route) => {
      signIns.push({
        body: route.request().postDataJSON(),
        headers: route.request().headers(),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        // Jivo Auth's sign-in answer: the token pair, nothing else.
        body: JSON.stringify({ access: realToken(), refresh: "smoke-refresh" }),
      });
    });

    await page.route(/\/auth\/profile\//, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        // `getCurrentUser` reads `response.data.data`, hence the envelope.
        // Same identity the rest of the suite's admin session uses
        // (harness.ts SESSION), so nothing later can disagree with it.
        body: JSON.stringify({
          success: true,
          data: {
            id: 1,
            auth_id: "jivo-vrtester",
            username: "vrtester",
            full_name: "Visual Tester",
            email: "vr@example.com",
            role: "admin",
            role_display: "Admin",
            roles: ["admin"],
            extra_pages: [],
            is_superuser: true,
            is_staff: true,
            company: { id: 1, name: "Test Company" },
            main_group: { id: 1, name: "Main" },
          },
        }),
      });
    });

    // ---- 1. Log in ------------------------------------------------------
    await page.goto("/");

    await page.getByPlaceholder("name@company.com").fill("vr@example.com");
    await page.getByPlaceholder("••••••••").fill("does-not-matter-its-mocked");
    await page.getByRole("button", { name: "Log in" }).click();

    // Success indicator: the notice `handleLogin` shows before its
    // `setTimeout`-delayed redirect (Login.tsx:122). It was a toast and the
    // wording was "Login successful. Redirecting..."; the conversion made it
    // an inline `Notice` on the card, which is why this assertion moved.
    await expect(page.getByText("Signed in. Taking you through…")).toBeVisible();

    // Success indicator: the redirect itself. Admin holds none of
    // tracker/legal/hais/distributor/mart_approval, so `landingPathFor`
    // (config/pageAccess.ts) sends it to /Home — the launcher that replaced
    // /Dashboard as the landing page when the sales analytics moved behind
    // the `Sales_Dashboard` permission.
    await page.waitForURL(/\/Home/);
    await settle(page);

    // What went to Jivo Auth: the email, and the name this browser's session
    // is listed under. And none of OMS's X-* headers, which Jivo Auth's CORS
    // does not allow — one of them would fail the preflight in a real browser.
    expect(signIns).toHaveLength(1);
    expect(signIns[0].body).toMatchObject({ email: "vr@example.com", device_name: "OMS web" });
    expect(Object.keys(signIns[0].headers).filter((name) => /^x-/i.test(name))).toEqual([]);

    // ---- 2. Build an order ------------------------------------------------
    await gotoStable(page, "/Add_Sales");

    // Each of these is a combo that only renders its options once the input
    // is focused (Add_Sales.tsx / OrderWizard.tsx), so the placeholder is the
    // handle — same pattern as "add sales wizard" in
    // interactions.visual.spec.ts.
    const pick = async (placeholder: string, option: string) => {
      await page.getByPlaceholder(placeholder).click();
      await page.getByRole("option").filter({ hasText: option }).first().click();
    };

    await pick("Search party...", "Northern Traders");
    // `handlePartySelect` blanks both addresses and nothing refills them, so
    // these two are not optional — without them Continue stays disabled.
    await pick("Search bill to...", "Head Office");
    await pick("Search ship to...", "Main Warehouse");

    const continueButton = page.getByRole("button", { name: "Continue" });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    // Success indicator: step 1 -> step 2 actually advanced.
    await expect(page.getByRole("button", { name: "+ Add Item" })).toBeVisible();

    await page.getByRole("button", { name: "+ Add Item" }).click();
    await page.getByRole("button", { name: /JIVO CANOLA OIL 1 LTR/ }).click();
    await page.getByLabel("Boxes").fill("5");
    await page.getByRole("button", { name: "Add Item", exact: true }).click();

    // Success indicator: the row landed in the order (the item list's own
    // count, in step 2's header) — not just that the
    // add-item modal accepted it, which the existing wizard tests already
    // check via the Pcs field inside that modal.
    await expect(page.getByText("1 item")).toBeVisible();

    await page.getByRole("button", { name: "Continue" }).click(); // -> step 3, Summary
    await page.getByRole("button", { name: "Continue" }).click(); // -> step 4, Review

    // The scheme engine's preview is debounced 400ms and lands in state after
    // the step advances; waiting for its output on screen avoids racing it
    // the same way interactions.visual.spec.ts:345-350 does.
    await expect(page.getByText("1 box (24 pcs)")).toBeVisible();

    // ---- 3. Submit ------------------------------------------------------
    const posted: Record<string, unknown>[] = [];
    await page.route(/\/orders\/create\//, async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        // `status` feeds `getNextStageLabel` (useSalesOrderForm.ts:865-875) —
        // "auditor" in the status/message text maps to "Auditor Approval".
        body: JSON.stringify({
          order_number: "SO-SMOKE-1",
          status: "Pending Auditor Approval",
        }),
      });
    });

    await page.getByRole("button", { name: "Save Order" }).click();
    await page.getByRole("button", { name: "Yes, create" }).click();

    await expect.poll(() => posted.length).toBe(1);
    // A light sanity check that this posted the order actually built above,
    // not an accident of the fixture — the full payload shape is already
    // pinned by "the create payload the wizard actually posts".
    expect(posted[0].card_code).toBe("C000123");

    // Success indicator: the actual "Saved" dialog (Add_Sales.tsx:148-181) —
    // order id and next stage named back to the user. This is the one thing
    // neither of the existing payload-snapshot tests ever looks at.
    await expect(page.getByText("Order created successfully")).toBeVisible();
    await expect(page.getByText("SO-SMOKE-1")).toBeVisible();
    await expect(page.getByText("Auditor Approval")).toBeVisible();

    // Dismissing it closes the loop: `handleSuccessClose` clears
    // `saveSuccess` and (for a fresh order, not a resumed one) leaves the
    // form already reset by `resetOrderForm` (useSalesOrderForm.ts:1092-1094).
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Order created successfully")).toHaveCount(0);
    await expect(page.getByPlaceholder("Search party...")).toBeVisible();
  });
});
