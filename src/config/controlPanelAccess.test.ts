/**
 * The Control Panel keys offered here must be exactly the server's — the
 * `control_panel` module of backend core/permission_registry.py, which
 * backend control_panel/tests checks against its own tree. Read as text, the
 * same way adminPages.test.ts reads the registry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ROUTE_ACCESS } from "../auth/routeAccess";
import {
  CONTROL_PANEL_KEYS,
  CONTROL_PANEL_PAGES,
  CONTROL_PANEL_REPORTS,
  controlPanelKeysFor,
} from "./controlPanelAccess";

function registryModule(name: string): Set<string> {
  const source = readFileSync(
    join(__dirname, "../../../OMS-Backend/core/permission_registry.py"),
    "utf8",
  );
  const start = source.indexOf("'" + name + "': {");
  const block = source.slice(start, source.indexOf("},", start));
  return new Set([...block.matchAll(/'(control_panel\.[a-z_.]+)':\s*'/g)].map((m) => m[1]));
}

describe("Control Panel access", () => {
  it("offers exactly the keys the server registers", () => {
    const registered = registryModule("control_panel");
    expect(registered.size).toBe(24);
    expect([...CONTROL_PANEL_KEYS].sort()).toEqual([...registered].sort());
  });

  it("is four pages", () => {
    expect(CONTROL_PANEL_PAGES.map((p) => p.label)).toEqual(["Oils Sale", "Sales", "Inventory", "Finance"]);
  });

  it("opens every sub-page's route with its page's key, and no other", () => {
    for (const page of CONTROL_PANEL_PAGES) {
      for (const sub of page.subPages) {
        expect(ROUTE_ACCESS[sub.to]?.permissions, sub.to).toEqual([page.key]);
      }
    }
    expect(controlPanelKeysFor("/Control_Panel/Expenses")).toEqual(["control_panel.finance"]);
  });

  it("opens each report's route with that report's key only", () => {
    expect(CONTROL_PANEL_REPORTS).toHaveLength(20);
    for (const report of CONTROL_PANEL_REPORTS) {
      expect(ROUTE_ACCESS[report.to]?.permissions, report.to).toEqual([report.key]);
    }
  });
});
