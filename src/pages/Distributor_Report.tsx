/**
 * Distributor Report — completed distributor (Mart) orders, read from OMS's own
 * order tables (not SAP), aggregated two ways: distributor-wise and SKU/item-wise.
 *
 * One page, two tabs over the SAME payload — the backend returns both rollups in
 * a single response, so switching tabs costs no round trip. Only orders that
 * reached 'Completed' (approved AND posted to SAP) are counted, so the figures
 * reflect what was actually booked.
 *
 * Access is the per-user `Distributor_Report` grant (see routeAccess.ts), the
 * same way the Inventory Report is handed out person-by-person.
 *
 * NOTE: OMS has no dedicated SKU field on order lines (the SKU UDF lives only in
 * SAP), so the SKU tab keys on item code + name — the closest per-product
 * identity OMS holds.
 */
import { useMemo, useState } from "react";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineClipboardDocumentList,
  HiOutlineCurrencyRupee,
  HiOutlineMagnifyingGlass,
  HiOutlineTag,
  HiOutlineUserGroup,
} from "react-icons/hi2";
import { useQuery } from "@tanstack/react-query";

import { ordersService } from "../services/ordersService";
import { startExcelExport, exportDateStamp } from "../utils/excelExport";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  FilterActions,
  FilterBar,
  FilterDate,
  FilterSearch,
  FilterSegmented,
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

const TABS = [
  { value: "distributor", label: "Distributor-wise" },
  { value: "sku", label: "SKU-wise" },
] as const;

type Tab = (typeof TABS)[number]["value"];

// A soft wash per KPI card, so the summary row reads as coloured tiles rather
// than four white boxes — matching the Inventory Report's Mart treatment.
const STAT_BG = [
  "bg-blue-50/70 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900",
  "bg-violet-50/70 border-violet-200 dark:bg-violet-950/30 dark:border-violet-900",
  "bg-amber-50/70 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900",
  "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900",
];

const nf = (value: number): string =>
  (value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const money = (value: number): string =>
  `₹${(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Shared table chrome: a fixed viewport that scrolls with the header pinned.
const SCROLL = "max-h-[30rem] overflow-y-auto rounded-card border border-line";
const HEAD = "sticky top-0 z-10 bg-surface-strong border-b border-line";
const numCell = "text-right tabular-nums";

export default function Distributor_Report() {
  const [tab, setTab] = useState<Tab>("distributor");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const {
    data: report = null,
    isPending: loading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["distributor-report", from, to],
    queryFn: () => ordersService.getDistributorReport({ from, to }),
  });

  const error = isError
    ? "Could not load the Distributor Report. Please try again in a moment."
    : "";

  const term = search.trim().toLowerCase();

  const distRows = useMemo(
    () =>
      (report?.distributors ?? []).filter(
        (d) =>
          !term ||
          d.card_name.toLowerCase().includes(term) ||
          d.card_code.toLowerCase().includes(term),
      ),
    [report, term],
  );

  const skuRows = useMemo(
    () =>
      (report?.skus ?? []).filter(
        (s) =>
          !term ||
          s.item_code.toLowerCase().includes(term) ||
          s.item_name.toLowerCase().includes(term),
      ),
    [report, term],
  );

  const rowCount = tab === "distributor" ? distRows.length : skuRows.length;
  const totals = report?.totals;

  const handleExport = () => {
    if (!report) return;
    let rows: Record<string, unknown>[];
    if (tab === "distributor") {
      rows = distRows.map((d) => ({
        Distributor: d.card_name,
        Code: d.card_code,
        Orders: d.order_count,
        SKUs: d.sku_count,
        Quantity: d.qty,
        Boxes: d.boxes,
        Value: d.value,
      }));
    } else {
      rows = skuRows.map((s) => ({
        "Item Code": s.item_code,
        "Item Name": s.item_name,
        Distributors: s.distributor_count,
        Orders: s.order_count,
        Quantity: s.qty,
        Boxes: s.boxes,
        Value: s.value,
      }));
    }
    startExcelExport(rows, {
      fileName: `Distributor_Report_${tab}_${exportDateStamp()}`,
      sheetName: tab === "distributor" ? "Distributor-wise" : "SKU-wise",
    });
  };

  const empty = !report || rowCount === 0;

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Reports" }, { label: "Distributor Report" }]} />

      <PageHeader
        title="Distributor Report"
        description="Completed distributor (Mart) orders, by distributor and by SKU."
        actions={
          <>
            <Button variant="ghost" onClick={() => void refetch()} disabled={loading}>
              <HiOutlineArrowPath
                aria-hidden="true"
                className={loading ? "motion-safe:animate-spin" : undefined}
              />
              Refresh
            </Button>
            <Button variant="primary" onClick={handleExport} disabled={loading || empty}>
              <HiOutlineArrowDownTray aria-hidden="true" /> Download Excel
            </Button>
          </>
        }
      />

      <FilterBar>
        <FilterSegmented label="View" value={tab} options={TABS} onChange={setTab} />
        <FilterDate label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        <FilterDate label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        <FilterSearch
          label="Search"
          placeholder={tab === "distributor" ? "Distributor or code" : "Item code or name"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
          fieldClassName="min-w-[220px]"
        />
        <FilterActions>
          {report && !loading ? (
            <span className="pb-1.5 text-[11.5px] text-subtle">
              {rowCount} row{rowCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </FilterActions>
      </FilterBar>

      {error ? (
        <Notice tone="bad" title="Could not load report">
          {error}
        </Notice>
      ) : null}

      <StatRow>
        <Stat icon={HiOutlineUserGroup} tone="brand" label="Distributors" value={nf(totals?.distributor_count ?? 0)} loading={loading} className={STAT_BG[0]} />
        <Stat icon={HiOutlineTag} tone="neutral" label="SKUs" value={nf(totals?.sku_count ?? 0)} loading={loading} className={STAT_BG[1]} />
        <Stat icon={HiOutlineClipboardDocumentList} tone="neutral" label="Completed orders" value={nf(totals?.order_count ?? 0)} loading={loading} className={STAT_BG[2]} />
        <Stat icon={HiOutlineCurrencyRupee} tone="brand" label="Total value" value={totals ? money(totals.value) : "₹0"} loading={loading} className={STAT_BG[3]} />
      </StatRow>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="p-4">
            <TableSkeleton columns={6} label="Loading distributor orders" />
          </div>
        ) : empty ? (
          <EmptyState
            icon={HiOutlineMagnifyingGlass}
            title={report ? "No completed orders match the current filters" : "No data loaded"}
            hint={report ? "Widen the date range, or clear the search." : undefined}
          />
        ) : tab === "distributor" ? (
          <Table density="compact" containerClassName={SCROLL}>
            <TableHeader>
              <TableRow className="bg-surface hover:bg-surface">
                <TableHead className={cn("min-w-[260px]", HEAD)}>Distributor</TableHead>
                <TableHead className={HEAD}>Code</TableHead>
                <TableHead className={cn("text-right", HEAD)}>Orders</TableHead>
                <TableHead className={cn("text-right", HEAD)}>SKUs</TableHead>
                <TableHead className={cn("text-right", HEAD)}>Quantity</TableHead>
                <TableHead className={cn("text-right", HEAD)}>Boxes</TableHead>
                <TableHead className={cn("text-right", HEAD)}>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {distRows.map((d, idx) => (
                <TableRow key={d.card_code} className={cn(idx % 2 === 1 && "bg-surface/50")}>
                  <TableCell className="text-ink">{d.card_name}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-[12px]">{d.card_code}</TableCell>
                  <TableCell className={numCell}>{nf(d.order_count)}</TableCell>
                  <TableCell className={numCell}>{nf(d.sku_count)}</TableCell>
                  <TableCell className={numCell}>{nf(d.qty)}</TableCell>
                  <TableCell className={numCell}>{nf(d.boxes)}</TableCell>
                  <TableCell className={cn(numCell, "font-semibold text-ink")}>{money(d.value)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-line-strong bg-surface-strong font-bold hover:bg-surface-strong">
                <TableCell className="text-ink">GRAND TOTAL</TableCell>
                <TableCell />
                <TableCell className={numCell}>{nf(totals?.order_count ?? 0)}</TableCell>
                <TableCell className={numCell}>{nf(totals?.sku_count ?? 0)}</TableCell>
                <TableCell className={numCell}>{nf(totals?.qty ?? 0)}</TableCell>
                <TableCell className={numCell}>{nf(totals?.boxes ?? 0)}</TableCell>
                <TableCell className={cn(numCell, "text-brand")}>{money(totals?.value ?? 0)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <Table density="compact" containerClassName={SCROLL}>
            <TableHeader>
              <TableRow className="bg-surface hover:bg-surface">
                <TableHead className={HEAD}>Item Code</TableHead>
                <TableHead className={cn("min-w-[260px]", HEAD)}>Item Name</TableHead>
                <TableHead className={cn("text-right", HEAD)}>Distributors</TableHead>
                <TableHead className={cn("text-right", HEAD)}>Orders</TableHead>
                <TableHead className={cn("text-right", HEAD)}>Quantity</TableHead>
                <TableHead className={cn("text-right", HEAD)}>Boxes</TableHead>
                <TableHead className={cn("text-right", HEAD)}>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skuRows.map((s, idx) => (
                <TableRow key={s.item_code} className={cn(idx % 2 === 1 && "bg-surface/50")}>
                  <TableCell className="whitespace-nowrap font-mono text-[12px]">{s.item_code}</TableCell>
                  <TableCell className="text-ink">{s.item_name}</TableCell>
                  <TableCell className={numCell}>{nf(s.distributor_count)}</TableCell>
                  <TableCell className={numCell}>{nf(s.order_count)}</TableCell>
                  <TableCell className={numCell}>{nf(s.qty)}</TableCell>
                  <TableCell className={numCell}>{nf(s.boxes)}</TableCell>
                  <TableCell className={cn(numCell, "font-semibold text-ink")}>{money(s.value)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-line-strong bg-surface-strong font-bold hover:bg-surface-strong">
                <TableCell className="text-ink">GRAND TOTAL</TableCell>
                <TableCell />
                <TableCell className={numCell}>{nf(totals?.distributor_count ?? 0)}</TableCell>
                <TableCell className={numCell}>{nf(totals?.order_count ?? 0)}</TableCell>
                <TableCell className={numCell}>{nf(totals?.qty ?? 0)}</TableCell>
                <TableCell className={numCell}>{nf(totals?.boxes ?? 0)}</TableCell>
                <TableCell className={cn(numCell, "text-brand")}>{money(totals?.value ?? 0)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
