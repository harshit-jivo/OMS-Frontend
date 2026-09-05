import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import LabelHistory from "./Label_History";
import { legalService, type LabelCheckSummary } from "../services/legalService";

/**
 * The check history.
 *
 * What is worth pinning is what makes this a RECORD rather than a listing:
 *
 *  * Reopening a check shows the stored findings and the stored highlight
 *    boxes. The locator has changed twice since the earliest checks ran, so a
 *    page that re-derived the boxes would show a different document under the
 *    same date.
 *  * The list is cheap — it must not fetch full reports to render filenames.
 *  * A check from before previews were stored still opens; it just has no
 *    artwork, and says so rather than showing a broken image.
 */

const ROWS: LabelCheckSummary[] = [
  {
    id: 2,
    file_name: "failed.pdf",
    image_url: "/media/labels/previews/failed.png",
    uploaded_at: "2026-09-04T09:20:00Z",
    checked_by_name: "Priya",
    item_name: "Mustard Oil 200ml",
    summary: { total: 21, passed: 18, failed: 3, compliant: false },
  },
  {
    id: 1,
    file_name: "passed.pdf",
    image_url: "",
    uploaded_at: "2026-09-01T11:00:00Z",
    checked_by_name: "",
    item_name: "",
    summary: { total: 21, passed: 21, failed: 0, compliant: true },
  },
];

const DETAIL = {
  id: 2,
  file_name: "failed.pdf",
  image_url: "/media/labels/previews/failed.png",
  uploaded_at: "2026-09-04T09:20:00Z",
  checked_by_name: "Priya",
  item_name: "Mustard Oil 200ml",
  ocr_available: true,
  rule_count: 21,
  summary: { total: 21, passed: 18, failed: 3, compliant: false },
  findings: [
    {
      rule_id: "FSSAI_LICENCE",
      rule_name: "FSSAI logo and licence number",
      status: "FAIL" as const,
      remarks: "The licence number has 13 digits, not 14.",
      evidence_text: "Lic No. 1001506400541",
      ocr_verified: false,
      regions: [{ x: 0.6, y: 0.53, width: 0.19, height: 0.015 }],
    },
    {
      rule_id: "FOOD_NAME",
      rule_name: "Name of the food",
      status: "PASS" as const,
      remarks: "Declared on the principal display panel.",
      evidence_text: "COLD PRESSED KACHI GHANI MUSTARD OIL",
      ocr_verified: true,
      regions: [{ x: 0.1, y: 0.5, width: 0.4, height: 0.05 }],
    },
  ],
};

const listChecks = (rows = ROWS, totalPages = 1) =>
  vi.spyOn(legalService, "listChecks").mockResolvedValue({
    results: rows,
    pagination: { page: 1, page_size: 25, total: rows.length, total_pages: totalPages },
  });

afterEach(() => vi.restoreAllMocks());

async function renderHistory(rows = ROWS, totalPages = 1) {
  listChecks(rows, totalPages);
  render(<LabelHistory />);
  await screen.findByRole("heading", { name: /Label Check History/i });
  return userEvent.setup();
}

describe("Label check history", () => {
  it("lists past checks with who ran them and the outcome", async () => {
    await renderHistory();

    expect(await screen.findByText("failed.pdf")).toBeInTheDocument();
    expect(screen.getByText("3 failed")).toBeInTheDocument();
    expect(screen.getByText("Compliant")).toBeInTheDocument();
    expect(screen.getByText(/Priya/)).toBeInTheDocument();
    expect(screen.getByText(/Mustard Oil 200ml/)).toBeInTheDocument();
  });

  it("does not fetch full reports to render the list", async () => {
    const getCheck = vi.spyOn(legalService, "getCheck");
    await renderHistory();

    expect(getCheck).not.toHaveBeenCalled();
  });

  it("filters to checks that failed", async () => {
    const list = listChecks();
    render(<LabelHistory />);
    await screen.findByRole("heading", { name: /Label Check History/i });
    const user = userEvent.setup();

    await user.click(screen.getByRole("checkbox", { name: /Only checks with failures/i }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ failedOnly: true }),
      ),
    );
  });

  it("reopens a check with its stored findings and boxes", async () => {
    vi.spyOn(legalService, "getCheck").mockResolvedValue(DETAIL);
    const user = await renderHistory();

    await user.click(screen.getByText("failed.pdf"));

    expect(
      await screen.findByText("FSSAI logo and licence number"),
    ).toBeInTheDocument();
    // The stored region, rendered — not recomputed.
    const box = await screen.findByRole("button", {
      name: "Failed: FSSAI logo and licence number",
    });
    expect(box.style.left).toBe("60%");
    expect(box.style.top).toBe("53%");
  });

  it("shows the verdict the check recorded", async () => {
    vi.spyOn(legalService, "getCheck").mockResolvedValue(DETAIL);
    const user = await renderHistory();

    await user.click(screen.getByText("failed.pdf"));

    expect(await screen.findByText("3 of 21 rules failed")).toBeInTheDocument();
  });

  it("returns to the list", async () => {
    vi.spyOn(legalService, "getCheck").mockResolvedValue(DETAIL);
    const user = await renderHistory();

    await user.click(screen.getByText("failed.pdf"));
    await user.click(await screen.findByRole("button", { name: /Back to history/i }));

    expect(
      await screen.findByRole("heading", { name: /Label Check History/i }),
    ).toBeInTheDocument();
  });

  it("opens a check that predates stored previews, without a broken image", async () => {
    vi.spyOn(legalService, "getCheck").mockResolvedValue({
      ...DETAIL,
      id: 1,
      image_url: "",
      findings: DETAIL.findings,
    });
    const user = await renderHistory();

    await user.click(screen.getByText("passed.pdf"));

    expect(await screen.findByText(/predates stored previews/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // The findings are still readable — that is the part that matters.
    expect(screen.getByText("FSSAI logo and licence number")).toBeInTheDocument();
  });

  it("explains a failed load rather than showing an empty list", async () => {
    vi.spyOn(legalService, "listChecks").mockRejectedValue(new Error("boom"));
    render(<LabelHistory />);

    expect(await screen.findByText(/migrate legal/i)).toBeInTheDocument();
  });

  it("says so when nothing has been checked", async () => {
    await renderHistory([]);

    expect(
      await screen.findByText(/No labels have been checked yet/i),
    ).toBeInTheDocument();
  });

  it("pages through the history", async () => {
    const list = listChecks(ROWS, 3);
    render(<LabelHistory />);
    await screen.findByRole("heading", { name: /Label Check History/i });
    const user = userEvent.setup();

    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
  });
});
