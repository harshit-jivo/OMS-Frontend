import { describe, expect, it } from "vitest";

import { EMPTY_ALLOCATION, calculatePayment, holdOf } from "./rules";
import { BILL_10256 } from "./testData";

const bill = { ...BILL_10256, open: 100000 };

describe("a bill's hold amount (SAP keeps none)", () => {
  it("holds nothing back when left blank", () => {
    expect(holdOf(EMPTY_ALLOCATION)).toBe(0);
    expect(calculatePayment(bill, "FIXED", "100000", "", "")).toEqual({
      payment: 100000,
      error: null,
    });
  });

  it("filled in, the line pays at most the open amount less it", () => {
    expect(calculatePayment(bill, "FIXED", "80000", "", "20000")).toEqual({
      payment: 80000,
      error: null,
    });
    expect(calculatePayment(bill, "FIXED", "80001", "", "20000").error).toBe(
      "Cannot exceed ₹80,000: the open amount less the ₹20,000 on hold.",
    );
  });

  it("refuses a hold below zero or above the open amount; zero holds nothing", () => {
    expect(calculatePayment(bill, "FIXED", "1000", "", "-5").error).toBe(
      "Enter a hold amount of zero or more.",
    );
    expect(calculatePayment(bill, "FIXED", "1000", "", "100001").error).toBe(
      "The hold cannot be more than the open amount of ₹1,00,000.",
    );
    expect(calculatePayment(bill, "FIXED", "100000", "", "0").payment).toBe(100000);
  });
});
