/**
 * A boundary around the page, not around the app.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE ROOT BOUNDARY DOES INSTEAD, AND WHY IT IS NOT ENOUGH
 * ─────────────────────────────────────────────────────────────────────────
 * `ErrorBoundary` sits above the router (App.tsx), which means a render error
 * anywhere unmounts EVERYTHING — sidebar, header, the navigation the user
 * would use to get out. What is left is a full-screen apology with two
 * buttons, and both of them are `window.location` calls: a hard reload, which
 * throws away every cached query, every open form and the scroll position on
 * whatever the user was actually doing.
 *
 * It also cannot recover on its own. A class boundary keeps `hasError` until
 * something resets it, and above the router nothing ever does — so even a
 * client-side navigation would come back to the same error screen. That is
 * precisely why its buttons had to reload the document.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT MOVING IT INSIDE THE SHELL CHANGES
 * ─────────────────────────────────────────────────────────────────────────
 *   * The sidebar survives, so the user navigates away instead of reloading.
 *   * `key={pathname}` remounts the boundary on every navigation, so leaving
 *     the broken page clears the error — no reload, no lost state.
 *   * "Try again" re-renders the SAME page rather than reloading the document.
 *     A transient failure (a null in one response) recovers in place.
 *
 * The root boundary stays. It now catches what it should always have been for:
 * a crash in the shell itself — the sidebar, the auth provider, the router.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE HEADING IS LOAD-BEARING
 * ─────────────────────────────────────────────────────────────────────────
 * "Something went wrong" is the exact string `e2e/harness.ts` looks for before
 * it will take a screenshot. Changing the wording here would let a crashed page
 * be baselined as if it were fine, which is the failure that guard exists to
 * prevent — so both boundaries say it, deliberately.
 */
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Shown in the message so the user knows what failed, not just that it did. */
  routeName?: string;
};

type State = { error: Error | null };

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Same channel as the root boundary. Deliberately not swallowed: a page
    // that recovers on "Try again" still had a bug, and the console entry is
    // the only record of it.
    console.error("Page render error:", error, info.componentStack);
  }

  retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="mx-auto flex max-w-xl flex-col items-start gap-3 p-8 text-left">
        <h1 className="text-lg font-bold text-ink">Something went wrong</h1>
        <p className="text-[13px] text-subtle">
          {this.props.routeName
            ? `The ${this.props.routeName} page could not be displayed.`
            : "This page could not be displayed."}{" "}
          The rest of the app is still working — you can try again, or pick another page from the
          sidebar.
        </p>
        <pre className="max-w-full overflow-x-auto rounded-lg bg-surface-strong px-4 py-3 text-[12px] text-bad">
          {error.message || "Unknown error"}
        </pre>
        <button
          type="button"
          onClick={this.retry}
          className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white focus-visible:outline-none focus-visible:shadow-focus"
        >
          Try again
        </button>
      </div>
    );
  }
}
