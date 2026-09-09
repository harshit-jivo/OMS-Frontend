/**
 * The invoice-post modal.
 *
 * What is worth pinning here is not the layout but the two rules the modal
 * exists to enforce: while a financial transaction is in flight NOTHING
 * dismisses it, and when it settles the outcome is announced rather than left
 * to be noticed. Both were properties of hand-rolled markup before the
 * conversion to `ui/dialog`, and both are easy to lose in a refactor that
 * "only changes classes".
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MissionControlLoader from "./MissionControlLoader";
import type { SapPostState } from "../pages/SalesInvoice/useSapPost";

const baseState = (over: Partial<SapPostState> = {}): SapPostState => ({
  status: "idle",
  activeStep: "session",
  failedStep: null,
  logs: [],
  invoiceNumber: "",
  docNum: "",
  docEntry: "",
  errorMessage: "",
  rawError: "",
  doc: { draftNo: "D-1", customer: "Acme Foods", itemCount: 3, total: 1250, branch: "OIL" },
  ...over,
});

const setup = (over: Partial<SapPostState> = {}, props: Record<string, unknown> = {}) => {
  const onClose = vi.fn();
  const onRetry = vi.fn();
  render(
    <MissionControlLoader
      state={baseState(over)}
      onClose={onClose}
      onRetry={onRetry}
      {...props}
    />,
  );
  return { onClose, onRetry };
};

describe("MissionControlLoader", () => {
  it("renders nothing at rest", () => {
    setup();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  describe("while the post is running", () => {
    it("opens as a busy alertdialog", () => {
      setup({ status: "running" });
      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveAttribute("aria-busy", "true");
    });

    it("offers no way out — no close button", () => {
      // The user cannot be allowed to dismiss a page that looks idle while SAP
      // is still writing an invoice.
      setup({ status: "running" });
      expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
    });

    it("does not close on Escape", async () => {
      const { onClose } = setup({ status: "running" });
      await userEvent.keyboard("{Escape}");
      expect(onClose).not.toHaveBeenCalled();
    });

    it("announces the wait in words, not in rotating decoration", () => {
      setup({ status: "running" });
      // The rotating stage labels are aria-hidden; this is the only thing a
      // screen reader gets, and it must be stable.
      expect(screen.getByRole("status")).toHaveTextContent(/creating your invoice/i);
    });

    it("shows the customer and total it is posting", () => {
      setup({ status: "running" });
      expect(screen.getByText("Acme Foods")).toBeInTheDocument();
      expect(screen.getByText(/1,250\.00/)).toBeInTheDocument();
    });
  });

  describe("on success", () => {
    it("shows the invoice number and closes on Done", async () => {
      const { onClose } = setup({ status: "success", invoiceNumber: "12345" });
      expect(screen.getByText("#12345")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onClose).toHaveBeenCalled();
    });

    it("says the invoice was created even when SAP returned no number", () => {
      setup({ status: "success" });
      expect(screen.getByText("Created")).toBeInTheDocument();
    });

    it("offers the bill print only when the parent can fetch one", async () => {
      setup({ status: "success", invoiceNumber: "1" });
      expect(screen.queryByRole("button", { name: /invoice report/i })).toBeNull();

      const onOpenReport = vi.fn();
      screen.getByRole("button", { name: "Done" }); // sanity: first render stands
      render(
        <MissionControlLoader
          state={baseState({ status: "success", invoiceNumber: "1" })}
          onClose={vi.fn()}
          onRetry={vi.fn()}
          onOpenReport={onOpenReport}
        />,
      );
      await userEvent.click(
        screen.getAllByRole("button", { name: /invoice report/i })[0],
      );
      expect(onOpenReport).toHaveBeenCalled();
    });

    it("can be dismissed once it has settled", async () => {
      const { onClose } = setup({ status: "success", invoiceNumber: "1" });
      await userEvent.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("on failure", () => {
    it("retries from the error panel", async () => {
      const { onRetry } = setup({
        status: "error",
        errorMessage: "Credit limit exceeded",
        rawError: "Credit limit exceeded for customer",
      });
      await userEvent.click(screen.getByRole("button", { name: /retry/i }));
      expect(onRetry).toHaveBeenCalled();
    });

    it("keeps the raw SAP response out of the way but reachable", async () => {
      setup({
        status: "error",
        errorMessage: "Something failed",
        rawError: "-5002 : Item BEV-01 has no price defined",
      });
      // Collapsed: the text is in the DOM but inside a closed <details>, which
      // is the point — nobody is shown an SAP error code unless they ask.
      const details = screen.getByText(/show technical details/i).closest("details");
      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");

      await userEvent.click(screen.getByText(/show technical details/i));
      expect(details).toHaveAttribute("open");
      expect(screen.getByText(/BEV-01 has no price defined/)).toBeInTheDocument();
    });

    it("shows Raise CL only when the parent supplies the handler", () => {
      setup({ status: "error", errorMessage: "Credit limit exceeded" });
      expect(screen.queryByRole("button", { name: /raise cl/i })).toBeNull();
    });
  });
});
