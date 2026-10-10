import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService, type ApiRequest, type ApiVoucher } from "../../services/advancePaymentService";
import { renderPage } from "../../test/renderPage";
import { RequestSummary } from "./RequestDetails";
import { SapPayment } from "./RequestProgress";
import { fromApiRequest } from "./requestApi";
import { apiRequest } from "./testRequests";

const VOUCHER: ApiVoucher = {
  id: 1, version: 1, status: "POSTED", sap_doc_entry: 30001, sap_doc_num: 1026466700, error: "",
  posted_by: null, posted_on: "2026-10-10T12:00:00+05:30", cancelled_by: null, cancelled_on: null,
  attachment_entry: null, attachment_error: "SAP did not take the attachment: Attachments folder not defined",
};

const FILE = {
  id: 9, name: "PO 221026015.pdf", size: 2048, purpose: "SUPPORTING" as const, payout_line_id: null,
  uploaded_by: null, uploaded_on: null, on_sap_share: true, share_error: "", in_sap: false,
};

function posted(fields: Partial<ApiRequest> = {}) {
  return apiRequest(15, {
    status: "COMPLETED", voucher: VOUCHER, vouchers: [VOUCHER], files: [FILE],
    can: { ...apiRequest(1).can, attach_to_sap: true }, ...fields,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("the request's files in SAP", () => {
  it("says why they are not attached, and attaches them on request", async () => {
    const attached = posted({
      voucher: { ...VOUCHER, attachment_entry: 7002, attachment_error: "" },
      files: [{ ...FILE, in_sap: true }],
    });
    vi.spyOn(advancePaymentService, "attachToSap").mockResolvedValue(attached);
    const user = userEvent.setup();
    renderPage(<SapPayment entry={fromApiRequest(posted())} />);

    expect(screen.getByText(/Attachments folder not defined/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Attach to SAP" }));
    expect(advancePaymentService.attachToSap).toHaveBeenCalledWith(15);
  });

  it("offers no button once SAP has every file, or to someone who may not attach", () => {
    renderPage(
      <SapPayment
        entry={fromApiRequest(posted({ voucher: { ...VOUCHER, attachment_entry: 7002 }, files: [{ ...FILE, in_sap: true }] }))}
      />,
    );
    expect(screen.getByText("Attached (SAP attachment 7002)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Attach to SAP" })).toBeNull();
  });

  it("marks each file with where it stands", () => {
    renderPage(
      <RequestSummary
        entry={fromApiRequest(
          posted({
            files: [
              FILE,
              { ...FILE, id: 10, name: "Contract.pdf", in_sap: true },
              { ...FILE, id: 11, name: "x.exe", on_sap_share: false, share_error: "This file extension is not allowed." },
            ],
          }),
        )}
      />,
    );
    expect(screen.getByText("On SAP share")).toBeTruthy();
    expect(screen.getByText("In SAP")).toBeTruthy();
    expect(screen.getByText("Not on SAP share").closest("span[title]")?.getAttribute("title")).toBe(
      "This file extension is not allowed.",
    );
  });
});
