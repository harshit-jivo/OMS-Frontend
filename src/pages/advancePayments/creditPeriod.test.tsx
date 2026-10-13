import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderPage } from "../../test/renderPage";
import { billOrAdvance, creditPeriod } from "./approvalData";
import { RequestSummary } from "./RequestDetails";
import { RequestTable } from "./RequestList";
import { fromApiRequest } from "./requestApi";
import { apiRequest } from "./testRequests";

const NET30 = { terms: "NET-30", days: 30, set: true };

describe("bill or advance, and the credit period", () => {
  it("names a bill a bill, and a PO or plain advance an advance", () => {
    const kind = (payment_against: string) => billOrAdvance(fromApiRequest(apiRequest(1, { payment_against })).form);
    expect(kind("AGAINST_BILL")).toBe("Bill");
    expect(kind("AGAINST_PO")).toBe("Advance");
    expect(kind("ADVANCE")).toBe("Advance");
    expect(kind("ALL")).toBe("");
  });

  it("reads the vendor's SAP terms, and never passes SAP's default off as agreed", () => {
    expect(creditPeriod(NET30)).toBe("NET-30 · 30 days credit");
    expect(creditPeriod({ terms: "ADVANCE/CASH/0 DAYS", days: 0, set: false })).toBe("Not set in SAP");
    expect(creditPeriod({ terms: "30 % ADV", days: 0, set: true })).toBe("30 % ADV");
    expect(creditPeriod(null)).toBe("");
  });

  it("shows both in the approvers' list", () => {
    const rows = [
      fromApiRequest(apiRequest(15, { payment_against: "AGAINST_BILL", credit_terms: NET30 })),
      fromApiRequest(apiRequest(16, { payment_against: "AGAINST_PO", credit_terms: null })),
    ];
    renderPage(
      <RequestTable
        entries={rows}
        onOpen={() => {}}
        action={() => ({ label: "Review", variant: "primary" })}
        emptyText="None"
      />,
    );
    expect(screen.getByText("Bill")).toBeTruthy();
    expect(screen.getByText("Advance")).toBeTruthy();
    expect(screen.getByText("Credit: NET-30 · 30 days credit")).toBeTruthy();
  });

  it("shows both inside the request", () => {
    renderPage(
      <RequestSummary entry={fromApiRequest(apiRequest(15, { payment_against: "AGAINST_PO", credit_terms: NET30 }))} />,
    );
    expect(screen.getByText("Advance: paying before the bill")).toBeTruthy();
    expect(screen.getByText("NET-30 · 30 days credit")).toBeTruthy();
  });
});
