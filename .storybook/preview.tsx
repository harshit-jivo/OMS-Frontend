import type { Preview } from "@storybook/react-vite";

// Same order as src/main.tsx: Tailwind first. Its utilities sit in a cascade
// layer and every legacy stylesheet is unlayered — unlayered wins regardless
// of import order, so this is only about matching the app's determinism, not
// precedence. See src/styles/tailwind.css for the full explanation.
import "../src/styles/tailwind.css";
import "../src/index.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      // Group stories in source order (Table, Badge, Dialog, Skeleton,
      // Pagination, Tabs, Toast) rather than alphabetically.
      storySort: {
        order: [
          "Table",
          "Badge",
          "Dialog",
          "Skeleton",
          "Pagination",
          "Tabs",
          "Toast",
        ],
      },
    },
  },
};

export default preview;
