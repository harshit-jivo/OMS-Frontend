import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook config for the shadcn/ui primitive set (Phase 6.5).
 *
 * This is a SEPARATE Vite pipeline from `vite.config.ts` at the repo root —
 * Storybook's react-vite framework builds its own base config rather than
 * loading the app's, so none of the app config's build-only concerns (the
 * release build-number check, the manualChunks vendor split, the dev proxy)
 * apply here. `viteFinal` below adds back only the two things the ui
 * components actually need: the `@/` alias every one of them imports through,
 * and the Tailwind v4 plugin that turns their utility classes into real CSS.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: "@storybook/react-vite",
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import("vite");
    const tailwindcss = (await import("@tailwindcss/vite")).default;

    return mergeConfig(viteConfig, {
      plugins: [tailwindcss()],
      resolve: {
        // Mirrors vite.config.ts / tsconfig.app.json / vitest.config.ts —
        // every `@/…` import in the ui primitives resolves through this.
        alias: {
          "@": fileURLToPath(new URL("../src", import.meta.url)),
        },
      },
    });
  },
};

export default config;
