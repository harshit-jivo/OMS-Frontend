/**
 * The rendered cascade. `advancePayments/rules.test.ts` pins the rules; this
 * pins that the PAGE follows them — sections appear and vanish with the
 * answers, dropdowns hold only what the rules allow, the live lookups are
 * asked the right questions, and the numbers the requester sees are the ones
 * the rules compute.
 *
 * The SAP service is mocked with SAP-shaped rows (`advancePayments/testData`),
 * so the live paths run exactly as they do against the server, minus HANA.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService } from "../services/advancePaymentService";
import { FakeRequestServer, TESTER, apiRequest, sampleRequests } from "./advancePayments/testRequests";
import { renderPage } from "../test/renderPage";
import Advance_Payment_Request from "./Advance_Payment_Request";
import {
  SAP_EMPLOYEES,
  SAP_OPEN_INVOICES,
  SAP_OPEN_POS,
  SAP_OTHER_DOCUMENTS,
  SAP_VENDORS,
  SAP_BUDGETS,
  LEDGER,
} from "./advancePayments/testData";

// Forward-looking dates are refused before today, and the dates typed below
// are in October 2026. Pin the calendar so they stay ahead of it — only Date
// is faked, so userEvent's own timers are untouched.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0));
});
afterAll(() => vi.useRealTimers());

/** What the server read off bill 10256's SAP attachment. */
const READING = {
  file_name: "DocScanner Sep 17, 2026 12-39 PM.pdf",
  attachment_count: 3,
  source: "ocr",
  pages: 1,
  fields: {
    invoice_number: { value: "ABC/INV/7781", sap: "ABC/INV/7781", match: true },
    invoice_date: { value: "2026-08-04", sap: "2026-08-04", match: true },
    amount: { value: 250000, sap: 250000, match: true },
    party_name: { value: "ABC Technologies Pvt Ltd", sap: "ABC Technologies", match: true },
    account_number: { value: "50100234567812", sap: "50100234567899", match: false },
    ifsc: { value: null, sap: null, match: null },
  },
};

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
      vendors: vi.fn(),
      employees: vi.fn(),
      openVendorInvoices: vi.fn(),
      openVendorPurchaseOrders: vi.fn(),
      openOtherDocuments: vi.fn(),
      partnerBankAccounts: vi.fn(async () => []),
      employeeDirectory: vi.fn(directory),
      departments: vi.fn(async () => DEPARTMENTS),
      budgets: vi.fn(async () => SAP_BUDGETS),
      partnerLedger: vi.fn(async () => LEDGER),
      readDocumentAttachment: vi.fn(),
      documentAttachment: vi.fn(async () => new Blob(["%PDF-"], { type: "application/pdf" })),
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

// An approved request shows its payout read-only, which reads the house banks.
vi.mock("../services/approvalService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/approvalService")>();
  return { ...actual, default: { ...actual.default, listSapBanks: vi.fn(async () => []) } };
});

const service = vi.mocked(advancePaymentService);

let server: FakeRequestServer;

beforeEach(() => {
  // Tester's own requests: the samples, raised by them.
  server = new FakeRequestServer(
    sampleRequests().map((r) => ({ ...r, mine: [], api: { ...r.api, created_by: TESTER } })),
  );
  const requests = vi.mocked(advancePaymentService) as unknown as Record<string, ReturnType<typeof vi.fn>>;
  Object.entries(server.methods()).forEach(([name, fn]) => requests[name].mockReset().mockImplementation(fn));
  service.vendors.mockReset().mockImplementation(async (_company, search = "") =>
    SAP_VENDORS.filter((v) =>
      `${v.card_name} ${v.card_code}`.toUpperCase().includes(search.toUpperCase()),
    ),
  );
  service.employees.mockReset().mockImplementation(async () => SAP_EMPLOYEES);
  service.employeeDirectory.mockReset().mockImplementation(directory);
  service.readDocumentAttachment.mockReset().mockResolvedValue(READING);
  service.openVendorPurchaseOrders
    .mockReset()
    .mockImplementation(async (_company, cardCode) =>
      SAP_OPEN_POS.filter((order) => order.card_code === cardCode),
    );
  service.openOtherDocuments
    .mockReset()
    .mockImplementation(async (_company, cardCode) =>
      cardCode === "VENDA000104" ? SAP_OTHER_DOCUMENTS : [],
    );
  service.openVendorInvoices
    .mockReset()
    .mockImplementation(async (_company, cardCode) =>
      SAP_OPEN_INVOICES.filter((invoice) => invoice.card_code === cardCode),
    );
});

type User = ReturnType<typeof userEvent.setup>;

/** The page opens on Entries; these tests are about the form, so open it. */
async function setup() {
  const user = userEvent.setup();
  renderPage(<Advance_Payment_Request />, { route: "/Advance_Payment_Request" });
  await user.click(screen.getByRole("tab", { name: /New Request/ }));
  return user;
}

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

/**
 * Answer a pick-or-type box (Payment Against, Return Method) the way a user
 * types into it: clear, type, Enter. A listed label picks that answer;
 * anything else is taken as the user's own.
 */
async function answer(user: User, label: RegExp, text: string) {
  const box = field(label);
  await user.clear(box);
  await user.type(box, `${text}{Enter}`);
}

/** Company, Type and Payment Against, in that order. */
async function start(user: User, type: string, against: string, company = "OIL") {
  if (company) await user.selectOptions(screen.getByLabelText(/^Company/), company);
  await user.selectOptions(screen.getByLabelText(/^Type/), type);
  await answer(user, /^Payment Against/, against);
}

/** Open a SearchSelect by its label and return the option names on offer. */
async function openOptions(user: User, label: RegExp) {
  await user.click(screen.getByLabelText(label));
  const list = await screen.findByRole("listbox");
  return within(list)
    .queryAllByRole("option")
    .map((option) => option.textContent ?? "");
}

async function pick(user: User, label: RegExp, option: RegExp) {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole("option", { name: option }));
}

/** Open a checkbox MultiSelect and return the documents it offers. */
async function openChecklist(user: User, label: RegExp) {
  await user.click(screen.getByLabelText(label));
  const boxes = await screen.findAllByRole("checkbox");
  const names = boxes
    .map((box) => box.closest("label")?.textContent ?? "")
    .filter((name) => !name.startsWith("Select all"));
  await user.keyboard("{Escape}");
  return names;
}

/** Tick documents in a checkbox MultiSelect, then close it. */
async function tick(user: User, label: RegExp, ...documents: RegExp[]) {
  await user.click(await screen.findByLabelText(label));
  for (const document of documents) {
    await user.click(await screen.findByRole("checkbox", { name: document }));
  }
  await user.keyboard("{Escape}");
}

const heading = (name: string | RegExp) => screen.queryByRole("heading", { name });
const total = () => screen.getByRole("status", { name: "Total payment amount" });

/** Waits for the bill list to load before ticking — it is fetched per vendor. */
/** Wait until the chosen kind's picker is ready — its placeholder is showing. */
async function waitForBills() {
  await screen.findByText("Select Bills");
}
const waitForPos = () => screen.findByText("Select Open POs");

describe("Advance Payment Request", () => {
  it("starts with only the sections every case has", async () => {
    await setup();
    expect(heading("Payment Details")).not.toBeNull();
    expect(heading("Additional Information")).not.toBeNull();
    expect(heading("Attachments")).not.toBeNull();
    expect(heading("Reference Details")).toBeNull();
  });

  it("offers the three types", async () => {
    await setup();
    const type = screen.getByLabelText(/^Type/) as HTMLSelectElement;
    expect([...type.options].map((o) => o.text)).toEqual([
      "Select Type",
      "Vendor",
      "Employee",
      "Employee Imprest",
    ]);
  });

  it("picks Ownership from the employee master's HODs and Sub-HODs", async () => {
    const user = await setup();
    const owners = await openOptions(user, /^Ownership/);
    expect(owners.map((o) => o.replace(/\s+/g, " "))).toEqual([
      expect.stringMatching(/Arvinder \(JWPL0115\).*HOD/),
      expect.stringMatching(/Preshit Singh \(JWPL0030\).*Sub-HOD/),
    ]);
    expect(service.employeeDirectory).toHaveBeenCalledWith({ roles: [1, 2] });
    await user.keyboard("{Escape}");
    await pick(user, /^Ownership/, /Preshit Singh/);
    expect(field(/^Ownership/).textContent).toMatch(/Preshit Singh \(JWPL0030\)/);
  });

  it("asks the Department, then that department's Sub-department", async () => {
    const user = await setup();
    const sub = () => field(/^Sub-department/) as unknown as HTMLButtonElement;
    expect(sub().disabled).toBe(true); // nothing to list before a department

    expect(await openOptions(user, /^Department/)).toEqual(["Cyber Security", "Finance"]);
    await user.keyboard("{Escape}");
    await pick(user, /^Department/, /Finance/);
    expect(sub().disabled).toBe(false);
    expect(await openOptions(user, /^Sub-department/)).toEqual(["AP", "AR"]);
    await user.keyboard("{Escape}");
    await pick(user, /^Sub-department/, /^AR$/);
    expect(sub().textContent).toMatch(/AR/);

    // A new department starts the sub-department afresh; one with none has none to pick.
    await pick(user, /^Department/, /Cyber Security/);
    expect(sub().disabled).toBe(true);
    expect(sub().textContent).not.toMatch(/AR/);
    expect(screen.getByText("This department has no sub-departments.")).toBeTruthy();
  });

  describe("typing your own answer instead of choosing Other", () => {
    it("offers the listed answers without an Other entry — Against PO for vendors only", async () => {
      const user = await setup();
      const listed = async () => {
        await user.click(field(/^Payment Against/));
        const options = within(await screen.findByRole("listbox"))
          .getAllByRole("option")
          .map((o) => o.textContent);
        await user.keyboard("{Escape}");
        return options;
      };

      await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
      // A vendor advance is always against a document — exactly two answers.
      expect(await listed()).toEqual(["Against Bill", "Against PO"]);

      await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_ADVANCE");
      expect(await listed()).toEqual(["Advance"]);
    });

    it("takes a typed Payment Against as the requester's own, with a plain amount", async () => {
      const user = await setup();
      // Employee Advance, not Vendor: a vendor's two answers are both
      // documents, so it no longer takes a typed answer at all.
      await start(user, "EMPLOYEE_ADVANCE", "Security deposit");
      expect(field(/^Payment Against/).value).toBe("Security deposit");
      expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
      expect(heading("Reference Details")).toBeNull();
    });

    it("offers the typed text as a choice while it is being typed", async () => {
      const user = await setup();
      await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_ADVANCE");
      await user.type(field(/^Payment Against/), "Rent");
      await user.click(await screen.findByRole("option", { name: "Use “Rent”" }));
      expect(field(/^Payment Against/).value).toBe("Rent");
    });

    it("reads a typed listed answer as that answer", async () => {
      const user = await setup();
      await start(user, "VENDOR", "against bill");
      expect(field(/^Payment Against/).value).toBe("Against Bill");
      expect(heading("Reference Details")).not.toBeNull();
    });

    it("lets Return Method be typed too", async () => {
      const user = await setup();
      await start(user, "EMPLOYEE_ADVANCE", "Advance");
      await answer(user, /^Return Method/, "Salary deduction over 2 months");
      expect(field(/^Return Method/).value).toBe("Salary deduction over 2 months");
      expect(screen.queryByLabelText(/^Number of Installments/)).toBeNull();
    });
  });

  describe("SAP vendors", () => {
    it("asks for a company before it can list SAP's vendors", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against Bill", "");
      expect(screen.getByLabelText(/^Business Partner/).hasAttribute("disabled")).toBe(true);
      expect(screen.getByText(/Pick a company first/)).toBeTruthy();
      expect(service.vendors).not.toHaveBeenCalled();
    });

    it("lists the company's vendors from SAP", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against Bill");
      const vendors = await openOptions(user, /^Business Partner/);
      // Vendors only — VENDA codes. The ORGV imprest accounts in the same SAP
      // list are not offered, and a vendor NAMED "ORGV…" still is.
      expect(vendors).toHaveLength(5);
      expect(vendors.join(" ")).toMatch(/ABC Technologies.*VENDA000101/);
      expect(vendors.join(" ")).toMatch(/ORGVALE LOGISTICS/);
      expect(vendors.join(" ")).not.toMatch(/IMPREST/);
      // Nothing typed: search for the prefix, over the server's full page.
      expect(service.vendors).toHaveBeenCalledWith("OIL", "VENDA", 500);
      // The partner field's own note. Against Bill also shows "Live from SAP."
      // on the Reference Details section, so this has to name which one.
      expect(screen.getByText(/Live from SAP — codes starting VENDA/)).toBeTruthy();
    });

    it("searches SAP as the requester types", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against Bill");
      await user.click(screen.getByLabelText(/^Business Partner/));
      await user.type(await screen.findByPlaceholderText("Search name or code…"), "xyz");
      await vi.waitFor(() => expect(service.vendors).toHaveBeenCalledWith("OIL", "xyz", 500));
    });

    it("clears the vendor when the company changes — each company is its own SAP", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against Bill");
      await pick(user, /^Business Partner/, /ABC Technologies/);
      expect(screen.getByLabelText(/^Business Partner/).textContent).toMatch(/ABC Technologies/);

      await user.selectOptions(screen.getByLabelText(/^Company/), "MART");
      expect(screen.getByLabelText(/^Business Partner/).textContent).toMatch(/Select Business Partner/);
    });

    it("says so when SAP cannot be read", async () => {
      service.vendors.mockRejectedValue({
        response: { status: 503, data: { message: "Could not read vendors for OIL: timeout" } },
      });
      const user = await setup();
      await start(user, "VENDOR", "Against Bill");
      // The form retries a failed lookup once before showing the error.
      expect(
        await screen.findByText("Could not read vendors for OIL: timeout", {}, { timeout: 4000 }),
      ).toBeTruthy();
    });
  });

  describe("Vendor → Against Bill (live from SAP)", () => {
    async function toAbcBills(user: User) {
      await start(user, "VENDOR", "Against Bill");
      await pick(user, /^Business Partner/, /ABC Technologies/);
      await waitForBills();
    }

    it("offers the chosen vendor's open SAP invoices, and only theirs", async () => {
      const user = await setup();
      await toAbcBills(user);
      expect(service.openVendorInvoices).toHaveBeenCalledWith("OIL", "VENDA000101");
      const bills = await openChecklist(user, /^Bills/);
      expect(bills).toHaveLength(2);
      expect(bills[0]).toMatch(/^10256.*Ref ABC\/INV\/7781/);
      expect(bills[1]).toMatch(/^10271/);
      expect(screen.getByText("Live from SAP.")).toBeTruthy();
    });

    it("does not show the requester the vendor's balance", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against Bill");
      await pick(user, /^Business Partner/, /ABC Technologies/);
      await waitForBills();
      expect(screen.queryByLabelText(/^Current Balance/)).toBeNull();
      expect(screen.queryByText(/Current Balance/)).toBeNull();
    });

    it("says when a vendor has no open bills", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against Bill");
      await pick(user, /^Business Partner/, /Shree Packaging/);
      await waitForBills();
      await user.click(screen.getByLabelText(/^Bills/));
      expect(await screen.findByText("No open bills for this business partner")).toBeTruthy();
    });

    it("shows each bill's payment inside its amount box, and totals the lines", async () => {
      const user = await setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /10256/, /10271/);
      expect(heading("Selected Bills (2)")).not.toBeNull();

      // A bill is paid by amount only — there is no percentage to choose.
      expect(screen.queryByLabelText(/^Payment percentage for/)).toBeNull();
      expect(
        [...document.querySelectorAll('[data-slot="payment-mode"]')].map((el) => el.textContent),
      ).toEqual(["Fixed Amount", "Fixed Amount"]);

      await user.type(field(/^Payment amount for 10256/), "97500");
      await user.type(field(/^Payment amount for 10271/), "40000");
      expect(within(total()).getByText("₹1,37,500")).toBeTruthy();
    });

    it("will not take an amount above the bill's open amount", async () => {
      const user = await setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /10256/);
      // Open is 1,50,000. The last 0 would make it 1,80,000, so it is not taken.
      await user.type(field(/^Payment amount for 10256/), "180000");
      expect(field(/^Payment amount for 10256/).value).toBe("18000");
      expect(screen.queryByText(/Cannot exceed the open amount/)).toBeNull();
    });

    it("takes the open amount itself — the limit is inclusive", async () => {
      const user = await setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /10256/);
      await user.type(field(/^Payment amount for 10256/), "150000");
      expect(field(/^Payment amount for 10256/).value).toBe("150000");
    });

    it("expands a row to show the bill's SAP details", async () => {
      // SAP's own figures only: the attachment is still being read.
      service.readDocumentAttachment.mockReturnValue(new Promise(() => {}));
      const user = await setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /10256/);

      const row = screen.getByRole("button", { name: /^10256/ });
      await user.click(row);
      expect(row.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByText("₹2,50,000")).toBeTruthy(); // original
      expect(screen.getByText("₹1,00,000")).toBeTruthy(); // paid
      expect(screen.getByText("ABC/INV/7781")).toBeTruthy(); // vendor ref
    });

    it("opens the bill's latest SAP attachment from the expanded row", async () => {
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      const createUrl = vi.fn(() => "blob:attachment");
      const revokeUrl = vi.fn();
      Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
      const user = await setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /10256/, /10271/);

      await user.click(screen.getByRole("button", { name: /^10256/ }));
      const link = screen.getByRole("button", {
        name: "Open SAP attachment DocScanner Sep 17, 2026 12-39 PM.pdf",
      });
      expect(link.textContent).toMatch(/\(latest of 3\)/);
      await user.click(link);
      // Fetched by DOCUMENT — the server reads the file name from SAP.
      expect(service.documentAttachment).toHaveBeenCalledWith("OIL", "bill", 10256);
      await vi.waitFor(() => expect(createUrl).toHaveBeenCalled());
      open.mockRestore();

      // A bill with nothing attached in SAP says so.
      await user.click(screen.getByRole("button", { name: /^10271/ }));
      expect(screen.getByText("None in SAP")).toBeTruthy();
    });

    it("reads a chosen bill's SAP attachment in the background, and shows the requester nothing of it", async () => {
      let finish: (value: typeof READING) => void = () => {};
      service.readDocumentAttachment.mockImplementation(
        () => new Promise((resolve) => (finish = resolve as typeof finish)),
      );
      const user = await setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /10256/, /10271/);

      // Only the bill WITH an attachment is read, straight away, by document.
      expect(service.readDocumentAttachment).toHaveBeenCalledTimes(1);
      expect(service.readDocumentAttachment).toHaveBeenCalledWith("OIL", "bill", 10256);
      // Submit waits for it; the rest of the form does not.
      const submit = screen.getByRole("button", { name: "Checking attachments…" }) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      expect(screen.getByText(/you can keep filling the form/)).toBeTruthy();
      expect(field(/^Remarks/).disabled).toBe(false);

      finish(READING);
      expect(await screen.findByRole("button", { name: "Submit Request" })).toBeTruthy();
      // What it found is for the approvers, not the requester.
      await user.click(screen.getByRole("button", { name: /^10256/ }));
      expect(screen.queryByText("On the attachment")).toBeNull();
      expect(screen.queryByText(/differs from SAP/)).toBeNull();
    });

    it("does not hold the request up when an attachment cannot be read", async () => {
      service.readDocumentAttachment.mockRejectedValue({
        response: { status: 503, data: { message: "The OCR service could not be reached." } },
      });
      const user = await setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /10256/);
      expect(await screen.findByRole("button", { name: "Submit Request" })).toBeTruthy();
      expect(screen.queryByText(/Could not read the attachment/)).toBeNull();
    });

    it("deletes one row with the trash button and leaves the others as they were", async () => {
      const user = await setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /10256/, /10271/);
      await user.type(field(/^Payment amount for 10271/), "40000");

      await user.click(screen.getByRole("button", { name: "Delete 10256" }));
      expect(heading("Selected Bills (1)")).not.toBeNull();
      expect(field(/^Payment amount for 10271/).value).toBe("40000");
    });

    it("says so when the bills cannot be read", async () => {
      service.openVendorInvoices.mockRejectedValue({
        response: { status: 503, data: { message: "Could not read open vendor invoices for OIL: x" } },
      });
      const user = await setup();
      await start(user, "VENDOR", "Against Bill");
      await pick(user, /^Business Partner/, /ABC Technologies/);
      expect(
        await screen.findByText("Could not read open vendor invoices for OIL: x", {}, { timeout: 4000 }),
      ).toBeTruthy();
    });
  });

  describe("Vendor → Against PO (live from SAP)", () => {
    it("lists the chosen vendor's open POs from SAP, and asks an Expected Bill Date", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against PO");
      expect(screen.getByLabelText(/^Expected Bill Date/)).toBeTruthy();
      await pick(user, /^Business Partner/, /XYZ Traders/);

      await waitForPos();
      expect(service.openVendorPurchaseOrders).toHaveBeenCalledWith("OIL", "VENDA000102");
      expect(service.openVendorInvoices).not.toHaveBeenCalled();
      const pos = await openChecklist(user, /^Purchase Orders/);
      expect(pos.map((p) => p.slice(0, 4))).toEqual(["4512", "4519"]);

      await tick(user, /^Purchase Orders/, /4512/, /4519/);
      // A PO line starts on percentage, and can be switched to an amount.
      await user.selectOptions(screen.getByLabelText("Quick percentage for 4512"), "10");
      const mode = screen.getByRole("radiogroup", { name: "Payment mode for 4519" });
      await user.click(within(mode).getByRole("radio", { name: "Fixed Amount" }));
      await user.type(field(/^Payment amount for 4519/), "6500");
      expect(within(total()).getByText("₹24,500")).toBeTruthy(); // ₹18,000 + ₹6,500
    });

    it("will not take a percentage above 100", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against PO");
      await pick(user, /^Business Partner/, /XYZ Traders/);
      await waitForPos();
      await tick(user, /^Purchase Orders/, /4512/);
      await user.type(field(/^Payment percentage for 4512/), "150");
      // "15" is fine; the "0" making it 150 is refused.
      expect(field(/^Payment percentage for 4512/).value).toBe("15");
    });

    it("offers only what is still to be received on a part-received PO", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against PO");
      await pick(user, /^Business Partner/, /ABC Technologies/);
      await waitForPos();
      const pos = await openChecklist(user, /^Purchase Orders/);
      // PO 4501: ₹5,00,000, ₹1,50,000 received, so ₹3,50,000 open.
      expect(pos[0]).toMatch(/4501.*Open ₹3,50,000/);
    });

    it("keeps the vendor when moving from Bill to PO, and loads their POs", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against Bill");
      await pick(user, /^Business Partner/, /XYZ Traders/);
      await answer(user, /^Payment Against/, "Against PO");
      expect(field(/^Business Partner/).textContent).toMatch(/XYZ Traders/);
      await waitForPos();
      expect(service.openVendorPurchaseOrders).toHaveBeenCalledWith("OIL", "VENDA000102");
    });

    it("leaving Against PO clears the POs and the Expected Bill Date", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against PO");
      await user.type(field(/^Expected Bill Date/), "2026-10-20");

      await answer(user, /^Payment Against/, "Against Bill");
      expect(screen.queryByLabelText(/^Expected Bill Date/)).toBeNull();

      await answer(user, /^Payment Against/, "Against PO");
      expect(field(/^Expected Bill Date/).value).toBe("");
    });
  });

  describe("Employee Advance → Advance (employees live from SAP)", () => {
    async function toAdvance(user: User) {
      await start(user, "EMPLOYEE_ADVANCE", "Advance");
    }

    it("lists SAP's employee advance accounts", async () => {
      const user = await setup();
      await toAdvance(user);
      const employees = await openOptions(user, /^Employee/);
      expect(employees[0]).toMatch(/RAVINDER SINGH SHUNTY.*JWPL0035 · 1113035/);
      expect(service.employees).toHaveBeenCalledWith("OIL", "");
    });

    it("also lists the employee master's people with no SAP account, marked Not in SAP", async () => {
      const user = await setup();
      await toAdvance(user);
      const employees = await openOptions(user, /^Employee/);
      expect(employees.at(-1)).toMatch(/Asha Rani \(Not in SAP\).*JWPL3100 · Not in SAP/);
      expect(service.employeeDirectory).toHaveBeenCalledWith({ notInSapFor: "OIL", search: "" });
      expect(screen.queryByText(/has no employee advance account in SAP/)).toBeNull();

      await user.keyboard("{Escape}");
      await pick(user, /^Employee/, /Asha Rani/);
      expect(
        screen.getByText(/Asha Rani has no employee advance account in SAP\. Create their employee master in SAP/),
      ).toBeTruthy();
    });

    it("still lists SAP's accounts when the employee master cannot be read", async () => {
      // Only the not-in-SAP read fails; the Ownership list still loads.
      service.employeeDirectory.mockImplementation(async (query = {}) => {
        if (query.notInSapFor) throw new Error("down");
        return directory(query);
      });
      const user = await setup();
      await toAdvance(user);
      const employees = await openOptions(user, /^Employee/);
      expect(employees[0]).toMatch(/RAVINDER SINGH SHUNTY/);
      expect(employees.join(" ")).not.toMatch(/Not in SAP/);
    });

    it("shows Amount and Return Method, and no date until a method is chosen", async () => {
      const user = await setup();
      await toAdvance(user);
      expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
      expect(screen.getByLabelText(/^Return Method/)).toBeTruthy();
      // Each method asks its own dates, so none are shown before one is picked.
      expect(screen.queryByLabelText(/^EMI Start Date/)).toBeNull();
      expect(screen.queryByLabelText(/^Return Date/)).toBeNull();
      expect(screen.queryByLabelText(/^Expected Bill Date/)).toBeNull();
    });

    it("works out the EMI from the installments", async () => {
      const user = await setup();
      await toAdvance(user);
      await user.type(field(/^Amount/), "20000");
      await answer(user, /^Return Method/, "EMI");
      await user.type(field(/^Number of Installments/), "4");
      expect(field(/^EMI Amount/).value).toBe("5000");
    });

    it("works out the installments from the EMI, and says what the last one is", async () => {
      const user = await setup();
      await toAdvance(user);
      await user.type(field(/^Amount/), "20000");
      await answer(user, /^Return Method/, "EMI");
      await user.type(field(/^EMI Amount/), "6000");
      expect(field(/^Number of Installments/).value).toBe("4");
      expect(screen.getByText("Last installment ₹2,000.")).toBeTruthy();
    });

    it("works out Expected To Date from the EMI Start Date, and does not let it be typed", async () => {
      const user = await setup();
      await toAdvance(user);
      await user.type(field(/^Amount/), "20000");
      await answer(user, /^Return Method/, "EMI");
      await user.type(field(/^Number of Installments/), "4");
      await user.type(field(/^EMI Start Date/), "2026-10-01");
      const to = field(/^Expected To Date/);
      expect(to.value).toBe("2027-02-01");
      expect(to.readOnly).toBe(true);
    });

    it("will not start an EMI, or take a return date, before today", async () => {
      const user = await setup();
      await toAdvance(user);
      await answer(user, /^Return Method/, "EMI");
      expect(field(/^EMI Start Date/).min).toBe("2026-09-23");

      await answer(user, /^Return Method/, "One Time");
      expect(field(/^Return Date/).min).toBe("2026-09-23");
    });

    it("asks One Time for a single Return Date, and nothing about installments", async () => {
      const user = await setup();
      await toAdvance(user);
      await answer(user, /^Return Method/, "One Time");
      expect(screen.getByLabelText(/^Return Date/)).toBeTruthy();
      expect(screen.queryByLabelText(/^Number of Installments/)).toBeNull();
      expect(screen.queryByLabelText(/^EMI Start Date/)).toBeNull();
      expect(screen.queryByLabelText(/^Expected To Date/)).toBeNull();
    });

    it("refuses an Expected To Date before the From Date under a typed method", async () => {
      const user = await setup();
      await toAdvance(user);
      await answer(user, /^Return Method/, "Adjust against bonus");
      await user.type(field(/^Expected From Date/), "2026-10-15");
      await user.type(field(/^Expected To Date/), "2026-10-01");
      expect(screen.getByText("Expected To Date cannot be before Expected From Date.")).toBeTruthy();
    });

    it("drops the repayment fields when Payment Against changes", async () => {
      const user = await setup();
      await toAdvance(user);
      await answer(user, /^Return Method/, "EMI");
      await user.type(field(/^EMI Start Date/), "2026-10-01");

      await answer(user, /^Payment Against/, "Uniform allowance");
      expect(screen.queryByLabelText(/^Return Method/)).toBeNull();

      await answer(user, /^Payment Against/, "Advance");
      expect(field(/^Return Method/).value).toBe("");
      // No method, so no EMI Start Date field at all — let alone a value in it.
      expect(screen.queryByLabelText(/^EMI Start Date/)).toBeNull();
    });
  });

  it("will not take a Payment Date before today", async () => {
    await setup();
    expect(field(/^Payment Date/).min).toBe("2026-09-23");
  });

  it("will not take an Expected Bill Date before today on a vendor PO", async () => {
    const user = await setup();
    await start(user, "VENDOR", "Against PO");
    expect(field(/^Expected Bill Date/).min).toBe("2026-09-23");
  });

  it("will not take an Expected Bill Date before today on an Imprest", async () => {
    const user = await setup();
    await start(user, "EMPLOYEE_IMPREST", "Advance");
    expect(field(/^Expected Bill Date/).min).toBe("2026-09-23");
  });

  it("Employee Advance has no Against Bill — typing it is the requester's own answer", async () => {
    const user = await setup();
    await start(user, "EMPLOYEE_ADVANCE", "Against Bill");
    expect(heading("Reference Details")).toBeNull();
    expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
  });

  it("Employee Imprest lists SAP's ORGV imprest accounts and keeps its Expected Bill Date", async () => {
    const user = await setup();
    await start(user, "EMPLOYEE_IMPREST", "Advance");
    const employees = await openOptions(user, /^Employee/);
    // The same SAP partner list as vendors, narrowed to the ORGV series.
    expect(employees).toHaveLength(2);
    expect(employees.join(" ")).toMatch(/RAHUL SHARMA IMPREST JWPL0901.*ORGV000901/);
    expect(employees.join(" ")).not.toMatch(/VENDA/);
    expect(service.vendors).toHaveBeenCalledWith("OIL", "ORGV", 500);
    expect(service.employees).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");

    await user.type(field(/^Expected Bill Date/), "2026-10-05");
    await answer(user, /^Payment Against/, "Against Bill");
    expect(field(/^Expected Bill Date/).value).toBe("2026-10-05");

    await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_ADVANCE");
    await answer(user, /^Payment Against/, "Petty cash");
    expect(screen.queryByLabelText(/^Expected Bill Date/)).toBeNull();
  });

  it("Employee Imprest → Against Bill lists that imprest account's open bills from SAP", async () => {
    const user = await setup();
    await start(user, "EMPLOYEE_IMPREST", "Against Bill");
    await pick(user, /^Employee/, /RAHUL SHARMA IMPREST/);
    await waitForBills();
    expect(service.openVendorInvoices).toHaveBeenCalledWith("OIL", "ORGV000901");
    const bills = await openChecklist(user, /^Bills/);
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatch(/^10290/);
    // …and it still asks when the bill is expected.
    expect(screen.getByLabelText(/^Expected Bill Date/)).toBeTruthy();
  });

  it("changing Type clears the partner, the bills and every row", async () => {
    const user = await setup();
    await start(user, "VENDOR", "Against Bill");
    await pick(user, /^Business Partner/, /ABC Technologies/);
    await waitForBills();
    await tick(user, /^Bills/, /10256/);
    expect(heading("Selected Bills (1)")).not.toBeNull();

    await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_ADVANCE");
    expect(field(/^Payment Against/).value).toBe("");
    expect(screen.getByLabelText(/^Employee/).textContent).toMatch(/Select Employee/);
    expect(heading(/^Selected Bills/)).toBeNull();
  });

  describe("Entries tab", () => {
    const rows = () =>
      screen.getAllByRole("row").filter((row) => /AP-2026-/.test(row.textContent ?? ""));

    async function open() {
      const user = userEvent.setup();
      renderPage(<Advance_Payment_Request />, { route: "/Advance_Payment_Request" });
      await screen.findByRole("button", { name: "Details AP-2026-0014" });
      return user;
    }

    async function details(user: User, requestNo: string) {
      await user.click(screen.getByRole("button", { name: `Details ${requestNo}` }));
      await screen.findByRole("heading", { name: requestNo });
    }

    it("opens on Entries, with every request of yours and the Total card selected", async () => {
      await open();
      expect(screen.getByRole("tab", { name: "Entries" }).getAttribute("aria-selected")).toBe("true");
      expect(rows()).toHaveLength(5);
      const total = screen.getByRole("button", { name: /Total/ });
      expect(total.getAttribute("aria-pressed")).toBe("true");
      expect(service.requests).toHaveBeenCalledWith("mine");
    });

    it("filters by clicking a KPI card", async () => {
      const user = await open();
      const pending = screen.getByRole("button", { name: /Pending/ });
      await user.click(pending);
      expect(pending.getAttribute("aria-pressed")).toBe("true");
      expect(rows()).toHaveLength(3);
      expect((screen.getByLabelText("Filter requests by status") as HTMLSelectElement).value).toBe(
        "PENDING",
      );
    });

    it("narrows by search, then company, then status", async () => {
      const user = await open();
      await user.type(screen.getByLabelText("Search requests"), "xyz");
      expect(rows()).toHaveLength(1);
      await user.clear(screen.getByLabelText("Search requests"));

      await user.selectOptions(screen.getByLabelText("Filter requests by company"), "OIL");
      expect(rows()).toHaveLength(3);
      await user.selectOptions(screen.getByLabelText("Filter requests by status"), "REJECTED");
      expect(rows()).toHaveLength(1);
      expect(rows()[0].textContent).toMatch(/AP-2026-0010/);
    });

    it("counts the cards over the company filter, but not the status filter", async () => {
      const user = await open();
      await user.selectOptions(screen.getByLabelText("Filter requests by company"), "OIL");
      await user.selectOptions(screen.getByLabelText("Filter requests by status"), "REJECTED");
      // OIL has 2 pending, 0 approved, 1 rejected — still shown while Rejected is selected.
      expect(within(screen.getByRole("button", { name: /Pending/ })).getByText("2")).toBeTruthy();
      expect(within(screen.getByRole("button", { name: /Total/ })).getByText("3")).toBeTruthy();
    });

    it("shows a request's details and where it stands", async () => {
      const user = await open();
      await details(user, "AP-2026-0010");
      expect(screen.getAllByText("Deposit terms not yet signed — resubmit with the agreement.").length).toBeGreaterThan(0);
      await user.click(screen.getByRole("button", { name: "Back to entries" }));
      expect(rows()).toHaveLength(5);
    });

    it("says which stage a pending request waits at, and on whom", async () => {
      const user = await open();
      await details(user, "AP-2026-0012"); // at HOD
      expect(screen.getByText(/Waiting at HOD Approval \(Navdeep Singh\)/)).toBeTruthy();
      // Approved at Sub-HOD already, so it is no longer the creator's to change.
      expect(screen.queryByRole("button", { name: "Edit Request" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Cancel Request" })).toBeNull();
    });

    it("lists a submitted request as Pending, at the top", async () => {
      const user = await open();
      await user.click(screen.getByRole("tab", { name: /New Request/ }));
      await start(user, "VENDOR", "Against Bill");
      await pick(user, /^Business Partner/, /ABC Technologies/);
      // A vendor request has no plain Amount any more — the figure comes from
      // the bill lines, which is the only way a vendor advance is raised now.
      await waitForBills();
      await tick(user, /^Bills/, /10256/);
      await user.type(field(/^Payment amount for 10256/), "25000");
      await pick(user, /^Department/, /Finance/);
      await pick(user, /^Sub-department/, /^AP$/);
      await pick(user, /^Payment Purpose \(Budget\)/, /Back Office/);
      await pick(user, /^Payment Purpose \(Sub Budget\)/, /^Accounts/);
      await pick(user, /^Ownership/, /Arvinder/);
      await user.type(field(/^Payment Date/), "2026-10-01");
      await user.type(field(/^Remarks/), "Mobilisation advance");
      await user.click(screen.getByRole("button", { name: "Submit Request" }));

      expect(await screen.findByText(/AP-2026-0015 raised for ₹25,000 — it is now waiting at Sub-HOD Approval/)).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Entries" }).getAttribute("aria-selected")).toBe("true");
      await screen.findByRole("button", { name: "Details AP-2026-0015" });
      expect(rows()[0].textContent).toMatch(/AP-2026-0015.*Tester.*ABC Technologies.*Pending/);

      // What went to the server: the form, in the API's words.
      const [input] = vi.mocked(advancePaymentService.createRequest).mock.calls[0];
      expect(input).toMatchObject({
        company: "OIL",
        request_type: "VENDOR",
        payment_against: "AGAINST_BILL",
        partner_code: "VENDA000101",
        amount: "25000",
        department_id: 35,
        sub_department_id: 92,
        owner_label: "Arvinder (JWPL0115)",
        payment_date: "2026-10-01",
        budget_code: "BackOff",
        sub_budget_code: "Accounts",
        // The bill goes with what its attachment was read to say.
        documents: [
          expect.objectContaining({
            kind: "BILL", sap_doc_entry: 10256, amount: "25000", mode: "FIXED", attachment_check: READING,
          }),
        ],
      });
    });

    it("shows the server's refusal above the buttons, and keeps the form", async () => {
      const user = await open();
      await user.click(screen.getByRole("tab", { name: /New Request/ }));
      await start(user, "EMPLOYEE_ADVANCE", "Other");
      server.refuseNext = {
        status: 409,
        message: 'Module "ADVANCE_PAYMENT" is not registered with the workflow engine.',
      };
      await answer(user, /^Payment Against/, "Tools");
      await pick(user, /^Employee/, /RAVINDER SINGH SHUNTY/);
      await user.type(field(/^Amount/), "5000");
      await pick(user, /^Department/, /Cyber Security/);
      await pick(user, /^Payment Purpose \(Budget\)/, /Back Office/);
      await pick(user, /^Payment Purpose \(Sub Budget\)/, /^Accounts/);
      await pick(user, /^Ownership/, /Arvinder/);
      await user.type(field(/^Payment Date/), "2026-10-01");
      await user.type(field(/^Remarks/), "Tools for the site");
      await user.click(screen.getByRole("button", { name: "Submit Request" }));

      expect(await screen.findByText(/not registered with the workflow engine/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Submit Request" })).toBeTruthy();
    });

    it("edits a request no one has approved yet", async () => {
      server.addOwn(apiRequest(20, {
        request_type: "EMPLOYEE_ADVANCE",
        payment_against: "OTHER",
        payment_against_other: "Tools",
        partner_code: "1113035",
        partner_name: "RAVINDER SINGH SHUNTY",
        amount: "5000",
        department: { id: 40, name: "Cyber Security" },
        sub_department: null,
        owner_label: "Arvinder (JWPL0115)",
        payment_date: "2026-10-01",
        remarks: "Tools for the site",
        created_on: "2026-09-23T12:00:00+05:30",
      }));
      const user = await open();
      await details(user, "AP-2026-0020");
      await user.click(screen.getByRole("button", { name: "Edit Request" }));
      expect(field(/^Amount/).value).toBe("5000");
      await user.clear(field(/^Amount/));
      await user.type(field(/^Amount/), "6000");
      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      expect(await screen.findByText("Changes saved.")).toBeTruthy();
      const [id, input, options] = vi.mocked(advancePaymentService.editRequest).mock.calls[0];
      expect(id).toBe(20);
      expect(input).toMatchObject({ amount: "6000", department_id: 40, sub_department_id: null });
      expect(options).toMatchObject({ resubmit: false, removeFileIds: [] });
    });

    it("a returned request says why, and saving it resubmits it", async () => {
      server.addOwn(apiRequest(21, {
        status: "RETURNED",
        request_type: "EMPLOYEE_ADVANCE",
        payment_against: "OTHER",
        payment_against_other: "Tools",
        partner_code: "1113035",
        partner_name: "RAVINDER SINGH SHUNTY",
        amount: "5000",
        department: { id: 40, name: "Cyber Security" },
        sub_department: null,
        owner_label: "Arvinder (JWPL0115)",
        payment_date: "2026-10-01",
        remarks: "Tools for the site",
        created_on: "2026-09-23T12:00:00+05:30",
        last_decision: {
          id: 5, action: "RETURNED", label: "Returned to creator", cycle: 1, stage_name: "HOD Approval",
          actor: { id: 7, name: "Navdeep Singh", username: "navdeep" }, on_behalf_of: null,
          from_status: "IN_APPROVAL", to_status: "RETURNED", remarks: "Attach the quotation",
          data: null, created_on: "2026-09-23T13:00:00+05:30",
        },
      }), -1);
      const user = await open();
      await details(user, "AP-2026-0021");
      expect(screen.getByText(/Returned to you by Navdeep Singh/)).toBeTruthy();
      expect(screen.getByText(/Attach the quotation — edit the request and resubmit it/)).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "Edit Request" }));
      await user.click(screen.getByRole("button", { name: "Save & Resubmit" }));
      expect(await screen.findByText(/Resubmitted — now waiting at Sub-HOD Approval/)).toBeTruthy();
      expect(vi.mocked(advancePaymentService.editRequest).mock.calls[0][2]).toMatchObject({ resubmit: true });
    });

    it("cancels a request no one has approved yet", async () => {
      server.addOwn(apiRequest(22, { amount: "24500", created_on: "2026-09-23T12:00:00+05:30" }));
      const user = await open();
      await details(user, "AP-2026-0022");
      await user.click(screen.getByRole("button", { name: "Cancel Request" }));
      await user.type(field(/^Reason/), "Raised twice");
      const confirm = screen.getAllByRole("button", { name: "Cancel Request" }).at(-1)!;
      await user.click(confirm);
      expect(await screen.findByText("Request cancelled.")).toBeTruthy();
      expect(advancePaymentService.act).toHaveBeenCalledWith(22, "cancel", "Raised twice", expect.any(Number));
      expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: "Edit Request" })).toBeNull();
    });
  });
});
