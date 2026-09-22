/**
 * The rendered cascade. `advancePayments/rules.test.ts` pins the rules; this
 * pins that the PAGE follows them — sections appear and vanish with the
 * answers, dropdowns hold only what the rules allow, and the numbers the
 * requester sees are the ones the rules compute.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderPage } from "../test/renderPage";
import Advance_Payment_Request from "./Advance_Payment_Request";

type User = ReturnType<typeof userEvent.setup>;

function setup() {
  const user = userEvent.setup();
  renderPage(<Advance_Payment_Request />, { route: "/Advance_Payment_Request" });
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
  await user.click(screen.getByLabelText(label));
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

describe("Advance Payment Request", () => {
  it("starts with only the sections every case has", () => {
    setup();
    expect(heading("Payment Details")).not.toBeNull();
    expect(heading("Additional Information")).not.toBeNull();
    expect(heading("Attachments")).not.toBeNull();
    expect(heading("Reference Details")).toBeNull();
  });

  it("offers the three types", () => {
    setup();
    const type = screen.getByLabelText(/^Type/) as HTMLSelectElement;
    expect([...type.options].map((o) => o.text)).toEqual([
      "Select Type",
      "Vendor",
      "Employee Advance",
      "Employee Imprest",
    ]);
  });

  it("asks Ownership as free text, and no longer asks Department", async () => {
    const user = setup();
    const ownership = field(/^Ownership/);
    expect(ownership.tagName).toBe("INPUT");
    await user.type(ownership, "Finance desk");
    expect(ownership.value).toBe("Finance desk");
    expect(screen.queryByLabelText(/^Department/)).toBeNull();
  });

  describe("typing your own answer instead of choosing Other", () => {
    it("offers the listed answers without an Other entry — Against PO for vendors only", async () => {
      const user = setup();
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
      const user = setup();
      await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
      await answer(user, /^Payment Against/, "Security deposit");

      expect(field(/^Payment Against/).value).toBe("Security deposit");
      expect(screen.getByLabelText(/^Amount/)).toBeTruthy(); // the Other case
      expect(heading("Reference Details")).toBeNull();
    });

    it("offers the typed text as a choice while it is being typed", async () => {
      const user = setup();
      await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
      await user.type(field(/^Payment Against/), "Rent");
      await user.click(await screen.findByRole("option", { name: "Use “Rent”" }));

      expect(field(/^Payment Against/).value).toBe("Rent");
      expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
    });

    it("reads a typed listed answer as that answer", async () => {
      const user = setup();
      await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
      await answer(user, /^Payment Against/, "against bill");

      expect(field(/^Payment Against/).value).toBe("Against Bill");
      expect(heading("Reference Details")).not.toBeNull();
    });

    it("lets Return Method be typed too", async () => {
      const user = setup();
      await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_ADVANCE");
      await answer(user, /^Payment Against/, "Advance");
      await answer(user, /^Return Method/, "Salary deduction over 2 months");

      expect(field(/^Return Method/).value).toBe("Salary deduction over 2 months");
      expect(screen.queryByLabelText(/^Number of Installments/)).toBeNull();
    });
  });

  describe("Vendor → Against Bill", () => {
    async function toAbcBills(user: User) {
      await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
      await answer(user, /^Payment Against/, "Against Bill");
      await pick(user, /^Business Partner/, /ABC Technologies/);
    }

    it("lists only vendors that have open bills", async () => {
      const user = setup();
      await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
      await answer(user, /^Payment Against/, "Against Bill");
      const vendors = await openOptions(user, /^Business Partner/);
      expect(vendors).toHaveLength(3);
      expect(vendors.join(" ")).toMatch(/ABC Technologies.*XYZ Traders.*PQR Suppliers/);
    });

    it("offers the chosen vendor's bills as checkboxes, and only theirs", async () => {
      const user = setup();
      await toAbcBills(user);
      const bills = await openChecklist(user, /^Bills/);
      expect(bills).toHaveLength(2);
      expect(bills[0]).toMatch(/^AP-INV-10256/);
      expect(bills[1]).toMatch(/^AP-INV-10271/);
    });

    it("shows each bill's payment inside its amount box, and totals the lines", async () => {
      const user = setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /AP-INV-10256/, /AP-INV-10271/);

      expect(heading("Selected Bills (2)")).not.toBeNull();

      await usePercent(user, "AP-INV-10256");
      const percent = field(/^Payment percentage for AP-INV-10256/);
      await user.type(percent, "65");
      // The rupee figure is described BY the input it belongs to.
      const noteId = percent.getAttribute("aria-describedby")!;
      expect(document.getElementById(noteId)?.textContent).toBe("= ₹97,500"); // 65% of OPEN

      await user.type(field(/^Payment amount for AP-INV-10271/), "40000");
      expect(within(total()).getByText("₹1,37,500")).toBeTruthy();
    });

    it("has no separate Payment Amount column", async () => {
      const user = setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /AP-INV-10256/);
      const headings = screen.getByText("Amount / %").parentElement!;
      expect([...headings.children].map((cell) => cell.textContent)).toEqual([
        "Bill Number",
        "Open Amount",
        "Payment Mode",
        "Amount / %",
        "",
      ]);
    });

    it("refuses a line above its bill's open amount", async () => {
      const user = setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /AP-INV-10256/);
      await user.type(field(/^Payment amount for AP-INV-10256/), "180000");

      expect(screen.getByText(/Cannot exceed the open amount of ₹1,50,000/)).toBeTruthy();
      expect(within(total()).getByText("₹0")).toBeTruthy();
    });

    it("picks a quick percentage from the % sign", async () => {
      const user = setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /AP-INV-10256/);
      await usePercent(user, "AP-INV-10256");
      await user.selectOptions(screen.getByLabelText("Quick percentage for AP-INV-10256"), "50");

      expect(field(/^Payment percentage for AP-INV-10256/).value).toBe("50");
      expect(within(total()).getByText("₹75,000")).toBeTruthy(); // half of what is OPEN
    });

    it("expands a row to show the bill's details, and folds it away again", async () => {
      const user = setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /AP-INV-10256/);

      const row = screen.getByRole("button", { name: /^AP-INV-10256/ });
      expect(row.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByText("₹2,50,000")).toBeNull();

      await user.click(row);
      expect(row.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByText("₹2,50,000")).toBeTruthy(); // original
      expect(screen.getByText("₹1,00,000")).toBeTruthy(); // paid

      await user.click(row);
      expect(screen.queryByText("₹2,50,000")).toBeNull();
    });

    it("deletes one row with the trash button and leaves the others as they were", async () => {
      const user = setup();
      await toAbcBills(user);
      await tick(user, /^Bills/, /AP-INV-10256/, /AP-INV-10271/);
      await user.type(field(/^Payment amount for AP-INV-10271/), "40000");

      await user.click(screen.getByRole("button", { name: "Delete AP-INV-10256" }));

      expect(heading("Selected Bills (1)")).not.toBeNull();
      expect(screen.queryByLabelText(/^Payment amount for AP-INV-10256/)).toBeNull();
      expect(field(/^Payment amount for AP-INV-10271/).value).toBe("40000");
      expect(within(total()).getByText("₹40,000")).toBeTruthy();
    });
  });

  it("Vendor → Advance is a plain amount, with no Advance Against question", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
    await answer(user, /^Payment Against/, "Advance");

    expect(screen.queryByLabelText(/^Advance Against/)).toBeNull();
    expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
    expect(heading("Reference Details")).toBeNull();
    expect(screen.queryByLabelText(/^Expected Date/)).toBeNull();
  });

  describe("Vendor → Against PO", () => {
    it("filters vendors and POs, and asks an Expected Date", async () => {
      const user = setup();
      await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
      await answer(user, /^Payment Against/, "Against PO");

      expect(screen.getByLabelText(/^Expected Date/)).toBeTruthy();

      const vendors = await openOptions(user, /^Business Partner/);
      expect(vendors.join(" ")).toMatch(/ABC Technologies.*XYZ Traders.*Metro Print/);
      expect(vendors).toHaveLength(3);
      expect(screen.getByText("Only business partners with an open PO are listed.")).toBeTruthy();
      await user.click(await screen.findByRole("option", { name: /XYZ Traders/ }));

      const pos = await openChecklist(user, /^Purchase Orders/);
      expect(pos.map((p) => p.slice(0, 7))).toEqual(["PO-4512", "PO-4519"]);

      await tick(user, /^Purchase Orders/, /PO-4512/, /PO-4519/);
      expect(heading("Selected Purchase Orders (2)")).not.toBeNull();

      await usePercent(user, "PO-4512");
      await user.selectOptions(screen.getByLabelText("Quick percentage for PO-4512"), "10");
      await user.type(field(/^Payment amount for PO-4519/), "6500");
      expect(within(total()).getByText("₹24,500")).toBeTruthy(); // ₹18,000 + ₹6,500
    });

    it("leaving Against PO clears the POs and the Expected Date", async () => {
      const user = setup();
      await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
      await answer(user, /^Payment Against/, "Against PO");
      await user.type(field(/^Expected Date/), "2026-10-20");

      await answer(user, /^Payment Against/, "Advance");
      expect(heading("Reference Details")).toBeNull();
      expect(screen.queryByLabelText(/^Expected Date/)).toBeNull();

      // Back to Against PO: the date did not survive being hidden.
      await answer(user, /^Payment Against/, "Against PO");
      expect(field(/^Expected Date/).value).toBe("");
    });
  });

  it("Vendor → a typed Payment Against shows a plain amount and no document sections", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
    await answer(user, /^Payment Against/, "Freight charges");

    expect(heading("Reference Details")).toBeNull();
    expect(screen.queryByLabelText(/^Advance Against/)).toBeNull();
    expect(screen.queryByLabelText(/^Expected Date/)).toBeNull();
    expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
  });

  describe("Employee Advance → Advance", () => {
    async function toAdvance(user: User) {
      await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_ADVANCE");
      await answer(user, /^Payment Against/, "Advance");
    }

    it("shows Employee, Amount, Return Method and the expected period — no bill date", async () => {
      const user = setup();
      await toAdvance(user);

      expect(screen.getByLabelText(/^Employee/)).toBeTruthy();
      expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
      expect(screen.getByLabelText(/^Return Method/)).toBeTruthy();
      expect(screen.getByLabelText(/^Expected From Date/)).toBeTruthy();
      expect(screen.getByLabelText(/^Expected To Date/)).toBeTruthy();
      expect(screen.queryByLabelText(/^Expected Bill Date/)).toBeNull();
      expect(heading("Reference Details")).toBeNull();
    });

    it("works out the EMI, and hides it for One Time", async () => {
      const user = setup();
      await toAdvance(user);
      await user.type(field(/^Amount/), "20000");
      await answer(user, /^Return Method/, "EMI");
      await user.type(field(/^Number of Installments/), "4");

      expect(field(/^EMI Amount/).value).toBe("₹5,000");

      await answer(user, /^Return Method/, "One Time");
      expect(screen.queryByLabelText(/^Number of Installments/)).toBeNull();
      expect(screen.queryByLabelText(/^EMI Amount/)).toBeNull();

      // Back to EMI: the old count did not survive being hidden.
      await answer(user, /^Return Method/, "EMI");
      expect(field(/^Number of Installments/).value).toBe("");
    });

    it("refuses an Expected To Date before the From Date", async () => {
      const user = setup();
      await toAdvance(user);
      await user.type(field(/^Expected From Date/), "2026-10-15");
      await user.type(field(/^Expected To Date/), "2026-10-01");

      expect(screen.getByText("Expected To Date cannot be before Expected From Date.")).toBeTruthy();
    });

    it("drops the repayment fields when Payment Against changes", async () => {
      const user = setup();
      await toAdvance(user);
      await answer(user, /^Return Method/, "EMI");
      await user.type(field(/^Expected From Date/), "2026-10-01");

      await answer(user, /^Payment Against/, "Uniform allowance");
      expect(screen.queryByLabelText(/^Return Method/)).toBeNull();
      expect(screen.queryByLabelText(/^Expected From Date/)).toBeNull();

      await answer(user, /^Payment Against/, "Advance");
      expect(field(/^Return Method/).value).toBe("");
      expect(field(/^Expected From Date/).value).toBe("");
    });
  });

  it("Employee Advance has no Against Bill — typing it is taken as the requester's own answer", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_ADVANCE");
    await answer(user, /^Payment Against/, "Against Bill");

    expect(heading("Reference Details")).toBeNull();
    expect(screen.queryByLabelText(/^Bills/)).toBeNull();
    expect(screen.getByLabelText(/^Amount/)).toBeTruthy(); // the plain "other" case
  });

  describe("Vendor → All", () => {
    async function toGuptaAll(user: User) {
      await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
      await answer(user, /^Payment Against/, "All");
      await pick(user, /^Business Partner/, /Gupta Transport/);
    }

    it("lists only vendors with other open documents", async () => {
      const user = setup();
      await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
      await answer(user, /^Payment Against/, "All");
      const vendors = await openOptions(user, /^Business Partner/);
      expect(vendors).toHaveLength(4);
      expect(vendors.join(" ")).toMatch(/ABC.*XYZ.*Shree Packaging.*Gupta Transport/);
      expect(vendors.join(" ")).not.toMatch(/PQR|Metro Print/);
    });

    it("shows the vendor's other documents, with their kind — never bills or POs", async () => {
      const user = setup();
      await toGuptaAll(user);
      expect(
        screen.getByText(/Bills and POs have their own options\./),
      ).toBeTruthy();

      const docs = await openChecklist(user, /^Documents/);
      expect(docs).toHaveLength(2);
      expect(docs[0]).toMatch(/^WO-3107.*Work Order/);
      expect(docs[1]).toMatch(/^JV-5534.*Journal Voucher/);
      expect(docs.join(" ")).not.toMatch(/AP-INV|PO-/);
    });

    it("pays each document from its open amount and totals them", async () => {
      const user = setup();
      await toGuptaAll(user);
      await tick(user, /^Documents/, /WO-3107/, /JV-5534/);
      expect(heading("Selected Documents (2)")).not.toBeNull();

      await usePercent(user, "WO-3107");
      await user.selectOptions(screen.getByLabelText("Quick percentage for WO-3107"), "50");
      await user.type(field(/^Payment amount for JV-5534/), "8200");

      // 50% of WO-3107's ₹80,000 OPEN (not its ₹1,20,000 original) + ₹8,200.
      expect(within(total()).getByText("₹48,200")).toBeTruthy();
    });
  });

  it("Employee Advance → a typed Payment Against shows only the plain amount", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_ADVANCE");
    await answer(user, /^Payment Against/, "Festival advance");

    expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
    expect(heading("Reference Details")).toBeNull();
    expect(screen.queryByLabelText(/^Return Method/)).toBeNull();
    expect(screen.queryByLabelText(/^Expected From Date/)).toBeNull();
    expect(screen.queryByLabelText(/^Expected Bill Date/)).toBeNull();
  });

  it("Employee Imprest shows Expected Bill Date, keeps it across Payment Against, drops it with the type", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_IMPREST");
    await answer(user, /^Payment Against/, "Advance");
    expect(heading("Reference Details")).toBeNull();
    expect(screen.queryByLabelText(/^Return Method/)).toBeNull();

    await user.type(field(/^Expected Bill Date/), "2026-10-05");

    for (const against of ["Against Bill", "Site petty cash"]) {
      await answer(user, /^Payment Against/, against);
      expect(field(/^Expected Bill Date/).value, against).toBe("2026-10-05");
    }

    await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_ADVANCE");
    await answer(user, /^Payment Against/, "Petty cash");
    expect(screen.queryByLabelText(/^Expected Bill Date/)).toBeNull();

    await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_IMPREST");
    await answer(user, /^Payment Against/, "Advance");
    expect(field(/^Expected Bill Date/).value).toBe("");
  });

  it("changing Type clears the partner, the bills and every row", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText(/^Type/), "VENDOR");
    await answer(user, /^Payment Against/, "Against Bill");
    await pick(user, /^Business Partner/, /ABC Technologies/);
    await tick(user, /^Bills/, /AP-INV-10256/);
    expect(heading("Selected Bills (1)")).not.toBeNull();

    await user.selectOptions(screen.getByLabelText(/^Type/), "EMPLOYEE_ADVANCE");

    expect(field(/^Payment Against/).value).toBe("");
    expect(screen.getByLabelText(/^Employee/).textContent).toMatch(/Select Employee/);
    expect(heading("Reference Details")).toBeNull();
    expect(heading(/^Selected Bills/)).toBeNull();
  });
});
