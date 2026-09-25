/**
 * The approval desk, against a fake of the requests API
 * (`advancePayments/testRequests.ts`). `advancePayments/payout.test.ts` pins
 * the payout rules; this pins that the PAGE follows the route — each stage
 * sees only its own buttons, Payment fills and saves the payment details
 * before approving, rejecting and returning need a reason, a refusal from the
 * server (SAP's, at Final) is shown as it came, and a decided request is
 * read-only.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService } from "../services/advancePaymentService";
import { renderPage } from "../test/renderPage";
import Advance_Payment_Approval from "./Advance_Payment_Approval";
import { FakeRequestServer, apiRequest, bill } from "./advancePayments/testRequests";
import {
  SAP_CASH_ACCOUNTS,
  SAP_EMPLOYEES,
  SAP_HOUSE_BANKS,
  SAP_OPEN_INVOICES,
  SAP_OPEN_POS,
  SAP_OTHER_DOCUMENTS,
  SAP_PAYEE_ACCOUNTS,
  SAP_VENDORS,
} from "./advancePayments/testData";

// The sample requests' Payment Dates are 23-25 Sep 2026, and a past one is
// refused. Pin the calendar so they stay current; only Date is faked.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0));
});
afterAll(() => vi.useRealTimers());

/** The employee master, as `/employee-directory/` answers the two pickers. */
// `vi.hoisted`: vi.mock below is hoisted above ordinary constants.
const { directory, DEPARTMENTS } = vi.hoisted(() => {
  const DEPARTMENTS = [
    { id: 40, name: "Cyber Security", sub_departments: [] },
    { id: 35, name: "Finance", sub_departments: [{ id: 92, name: "AP" }, { id: 88, name: "AR" }] },
  ];
  const OWNERS = [
    { employee_code: "JWPL0115", employee_name: "Arvinder", role: 1 as const, role_label: "HOD", designation: null },
    { employee_code: "JWPL0030", employee_name: "Preshit Singh", role: 2 as const, role_label: "Sub-HOD", designation: null },
  ];
  const NOT_IN_SAP = [
    { employee_code: "JWPL3100", employee_name: "Asha Rani", role: 3 as const, role_label: "Executive", designation: null },
  ];
  return {
    DEPARTMENTS,
    directory: async (query: { roles?: number[]; notInSapFor?: string } = {}) =>
      query.notInSapFor ? NOT_IN_SAP : query.roles ? OWNERS : [...OWNERS, ...NOT_IN_SAP],
  };
});

vi.mock("../services/advancePaymentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/advancePaymentService")>();
  return {
    ...actual,
    advancePaymentService: {
      vendors: vi.fn(async () => SAP_VENDORS),
      employees: vi.fn(async () => SAP_EMPLOYEES),
      openVendorInvoices: vi.fn(async () => SAP_OPEN_INVOICES),
      openVendorPurchaseOrders: vi.fn(async () => SAP_OPEN_POS),
      openOtherDocuments: vi.fn(async () => SAP_OTHER_DOCUMENTS),
      partnerBankAccounts: vi.fn(
        async (_company: string, cardCode: string) => SAP_PAYEE_ACCOUNTS[cardCode] ?? [],
      ),
      // The company's own accounts — the FROM side.
      houseBanks: vi.fn(async () => SAP_HOUSE_BANKS),
      cashAccounts: vi.fn(async () => SAP_CASH_ACCOUNTS),
      readPaymentProof: vi.fn(async () => PROOF_RESULT),
      employeeDirectory: vi.fn(directory),
      departments: vi.fn(async () => DEPARTMENTS),
      // The requests: pointed at a fresh FakeRequestServer before each test.
      requests: vi.fn(),
      request: vi.fn(),
      createRequest: vi.fn(),
      editRequest: vi.fn(),
      act: vi.fn(),
      savePayout: vi.fn(),
      confirmManualPassword: vi.fn(),
      recordUtr: vi.fn(),
      addRequestFile: vi.fn(),
      removeRequestFile: vi.fn(),
    },
  };
});

/** What the server reads from AP-2026-0011's UPI screenshot. */
const PROOF_RESULT = {
  kind: "advice" as const,
  utr: "626712345678",
  channel: "UPI",
  amount: 15000,
  date: "19/09/26",
  row_text: "626712345678",
  score: 8,
  checks: { amount: true, account: true, account_other: null, invoice: null },
  candidates: [
    { utr: "626799990000", channel: "UPI", amount: 500, date: "", row_text: "", score: 1 },
  ],
  references_found: 2,
  file_name: "upi-receipt.png",
  source: "ocr",
  pages: 1,
  ocr_pages: 1,
  rows_read: 9,
};

let server: FakeRequestServer;

beforeEach(() => {
  vi.mocked(advancePaymentService.vendors).mockClear();
  server = new FakeRequestServer();
  const service = vi.mocked(advancePaymentService) as unknown as Record<string, ReturnType<typeof vi.fn>>;
  Object.entries(server.methods()).forEach(([name, fn]) => service[name].mockReset().mockImplementation(fn));
  vi.mocked(advancePaymentService.employees).mockClear();
  vi.mocked(advancePaymentService.partnerBankAccounts).mockClear();
});

type User = ReturnType<typeof userEvent.setup>;

function setup() {
  const user = userEvent.setup();
  renderPage(<Advance_Payment_Approval />, { route: "/Advance_Payment_Approval" });
  return user;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A field by the START of its label — a required label ends in "*". */
const field = (label: RegExp | string) =>
  screen.getByLabelText(
    typeof label === "string" ? new RegExp(`^${escapeRegExp(label)}`) : label,
  ) as HTMLInputElement;
const requestRows = () =>
  screen.getAllByRole("row").filter((row) => /AP-2026-/.test(row.textContent ?? ""));

async function review(user: User, requestNo: string) {
  await user.click(await screen.findByRole("button", { name: new RegExp(`(Review|View) ${requestNo}`) }));
  await screen.findByRole("heading", { name: requestNo });
}

/** Put someone else's request on the desk, waiting at `at` (0 Sub-HOD … 5 Final); `mine` names Tester's stages. */
function onDesk(id: number, at: number, mine: string[], fields = {}) {
  const held = server.addOwn(apiRequest(id, fields), at);
  held.api.created_by = { id: 7, name: "Navdeep Singh", username: "navdeep" };
  held.mine = mine;
}

async function approve(user: User) {
  await user.click(screen.getByRole("button", { name: "Approve" }));
}

describe("Payments Approval", () => {
  it("lists what is waiting, waiting on you first, with the totals", async () => {
    setup();
    await screen.findByRole("button", { name: /Review AP-2026-0014/ });
    expect(requestRows().map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual([
      expect.stringMatching(/^AP-2026-0014/),
      expect.stringMatching(/^AP-2026-0013/),
      expect.stringMatching(/^AP-2026-0012/),
    ]);
    // ₹1,37,500 + ₹20,000 + ₹24,500 pending.
    expect(screen.getByText("₹1,82,000 waiting")).toBeTruthy();
    expect(screen.getByText("3 waiting on you")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pending/ }).getAttribute("aria-pressed")).toBe("true");
    expect(advancePaymentService.requests).toHaveBeenCalledWith("desk");
  });

  it("filters by clicking a KPI card", async () => {
    const user = setup();
    await screen.findByRole("button", { name: /Review AP-2026-0014/ });
    await user.click(screen.getByRole("button", { name: /Total/ }));
    expect(requestRows()).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: /Rejected/ }));
    expect(requestRows()).toHaveLength(1);
  });

  it("filters by the status dropdown, the company and a search", async () => {
    const user = setup();
    await screen.findByRole("button", { name: /Review AP-2026-0014/ });
    await user.selectOptions(screen.getByLabelText("Filter requests by status"), "");
    expect(requestRows()).toHaveLength(5);
    await user.selectOptions(screen.getByLabelText("Filter requests by company"), "BEVERAGES");
    expect(requestRows()).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText("Filter requests by company"), "");
    await user.type(screen.getByLabelText("Search requests"), "ravinder");
    expect(requestRows()).toHaveLength(1);
    expect(requestRows()[0].textContent).toMatch(/AP-2026-0013/);
  });

  it("shows the request's route, its details and its bills with their payment lines", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");

    expect(screen.getByText(/Fill in the payment and bank details and save them/)).toBeTruthy();
    const route = screen.getByRole("list", { name: "Approval route" });
    expect(within(route).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Sub-HOD Approval.*Approved/),
      expect.stringMatching(/^HOD Approval.*Approved/),
      expect.stringMatching(/^Director Approval.*Approved/),
      expect.stringMatching(/^Payment Approval.*Waiting.*Tester/),
      expect.stringMatching(/^Audit Approval.*To come/),
      expect.stringMatching(/^Final Approval.*To come/),
    ]);
    expect(screen.getByText("ABC Technologies")).toBeTruthy();
    expect(screen.getByText("Procurement — Rajesh")).toBeTruthy();
    const bills = screen.getByRole("heading", { name: /Bills & Amounts/ }).closest("section")!;
    expect(within(bills).getByText("10256")).toBeTruthy();
    expect(within(bills).getByText("₹97,500")).toBeTruthy();
    expect(within(bills).getByText("₹1,37,500")).toBeTruthy();
    // Payment neither returns to the creator nor sends back: those are other stages'.
    expect(screen.queryByRole("button", { name: "Return to Creator" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send Back to Payment" })).toBeNull();
  });

  it("shows the vendor's current balance from SAP at Payment, Cr or Dr", async () => {
    const user = setup();
    await review(user, "AP-2026-0014"); // at Payment: ABC Technologies, OIL
    expect(await screen.findByText("₹6,89,875 Cr")).toBeTruthy();
    expect(screen.getByText("Payable to the vendor, as SAP holds it now.")).toBeTruthy();
    // Read fresh for exactly this vendor.
    expect(advancePaymentService.vendors).toHaveBeenCalledWith("OIL", "VENDA000101", 50);
  });

  it("does not show the balance before Payment", async () => {
    const user = setup();
    await review(user, "AP-2026-0012"); // at HOD
    expect(screen.queryByText("Current Balance")).toBeNull();
    expect(advancePaymentService.vendors).not.toHaveBeenCalled();
  });

  it("shows an Employee Imprest account's balance too, once completed", async () => {
    const user = setup();
    await user.click(await screen.findByRole("button", { name: /Approved/ }));
    await review(user, "AP-2026-0011"); // ORGV000901, MART
    expect(await screen.findByText("Current Balance")).toBeTruthy();
    expect(advancePaymentService.vendors).toHaveBeenCalledWith("MART", "ORGV000901", 50);
  });

  it("starts the payment details with one line for the whole amount, to the partner", async () => {
    const user = setup();
    await review(user, "AP-2026-0013"); // no SAP bank account to pre-fill from
    expect(field("Beneficiary Name").value).toBe("RAVINDER SINGH SHUNTY");
    expect(field("Amount (method 1)").value).toBe("20000");
    expect(screen.getByRole("status", { name: "Allocated to payment methods" }).textContent).toBe(
      "₹20,000 of ₹20,000 allocated",
    );
  });

  it("will not approve until the payment details are complete", async () => {
    const user = setup();
    // An Employee: nothing in SAP to pre-fill, so the payee's account is
    // genuinely missing until someone types it.
    await review(user, "AP-2026-0013");
    await approve(user);
    const warning = screen.getByText(/Still needed:/);
    expect(warning.textContent).toMatch(/To Account Number/);
    expect(warning.textContent).toMatch(/IFSC/);
    expect(warning.textContent).toMatch(/From Account \(method 1\)/);
    expect(advancePaymentService.act).not.toHaveBeenCalled();
  });

  it("pre-fills the payee's default SAP account, and its IFSC", async () => {
    const user = setup();
    await review(user, "AP-2026-0014"); // ABC Technologies, OIL
    expect(await screen.findByDisplayValue(/50100234567812/)).toBeTruthy();
    expect(field("IFSC").value).toBe("HDFC0001234");
    // From SAP with the account, so not retyped against it.
    expect(field("IFSC").readOnly).toBe(true);
    // SAP's account holder name is the name "as per bank records".
    expect(field("Beneficiary Name").value).toBe("ABC TECHNOLOGIES PVT LTD");
    expect(advancePaymentService.partnerBankAccounts).toHaveBeenCalledWith("OIL", "VENDA000101");
  });

  it("offers the payee's other SAP accounts, or one typed by hand", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    await screen.findByDisplayValue(/50100234567812/);

    await user.selectOptions(field("To Account Number"), "208601000040254");
    expect(field("IFSC").value).toBe("IOBA0002086");

    await user.selectOptions(field("To Account Number"), "__manual__");
    // Typing by hand asks for the password first.
    await user.type(await screen.findByLabelText("Your password"), "secret");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await screen.findByLabelText(/^Account Number \(typed\)/);
    expect(field("IFSC").readOnly).toBe(false);
    expect(field("IFSC").value).toBe("");
    await user.type(field("Account Number (typed)"), "12345678901");
    expect(field("Account Number (typed)").value).toBe("12345678901");
  });

  it("asks for the password before a bank account is typed by hand, and sends its token", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    await screen.findByDisplayValue(/50100234567812/);
    await user.selectOptions(field("To Account Number"), "__manual__");

    // A wrong password is refused, and nothing is unlocked.
    await user.type(await screen.findByLabelText("Your password"), "guess");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("That password is not right.")).toBeTruthy();
    expect(screen.queryByLabelText(/^Account Number \(typed\)/)).toBeNull();

    await user.clear(screen.getByLabelText("Your password"));
    await user.type(screen.getByLabelText("Your password"), "secret");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await user.type(await screen.findByLabelText(/^Account Number \(typed\)/), "12345678901");
    await user.type(field("IFSC"), "SBIN0001234");
    await user.click(screen.getByRole("button", { name: "Save Payment Details" }));

    expect(await screen.findByText("Payment details saved.")).toBeTruthy();
    expect(advancePaymentService.savePayout).toHaveBeenLastCalledWith(
      14,
      expect.objectContaining({ to_account_number: "12345678901", to_ifsc: "SBIN0001234", to_account_manual: true }),
      expect.any(Number),
      "tok-1",
    );
  });

  it("keeps an Employee's typed account locked until the password is confirmed", async () => {
    const user = setup();
    await review(user, "AP-2026-0013"); // an Employee: always typed by hand
    expect(field("To Account Number").readOnly).toBe(true);
    expect(field("IFSC").readOnly).toBe(true);
    await user.click(screen.getByRole("button", { name: "Enter bank details by hand" }));
    await user.type(await screen.findByLabelText("Your password"), "secret");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("heading", { name: "AP-2026-0013" })).toBeTruthy();
    expect(field("To Account Number").readOnly).toBe(false);
    await user.type(field("To Account Number"), "12345678901");
    expect(field("To Account Number").value).toBe("12345678901");
    expect(screen.queryByRole("button", { name: "Enter bank details by hand" })).toBeNull();
  });

  it("does not look an Employee up in SAP — their details are typed", async () => {
    const user = setup();
    await review(user, "AP-2026-0013"); // an Employee: a G/L account, not a partner
    expect(field("To Account Number").tagName).toBe("INPUT");
    expect(advancePaymentService.partnerBankAccounts).not.toHaveBeenCalledWith(
      expect.anything(),
      "1113035",
    );
  });

  it("pays from the request's own company's SAP house banks", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    const from = field("From Bank Account (method 1)") as unknown as HTMLSelectElement;
    await screen.findByRole("option", { name: "HDFC BANK-50200012345678 — 1104106" });
    // Every bank G/L, keyed by the G/L — including one with no house bank.
    expect([...from.options].map((o) => o.value)).toEqual(["", "1104106", "1104110", "1104107"]);
    expect(screen.getByRole("option", { name: "ICICI BANK- 629305042549 — 1104107" })).toBeTruthy();
    expect(advancePaymentService.houseBanks).toHaveBeenCalledWith("OIL");
  });

  it("offers only the payment methods the amount may use", async () => {
    const user = setup();
    await review(user, "AP-2026-0014"); // ₹1,37,500
    const method = field("Payment Method 1") as unknown as HTMLSelectElement;
    // No UPI at 1,37,500 (below 1 lakh only), no RTGS (above 2 lakh only),
    // no cash (up to ₹10,000 only).
    expect([...method.options].map((o) => o.value)).toEqual(["NEFT", "IMPS", "CHEQUE"]);
    expect(method.value).toBe("NEFT");
  });

  it("does not offer cash above ₹10,000", async () => {
    const user = setup();
    await review(user, "AP-2026-0013"); // ₹20,000
    const method = field("Payment Method 1") as unknown as HTMLSelectElement;
    expect([...method.options].map((o) => o.value)).not.toContain("CASH");
  });

  it("saves the payment details on their own", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    await screen.findByDisplayValue(/50100234567812/);
    await user.click(screen.getByRole("button", { name: "Save Payment Details" }));
    expect(await screen.findByText("Payment details saved.")).toBeTruthy();
    expect(advancePaymentService.savePayout).toHaveBeenCalledWith(
      14,
      expect.objectContaining({
        beneficiary_name: "ABC TECHNOLOGIES PVT LTD",
        to_account_number: "50100234567812",
        to_ifsc: "HDFC0001234",
        lines: [expect.objectContaining({ method: "NEFT", amount: "137500" })],
      }),
      expect.any(Number),
      null, // picked from SAP, or cash: no password needed
    );
    expect(advancePaymentService.act).not.toHaveBeenCalled();
  });

  it("at Payment, saves the details then approves — and it moves on to Audit", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    await screen.findByDisplayValue(/50100234567812/);
    await screen.findByRole("option", { name: "HDFC BANK-50200012345678 — 1104106" });
    await user.selectOptions(field("From Bank Account (method 1)"), "1104106");
    // No reference / UTR to fill in: it does not exist until after payment.
    expect(screen.queryByLabelText(/Reference \/ UTR/)).toBeNull();
    await user.type(field("Approver Remarks"), "OK to pay");
    await approve(user);

    expect(await screen.findByText("Approved.")).toBeTruthy();
    const saved = vi.mocked(advancePaymentService.savePayout).mock.invocationCallOrder[0];
    expect(saved).toBeLessThan(vi.mocked(advancePaymentService.act).mock.invocationCallOrder[0]);
    expect(advancePaymentService.act).toHaveBeenCalledWith(14, "approve", "OK to pay", expect.any(Number));
    // Now at Audit, which is not Tester's: the details are read-only, no buttons.
    expect(screen.getByText("At Audit Approval")).toBeTruthy();
    expect(field("IFSC").closest("fieldset")?.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("refuses a split that does not add up to the request", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    await user.clear(field("Amount (method 1)"));
    await user.type(field("Amount (method 1)"), "100000");
    await approve(user);
    expect(screen.getByText(/add up to ₹1,00,000, but the request is for ₹1,37,500/)).toBeTruthy();
  });

  it("pays in cash with a note breakdown, from the company's SAP cash account", async () => {
    onDesk(15, 3, ["Payment Approval"], {
      amount: "9000",
      created_on: "2026-09-23T09:00:00+05:30",
      documents: [bill(10400, "9000", "9000")],
    });
    const user = setup();
    await review(user, "AP-2026-0015"); // ₹9,000
    await user.selectOptions(field("Payment Method 1"), "CASH");
    await screen.findByRole("option", { name: "CASH SALE — 1105001" });
    await user.selectOptions(field("From Cash Account (method 1)"), "1105001");
    expect(advancePaymentService.cashAccounts).toHaveBeenCalledWith("OIL");

    await approve(user);
    // In the notice AND under the breakdown itself.
    expect(screen.getAllByText(/Add the cash denominations for ₹9,000/).length).toBe(2);

    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.selectOptions(field("Denomination 1"), "500");
    await user.type(field("Quantity 1"), "18");
    await approve(user);
    // …and no payee account needed when every line is cash.
    expect(await screen.findByText("Approved.")).toBeTruthy();
    expect(advancePaymentService.savePayout).toHaveBeenCalledWith(
      15,
      expect.objectContaining({
        lines: [expect.objectContaining({ method: "CASH", cash_notes: [{ denomination: 500, quantity: 18 }] })],
      }),
      expect.any(Number),
      null, // picked from SAP, or cash: no password needed
    );
  });

  it("needs a reason to reject, and the rejection is final", async () => {
    const user = setup();
    await review(user, "AP-2026-0012");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByText("Say why, in the remarks.")).toBeTruthy();
    expect(advancePaymentService.act).not.toHaveBeenCalled();

    await user.type(field("Approver Remarks"), "PO not yet released");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByText("Rejected.")).toBeTruthy();
    expect(screen.getAllByText("PO not yet released").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("returns a request to its creator from the approvals before Payment", async () => {
    const user = setup();
    await review(user, "AP-2026-0012"); // at HOD
    await user.click(screen.getByRole("button", { name: "Return to Creator" }));
    expect(screen.getByText("Say why, in the remarks.")).toBeTruthy();
    await user.type(field("Approver Remarks"), "Attach the signed PO");
    await user.click(screen.getByRole("button", { name: "Return to Creator" }));
    expect(await screen.findByText("Returned to its creator.")).toBeTruthy();
    expect(advancePaymentService.act).toHaveBeenCalledWith(12, "return", "Attach the signed PO", expect.any(Number));
    expect(screen.getAllByText("Returned").length).toBeGreaterThan(0);
  });

  it("at Audit, approves it on to Final — nothing goes to SAP yet", async () => {
    onDesk(16, 4, ["Audit Approval"], { amount: "24500", documents: [bill(10500, "24500", "24500")] });
    const user = setup();
    await review(user, "AP-2026-0016");
    expect(screen.getByText(/Nothing is posted to SAP yet/)).toBeTruthy();
    await approve(user);
    expect(await screen.findByText("Approved.")).toBeTruthy();
    expect(screen.getByText("At Final Approval")).toBeTruthy();
    expect(screen.queryByText("SAP Outgoing Payment")).toBeNull();
  });

  it("at Final, posts to SAP and completes the request", async () => {
    onDesk(16, 5, ["Final Approval"], { amount: "24500", documents: [bill(10500, "24500", "24500")] });
    const user = setup();
    await review(user, "AP-2026-0016");
    expect(screen.getByText(/Approving posts the outgoing payment to SAP and completes the request/)).toBeTruthy();
    await approve(user);
    expect(await screen.findByText("Approved.")).toBeTruthy();
    expect(screen.getByText("926466971")).toBeTruthy();
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("shows SAP's refusal as it came, and stays at Final", async () => {
    onDesk(16, 5, ["Final Approval"], { amount: "24500", documents: [bill(10500, "24500", "24500")] });
    const user = setup();
    await review(user, "AP-2026-0016");
    server.refuseNext = { status: 502, message: "Not approved: SAP refused the payment: Balance due exceeded" };
    await approve(user);
    expect(await screen.findByText("Not approved: SAP refused the payment: Balance due exceeded")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });

  it("at Final, sends a request back to Payment", async () => {
    onDesk(17, 5, ["Final Approval"], { amount: "24500", documents: [bill(10600, "24500", "24500")] });
    const user = setup();
    await review(user, "AP-2026-0017");
    expect(screen.queryByRole("button", { name: "Return to Creator" })).toBeNull();
    await user.type(field("Approver Remarks"), "Wrong bank account");
    await user.click(screen.getByRole("button", { name: "Send Back to Payment" }));
    expect(await screen.findByText("Sent back to Payment.")).toBeTruthy();
    expect(screen.getByText("At Payment Approval")).toBeTruthy();
  });

  it("shows a completed request read-only, with its payout and decision", async () => {
    const user = setup();
    await user.click(await screen.findByRole("button", { name: /Approved/ }));
    await review(user, "AP-2026-0011");

    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(field("From Bank Account (method 1)").closest("fieldset")?.disabled).toBe(true);
    expect(screen.getAllByText("Approved as per imprest policy.").length).toBeGreaterThan(0);
    expect(screen.getByText("926466970")).toBeTruthy();
  });

  it("records a transfer's UTR from its proof, once it is paid", async () => {
    const user = setup();
    await user.click(await screen.findByRole("button", { name: /Approved/ }));
    await review(user, "AP-2026-0011"); // ₹15,000 by UPI to 50100234567812

    expect(screen.getByRole("heading", { name: "Record Payment" })).toBeTruthy();
    const read = screen.getByRole("button", { name: "Read proof" });
    expect((read as HTMLButtonElement).disabled).toBe(true); // nothing chosen yet

    const proof = new File(["png"], "upi-receipt.png", { type: "image/png" });
    await user.upload(field("Payment proof (method 1)"), proof);
    await user.click(read);

    // Checked against THIS line: its amount and the account it was paid to.
    expect(advancePaymentService.readPaymentProof).toHaveBeenCalledWith(proof, {
      company: "MART",
      amount: "15000",
      toAccount: "50100234567812",
      cardCode: "ORGV000901",
      invoices: [],
    });
    expect(await screen.findByText(/a payment advice, read by OCR/)).toBeTruthy();
    expect(screen.getByText(/₹15,000, as paid/)).toBeTruthy();
    expect(screen.getByText(/paid to 50100234567812/)).toBeTruthy();
    expect(field("UTR (method 1)").value).toBe("626712345678");

    // Another reference from the same file can be taken instead…
    await user.click(screen.getByRole("button", { name: /626799990000/ }));
    expect(field("UTR (method 1)").value).toBe("626799990000");
    // …or the right one typed back.
    await user.clear(field("UTR (method 1)"));
    await user.type(field("UTR (method 1)"), "626712345678");
    await user.click(screen.getByRole("button", { name: "Record UTR" }));

    expect(await screen.findByText("UTR 626712345678")).toBeTruthy();
    expect(screen.getByText(/from upi-receipt.png · recorded by/)).toBeTruthy();
    expect(advancePaymentService.recordUtr).toHaveBeenCalledWith(
      11,
      71,
      "626712345678",
      expect.objectContaining({ fileName: "upi-receipt.png" }),
    );
  });

  it("says what the proof shows when it does not match", async () => {
    vi.mocked(advancePaymentService.readPaymentProof).mockResolvedValueOnce({
      ...PROOF_RESULT,
      amount: 12000,
      checks: { amount: false, account: false, account_other: "11112222333", invoice: null },
    });
    const user = setup();
    await user.click(await screen.findByRole("button", { name: /Approved/ }));
    await review(user, "AP-2026-0011");
    await user.upload(field("Payment proof (method 1)"), new File(["x"], "s.pdf"));
    await user.click(screen.getByRole("button", { name: "Read proof" }));

    expect(await screen.findByText(/the proof shows ₹12,000, not ₹15,000/)).toBeTruthy();
    expect(screen.getByText(/the proof shows 11112222333, another account of this payee/)).toBeTruthy();
  });

  it("goes back to the list", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    await user.click(screen.getByRole("button", { name: "Back to list" }));
    expect(screen.getByRole("heading", { name: "Payments Approval" })).toBeTruthy();
  });
});
