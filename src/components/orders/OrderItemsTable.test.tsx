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

/**
 * Why a line is free, said on the line.
 *
 * An auditor or rate approver meets zero-priced lines and has to decide on
 * them. A combo's free half used to look identical to a mispriced line, and a
 * scheme giveaway's only trace was a name buried in the Scheme column.
 *
 * The two badges are drawn from different fields because they mean different
 * things: `is_auto_free` marks a row that IS a giveaway, attached schemes mark
 * a row that CARRIES one.
 */
describe("the combo and scheme badges", () => {
  /* "Scheme" is a column HEADING too, so every query here is scoped to the
     badge itself rather than to the text. */
  const BADGE = '[data-slot="badge"]';

  it("marks a combo's free half, and names the pack that earned it", () => {
    render(
      <OrderItemsTable
        items={[
          item({
            item_name: "Extra Light Olive 1 Ltr",
            is_auto_free: true,
            combo_source_code: "JV-COMBO-5L",
            total: 0,
          }),
        ]}
      />,
    );

    const badge = screen.getByText("Combo", { selector: BADGE });
    expect(badge).toBeInTheDocument();
    // The tooltip answers the question the badge raises: free with WHAT?
    expect(badge).toHaveAttribute("title", expect.stringContaining("JV-COMBO-5L"));
  });

  it("gives a scheme giveaway a ROW of its own, not just a badge", () => {
    // It is stored ON the paid line rather than as one, so without this the
    // approver saw a name in a column and had to infer that something ships
    // free. Three lines is the point of this change.
    render(
      <OrderItemsTable
        items={[
          item({
            schemes: [
              {
                scheme_name: "BUY 1 GET 1 FREE",
                scheme_qty: 960,
                scheme_item_code: "FG0000031",
                scheme_item_name: "Extra Light Olive 1 Ltr",
                scope_type: "STATE",
                scope_value: "DL",
              },
            ] as OrderItem["schemes"],
          }),
        ]}
      />,
    );

    // Two rows for one paid item: the item, then its giveaway.
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2
    // The giveaway is named, not left as a bare code.
    expect(screen.getByText("Extra Light Olive 1 Ltr")).toBeInTheDocument();

    const badge = screen.getByText("Scheme", { selector: BADGE });
    expect(badge).toHaveAttribute("title", expect.stringContaining("BUY 1 GET 1 FREE"));
    expect(badge).toHaveAttribute("title", expect.stringContaining("STATE DL"));
  });

  it("badges BOTH ends of a combo pair", () => {
    // The parent used to carry nothing, so the pack and its free half looked
    // unrelated. The parent is found through the child's `combo_source_code`.
    render(
      <OrderItemsTable
        items={[
          item({ item_code: "FG0000003", item_name: "Cold Press 5 Ltr Combo" }),
          item({
            item_code: "FG0000076",
            item_name: "Extra Light Olive 1 Ltr",
            is_auto_free: true,
            combo_source_code: "FG0000003",
            total: 0,
          }),
        ]}
      />,
    );

    expect(screen.getAllByText("Combo", { selector: BADGE })).toHaveLength(2);
  });

  it("does not badge a parent whose free half is not in the order", () => {
    // Nothing to explain, so nothing is claimed.
    render(<OrderItemsTable items={[item({ item_code: "FG0000003" })]} />);

    expect(screen.queryByText("Combo", { selector: BADGE })).toBeNull();
  });

  it("puts neither on an ordinary paid line", () => {
    // A badge on every row is the same as no badge at all.
    render(<OrderItemsTable items={[item()]} />);

    expect(screen.queryByText("Combo", { selector: BADGE })).toBeNull();
    expect(screen.queryByText("Scheme", { selector: BADGE })).toBeNull();
  });

  it("shows both when a combo line also carries a scheme", () => {
    // They are independent facts, so they must not be an either/or.
    render(
      <OrderItemsTable
        items={[
          item({
            is_auto_free: true,
            combo_source_code: "JV-COMBO-5L",
            schemes: [{ scheme_name: "STATE DL", scheme_qty: 10 }] as OrderItem["schemes"],
          }),
        ]}
      />,
    );

    // The combo badge on the line, the scheme badge on the giveaway row below.
    expect(screen.getByText("Combo", { selector: BADGE })).toBeInTheDocument();
    expect(screen.getByText("Scheme", { selector: BADGE })).toBeInTheDocument();
  });

  it("still labels a combo line when the source code is missing", () => {
    // `combo_source_code` is blank on orders written before it existed; the
    // badge is still the useful half.
    render(<OrderItemsTable items={[item({ is_auto_free: true })]} />);

    expect(screen.getByText("Combo", { selector: BADGE })).toHaveAttribute(
      "title",
      expect.stringContaining("combo pack"),
    );
  });
});

describe("row order", () => {
  it("keeps a combo's two halves together and puts giveaways last", () => {
    // The scheme used to render directly under the line it hangs off, which
    // pushed the combo's free half away from the pack that earned it. An
    // approver reads the pair as one thing, so they must stay adjacent.
    render(
      <OrderItemsTable
        items={[
          item({
            item_code: "FG0000003",
            item_name: "Cold Press 5 Ltr + Extra Light Olive 1 Ltr 4 Pcs",
            schemes: [
              {
                scheme_name: "BUY 1 GET 1 FREE",
                scheme_qty: 80,
                scheme_item_code: "FG0000031",
                scheme_item_name: "Mustard Pakki Ghani 1 Ltr 20 Pcs",
              },
            ] as OrderItem["schemes"],
          }),
          item({
            item_code: "FG0000076",
            item_name: "Extra Light Olive 1 Ltr 1 Pcs",
            is_auto_free: true,
            combo_source_code: "FG0000003",
            total: 0,
          }),
        ]}
      />,
    );

    const names = screen
      .getAllByRole("row")
      .slice(1) // drop the header
      .map((row) => row.textContent ?? "");

    expect(names).toHaveLength(3);
    expect(names[0]).toContain("Cold Press 5 Ltr");
    expect(names[1]).toContain("Extra Light Olive 1 Ltr 1 Pcs"); // the free half
    expect(names[2]).toContain("Mustard Pakki Ghani"); // the giveaway, last
  });

  it("shows the code SAP will bill, not the combo wrapper's", () => {
    // The order keeps the combo's own code on purpose; SAP is sent the
    // parent's. The approver was being shown the one that never leaves OMS.
    render(
      <OrderItemsTable
        items={[
          item({
            item_code: "FG0000003",
            item_name: "Cold Press 5 Ltr + Extra Light Olive 1 Ltr 4 Pcs",
            combo_parent_item_code: "FG0000012",
          }),
        ]}
      />,
    );

    expect(screen.getByText("FG0000012")).toBeInTheDocument();
    expect(screen.queryByText("FG0000003")).toBeNull();
    // The combo identity survives in the name and the tooltip.
    expect(screen.getByText("FG0000012")).toHaveAttribute(
      "title",
      expect.stringContaining("FG0000003"),
    );
  });

  it("leaves an ordinary line's code alone", () => {
    render(<OrderItemsTable items={[item({ item_code: "JV-CAN-1L" })]} />);

    expect(screen.getByText("JV-CAN-1L")).toBeInTheDocument();
    expect(screen.getByText("JV-CAN-1L")).not.toHaveAttribute("title");
  });
});
