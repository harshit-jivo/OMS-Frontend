import { describe, expect, it } from "vitest";

import {
  toInvoicePayload,
  todayISO,
  trackerInvoiceSchema,
  type TrackerInvoiceInput,
} from "./trackerInvoice";

/** A form the user has filled in correctly. */
const valid: TrackerInvoiceInput = {
  invoice_date: "2026-06-01",
  effective_month: "2026-06",
  party_name: "Acme Logistics",
  party_code: "V001",
  party_gstin: "03AABCU9603R1ZM",
  invoice_number: "INV-1001",
  taxable_value: "105932.20",
  gst_type: 1,
  gst_rate: 1,
  additional_charge_type: "",
  additional_charge_amount: "",
  category: 1,
  unit: 1,
  branch: 1,
  mode: 1,
};

function errorFor(overrides: Partial<TrackerInvoiceInput>, field: string) {
  const result = trackerInvoiceSchema.safeParse({ ...valid, ...overrides });
  if (result.success) return undefined;
  return result.error.issues.find((i) => i.path.join(".") === field)?.message;
}

describe("trackerInvoiceSchema", () => {
  it("accepts a correctly filled form", () => {
    expect(trackerInvoiceSchema.safeParse(valid).success).toBe(true);
  });

  it("names the field instead of saying 'Required'", () => {
    // Eleven fields empty at once, all saying "Required", is the least useful
    // thing thirteen messages can say.
    expect(errorFor({ party_name: "  " }, "party_name")).toBe("Enter the party name");
    expect(errorFor({ invoice_number: "" }, "invoice_number")).toBe(
      "Enter the invoice number",
    );
  });

  it("treats 0 as 'nothing chosen' for a dropdown", () => {
    // `InvoiceWrite` types these as `number`, so 0 type-checks. The rule that
    // says otherwise now lives with the type rather than in another file.
    expect(errorFor({ gst_type: 0 }, "gst_type")).toBe("Choose a GST type");
    expect(errorFor({ branch: 0 }, "branch")).toBe("Choose a branch");
  });

  it("rejects a future invoice date and says what to do about it", () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect(errorFor({ invoice_date: tomorrow }, "invoice_date")).toBe(
      "Invoice date cannot be later than today",
    );
    expect(errorFor({ invoice_date: todayISO() }, "invoice_date")).toBeUndefined();
  });

  it("rejects a zero or negative taxable value", () => {
    expect(errorFor({ taxable_value: "0" }, "taxable_value")).toBe(
      "Taxable value must be more than zero",
    );
    expect(errorFor({ taxable_value: "-5" }, "taxable_value")).toBe(
      "Taxable value must be more than zero",
    );
  });

  it("catches the charge-without-an-amount the if-chain could not express", () => {
    // It used to post silently as zero.
    expect(
      errorFor(
        { additional_charge_type: "DEMURRAGE", additional_charge_amount: "" },
        "additional_charge_amount",
      ),
    ).toBe("Enter the amount for the additional charge");
  });

  it("allows a blank amount when there is no charge type", () => {
    expect(trackerInvoiceSchema.safeParse(valid).success).toBe(true);
  });
});

describe("toInvoicePayload", () => {
  it("widens the month picker's YYYY-MM to the first of the month", () => {
    const parsed = trackerInvoiceSchema.parse(valid);
    expect(toInvoicePayload(parsed).effective_month).toBe("2026-06-01");
  });

  it("posts a number for the charge amount even when there is no charge", () => {
    // The backend's field is numeric; an empty string is a 400.
    const parsed = trackerInvoiceSchema.parse(valid);
    expect(toInvoicePayload(parsed).additional_charge_amount).toBe("0");
  });

  it("keeps the amount when there is a charge", () => {
    const parsed = trackerInvoiceSchema.parse({
      ...valid,
      additional_charge_type: "DEMURRAGE",
      additional_charge_amount: "1500.00",
    });
    expect(toInvoicePayload(parsed).additional_charge_amount).toBe("1500.00");
  });
});
