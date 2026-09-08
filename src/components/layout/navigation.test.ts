/**
 * The shape of the sidebar table itself.
 *
 * `SIDEBAR_SECTIONS` is read by two things that must never disagree — the rail
 * and `/Home`, which lays the same links out as tiles — so where a page sits
 * is a decision worth pinning rather than a detail of one component. These are
 * assertions about INFORMATION ARCHITECTURE: which module a page belongs to,
 * and that the table stays well-formed while pages move between modules.
 *
 * `AppSidebar.test.tsx` covers how the rail RENDERS the table. This covers
 * what is in it.
 */
import { describe, expect, it } from "vitest";

import { HOME_LINK, SIDEBAR_SECTIONS } from "./navigation";

/** The section a path sits in, or undefined. */
const sectionOf = (path: string) =>
  SIDEBAR_SECTIONS.find((section) => section.links.some((link) => link.to === path))?.label;

const allLinks = SIDEBAR_SECTIONS.flatMap((section) => section.links);

describe("the sidebar table is well-formed", () => {
  it("has no empty section", () => {
    // A section is a heading plus a list. One with nothing under it renders a
    // caption above a gap, and `/Home` drops it entirely — so the two views
    // disagree about whether the module exists.
    for (const section of SIDEBAR_SECTIONS) {
      expect(section.links.length, `${section.label} is empty`).toBeGreaterThan(0);
    }
  });

  it("never lists the same path twice", () => {
    // Moving a page between sections is a cut-and-paste, and a paste that
    // forgets the cut puts one page in two modules — which reads as two
    // different pages that happen to share a name.
    const paths = allLinks.map((link) => link.to);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps Home outside every section", () => {
    expect(sectionOf(HOME_LINK.to)).toBeUndefined();
  });

  it("gives every link a label and an icon", () => {
    for (const link of allLinks) {
      expect(link.label.trim(), link.to).not.toBe("");
      expect(typeof link.icon, link.to).toBe("function");
    }
  });
});

describe("where the pages that have moved now live", () => {
  it("files Product Stock under Reports", () => {
    // It was a section of its own called "Stock", with this as its only link.
    // It is a report — HANA stock beside open-order demand.
    expect(sectionOf("/Product_Stock")).toBe("Reports");
    expect(SIDEBAR_SECTIONS.map((s) => s.label)).not.toContain("Stock");
  });

  it("puts the four order-configuration pages in Order Config", () => {
    expect(sectionOf("/Party_Assignment")).toBe("Order Config");
    expect(sectionOf("/Party_Product_Assignment")).toBe("Order Config");
    expect(sectionOf("/Order_Flow_Settings")).toBe("Order Config");
    expect(sectionOf("/Sap_Sync")).toBe("Order Config");
  });

  it("leaves Administration holding only what administers the APP", () => {
    // Users, roles, devices and labels. The moment an order-shaped page lands
    // back in here, the split this section exists to make has been undone.
    const administration = SIDEBAR_SECTIONS.find((s) => s.label === "Administration");
    expect(administration?.links.map((link) => link.to)).toEqual([
      "/App_User",
      "/Page_Permissions",
      "/Role_Permissions",
      "/Device_Management",
      "/UI_Labels",
    ]);
  });

  it("names the tracker's own admin page for the tracker", () => {
    // `/Home` renders these labels as tiles with no section heading beside
    // them, so a bare "Administration" was indistinguishable from the app-wide
    // section of that name.
    const label = allLinks.find((link) => link.to === "/Tracker_Admin")?.label;
    expect(label).toBe("Tracker Admin");
    expect(sectionOf("/Tracker_Admin")).toBe("Tracker");
  });

  it("has exactly one link labelled Administration-ish, and it is a section", () => {
    // The rail's collapsed state hides section captions but keeps links, so a
    // link sharing a caption's name makes that behaviour untestable — which is
    // what "Tracker > Administration" did.
    expect(allLinks.map((link) => link.label)).not.toContain("Administration");
  });
});
