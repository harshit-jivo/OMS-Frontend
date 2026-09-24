import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderItemsTable } from "./OrderItemsTable";
import type { OrderItem } from "@/services/ordersService";

// `useUILabels` reaches for the label config over the network; the cards only
// need it for one figure label.
vi.mock("@/services/uiConfig", () => ({
  useUILabels: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

/**
 * The shared line items — one card per line.
 *
 * What the item IS (name, code, category, variety, scheme) sits at the top of
 * the card; the figures sit in the same eight labelled slots at the foot of
 * every card, so they still line up down the page like a table would.
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

const cards = () => screen.getAllByRole("listitem");
const cardOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("OrderItemsTable", () => {
  it("lists the items, one card each", () => {
    render(<OrderItemsTable items={[item(), item({ item_code: "JV-MUS-1L" })]} />);

    expect(cards()).toHaveLength(2);
    expect(screen.getByText("JV-CAN-1L")).toBeInTheDocument();
    expect(screen.getByText("JV-MUS-1L")).toBeInTheDocument();
  });

  it("stacks code, category and variety under the name, and pulls the amount out", () => {
    render(<OrderItemsTable items={[item()]} />);

    const card = within(cardOf("Jivo Canola Oil 1 Ltr"));
    expect(card.getByText("JV-CAN-1L")).toBeInTheDocument();
    expect(card.getByText("Edible Oil")).toBeInTheDocument();
    expect(card.getByText("Commodity")).toBeInTheDocument();
    expect(card.getByText("Amount")).toBeInTheDocument();
    expect(card.getByText("6420.00")).toBeInTheDocument();
  });

  it("puts the same eight figures on every card, labelled", () => {
    render(<OrderItemsTable items={[item(), item({ item_code: "JV-MUS-1L" })]} />);

    for (const card of cards()) {
      const labels = within(card).getAllByRole("term").map((el) => el.textContent);
      expect(labels).toEqual([
        "Qty", "Pcs", "Boxes", "Ltrs", "Total Ltrs", "Price List (Basic)", "Basic Price", "Tax %",
      ]);
    }
  });

  it("title-cases the variety SAP sends in caps", () => {
    render(<OrderItemsTable items={[item()]} />);

    expect(screen.getByText("Commodity")).toBeInTheDocument();
    expect(screen.queryByText("COMMODITY")).not.toBeInTheDocument();
  });

  it("drops the variety chip when asked", () => {
    render(<OrderItemsTable items={[item()]} variety={false} />);

    expect(screen.queryByText("Commodity")).not.toBeInTheDocument();
  });

  it("shows nothing where a line has no variety", () => {
    render(<OrderItemsTable items={[item({ variety_type: "" })]} />);

    expect(screen.queryByText("Commodity")).not.toBeInTheDocument();
  });

  it("names the scheme a line carries, with its quantity, on the card", () => {
    render(
      <OrderItemsTable
        items={[
          item({ schemes: [{ scheme_name: "BUY 1 GET 1 FREE", scheme_qty: 80 }] as OrderItem["schemes"] }),
        ]}
      />,
    );

    const card = cardOf("Jivo Canola Oil 1 Ltr");
    expect(card).toHaveTextContent("BUY 1 GET 1 FREE");
    expect(card).toHaveTextContent("Qty 80");
  });

  it("says so when there are no items", () => {
    render(<OrderItemsTable items={[]} />);

    expect(screen.getByText("No items found")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

/**
 * Why a line is free, said on the line.
 *
 * An auditor or rate approver meets zero-priced lines and has to decide on
 * them. A combo's free half used to look identical to a mispriced line, and a
 * scheme giveaway's only trace was a name buried in a column.
 *
 * The two badges are drawn from different fields because they mean different
 * things: `is_auto_free` marks a row that IS a giveaway, attached schemes mark
 * a row that CARRIES one.
 */
describe("the combo and scheme badges", () => {
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

  it("gives a scheme giveaway a CARD of its own, not just a badge", () => {
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

    // Two cards for one paid item: the item, then its giveaway.
    expect(cards()).toHaveLength(2);
    expect(screen.getByText("Extra Light Olive 1 Ltr")).toBeInTheDocument();
    // The giveaway carries the quantity, and prices at zero.
    const giveaway = within(cardOf("Extra Light Olive 1 Ltr"));
    expect(giveaway.getByText("960")).toBeInTheDocument();
    expect(giveaway.getAllByText("0.00").length).toBeGreaterThan(0);

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
    render(<OrderItemsTable items={[item({ item_code: "FG0000003" })]} />);

    expect(screen.queryByText("Combo", { selector: BADGE })).toBeNull();
  });

  it("puts neither on an ordinary paid line", () => {
    render(<OrderItemsTable items={[item()]} />);

    expect(screen.queryByText("Combo", { selector: BADGE })).toBeNull();
    expect(screen.queryByText("Scheme", { selector: BADGE })).toBeNull();
  });

  it("shows both when a combo line also carries a scheme", () => {
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

    // The combo badge on the line, the scheme badge on the giveaway card below.
    expect(screen.getByText("Combo", { selector: BADGE })).toBeInTheDocument();
    expect(screen.getByText("Scheme", { selector: BADGE })).toBeInTheDocument();
  });

  it("still labels a combo line when the source code is missing", () => {
    render(<OrderItemsTable items={[item({ is_auto_free: true })]} />);

    expect(screen.getByText("Combo", { selector: BADGE })).toHaveAttribute(
      "title",
      expect.stringContaining("combo pack"),
    );
  });
});

describe("card order", () => {
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

    const names = cards().map((card) => card.textContent ?? "");

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

describe("a line given away on purpose", () => {
  it("shows the approver it is free, and why", () => {
    render(
      <OrderItemsTable
        items={[item({ item_name: "Extra Light Olive 1 Ltr", is_free: true, free_reason: "Launch sample" })]}
      />,
    );
    const card = cardOf("Extra Light Olive 1 Ltr");
    expect(within(card).getByText("Free", { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    expect(within(card).getByText("Free: Launch sample")).toBeInTheDocument();
  });
});
