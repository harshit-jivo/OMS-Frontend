import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge, type BadgeTone } from "./badge";
import { toneForStatus } from "./statusTone";

const meta = {
  title: "Badge",
  component: Badge,
  parameters: { layout: "padded" },
  args: {
    children: "Approved",
    tone: "ok",
    outlined: false,
    caps: false,
    dot: false,
  },
  argTypes: {
    tone: {
      control: "select",
      options: ["neutral", "info", "ok", "hold", "bad", "note"] satisfies BadgeTone[],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The default: a settled, positive status. */
export const Default: Story = {};

/**
 * The six tones, each with the status word that actually earns it in the app
 * (see statusTone.ts) — one status, one colour, everywhere.
 */
export const AllTones: Story = {
  args: { children: undefined },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge tone="ok">Billed</Badge>
      <Badge tone="hold">Pending</Badge>
      <Badge tone="note">Need Approval</Badge>
      <Badge tone="bad">Rejected</Badge>
      <Badge tone="info">Posted to SAP</Badge>
      <Badge tone="neutral">Draft</Badge>
    </div>
  ),
};

/**
 * Real statuses as they arrive from the API, run through `toneForStatus` —
 * the same function `Badge` is meant to be paired with everywhere, rather
 * than a caller picking a tone by hand.
 */
export const ByStatus: Story = {
  args: { children: undefined },
  render: () => {
    const statuses = [
      "Approved",
      "Pending Approval",
      "Need Approval",
      "Billed",
      "Posted to SAP",
      "CL Raised",
      "Edited",
      "Rejected",
      "CANCELLED",
      "Draft",
    ];
    return (
      <div className="flex flex-wrap gap-2">
        {statuses.map((status) => (
          <Badge key={status} tone={toneForStatus(status)}>
            {status}
          </Badge>
        ))}
      </div>
    );
  },
};

/** `dot` is a CSS shape, not a colour-only cue — an on/off device status. */
export const WithDot: Story = {
  args: { children: undefined },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge tone="ok" dot>
        Online
      </Badge>
      <Badge tone="neutral" dot>
        Offline
      </Badge>
      <Badge tone="bad" dot>
        Inactive
      </Badge>
    </div>
  ),
};

/** The tone's own colour as a visible edge — for badges sitting on a tinted card. */
export const Outlined: Story = {
  args: { tone: "info", outlined: true, children: "Posted to SAP" },
};

/** Uppercase + tracking, for the pages (App_User, Daily_Report) that already do this. */
export const Caps: Story = {
  args: { tone: "hold", caps: true, children: "Pending" },
};
