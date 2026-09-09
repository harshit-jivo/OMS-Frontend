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
    // Phase 2 DIVERGES here, deliberately, and this is the record of it.
    // Phase 1's rule was that a token must describe the design that already
    // exists — `--color-canvas` mirrored `index.css --bg` (#f4f7fb). That
    // value is so close to white that a white card on it is visible only by
    // its border, and the converted pages read as one flat sheet.
    //
    // It is applied by `.content-area:has([data-slot="page"])`, so it reaches
    // converted pages ONLY; the 100+ unconverted ones keep the shell's white.
    ["--color-canvas", "#f4f5f6"],       // neutral grey; was index.css --bg
    ["--color-brand", "#2563eb"],        // index.css --accent
    ["--color-danger", "#dc2626"],       // 6 blocks
    ["--color-danger-soft", "#fef2f2"],
    ["--color-danger-line", "#fecaca"],
    ["--color-warning", "#f97316"],      // 5 blocks
    ["--radius-sm", "8px"],
    ["--radius-md", "12px"],
    ["--radius-lg", "16px"],
    // Deliberately NOT --radius-lg: Sidebar.css redefines that one
    // globally to 12px. See the note beside the token.
    ["--radius-card", "14px"],
    // The navigation rail — the app's one dark surface, and the only tokens
    // here that were NOT read out of an existing stylesheet. #172554 is the
    // brand hue driven to near-black, deliberately blue rather than a neutral
    // slate; the note beside it records what a white rail looked like.
    ["--color-rail", "#172554"],
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

describe("every hand-rolled <button> carries the form-control reset", () => {
  it("has no bare <button> in a shared component", () => {
    // Preflight is not imported, so a `<button>` that does not reset itself
    // keeps the UA's outset border, its grey `buttonface`, and — inside a
    // `.tw-page`, where `font: revert-layer` applies — the UA's FONT rather
    // than Inter, because `font-family` is not inherited by form controls.
    //
    // `ui/button` exists to make that impossible and documents the trap at
    // length. Three components fell into it anyway: `breadcrumbs` (a crumb
    // that looked like a pressed 1997 toolbar button), `dialog` (the corner
    // close button, in all 44 dialogs) and `tabs` (an unselected tab, where
    // the selected one hid the bug behind its own `bg-brand`).
    //
    // Reading the source rather than rendering, because the point is to catch
    // the NEXT one — a component nobody has written a test for yet.
    //
    // Checked per FILE rather than per opening tag. Matching the tag itself is
    // the obvious way and it does not work: `<button[\s\S]*?>` stops at the
    // FIRST `>`, which in this codebase is usually the one inside
    // `onClick={() => ...}` — so the className never enters the match and the
    // check silently passes on everything. The coarser question, "this file
    // renders a <button>, does it mention the reset?", is the invariant that
    // actually matters and cannot be truncated.
    const files = globSync("src/components/{ui,orders,layout}/*.tsx", {
      cwd: process.cwd(),
    }).filter((f) => !/\.(test|stories)\.tsx$/.test(f));
    expect(files.length, "the glob should find the shared components").toBeGreaterThan(10);

    const offenders = files.filter((file) => {
      const source = readFileSync(resolve(process.cwd(), file), "utf-8")
        // Several of these files DISCUSS `<button>` at length in prose.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

      return /<button[\s>]/.test(source) && !source.includes("appearance-none");
    });

    expect(offenders).toEqual([]);
  });

  it("fails when a reset is removed, which is what makes it useful", () => {
    // A source-scanning test can pass by matching nothing — this file already
    // carries one comment about exactly that — so the scan is exercised
    // against strings rather than trusted. The first version of the check
    // above passed happily with the reset deleted from `ui/tabs`, and these
    // four lines are what would have said so.
    const scan = (source: string) =>
      /<button[\s>]/.test(source) && !source.includes("appearance-none");

    expect(scan(`<button type="button" className="px-2">x</button>`)).toBe(true);
    expect(scan(`<button className="appearance-none px-2" />`)).toBe(false);
    // The arrow function is what defeated the tag-matching version.
    expect(scan(`<button onClick={() => go(1)} className="appearance-none" />`)).toBe(
      false,
    );
  });
});

describe("the dialog open animation", () => {
  it("animates scale and opacity only — never transform or translate", () => {
    // `ui/dialog` centres its panel with `-translate-x-1/2 -translate-y-1/2`,
    // and Tailwind v4 compiles those to the INDEPENDENT `translate` property
    // rather than to `transform`. The two compose, so a keyframe that also
    // says `transform: translate(-50%,-50%)` displaces the panel by
    // -100%/-100% for as long as the animation runs, then snaps it back the
    // instant `transform` reverts to `none`.
    //
    // Measured on a 400x200 stand-in: 200px left and 100px up from centre —
    // exactly half its own size — for the whole 0.16s. All 44 dialogs did it,
    // and it reads as a hard flicker rather than a pop.
    //
    // The visual suite could not catch it: it runs with `reducedMotion:
    // "reduce"`, so `motion-safe:` never fires and the animation never plays.
    const start = code.indexOf("@keyframes dialog-pop");
    expect(start, "dialog-pop should exist").toBeGreaterThan(-1);
    // The at-rule's own braces, matched by counting rather than by regex —
    // the body contains nested `{ … }` blocks per keyframe stop.
    let depth = 0;
    let end = start;
    for (let i = code.indexOf("{", start); i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      if (code[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = code.slice(code.indexOf("{", start) + 1, end);
    expect(body, "must not restate the centring").not.toMatch(/transform\s*:/);
    expect(body, "must not fight the centring utility").not.toMatch(
      /(^|[\s;{])translate\s*:/,
    );
    // And it should still actually animate something.
    expect(body).toMatch(/(^|[\s;{])scale\s*:/);
    expect(body).toMatch(/(^|[\s;{])opacity\s*:/);
  });
});

describe("the shell's drawer breakpoint", () => {
  const sidebarCss = readFileSync(
    resolve(process.cwd(), "src/components/Sidebar.css"),
    "utf-8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("is declared once, as a named variant", () => {
    // Two files decide what happens below it: Sidebar.css moves the rail
    // off-canvas, AppHeader.tsx swaps the collapse toggle for a hamburger.
    // Naming the query once is what stops them disagreeing.
    expect(code).toMatch(/@custom-variant\s+rail-drawer\s*\(@media\s*\(width\s*<=\s*1024px\)\)/);
  });

  it("is the SAME width the rail's own CSS uses", () => {
    // The bug this exists to prevent: Tailwind's `max-[1024px]` compiles to
    // `@media not all and (width >= 1024px)` — strictly LESS than 1024 —
    // while `max-width: 1024px` includes it. At exactly 1024px the rail was
    // off-canvas and the button that opens it was hidden: an app with no
    // navigation at all, one pixel wide, invisible in review. It was found by
    // reading the compiled CSS, which is not a thing anyone does twice.
    expect(sidebarCss).toMatch(/@media\s*\(max-width:\s*1024px\)/);
  });

  it("is not sidestepped by a raw arbitrary breakpoint in the shell", () => {
    // `max-[1024px]:` is the obvious thing to write and it is the wrong thing.
    //
    // Comment-stripped: both files EXPLAIN why they do not use it, and a
    // check that reads prose as code fails on its own documentation.
    for (const file of ["AppHeader.tsx", "AppSidebar.tsx"]) {
      const source = readFileSync(
        resolve(process.cwd(), `src/components/layout/${file}`),
        "utf-8",
      )
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(source, `${file} should use rail-drawer:`).not.toMatch(/max-\[1024px\]:/);
    }
  });
});

describe("the shell's stylesheet sets position, not appearance", () => {
  const sidebarCss = readFileSync(
    resolve(process.cwd(), "src/components/Sidebar.css"),
    "utf-8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("leaves the header and rail unpainted", () => {
    // Every rule in Sidebar.css is unlayered, so it beats every Tailwind
    // utility regardless of specificity. A `background` or `padding` left on
    // `.header` or `.sidebar` would silently win over the classes in
    // components/layout/ — the class would sit in the DOM doing nothing,
    // which is this codebase's most expensive recurring bug.
    const blocks = [...sidebarCss.matchAll(/(^|\})\s*(\.header|\.sidebar)\s*\{([^}]*)\}/gm)];
    expect(blocks.length, "the positioning rules should still be here").toBeGreaterThan(0);

    for (const [, , selector, body] of blocks) {
      for (const property of ["background", "padding", "border", "box-shadow", "font"]) {
        expect(body, `${selector} must not set ${property}`).not.toMatch(
          new RegExp(`(^|;)\\s*${property}[-a-z]*\\s*:`),
        );
      }
    }
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
