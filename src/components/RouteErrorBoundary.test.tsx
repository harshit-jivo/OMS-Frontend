/**
 * These assert the three things the ROOT boundary cannot do, which is the only
 * reason a second boundary exists.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RouteErrorBoundary from "./RouteErrorBoundary";

/** Throws on render until `ok` flips. */
function Boom({ ok }: { ok: boolean }) {
  if (!ok) throw new Error("Cannot read properties of null (reading 'map')");
  return <div>recovered content</div>;
}

beforeEach(() => {
  // React logs the caught error itself; the boundary logs it again on purpose.
  // Silencing keeps the run readable without hiding a real failure, since every
  // assertion below is about rendered output rather than the console.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("RouteErrorBoundary", () => {
  it("shows the heading the visual harness refuses to baseline", () => {
    render(
      <RouteErrorBoundary>
        <Boom ok={false} />
      </RouteErrorBoundary>,
    );
    // e2e/harness.ts throws if it finds this string, so a crashed page can
    // never be screenshotted as if it were fine. Both boundaries say it.
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("names the page that failed", () => {
    render(
      <RouteErrorBoundary routeName="Invoice Review">
        <Boom ok={false} />
      </RouteErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The Invoice Review page could not be displayed",
    );
  });

  it("surfaces the error message rather than hiding it", () => {
    render(
      <RouteErrorBoundary>
        <Boom ok={false} />
      </RouteErrorBoundary>,
    );
    expect(screen.getByText(/Cannot read properties of null/)).toBeInTheDocument();
  });

  it("recovers in place, without reloading the document", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [ok, setOk] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOk(true)}>
            fix it
          </button>
          <RouteErrorBoundary>
            <Boom ok={ok} />
          </RouteErrorBoundary>
        </>
      );
    }
    render(<Harness />);

    // The underlying cause goes away (a refetch returns good data, say)…
    await user.click(screen.getByRole("button", { name: "fix it" }));
    // …and Try again re-renders the SAME page. The root boundary can only
    // offer window.location.reload(), which throws away every cached query and
    // every open form in the app.
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("recovered content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears when it is remounted, which is what navigating away does", () => {
    // ProtectedPage passes key={pathname}. Without it a class boundary holds
    // its error forever and the user carries the error screen from page to
    // page — exactly the root boundary's behaviour.
    const { rerender } = render(
      <RouteErrorBoundary key="/Invoice_Review">
        <Boom ok={false} />
      </RouteErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <RouteErrorBoundary key="/Dashboard">
        <Boom ok />
      </RouteErrorBoundary>,
    );
    expect(screen.getByText("recovered content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders children untouched when nothing throws", () => {
    render(
      <RouteErrorBoundary>
        <Boom ok />
      </RouteErrorBoundary>,
    );
    expect(screen.getByText("recovered content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
