import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Bulk_Product_Assignment from "./Bulk_Product_Assignment";
import { renderPage } from "../test/renderPage";
import api from "../services/api";
import { userService } from "../services/userService";

/**
 * Bulk Product Assignment — the party list at real sizes.
 *
 * The live data is lopsided: the average product is held by 22 parties and
 * the largest by 521. The page rendered every row of every chosen product at
 * once, so a few of the big ones laid out thousands of rows with no way to
 * search them.
 *
 * The risk in fixing that is the SELECT-ALL box. Every button on this card
 * writes to `party_product_assignments` in bulk, so a box that says "tick what
 * you can see" and means "tick all 521" is a wrong bulk write, not a wrong
 * pixel. These tests exist mostly to hold that line.
 */
const BIG = "FG-BIG";
const SMALL = "FG-SMALL";

function party(index: number, state: string) {
  return {
    card_code: `C${String(index).padStart(4, "0")}`,
    card_name: `PARTY ${index} ${state}`,
    state,
    main_group: null,
    category: "OIL",
    basic_rate: 180,
    is_active: true,
  };
}

const { BLOCKS } = vi.hoisted(() => {
  const make = (
    item_code: string,
    item_name: string,
    parties: ReturnType<typeof party>[],
  ) => ({
    item_code,
    item_name,
    category: "OIL",
    brand: "JIVO",
    variety: null,
    sal_pack_unit: null,
    product_active: true,
    party_count: parties.length,
    active_count: parties.length,
    inactive_count: 0,
    min_rate: 180,
    max_rate: 180,
    distinct_rates: 1,
    common_rate: 180,
    parties,
  });
  return { BLOCKS: make };
});

// 120 parties: over the auto-expand threshold AND over the row cap, so one
// fixture exercises both. 40 of them are in PUNJAB, the search needle.
const bigParties = Array.from({ length: 120 }, (_, i) =>
  party(i, i % 3 === 0 ? "PUNJAB" : "HARYANA"),
);
const smallParties = Array.from({ length: 4 }, (_, i) => ({
  ...party(i, "DELHI"),
  // C0002 is assigned but NOT sellable, so "Turn on" has exactly one candidate
  // while "Turn off" has three.
  is_active: i !== 2,
}));

vi.mock("@/lib/sapQueries", () => ({
  useSapProducts: () => ({
    items: [
      { item_code: BIG, item_name: "BIG PRODUCT", category: "OIL", brand: "JIVO" },
      { item_code: SMALL, item_name: "SMALL PRODUCT", category: "OIL", brand: "JIVO" },
    ],
  }),
  useSapParties: () => ({
    items: [
      // Already holds SMALL PRODUCT (it is smallParties[0]).
      { card_code: "C0000", card_name: "PARTY 0 DELHI", state: "DL", main_group: "GT", chain: "DISTRIBUTOR", category: "OIL" },
      // The facet fixtures: two states x two main groups, so "GT in PB" is a
      // genuine intersection rather than either filter alone.
      { card_code: "PB-GT-1", card_name: "PUNJAB GT ONE", state: "PB", main_group: "GT", chain: "DISTRIBUTOR", category: "OIL" },
      { card_code: "PB-GT-2", card_name: "PUNJAB GT TWO", state: "PB", main_group: "GT", chain: "RETAILER", category: "OIL" },
      { card_code: "PB-EC-1", card_name: "PUNJAB ECOM", state: "PB", main_group: "E-COMMERCE", chain: "DISTRIBUTOR", category: "OIL" },
      { card_code: "NEW-1", card_name: "FRESH OIL PARTY", state: "HR", main_group: "GT", chain: "DISTRIBUTOR", category: "OIL" },
      // Wrong category: the server would skip it silently.
      { card_code: "BEV-1", card_name: "FIZZ DRINKS CO", state: "GA", main_group: "GT", chain: "RETAILER", category: "BEVERAGES" },
      // No category: takes anything.
      { card_code: "ANY-1", card_name: "GENERAL TRADERS", state: "GA", main_group: "ROI", chain: "RETAILER", category: null },
    ],
  }),
}));

beforeEach(() => {
  vi.spyOn(userService, "getUsers").mockResolvedValue([
    { id: 9, username: "raminder", name: "Raminder" },
  ] as never);
  // Their book: one assignable, one that already holds it (C0000), and one of
  // the wrong category — so the shortcut has something to skip AND report.
  vi.spyOn(userService, "getUserParties").mockResolvedValue({
    data: {
      parties: [
        { card_code: "NEW-1" },
        { card_code: "C0000" },
        { card_code: "BEV-1" },
      ],
    },
  } as never);
  vi.spyOn(api, "post").mockImplementation(async (url: string) => {
    if (String(url).includes("bulk-product/parties")) {
      return {
        data: {
          data: {
            items: [
              BLOCKS(BIG, "BIG PRODUCT", bigParties),
              {
                ...BLOCKS(SMALL, "SMALL PRODUCT", smallParties),
                active_count: 3,
                inactive_count: 1,
              },
            ],
          },
        },
      } as never;
    }
    return { data: { data: {} } } as never;
  });
});

afterEach(() => vi.restoreAllMocks());

/** Choose both products so the two size regimes render together. */
async function showBlocks() {
  const user = userEvent.setup();
  renderPage(<Bulk_Product_Assignment />, { route: "/Bulk_Product_Assignment" });

  // The trigger takes its name from the `Field` label, and the options are
  // checkboxes in a `role="group"` rather than a listbox. Scoped to that
  // group because the cards behind it also carry a "Tick every party for
  // SMALL PRODUCT" box, which matches the same name.
  await user.click(screen.getByRole("button", { name: /Products/i }));
  const options = () => within(screen.getByRole("group"));
  await user.click(await options().findByRole("checkbox", { name: /BIG PRODUCT/i }));
  await user.click(await options().findByRole("checkbox", { name: /SMALL PRODUCT/i }));
  await user.keyboard("{Escape}");

  const bigCard = (await screen.findByText("BIG PRODUCT")).closest(
    "[data-slot='card']",
  ) as HTMLElement;
  const smallCard = (await screen.findByText("SMALL PRODUCT")).closest(
    "[data-slot='card']",
  ) as HTMLElement;
  return { user, big: within(bigCard), small: within(smallCard), bigCard };
}

describe("Bulk Product Assignment — party lists at scale", () => {
  it("opens a short list but not a long one", async () => {
    const { big, small } = await showBlocks();

    // 4 parties: nothing to protect anyone from, so it behaves as before.
    expect(small.getByRole("table")).toBeInTheDocument();
    // 120 parties: collapsed, with the summary still answering the basics.
    expect(big.queryByRole("table")).not.toBeInTheDocument();
    expect(big.getByText(/120 parties assigned/)).toBeInTheDocument();
  });

  it("caps how many rows a long list paints when opened", async () => {
    const { user, big } = await showBlocks();
    await user.click(big.getByRole("button", { name: /BIG PRODUCT/ }));

    expect(big.getAllByRole("row")).toHaveLength(51); // 50 parties + header
    expect(big.getByText(/showing 50 of 120/)).toBeInTheDocument();

    await user.click(big.getByRole("button", { name: /Show the remaining 70/ }));
    expect(big.getAllByRole("row")).toHaveLength(121);
  });

  it("searches the whole list, not just the painted slice", async () => {
    const { user, big } = await showBlocks();
    await user.click(big.getByRole("button", { name: /BIG PRODUCT/ }));

    // PARTY 117 is past the 50-row cap, so it is only reachable by search.
    expect(big.queryByText(/PARTY 117/)).not.toBeInTheDocument();
    await user.type(big.getByRole("searchbox"), "PARTY 117");
    expect(big.getByText(/PARTY 117/)).toBeInTheDocument();
  });

  /**
   * "Assign to more parties" writes with `update_or_create(is_active=True)`,
   * so anyone it names who already holds the item is re-priced. What the LEFT
   * pane offers is the only thing standing between a dialog labelled "assign"
   * and a silent re-price, so that is the assertion.
   *
   * The picker is a two-pane transfer list rather than a dropdown: its panel
   * used to open over the dialog it belongs to, and the chip rail wrapped and
   * shoved the form down. Candidates on the left, chosen on the right.
   */
  describe("assigning the item to new parties", () => {
    async function openAssign() {
      const { user, small } = await showBlocks();
      await user.click(small.getByRole("button", { name: /Assign to more parties/ }));
      const dialog = await screen.findByRole("dialog");
      const paneFor = (heading: RegExp) =>
        within(within(dialog).getByText(heading).closest("section")!);
      return {
        user,
        dialog: within(dialog),
        left: paneFor(/Parties without it/),
        right: paneFor(/Will be assigned/),
      };
    }

    it("never offers a party that already holds the item", async () => {
      const { left } = await openAssign();

      expect(left.getByRole("button", { name: /FRESH OIL PARTY/ })).toBeInTheDocument();
      // C0000 holds SMALL PRODUCT already — offering it would re-price it.
      expect(left.queryByRole("button", { name: /PARTY 0 DELHI/ })).not.toBeInTheDocument();
    });

    it("never offers a party whose category the server would skip", async () => {
      const { left } = await openAssign();

      expect(left.queryByRole("button", { name: /FIZZ DRINKS CO/ })).not.toBeInTheDocument();
      // No category means it takes anything, so it stays.
      expect(left.getByRole("button", { name: /GENERAL TRADERS/ })).toBeInTheDocument();
    });

    it("moves a party across so what is chosen is always on screen", async () => {
      const { user, left, right } = await openAssign();

      await user.click(left.getByRole("button", { name: /FRESH OIL PARTY/ }));

      expect(right.getByRole("button", { name: /Remove FRESH OIL PARTY/ })).toBeInTheDocument();
      // And it leaves the candidate list, so the two panes cannot both claim it.
      expect(left.queryByRole("button", { name: /FRESH OIL PARTY/ })).not.toBeInTheDocument();
    });

    it("seeds the rate from the common one and posts what was chosen", async () => {
      const { user, dialog, left } = await openAssign();
      await user.click(left.getByRole("button", { name: /FRESH OIL PARTY/ }));

      // Every holder is on 180, so that is the offered default.
      expect(dialog.getByRole("spinbutton")).toHaveValue(180);

      await user.click(dialog.getByRole("button", { name: /Assign 1/ }));

      expect(api.post).toHaveBeenCalledWith("/auth/bulk-party/assign-products/", {
        party_selections: [{ card_code: "NEW-1", category: "OIL" }],
        products: [{ item_code: SMALL, category: "OIL", basic_rate: 180 }],
      });
    });

    it("adds a whole user's book in one go", async () => {
      const { user, dialog, right } = await openAssign();

      await user.click(dialog.getByRole("button", { name: /Add everyone assigned/ }));
      await user.click(await screen.findByRole("option", { name: /Raminder/ }));

      // Only the one that is actually assignable comes across.
      expect(
        await right.findByRole("button", { name: /Remove FRESH OIL PARTY/ }),
      ).toBeInTheDocument();
    });

    /**
     * A shortcut that quietly takes 1 of 3 is how you come to believe a product
     * reached a salesperson's whole book when it did not.
     */
    it("says how many of the book it could not take", async () => {
      const { user, dialog } = await openAssign();

      await user.click(dialog.getByRole("button", { name: /Add everyone assigned/ }));
      await user.click(await screen.findByRole("option", { name: /Raminder/ }));

      // C0000 already holds it; BEV-1 is the wrong category.
      expect(await dialog.findByText(/Added 1 of 3/)).toBeInTheDocument();
      expect(dialog.getByText(/2 already hold it/)).toBeInTheDocument();
    });

    /**
     * Picking out of ~950 parties one at a time is the job; the facets are how
     * you stop doing that. Values WITHIN a facet are OR'd (Punjab or Haryana);
     * the facets AND with each other, so "GT in Punjab" is a real intersection
     * and not whichever filter ran last.
     */
    describe("narrowing the candidates", () => {
      /** Open a facet's picker; its trigger takes its name from the Field. */
      const openFacet = async (
        user: ReturnType<typeof userEvent.setup>,
        dialog: ReturnType<typeof within>,
        label: string,
      ) => {
        await user.click(dialog.getByRole("button", { name: label }));
        return within(screen.getByRole("group"));
      };

      const tickFacet = async (
        user: ReturnType<typeof userEvent.setup>,
        dialog: ReturnType<typeof within>,
        label: string,
        ...values: string[]
      ) => {
        const panel = await openFacet(user, dialog, label);
        for (const value of values) {
          await user.click(panel.getByRole("checkbox", { name: new RegExp(`^${value}`) }));
        }
        // Close it by its own trigger; Escape would close the dialog.
        await user.click(dialog.getByRole("button", { name: label }));
      };

      it("combines state and main group, rather than replacing one with the other", async () => {
        const { user, dialog, left } = await openAssign();

        await tickFacet(user, dialog, "State", "PB");
        // Counted as list items, not buttons: the pane header carries an
        // "Add all" button of its own once a filter is on.
        expect(left.getAllByRole("listitem")).toHaveLength(3);

        await tickFacet(user, dialog, "Main group", "GT");
        // Punjab AND GT: the E-COMMERCE one drops, the Haryana GT one is not
        // pulled back in.
        const names = left.getAllByRole("listitem").map((li) => li.textContent);
        expect(names).toHaveLength(2);
        expect(names.join(" ")).toContain("PUNJAB GT ONE");
        expect(names.join(" ")).not.toContain("PUNJAB ECOM");
        expect(names.join(" ")).not.toContain("FRESH OIL PARTY");
      });

      it("ORs the values chosen within one facet", async () => {
        const { user, dialog, left } = await openAssign();

        await tickFacet(user, dialog, "State", "PB", "HR");
        // Three Punjab plus the one Haryana — a union, not an impossible
        // intersection of two states.
        expect(left.getAllByRole("listitem")).toHaveLength(4);
      });

      it("counts each facet against what the others already allow", async () => {
        const { user, dialog } = await openAssign();

        await tickFacet(user, dialog, "State", "PB");
        const panel = await openFacet(user, dialog, "Main group");
        // Within Punjab, GT is 2 — not the 3 it would be across every state.
        const gt = panel.getByRole("checkbox", { name: /^GT/ }).closest("label")!;
        expect(gt.textContent).toContain("2");
        expect(panel.getByRole("checkbox", { name: /^E-COMMERCE/ })).toBeInTheDocument();
      });

      it("takes the whole filtered set in one click", async () => {
        const { user, dialog, left, right } = await openAssign();

        await tickFacet(user, dialog, "State", "PB");
        await tickFacet(user, dialog, "Main group", "GT");
        await user.click(dialog.getByRole("button", { name: /Add all 2/ }));

        expect(right.getByRole("button", { name: /Remove PUNJAB GT ONE/ })).toBeInTheDocument();
        expect(right.getByRole("button", { name: /Remove PUNJAB GT TWO/ })).toBeInTheDocument();
        // And they leave the candidate list, as any other pick does.
        expect(left.queryByRole("button", { name: /PUNJAB GT ONE/ })).not.toBeInTheDocument();
      });

      it("never offers a facet value the category filter already excluded", async () => {
        const { user, dialog } = await openAssign();
        const panel = await openFacet(user, dialog, "State");

        // BEV-1 is BEVERAGES on an OIL product. ANY-1 has no category so it
        // stays, which is why GA is offered at all — but only once.
        const ga = panel.getByRole("checkbox", { name: /^GA/ }).closest("label")!;
        expect(ga.textContent).toContain("1");
        const pb = panel.getByRole("checkbox", { name: /^PB/ }).closest("label")!;
        expect(pb.textContent).toContain("3");
      });
    });

    it("will not submit without a rate", async () => {
      const { user, dialog, left } = await openAssign();
      await user.click(left.getByRole("button", { name: /FRESH OIL PARTY/ }));
      await user.clear(dialog.getByRole("spinbutton"));

      expect(dialog.getByRole("button", { name: /Assign 1/ })).toBeDisabled();
    });
  });

  /**
   * Turning on and turning off go through the SAME dialog as assigning.
   *
   * They used to be driven by ticking rows in the table, so the filters only
   * ever helped the assign flow and the table was a selection surface as well
   * as a report. One dialog, three candidate sets — and the table is read-only.
   */
  describe("turning the product on and off", () => {
    const openAction = async (name: RegExp) => {
      const { user, small } = await showBlocks();
      await user.click(small.getByRole("button", { name }));
      const dialog = await screen.findByRole("dialog");
      const pane = (heading: RegExp) =>
        within(within(dialog).getByText(heading).closest("section")!);
      return { user, dialog: within(dialog), left: pane(/Parties it is/) };
    };

    it("offers only the parties it is sellable for when turning off", async () => {
      const { left } = await openAction(/Turn off…/);
      // Three of the four holders are active; C0002 is already off.
      expect(left.getAllByRole("listitem")).toHaveLength(3);
      expect(left.queryByRole("button", { name: /PARTY 2 DELHI/ })).not.toBeInTheDocument();
    });

    it("offers only the parties it is turned off for when turning on", async () => {
      const { left } = await openAction(/Turn on…/);
      expect(left.getAllByRole("listitem")).toHaveLength(1);
      expect(left.getByRole("button", { name: /PARTY 2 DELHI/ })).toBeInTheDocument();
    });

    it("posts set-active with the chosen parties, and no rate", async () => {
      const { user, dialog, left } = await openAction(/Turn off…/);
      await user.click(left.getByRole("button", { name: /PARTY 0 DELHI/ }));

      // Turning on or off never re-prices, so there is no rate box at all.
      expect(dialog.queryByRole("spinbutton")).not.toBeInTheDocument();
      await user.click(dialog.getByRole("button", { name: /Turn off 1/ }));

      expect(api.post).toHaveBeenCalledWith("/auth/bulk-party/set-active/", {
        is_active: false,
        items: [{ item_code: SMALL, category: "OIL" }],
        party_selections: [{ card_code: "C0000", category: "OIL" }],
      });
    });

    it("the party table is a report now, not a second way to choose", async () => {
      const { small } = await showBlocks();
      expect(small.queryByRole("checkbox")).not.toBeInTheDocument();
    });
  });

  /**
   * Re-pricing, the capability By-product did not have.
   *
   * Rates lived only on the By-party tab, so setting a price for one product
   * across many parties meant selecting those parties in the other direction.
   * It matters because 22% of live assignments (2,072 rows) are active at
   * ₹0.00 — assigned and never priced — and this is the pass that fixes them.
   */
  describe("setting the rate from the product side", () => {
    it("offers every holder, including ones it is turned off for", async () => {
      const { user, small } = await showBlocks();
      await user.click(small.getByRole("button", { name: /Set rate…/ }));
      const dialog = within(await screen.findByRole("dialog"));
      const left = within(dialog.getByText(/Parties that hold it/).closest("section")!);

      // All four holders — a turned-off row keeps its rate for when it returns.
      expect(left.getAllByRole("listitem")).toHaveLength(4);
      expect(left.getByRole("button", { name: /PARTY 2 DELHI/ })).toBeInTheDocument();
    });

    it("posts update-rates in 'set' mode, scoped to existing rows", async () => {
      const { user, small } = await showBlocks();
      await user.click(small.getByRole("button", { name: /Set rate…/ }));
      const dialog = within(await screen.findByRole("dialog"));
      const left = within(dialog.getByText(/Parties that hold it/).closest("section")!);

      await user.click(left.getByRole("button", { name: /PARTY 0 DELHI/ }));
      await user.clear(dialog.getByRole("spinbutton"));
      await user.type(dialog.getByRole("spinbutton"), "199.5");
      await user.click(dialog.getByRole("button", { name: /Re-price 1/ }));

      expect(api.post).toHaveBeenCalledWith("/auth/bulk-party/update-rates/", {
        party_selections: [{ card_code: "C0000", category: "OIL" }],
        rate_mode: "set",
        // `existing` matters: this dialog must never CREATE an assignment —
        // that is what Assign is for, and `apply_to: "all"` would do it.
        apply_to: "existing",
        items: [{ item_code: SMALL, category: "OIL", basic_rate: 199.5 }],
      });
    });
  });
});
