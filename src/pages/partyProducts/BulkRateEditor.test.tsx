import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import BulkRateEditor, { type PartySelection } from "./BulkRateEditor";
import { renderPage } from "../../test/renderPage";
import api from "../../services/api";

/**
 * The bulk re-pricing card.
 *
 * This is the one screen in the app that changes a PRICE on many parties in a
 * single request, so the cases pinned here are the ones where being wrong is
 * both expensive and invisible afterwards:
 *
 *  * A rate that has drifted apart across the selection must be visible as a
 *    spread. Showing one figure would make overwriting forty different prices
 *    look like confirming one.
 *  * Apply must send only ticked rows that carry a figure. A ticked row left
 *    blank silently priced at zero is the worst failure this screen has.
 *  * "Parties that have it" is the default and must stay the default: the
 *    other option ASSIGNS, and a product a party can suddenly order reads,
 *    from then on, exactly like a deliberate assignment.
 *  * A percentage moves each party's own rate, so it cannot assign at all —
 *    the choice is not offered rather than offered and ignored.
 */

const SELECTIONS: PartySelection[] = [
  { card_code: "H1", category: "OIL" },
  { card_code: "H2", category: "OIL" },
];

const PRODUCTS = [
  {
    item_code: "FG001",
    item_name: "MUSTARD 1 LTR",
    category: "OIL",
    brand: "JIVO",
    variety: "MUSTARD",
    sub_group: "MUSTARD",
    sal_pack_unit: "20 PCS",
    party_count: 2,
    eligible_parties: 2,
    missing_parties: 0,
    min_rate: 100,
    max_rate: 110,
    distinct_rates: 2,
    common_rate: 100,
    common_rate_parties: 1,
  },
  {
    item_code: "FG002",
    item_name: "CANOLA 1 LTR",
    category: "OIL",
    brand: "JIVO",
    variety: "CANOLA",
    sub_group: "CANOLA",
    sal_pack_unit: "12 PCS",
    party_count: 1,
    eligible_parties: 2,
    missing_parties: 1,
    min_rate: 200,
    max_rate: 200,
    distinct_rates: 1,
    common_rate: 200,
    common_rate_parties: 1,
  },
];

const APPLIED = {
  updated: 2,
  created: 0,
  unchanged: 0,
  skipped: 0,
  parties: 2,
  items: 1,
  errors: [] as string[],
};

const ACTIVATED = {
  updated: 2,
  unchanged: 0,
  missing: 0,
  parties: 2,
  items: 1,
  errors: [] as string[],
};

/** Answers every endpoint; returns the spy so the payload can be read back. */
function mockApi() {
  return vi.spyOn(api, "post").mockImplementation(async (url: string) => {
    if (String(url).includes("update-rates")) {
      return { data: { success: true, data: APPLIED } } as never;
    }
    if (String(url).includes("set-active")) {
      return { data: { success: true, data: ACTIVATED } } as never;
    }
    return { data: { success: true, data: { products: PRODUCTS } } } as never;
  });
}

afterEach(() => vi.restoreAllMocks());

async function renderEditor() {
  const post = mockApi();
  renderPage(<BulkRateEditor selections={SELECTIONS} />);
  await screen.findByText("MUSTARD 1 LTR");
  return { user: userEvent.setup(), post };
}

/** The table row a product's name sits in. */
const rowFor = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

describe("BulkRateEditor", () => {
  it("lists each product once, with how many parties hold it and at what spread", async () => {
    await renderEditor();

    const mustard = rowFor("MUSTARD 1 LTR");
    // Both parties sell it, but at two different prices — said as a range and
    // a count, not as a single number.
    expect(mustard.textContent).toContain("₹100.00 – ₹110.00");
    expect(within(mustard).getByText("2 rates")).toBeInTheDocument();

    const canola = rowFor("CANOLA 1 LTR");
    expect(canola.textContent).toContain("₹200.00");
    expect(within(canola).getByText("1 without")).toBeInTheDocument();
  });

  it("will not apply until a ticked row carries a figure", async () => {
    const { user } = await renderEditor();

    const apply = screen.getByRole("button", { name: /review and apply/i });
    expect(apply).toBeDisabled();

    await user.click(within(rowFor("MUSTARD 1 LTR")).getByRole("checkbox"));
    expect(apply).toBeDisabled();

    await user.type(screen.getByLabelText(/New rate.*MUSTARD 1 LTR/i), "125");
    expect(apply).toBeEnabled();
  });

  it("sends only the ticked rows that carry a figure, to parties that have them", async () => {
    const { user, post } = await renderEditor();

    // Two ticked, one priced: the unpriced row must not be sent at zero.
    await user.click(within(rowFor("MUSTARD 1 LTR")).getByRole("checkbox"));
    await user.click(within(rowFor("CANOLA 1 LTR")).getByRole("checkbox"));
    await user.type(screen.getByLabelText(/New rate.*MUSTARD 1 LTR/i), "125");

    expect(screen.getByText(/1 ticked row left blank/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /review and apply/i }));
    await user.click(screen.getByRole("button", { name: /^Apply to 2 parties$/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/auth/bulk-party/update-rates/",
        expect.objectContaining({
          rate_mode: "set",
          apply_to: "existing",
          party_selections: SELECTIONS,
          items: [{ item_code: "FG001", category: "OIL", basic_rate: 125 }],
        }),
      ),
    );
  });

  it("fills every ticked row from one figure", async () => {
    const { user } = await renderEditor();

    await user.click(screen.getByLabelText(/Tick every product shown/i));
    await user.type(screen.getByLabelText(/for every ticked row/i), "150");
    await user.click(screen.getByRole("button", { name: /fill 2 ticked/i }));

    expect(screen.getByLabelText(/New rate.*MUSTARD 1 LTR/i)).toHaveValue(150);
    expect(screen.getByLabelText(/New rate.*CANOLA 1 LTR/i)).toHaveValue(150);
  });

  it("assigns where the product is missing only when told to", async () => {
    const { user, post } = await renderEditor();

    // The default says so on the button's own terms before it is changed.
    expect(
      screen.getByRole("radio", { name: /parties that have it/i }),
    ).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("radio", { name: /all selected/i }));
    expect(screen.getByText(/will be assigned to every selected party/i)).toBeInTheDocument();

    await user.click(within(rowFor("CANOLA 1 LTR")).getByRole("checkbox"));
    await user.type(screen.getByLabelText(/New rate.*CANOLA 1 LTR/i), "210");
    await user.click(screen.getByRole("button", { name: /review and apply/i }));
    await user.click(screen.getByRole("button", { name: /^Apply to 2 parties$/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/auth/bulk-party/update-rates/",
        expect.objectContaining({ apply_to: "all" }),
      ),
    );
  });

  it("does not offer to assign when the change is a percentage", async () => {
    const { user } = await renderEditor();

    await user.click(screen.getByRole("radio", { name: /change by %/i }));

    expect(screen.queryByRole("radio", { name: /all selected/i })).not.toBeInTheDocument();
    expect(screen.getByText(/a change needs a rate to move from/i)).toBeInTheDocument();

    // 10% of the rate most of the selection is on — an illustration, because
    // the figure moves each party's own rate.
    await user.click(within(rowFor("MUSTARD 1 LTR")).getByRole("checkbox"));
    await user.type(screen.getByLabelText(/Change \(%\).*MUSTARD 1 LTR/i), "10");
    expect(rowFor("MUSTARD 1 LTR").textContent).toContain("₹110.00");
  });

  it("drops the typed rates when the kind of change is switched", async () => {
    const { user } = await renderEditor();

    await user.click(within(rowFor("MUSTARD 1 LTR")).getByRole("checkbox"));
    await user.type(screen.getByLabelText(/New rate.*MUSTARD 1 LTR/i), "125");

    // 125 as a percentage would more than double the price of everything.
    await user.click(screen.getByRole("radio", { name: /change by %/i }));
    expect(screen.getByLabelText(/Change \(%\).*MUSTARD 1 LTR/i)).toHaveValue(null);
  });

  it("reports what the run actually did", async () => {
    const { user } = await renderEditor();

    await user.click(within(rowFor("MUSTARD 1 LTR")).getByRole("checkbox"));
    await user.type(screen.getByLabelText(/New rate.*MUSTARD 1 LTR/i), "125");
    await user.click(screen.getByRole("button", { name: /review and apply/i }));
    await user.click(screen.getByRole("button", { name: /^Apply to 2 parties$/i }));

    expect(await screen.findByText("Rates applied")).toBeInTheDocument();
    const result = screen.getByText(/rates changed/i).closest("span") as HTMLElement;
    expect(within(result).getByText("2")).toBeInTheDocument();
  });

  /* ── Availability: the same ticks, a different verb ───────────────────── */

  it("turning products off needs only a tick, and offers no rate to type", async () => {
    const { user } = await renderEditor();

    await user.click(screen.getByRole("radio", { name: /turn off/i }));

    // There is no figure to give here, so the column is absent rather than
    // present-and-disabled.
    expect(screen.queryByLabelText(/New rate.*MUSTARD 1 LTR/i)).not.toBeInTheDocument();

    const apply = screen.getByRole("button", { name: /review and turn off/i });
    expect(apply).toBeDisabled();

    await user.click(within(rowFor("MUSTARD 1 LTR")).getByRole("checkbox"));
    expect(apply).toBeEnabled();
  });

  it("posts the ticked rows to set-active with is_active false", async () => {
    const { user, post } = await renderEditor();

    await user.click(screen.getByRole("radio", { name: /turn off/i }));
    await user.click(within(rowFor("MUSTARD 1 LTR")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /review and turn off/i }));
    await user.click(screen.getByRole("button", { name: /^Turn off for 2 parties$/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/auth/bulk-party/set-active/",
        expect.objectContaining({
          is_active: false,
          party_selections: SELECTIONS,
          items: [{ item_code: "FG001", category: "OIL" }],
        }),
      ),
    );
  });

  it("turning products on sends is_active true", async () => {
    const { user, post } = await renderEditor();

    await user.click(screen.getByRole("radio", { name: /turn on/i }));
    await user.click(within(rowFor("CANOLA 1 LTR")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /review and turn on/i }));
    await user.click(screen.getByRole("button", { name: /^Turn on for 2 parties$/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/auth/bulk-party/set-active/",
        expect.objectContaining({ is_active: true }),
      ),
    );
  });

  it("drops a typed rate when the verb changes, so it cannot be applied later", async () => {
    // "125" drafted as a rate must not survive into a different verb and then
    // back again -- it would re-price forty parties nobody asked to re-price.
    const { user } = await renderEditor();

    await user.click(within(rowFor("MUSTARD 1 LTR")).getByRole("checkbox"));
    await user.type(screen.getByLabelText(/New rate.*MUSTARD 1 LTR/i), "125");

    await user.click(screen.getByRole("radio", { name: /turn off/i }));
    await user.click(screen.getByRole("radio", { name: /change rates/i }));

    expect(screen.getByLabelText(/New rate.*MUSTARD 1 LTR/i)).toHaveValue(null);
    // The tick survives: the products you meant are still the ones you meant.
    expect(within(rowFor("MUSTARD 1 LTR")).getByRole("checkbox")).toBeChecked();
  });

  it("reports an availability run in its own words, not as rates", async () => {
    const { user } = await renderEditor();

    await user.click(screen.getByRole("radio", { name: /turn off/i }));
    await user.click(within(rowFor("MUSTARD 1 LTR")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /review and turn off/i }));
    await user.click(screen.getByRole("button", { name: /^Turn off for 2 parties$/i }));

    expect(await screen.findByText("Products turned off")).toBeInTheDocument();
    expect(screen.getByText(/assignments changed/i)).toBeInTheDocument();
    expect(screen.queryByText(/newly assigned/i)).not.toBeInTheDocument();
  });
});
