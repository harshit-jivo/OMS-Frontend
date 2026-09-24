import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GlobalLoadingOverlay from "./GlobalLoadingOverlay";
import {
  __resetRequestActivity,
  requestSettled,
  requestStarted,
} from "@/lib/requestActivity";

/**
 * When the app-wide cover is allowed over the content, and where it sits.
 *
 * Two things are worth pinning. The RESTRAINT: most calls answer in well
 * under the delay, and a scrim that flashes over the page on every refetch is
 * worse than none, so "a fast request shows nothing" is a feature rather than
 * an accident of timing. And the GEOMETRY: it covers the content region only,
 * which means it has to know where the rail ends — and that changes when the
 * rail collapses.
 */
const OVERLAY = "[data-slot='global-loading-overlay']";

const overlay = () => document.querySelector(OVERLAY);

beforeEach(() => {
  vi.useFakeTimers();
  __resetRequestActivity();
});

afterEach(() => {
  vi.useRealTimers();
  __resetRequestActivity();
});

/** Advance past the hold-back window. */
const waitOutTheDelay = () => act(() => void vi.advanceTimersByTime(400));

describe("GlobalLoadingOverlay", () => {
  it("shows nothing when the app is idle", () => {
    render(<GlobalLoadingOverlay />);
    expect(overlay()).toBeNull();
  });

  it("shows nothing for a request that answers quickly", () => {
    render(<GlobalLoadingOverlay />);

    act(() => requestStarted());
    act(() => void vi.advanceTimersByTime(100));
    act(() => requestSettled());
    waitOutTheDelay();

    expect(overlay(), "a 100ms call must not flash a scrim").toBeNull();
  });

  it("covers the content once a request outstays the delay", () => {
    render(<GlobalLoadingOverlay />);

    act(() => requestStarted());
    waitOutTheDelay();

    expect(overlay()).not.toBeNull();
    // A scrim is invisible to a screen reader, and `aria-busy` is what says
    // the region behind it is not to be read yet.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading");
    expect(status).toHaveAttribute("aria-busy", "true");
  });

  it("goes away when the last request lands", () => {
    render(<GlobalLoadingOverlay />);

    act(() => requestStarted());
    waitOutTheDelay();
    expect(overlay()).not.toBeNull();

    act(() => requestSettled());
    expect(overlay()).toBeNull();
  });

  it("stays up while any request is still running", () => {
    render(<GlobalLoadingOverlay />);

    act(() => requestStarted());
    act(() => requestStarted());
    waitOutTheDelay();

    act(() => requestSettled());
    expect(overlay(), "one of two landed — still busy").not.toBeNull();

    act(() => requestSettled());
    expect(overlay()).toBeNull();
  });

  it("does not restart the clock when a second request joins the first", () => {
    // Otherwise a page firing a request every 200ms would keep pushing the
    // cover's appearance out and never show it at all.
    render(<GlobalLoadingOverlay />);

    act(() => requestStarted());
    act(() => void vi.advanceTimersByTime(200));
    act(() => requestStarted());
    act(() => void vi.advanceTimersByTime(100));

    expect(overlay(), "measured from the FIRST request, not the latest").not.toBeNull();
  });

  it("reports a request that was already in flight when it mounted", () => {
    // The shell's own fetches start before this component renders, so a
    // subscription alone would only ever hear them settle.
    act(() => requestStarted());
    render(<GlobalLoadingOverlay />);
    waitOutTheDelay();

    expect(overlay()).not.toBeNull();
  });

  it("cancels a pending appearance when it unmounts", () => {
    const { unmount } = render(<GlobalLoadingOverlay />);

    act(() => requestStarted());
    unmount();

    // The timer fires into a component that is gone; React would warn on a
    // setState here, and the cleanup is what stops it.
    expect(() => waitOutTheDelay()).not.toThrow();
    expect(overlay()).toBeNull();
  });
});

describe("where it sits", () => {
  const show = (props: { collapsed?: boolean } = {}) => {
    render(<GlobalLoadingOverlay {...props} />);
    act(() => requestStarted());
    waitOutTheDelay();
    return overlay() as HTMLElement;
  };

  it("starts where the full-width rail ends, and clears the header", () => {
    const el = show({ collapsed: false });

    expect(el.className).toContain("min-[1025px]:left-[220px]");
    expect(el.className).toContain("top-[58px]");
  });

  it("follows the rail in when it collapses", () => {
    // Otherwise a 150px strip of content sits uncovered beside a scrim that
    // claims to cover the page.
    const el = show({ collapsed: true });

    expect(el.className).toContain("min-[1025px]:left-[70px]");
    expect(el.className).not.toContain("min-[1025px]:left-[220px]");
  });

  it("sizes itself against the zoom rather than the raw viewport", () => {
    // `index.css` scales the UI with `body { zoom }` at >=1920px, and a fixed
    // element's box is measured on the UNZOOMED viewport and then scaled —
    // 12% too wide, hanging off the right edge.
    const el = show();

    expect(el.className).toContain("var(--app-zoom)");
  });

  it("sits under the dialog layer", () => {
    // A dialog running a mutation has to stay readable above the scrim, with
    // its own button reporting the wait. Dialogs are z-1000.
    const el = show();

    expect(el.className).toContain("z-[900]");
  });
});
