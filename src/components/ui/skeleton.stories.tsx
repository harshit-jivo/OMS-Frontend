import type { Meta, StoryObj } from "@storybook/react-vite";

import { Skeleton, TableSkeleton } from "./skeleton";

const meta = {
  title: "Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A single bar — the building block `TableSkeleton` below is made of. */
export const Bar: Story = {
  render: () => <Skeleton className="h-3.5 w-48" />,
};

/** A few bars of varying width, the way a detail card's fields load in. */
export const FieldGroup: Story = {
  render: () => (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="h-3.5 w-64" />
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="h-3.5 w-52" />
    </div>
  ),
};

/**
 * `TableSkeleton` — the placeholder for a sales-order list while it loads,
 * sized to the eight-column, ten-row page every paginated table shows.
 */
export const Table: Story = {
  render: () => <TableSkeleton label="Loading orders" />,
};

/** Sized to a narrower table, e.g. the four-column distributor list. */
export const NarrowTable: Story = {
  render: () => <TableSkeleton columns={4} rows={5} label="Loading distributors" />,
};
