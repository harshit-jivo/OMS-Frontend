import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Pagination } from "./pagination";

const meta = {
  title: "Pagination",
  component: Pagination,
  parameters: { layout: "padded" },
  // Every story below supplies its own `render`, but Pagination's props are
  // all required — CSF still needs a well-typed `args` at the meta level for
  // `StoryObj<typeof meta>` to resolve on stories that don't repeat them.
  args: { page: 1, totalPages: 1, onPageChange: () => {} },
} satisfies Meta<typeof Pagination>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive: Prev/Next actually move `page`, clamped to [1, totalPages]. */
function InteractivePagination({
  totalPages,
  summary,
}: {
  totalPages: number;
  summary?: string;
}) {
  const [page, setPage] = useState(1);
  return <Pagination page={page} totalPages={totalPages} onPageChange={setPage} summary={summary} />;
}

/** The plain form — the middle of the sales-order list, no summary text. */
export const Default: Story = {
  render: () => <InteractivePagination totalPages={7} />,
};

/**
 * With the `summary` slot four of the nineteen pagers use — a distributor's
 * order list, page 1.
 */
export const WithSummary: Story = {
  render: () => <InteractivePagination totalPages={5} summary="Showing 1–10 of 47 orders" />,
};

/** A single page of results: both buttons disabled, nothing to page through. */
export const SinglePage: Story = {
  render: () => <InteractivePagination totalPages={1} summary="Showing 1–3 of 3 invoices" />,
};

/** The last page — "Next" disabled, "Prev" still live. */
export const LastPage: Story = {
  args: {
    page: 12,
    totalPages: 12,
    onPageChange: () => {},
    summary: "Showing 111–118 of 118 payments",
  },
};
