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
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
    restoreMocks: true,
  },
});
