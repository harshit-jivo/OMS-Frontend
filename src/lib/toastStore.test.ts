/**
 * The store is what pages import, so its contract is worth pinning: the cap,
 * the ordering, and that unsubscribing actually stops the listener — the leak
 * the old `listeners.add` / `listeners.delete` pair made easy to get wrong.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetToasts,
  dismissToast,
  showToast,
  subscribeToToasts,
  type ToastData,
} from "./toastStore";

beforeEach(() => __resetToasts());

describe("toastStore", () => {
  it("puts the newest toast first", () => {
    const seen: ToastData[][] = [];
    subscribeToToasts((items) => seen.push(items));
    showToast({ title: "one", message: "a" });
    showToast({ title: "two", message: "b" });
    expect(seen.at(-1)!.map((t) => t.title)).toEqual(["two", "one"]);
  });

  it("caps the stack at four, dropping the oldest", () => {
    const seen: ToastData[][] = [];
    subscribeToToasts((items) => seen.push(items));
    for (const title of ["1", "2", "3", "4", "5"]) showToast({ title, message: "" });
    expect(seen.at(-1)!.map((t) => t.title)).toEqual(["5", "4", "3", "2"]);
  });

  it("dismisses by the id showToast returned", () => {
    const seen: ToastData[][] = [];
    subscribeToToasts((items) => seen.push(items));
    const id = showToast({ title: "keep", message: "" });
    showToast({ title: "other", message: "" });
    dismissToast(id);
    expect(seen.at(-1)!.map((t) => t.title)).toEqual(["other"]);
  });

  it("stops calling a listener once it unsubscribes", () => {
    // subscribeToToasts returns the cleanup so `useEffect(() => subscribe(fn), [])`
    // is correct by construction — the old API made forgetting it the default.
    const listener = vi.fn();
    const unsubscribe = subscribeToToasts(listener);
    showToast({ title: "before", message: "" });
    const callsWhileSubscribed = listener.mock.calls.length;
    unsubscribe();
    showToast({ title: "after", message: "" });
    expect(listener).toHaveBeenCalledTimes(callsWhileSubscribed);
  });

  it("hands every listener its own array", () => {
    // emit() spreads, so a consumer that sorts its copy cannot corrupt the store.
    let received: ToastData[] = [];
    subscribeToToasts((items) => (received = items));
    showToast({ title: "a", message: "" });
    received.length = 0;
    showToast({ title: "b", message: "" });
    expect(received.map((t) => t.title)).toEqual(["b", "a"]);
  });
});
