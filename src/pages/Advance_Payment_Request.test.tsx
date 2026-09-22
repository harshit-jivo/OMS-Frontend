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
import { beforeEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService } from "../services/advancePaymentService";
import { resetRequests } from "./advancePayments/requestStore";
import { renderPage } from "../test/renderPage";
import Advance_Payment_Request from "./Advance_Payment_Request";
import {
  SAP_EMPLOYEES,
  SAP_OPEN_INVOICES,
  SAP_VENDORS,
} from "./advancePayments/testData";

vi.mock("../services/advancePaymentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/advancePaymentService")>();
  return {
    ...actual,
    advancePaymentService: {
      vendors: vi.fn(),
      employees: vi.fn(),
      openVendorInvoices: vi.fn(),
    },
  };
});

const service = vi.mocked(advancePaymentService);

beforeEach(() => {
  // The request list is one in-memory store shared by both pages.
  resetRequests();
  service.vendors.mockReset().mockImplementation(async (_company, search = "") =>
    SAP_VENDORS.filter((v) =>
      `${v.card_name} ${v.card_code}`.toUpperCase().includes(search.toUpperCase()),
    ),
  );
  service.employees.mockReset().mockImplementation(async () => SAP_EMPLOYEES);
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

async function usePercent(user: User, doc: string) {
  const mode = screen.getByRole("radiogroup", { name: `Payment mode for ${doc}` });
  await user.click(within(mode).getByRole("radio", { name: "Percentage" }));
}

/** Waits for the bill list to load before ticking — it is fetched per vendor. */
async function waitForBills() {
  await screen.findByText("Select Bills");
}

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
      "Employee Advance",
      "Employee Imprest",
    ]);
  });

  it("asks Ownership as free text, and no longer asks Department", async () => {
    const user = await setup();
    const ownership = field(/^Ownership/);
    await user.type(ownership, "Finance desk");
    expect(ownership.value).toBe("Finance desk");
    expect(screen.queryByLabelText(/^Department/)).toBeNull();
  });

  describe("typing your own answer instead of choosing Other", () => {
    it("offers the listed answers without an Other entry — Against PO and All for vendors only", async () => {
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
      expect(await listed()).toEqual(["Advance", "Against Bill", "Against PO", "All"]);

      await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_ADVANCE");
      expect(await listed()).toEqual(["Advance"]);
    });

    it("takes a typed Payment Against as the requester's own, with a plain amount", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Security deposit");
      expect(field(/^Payment Against/).value).toBe("Security deposit");
      expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
      expect(heading("Reference Details")).toBeNull();
    });

    it("offers the typed text as a choice while it is being typed", async () => {
      const user = await setup();
      await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
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
      await start(user, "VENDOR", "Advance", "");
      expect(screen.getByLabelText(/^Business Partner/).hasAttribute("disabled")).toBe(true);
      expect(screen.getByText(/Pick a company first/)).toBeTruthy();
      expect(service.vendors).not.toHaveBeenCalled();
    });

    it("lists the company's vendors from SAP", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Advance");
      const vendors = await openOptions(user, /^Business Partner/);
      // Vendors only — VENDA codes. The ORGV imprest accounts in the same SAP
      // list are not offered, and a vendor NAMED "ORGV…" still is.
      expect(vendors).toHaveLength(5);
      expect(vendors.join(" ")).toMatch(/ABC Technologies.*VENDA000101/);
      expect(vendors.join(" ")).toMatch(/ORGVALE LOGISTICS/);
      expect(vendors.join(" ")).not.toMatch(/IMPREST/);
      // Nothing typed: search for the prefix, over the server's full page.
      expect(service.vendors).toHaveBeenCalledWith("OIL", "VENDA", 500);
      expect(screen.getByText(/codes starting VENDA/)).toBeTruthy();
      expect(screen.getByText(/Live from SAP/)).toBeTruthy();
    });

    it("searches SAP as the requester types", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Advance");
      await user.click(screen.getByLabelText(/^Business Partner/));
      await user.type(await screen.findByPlaceholderText("Search name or code…"), "xyz");
      await vi.waitFor(() => expect(service.vendors).toHaveBeenCalledWith("OIL", "xyz", 500));
    });

    it("clears the vendor when the company changes — each company is its own SAP", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Advance");
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
      await start(user, "VENDOR", "Advance");
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

      await usePercent(user, "10256");
      const percent = field(/^Payment percentage for 10256/);
      await user.type(percent, "65");
      const noteId = percent.getAttribute("aria-describedby")!;
      expect(document.getElementById(noteId)?.textContent).toBe("= ₹97,500"); // 65% of OPEN

      await user.type(field(/^Payment amount for 10271/), "40000");
      expect(within(total()).getByText("₹1,37,500")).toBeTruthy();
    });

    it("refuses a line above its bill's open amount", async () => {
      const user = await setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /10256/);
      await user.type(field(/^Payment amount for 10256/), "180000");
      expect(screen.getByText(/Cannot exceed the open amount of ₹1,50,000/)).toBeTruthy();
    });

    it("picks a quick percentage from the % sign", async () => {
      const user = await setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /10256/);
      await usePercent(user, "10256");
      await user.selectOptions(screen.getByLabelText("Quick percentage for 10256"), "50");
      expect(within(total()).getByText("₹75,000")).toBeTruthy(); // half of what is OPEN
    });

    it("expands a row to show the bill's SAP details", async () => {
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

  it("Vendor → Advance is a plain amount, with no Advance Against question", async () => {
    const user = await setup();
    await start(user, "VENDOR", "Advance");
    expect(screen.queryByLabelText(/^Advance Against/)).toBeNull();
    expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
    expect(heading("Reference Details")).toBeNull();
  });

  describe("Vendor → Against PO (sample data)", () => {
    it("lists the sample vendors and POs, and asks an Expected Date", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against PO");
      expect(screen.getByLabelText(/^Expected Date/)).toBeTruthy();

      const vendors = await openOptions(user, /^Business Partner/);
      expect(vendors.join(" ")).toMatch(/ABC Technologies.*XYZ Traders.*Metro Print/);
      expect(vendors).toHaveLength(3);
      // Said under the partner AND on the POs section — both are sample data.
      expect(screen.getAllByText(/Sample data — not yet connected to SAP/).length).toBeGreaterThan(0);
      await user.click(await screen.findByRole("option", { name: /XYZ Traders/ }));

      const pos = await openChecklist(user, /^Purchase Orders/);
      expect(pos.map((p) => p.slice(0, 7))).toEqual(["PO-4512", "PO-4519"]);

      await tick(user, /^Purchase Orders/, /PO-4512/, /PO-4519/);
      await usePercent(user, "PO-4512");
      await user.selectOptions(screen.getByLabelText("Quick percentage for PO-4512"), "10");
      await user.type(field(/^Payment amount for PO-4519/), "6500");
      expect(within(total()).getByText("₹24,500")).toBeTruthy(); // ₹18,000 + ₹6,500
      expect(service.openVendorInvoices).not.toHaveBeenCalled();
    });

    it("leaving Against PO clears the POs and the Expected Date", async () => {
      const user = await setup();
      await start(user, "VENDOR", "Against PO");
      await user.type(field(/^Expected Date/), "2026-10-20");

      await answer(user, /^Payment Against/, "Advance");
      expect(heading("Reference Details")).toBeNull();
      expect(screen.queryByLabelText(/^Expected Date/)).toBeNull();

      await answer(user, /^Payment Against/, "Against PO");
      expect(field(/^Expected Date/).value).toBe("");
    });
  });

  describe("Vendor → All (sample data)", () => {
    it("shows the vendor's other documents with their kind, and totals them", async () => {
      const user = await setup();
      await start(user, "VENDOR", "All");
      await pick(user, /^Business Partner/, /Gupta Transport/);

      const docs = await openChecklist(user, /^Documents/);
      expect(docs[0]).toMatch(/^WO-3107.*Work Order/);
      expect(docs[1]).toMatch(/^JV-5534.*Journal Voucher/);

      await tick(user, /^Documents/, /WO-3107/, /JV-5534/);
      await usePercent(user, "WO-3107");
      await user.selectOptions(screen.getByLabelText("Quick percentage for WO-3107"), "50");
      await user.type(field(/^Payment amount for JV-5534/), "8200");
      // 50% of WO-3107's ₹80,000 OPEN + ₹8,200.
      expect(within(total()).getByText("₹48,200")).toBeTruthy();
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

    it("shows Amount, Return Method and the expected period — no bill date", async () => {
      const user = await setup();
      await toAdvance(user);
      expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
      expect(screen.getByLabelText(/^Return Method/)).toBeTruthy();
      expect(screen.getByLabelText(/^Expected From Date/)).toBeTruthy();
      expect(screen.getByLabelText(/^Expected To Date/)).toBeTruthy();
      expect(screen.queryByLabelText(/^Expected Bill Date/)).toBeNull();
    });

    it("works out the EMI, and hides it for One Time", async () => {
      const user = await setup();
      await toAdvance(user);
      await user.type(field(/^Amount/), "20000");
      await answer(user, /^Return Method/, "EMI");
      await user.type(field(/^Number of Installments/), "4");
      expect(field(/^EMI Amount/).value).toBe("₹5,000");

      await answer(user, /^Return Method/, "One Time");
      expect(screen.queryByLabelText(/^Number of Installments/)).toBeNull();
    });

    it("refuses an Expected To Date before the From Date", async () => {
      const user = await setup();
      await toAdvance(user);
      await user.type(field(/^Expected From Date/), "2026-10-15");
      await user.type(field(/^Expected To Date/), "2026-10-01");
      expect(screen.getByText("Expected To Date cannot be before Expected From Date.")).toBeTruthy();
    });

    it("drops the repayment fields when Payment Against changes", async () => {
      const user = await setup();
      await toAdvance(user);
      await answer(user, /^Return Method/, "EMI");
      await user.type(field(/^Expected From Date/), "2026-10-01");

      await answer(user, /^Payment Against/, "Uniform allowance");
      expect(screen.queryByLabelText(/^Return Method/)).toBeNull();

      await answer(user, /^Payment Against/, "Advance");
      expect(field(/^Return Method/).value).toBe("");
      expect(field(/^Expected From Date/).value).toBe("");
    });
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

    function open() {
      const user = userEvent.setup();
      renderPage(<Advance_Payment_Request />, { route: "/Advance_Payment_Request" });
      return user;
    }

    it("opens on Entries, with every request and the Total card selected", () => {
      open();
      expect(screen.getByRole("tab", { name: "Entries" }).getAttribute("aria-selected")).toBe("true");
      expect(rows()).toHaveLength(5);
      const total = screen.getByRole("button", { name: /Total/ });
      expect(total.getAttribute("aria-pressed")).toBe("true");
    });

    it("filters by clicking a KPI card", async () => {
      const user = open();
      const pending = screen.getByRole("button", { name: /Pending/ });
      await user.click(pending);
      expect(pending.getAttribute("aria-pressed")).toBe("true");
      expect(rows()).toHaveLength(3);
      expect((screen.getByLabelText("Filter requests by status") as HTMLSelectElement).value).toBe(
        "PENDING",
      );
    });

    it("narrows by search, then company, then status", async () => {
      const user = open();
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
      const user = open();
      await user.selectOptions(screen.getByLabelText("Filter requests by company"), "OIL");
      await user.selectOptions(screen.getByLabelText("Filter requests by status"), "REJECTED");
      // OIL has 2 pending, 0 approved, 1 rejected — still shown while Rejected is selected.
      expect(within(screen.getByRole("button", { name: /Pending/ })).getByText("2")).toBeTruthy();
      expect(within(screen.getByRole("button", { name: /Total/ })).getByText("3")).toBeTruthy();
    });

    it("shows a request's details and where it stands", async () => {
      const user = open();
      await user.click(screen.getByRole("button", { name: "Details AP-2026-0010" }));
      expect(screen.getByRole("heading", { name: "AP-2026-0010" })).toBeTruthy();
      expect(screen.getByText("Deposit terms not yet signed — resubmit with the agreement.")).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Back to entries" }));
      expect(rows()).toHaveLength(5);
    });

    it("lists a submitted request as Pending, at the top", async () => {
      const user = open();
      await user.click(screen.getByRole("tab", { name: /New Request/ }));
      await start(user, "VENDOR", "Advance");
      await pick(user, /^Business Partner/, /ABC Technologies/);
      await user.type(field(/^Amount/), "25000");
      await user.type(field(/^Ownership/), "Finance desk");
      await user.type(field(/^Payment Date/), "2026-10-01");
      await user.type(field(/^Remarks/), "Mobilisation advance");
      await user.click(screen.getByRole("button", { name: "Submit Request" }));

      expect(screen.getByText(/AP-2026-0015 raised for ₹25,000/)).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Entries" }).getAttribute("aria-selected")).toBe("true");
      expect(rows()[0].textContent).toMatch(/AP-2026-0015.*Tester.*ABC Technologies.*Pending/);
    });
  });
});
