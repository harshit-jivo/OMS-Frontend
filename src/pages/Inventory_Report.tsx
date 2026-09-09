/**
 * Inventory Report — warehouse-wise stock of every finished good in SAP.
 *
 * The data path is untouched: one fetch per branch, every warehouse, and the
 * narrowing is client-side so ticking a warehouse costs no round trip. What
 * changed is the chrome — the hand-rolled segmented control, the warehouse
 * picker with its own outside-click effect, and the stat boxes are now the
 * shared primitives.
 */
import { Fragment, useMemo, useState } from "react";
import {
  HiOutlineArchiveBox,
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineBuildingStorefront,
  HiOutlineCube,
  HiOutlineMagnifyingGlass,
  HiOutlineTag,
} from "react-icons/hi2";

import { sapService } from "../services/sapService";
import { startExcelExport, exportDateStamp } from "../utils/excelExport";
import { useQuery } from "@tanstack/react-query";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  FilterActions,
  FilterBar,
  FilterMultiSelect,
  FilterSearch,
  FilterSegmented,
  FilterSelect,
} from "@/components/ui/filter-bar";
import { Card, EmptyState, Notice, Page, PageHeader, Stat, StatRow } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

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
  const [search, setSearch] = useState("");
  const [subGroup, setSubGroup] = useState("ALL");
  /*
   * Warehouse columns. `null` means "the user has not chosen", which shows all
   * of them — so a warehouse added in SAP appears on its own. It has to be a
   * sentinel the user cannot produce: an empty array is a real choice (Clear),
   * and the two used to collide.
   */
  const [selectedWhs, setSelectedWhs] = useState<string[] | null>(null);

  const {
    data: report = null,
    isPending: loading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["inventory-report", branch],
    queryFn: () => sapService.getInventoryReport(branch),
  });

  const error = isError ? "Could not load inventory from SAP. Please try again in a moment." : "";

  const allWhsCodes = useMemo(() => (report?.warehouses ?? []).map((w) => w.code), [report]);
  /** What is actually shown: the user's choice, or every warehouse if none. */
  const activeWhs = selectedWhs ?? allWhsCodes;

  const warehouses = useMemo(
    () => (report?.warehouses ?? []).filter((w) => activeWhs.includes(w.code)),
    [report, activeWhs],
  );

  const subGroups = useMemo(() => (report?.groups ?? []).map((g) => g.sub_group), [report]);

  /**
   * The visible report: rows filtered by search/variety, and every total
   * recomputed across the *selected* warehouses only — a total that still
   * counted hidden warehouses would not add up to the columns on screen.
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

  const columnCount = warehouses.length + 4;
  const numCell = "text-right tabular-nums";

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Reports" }, { label: "Inventory Report" }]} />

      <PageHeader
        title="Inventory Report"
        description="Warehouse-wise stock of every finished good in SAP, grouped by variety."
        actions={
          <>
            <Button variant="ghost" onClick={() => void refetch()} disabled={loading}>
              <HiOutlineArrowPath
                aria-hidden="true"
                className={loading ? "motion-safe:animate-spin" : undefined}
              />
              Refresh
            </Button>
            <Button
              variant="primary"
              onClick={handleExport}
              disabled={loading || !view || view.groups.length === 0}
            >
              <HiOutlineArrowDownTray aria-hidden="true" /> Download Excel
            </Button>
          </>
        }
      />

      <FilterBar>
        <FilterSegmented
          label="Company"
          value={branch}
          options={BRANCHES}
          onChange={(next) => {
            setBranch(next);
            // The other branch has different warehouses, so a choice made
            // here means nothing there.
            setSelectedWhs(null);
          }}
        />
        <FilterSelect
          label="Variety"
          value={subGroup}
          onChange={(e) => setSubGroup(e.target.value)}
          fieldClassName="max-w-[220px]"
        >
          <option value="ALL">All varieties</option>
          {subGroups.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </FilterSelect>
        <FilterMultiSelect
          label="Warehouses"
          value={activeWhs}
          // Kept in the API's ordering (busiest warehouse first) no matter the
          // order the boxes were ticked in.
          onChange={(next) => setSelectedWhs(allWhsCodes.filter((code) => next.includes(code)))}
          options={(report?.warehouses ?? []).map((w) => ({
            value: w.code,
            label: <span title={w.name}>{w.code}</span>,
            meta: formatQty(report?.totals[w.code] ?? 0),
          }))}
          placeholder="No warehouses"
          disabled={!report}
          fieldClassName="max-w-[240px]"
        />
        <FilterSearch
          placeholder="Item code or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
          fieldClassName="min-w-[220px]"
        />
        <FilterActions>
          {view && !loading ? (
            <span className="pb-1.5 text-[11.5px] text-subtle">
              {view.itemCount} item{view.itemCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </FilterActions>
      </FilterBar>

      {error ? (
        <Notice tone="bad" title="Could not load inventory">
          {error}
        </Notice>
      ) : null}

      <StatRow>
        <Stat icon={HiOutlineCube} tone="brand" label="Items in stock" value={view?.itemCount ?? 0} loading={loading} />
        <Stat icon={HiOutlineTag} tone="neutral" label="Varieties" value={view?.groups.length ?? 0} loading={loading} />
        <Stat icon={HiOutlineBuildingStorefront} tone="neutral" label="Warehouses" value={warehouses.length} loading={loading} />
        <Stat icon={HiOutlineArchiveBox} tone="brand" label="Total stock" value={view ? formatQty(view.grandTotal) : "0"} loading={loading} />
      </StatRow>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="p-4">
            <TableSkeleton columns={6} label="Fetching stock from SAP" />
          </div>
        ) : !view || view.groups.length === 0 ? (
          <EmptyState
            icon={HiOutlineMagnifyingGlass}
            title={report ? "No stock matches the current filters" : "No inventory loaded"}
            hint={report ? "Widen the search, or tick more warehouses." : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead>ItemCode</TableHead>
                  <TableHead className="min-w-[240px]">Item Name</TableHead>
                  <TableHead>SKU</TableHead>
                  {warehouses.map((w) => (
                    <TableHead key={w.code} title={w.name} className="text-right">
                      {w.code}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Grand Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.groups.map((group) => (
                  <Fragment key={group.sub_group}>
                    {/* The variety band: a heading drawn as a row, so it
                        scrolls with the columns it labels. */}
                    <TableRow className="bg-brand-soft/40 hover:bg-brand-soft/40">
                      <TableCell
                        colSpan={columnCount}
                        className="text-[11px] font-semibold uppercase tracking-wider text-brand"
                      >
                        {group.sub_group}
                      </TableCell>
                    </TableRow>
                    {group.items.map((item) => (
                      <TableRow key={item.item_code}>
                        <TableCell className="whitespace-nowrap font-mono text-[12px]">
                          {item.item_code}
                        </TableCell>
                        <TableCell className="text-ink">{item.item_name}</TableCell>
                        <TableCell className="whitespace-nowrap">{item.sku}</TableCell>
                        {warehouses.map((w) => (
                          <TableCell
                            key={w.code}
                            className={cn(numCell, !item.stock[w.code] && "text-subtle")}
                          >
                            {item.stock[w.code] ? formatQty(item.stock[w.code]) : "—"}
                          </TableCell>
                        ))}
                        <TableCell className={cn(numCell, "font-semibold text-ink")}>
                          {formatQty(item.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-surface font-semibold hover:bg-surface">
                      <TableCell />
                      <TableCell className="text-ink">{group.sub_group} Total</TableCell>
                      <TableCell />
                      {warehouses.map((w) => (
                        <TableCell key={w.code} className={cn(numCell, "text-ink")}>
                          {formatQty(group.totals[w.code])}
                        </TableCell>
                      ))}
                      <TableCell className={cn(numCell, "text-ink")}>
                        {formatQty(group.total)}
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
                <TableRow className="border-t-2 border-line-strong bg-surface-strong font-bold hover:bg-surface-strong">
                  <TableCell />
                  <TableCell className="text-ink">GRAND TOTAL</TableCell>
                  <TableCell />
                  {warehouses.map((w) => (
                    <TableCell key={w.code} className={cn(numCell, "text-ink")}>
                      {formatQty(view.totals[w.code])}
                    </TableCell>
                  ))}
                  <TableCell className={cn(numCell, "text-brand")}>
                    {formatQty(view.grandTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </Page>
  );
}
