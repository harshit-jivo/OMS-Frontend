/**
 * What the five `window.confirm`s could not do, pinned.
 *
 * The one that matters is the rejection reason: `window.prompt` cannot be
 * validated until it closes, so an empty reason was accepted, sent, and
 * reported back as an error banner after the reviewer had committed. A
 * rejection with no reason is a dead end for whoever picks the invoice up
 * next, so the confirm is disabled until there is one.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ConfirmActionDialog from "./ConfirmActionDialog";
import type { PendingAction, UseInvoiceReviewResult } from "../useInvoiceReview";

const RECORD = {
  id: 7,
  so_number: "SO-4410",
  party_name: "Acme Logistics",
} as PendingAction["record"];

/** Only the slice of the hook this dialog reads. */
function view(overrides: Partial<UseInvoiceReviewResult> = {}) {
  return {
    pending: { kind: "reject", record: RECORD } as PendingAction,
    setPending: vi.fn(),
    rejectReason: "",
    setRejectReason: vi.fn(),
    // The real rule, restated the way the hook computes it. Flipping this to
    // `true` fails the first test — checked, so it is not a test that passes
    // by asserting nothing.
    canConfirmPending: false,
    confirmPending: vi.fn(),
    actionId: null,
    ...overrides,
  } as unknown as UseInvoiceReviewResult;
}

describe("ConfirmActionDialog", () => {
  it("will not reject without a reason, and says why", () => {
    render(<ConfirmActionDialog view={view()} />);

    const confirm = screen.getByRole("button", { name: /Reject invoice/ });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute("title", "Enter a reason first.");
    expect(screen.getByLabelText(/Reason for rejection/)).toBeInTheDocument();
  });

  it("rejects once a reason is typed", async () => {
    const user = userEvent.setup();
    const confirmPending = vi.fn();
    render(
      <ConfirmActionDialog
        view={view({ rejectReason: "Rate is wrong", canConfirmPending: true, confirmPending })}
      />,
    );

    const confirm = screen.getByRole("button", { name: /Reject invoice/ });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(confirmPending).toHaveBeenCalledOnce();
  });

  it("asks the other four verbs without a reason field", () => {
    const kinds: PendingAction["kind"][] = ["approve", "delete", "edit", "post"];
    for (const kind of kinds) {
      const { unmount } = render(
        <ConfirmActionDialog
          view={view({ pending: { kind, record: RECORD }, canConfirmPending: true })}
        />,
      );
      expect(screen.queryByLabelText(/Reason for rejection/)).not.toBeInTheDocument();
      // Every verb names the invoice it is about — the confirm boxes said
      // "SO #4410" and nothing else about which party it belonged to.
      expect(screen.getByRole("dialog")).toHaveTextContent("SO-4410");
      expect(screen.getByRole("dialog")).toHaveTextContent("Acme Logistics");
      unmount();
    }
  });

  it("cannot be dismissed while the action is running", async () => {
    const user = userEvent.setup();
    const setPending = vi.fn();
    render(
      <ConfirmActionDialog
        view={view({ actionId: RECORD.id, canConfirmPending: true, setPending })}
      />,
    );

    expect(screen.getByRole("button", { name: /Working/ })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(setPending).not.toHaveBeenCalled();
  });
});
