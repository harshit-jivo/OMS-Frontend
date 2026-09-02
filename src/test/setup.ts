/**
 * Global test setup — runs before every test file.
 *
 * Two jobs, and the second is the important one.
 *
 * 1. jest-dom matchers (`toBeInTheDocument` and friends).
 *
 * 2. **Nothing may reach the network.** jsdom has no real XHR backend, so an
 *    unmocked request does not fail loudly — it hangs, or rejects late, and the
 *    test that caused it has usually finished by then. The failure surfaces as
 *    an unhandled rejection attributed to whichever test happened to be running,
 *    which is the worst kind of flake: real, intermittent, and blamed on the
 *    wrong file.
 *
 *    So the shared axios instance gets a default adapter that answers every
 *    request with an empty success. A test that wants a specific response
 *    overrides `api.defaults.adapter` itself; a test that does not gets a page
 *    rendering against empty data, which is exactly what a smoke test should be
 *    checking.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import api from "../services/api";

/**
 * What an unmocked request gets back.
 *
 * `[]` rather than `{}` because most list endpoints in this app return a bare
 * array, and a page mapping over `[]` renders its empty state — which is a
 * meaningful thing to smoke-test. A page that expects an object reads missing
 * fields as undefined, which is the same thing it would do against a slow
 * network on the first paint.
 */
api.defaults.adapter = async (config) => ({
  data: [],
  status: 200,
  statusText: "OK",
  headers: {},
  config,
});

beforeEach(() => {
  // jsdom shares one window across a file. Without this, a page that writes to
  // storage leaks its state into the next test in the same file.
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * jsdom implements neither of these, and several pages call them on mount.
 *
 * Stubbed here rather than per-test because their absence throws a TypeError
 * during render, which reads as "this component is broken" when the component
 * is fine and the environment is incomplete.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!window.scrollTo) {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}

// `URL.createObjectURL` is used by the bill-print preview and by every export.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
}
