import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Product_Rates from "./Product_Rates";
import { renderPage } from "../test/renderPage";
import api from "../services/api";
import { userService } from "../services/userService";

/**
 * Product Rates — the payloads behind the three buttons.
 *
 * Every button on this page writes to `party_product_assignments` in bulk, so
 * what matters is not what the table looks like but WHO each request names.
 * These tests pin that: a tick means that row and nothing else, a filter
 * means those parties and nothing else, and the party-side read asks for
 * turned-off rows so they can be turned back on.
 */
const STATES = ["DL", "PB"];
const parties = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  card_code: `C${i}`,
  card_name: `PARTY ${i}`,
  state: STATES[i % 2],
  main_group: "GT",
  chain: "DISTRIBUTOR",
  category: "OIL",
}));

vi.mock("@/lib/sapQueries", () => ({
  useSapProducts: () => ({
    items: [
      { item_code: "FG001", item_name: "CANOLA OIL", category: "OIL", brand: "JIVO" },
      { item_code: "FG002", item_name: "MUSTARD OIL", category: "OIL", brand: "JIVO" },
    ],
  }),
  useSapParties: () => ({ items: parties }),
}));

/** C0 is turned off; the other five hold CANOLA at three different rates. */
const CANOLA_BLOCK = {
  item_code: "FG001",
  item_name: "CANOLA OIL",
  category: "OIL",
  brand: "JIVO",
  sal_pack_unit: "1.0",
  product_active: true,
  party_count: 6,
  active_count: 5,
  inactive_count: 1,
  parties: parties.map((party, i) => ({
    card_code: party.card_code,
    card_name: party.card_name,
    state: party.state,
    main_group: party.main_group,
    category: "OIL",
    basic_rate: [170, 180, 190][i % 3],
    is_active: i !== 0,
  })),
};

/** What the PB parties (C1, C3, C5) hold between them. */
const PB_PRODUCTS = [
  {
    item_code: "FG001",
    item_name: "CANOLA OIL",
    category: "OIL",
    brand: "JIVO",
    sal_pack_unit: "1.0",
    party_count: 3,
    active_count: 2,
    inactive_count: 1,
    eligible_parties: 3,
    holders: [
      { card_code: "C1", basic_rate: 180, is_active: true },
      { card_code: "C3", basic_rate: 180, is_active: true },
      { card_code: "C5", basic_rate: 180, is_active: false },
    ],
    min_rate: 180,
    max_rate: 180,
    distinct_rates: 1,
    common_rate: 180,
  },
  {
    item_code: "FG002",
    item_name: "MUSTARD OIL",
    category: "OIL",
    brand: "JIVO",
    sal_pack_unit: "5.0",
    party_count: 1,
    active_count: 1,
    inactive_count: 0,
    eligible_parties: 3,
    holders: [{ card_code: "C1", basic_rate: 900, is_active: true }],
    min_rate: 900,
    max_rate: 900,
    distinct_rates: 1,
    common_rate: 900,
  },
];

const WROTE = { data: { data: { updated: 2, unchanged: 0, skipped: 0, errors: [] } } };

let post: ReturnType<typeof spyOnPost>;

const spyOnPost = () => vi.spyOn(api, "post");

beforeEach(() => {
  vi.spyOn(userService, "getUsers").mockResolvedValue([
    { id: 9, username: "raminder", name: "Raminder" },
  ] as never);
  vi.spyOn(userService, "getUserParties").mockResolvedValue({
    data: { parties: [{ card_code: "C2" }, { card_code: "C4" }] },
  } as never);
  post = spyOnPost();
  post.mockImplementation(async (url: string) => {
    if (String(url).includes("bulk-product/parties")) {
      return { data: { data: { items: [CANOLA_BLOCK] } } } as never;
    }
    if (String(url).includes("bulk-party/products")) {
      return { data: { data: { products: PB_PRODUCTS } } } as never;
    }
    return WROTE as never;
  });
});

afterEach(() => vi.restoreAllMocks());

const calls = (fragment: string) =>
  post.mock.calls.filter(([url]) => String(url).includes(fragment));

async function open() {
  const user = userEvent.setup();
  renderPage(<Product_Rates />, { route: "/Product_Rates" });
  return user;
}

async function chooseProduct(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Product$/ }));
  await user.click(await screen.findByRole("option", { name: /CANOLA OIL/ }));
  await screen.findByText("PARTY 1");
}

describe("Product Rates", () => {
  it("asks for nothing until a product or a party filter is chosen", async () => {
    await open();
    expect(screen.getByText("Choose a product, or narrow the parties")).toBeInTheDocument();
    expect(calls("bulk-")).toHaveLength(0);
  });

  it("turns a product off for exactly the ticked parties", async () => {
    const user = await open();
    await chooseProduct(user);

    // Buttons stay off until something is ticked.
    expect(screen.getByRole("button", { name: "Turn off" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Tick PARTY 1" }));
    await user.click(screen.getByRole("checkbox", { name: "Tick PARTY 3" }));
    expect(screen.getByText("2 of 6 ticked")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Turn off" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(/Turn off CANOLA OIL for 2 parties\?/)).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Turn off" }));

    await waitFor(() => expect(calls("set-active")).toHaveLength(1));
    const [, body] = calls("set-active")[0] as [string, Record<string, unknown>];
    expect(body).toEqual({
      is_active: false,
      items: [{ item_code: "FG001", category: "OIL" }],
      party_selections: [
        { card_code: "C1", category: "OIL" },
        { card_code: "C3", category: "OIL" },
      ],
    });
    await screen.findByText(/2 assignments changed/);
  });

  it("re-prices by percent and previews each party's own new rate", async () => {
    const user = await open();
    await chooseProduct(user);

    await user.click(screen.getByRole("checkbox", { name: /Tick all 6 parties/ }));
    await user.click(screen.getByRole("button", { name: "Change rate…" }));
    const dialog = within(await screen.findByRole("dialog"));
    // The turned-off party (C0) keeps its rate and is not counted.
    expect(dialog.getByRole("heading", { name: /for 5 parties/ })).toBeInTheDocument();

    await user.click(dialog.getByRole("radio", { name: "Change by %" }));
    await user.type(dialog.getByRole("textbox"), "10");
    expect(dialog.getAllByText("₹198.00").length).toBeGreaterThan(0); // 180 + 10%

    await user.click(dialog.getByRole("button", { name: /Change by 10%/ }));
    await waitFor(() => expect(calls("update-rates")).toHaveLength(1));
    const [, body] = calls("update-rates")[0] as [string, Record<string, unknown>];
    expect(body).toMatchObject({
      rate_mode: "percent",
      apply_to: "existing",
      items: [{ item_code: "FG001", category: "OIL", basic_rate: 10 }],
    });
    // Only sellable rows are named; C0 is turned off.
    expect((body.party_selections as { card_code: string }[]).map((p) => p.card_code)).toEqual([
      "C1", "C2", "C3", "C4", "C5",
    ]);
  });

  it("filters to the parties in scope and reads their turned-off rows too", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: /^State$/ }));
    await user.click(await within(screen.getByRole("group")).findByRole("checkbox", { name: "PB" }));
    await user.keyboard("{Escape}");

    await screen.findByText("MUSTARD OIL");
    const [, body] = calls("bulk-party/products")[0] as [string, Record<string, unknown>];
    expect(body).toEqual({
      include_inactive: true,
      party_selections: [
        { card_code: "C1", category: "OIL" },
        { card_code: "C3", category: "OIL" },
        { card_code: "C5", category: "OIL" },
      ],
    });
    expect(screen.getByText("2 products held by 3 parties")).toBeInTheDocument();
  });

  it("names the parties behind a product row, and the parties in scope", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: /^State$/ }));
    await user.click(await within(screen.getByRole("group")).findByRole("checkbox", { name: "PB" }));
    await user.keyboard("{Escape}");
    await screen.findByText("MUSTARD OIL");

    // Codes come from the server; names from the party list the page holds.
    await user.click(screen.getByRole("button", { name: /Show the parties holding CANOLA OIL/ }));
    expect(screen.getByText("PARTY 3")).toBeInTheDocument();
    expect(screen.getByText("PARTY 5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "3 parties in scope" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("PARTY 1")).toBeInTheDocument();
    expect(dialog.queryByText("PARTY 2")).not.toBeInTheDocument();
  });

  it("turns a product back on only where it is off, one request per product", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: /^State$/ }));
    await user.click(await within(screen.getByRole("group")).findByRole("checkbox", { name: "PB" }));
    await user.keyboard("{Escape}");
    await screen.findByText("MUSTARD OIL");

    await user.click(screen.getByRole("checkbox", { name: /Tick all 2 products/ }));
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Turn on" }));

    await waitFor(() => expect(calls("set-active")).toHaveLength(1));
    // MUSTARD has nothing turned off, so it is not sent at all.
    const [, body] = calls("set-active")[0] as [string, Record<string, unknown>];
    expect(body).toEqual({
      is_active: true,
      items: [{ item_code: "FG001", category: "OIL" }],
      party_selections: [{ card_code: "C5", category: "OIL" }],
    });
  });

  it("scopes by the parties assigned to a user", async () => {
    const user = await open();
    await chooseProduct(user);
    await user.click(screen.getByRole("button", { name: /^Assigned to$/ }));
    await user.click(await screen.findByRole("option", { name: /Raminder/ }));

    // Raminder's book is C2 and C4; nobody else stays on screen.
    await waitFor(() => expect(screen.queryByText("PARTY 1")).not.toBeInTheDocument());
    expect(screen.getByText("PARTY 2")).toBeInTheDocument();
    expect(screen.getByText("PARTY 4")).toBeInTheDocument();
    expect(screen.getByText("2 parties in scope")).toBeInTheDocument();
  });
});
