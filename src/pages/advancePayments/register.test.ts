import { describe, expect, it } from "vitest";

import type { ApiRequest } from "../../services/advancePaymentService";
import { fromApiRequest } from "./requestApi";
import {
  NO_REGISTER_FILTERS,
  activeFilterCount,
  approverUsernames,
  filterRegister,
  registerOptions,
  whereNow,
} from "./register";
import { apiRequest } from "./testRequests";

const user = (id: number, username: string, name: string) => ({ id, username, name });
const TARAN = user(14, "taran", "Taran");
const HOD = user(20, "bhupinder", "Bhupinder Singh");
const RAVI = user(30, "ravi", "Ravinder Ary");
const NEHA = user(31, "neha", "Neha");

function flow(stage: string, current: ReturnType<typeof user> | null): ApiRequest["flow"] {
  return {
    status: "PENDING", workflow: "AP_X", current_stage: stage, current_role: stage === "Payment Approval" ? "PAYMENT" : "APPROVAL",
    current_user: current, cycle: 1, version: 1, total_stages: 5, awaiting_me: false,
  };
}

const ENTRIES = [
  // At Payment, approved by the HOD: a vendor bill, raised by Ravi on 08 Oct.
  apiRequest(15, {
    partner_code: "VENDA000707", partner_name: "Packster Packaging", payment_against: "AGAINST_BILL",
    created_by: RAVI, created_on: "2026-10-08T11:00:00+05:30",
    flow: flow("Payment Approval", TARAN), approvers: [{ username: HOD.username, name: HOD.name }],
  }),
  // At the HOD, against a PO, Mart, raised by Neha on 01 Oct.
  apiRequest(16, {
    company: "MART", payment_against: "AGAINST_PO", created_by: NEHA, created_on: "2026-10-01T09:00:00+05:30",
    flow: flow("HOD Approval", HOD), approvers: [],
  }),
  // Completed: approved by the HOD and Taran.
  apiRequest(17, {
    status: "COMPLETED", request_type: "EMPLOYEE_ADVANCE", payment_against: "ADVANCE", partner_code: "EMP1",
    partner_name: "Ramesh", created_by: RAVI, created_on: "2026-09-20T09:00:00+05:30",
    approvers: [{ username: HOD.username, name: HOD.name }, { username: TARAN.username, name: TARAN.name }],
  }),
].map(fromApiRequest);

const nos = (filters: Partial<typeof NO_REGISTER_FILTERS>) =>
  filterRegister(ENTRIES, { ...NO_REGISTER_FILTERS, ...filters }).map((e) => e.requestNo);

describe("the all-requests register", () => {
  it("shows everything with no filter", () => {
    expect(nos({})).toEqual(["AP-2026-0015", "AP-2026-0016", "AP-2026-0017"]);
  });

  it("takes several values in one filter, and combines filters", () => {
    expect(nos({ against: ["AGAINST_BILL", "AGAINST_PO"] })).toEqual(["AP-2026-0015", "AP-2026-0016"]);
    expect(nos({ against: ["AGAINST_BILL", "AGAINST_PO"], companies: ["MART"] })).toEqual(["AP-2026-0016"]);
    expect(nos({ statuses: ["PENDING"], creators: ["ravi"] })).toEqual(["AP-2026-0015"]);
    expect(nos({ types: ["EMPLOYEE_ADVANCE"], statuses: ["PENDING"] })).toEqual([]);
  });

  it("filters by desk, vendor and dates", () => {
    expect(nos({ desks: ["Payment Approval"] })).toEqual(["AP-2026-0015"]);
    expect(nos({ partners: ["VENDA000707"] })).toEqual(["AP-2026-0015"]);
    expect(nos({ from: "2026-10-01", to: "2026-10-07" })).toEqual(["AP-2026-0016"]);
    expect(nos({ from: "2026-10-08" })).toEqual(["AP-2026-0015"]);
  });

  it("finds by approver: who decided on it, or whom it waits on now", () => {
    expect(nos({ approvers: ["taran"] })).toEqual(["AP-2026-0015", "AP-2026-0017"]);
    expect(nos({ approvers: ["bhupinder"] })).toEqual(["AP-2026-0015", "AP-2026-0016", "AP-2026-0017"]);
    expect(approverUsernames(ENTRIES[0])).toEqual(["bhupinder", "taran"]);
  });

  it("says where each one is", () => {
    expect(ENTRIES.map(whereNow)).toEqual(["Payment Approval · Taran", "HOD Approval · Bhupinder Singh", "Completed"]);
  });

  it("offers the values the requests carry, and counts what is set", () => {
    const options = registerOptions(ENTRIES);
    expect(options.desks.map((o) => o.value)).toEqual(["HOD Approval", "Payment Approval"]);
    expect(options.approvers.map((o) => o.value)).toEqual(["bhupinder", "taran"]);
    expect(options.creators.map((o) => o.value)).toEqual(["neha", "ravi"]);
    expect(activeFilterCount({ ...NO_REGISTER_FILTERS, statuses: ["PENDING"], from: "2026-10-01" })).toBe(2);
  });
});
