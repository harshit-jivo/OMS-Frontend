import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService, type MasterEmployee } from "../../services/advancePaymentService";
import { renderPage } from "../../test/renderPage";
import Add_Employee from "./Add_Employee";

const employee = (over: Partial<MasterEmployee>): MasterEmployee => ({
  id: 1,
  employee_id: 1,
  employee_code: "JWPL0115",
  employee_name: "Arvinder",
  email: null,
  phone: null,
  designation: null,
  role: 1,
  role_label: "HOD",
  gender: "M",
  is_active: true,
  created_on: "2026-09-24T10:00:00+05:30",
  ...over,
});

vi.mock("../../services/advancePaymentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/advancePaymentService")>();
  return {
    ...actual,
    advancePaymentService: {
      masterEmployees: vi.fn(),
      addMasterEmployee: vi.fn(),
    },
  };
});

const service = vi.mocked(advancePaymentService);

beforeEach(() => {
  service.masterEmployees.mockReset().mockResolvedValue([
    employee({}),
    employee({ id: 2, employee_code: "JWPL2846", employee_name: "Prabhdit Singh", role: 3, role_label: "Executive" }),
  ]);
  service.addMasterEmployee.mockReset();
});

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

describe("Add Employee", () => {
  it("lists the employees already in the master", async () => {
    renderPage(<Add_Employee />, { route: "/Add_Employee" });
    expect(await screen.findByText("Prabhdit Singh")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Employees (2)" })).toBeTruthy();
  });

  it("adds an employee with their role, and clears the form", async () => {
    const user = userEvent.setup();
    service.addMasterEmployee.mockResolvedValue(
      employee({ id: 3, employee_id: null, employee_code: "JWPL3100", employee_name: "Asha Rani", role: 2, role_label: "Sub-HOD" }),
    );
    renderPage(<Add_Employee />, { route: "/Add_Employee" });

    const add = screen.getByRole("button", { name: "Add Employee" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true); // code and name are required

    await user.type(field(/^Employee Code/), "jwpl3100");
    expect(field(/^Employee Code/).value).toBe("JWPL3100"); // upper-cased as typed
    await user.type(field(/^Employee Name/), "Asha Rani");
    await user.selectOptions(field(/^Role/), "2");
    await user.type(field(/^Phone/), "9811122334");
    await user.click(add);

    expect(service.addMasterEmployee).toHaveBeenCalledWith({
      employee_code: "JWPL3100",
      employee_name: "Asha Rani",
      role: 2,
      designation: null,
      email: null,
      phone: "9811122334",
      gender: null,
      employee_id: null,
      is_active: true,
    });
    expect(await screen.findByText(/JWPL3100 Asha Rani \(Sub-HOD\) is in the employee master/)).toBeTruthy();
    expect(field(/^Employee Code/).value).toBe("");
  });

  it("shows the server's reason next to the field it is about", async () => {
    const user = userEvent.setup();
    service.addMasterEmployee.mockRejectedValue({
      response: {
        status: 400,
        data: {
          message: "Employee code JWPL0115 already exists.",
          errors: { employee_code: ["Employee code JWPL0115 already exists."] },
        },
      },
    });
    renderPage(<Add_Employee />, { route: "/Add_Employee" });
    await user.type(field(/^Employee Code/), "JWPL0115");
    await user.type(field(/^Employee Name/), "Someone");
    await user.click(screen.getByRole("button", { name: "Add Employee" }));

    expect(await screen.findByText("Employee code JWPL0115 already exists.")).toBeTruthy();
  });

  it("searches the list by code or name", async () => {
    const user = userEvent.setup();
    renderPage(<Add_Employee />, { route: "/Add_Employee" });
    await screen.findByText("Prabhdit Singh");
    await user.type(field(/^Search/), "2846");
    const table = screen.getByRole("table");
    expect(within(table).queryByText("Arvinder")).toBeNull();
    expect(within(table).getByText("Prabhdit Singh")).toBeTruthy();
  });
});
