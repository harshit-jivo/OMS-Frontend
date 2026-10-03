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
import { CONTROL_PANEL_KEYS, CONTROL_PANEL_PAGES, controlPanelKeysFor } from "./controlPanelAccess";

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
    expect(registered.size).toBeGreaterThan(15);
    expect([...CONTROL_PANEL_KEYS].sort()).toEqual([...registered].sort());
  });

  it("is four pages", () => {
    expect(CONTROL_PANEL_PAGES.map((p) => p.label)).toEqual(["Oils Sale", "Sales", "Inventory", "Finance"]);
  });

  it("opens every sub-tab's route with that sub-tab's key", () => {
    for (const page of CONTROL_PANEL_PAGES) {
      for (const sub of page.subTabs) {
        expect(ROUTE_ACCESS[sub.to]?.permissions, sub.to).toContain(sub.key);
      }
    }
    // A sibling's key does not open the route.
    expect(controlPanelKeysFor("/Control_Panel/Expenses")).toEqual(["control_panel.finance.expenses"]);
  });
});
