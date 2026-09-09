/**
 * Sales Report — orders by group, party, variety and category over a range.
 *
 * See `Daily_Report` for the shape shared by the three manager reports. This
 * one has the most filters, and shows nothing until at least one is set — a
 * report over every order the company has ever taken is not a report.
 *
 * Two of its pickers were searchable dropdowns with an oddity each: the
 * Variety list's "all" row was a `<button>` with NO TEXT (only an aria-label,
 * so it was an invisible clickable gap at the top of the menu), and the Party
 * trigger drew name and code on two lines inside a 36px control. Both are
 * `SearchSelect` now — the clear row has a label, and the code is a hint.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HiOutlineArrowDownTray, HiOutlineCurrencyRupee, HiOutlineDocumentText, HiOutlineFunnel } from "react-icons/hi2";

import { useManagerOrders } from "@/lib/reportQueries";
import { useMainGroups, useUserList } from "@/lib/authQueries";
import type { Order } from "@/services/ordersService";
import { sapService, type Party, type Product } from "@/services/sapService";
import { exportDateStamp } from "@/utils/excelExport";
import { downloadOrderExcel, downloadOrdersExcel } from "@/components/reports/orderExport";
import { OrderReportDetail } from "@/components/reports/OrderReportDetail";
import { ReportOrdersTable } from "@/components/reports/ReportOrdersTable";
import { useOrderDetail } from "@/components/reports/useOrderDetail";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  FilterBar,
  FilterDate,
  FilterMultiSelect,
  FilterSearchSelect,
  FilterSelect,
} from "@/components/ui/filter-bar";
import { Card, EmptyState, Page, PageHeader, Stat, StatRow } from "@/components/ui/page";

const now = new Date();
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split("T")[0];

const NO_PRODUCTS: Product[] = [];
const NO_PARTIES: Party[] = [];

const FOC_OPTIONS = [
  { value: "all", label: "All Orders" },
  { value: "foc", label: "Only FOC" },
  { value: "non_foc", label: "Without FOC" },
] as const;
type FocFilter = (typeof FOC_OPTIONS)[number]["value"];

const ITEMS_PER_PAGE = 10;

const normalize = (value?: string | null) => (value || "").toLowerCase().trim();

export default function Sales_Report() {
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [selectedParty, setSelectedParty] = useState<string>("");
  const [selectedVariety, setSelectedVariety] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [focFilter, setFocFilter] = useState<FocFilter>("all");
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [pageRequest, setPageRequest] = useState({ signature: "", page: 1 });

  // The two lookups only this report needs. Same reason as the shared three:
  // the product catalogue does not change while someone reads a report.
  const { data: varietyList = NO_PRODUCTS } = useQuery({
    queryKey: ["sap-products"],
    queryFn: async () => ((await sapService.getProducts()) ?? []) as Product[],
  });
  const { data: parties = NO_PARTIES } = useQuery({
    queryKey: ["sap-parties"],
    queryFn: async () => {
      const data = await sapService.getParties();
      return (Array.isArray(data) ? data : []) as Party[];
    },
  });

  const { orders, isOrdersLoading } = useManagerOrders();
  const { users } = useUserList();
  const { items: mainGroup } = useMainGroups();
  const detail = useOrderDetail();

  const filteredUsers = users.filter((u) => {
    const userGroupIds = (u.main_groups || []).map((g) => g.id);
    return selectedGroups.length === 0 || selectedGroups.some((id) => userGroupIds.includes(id));
  });
  const allowedUserIds = filteredUsers.map((u) => u.id);

  const selectedGroupNames = mainGroup
    .filter((group) => selectedGroups.includes(group.id))
    .map((group) => normalize(group.name));

  const partyOptions = Array.from(
    new Map(
      parties
        .filter((party) => {
          const partyGroup = normalize(party.main_group);
          return (
            selectedGroupNames.length === 0 ||
            selectedGroupNames.some(
              (groupName) =>
                partyGroup === groupName ||
                partyGroup.includes(groupName) ||
                groupName.includes(partyGroup),
            )
          );
        })
        .filter((party) => party.card_name?.trim() && party.card_code?.trim())
        .map((party) => [party.card_code.trim(), party]),
    ).values(),
  ).sort((a, b) => a.card_name.localeCompare(b.card_name));

  /*
   * Narrowing the group list can strip out the party already chosen. That was
   * corrected by an effect writing "" back into state; deriving it does the
   * same in one render pass and leaves the original choice intact if the
   * group filter is cleared again.
   */
  const activeParty = partyOptions.some((party) => party.card_code === selectedParty)
    ? selectedParty
    : "";

  const varieties = [
    ...new Set(
      varietyList.map((v) => v.variety).filter((variety): variety is string => Boolean(variety)),
    ),
  ];

  const categoryOptions = [
    ...new Set(
      orders
        .flatMap((order) => order.items || [])
        .map((item) => item.category)
        .filter((category): category is string => Boolean(category)),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const filteredOrders = orders.filter((order) => {
    const orderDate = new Date(order.created_at);
    const matchDate =
      !fromDate ||
      !toDate ||
      (orderDate >= new Date(`${fromDate}T00:00:00.000`) &&
        orderDate <= new Date(`${toDate}T23:59:59.999`));
    const matchVariety =
      !selectedVariety || order.items?.some((item) => item.variety === selectedVariety);
    const matchCategory =
      !selectedCategory || order.items?.some((item) => item.category === selectedCategory);
    const matchUser =
      allowedUserIds.length === 0 || allowedUserIds.includes(Number(order.created_by));
    const matchParty =
      !activeParty ||
      normalize(order.card_code) === normalize(activeParty) ||
      normalize(order.card_name) === normalize(activeParty);
    const matchFoc =
      focFilter === "all" ||
      (focFilter === "foc" && Boolean(order.is_foc)) ||
      (focFilter === "non_foc" && !order.is_foc);
    return matchDate && matchVariety && matchCategory && matchUser && matchParty && matchFoc;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  const filterSignature = JSON.stringify([
    selectedGroups,
    activeParty,
    selectedCategory,
    selectedVariety,
    focFilter,
    fromDate,
    toDate,
    orders,
  ]);
  const currentPage =
    pageRequest.signature === filterSignature ? Math.min(pageRequest.page, totalPages) : 1;
  const setCurrentPage = (page: number) => setPageRequest({ signature: filterSignature, page });
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const totalAmount = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const hasFilter =
    selectedGroups.length > 0 ||
    Boolean(activeParty) ||
    Boolean(selectedCategory) ||
    Boolean(selectedVariety) ||
    focFilter !== "all";

  const downloadAll = () =>
    downloadOrdersExcel(filteredOrders, `Sales_Report_${exportDateStamp()}.xlsx`);

  if (detail.order) {
    return (
      <Page>
        <OrderReportDetail
          order={detail.order}
          reportLabel="Sales Report"
          onBack={detail.close}
          onExport={downloadOrderExcel}
          variety
        />
      </Page>
    );
  }

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Reports" }, { label: "Sales Report" }]} />

      <PageHeader
        title="Sales Report"
        description="Orders in a date range, narrowed by group, party, variety or category."
        actions={
          <Button
            variant="primary"
            onClick={downloadAll}
            disabled={!hasFilter || filteredOrders.length === 0}
          >
            <HiOutlineArrowDownTray aria-hidden="true" /> Download All
          </Button>
        }
      />

      <FilterBar>
        <FilterMultiSelect
          label="Main Group"
          value={selectedGroups}
          onChange={setSelectedGroups}
          options={mainGroup.map((g) => ({ value: g.id, label: g.name }))}
          placeholder="All groups"
        />
        <FilterSearchSelect
          label="Party"
          value={activeParty}
          onChange={(next) => setSelectedParty(next)}
          options={partyOptions.map((party) => ({
            value: party.card_code,
            label: party.card_name,
            hint: party.card_code,
          }))}
          placeholder="All parties"
          searchPlaceholder="Search party or code…"
          clearLabel="All parties"
          emptyText="No parties found"
          fieldClassName="min-w-[220px]"
        />
        <FilterSearchSelect
          label="Variety"
          value={selectedVariety}
          onChange={(next) => setSelectedVariety(next)}
          options={varieties.map((variety) => ({ value: variety, label: variety }))}
          placeholder="All varieties"
          searchPlaceholder="Search variety…"
          clearLabel="All varieties"
          emptyText="No varieties found"
        />
        <FilterSelect
          label="Category"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="FOC"
          value={focFilter}
          onChange={(e) => setFocFilter(e.target.value as FocFilter)}
          fieldClassName="max-w-[150px] flex-none"
        >
          {FOC_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterDate label="From" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <FilterDate label="To" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </FilterBar>

      {hasFilter ? (
        <>
          <StatRow>
            <Stat
              icon={HiOutlineDocumentText}
              tone="brand"
              label="Orders"
              value={filteredOrders.length}
              hint={`${fromDate} to ${toDate}`}
              loading={isOrdersLoading}
            />
            <Stat
              icon={HiOutlineCurrencyRupee}
              tone="neutral"
              label="Total amount"
              value={totalAmount.toFixed(2)}
              loading={isOrdersLoading}
            />
          </StatRow>

          <Card className="overflow-hidden p-0">
            <ReportOrdersTable
              orders={paginatedOrders}
              loading={isOrdersLoading}
              page={currentPage}
              pageSize={ITEMS_PER_PAGE}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              onView={(order: Order) => void detail.open(order.id)}
              onDownload={downloadOrderExcel}
              viewingId={detail.loadingId}
              emptyHint="No orders in this range match the filters."
            />
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={HiOutlineFunnel}
            title="Set a filter to build the report"
            hint="Pick a main group, party, variety, category or FOC option above. The date range alone is not a report."
          />
        </Card>
      )}
    </Page>
  );
}
