/**
 * TEST ONLY: payment requests as the server returns them, and a small
 * in-memory stand-in for `/advance-payments/requests/`.
 *
 * The fake follows the server's route rules closely enough for the pages to
 * be driven through them — the stage a request waits at, whose it is, what
 * each stage may do, Payment's details, completion — without re-implementing
 * the server's checks, which `advance_payment/tests_requests.py` holds.
 * "Tester" (user 1, the test session) holds the stages named in `mine`.
 */
import type {
  ApiPayout,
  ApiRequest,
  ApiRequestDocument,
  ApiRequestInput,
  ApiRequestLog,
  ApiStage,
  RequestAbilities,
  StageAction,
  StageRole,
} from "../../services/advancePaymentService";

export const TESTER = { id: 1, name: "Tester", username: "tester" };
const OTHER = { id: 7, name: "Navdeep Singh", username: "navdeep" };

const ROLES: Array<[StageRole, string]> = [
  ["APPROVAL", "Sub-HOD Approval"],
  ["APPROVAL", "HOD Approval"],
  ["APPROVAL", "Director Approval"],
  ["PAYMENT", "Payment Approval"],
  ["AUDIT", "Audit Approval"],
  ["FINAL", "Final Approval"],
];

const NO_ABILITIES: RequestAbilities = {
  edit: false,
  cancel: false,
  resubmit: false,
  approve: false,
  reject: false,
  return_to_creator: false,
  send_back: false,
  edit_payout: false,
  record_utr: false,
  see_account: false,
};

/** A request's own settings in the fake, beside its API shape. */
interface Held {
  api: ApiRequest;
  /** Which stages are Tester's, by name. */
  mine: string[];
  /** Index into ROLES of the stage it waits at; -1 when it waits nowhere. */
  at: number;
  approvedThisRound: boolean;
}

export function bill(entry: number, open: string, amount: string, extra: Partial<ApiRequestDocument> = {}): ApiRequestDocument {
  return {
    kind: "BILL",
    sap_doc_entry: entry,
    sap_doc_num: String(entry),
    vendor_ref: "",
    doc_date: "2026-08-04",
    due_date: null,
    original_amount: open,
    paid_amount: "0",
    open_amount: open,
    mode: "FIXED",
    percentage: null,
    amount,
    attachment_file: "",
    attachment_count: 0,
    attachment_date: null,
    ...extra,
  };
}

let nextLogId = 100;

const DECISIONS = new Set(["APPROVED", "REJECTED", "RETURNED", "SENT_BACK"]);
const ACCOUNT_STAGES = new Set(["Payment Approval", "Audit Approval", "Final Approval"]);
const ACCOUNT_LOGS = new Set(["PAYOUT_UPDATED", "UTR_RECORDED", "PARTNER_LINKED"]);
const mask = (n: string | null | undefined) => (n ? "X".repeat(Math.max(n.length - 4, 0)) + n.slice(-4) : null);

export function logRow(action: string, label: string, extra: Partial<ApiRequestLog> = {}): ApiRequestLog {
  nextLogId += 1;
  return {
    id: nextLogId,
    action,
    label,
    cycle: 1,
    stage_name: "",
    actor: TESTER,
    on_behalf_of: null,
    from_status: "",
    to_status: "",
    remarks: "",
    data: null,
    created_on: "2026-09-22T11:00:00+05:30",
    ...extra,
  };
}

/** A request as `GET /requests/<id>/` answers, with sensible defaults. */
export function apiRequest(id: number, fields: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id,
    request_no: `AP-2026-${String(id).padStart(4, "0")}`,
    company: "OIL",
    request_type: "VENDOR",
    payment_against: "AGAINST_BILL",
    payment_against_other: "",
    department: { id: 35, name: "Finance" },
    sub_department: { id: 92, name: "AP" },
    partner_code: "VENDA000101",
    partner_name: "ABC Technologies",
    partner_not_in_sap: false,
    amount: "0",
    currency: "INR",
    expected_date: null,
    expected_bill_date: null,
    return_method: "",
    return_method_other: "",
    installments: null,
    emi_amount: null,
    expected_from_date: null,
    expected_to_date: null,
    payment_date: "2026-09-25",
    priority: "MEDIUM",
    remarks: "",
    owner_label: "Procurement — Rajesh",
    owner_employee_id: null,
    budget_code: "BackOff",
    budget_name: "Back Office",
    sub_budget_code: "Accounts",
    sub_budget_name: "Accounts",
    status: "IN_APPROVAL",
    created_by: OTHER,
    created_on: "2026-09-22T10:42:00+05:30",
    updated_on: "2026-09-22T10:42:00+05:30",
    documents: [],
    files: [],
    payout: null,
    flow: null,
    can: NO_ABILITIES,
    voucher: null,
    last_decision: null,
    vouchers: [],
    logs: [logRow("CREATED", "Created", { actor: OTHER })],
    stages: [],
    ...fields,
  };
}

/** The requests both pages' tests start from. */
const REJECTED_10 = logRow("REJECTED", "Rejected", {
  stage_name: "HOD Approval",
  remarks: "Deposit terms not yet signed — resubmit with the agreement.",
});

export function sampleRequests(): Array<Omit<Held, "approvedThisRound">> {
  return [
    {
      // At Payment, which is Tester's: the payout is theirs to fill.
      at: 3,
      mine: ["Payment Approval"],
      api: apiRequest(14, {
        priority: "HIGH",
        amount: "137500",
        remarks: "Part settlement of August invoices; balance next cycle.",
        documents: [
          bill(10256, "150000", "97500", {
            original_amount: "250000", paid_amount: "100000", vendor_ref: "ABC/INV/7781",
            due_date: "2026-09-03",
            // Read when it was raised, and saved with it.
            attachment_file: "DocScanner Sep 17, 2026 12-39 PM.pdf", attachment_count: 3,
            attachment_date: "2026-09-17",
            attachment_check: {
              file_name: "DocScanner Sep 17, 2026 12-39 PM.pdf", attachment_count: 3, source: "ocr", pages: 1,
              fields: {
                invoice_number: { value: "ABC/INV/7781", sap: "ABC/INV/7781", match: true },
                invoice_date: { value: "2026-08-04", sap: "2026-08-04", match: true },
                amount: { value: 250000, sap: 250000, match: true },
                party_name: { value: "ABC Technologies Pvt Ltd", sap: "ABC Technologies", match: true },
                account_number: { value: "50100234567812", sap: "50100234567899", match: false },
                ifsc: { value: null, sap: null, match: null },
              },
            },
          }),
          bill(10271, "84000", "40000", { doc_date: "2026-08-19" }),
        ],
        files: [{ id: 501, name: "ABC-statement-Sep.pdf", size: 182_000, purpose: "SUPPORTING", payout_line_id: null, uploaded_by: OTHER, uploaded_on: null }],
      }),
    },
    {
      // An Employee at Payment: nothing in SAP to pre-fill the payee from.
      at: 3,
      mine: ["Payment Approval"],
      api: apiRequest(13, {
        request_type: "EMPLOYEE_ADVANCE",
        payment_against: "ADVANCE",
        partner_code: "1113035",
        partner_name: "RAVINDER SINGH SHUNTY",
        amount: "20000",
        return_method: "EMI",
        installments: 4,
        emi_amount: "5000",
        expected_from_date: "2026-10-01",
        expected_to_date: "2027-02-01",
        owner_label: "HR — Sunita",
        created_on: "2026-09-21T16:05:00+05:30",
      }),
    },
    {
      // At HOD, Tester's: may approve, reject or return it.
      at: 1,
      mine: ["HOD Approval"],
      api: apiRequest(12, {
        company: "BEVERAGES",
        partner_code: "VENDA000102",
        partner_name: "XYZ Traders",
        amount: "24500",
        priority: "LOW",
        documents: [bill(10263, "75000", "24500")],
        created_on: "2026-09-20T11:18:00+05:30",
      }),
    },
    {
      // Completed; Tester holds Payment, so records the UTR.
      at: -1,
      mine: ["Payment Approval"],
      api: apiRequest(11, {
        status: "COMPLETED",
        company: "MART",
        request_type: "EMPLOYEE_IMPREST",
        payment_against: "ADVANCE",
        partner_code: "ORGV000901",
        partner_name: "RAHUL SHARMA IMPREST JWPL0901",
        amount: "15000",
        expected_bill_date: "2026-10-05",
        created_on: "2026-09-18T09:30:00+05:30",
        payout: {
          beneficiary_name: "RAHUL SHARMA",
          to_account_number: "50100234567812",
          to_ifsc: "HDFC0001234",
          to_account_manual: true,
          lines: [
            { id: 71, method: "UPI", amount: "15000", from_account: "1104106", cheque_number: "", cheque_bank: "", cheque_date: null, cash_notes: [], utr: "" },
          ],
        },
        voucher: {
          id: 3, version: 1, status: "POSTED", sap_doc_entry: 29150, sap_doc_num: 926466970, error: "",
          posted_by: OTHER, posted_on: "2026-09-19T11:00:00+05:30", cancelled_by: null, cancelled_on: null,
        },
        logs: [
          logRow("CREATED", "Created", { actor: OTHER }),
          // Tester approved it at Payment — which is why it is on their desk.
          logRow("APPROVED", "Approved", { stage_name: "Payment Approval" }),
          logRow("APPROVED", "Approved", { stage_name: "Final Approval", actor: { id: 9, name: "Finance Controller", username: "fc" }, remarks: "Approved as per imprest policy." }),
          logRow("COMPLETED", "Completed", { actor: { id: 9, name: "Finance Controller", username: "fc" } }),
        ],
      }),
    },
    {
      // Rejected by Tester at HOD.
      at: -1,
      mine: ["HOD Approval"],
      api: apiRequest(10, {
        status: "REJECTED",
        partner_code: "VENDA000104",
        partner_name: "Shree Packaging Industries",
        amount: "50000",
        priority: "HIGH",
        documents: [bill(10301, "50000", "50000")],
        created_on: "2026-09-16T14:55:00+05:30",
        last_decision: REJECTED_10,
        logs: [logRow("CREATED", "Created", { actor: OTHER }), REJECTED_10],
      }),
    },
  ];
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The fake server. `scope` decides nothing but which list is answered:
 * `mine` is what Tester raised, `desk` everything else.
 */
export class FakeRequestServer {
  held: Held[];
  /** Calls, for assertions: [method, ...args]. */
  calls: Array<[string, ...unknown[]]> = [];
  /** Answer the next call with this error instead (a server refusal). */
  refuseNext: { status: number; message: string; problems?: string[] } | null = null;

  constructor(requests = sampleRequests()) {
    // Past its first stage means some stage approved it this round.
    this.held = requests.map((r) => ({ ...r, approvedThisRound: r.at > 0 }));
    this.held.forEach((h) => this.refresh(h));
  }

  private find(id: number): Held {
    const held = this.held.find((h) => h.api.id === id);
    if (!held) throw Object.assign(new Error("404"), { response: { status: 404, data: { message: "Not found." } } });
    return held;
  }

  private maybeRefuse() {
    if (!this.refuseNext) return;
    const { status, message, problems } = this.refuseNext;
    this.refuseNext = null;
    throw Object.assign(new Error(message), {
      response: { status, data: { success: false, message, errors: problems ? { problems } : undefined } },
    });
  }

  /** Recompute flow, stages and abilities from the held state. */
  private refresh(held: Held) {
    const api = held.api;
    const mineNow = held.at >= 0 && held.mine.includes(ROLES[held.at][1]);
    const role = held.at >= 0 ? ROLES[held.at][0] : "";
    const stages: ApiStage[] = ROLES.map(([r, name], i) => ({
      stage_id: i + 1,
      name,
      role: r,
      sequence: i + 1,
      state:
        api.status === "IN_APPROVAL" && i === held.at
          ? "CURRENT"
          : (api.status === "COMPLETED" || i < held.at) && api.status !== "REJECTED"
            ? "APPROVED"
            : "UPCOMING",
      user_id: held.mine.includes(name) ? 1 : 7,
      user_name: held.mine.includes(name) ? "Tester" : "Navdeep Singh",
      acted_by_id: null,
      acted_on: null,
    }));
    const mineRequest = api.created_by.id === TESTER.id;
    const pending = api.status === "IN_APPROVAL";
    api.flow = {
      status: pending ? "PENDING" : api.status === "COMPLETED" ? "COMPLETED" : api.status,
      workflow: "FIN-AP",
      current_stage: pending && held.at >= 0 ? ROLES[held.at][1] : "",
      current_role: pending && held.at >= 0 ? (role as StageRole) : "",
      current_user: pending ? (mineNow ? TESTER : OTHER) : null,
      cycle: 1,
      version: (api.flow?.version ?? 0) + 1,
      total_stages: 6,
      awaiting_me: pending && mineNow,
    };
    const acting = pending && mineNow;
    const mayChange = mineRequest && (api.status === "RETURNED" || (pending && !held.approvedThisRound));
    api.can = {
      edit: mayChange,
      cancel: mayChange,
      resubmit: mineRequest && api.status === "RETURNED",
      approve: acting,
      reject: acting,
      return_to_creator: acting && role === "APPROVAL",
      send_back: acting && role === "FINAL",
      edit_payout: acting && role === "PAYMENT",
      record_utr:
        api.status === "COMPLETED" && held.mine.some((n) => n === "Payment Approval" || n === "Final Approval"),
      see_account: held.mine.some((n) => ACCOUNT_STAGES.has(n)),
    };
    api.stages = stages;
    // Tester's own latest decision, as the server reads it from the log.
    api.my_decision =
      [...(api.logs ?? [])].reverse().find((l) => DECISIONS.has(l.action) && l.actor?.id === TESTER.id) ?? null;
  }

  private answer(held: Held): ApiRequest {
    this.refresh(held);
    const out = clone(held.api);
    // As the server does: the account reaches Payment and later stages only.
    if (!out.can.see_account) {
      out.payout = null;
      out.logs = out.logs?.map((l) => (ACCOUNT_LOGS.has(l.action) ? { ...l, data: null } : l));
    }
    return out;
  }

  async requests(scope: "mine" | "desk"): Promise<ApiRequest[]> {
    this.calls.push(["requests", scope]);
    return this.held
      .map((h) => ({ h, api: this.answer(h) }))
      // The desk: what waits on Tester, and what Tester decided — nothing else.
      .filter(({ h, api }) =>
        scope === "mine"
          ? h.api.created_by.id === TESTER.id
          : h.api.created_by.id !== TESTER.id && (api.flow?.awaiting_me || api.my_decision),
      )
      .map(({ api }) => api)
      .sort((a, b) => b.created_on.localeCompare(a.created_on));
  }

  async request(id: number): Promise<ApiRequest> {
    this.calls.push(["request", id]);
    return this.answer(this.find(id));
  }

  async createRequest(input: ApiRequestInput, files: File[]): Promise<ApiRequest> {
    this.calls.push(["createRequest", input, files]);
    this.maybeRefuse();
    const id = Math.max(...this.held.map((h) => h.api.id)) + 1;
    const { department_id, sub_department_id, ...fields } = input;
    const held: Held = {
      at: 0,
      mine: [],
      approvedThisRound: false,
      api: apiRequest(id, {
        ...fields,
        department: { id: department_id ?? 0, name: department_id === 40 ? "Cyber Security" : "Finance" },
        sub_department: sub_department_id ? { id: sub_department_id, name: sub_department_id === 88 ? "AR" : "AP" } : null,
        created_by: TESTER,
        created_on: "2026-09-23T10:00:00+05:30",
        files: files.map((f, i) => ({ id: 900 + i, name: f.name, size: f.size, purpose: "SUPPORTING" as const, payout_line_id: null, uploaded_by: TESTER, uploaded_on: null })),
      }),
    };
    this.held.push(held);
    return this.answer(held);
  }

  async editRequest(
    id: number,
    input: ApiRequestInput,
    options: { files: File[]; removeFileIds: number[]; resubmit: boolean; version?: number },
  ): Promise<ApiRequest> {
    this.calls.push(["editRequest", id, input, options]);
    this.maybeRefuse();
    const held = this.find(id);
    const { department_id, sub_department_id, ...fields } = input;
    // What the server's EDITED row holds, for the plain fields: {old, new}.
    const before = held.api as unknown as Record<string, unknown>;
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    for (const key of ["amount", "priority", "remarks", "payment_date"] as const) {
      const was = before[key] ?? null;
      const now = (fields as Record<string, unknown>)[key] ?? null;
      if (now !== undefined && String(was ?? "") !== String(now ?? "")) changes[key] = { old: was, new: now };
    }
    Object.assign(held.api, fields, {
      department: { id: department_id ?? 0, name: held.api.department.name },
      sub_department: sub_department_id ? { id: sub_department_id, name: held.api.sub_department?.name ?? "AP" } : null,
      files: held.api.files.filter((f) => !options.removeFileIds.includes(f.id)),
    });
    held.api.logs = [...(held.api.logs ?? []), logRow("EDITED", "Edited", { data: changes })];
    if (options.resubmit && held.api.status === "RETURNED") {
      held.api.status = "IN_APPROVAL";
      held.at = 0;
      held.approvedThisRound = false;
      held.api.logs.push(logRow("RESUBMITTED", "Resubmitted"));
    }
    return this.answer(held);
  }

  async act(id: number, action: StageAction, remarks = ""): Promise<ApiRequest> {
    this.calls.push(["act", id, action, remarks]);
    this.maybeRefuse();
    const held = this.find(id);
    const stage = held.at >= 0 ? ROLES[held.at][1] : "";
    const push = (a: string, label: string) =>
      (held.api.logs = [...(held.api.logs ?? []), logRow(a, label, { stage_name: stage, remarks })]);
    if (action === "approve") {
      push("APPROVED", "Approved");
      held.approvedThisRound = true;
      if (ROLES[held.at][0] === "FINAL") {
        held.api.voucher = {
          id: 1, version: 1, status: "POSTED", sap_doc_entry: 29151, sap_doc_num: 926466971, error: "",
          posted_by: TESTER, posted_on: "2026-09-23T12:00:00+05:30", cancelled_by: null, cancelled_on: null,
        };
      }
      if (held.at === ROLES.length - 1) {
        held.api.status = "COMPLETED";
        held.at = -1;
        push("COMPLETED", "Completed");
      } else {
        held.at += 1;
      }
    } else if (action === "reject") {
      push("REJECTED", "Rejected");
      held.api.status = "REJECTED";
      held.api.last_decision = held.api.logs!.at(-1)!;
      held.at = -1;
    } else if (action === "return") {
      push("RETURNED", "Returned to creator");
      held.api.status = "RETURNED";
      held.api.last_decision = held.api.logs!.at(-1)!;
      held.at = -1;
    } else if (action === "send-back") {
      push("SENT_BACK", "Sent back to Payment");
      held.at = 3;
    } else if (action === "cancel") {
      push("CANCELLED", "Cancelled");
      held.api.status = "CANCELLED";
      held.at = -1;
    } else if (action === "resubmit") {
      push("RESUBMITTED", "Resubmitted");
      held.api.status = "IN_APPROVAL";
      held.at = 0;
      held.approvedThisRound = false;
    }
    return this.answer(held);
  }

  async savePayout(id: number, payout: ApiPayout, _version?: number, manualToken?: string | null): Promise<ApiRequest> {
    this.calls.push(["savePayout", id, payout, manualToken]);
    this.maybeRefuse();
    const held = this.find(id);
    // Typed by hand (every Employee account is): the server wants the password token.
    const typed = payout.to_account_manual || held.api.request_type === "EMPLOYEE_ADVANCE";
    if (typed && payout.to_account_number && manualToken !== "tok-1") {
      throw Object.assign(new Error("password"), {
        response: {
          status: 403,
          data: {
            success: false,
            message: "Confirm your password to enter the bank account by hand.",
            errors: { problems: ["manual_password"] },
          },
        },
      });
    }
    // What the server's PAYOUT_UPDATED row holds for the account.
    const was = held.api.payout;
    const data: Record<string, unknown> = { manual_account: typed, manual_new: false };
    if (mask(was?.to_account_number) !== mask(payout.to_account_number)) {
      data.to_account = { old: mask(was?.to_account_number), new: mask(payout.to_account_number) };
      data.manual_new = typed && Boolean(payout.to_account_number);
    }
    held.api.logs = [...(held.api.logs ?? []), logRow("PAYOUT_UPDATED", "Payment details updated", { data })];
    let next = 700;
    held.api.payout = {
      ...payout,
      lines: payout.lines.map((line) => ({ ...line, id: line.id ?? (next += 1) })),
    };
    return this.answer(held);
  }

  /** "secret" is Tester's password. */
  async confirmManualPassword(id: number, password: string): Promise<string> {
    this.calls.push(["confirmManualPassword", id]);
    if (password !== "secret") {
      throw Object.assign(new Error("wrong"), {
        response: { status: 403, data: { success: false, message: "That password is not right." } },
      });
    }
    return "tok-1";
  }

  async recordUtr(id: number, lineId: number, utr: string, proof: unknown): Promise<ApiRequest> {
    this.calls.push(["recordUtr", id, lineId, utr, proof]);
    this.maybeRefuse();
    const held = this.find(id);
    held.api.payout!.lines = held.api.payout!.lines.map((line) =>
      line.id === lineId ? { ...line, utr, utr_proof: proof as Record<string, unknown> | null } : line,
    );
    return this.answer(held);
  }

  async addRequestFile(id: number, file: File, purpose: "BANK_PROOF" | "PAYMENT_PROOF", lineId?: number): Promise<ApiRequest> {
    this.calls.push(["addRequestFile", id, file.name, purpose, lineId]);
    const held = this.find(id);
    held.api.files = [
      ...held.api.files,
      { id: 950 + held.api.files.length, name: file.name, size: file.size, purpose, payout_line_id: lineId ?? null, uploaded_by: TESTER, uploaded_on: null },
    ];
    return this.answer(held);
  }

  async removeRequestFile(id: number, fileId: number): Promise<ApiRequest> {
    this.calls.push(["removeRequestFile", id, fileId]);
    const held = this.find(id);
    held.api.files = held.api.files.filter((f) => f.id !== fileId);
    return this.answer(held);
  }

  /** The service methods, for `vi.mock` to spread into the mocked service. */
  methods() {
    return {
      requests: this.requests.bind(this),
      request: this.request.bind(this),
      createRequest: this.createRequest.bind(this),
      editRequest: this.editRequest.bind(this),
      act: this.act.bind(this),
      savePayout: this.savePayout.bind(this),
      confirmManualPassword: this.confirmManualPassword.bind(this),
      recordUtr: this.recordUtr.bind(this),
      addRequestFile: this.addRequestFile.bind(this),
      removeRequestFile: this.removeRequestFile.bind(this),
    };
  }

  /** Put a request of Tester's own in, as `mine`. */
  addOwn(api: ApiRequest, at = 0, approvedThisRound = false) {
    const held: Held = { api: { ...api, created_by: TESTER }, mine: [], at, approvedThisRound };
    this.held.push(held);
    this.refresh(held);
    return held;
  }
}
