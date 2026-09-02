import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Toast } from "./toast";

describe("Toast", () => {
  it("keeps the live region mounted when there is no message", () => {
    render(<Toast />);
    // The whole point. `{toast && <div>}` mounts the region and the message at
    // the same instant, and a live region that appears already-populated does
    // not announce — which is why five toasts have been silent.
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces politely", () => {
    render(<Toast message="Invoice advanced to JSAP" />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("Invoice advanced to JSAP");
  });

  it("carries the tone as data, not only as colour", () => {
    render(<Toast message="Could not save" tone="bad" />);
    expect(screen.getByText("Could not save")).toHaveAttribute("data-tone", "bad");
  });
});
