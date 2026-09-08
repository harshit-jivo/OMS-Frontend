import { describe, expect, it } from "vitest";

import { cn } from "./utils";

/**
 * `cn` — the class merger every `ui/` component's `className` prop relies on.
 *
 * The only reason a component accepts `className` is so a caller can override
 * a default. That override works by CONFLICT RESOLUTION, not by concatenation:
 * two utilities of equal specificity are decided by the order Tailwind emitted
 * them, which has nothing to do with the order they were written.
 *
 * So when the merger does not recognise a class, the override silently loses
 * and the class sits in the DOM doing nothing. That is not hypothetical — see
 * the custom-scale cases below.
 */

describe("cn", () => {
  it("lets a later utility beat an earlier one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-ink", "text-subtle")).toBe("text-subtle");
  });

  it("keeps utilities that do not conflict", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("passes the app's own class names through untouched", () => {
    // Both systems coexist; `.content-area` and `.sidebar` are positioning
    // hooks the shell still depends on.
    expect(cn("sidebar", "collapsed", "bg-rail")).toBe("sidebar collapsed bg-rail");
  });

  it("handles the conditional forms clsx exists for", () => {
    expect(cn("a", false && "b", null, undefined, ["c", { d: true, e: false }])).toBe(
      "a c d",
    );
  });
});

describe("the app's custom spacing scale", () => {
  /**
   * `--spacing-control` / `-sm` / `-xs` are declared in `styles/tailwind.css`,
   * so `h-control` is a real utility that tailwind-merge does not ship
   * knowledge of. Left unextended it does not treat these as heights, so they
   * are never replaced:
   *
   *     cn("h-control", "h-auto")  ->  "h-control h-auto"
   *
   * Both then apply, and `h-control` wins on emission order. A list row asking
   * for `h-auto` stayed locked at 40px and clipped its second line.
   */
  it.each([
    ["h-control", "h-auto"],
    ["h-control-sm", "h-control-xs"],
    ["h-control-xs", "h-10"],
    ["w-control", "w-full"],
    ["min-w-control-xs", "min-w-0"],
    ["size-control-sm", "size-4"],
  ])("%s is replaced by %s", (base, override) => {
    expect(cn(base, override)).toBe(override);
  });

  it("replaces a standard height with a custom one, in both directions", () => {
    expect(cn("h-9", "h-control")).toBe("h-control");
    expect(cn("h-auto", "h-control-xs")).toBe("h-control-xs");
  });

  it("does not confuse the scale with an unrelated utility", () => {
    // `h-` and `w-` are separate groups; setting one must not drop the other.
    expect(cn("h-control", "w-control-xs")).toBe("h-control w-control-xs");
  });

  it("is what makes a ui/button size override work at all", () => {
    // The real call: `ui/button` puts `h-control` on every `md` button, and a
    // list row passes `h-auto` so it can hold two lines.
    const merged = cn("h-control px-4 text-[13px]", "h-auto px-2 py-1.5");

    expect(merged).not.toContain("h-control");
    expect(merged).toContain("h-auto");
  });
});
