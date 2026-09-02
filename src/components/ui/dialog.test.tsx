/**
 * These assert the BEHAVIOUR the 44 hand-rolled modals get wrong, not the
 * styling. A test that the header has a bottom border would pass on every one
 * of them; a test that Escape closes the dialog fails on 32 of the 39 files.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

/** A dialog with a trigger, two focusable things inside, and a close button. */
function Harness({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button">before</button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange?.(next);
        }}
      >
        <DialogTrigger asChild>
          <button type="button">Open</button>
        </DialogTrigger>
        <DialogContent title="Invoice timeline">
          <DialogHeader>
            <DialogTitle>Invoice timeline</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <input aria-label="remarks" />
          </DialogBody>
          <DialogFooter>
            <button type="button">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <button type="button">after</button>
    </>
  );
}

describe("Dialog", () => {
  it("is announced as a dialog with an accessible name", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    // The name comes from `aria-labelledby` pointing at DialogTitle. None of
    // the hand-rolled overlays has a name at all: they are anonymous divs.
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Invoice timeline");
  });

  it("closes on Escape — the thing 32 of the 39 modal files never implemented", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("traps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const inside = [
      screen.getByLabelText("remarks"),
      screen.getByRole("button", { name: "Save" }),
      screen.getByRole("button", { name: "Close" }),
    ];

    // Four tabs is one more than there are focusable elements, so a trap that
    // does not wrap would have escaped to "after" by now.
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(inside).toContain(document.activeElement);
    }
  });

  it("hides the page behind it from assistive tech", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    // Radix marks the rest of the document `aria-hidden` while a dialog is
    // open, so a role query no longer reaches it — the modern equivalent of
    // `aria-modal`. The hand-rolled overlays leave the page fully exposed:
    // every control behind the dim layer stays in the accessibility tree.
    expect(screen.queryByRole("button", { name: "before" })).toBeNull();
    expect(screen.getByText("before").closest("[aria-hidden]")).not.toBeNull();
  });

  it("returns focus to whatever opened it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(document.activeElement).toBe(trigger);
  });

  it("names itself even with no visible heading at all", async () => {
    const user = userEvent.setup();
    function NoHeading() {
      const [open, setOpen] = useState(false);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button type="button">Open</button>
          </DialogTrigger>
          <DialogContent title="Scan a barcode">
            <DialogBody>no visible heading here</DialogBody>
          </DialogContent>
        </Dialog>
      );
    }
    render(<NoHeading />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Scan a barcode");
  });

  it("does not let a decorated heading leak into the accessible name", async () => {
    const user = userEvent.setup();
    function Decorated() {
      const [open, setOpen] = useState(false);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button type="button">Open</button>
          </DialogTrigger>
          <DialogContent title="Invoice timeline">
            <DialogHeader>
              <DialogTitle>
                INV-1001 <span>PENDING</span> <span>3 events</span>
              </DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );
    }
    render(<Decorated />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    // The visible heading is still there; the announced name is the plain one.
    expect(screen.getByText(/INV-1001/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Invoice timeline");
  });

  it("can omit the corner close button for dialogs that must be answered", async () => {
    const user = userEvent.setup();
    function NoClose() {
      const [open, setOpen] = useState(false);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button type="button">Open</button>
          </DialogTrigger>
          <DialogContent title="Confirm" showClose={false}>
            <DialogFooter>
              <button type="button">Yes</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
    render(<NoClose />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("applies the size the caller asked for", async () => {
    const user = userEvent.setup();
    function Sized() {
      const [open, setOpen] = useState(false);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button type="button">Open</button>
          </DialogTrigger>
          <DialogContent title="Pick items" size="xl">
            <DialogBody>wide</DialogBody>
          </DialogContent>
        </Dialog>
      );
    }
    render(<Sized />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByRole("dialog").className).toContain("max-w-[960px]");
  });
});

/**
 * The busy overlays on Auditor_Order, Billing_Order and Rate_Approver_Order are
 * dialogs that must NOT close: they are up while an order posts to SAP, and the
 * screen says "please do not refresh or close this window". Before the
 * conversion they were plain fixed divs, so they could not be closed — and also
 * could not stop Tab walking into the page behind and re-triggering the very
 * button that started the post.
 */
describe("a dialog that must not be dismissed", () => {
  function Busy({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
    return (
      <>
        <button type="button">start over</button>
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent
            title="Creating sales order"
            showClose={false}
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <div role="status" aria-busy="true">
              Sending order to SAP.
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  it("ignores Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Busy onOpenChange={onOpenChange} />);

    await user.keyboard("{Escape}");

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offers no close button", () => {
    const onOpenChange = vi.fn();
    render(<Busy onOpenChange={onOpenChange} />);
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("still takes the page behind out of reach, which is the actual fix", () => {
    // The old markup was `<div className="…-overlay">` with a spinner in it.
    // It dimmed the page; it did not stop anyone tabbing to the button that
    // had just started the SAP post and pressing it again.
    const onOpenChange = vi.fn();
    render(<Busy onOpenChange={onOpenChange} />);
    expect(screen.queryByRole("button", { name: "start over" })).not.toBeInTheDocument();
  });

  it("announces itself as busy", () => {
    const onOpenChange = vi.fn();
    render(<Busy onOpenChange={onOpenChange} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Creating sales order");
  });

  it("lets the backdrop keep its own styling", () => {
    // The busy backdrop is deliberately heavier and blurred — it is how the
    // page says it is blocked — so `overlayClassName` exists for the same
    // reason `variant="bare"` does.
    const { baseElement } = render(
      <Dialog open>
        <DialogContent title="Busy" showClose={false} overlayClassName="ao-loading-overlay">
          <p>working</p>
        </DialogContent>
      </Dialog>,
    );
    expect(baseElement.querySelector(".ao-loading-overlay")).not.toBeNull();
  });
});
