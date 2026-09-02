/**
 * `Modal` is one component behind nine call sites in the Approval console, so
 * what it can and cannot do is what all nine can and cannot do.
 *
 * These assert the three things the hand-rolled version could not, and that its
 * props still behave the same — the nine call sites were not touched, so a
 * regression there would be silent.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "./ApprovalUI";

/** A page with something focusable behind the modal, so the trap is testable. */
function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button">behind</button>
      {open && (
        <Modal
          title="Reassign approver"
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          footer={<button type="button">Save</button>}
        >
          <label htmlFor="who">Who</label>
          <input id="who" />
        </Modal>
      )}
    </>
  );
}

describe("Approval console Modal", () => {
  it("announces itself with the title as its accessible name", () => {
    render(<Harness />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Reassign approver");
  });

  it("takes the page behind out of the accessibility tree", () => {
    // The old version set aria-modal="true" and stopped there. aria-modal is
    // advisory — the button behind stayed in the tree for every screen reader
    // that walks the DOM. Radix marks the siblings aria-hidden.
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "behind" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("keeps Tab inside the modal", async () => {
    // The behaviour the hand-rolled version could not have: it had Escape and a
    // scroll lock, but Tab walked straight out into the page behind.
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = screen.getByRole("dialog");

    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the header X, which is still the page's own button", async () => {
    // The close control stays inside .apv-modal-head where that stylesheet
    // positions it, so the primitive's own corner button is switched off.
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const closers = screen.getAllByRole("button", { name: "Close" });
    expect(closers).toHaveLength(1);
    await user.click(closers[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("puts focus back where it was when it closes", async () => {
    // Previously focus fell to <body>, so the next Tab restarted from the top
    // of the sidebar — several tabs away from what the user was doing.
    const user = userEvent.setup();

    function Reopenable() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            <Modal title="Reassign approver" onClose={() => setOpen(false)}>
              <p>body</p>
            </Modal>
          )}
        </>
      );
    }
    render(<Reopenable />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(opener).toHaveFocus();
  });

  it("still renders the header, body and footer slots the call sites pass", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { name: "Reassign approver" })).toBeInTheDocument();
    expect(screen.getByLabelText("Who")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("keeps `wide` as a class on the panel, so the stylesheet still sizes it", () => {
    const { container } = render(
      <Modal title="Wide one" onClose={() => {}} wide>
        <p>body</p>
      </Modal>,
    );
    expect(container.ownerDocument.querySelector(".apv-modal.is-wide")).not.toBeNull();
  });
});
