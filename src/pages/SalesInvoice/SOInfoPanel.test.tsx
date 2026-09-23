/**
 * What the (i) says about a sales order.
 *
 * The distinctions worth pinning are the ones a biller acts on: an address the
 * party master knows nothing about must still name where the order ships, and
 * a field SAP left empty must read as empty rather than as zero.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import SOInfoPanel, { DraftSOInfoPanel } from "./SOInfoPanel";
import type { PartyAddress } from "./salesInvoice.utils";
import type { SalesOrder } from "./useSalesInvoice";

const ADDRESSES: PartyAddress[] = [
  {
    Address: "ILAHI CO NEW DELHI",
    AdresType: "B",
    CardCode: "CUSTA000844",
    City: "New Delhi",
    State: "DL",
    GSTRegnNo: "07BTCPN5063N1ZQ",
  },
  {
    Address: "THE KALGIDHAR SOCIETY RAJOURI GARDEN F3",
    AdresType: "S",
    CardCode: "CUSTA000844",
    City: "Rajouri Garden",
    State: "DL",
  },
];

const order = (over: Partial<SalesOrder> = {}): SalesOrder => ({
  DocEntry: 31614,
  DocNum: 1726096764,
  DocDate: "2026-09-22",
  DocDueDate: "2026-09-24",
  DocStatus: "O",
  DocTotal: 363636,
  NumAtCard: "PO-9912",
  Comments: "",
  PayToCode: "ILAHI CO NEW DELHI",
  ShipToCode: "THE KALGIDHAR SOCIETY RAJOURI GARDEN F3",
  ...over,
});

describe("one sales order", () => {
  it("shows both addresses, with the detail the party master adds", () => {
    render(<SOInfoPanel order={order()} addresses={ADDRESSES} />);

    expect(screen.getByText("SO #1726096764")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("ILAHI CO NEW DELHI")).toBeTruthy();
    expect(screen.getByText("GSTIN 07BTCPN5063N1ZQ")).toBeTruthy();
    // The ship-to has no GSTIN on file; only the bill-to line carries one.
    expect(screen.getAllByText(/^GSTIN /)).toHaveLength(1);
    expect(screen.getByText("PO-9912")).toBeTruthy();
    expect(screen.getByText("₹3,63,636.00")).toBeTruthy();
  });

  it("keeps an address the party master does not know", () => {
    // Not a fallback to "unknown": ShipToCode IS the address name, and it is
    // what SAP prints on the document, so it stands on its own.
    render(<SOInfoPanel order={order({ ShipToCode: "SOME DEPOT" })} addresses={ADDRESSES} />);

    expect(screen.getByText("SOME DEPOT")).toBeTruthy();
  });

  it("reads a missing customer PO as absent, not as blank", () => {
    render(<SOInfoPanel order={order({ NumAtCard: "" })} addresses={ADDRESSES} />);

    const po = screen.getByText("Customer PO").nextElementSibling;
    expect(po?.textContent).toBe("—");
  });

  it("omits the comments block when SAP recorded none", () => {
    const { rerender } = render(<SOInfoPanel order={order()} addresses={ADDRESSES} />);
    expect(screen.queryByText(/Comments/)).toBeNull();

    rerender(<SOInfoPanel order={order({ Comments: "Dispatch today" })} addresses={ADDRESSES} />);
    expect(screen.getByText(/Dispatch today/)).toBeTruthy();
  });
});

describe("the orders behind a draft", () => {
  it("draws the shared addresses once, then every order", () => {
    const orders = [
      order(),
      order({ DocEntry: 31615, DocNum: 1726096801, NumAtCard: "PO-9913", DocTotal: 12000 }),
    ];
    render(<DraftSOInfoPanel orders={orders} addresses={ADDRESSES} />);

    // Once, not per order: `selectedOrderAddressError` refuses a draft whose
    // orders disagree on either address, so repeating them would invite the
    // reader to look for a difference that cannot exist.
    expect(screen.getAllByText("ILAHI CO NEW DELHI")).toHaveLength(1);
    expect(screen.getByText("2 sales orders")).toBeTruthy();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("SO #1726096764")).toBeTruthy();
    expect(within(rows[1]).getByText("PO-9913")).toBeTruthy();
  });

  it("says so when a draft has no order behind it", () => {
    render(<DraftSOInfoPanel orders={[]} addresses={ADDRESSES} />);
    expect(screen.getByText(/No sales order is attached/)).toBeTruthy();
  });
});
