/**
 * The grantable keys, and the server registry they have to match.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS READS A PYTHON FILE
 * ─────────────────────────────────────────────────────────────────────────
 * `GRANTABLE_ADMIN_PAGES` here and `REGISTRY` in
 * `Backend/core/permission_registry.py` are two lists of the same thing, and
 * nothing made them agree. The failure is silent in BOTH directions:
 *
 *   * a key offered here but not registered there is a tick box that writes a
 *     grant the server discards — `effective_keys` intersects with `ALL_KEYS`,
 *     so an unregistered key is inert. The admin sees it save and nothing
 *     happens;
 *   * a key registered there but not offered here is a capability that can
 *     only be granted through Role Permissions (which reads the server list
 *     directly), never to an individual. That is exactly how `Payments_Verify`
 *     went missing — registered, enforced by the endpoint, ungrantable from
 *     the Permissions page.
 *
 * Reading the Python as TEXT is the same trick `auth/routeAccess.test.ts`
 * already uses on `navigation.ts`: parsing a declarative data file is a
 * reasonable thing for a test to do, and it is the only way to compare across
 * the two languages without a build step or a generated file to keep in sync.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ALL_GRANTABLE_KEYS,
  GRANTABLE_ADMIN_PAGES,
  PAYMENT_ACTION_PERMISSIONS,
} from "./adminPages";

/**
 * Every key in the backend registry, read out of the source.
 *
 * Comment lines are stripped first, so a key that has been commented out
 * counts as absent — which is what it is.
 */
function backendRegistryKeys(): Set<string> {
  const source = readFileSync(
    join(__dirname, "../../../Backend/core/permission_registry.py"),
    "utf8",
  );
  const body = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

  // `REGISTRY` entries look like:  'App_User':  'App User',
  const registry = body.slice(body.indexOf("REGISTRY"), body.indexOf("ALL_KEYS:"));
  return new Set([...registry.matchAll(/'([A-Za-z_][A-Za-z0-9_.]*)':\s*'/g)].map((m) => m[1]));
}

describe("the grantable key lists", () => {
  it("offers no key the server does not register", () => {
    const registered = backendRegistryKeys();
    // Guards against the regex silently matching nothing and the whole suite
    // passing vacuously — the failure mode DESIGN_SYSTEM §8 warns about.
    expect(registered.size).toBeGreaterThan(30);

    const unregistered = ALL_GRANTABLE_KEYS.filter((key) => !registered.has(key));
    expect(unregistered, "add these to Backend/core/permission_registry.py").toEqual([]);
  });

  it("offers every page and payment key the server registers", () => {
    const source = readFileSync(
      join(__dirname, "../../../Backend/core/permission_registry.py"),
      "utf8",
    );
    const body = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");

    // Only the two LEGACY modules are the Permissions page's business. The
    // dotted new-style keys (`orders.sales.create`) and the tracker page keys
    // are granted through Role Permissions and the tracker role map, which
    // read the server list directly — so they are deliberately not offered
    // here and must not fail this test.
    const legacy = new Set<string>();
    for (const module of ["pages", "payments"]) {
      const start = body.indexOf("'" + module + "': {");
      expect(start, "registry module " + module + " not found").toBeGreaterThan(-1);
      const block = body.slice(start, body.indexOf("},", start));
      for (const match of block.matchAll(/'([A-Za-z_][A-Za-z0-9_]*)':\s*'/g)) {
        if (match[1] !== module) legacy.add(match[1]);
      }
    }
    expect(legacy.size).toBeGreaterThan(20);

    const offered = new Set(ALL_GRANTABLE_KEYS);
    const missing = [...legacy].filter((key) => !offered.has(key)).sort();
    expect(missing, "add these to GRANTABLE_ADMIN_PAGES or PAYMENT_ACTION_PERMISSIONS").toEqual(
      [],
    );
  });

  it("has no duplicate key across the two lists", () => {
    expect(new Set(ALL_GRANTABLE_KEYS).size).toBe(ALL_GRANTABLE_KEYS.length);
  });

  it("gives every entry a label and a path", () => {
    for (const entry of [...GRANTABLE_ADMIN_PAGES, ...PAYMENT_ACTION_PERMISSIONS]) {
      expect(entry.label.trim(), entry.key + " has no label").not.toBe("");
      expect(entry.path.startsWith("/"), entry.key + " has no route").toBe(true);
    }
  });
});
