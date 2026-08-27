import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiArrowDownTray,
  HiArrowPath,
  HiChevronDown,
  HiMagnifyingGlass,
} from "react-icons/hi2";
import { sapService } from "../services/sapService";
import type { InventoryReport as InventoryReportData } from "../services/sapService";
import { startExcelExport, exportDateStamp } from "../utils/excelExport";
import "../styles/Inventory_Report.css";

// Oil and beverage are separate SAP company databases; stock lives in whichever
// one the item belongs to, so the branch travels with every request.
const BRANCHES = [
  { value: "OIL", label: "Oil" },
  { value: "BEVERAGE", label: "Beverage" },
] as const;

type Branch = (typeof BRANCHES)[number]["value"];

const ITEM_CODE_HEADER = "ItemCode";
const ITEM_NAME_HEADER = "Item Name";
const SKU_HEADER = "SKU";
const TOTAL_HEADER = "Grand Total";

/** en-IN grouping, decimals only when the stock figure actually carries them. */
const formatQty = (value: number): string =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function Inventory_Report() {

  const [branch, setBranch] = useState<Branch>("OIL");
  const [report, setReport] = useState<InventoryReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [subGroup, setSubGroup] = useState("ALL");
  // Warehouse codes to show as columns. Empty means "not chosen yet", which is
  // read as every warehouse — so a warehouse added in SAP appears on its own.
  const [selectedWhs, setSelectedWhs] = useState<string[]>([]);
  const [whsMenuOpen, setWhsMenuOpen] = useState(false);
  const whsPickerRef = useRef<HTMLDivElement | null>(null);

  const loadReport = useCallback(async (target: Branch) => {
    setLoading(true);
    setError("");
    try {
      // Every warehouse is fetched once; narrowing the columns afterwards is
      // pure client-side work, so ticking a warehouse costs no round trip.
      const data = await sapService.getInventoryReport(target);
      setReport(data);
      setSelectedWhs(data.warehouses.map((w) => w.code));
    } catch (err) {
      console.error("Inventory report failed:", err);
      setReport(null);
      setError(
        "Could not load inventory from SAP. Please try again in a moment.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport(branch);
  }, [branch, loadReport]);

  // Close the warehouse dropdown on an outside click, the way a native select
  // would — otherwise it stays open over the table.
  useEffect(() => {
    if (!whsMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!whsPickerRef.current?.contains(event.target as Node)) {
        setWhsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [whsMenuOpen]);

  const warehouses = useMemo(
    () =>
      (report?.warehouses ?? []).filter((w) => selectedWhs.includes(w.code)),
    [report, selectedWhs],
  );

  const subGroups = useMemo(
    () => (report?.groups ?? []).map((g) => g.sub_group),
    [report],
  );

  /**
   * The visible report: rows filtered by search/variety, and every total
   * recomputed across the *selected* warehouses only. Recomputing rather than
   * using the API's totals is the point — a total that still counted hidden
   * warehouses would not add up to the columns on screen.
   */
  const view = useMemo(() => {
    if (!report) return null;

    const term = search.trim().toLowerCase();
    const codes = warehouses.map((w) => w.code);

    const groups = report.groups
      .filter((group) => subGroup === "ALL" || group.sub_group === subGroup)
      .map((group) => {
        const items = group.items
          .filter(
            (item) =>
              !term ||
              item.item_code.toLowerCase().includes(term) ||
              item.item_name.toLowerCase().includes(term),
          )
          .map((item) => {
            const stock: Record<string, number> = {};
            let total = 0;
            for (const code of codes) {
              const qty = item.stock[code] ?? 0;
              stock[code] = qty;
              total += qty;
            }
            return { ...item, stock, total };
          })
          // An item whose entire stock sits in a hidden warehouse drops out
          // rather than showing as an all-blank row.
          .filter((item) => item.total !== 0);

        const totals: Record<string, number> = {};
        for (const code of codes) {
          totals[code] = items.reduce((sum, item) => sum + item.stock[code], 0);
        }

        return {
          sub_group: group.sub_group,
          items,
          totals,
          total: items.reduce((sum, item) => sum + item.total, 0),
        };
      })
      .filter((group) => group.items.length > 0);

    const totals: Record<string, number> = {};
    for (const code of codes) {
      totals[code] = groups.reduce((sum, group) => sum + group.totals[code], 0);
    }

    return {
      groups,
      totals,
      grandTotal: groups.reduce((sum, group) => sum + group.total, 0),
      itemCount: groups.reduce((sum, group) => sum + group.items.length, 0),
    };
  }, [report, search, subGroup, warehouses]);

  const toggleWarehouse = (code: string) => {
    setSelectedWhs((current) =>
      current.includes(code)
        ? current.filter((c) => c !== code)
        : // Keep the API's ordering (busiest warehouse first) no matter the
          // order the boxes were ticked in.
          (report?.warehouses ?? [])
            .map((w) => w.code)
            .filter((c) => current.includes(c) || c === code),
    );
  };

  const handleExport = () => {
    if (!view || view.groups.length === 0) return;

    const rows: Record<string, unknown>[] = [];
    const blankRow = () => {
      const row: Record<string, unknown> = {
        [ITEM_CODE_HEADER]: "",
        [ITEM_NAME_HEADER]: "",
        [SKU_HEADER]: "",
      };
      for (const w of warehouses) row[w.code] = null;
      row[TOTAL_HEADER] = null;
      return row;
    };

    for (const group of view.groups) {
      for (const item of group.items) {
        const row: Record<string, unknown> = {
          [ITEM_CODE_HEADER]: item.item_code,
          [ITEM_NAME_HEADER]: item.item_name,
          [SKU_HEADER]: item.sku,
        };
        for (const w of warehouses) {
          // Blank, not 0 — the sheet reads like the screen, and SUM ignores it.
          row[w.code] = item.stock[w.code] || null;
        }
        row[TOTAL_HEADER] = item.total;
        rows.push(row);
      }

      const subtotal = blankRow();
      subtotal[ITEM_NAME_HEADER] = `${group.sub_group} TOTAL`;
      for (const w of warehouses) subtotal[w.code] = group.totals[w.code] || null;
      subtotal[TOTAL_HEADER] = group.total;
      rows.push(subtotal);
    }

    const grand = blankRow();
    grand[ITEM_NAME_HEADER] = "GRAND TOTAL";
    for (const w of warehouses) grand[w.code] = view.totals[w.code] || null;
    grand[TOTAL_HEADER] = view.grandTotal;
    rows.push(grand);

    const numeric = Object.fromEntries(
      [...warehouses.map((w) => w.code), TOTAL_HEADER].map((header) => [
        header,
        // Pinned to decimal: "Grand Total" would otherwise be read as money and
        // come out with a ₹ symbol against what is a carton/piece count.
        { type: "decimal" as const, decimals: 2 },
      ]),
    );

    startExcelExport(rows, {
      fileName: `Inventory_Report_${branch}_${exportDateStamp()}`,
      sheetName: "Inventory",
      headerOrder: [
        ITEM_CODE_HEADER,
        ITEM_NAME_HEADER,
        SKU_HEADER,
        ...warehouses.map((w) => w.code),
        TOTAL_HEADER,
      ],
      columns: { ...numeric, [ITEM_NAME_HEADER]: { width: 46 } },
      // Subtotal rows live in the data, so a filter over them would be
      // misleading — the totals would not follow the filtered rows.
      autoFilter: false,
    });
  };

  // ── Route access: now decided once, in components/ProtectedPage.tsx ───────
  // The guard that used to sit here is commented out below rather than removed.
  //
  // It was not merely redundant, it was WRONG, and in the direction that hurts:
  // `role !== "billing"` bounced an administrator off a page the sidebar showed
  // them and the API served them, because it compared the primary role string
  // alone — no `extra_roles`, no `is_superuser`, no `is_staff`. Two guards that
  // disagree are worse than one, and this was the one that was mistaken.
  //
  //   const role = (localStorage.getItem("role") || "").toLowerCase();
  //   if (role !== "billing") return <Navigate to="/Dashboard" replace />;
  //
  // `auth/routeAccess.ts` carries the same rule (`roles: ["billing"]`) with the
  // admin bypass every other route gets.

  const columnCount = warehouses.length + 4;
  const allSelected =
    !!report && selectedWhs.length === report.warehouses.length;

  return (
    <div className="invt-page">
      <div className="invt-header">
        <div>
          <h1 className="invt-title">Inventory Report</h1>
          <p className="invt-subtitle">
            Warehouse-wise stock of every finished good in SAP, grouped by
            variety. Download it as Excel for sharing or further working.
          </p>
        </div>
      </div>

      <div className="invt-controls">
        <div className="invt-field">
          <span className="invt-label" id="invt-branch-label">
            Company
          </span>
          <div
            className="invt-segmented"
            role="radiogroup"
            aria-labelledby="invt-branch-label"
          >
            {BRANCHES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={branch === option.value}
                className={`invt-segment${
                  branch === option.value ? " invt-segment-active" : ""
                }`}
                onClick={() => setBranch(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="invt-field">
          <label className="invt-label" htmlFor="invt-variety">
            Variety
          </label>
          <select
            id="invt-variety"
            className="invt-select"
            value={subGroup}
            onChange={(e) => setSubGroup(e.target.value)}
          >
            <option value="ALL">All varieties</option>
            {subGroups.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="invt-field invt-whs-picker" ref={whsPickerRef}>
          <span className="invt-label">Warehouses</span>
          <button
            type="button"
            className="invt-whs-toggle"
            onClick={() => setWhsMenuOpen((open) => !open)}
            aria-expanded={whsMenuOpen}
          >
            {allSelected
              ? `All warehouses (${selectedWhs.length})`
              : `${selectedWhs.length} selected`}
            <HiChevronDown aria-hidden="true" />
          </button>
          {whsMenuOpen && (
            <div className="invt-whs-menu">
              <div className="invt-whs-menu-head">
                <button
                  type="button"
                  className="invt-link-btn"
                  onClick={() =>
                    setSelectedWhs((report?.warehouses ?? []).map((w) => w.code))
                  }
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="invt-link-btn"
                  onClick={() => setSelectedWhs([])}
                >
                  Clear
                </button>
              </div>
              {(report?.warehouses ?? []).map((w) => (
                <label key={w.code} className="invt-whs-option">
                  <input
                    type="checkbox"
                    checked={selectedWhs.includes(w.code)}
                    onChange={() => toggleWarehouse(w.code)}
                  />
                  <span title={w.name}>{w.code}</span>
                  <span className="invt-whs-option-qty">
                    {formatQty(report?.totals[w.code] ?? 0)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="invt-field invt-field-grow">
          <label className="invt-label" htmlFor="invt-search">
            Search
          </label>
          <input
            id="invt-search"
            className="invt-input"
            type="search"
            placeholder="Item code or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="invt-actions">
          <button
            type="button"
            className="invt-btn invt-btn-ghost"
            onClick={() => void loadReport(branch)}
            disabled={loading}
          >
            <HiArrowPath aria-hidden="true" />
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            className="invt-btn invt-btn-primary"
            onClick={handleExport}
            disabled={loading || !view || view.groups.length === 0}
          >
            <HiArrowDownTray aria-hidden="true" />
            Download Excel
          </button>
        </div>
      </div>

      {error && <p className="invt-error">{error}</p>}

      {view && !loading && (
        <div className="invt-summary">
          <div className="invt-stat">
            <div className="invt-stat-label">Items in stock</div>
            <div className="invt-stat-value">{view.itemCount}</div>
          </div>
          <div className="invt-stat">
            <div className="invt-stat-label">Varieties</div>
            <div className="invt-stat-value">{view.groups.length}</div>
          </div>
          <div className="invt-stat">
            <div className="invt-stat-label">Warehouses</div>
            <div className="invt-stat-value">{warehouses.length}</div>
          </div>
          <div className="invt-stat">
            <div className="invt-stat-label">Total stock</div>
            <div className="invt-stat-value">{formatQty(view.grandTotal)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="invt-state">Fetching stock from SAP…</div>
      ) : !view || view.groups.length === 0 ? (
        <div className="invt-state">
          <HiMagnifyingGlass aria-hidden="true" />
          <p>
            {report
              ? "No stock matches the current filters."
              : "No inventory loaded."}
          </p>
        </div>
      ) : (
        <div className="invt-table-card">
          <table className="invt-table">
            <thead>
              <tr>
                <th className="invt-col-text">ItemCode</th>
                <th className="invt-col-text">Item Name</th>
                <th className="invt-col-text">SKU</th>
                {warehouses.map((w) => (
                  <th key={w.code} title={w.name}>
                    {w.code}
                  </th>
                ))}
                <th>Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {view.groups.map((group) => (
                <Fragment key={group.sub_group}>
                  <tr className="invt-row-group">
                    <td colSpan={columnCount}>{group.sub_group}</td>
                  </tr>
                  {group.items.map((item) => (
                    <tr className="invt-row-item" key={item.item_code}>
                      <td>{item.item_code}</td>
                      <td className="invt-item-name">{item.item_name}</td>
                      <td>{item.sku}</td>
                      {warehouses.map((w) => (
                        <td
                          key={w.code}
                          className={`invt-num${
                            item.stock[w.code] ? "" : " invt-zero"
                          }`}
                        >
                          {item.stock[w.code]
                            ? formatQty(item.stock[w.code])
                            : "—"}
                        </td>
                      ))}
                      <td className="invt-num">{formatQty(item.total)}</td>
                    </tr>
                  ))}
                  <tr className="invt-row-subtotal">
                    <td />
                    <td>{group.sub_group} Total</td>
                    <td />
                    {warehouses.map((w) => (
                      <td key={w.code} className="invt-num">
                        {formatQty(group.totals[w.code])}
                      </td>
                    ))}
                    <td className="invt-num">{formatQty(group.total)}</td>
                  </tr>
                </Fragment>
              ))}
              <tr className="invt-row-total">
                <td />
                <td>GRAND TOTAL</td>
                <td />
                {warehouses.map((w) => (
                  <td key={w.code} className="invt-num">
                    {formatQty(view.totals[w.code])}
                  </td>
                ))}
                <td className="invt-num">{formatQty(view.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
