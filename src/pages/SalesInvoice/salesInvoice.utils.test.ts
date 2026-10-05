/**
 * SAP's transaction validation rejects an A/R invoice line whose U_SchemeAgst
 * is blank ("(1310325) Please Select the SchemeAgst Column"). The payload
 * builder must send it on every line that has one, for both line sources.
 */
import { describe, expect, it } from "vitest";

import { buildInvoicePayload, type InvoiceForm, type SelectedLine } from "./salesInvoice.utils";

const form: InvoiceForm = {
  postingDate: "2026-09-22",
  dueDate: "2026-09-22",
  documentDate: "2026-09-22",
  driverName: "",
  vehicleNumber: "",
  billNumber: "",
  billDate: "",
  driverMobile: "",
  discountPercent: 0,
  shipTo: "SABRI TRADERS DELHI",
  payTo: "SABRI TRADERS DELHI",
  shippingType: "",
  ewayBillNo: "",
  lrGrNumber: "",
  shippingPriority: "",
};

const orderLine: SelectedLine = {
  DocEntry: 10985,
  DocNum: 1726098269,
  SlpCode: 20,
  BPL_Id: 2,
  LineNum: 1,
  ItemCode: "FG0000324",
  Dscription: "PET BOTTLE 500 ML",
  OpenQty: 1800,
  Price: 0,
  PriceBefDi: 0,
  DiscPrcnt: 0,
  VatPrcnt: 5,
  TaxCode: "IGST@5",
  WhsCode: "BH-FG",
  ShipDate: "2026-09-21",
  U_SchemeAgst: "WATER",
  invoiceQty: 1800,
  BatchNumbers: [{ BatchNumber: "NM1209.", Quantity: 1800 }],
};

const party = { CardCode: "CUSTA001078", CardName: "SABRI TRADERS" };

describe("buildInvoicePayload U_SchemeAgst", () => {
  it("sends the sales-order line's scheme against", () => {
    const payload = buildInvoicePayload(party, { "10985-1": orderLine }, form);
    expect(payload.DocumentLines[0]).toMatchObject({
      BaseEntry: 10985,
      BaseLine: 1,
      U_SchemeAgst: "WATER",
    });
  });

  it("sends it on an item-sourced line too", () => {
    const itemLine: SelectedLine = { ...orderLine, SourceType: "items", DocEntry: -1, U_SchemeAgst: " DRINKS " };
    const payload = buildInvoicePayload(party, { a: itemLine }, form);
    expect(payload.DocumentLines[0]).toMatchObject({ ItemCode: "FG0000324", U_SchemeAgst: "DRINKS" });
    expect(payload.DocumentLines[0]).not.toHaveProperty("BaseEntry");
  });

  it("omits the field rather than sending an empty string when nothing resolved", () => {
    const payload = buildInvoicePayload(party, { "10985-1": { ...orderLine, U_SchemeAgst: "" } }, form);
    expect(payload.DocumentLines[0]).not.toHaveProperty("U_SchemeAgst");
  });
});
