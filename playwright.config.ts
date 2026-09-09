import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression — the safety net Phase 2 needs.
 *
 * WHY THIS EXISTS
 * ---------------
 * 271 unit tests assert structure, permissions, wiring, and that no page throws.
 * Not one of them asserts a pixel. Phase 2 replaces hand-rolled tables, modals
 * and badges across 50 pages and deletes the CSS behind them — a change whose
 * entire risk surface is "does it still look right", and which `tsc` and every
 * existing test will pass regardless.
 *
 * Without this, each primitive swap is verified by someone clicking through 50
 * screens and remembering what they used to look like. That is how the
 * four-branch merge lost `formData.warehouse` silently.
 *
 * DETERMINISM IS THE WHOLE PROBLEM
 * --------------------------------
 * A screenshot test that flakes gets muted, and a muted test protects nothing.
 * Everything below that looks fussy is there because it is a source of
 * one-pixel diffs:
 *
 *   * `vite preview` over the production build, not the dev server — HMR
 *     injects a client and dev builds differ from what ships.
 *   * A fixed viewport and `deviceScaleFactor: 1`. The default follows the
 *     host display, so the same test produces different images on a laptop and
 *     in CI.
 *   * `reducedMotion: "reduce"` plus a stylesheet that zeroes transitions —
 *     mid-animation captures are the single largest source of flake.
 *   * A frozen clock. Half these pages render "today" into a date field.
 *   * One worker. Parallel workers share the preview server, and a page that
 *     writes localStorage would race another reading it.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not test against the real API. Every request is answered from a
 * fixture (e2e/fixtures.ts) so the images depend on the code, not on what
 * happens to be in the database that day. That means it catches STYLING and
 * LAYOUT regressions, which is exactly what Phase 2 puts at risk, and it will
 * not notice a broken query.
 */
export default defineConfig({
  testDir: "./e2e",
  // Screenshots are the assertion, so a stale image must fail rather than be
  // quietly regenerated. `--update-snapshots` is the deliberate way to accept
  // a change.
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",

  fullyParallel: false,
  workers: 1,
  // A retry hides exactly the flake this config exists to eliminate. If a test
  // is unstable, the fix is upstream of here.
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  // Generous: the first navigation to a lazily-loaded route fetches its chunk.
  timeout: 60_000,
  expect: {
    // ---- The tolerance, and why it is zero ------------------------------
    //
    // This was `maxDiffPixelRatio: 0.002`, reasoned from "anti-aliasing differs
    // between platforms" and asserted to be "far too tight to let a changed
    // padding, colour or font size through". That reasoning was wrong in both
    // directions.
    //
    // It was measured when Phase 2.2 converted the tracker badges. Six files
    // changed; the suite reported four. `/Tracker_Alerts` differed by 935
    // pixels — six badges in a new colour and weight — and passed, because 935
    // is under 0.2% of a 1440x900 image. A badge is small. So is a status
    // colour, an icon, a focus ring: precisely the things Phase 2 changes.
    //
    // The measured noise floor is not 0.2%. With fonts served from the cache in
    // e2e/harness.ts, 32 unchanged pages produce EXACTLY ZERO differing pixels,
    // run after run. So zero is the honest threshold, and `threshold` below
    // still allows each individual pixel to shift slightly in colour before it
    // counts as different at all.
    //
    // If this suite is ever run on another OS — CI is ubuntu and does not run
    // it today — the baselines will have to be regenerated there. That is the
    // correct outcome rather than a reason to loosen this: a tolerance wide
    // enough to absorb a platform change is wide enough to absorb a bug.
    toHaveScreenshot: {
      maxDiffPixels: 0,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },

  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    // Nested under `contextOptions` rather than set directly: in this version
    // `reducedMotion` is a browser-context option, and writing it at the top
    // level is a type error rather than a silent no-op — which is the good
    // outcome, since a silently-ignored one would let animations back in and
    // make every screenshot a coin flip.
    contextOptions: { reducedMotion: "reduce" },
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // AFTER the spread, deliberately. `devices["Desktop Chrome"]` carries
        // its own 1280x720 viewport and deviceScaleFactor, which silently beat
        // the values in the top-level `use` block — the first run of this
        // config captured everything at 1280 while the config said 1440, with
        // nothing to indicate the setting had been ignored.
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        channel: undefined,
      },
    },
  ],

  /*
   * If a run fails with a blank page and `net::ERR_NO_BUFFER_SPACE` in the
   * trace, it is not the app.
   *
   * Every test gets a fresh browser context, so its HTTP cache starts empty and
   * it re-fetches the whole critical path — about a dozen files — over new
   * sockets. Windows holds a closed socket in TIME_WAIT for four minutes by
   * default, and a full run now takes about four minutes: connections from the
   * first test are still held when the last one starts, and the ephemeral port
   * pool runs dry. A different, arbitrary test fails each time and every one of
   * them passes on its own, which is exactly what that looks like.
   *
   * `npm run test:visual:split` runs the two specs as separate processes. Each
   * finishes inside the TIME_WAIT window, so neither reaches the ceiling.
   * Retries are deliberately NOT configured: they would hide this and, worse,
   * hide a real failure alongside it.
   */
  webServer: {
    // The production build, served the way it ships.
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
