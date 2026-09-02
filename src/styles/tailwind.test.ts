/**
 * The Tailwind layer, checked against the two promises Phase 1 makes.
 *
 * 1. **Nothing looks different.** Which rests entirely on preflight not being
 *    imported — it resets `button`, `h1`, `ul` and `table`, and 54 stylesheets
 *    written over several years assume browser defaults for all of them.
 *
 * 2. **The tokens describe the design that exists**, rather than introducing a
 *    second one. A token that drifts to a Tailwind default is invisible: the
 *    page still renders, just in a slightly different blue than the page beside
 *    it.
 *
 * Asserted against the source rather than the built CSS so it runs in
 * milliseconds and points at the line to change.
 */
import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/tailwind.css"), "utf-8");

/** Strip comments, so a value merely discussed in prose is not mistaken for one that is set. */
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

function tokenValue(name: string): string {
  const match = new RegExp(`${name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`).exec(code);
  return match ? match[1].trim() : "";
}

describe("preflight stays out", () => {
  it("does not import the reset", () => {
    // The single line that would restyle all 108 pages at once. It is left as
    // a comment in the source, which is why the check runs against stripped
    // code — otherwise the comment itself would fail the test.
    expect(code).not.toMatch(/@import\s+["']tailwindcss\/preflight/);
  });

  it("does not use the all-in-one import, which would pull preflight in", () => {
    // `@import "tailwindcss"` is theme + preflight + utilities. It is the
    // obvious line to write, and it is the one that breaks this phase.
    expect(code).not.toMatch(/@import\s+["']tailwindcss["']/);
  });

  it("still imports the theme and the utilities", () => {
    // Guards the opposite mistake: removing preflight by removing everything.
    expect(code).toMatch(/@import\s+["']tailwindcss\/theme\.css["']\s+layer\(theme\)/);
    expect(code).toMatch(/@import\s+["']tailwindcss\/utilities\.css["']\s+layer\(utilities\)/);
  });
});

describe("tokens match the design already in the stylesheets", () => {
  /**
   * Values read from `src/index.css` and from the duplicated-block table in
   * docs/codebase/DUPLICATION.md. If one of these changes in the app, this test
   * fails and the token gets updated with it — which is the point. A token that
   * silently disagrees with the CSS around it is worse than no token.
   */
  const EXPECTED: Array<[string, string]> = [
    ["--color-ink", "#0f172a"],          // index.css --text-h
    ["--color-ink-soft", "#1e293b"],     // 8 duplicated blocks
    ["--color-body", "#475569"],         // index.css --text
    ["--color-subtle", "#64748b"],       // 5 blocks
    ["--color-line", "#dbe4ee"],         // index.css --border
    ["--color-line-strong", "#cbd5e1"],  // 8 blocks
    ["--color-surface", "#f8fafc"],      // index.css --code-bg, 13 blocks
    ["--color-canvas", "#f4f7fb"],       // index.css --bg
    ["--color-brand", "#2563eb"],        // index.css --accent
    ["--color-danger", "#dc2626"],       // 6 blocks
    ["--color-danger-soft", "#fef2f2"],
    ["--color-danger-line", "#fecaca"],
    ["--color-warning", "#f97316"],      // 5 blocks
    ["--radius-sm", "8px"],
    ["--radius-md", "12px"],
    ["--radius-lg", "16px"],
  ];

  it.each(EXPECTED)("%s is %s", (name, value) => {
    expect(tokenValue(name)).toBe(value);
  });

  it("keeps the app's font stack, not Tailwind's default", () => {
    expect(tokenValue("--font-sans")).toContain("Inter");
  });

  it("matches the shadow index.css already sets", () => {
    expect(tokenValue("--shadow-panel")).toBe(
      "0 16px 36px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.03)",
    );
  });
});

describe("shadcn's variables cannot collide with the app's", () => {
  it("declares them under the --sh- prefix", () => {
    // `--accent` is defined in index.css and two stylesheets and referenced 40
    // times; `--muted` is referenced 17 times. Declaring shadcn's under those
    // names puts two unlayered `:root` blocks in conflict, and the later import
    // wins — `bg-accent` would come out as the app's blue rather than the
    // subtle surface shadcn means, three files away from the symptom.
    for (const name of ["background", "foreground", "primary", "accent", "muted", "border", "ring"]) {
      expect(code).toMatch(new RegExp(`--sh-${name}\\s*:`));
      // And NOT under the bare name.
      expect(code).not.toMatch(new RegExp(`^\\s*--${name}\\s*:`, "m"));
    }
  });

  it("maps every one onto Tailwind's colour namespace", () => {
    // A `--sh-` property nothing maps is dead: shadcn components reference the
    // utility, so an unmapped property silently falls back to Tailwind's own
    // default for that name.
    const declared = [...code.matchAll(/--sh-([a-z-]+)\s*:/g)].map((m) => m[1]);
    const mapped = [...code.matchAll(/--color-([a-z-]+)\s*:\s*var\(--sh-([a-z-]+)\)/g)]
      .map((m) => m[2]);
    expect([...new Set(declared)].sort()).toEqual([...new Set(mapped)].sort());
  });

  it("does not let an app token overwrite a shadcn one", () => {
    // Both live in Tailwind's single `--color-*` namespace, so a name used
    // twice means the later definition silently wins. This caught
    // `--color-accent` and `--color-muted` being defined by both halves of
    // this file, which would have turned every `bg-accent` into a surface.
    const defined = [...code.matchAll(/^\s*(--color-[a-z-]+)\s*:/gm)].map((m) => m[1]);
    const duplicated = defined.filter((n, i) => defined.indexOf(n) !== i);
    expect([...new Set(duplicated)]).toEqual([]);
  });
});

describe("the cascade traps that cost a day each", () => {
  it("declares the app's universal reset inside a layer", () => {
    // `* { margin: 0; padding: 0 }` existed twice — at the top of Login.css and
    // again in Sidebar.css — both UNLAYERED, and both loaded on every page
    // (Login is the one eager route; the sidebar is on every protected one).
    //
    // Unlayered CSS beats every cascade layer regardless of specificity, so
    // that rule outranked `.p-4`. Every Tailwind padding and margin utility in
    // the app resolved to zero: the class was in the DOM, it matched a real
    // rule in a loaded stylesheet, and it did nothing. Nothing errors, nothing
    // warns, and the element just sits there with no padding.
    const reset = /\*\s*,\s*\n?\s*\*::before/.exec(code);
    expect(reset, "the universal reset should live in this file").not.toBeNull();

    const before = code.slice(0, reset!.index);
    const openLayers = (before.match(/@layer\s+base\s*\{/g) ?? []).length;
    expect(openLayers, "the reset must be inside `@layer base`").toBeGreaterThan(0);
  });

  it("pins the spacing scale to px, because a rem here is not 16px", () => {
    // `index.css` sets `:root { font: 18px/145% var(--sans) }`. Tailwind's
    // default `--spacing: 0.25rem` therefore made `p-4` 18px rather than 16px,
    // silently disagreeing by 12.5% with the 50 stylesheets it is replacing —
    // enough to move a table row and not enough to look like a bug.
    expect(tokenValue("--spacing")).toMatch(/px$/);
  });
});

describe("no stylesheet re-introduces an unlayered universal reset", () => {
  it("is the only file that resets every element", () => {
    // The guard above proves THIS file layers its reset. This one proves no
    // other file adds one back — which is how it got here: a rule at the top of
    // a page stylesheet, applying to all 108 pages because that page happens to
    // be imported eagerly. It is an easy thing to paste into a new stylesheet
    // and an almost impossible one to debug from the symptom.
    const files = globSync("src/**/*.css", { cwd: process.cwd() })
      .filter((f) => !f.endsWith("tailwind.css"));

    const offenders = files.filter((file) => {
      const body = readFileSync(resolve(process.cwd(), file), "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      return /(^|\})\s*\*\s*(,|\{)/.test(body);
    });

    expect(offenders).toEqual([]);
  });
});
