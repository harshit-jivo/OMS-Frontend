import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Test config, kept separate from `vite.config.ts` on purpose.
 *
 * `vite.config.ts` resolves and validates the release build number and throws
 * when it is missing. That check is correct for a build and has nothing to do
 * with running tests, so tests get their own config rather than a special case
 * carved into that one.
 */
export default defineConfig({
  /*
   * The build-time constants `vite.config.ts` injects.
   *
   * Vite replaces these at build time, so under Vitest — which uses THIS
   * config, not that one — they are simply undefined, and any module reading
   * one throws `ReferenceError: __APP_VERSION__ is not defined` on import.
   *
   * That is how the /Profile smoke test failed on its first run: the page was
   * fine, the test environment was incomplete. Worth spelling out because the
   * symptom points at the page rather than at the config.
   *
   * The values are placeholders on purpose. Reading the real version from
   * package.json would make a test that asserts on it pass or fail depending on
   * an unrelated version bump; a fixed, obviously-fake value cannot be mistaken
   * for a real build.
   */
  define: {
    __APP_VERSION__: JSON.stringify("0.0.0-test"),
    __APP_BUILD_NUMBER__: JSON.stringify(0),
  },
  // Mirrors vite.config.ts. Vitest does not read that file (see above), so an
  // alias added there alone resolves in the browser and fails in the tests.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    // Loaded before every test file: jest-dom matchers, and an axios adapter
    // that answers every request with an empty success so nothing can reach
    // the network. See src/test/setup.ts for why that matters more than it
    // looks — an unmocked request in jsdom hangs rather than failing, and the
    // resulting flake is attributed to the wrong test.
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Rendering 57 pages is slower than a unit test; the default 5s
    // trips on the largest of them on a cold run.
    testTimeout: 20_000,
    globals: false,
    restoreMocks: true,
  },
});
