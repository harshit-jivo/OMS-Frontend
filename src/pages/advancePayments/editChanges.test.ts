import { describe, expect, it } from "vitest";

import { editRows } from "./editChanges";

describe("editRows", () => {
  it("reads each field as Was → Now, in words", () => {
    expect(
      editRows({
        amount: { old: "1000.00", new: "1500.00" },
        department: { old: "Finance", new: "Operations" },
        priority: { old: "LOW", new: "HIGH" },
        remarks: { old: null, new: "Mobilisation" },
      }),
    ).toEqual([
      { field: "Amount", was: "₹1,000", now: "₹1,500" },
      { field: "Department", was: "Finance", now: "Operations" },
      { field: "Priority", was: "Low", now: "High" },
      { field: "Remarks", was: "—", now: "Mobilisation" },
    ]);
  });

  it("says which documents were re-amounted, added or removed, and which files", () => {
    expect(
      editRows({
        documents: {
          changed: [{ doc: "A/P invoice 10256", old: "40000.00", new: "45000.00" }],
          added: [{ doc: "A/P invoice 10300", amount: "5000.00" }],
          removed: [{ doc: "A/P invoice 10271", amount: "20000.00" }],
        },
        files_added: ["quote.pdf"],
        files_removed: ["old.pdf"],
      }),
    ).toEqual([
      { field: "A/P invoice 10256", was: "₹40,000", now: "₹45,000" },
      { field: "A/P invoice 10300", was: "Not on it", now: "₹5,000" },
      { field: "A/P invoice 10271", was: "₹20,000", now: "Removed" },
      { field: "File", was: "—", now: "quote.pdf (added)" },
      { field: "File", was: "old.pdf", now: "Removed" },
    ]);
  });

  it("reads a payment-details change, leaving the manual flags out of the rows", () => {
    expect(
      editRows({
        to_account: { old: "XXXXXXXXXX7812", new: "XXXXXXX8901" },
        account_source: { old: "From SAP", new: "Typed by hand" },
        payment_method_1: { old: "NEFT · ₹1,000.00", new: "NEFT · ₹900.00" },
        manual_account: true,
        manual_new: true,
        account_last4: "8901",
      }),
    ).toEqual([
      { field: "To account", was: "XXXXXXXXXX7812", now: "XXXXXXX8901" },
      { field: "Account", was: "From SAP", now: "Typed by hand" },
      { field: "Payment method 1", was: "NEFT · ₹1,000.00", now: "NEFT · ₹900.00" },
    ]);
  });

  it("still reads a row logged before values were stored readably", () => {
    expect(
      editRows({
        department_id: { old: "4", new: "9" },
        documents: { old: ["BILL:10256:40000"], new: ["BILL:10256:45000"] },
      }),
    ).toEqual([
      { field: "Department", was: "4", now: "9" },
      { field: "Documents", was: "BILL:10256:40000", now: "BILL:10256:45000" },
    ]);
  });
});
