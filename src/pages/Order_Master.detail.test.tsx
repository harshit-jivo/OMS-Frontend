import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Order_Master from "./Order_Master";
import { renderPage } from "../test/renderPage";
import { ordersService } from "../services/ordersService";

/**
 * The Order Master detail dialog.
 *
 * Every assertion here is a defect the first draft shipped, seen in the
 * rendered dialog rather than reasoned about:
 *
 *  * The money used the approval screens' `OrderTotalsRow` — four page-scale
 *    `Stat` tiles at `minmax(170px,1fr)` plus three variety cards. In an
 *    820px dialog they overflowed, and a grand total of ₹8,76,385.42 rendered
 *    as "876385.4", CLIPPED MID-NUMBER. A truncated figure is not a cosmetic
 *    problem: it reads as a real, smaller number.
 *  * Amounts printed as `toFixed(2)` — `876385.42`, seven undifferentiated
 *    digits. Indian grouping puts the lakh boundary where a reader expects it.
 *  * `toLocaleString("en-IN")` printed `12/9/2026, 8:28:47 am` for the created
 *    date while the delivery date beside it printed the raw ISO `2026-09-14`.
 *    Two formats, one of them ambiguous with US ordering.
 *  * Bill-to and ship-to are usually identical and were printed twice under
 *    two labels, reading as two facts to check.
 */
const { SUMMARY, DETAIL } = vi.hoisted(() => {
  const address = "BACHAN SINGH KULJIT SINGH AMBALA";
  return {
    SUMMARY: [
      {
        id: 13,
        order_number: "ORD-20260912-0013",
        card_code: "CUSTA000812",
        card_name: "BACHAN SINGH KULJIT SINGH",
        order_type: "PARTY",
        is_foc: false,
        total_amount: "876385.42",
        created_at: "2026-09-12T02:58:47Z",
        delivery_date: "2026-09-14",
        created_by_id: 7,
        created_by_name: "tanjeet",
        status_code: "COMPLETED",
        status_name: "Completed",
        stage_since: "2026-09-12T02:58:47Z",
        pending_with: [],
        stages: [],
        sap_doc_number: null,
      },
    ],
    DETAIL: {
      id: 13,
      order_number: "ORD-20260912-0013",
      bill_to_address: address,
      // Same place, differently cased and padded — the comparison normalises,
      // because a stray space is not a second address.
      ship_to_address: `  ${address.toLowerCase()} `,
      dispatch_from_name: "FACTORY",
      po_number: "",
      remarks: "",
      vareity_cost: { commodity_price: 727224, other_total: 0, premium_total: 0 },
      items: [
        {
          item_code: "FG0000042",
          item_name: "EXTRA VIRGIN OLIVE 1 LTR 16 PCS",
          category: "OIL",
          variety_type: "COMMODITY",
          qty: 160,
          pcs: 160,
          boxes: 10,
          ltrs: 160,
          total: 834652.78,
          tax_rate: 5,
          price_list_basic: 100,
          basic_price: 100,
        },
      ],
    },
  };
});

vi.mock("../lib/orderQueries", async () => {
  const actual = await vi.importActual<typeof import("../lib/orderQueries")>(
    "../lib/orderQueries",
  );
  return {
    ...actual,
    useMasterOrders: () => ({
      orders: SUMMARY,
      pagination: { page: 1, page_size: 25, total: 1, total_pages: 1 },
      isLoading: false,
      isRefreshing: false,
      error: null,
    }),
    useMasterOrderCreators: () => [{ id: 7, username: "tanjeet" }],
    useOrderStatuses: () => [{ id: 9, name: "Completed" }],
  };
});

beforeEach(() => {
  vi.spyOn(ordersService, "getOrderDetails").mockResolvedValue(DETAIL as never);
});

afterEach(() => vi.restoreAllMocks());

/**
 * Opens the dialog and returns queries scoped TO IT.
 *
 * Scoped because the order number, the party name and the stage all appear in
 * the row behind the dialog as well — a bare `screen.getByText` matches both
 * and throws, which is the suite's own bug rather than the page's.
 */
async function openDetail() {
  const user = userEvent.setup();
  renderPage(<Order_Master />, { route: "/Order_Master" });
  await user.click(
    await screen.findByRole("button", {
      name: /Order details for ORD-20260912-0013/i,
    }),
  );
  const dialog = await screen.findByRole("dialog");
  return { user, dialog: within(dialog) };
}

describe("Order Master — detail dialog", () => {
  it("groups amounts Indian-style so no figure is a wall of digits", async () => {
    const { dialog } = await openDetail();

    // 834652.78 + 5% tax = 876385.419 -> 876385.42
    expect(await dialog.findByText("₹8,76,385.42")).toBeInTheDocument();
    expect(dialog.getByText("₹8,34,652.78")).toBeInTheDocument();
    expect(dialog.getByText("₹41,732.64")).toBeInTheDocument();
  });

  it("never renders a bare ungrouped grand total, which is what got clipped", async () => {
    const { dialog } = await openDetail();
    await dialog.findByText("₹8,76,385.42");

    expect(dialog.queryByText("876385.42")).not.toBeInTheDocument();
  });

  /**
   * The line-item column is NOT asserted to be grouped, because it is not.
   *
   * `OrderItemsTable` still prints `834652.78` via `toFixed(2)`, and it is
   * rendered by seven live screens — three of its six `toFixed` calls are not
   * money at all (boxes, litres, and a tax RATE), so moving it onto
   * `formatMoney` is a considered change to each of those screens rather than
   * something this dialog gets to do on its way past. This test pins the
   * inconsistency so it is a known debt rather than a surprise.
   */
  it("leaves the shared line-item table's own formatting alone", async () => {
    const { dialog } = await openDetail();
    await dialog.findByText("₹8,76,385.42");

    expect(dialog.getByText("834652.78")).toBeInTheDocument();
  });

  it("dates read the same way as each other, month named", async () => {
    const { dialog } = await openDetail();

    // `Sept?` because `en-IN` abbreviates September as "Sept", and which ICU
    // a runner ships is not what this test is about. The point is the SHAPE:
    // a named month on both fields, no slashes, no raw ISO.
    expect(await dialog.findByText(/^12 Sept? 2026, \d{2}:\d{2} [ap]m$/)).toBeInTheDocument();
    expect(dialog.getByText(/^14 Sept? 2026$/)).toBeInTheDocument();
    expect(dialog.queryByText("2026-09-14")).not.toBeInTheDocument();
    expect(dialog.queryByText(/\d+\/\d+\/2026/)).not.toBeInTheDocument();
  });

  it("collapses bill-to and ship-to when they are the same place", async () => {
    const { dialog } = await openDetail();

    expect(await dialog.findByText("Bill & ship to")).toBeInTheDocument();
    expect(dialog.queryByText("Bill to")).not.toBeInTheDocument();
    expect(dialog.queryByText("Ship to")).not.toBeInTheDocument();
  });

  it("keeps them apart when the order really does ship elsewhere", async () => {
    vi.spyOn(ordersService, "getOrderDetails").mockResolvedValue({
      ...DETAIL,
      ship_to_address: "SOMEWHERE ELSE ENTIRELY",
    } as never);

    const { dialog } = await openDetail();

    expect(await dialog.findByText("Bill to")).toBeInTheDocument();
    expect(dialog.getByText("Ship to")).toBeInTheDocument();
    expect(dialog.queryByText("Bill & ship to")).not.toBeInTheDocument();
  });

  it("omits fields the order does not carry rather than labelling blanks", async () => {
    const { dialog } = await openDetail();

    await dialog.findByText("Dispatch from");
    // `po_number` and `remarks` are empty strings on this order.
    expect(dialog.queryByText("PO number")).not.toBeInTheDocument();
    expect(dialog.queryByText("Remarks")).not.toBeInTheDocument();
    expect(dialog.queryByText("SAP document")).not.toBeInTheDocument();
  });
});
