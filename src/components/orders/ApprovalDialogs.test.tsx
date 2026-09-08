import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  ApprovalBusyDialog,
  ApprovalConfirmDialog,
  ApprovalReviewDialog,
} from "./ApprovalDialogs";
import type { Order } from "@/services/ordersService";

/**
 * The approve / reject flow.
 *
 * The rule this component exists to enforce is the asymmetry: a rejection
 * must carry a reason, an approval need not. All three queues used to check
 * it with `alert("Reason required")` — a browser dialog on top of a dialog,
 * fired after the user had already pressed the button.
 */

const ORDER = {
  id: 1,
  order_number: "SO-202606",
  card_name: "Eastern Foods Ltd",
  items_count: 2,
  total_amount: 27800,
  delivery_date: "2026-06-15",
} as Order;

describe("ApprovalReviewDialog", () => {
  const renderReview = (
    props: Partial<Parameters<typeof ApprovalReviewDialog>[0]> = {},
  ) =>
    render(
      <ApprovalReviewDialog
        order={ORDER}
        action="reject"
        reason=""
        onReasonChange={vi.fn()}
        onContinue={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />,
    );

  it("shows what is about to be acted on", () => {
    renderReview();

    expect(screen.getByText("SO-202606")).toBeInTheDocument();
    expect(screen.getByText("Eastern Foods Ltd")).toBeInTheDocument();
    expect(screen.getByText("2026-06-15")).toBeInTheDocument();
  });

  it("will not let a rejection through without a reason", () => {
    renderReview({ action: "reject", reason: "" });

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("says WHY the button is disabled", () => {
    // A disabled control with no explanation is a dead end.
    renderReview({ action: "reject", reason: "" });

    expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute(
      "title",
      "A reason is required to reject an order",
    );
    expect(screen.getByText("Reason (required)")).toBeInTheDocument();
  });

  it("accepts a rejection once a reason is typed", () => {
    renderReview({ action: "reject", reason: "Rate not approved" });

    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("treats whitespace as no reason at all", () => {
    renderReview({ action: "reject", reason: "   " });

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("lets an approval through with no reason, which is the asymmetry", () => {
    renderReview({ action: "approve", reason: "" });

    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(screen.getByText("Reason (optional)")).toBeInTheDocument();
  });

  it("keeps the textarea in the app's font", () => {
    // `font-family` is not inherited by form controls and preflight is not
    // imported, so without this the reason box renders in the UA font.
    renderReview();

    expect(screen.getByRole("textbox").className).toContain("[font-family:inherit]");
  });

  it("renders nothing when there is no order", () => {
    renderReview({ order: null, action: null });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ApprovalConfirmDialog", () => {
  const renderConfirm = (
    props: Partial<Parameters<typeof ApprovalConfirmDialog>[0]> = {},
  ) =>
    render(
      <ApprovalConfirmDialog
        order={ORDER}
        action="approve"
        submitting={false}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />,
    );

  it("says what approving does HERE, when the caller states it", () => {
    // Only the auditor's queue pushes to SAP. The other two say so wrongly if
    // they inherit its wording.
    renderConfirm({
      approveMessage: (order) => `Push order ${order.order_number} to SAP?`,
    });

    expect(screen.getByText("Push order SO-202606 to SAP?")).toBeInTheDocument();
  });

  it("falls back to a plain question when the caller says nothing", () => {
    renderConfirm();

    expect(screen.getByText("Approve order SO-202606?")).toBeInTheDocument();
  });

  it("warns that a rejection cannot be undone from here", () => {
    renderConfirm({ action: "reject" });

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it("locks both buttons while the write is in flight", () => {
    renderConfirm({ submitting: true });

    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Yes, approve" })).toBeDisabled();
  });

  it("goes back to the review step", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    renderConfirm({ onBack });

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("ApprovalBusyDialog", () => {
  it("announces itself as busy", () => {
    render(<ApprovalBusyDialog open orderNumber="SO-202606" />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("offers no way out — it is a write in flight", () => {
    // It used to be a plain fixed div, so Tab walked into the page behind and
    // a keyboard user could press the button that started the post again.
    render(<ApprovalBusyDialog open />);

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("says what is happening, which is not always SAP", () => {
    render(<ApprovalBusyDialog open heading="Updating order" message="Recording it." />);

    expect(screen.getByText("Updating order")).toBeInTheDocument();
    expect(screen.queryByText(/SAP/)).not.toBeInTheDocument();
  });
});
