import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Toast } from "./toast";

const meta = {
  title: "Toast",
  component: Toast,
  parameters: { layout: "padded" },
  args: {
    tone: "neutral",
  },
} satisfies Meta<typeof Toast>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A save confirmation — the only feedback the user gets that it worked. */
export const Neutral: Story = {
  args: { message: "Draft saved", tone: "neutral" },
};

/** A successful state change. */
export const Ok: Story = {
  args: { message: "Invoice advanced to JSAP", tone: "ok" },
};

/** A failure the caller wants said out loud, not just shown. */
export const Bad: Story = {
  args: { message: "Failed to submit order — SAP service unavailable", tone: "bad" },
};

/**
 * Auto-dismiss is the CALLER's job — `Toast` only renders the live region.
 * This reproduces the `setTimeout` all five hand-rolled toasts already own.
 */
function AutoDismissDemo() {
  const [message, setMessage] = useState<string>();

  const fire = () => {
    setMessage("Invoice advanced to JSAP");
    setTimeout(() => setMessage(undefined), 3000);
  };

  return (
    <div className="flex h-40 flex-col items-start gap-3">
      <button
        className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-[12px] font-semibold text-body hover:bg-surface"
        onClick={fire}
      >
        Submit invoice
      </button>
      <Toast message={message} tone="ok" />
    </div>
  );
}

export const AutoDismiss: Story = {
  render: () => <AutoDismissDemo />,
};
