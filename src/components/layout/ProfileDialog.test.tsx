/**
 * Profile — the sign-out affordance.
 *
 * The rail has had a Logout row all along, but it is collapsed to icons for a
 * lot of people and hidden entirely under 1024px, and "sign out" is a thing
 * people look for under their own name. What is worth pinning is that this
 * button HANDS OFF rather than signing anyone out: one sign-out path, one
 * confirmation. A second one added here would be a second chance to get the
 * token-clearing order wrong.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ProfileDialog from "./ProfileDialog";

vi.mock("@/auth", () => ({
  useAuth: () => ({
    session: { name: "Amit Kumar", username: "amit", roleDisplay: "Billing" },
  }),
}));

vi.mock("../../services/webDeviceService", () => ({
  webDeviceService: {
    getSummary: () => ({
      device_id: "dev-123",
      os_name: "Windows",
      os_version: "11",
      browser_name: "Chrome",
      browser_version: "120",
      app_version: "1.0.0",
      last_synced_at: null,
    }),
  },
}));

const setup = (onLogout?: () => void) => {
  render(<ProfileDialog open onOpenChange={vi.fn()} onLogout={onLogout} />);
};

describe("ProfileDialog", () => {
  it("offers a way to sign out", () => {
    setup(vi.fn());

    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("hands off rather than signing out itself", async () => {
    // The caller closes this dialog and raises the shared confirm. If this
    // ever clears the session directly, there are two sign-out paths to keep
    // in step and only one of them is tested.
    const onLogout = vi.fn();
    setup(onLogout);

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("shows no sign-out button when no handler is given", () => {
    // A button that cannot do anything is worse than no button.
    setup(undefined);

    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
  });

  it("still shows the account and build information it exists for", () => {
    setup(vi.fn());

    // Twice: the header shows it beside the avatar, and the account section
    // lists it as a field.
    expect(screen.getAllByText("Amit Kumar").length).toBeGreaterThan(0);
    expect(screen.getByText("dev-123")).toBeInTheDocument();
  });
});
