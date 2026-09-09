/**
 * Daily Report — today's orders, by main group and user.
 *
 * The first of the three manager reports (with PersonWise and Sales), which
 * were near-copies of one another: the same four pickers, the same table,
 * the same order detail view, the same ninety-line Excel builder. What each
 * page KNOWS — which orders, which filters — stays here; what each page DRAWS
 * is now `components/reports/`, once.
 *
 * The filtering and the stamped page number are untouched: see the note on
 * `pageRequest` for why the page is derived rather than kept in step by
 * effects.
 */
import { useState } from "react";
import { HiOutlineArrowDownTray, HiOutlineCurrencyRupee, HiOutlineDocumentText } from "react-icons/hi2";

import { useManagerOrders } from "@/lib/reportQueries";
import { useMainGroups, useUserList } from "@/lib/authQueries";
import type { Order } from "@/services/ordersService";
import { exportDateStamp } from "@/utils/excelExport";
import { downloadOrderExcel, downloadOrdersExcel } from "@/components/reports/orderExport";
import { OrderReportDetail } from "@/components/reports/OrderReportDetail";
import { ReportOrdersTable } from "@/components/reports/ReportOrdersTable";
import { useOrderDetail } from "@/components/reports/useOrderDetail";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  FilterBar,
  FilterMultiSelect,
  FilterSearchSelect,
  FilterSelect,
} from "@/components/ui/filter-bar";
import { Card, Page, PageHeader, Stat, StatRow } from "@/components/ui/page";

const FOC_OPTIONS = [
  { value: "all", label: "All Orders" },
  { value: "foc", label: "Only FOC" },
  { value: "non_foc", label: "Without FOC" },
] as const;
type FocFilter = (typeof FOC_OPTIONS)[number]["value"];

const ITEMS_PER_PAGE = 10;

export default function Daily_Report() {
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [focFilter, setFocFilter] = useState<FocFilter>("all");
  /*
   * The page number, stamped with the filters it was chosen under.
   *
   * Two effects used to keep a bare number in step — one resetting to 1 when a
   * filter changed, one clamping it when the row count shrank. Both wrote state
   * from inside an effect, costing a second render pass each time. Deriving the
   * page during render does the same job in one.
   */
  const [pageRequest, setPageRequest] = useState({ signature: "", page: 1 });

  // Shared with the other two manager reports — see lib/reportQueries.ts.
  const { orders, isOrdersLoading } = useManagerOrders();
  const { users } = useUserList();
  const { items: mainGroup } = useMainGroups();
  const detail = useOrderDetail();

  const filteredUsers = users.filter((u) => {
    const role = u.role_name?.toLowerCase() || u.role?.toLowerCase();
    if (role !== "manager" && role !== "billing") return false;
    const userGroupIds = (u.main_groups || []).map((g) => g.id);
    if (selectedGroups.length > 0 && !selectedGroups.some((id) => userGroupIds.includes(id))) {
      return false;
    }
    return true;
  });
  const userNames = [...new Set(filteredUsers.map((u) => u.name))];
  const selectedUserObj = filteredUsers.find((u) => u.name === selectedUser);

  const categoryOptions = [
    ...new Set(
      orders
        .flatMap((order) => order.items || [])
        .map((item) => item.category)
        .filter((category): category is string => Boolean(category)),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const today = new Date().toISOString().split("T")[0];
  const todaysOrders = orders.filter((o) => o.created_at?.startsWith(today));
  const userFilteredOrders = selectedUser
    ? todaysOrders.filter((o) => Number(o.created_by) === selectedUserObj?.id)
    : todaysOrders;

  const filteredOrders = userFilteredOrders.filter((order) => {
    const matchFoc =
      focFilter === "all" ||
      (focFilter === "foc" && Boolean(order.is_foc)) ||
      (focFilter === "non_foc" && !order.is_foc);
    const matchCategory =
      !selectedCategory || order.items?.some((item) => item.category === selectedCategory);
    return matchFoc && matchCategory;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  const filterSignature = JSON.stringify([
    selectedGroups,
    selectedUser,
    selectedCategory,
    focFilter,
    orders,
  ]);
  // Clamped as well as stamped: the row count can shrink without any filter
  // changing, when a refetch returns fewer orders.
  const currentPage =
    pageRequest.signature === filterSignature ? Math.min(pageRequest.page, totalPages) : 1;
  const setCurrentPage = (page: number) => setPageRequest({ signature: filterSignature, page });
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const totalAmount = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const isFilterReady = selectedGroups.length > 0;

  const downloadAll = () =>
    downloadOrdersExcel(
      filteredOrders,
      `Daily_Report_${selectedUser}_${exportDateStamp()}.xlsx`,
    );

  if (detail.order) {
    return (
      <Page>
        <OrderReportDetail
          order={detail.order}
          reportLabel="Daily Report"
          onBack={detail.close}
          onExport={downloadOrderExcel}
        />
      </Page>
    );
  }

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Reports" }, { label: "Daily Report" }]} />

      <PageHeader
        title="Daily Report"
        description={`Orders created today, ${today}. Pick a main group to narrow to its users.`}
        actions={
          <Button variant="primary" onClick={downloadAll} disabled={filteredOrders.length === 0}>
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
          placeholder="Select main group"
        />
        <FilterSearchSelect
          label="User"
          value={selectedUser}
          onChange={(next) => setSelectedUser(next)}
          options={userNames.map((name) => ({ value: name, label: name }))}
          placeholder={isFilterReady ? "All users" : "Select a main group first"}
          searchPlaceholder="Search user…"
          clearLabel="All users"
          emptyText="No users found"
          disabled={!isFilterReady}
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
          fieldClassName="max-w-[170px] flex-none"
        >
          {FOC_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      <StatRow>
        <Stat
          icon={HiOutlineDocumentText}
          tone="brand"
          label={selectedUser ? `Orders by ${selectedUser}` : "Today's orders"}
          value={filteredOrders.length}
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
          emptyHint="No orders have been created today that match these filters."
        />
      </Card>
    </Page>
  );
}
