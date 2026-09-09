/**
 * Route-level code splitting — the invariants that keep it working.
 *
 * Splitting fails at NAVIGATION, not at build. `tsc` and `vite build` both
 * pass happily on a lazy route with no Suspense boundary above it; the app
 * then throws the moment a user clicks that link, and only for the routes
 * whose chunk has not already been fetched. That is a bad failure to discover
 * in production, so the structure is asserted here instead.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf-8");

const APP = "src/App.tsx";
const PROTECTED_PAGE = "src/components/ProtectedPage.tsx";

describe("pages are loaded on demand", () => {
  it("imports page modules lazily, not statically", () => {
    // The regression that undoes the whole phase: adding a route with a plain
    // `import Foo from "./pages/Foo"` silently pulls that page — and
    // everything it imports — back into the initial chunk. One such line can
    // re-add hundreds of kB with no warning from any tool.
    const source = read(APP);
    const staticPageImports = [...source.matchAll(/^import \w+ from "(\.\/pages\/[^"]+)";$/gm)]
      .map((m) => m[1]);
    expect(staticPageImports).toEqual(["./pages/Login"]);
  });

  it("splits a realistic number of pages", () => {
    // A test that counts can pass by counting nothing.
    const lazyCount = [...read(APP).matchAll(/lazy\(\(\) => import\("\.\/pages\//g)].length;
    expect(lazyCount).toBeGreaterThan(45);
  });

  it("keeps Login eager", () => {
    // It is what an anonymous visitor sees, so splitting it would put a round
    // trip in front of the only thing they can do.
    expect(read(APP)).toContain('import Login from "./pages/Login";');
  });

  it("uses a literal import specifier for every split", () => {
    // Vite needs a STATIC, literal specifier to know what to split. A computed
    // path (`import("./pages/" + name)`) either produces one big chunk again
    // or fails at runtime — in both cases with no build error.
    expect(read(APP)).not.toMatch(/import\(\s*[`'"]?[^"')]*\$\{/);
    expect(read(APP)).not.toMatch(/import\(\s*\w+\s*\)/);
  });
});

describe("every lazy route has a Suspense boundary above it", () => {
  it("App wraps the routes that render without the shell", () => {
    const source = read(APP);
    expect(source).toContain("<Suspense");
    // The boundary must enclose <Routes>, not sit beside it.
    expect(source.indexOf("<Suspense")).toBeLessThan(source.indexOf("<Routes>"));
    expect(source.indexOf("</Routes>")).toBeLessThan(source.indexOf("</Suspense>"));
  });

  it("ProtectedPage wraps its children, so the shell survives navigation", () => {
    // Inside the shell, not around it. With the boundary outside, the sidebar
    // and header would unmount and remount on every navigation to a page whose
    // chunk is not yet cached — the whole app blanking for a moment, which
    // reads as a reload rather than a navigation.
    const source = read(PROTECTED_PAGE);
    const sidebar = source.lastIndexOf("<Sidebar>");
    const suspense = source.indexOf("<Suspense", sidebar);
    expect(sidebar).toBeGreaterThan(-1);
    expect(suspense).toBeGreaterThan(sidebar);
    expect(source.indexOf("</Suspense>", suspense)).toBeLessThan(
      source.indexOf("</Sidebar>", suspense),
    );
  });
});

describe("heavy libraries stay out of the pages that merely mention them", () => {
  const HEAVY: Array<[string, string[]]> = [
    // 422 kB. Three pages parse uploaded workbooks or write an export; most
    // visits to those pages touch neither.
    ["xlsx", [
      "src/pages/Party_Assignment.tsx",
      "src/pages/Party_Product_Assignment.tsx",
      "src/pages/Tracker_Reports.tsx",
    ]],
    // 930 kB, already loaded on demand by utils/excelExport.ts before this
    // phase — asserted so it stays that way.
    ["exceljs", ["src/utils/excelExport.ts"]],
    // ~350 kB camera library behind a `scanning &&` guard.
    ["html5-qrcode", ["src/pages/HAIS/AssetLookup.tsx"]],
  ];

  it.each(HEAVY)("%s is never a value import in its consumer pages", (lib, files) => {
    for (const file of files) {
      const source = read(file);
      // `import type` is erased at compile time and costs nothing at runtime,
      // so it is explicitly allowed — that is what lets the helpers keep real
      // types while the library itself stays out of the chunk.
      const valueImport = new RegExp(
        String.raw`^import (?!type )[^;]*from "${lib}";`,
        "m",
      );
      expect(source, `${file} statically imports ${lib}`).not.toMatch(valueImport);
    }
  });

  it("the QR scanner is only reachable through a dynamic import", () => {
    expect(read("src/pages/HAIS/AssetLookup.tsx")).toContain(
      'lazy(() => import("./QrScanner"))',
    );
  });
});
