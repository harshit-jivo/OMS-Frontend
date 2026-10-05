import { describe, expect, it } from "vitest";

import {
  appendPackageForm,
  EMPTY_PACKAGE_FORM,
  isPackageFormActive,
  type PackageForm,
} from "./PackageDimensions";
import { buildReportMarkdown, type LabelReport } from "./labelReport";

/**
 * The dimensional panel's contract with the endpoint.
 *
 * The component's markup is not pinned here — it is fields in a grid, and a
 * test asserting which ones are on screen would break every time a hint is
 * reworded. What matters is the one guarantee the feature rests on: an
 * untouched panel must send NOTHING, so adding it cannot change any check a
 * reviewer was already running. Everything else about it is recoverable; that
 * is not.
 */

const entries = (form: PackageForm): Record<string, string> => {
  const body = new FormData();
  appendPackageForm(body, form);
  return Object.fromEntries(
    [...body.entries()].map(([key, value]) => [key, String(value)]),
  );
};

describe("appendPackageForm", () => {
  it("sends nothing at all when no shape has been chosen", () => {
    // Even with values typed into fields that are no longer visible: the
    // shape is what turns the panel on, and a stale circumference must not
    // switch the dimensional rules on behind the reviewer.
    expect(
      entries({ ...EMPTY_PACKAGE_FORM, circumference_mm: "200", fortified: true }),
    ).toEqual({});
  });

  it("sends the chosen shape and the dimensions typed against it", () => {
    expect(
      entries({
        ...EMPTY_PACKAGE_FORM,
        package_shape: "RECTANGULAR",
        panel_width_mm: "64.9",
        panel_height_mm: "100.9",
      }),
    ).toMatchObject({
      package_shape: "RECTANGULAR",
      panel_width_mm: "64.9",
      panel_height_mm: "100.9",
      container_type: "NORMAL",
    });
  });

  it("omits blank fields rather than sending empty strings", () => {
    const sent = entries({
      ...EMPTY_PACKAGE_FORM,
      package_shape: "RECTANGULAR",
      panel_width_mm: "   ",
    });
    expect(sent).not.toHaveProperty("panel_width_mm");
  });

  it("sends an unticked checkbox as absent, not as false", () => {
    const off = entries({ ...EMPTY_PACKAGE_FORM, package_shape: "OTHER" });
    expect(off).not.toHaveProperty("fortified");

    const on = entries({
      ...EMPTY_PACKAGE_FORM,
      package_shape: "OTHER",
      fortified: true,
    });
    expect(on.fortified).toBe("true");
  });

  it("trims what the reviewer typed", () => {
    const sent = entries({
      ...EMPTY_PACKAGE_FORM,
      package_shape: "CYLINDRICAL",
      height_mm: " 80 ",
    });
    expect(sent.height_mm).toBe("80");
  });
});

describe("isPackageFormActive", () => {
  it("tracks the shape, which is what the endpoint keys off", () => {
    expect(isPackageFormActive(EMPTY_PACKAGE_FORM)).toBe(false);
    expect(
      isPackageFormActive({ ...EMPTY_PACKAGE_FORM, package_shape: "SMALL" }),
    ).toBe(true);
  });
});

describe("buildReportMarkdown with skipped rules", () => {
  const report: LabelReport = {
    findings: [
      {
        rule_id: "PDP_AREA",
        rule_name: "Principal Display Panel area",
        status: "PASS",
        remarks: "PDP = 26.2 cm2.",
        ocr_verified: null,
      },
    ],
    summary: { total: 1, passed: 1, failed: 0, compliant: true },
    rule_count: 3,
    skipped: [
      {
        rule_id: "FORT_LOGO_SIZE",
        rule_name: "Fortification logo — dimensions",
        reason: "this product was not declared as fortified",
      },
      {
        rule_id: "VEG_MARK_SIZE",
        rule_name: "Veg / non-veg mark — minimum size",
        reason: "no vegetarian or non-vegetarian mark was declared for this pack",
      },
    ],
  };

  const markdown = buildReportMarkdown(report, "label.pdf");

  it("lists what was not checked, with the reason", () => {
    expect(markdown).toContain("## Not checked (2)");
    expect(markdown).toContain("was not declared as fortified");
  });

  it("keeps them out of the verdict sections and out of the counts", () => {
    const notChecked = markdown.indexOf("## Not checked");
    const passed = markdown.indexOf("## Passed");
    // Verdicts first, explanations after — a skipped rule is not a result.
    expect(passed).toBeGreaterThan(-1);
    expect(notChecked).toBeGreaterThan(passed);
    expect(markdown).toContain("**Rules checked:** 1");
    expect(markdown).toContain("Compliant — every rule passed");
  });

  it("says nothing when nothing was skipped", () => {
    expect(
      buildReportMarkdown({ ...report, skipped: [] }, "label.pdf"),
    ).not.toContain("Not checked");
    // An older report has no `skipped` key at all.
    expect(
      buildReportMarkdown({ ...report, skipped: undefined }, "label.pdf"),
    ).not.toContain("Not checked");
  });
});
