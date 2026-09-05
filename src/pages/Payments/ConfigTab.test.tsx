/**
 * Payment method mapping — the Masters page's only remaining configuration.
 *
 * A company-mapping card used to sit above it, mapping each company to a SAP
 * database, a HANA schema and a cash G/L. All three moved out of the payments
 * database, so the card and its endpoints were deleted. These tests pin what
 * replaced it: companies come from the API, CASH is configured by its G/L
 * rather than a bank, and nothing calls the removed routes.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ConfigTab from "./ConfigTab";
import approvalService from "../../services/approvalService";

const COMPANIES = [
  { id: 1, company: "OIL" as const, display_name: "Oil", is_active: true },
  { id: 2, company: "BEVERAGES" as const, display_name: "Beverages", is_active: true },
  { id: 3, company: "MART" as const, display_name: "Mart", is_active: true },
];

const BANKS = [
  {
    bank_code: "INB",
    display_name: "INDIAN BANK",
    gl_account: "2201101",
    account_number: "7007270527",
    branch: "DELHI",
    ifsc: "IDIB000D001",
    key: "INB:2201101",
    label: "INDIAN BANK - 7007270527",
  },
];

/** Shaped exactly like the status endpoint: CASH first, then banked tenders. */
const rowsFor = (cashGl: string) => [
  {
    payment_method: "CASH",
    label: "Cash",
    is_cash: true,
    mapping_id: 11,
    bank_key: "",
    gl_account: cashGl,
    bank_code: "",
    bank_name: "",
    account_name: "CASH SALE",
    account_number: "",
    branch: "",
    configured: true,
    valid: true,
    error: "",
  },
  {
    payment_method: "UPI",
    label: "UPI",
    is_cash: false,
    mapping_id: 12,
    bank_key: "INB:2201101",
    gl_account: "2201101",
    bank_code: "INB",
    bank_name: "INDIAN BANK",
    account_name: "INDIAN BANK CC A/C 7007270527",
    account_number: "7007270527",
    branch: "DELHI",
    configured: true,
    valid: true,
    error: "",
  },
];

const META = {
  synced_at: "2026-09-05T10:00:00Z",
  stale: false,
  source: "cache",
  bank_count: 1,
};

function renderTab(canEdit = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConfigTab canEdit={canEdit} flash={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(approvalService, "listCompanies").mockResolvedValue(COMPANIES);
  vi.spyOn(approvalService, "listSapBanks").mockResolvedValue(BANKS);
  vi.spyOn(approvalService, "methodMappingStatus").mockResolvedValue({
    rows: rowsFor("1105001"),
    meta: META,
  });
});

describe("company selector", () => {
  it("lists the companies the API returned, not a hardcoded set", async () => {
    renderTab();
    for (const name of ["Oil", "Beverages", "Mart"]) {
      expect(await screen.findByRole("option", { name })).toBeInTheDocument();
    }
  });

  it("reloads mappings and banks for the newly selected company", async () => {
    const status = vi.mocked(approvalService.methodMappingStatus);
    const banks = vi.mocked(approvalService.listSapBanks);
    renderTab();
    await screen.findByRole("option", { name: "Mart" });

    await userEvent.selectOptions(
      screen.getByLabelText(/company/i),
      "BEVERAGES",
    );

    // Both panels follow the selection — a stale bank list belongs to a
    // different company's SAP database.
    await waitFor(() => {
      expect(status).toHaveBeenCalledWith("BEVERAGES", false);
      expect(banks).toHaveBeenCalledWith("BEVERAGES", false);
    });
  });
});

describe("CASH", () => {
  it("shows the G/L the API returned", async () => {
    renderTab();
    const row = (await screen.findByRole("cell", { name: "Cash" })).closest("tr")!;
    // Read the cell text directly: the value sits inside a <code>, which
    // getByText's default normaliser does not reach through reliably.
    expect(row.textContent).toContain("1105001");
  });

  it("shows a DIFFERENT company's G/L without any frontend rule", async () => {
    // Mart's cash G/L differs from Oil's. Nothing in the UI knows that.
    vi.mocked(approvalService.methodMappingStatus).mockResolvedValue({
      rows: rowsFor("1105003"),
      meta: META,
    });
    renderTab();
    const row = (await screen.findByRole("cell", { name: "Cash" })).closest("tr")!;
    expect(row.textContent).toContain("1105003");
  });

  it("offers an Edit action — CASH is configurable, not read-only", async () => {
    // It used to render a dash: the backend refused every CASH write, so
    // there was nothing to open. Both halves of that changed together.
    renderTab();
    const row = (await screen.findByRole("cell", { name: "Cash" })).closest("tr")!;
    // Queried by attribute: the label lives on the button as aria-label,
    // which getByLabelText does not match and getByRole normalises away.
    // Named for the G/L rather than a bank — that IS the CASH contract.
    const edit = row.querySelector('[aria-label="Edit Cash G/L account"]');
    expect(edit).not.toBeNull();
  });

  it("names the cash account from SAP, not a placeholder", async () => {
    // Cash has no house bank, but its G/L has a name in the chart of
    // accounts — so the column says something rather than a dash.
    renderTab();
    const row = (await screen.findByRole("cell", { name: "Cash" })).closest("tr")!;
    expect(row.textContent).toContain("CASH SALE");
    // And nothing points at the deleted company-mapping table any more.
    expect(row.textContent).not.toContain("company mapping");
  });
});

describe("banked tenders", () => {
  it("names the account from SAP, which already carries its number", async () => {
    renderTab();
    const row = (await screen.findByRole("cell", { name: "UPI" })).closest("tr")!;
    expect(row.textContent).toContain("INDIAN BANK CC A/C 7007270527");
    expect(row.textContent).toContain("2201101");
  });

  it("has no separate account-number or branch column", async () => {
    // One SAP-named column replaced three; the removed bank panel showed the
    // same values a second time.
    renderTab();
    for (const gone of ["Account Number", "Branch"]) {
      expect(screen.queryByRole("columnheader", { name: gone })).toBeNull();
    }
  });

  it("no longer renders the SAP bank reference table", async () => {
    renderTab();
    await screen.findByRole("cell", { name: "UPI" });
    expect(screen.queryByText(/available sap bank accounts/i)).toBeNull();
  });
});

describe("obsolete API", () => {
  it("exposes no company-mapping client methods at all", () => {
    for (const gone of [
      "listCompanyMappings",
      "createCompanyMapping",
      "updateCompanyMapping",
      "deleteCompanyMapping",
    ]) {
      expect(approvalService).not.toHaveProperty(gone);
    }
  });
});
