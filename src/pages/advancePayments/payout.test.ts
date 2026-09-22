import { describe, expect, it } from "vitest";

import {
  cashBreakdownError,
  changeMethod,
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
  fromAccount: "HDFC:1104106",
  ...extra,
});

const complete = (lines: PayoutLine[]): PayoutDetails => ({
  beneficiaryName: "ABC TECHNOLOGIES",
  toAccountNumber: "50100234567812",
  toIfsc: "HDFC0001234",
  bankAttachments: [],
  lines,
});

describe("starting and changing a payout", () => {
  it("starts with one UPI line for the whole amount, addressed to the partner", () => {
    const payout = startPayout(137500, "ABC TECHNOLOGIES");
    expect(payout.beneficiaryName).toBe("ABC TECHNOLOGIES");
    expect(payout.lines).toHaveLength(1);
    expect(payout.lines[0]).toMatchObject({ method: "UPI", amount: "137500", fromAccount: "" });
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
  it("passes a complete UPI payout that matches the request", () => {
    expect(validatePayout(complete([upi("137500")]), 137500)).toEqual({ missing: [], problems: [] });
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
    const cheque = { ...newPayoutLine("CHEQUE"), amount: "100", fromAccount: "SBI:1104110" };
    const { missing } = validatePayout(complete([cheque]), 100);
    expect(missing).toEqual(["Cheque Number (method 1)", "Cheque Date (method 1)"]);
  });

  it("refuses methods that do not add up to the request — split or single", () => {
    const { problems } = validatePayout(complete([upi("100000"), upi("30000")]), 137500);
    expect(problems).toContain(
      `The payment methods add up to ${formatINR(130000)}, but the request is for ${formatINR(137500)}.`,
    );
    expect(validatePayout(complete([upi("100000"), upi("37500")]), 137500).problems).toEqual([]);
  });

  it("refuses an over-long UPI reference", () => {
    const { problems } = validatePayout(complete([upi("100", { reference: "X".repeat(51) })]), 100);
    expect(problems[0]).toMatch(/longer than 50/);
  });

  it("totals the lines in paise", () => {
    expect(payoutTotal(complete([upi("0.1"), upi("0.2")]))).toBe(0.3);
  });
});
