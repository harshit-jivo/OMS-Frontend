import { describe, expect, it } from "vitest";

import {
  cashBreakdownError,
  changeMethod,
  defaultMethodFor,
  methodAmountError,
  methodsFor,
  newPayoutLine,
  payoutTotal,
  startPayout,
  validatePayout,
  type PayoutDetails,
  type PayoutLine,
} from "./payout";
import { formatINR } from "./rules";

const upi = (amount: string, extra: Partial<PayoutLine> = {}): PayoutLine => ({
  ...newPayoutLine("UPI"),
  amount,
  fromAccount: "1104106",
  ...extra,
});

const complete = (lines: PayoutLine[]): PayoutDetails => ({
  beneficiaryName: "ABC TECHNOLOGIES",
  toAccountNumber: "50100234567812",
  toIfsc: "HDFC0001234",
  toAccountManual: false,
  bankAttachments: [],
  lines,
});

/** A NEFT line — NEFT has no amount limit, so it fits any request. */
const neft = (amount: string, extra: Partial<PayoutLine> = {}): PayoutLine => ({
  ...newPayoutLine("NEFT"),
  amount,
  fromAccount: "1104106",
  ...extra,
});

describe("starting and changing a payout", () => {
  it("starts with one line for the whole amount, addressed to the partner", () => {
    const payout = startPayout(37500, "ABC TECHNOLOGIES");
    expect(payout.beneficiaryName).toBe("ABC TECHNOLOGIES");
    expect(payout.lines).toHaveLength(1);
    expect(payout.lines[0]).toMatchObject({ method: "UPI", amount: "37500", fromAccount: "" });
  });

  it("starts on NEFT when the amount is too big for UPI", () => {
    expect(startPayout(137500).lines[0].method).toBe("NEFT");
  });

  it("keeps the house bank when moving between transfer methods", () => {
    const moved = changeMethod(upi("5000"), "NEFT");
    expect(moved).toMatchObject({ method: "NEFT", fromAccount: "1104106" });
  });

  it("keeps the amount on a method change and drops everything the old method owned", () => {
    const cheque = { ...upi("5000"), method: "CHEQUE" as const, chequeNumber: "123456", chequeDate: "2026-10-01" };
    const cash = changeMethod(cheque, "CASH");
    expect(cash).toMatchObject({
      id: cheque.id,
      method: "CASH",
      amount: "5000",
      fromAccount: "", // a house bank is not a source for cash
      chequeNumber: "",
      chequeDate: "",
    });
  });

  it("does nothing when the method is unchanged", () => {
    const line = upi("5000");
    expect(changeMethod(line, "UPI")).toBe(line);
  });
});

describe("the cash note breakdown — the receive-payment rule", () => {
  const cash = (amount: string, notes: Array<[number, string]>): PayoutLine => ({
    ...newPayoutLine("CASH"),
    amount,
    fromAccount: "1105001",
    noteRows: notes.map(([denomination, quantity], i) => ({ id: `n${i}`, denomination, quantity })),
  });

  it("requires a breakdown for a cash payment", () => {
    expect(cashBreakdownError(cash("20000", []))).toBe(
      `Add the cash denominations for ${formatINR(20000)}. The note breakdown is required for a cash payment.`,
    );
  });

  it("says by how much the notes are short, or over", () => {
    expect(cashBreakdownError(cash("20000", [[500, "30"]]))).toMatch(/short by ₹5,000/);
    expect(cashBreakdownError(cash("20000", [[500, "50"]]))).toMatch(/exceed the amount by ₹5,000/);
  });

  it("passes when the notes add up exactly", () => {
    expect(cashBreakdownError(cash("20000", [[500, "30"], [200, "25"]]))).toBeNull();
  });

  it("does not apply to other methods", () => {
    expect(cashBreakdownError(upi("20000"))).toBeNull();
  });
});

describe("what stops an approval", () => {
  it("passes a complete payout that matches the request", () => {
    expect(validatePayout(complete([upi("37500")]), 37500)).toEqual({ missing: [], problems: [] });
    expect(validatePayout(complete([neft("137500")]), 137500)).toEqual({ missing: [], problems: [] });
  });

  it("asks for the payee and the source account", () => {
    const { missing } = validatePayout(
      { ...complete([upi("100", { fromAccount: "" })]), beneficiaryName: "", toAccountNumber: "", toIfsc: "" },
      100,
    );
    expect(missing).toEqual(
      expect.arrayContaining(["Beneficiary Name", "To Account Number", "IFSC", "From Account (method 1)"]),
    );
  });

  it("does not ask for the payee's account when paying in cash only", () => {
    const cashOnly: PayoutDetails = {
      ...complete([
        {
          ...newPayoutLine("CASH"),
          amount: "1000",
          fromAccount: "1105001",
          noteRows: [{ id: "n", denomination: 500, quantity: "2" }],
        },
      ]),
      toAccountNumber: "",
      toIfsc: "",
    };
    expect(validatePayout(cashOnly, 1000)).toEqual({ missing: [], problems: [] });
  });

  it("checks the account number and IFSC formats", () => {
    const { problems } = validatePayout(
      { ...complete([upi("100")]), toAccountNumber: "1234", toIfsc: "HDFC1234" },
      100,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "To Account Number must be 9 to 18 digits.",
        expect.stringMatching(/^IFSC must look like/),
      ]),
    );
  });

  it("asks a cheque for its number and date", () => {
    const cheque = { ...newPayoutLine("CHEQUE"), amount: "100", fromAccount: "1104110" };
    const { missing } = validatePayout(complete([cheque]), 100);
    expect(missing).toEqual(["Cheque Number (method 1)", "Cheque Date (method 1)"]);
  });

  it("refuses methods that do not add up to the request — split or single", () => {
    const { problems } = validatePayout(complete([neft("100000"), upi("30000")]), 137500);
    expect(problems).toContain(
      `The payment methods add up to ${formatINR(130000)}, but the request is for ${formatINR(137500)}.`,
    );
    expect(validatePayout(complete([neft("100000"), upi("37500")]), 137500).problems).toEqual([]);
  });

  it("refuses a method used outside its amount limits", () => {
    expect(validatePayout(complete([upi("150000")]), 150000).problems).toContain(
      `Method 1: UPI is only for amounts below ${formatINR(100000)}.`,
    );
    const rtgs = { ...neft("150000"), method: "RTGS" as const };
    expect(validatePayout(complete([rtgs]), 150000).problems).toContain(
      `Method 1: RTGS is only for amounts above ${formatINR(200000)}.`,
    );
  });

  it("does not ask for proof of payment — the upload is optional", () => {
    // No screenshot on a transfer, no image on a cheque: still complete.
    expect(validatePayout(complete([upi("100", { attachments: [] })]), 100)).toEqual({
      missing: [],
      problems: [],
    });
  });

  it("totals the lines in paise", () => {
    expect(payoutTotal(complete([upi("0.1"), upi("0.2")]))).toBe(0.3);
  });
});

describe("which payment methods an amount may use", () => {
  it("offers UPI only below one lakh", () => {
    expect(methodsFor(99999)).toContain("UPI");
    // "Below" as specified: exactly 1,00,000 is not below it.
    expect(methodsFor(100000)).not.toContain("UPI");
  });

  it("offers RTGS only above two lakh", () => {
    expect(methodsFor(200000)).not.toContain("RTGS");
    expect(methodsFor(200001)).toContain("RTGS");
  });

  it("offers IMPS only below 5 lakh", () => {
    expect(methodsFor(499999)).toContain("IMPS");
    expect(methodsFor(500000)).not.toContain("IMPS");
  });

  it("offers NEFT and cheque at any amount", () => {
    for (const amount of [1, 150000, 10_000_000]) {
      expect(methodsFor(amount)).toEqual(expect.arrayContaining(["NEFT", "CHEQUE"]));
    }
  });

  it("offers cash only up to ₹10,000 — including 10,000 itself", () => {
    expect(methodsFor(10000)).toContain("CASH");
    expect(methodsFor(10001)).not.toContain("CASH");
    expect(methodAmountError("CASH", 15000)).toBe(`Cash is only for amounts up to ${formatINR(10000)}.`);
  });

  it("lists them in a fixed order, so the dropdown does not reshuffle", () => {
    expect(methodsFor(5000)).toEqual(["UPI", "NEFT", "IMPS", "CHEQUE", "CASH"]);
    expect(methodsFor(50000)).toEqual(["UPI", "NEFT", "IMPS", "CHEQUE"]);
    expect(methodsFor(300000)).toEqual(["NEFT", "RTGS", "IMPS", "CHEQUE"]);
    expect(methodsFor(500000)).toEqual(["NEFT", "RTGS", "CHEQUE"]);
    expect(methodsFor(7000000)).toEqual(["NEFT", "RTGS", "CHEQUE"]);
  });

  it("does not judge a method before there is an amount", () => {
    expect(methodAmountError("RTGS", 0)).toBeNull();
  });

  it("starts a line on UPI where it may, NEFT where it may not", () => {
    expect(defaultMethodFor(20000)).toBe("UPI");
    expect(defaultMethodFor(250000)).toBe("NEFT");
  });
});
