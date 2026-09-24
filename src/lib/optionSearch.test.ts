import { describe, expect, it } from "vitest";

import { rankOptions, scoreOption, searchTokens } from "./optionSearch";

/**
 * The reported symptom: "I need to enter the full name for a product, then
 * only it shows the one I am targetting."
 *
 * `ui/dropdown` matched the whole query as ONE contiguous substring against
 * ONE field at a time, so anything but a left-anchored prefix of a single
 * field failed. Every case below failed before this module existed.
 */
const PRODUCTS = [
  { name: "JIVO RICE BRAN OIL 5 LTR", code: "FG0000074", group: "Rice Bran" },
  { name: "JIVO CANOLA OIL 1 LTR", code: "FG0000032", group: "Canola" },
  { name: "JIVO OLIVE OIL 500 ML", code: "FG0000005", group: "Olive" },
  { name: "COLD PRESS CANOLA 1 LTR 20 PCS", code: "FG0000407", group: "Canola" },
];
const fields = (p: (typeof PRODUCTS)[number]) => [p.name, p.code, p.group];
const names = (q: string) => rankOptions(PRODUCTS, q, fields).map((p) => p.name);

describe("searching a picker", () => {
  it("matches words in any order, with gaps between them", () => {
    // "OIL " sits between the two, so a contiguous `includes` found nothing.
    expect(names("canola 1")).toContain("JIVO CANOLA OIL 1 LTR");
    expect(names("1 ltr canola")).toContain("JIVO CANOLA OIL 1 LTR");
    expect(names("ltr jivo")).toContain("JIVO CANOLA OIL 1 LTR");
  });

  it("matches tokens that span different fields", () => {
    // Name + code: no single field holds both, so `.some(field => …)` failed.
    expect(names("canola FG0000032")).toEqual(["JIVO CANOLA OIL 1 LTR"]);
    expect(names("olive FG0000005")).toEqual(["JIVO OLIVE OIL 500 ML"]);
  });

  it("still excludes what does not match every token", () => {
    // More permissive must not mean "matches everything".
    expect(names("canola olive")).toEqual([]);
    expect(names("zzz")).toEqual([]);
  });

  it("puts the closest name first, not whichever was listed first", () => {
    // Both are canola; the one whose NAME starts with the query wins, even
    // though the other is earlier in the array.
    expect(names("cold press")[0]).toBe("COLD PRESS CANOLA 1 LTR 20 PCS");
    expect(names("jivo canola")[0]).toBe("JIVO CANOLA OIL 1 LTR");
  });

  it("ranks a name match above a code-only match", () => {
    const ranked = names("canola");
    expect(ranked.indexOf("JIVO CANOLA OIL 1 LTR")).toBeLessThan(
      ranked.indexOf("COLD PRESS CANOLA 1 LTR 20 PCS"),
    );
  });

  it("returns everything, untouched, for an empty query", () => {
    expect(rankOptions(PRODUCTS, "", fields)).toBe(PRODUCTS);
    expect(rankOptions(PRODUCTS, "   ", fields)).toBe(PRODUCTS);
  });

  it("keeps the caller's order when scores tie", () => {
    // Both match only via their group, so neither outranks the other and the
    // original order stands.
    expect(names("oil")).toEqual([
      "JIVO RICE BRAN OIL 5 LTR",
      "JIVO CANOLA OIL 1 LTR",
      "JIVO OLIVE OIL 500 ML",
    ]);
  });

  it("tokenises on any run of whitespace", () => {
    expect(searchTokens("  canola   1 ltr ")).toEqual(["canola", "1", "ltr"]);
    expect(searchTokens("   ")).toEqual([]);
  });

  it("scores a whole-query prefix above a word prefix", () => {
    const hay = "jivo canola oil 1 ltr fg0000032";
    expect(scoreOption("JIVO CANOLA OIL 1 LTR", hay, ["jivo", "canola"])).toBe(0);
    expect(scoreOption("JIVO CANOLA OIL 1 LTR", hay, ["canola"])).toBe(1);
  });
});
