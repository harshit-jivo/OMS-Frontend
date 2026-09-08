import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderItemsTable } from "./OrderItemsTable";
import type { OrderItem } from "@/services/ordersService";

// `useUILabels` reaches for the label config over the network; the table only
// needs it for one column heading.
vi.mock("@/services/uiConfig", () => ({
  useUILabels: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

/**
 * The shared line-items table.
 *
 * The property worth pinning is the one the four hand-written copies got
 * wrong: the empty row's `colSpan` has to match the header, and the header
 * changes with the `variety` prop.
 */

const item = (over: Partial<OrderItem> = {}): OrderItem =>
  ({
    item_code: "JV-CAN-1L",
    item_name: "Jivo Canola Oil 1 Ltr",
    category: "Edible Oil",
    variety_type: "COMMODITY",
    qty: 60,
    pcs: 12,
    boxes: 5,
    ltrs: 60,
    total: 6420,
    tax_rate: 5,
    price_list_basic: 107,
    basic_price: 107,
    ...over,
  }) as OrderItem;

describe("OrderItemsTable", () => {
  it("lists the items", () => {
    render(<OrderItemsTable items={[item(), item({ item_code: "JV-MUS-1L" })]} />);

    expect(screen.getByText("JV-CAN-1L")).toBeInTheDocument();
    expect(screen.getByText("JV-MUS-1L")).toBeInTheDocument();
  });

  it("title-cases the variety SAP sends in caps", () => {
    render(<OrderItemsTable items={[item()]} />);

    expect(screen.getByText("Commodity")).toBeInTheDocument();
    expect(screen.queryByText("COMMODITY")).not.toBeInTheDocument();
  });

  it("drops the variety column when asked", () => {
    render(<OrderItemsTable items={[item()]} variety={false} />);

    expect(screen.queryByRole("columnheader", { name: "Variety" })).not.toBeInTheDocument();
  });

  it("spans the empty row across every column, with variety", () => {
    // The four hand-written copies each typed this number, and two of them
    // typed it wrong — so the placeholder sat under part of the table.
    render(<OrderItemsTable items={[]} />);

    const cell = screen.getByText("No items found");
    const headers = screen.getAllByRole("columnheader").length;
    expect(Number(cell.getAttribute("colspan"))).toBe(headers);
  });

  it("spans the empty row across every column, without variety", () => {
    render(<OrderItemsTable items={[]} variety={false} />);

    const cell = screen.getByText("No items found");
    const headers = screen.getAllByRole("columnheader").length;
    expect(Number(cell.getAttribute("colspan"))).toBe(headers);
  });

  it("says so when a line carries no scheme", () => {
    render(<OrderItemsTable items={[item()]} />);

    expect(screen.getByText("No scheme")).toBeInTheDocument();
  });

  it("shows a dash rather than an empty cell for a line with no variety", () => {
    render(<OrderItemsTable items={[item({ variety_type: "" })]} />);

    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("scrolls sideways inside its own box", () => {
    // Sixteen columns; without this the PAGE scrolls horizontally, which
    // drags the header and the KPI row off-screen with it.
    const { container } = render(<OrderItemsTable items={[item()]} />);

    expect(container.firstElementChild?.className).toContain("overflow-x-auto");
  });
});
