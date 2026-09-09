/**
 * PersonWise Report — one user's orders over a date range.
 *
 * See `Daily_Report` for the shape shared by the three manager reports. The
 * one real difference here: the report needs a USER before it shows anything,
 * so an empty state says so instead of the table silently not rendering.
 *
 * It was the one report drawing its detail view with `order-items/PartyHeader`
 * and `ItemSection`; those are now unused by anything.
 */
import { useState } from "react";
import { HiOutlineArrowDownTray, HiOutlineCurrencyRupee, HiOutlineDocumentText, HiOutlineUserCircle } from "react-icons/hi2";

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
  FilterDate,
  FilterMultiSelect,
  FilterSearchSelect,
  FilterSelect,
} from "@/components/ui/filter-bar";
import { Card, EmptyState, Page, PageHeader, Stat, StatRow } from "@/components/ui/page";

const now = new Date();
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split("T")[0];

const FOC_OPTIONS = [
  { value: "all", label: "All Orders" },
  { value: "foc", label: "Only FOC" },
  { value: "non_foc", label: "Without FOC" },
] as const;
type FocFilter = (typeof FOC_OPTIONS)[number]["value"];

const ITEMS_PER_PAGE = 10;

export default function PersonWise_Report() {
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [focFilter, setFocFilter] = useState<FocFilter>("all");
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [pageRequest, setPageRequest] = useState({ signature: "", page: 1 });

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

  const filteredOrders = orders.filter((order) => {
    let matchDate = true;
    if (fromDate && toDate) {
      const orderDate = new Date(order.created_at);
      const from = new Date(`${fromDate}T23:59:59.999`);
      const to = new Date(`${toDate}T23:59:59.999`);
      matchDate =
        orderDate >= from &&
        orderDate <= to &&
        (!selectedUserObj || Number(order.created_by) === selectedUserObj.id);
    }
    const matchFoc =
      focFilter === "all" ||
      (focFilter === "foc" && Boolean(order.is_foc)) ||
      (focFilter === "non_foc" && !order.is_foc);
    const matchCategory =
      !selectedCategory || order.items?.some((item) => item.category === selectedCategory);
    return matchDate && matchFoc && matchCategory;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  const filterSignature = JSON.stringify([
    selectedGroups,
    selectedUser,
    selectedCategory,
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
  const isFilterReady = selectedGroups.length > 0;

  const downloadAll = () =>
    downloadOrdersExcel(
      filteredOrders,
      `PersonWise_Report_${selectedUser}_${exportDateStamp()}.xlsx`,
    );

  if (detail.order) {
    return (
      <Page>
        <OrderReportDetail
          order={detail.order}
          reportLabel="PersonWise Report"
          onBack={detail.close}
          onExport={downloadOrderExcel}
        />
      </Page>
    );
  }

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Reports" }, { label: "PersonWise Report" }]} />

      <PageHeader
        title="PersonWise Report"
        description="Every order one user created in a date range. Pick a main group, then the user."
        actions={
          <Button
            variant="primary"
            onClick={downloadAll}
            disabled={!selectedUser || filteredOrders.length === 0}
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
          placeholder="Select main group"
        />
        <FilterSearchSelect
          label="User"
          value={selectedUser}
          onChange={(next) => setSelectedUser(next)}
          options={userNames.map((name) => ({ value: name, label: name }))}
          placeholder={isFilterReady ? "Select a user" : "Select a main group first"}
          searchPlaceholder="Search user…"
          clearLabel="Clear user"
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

      {selectedUser ? (
        <>
          <StatRow>
            <Stat
              icon={HiOutlineDocumentText}
              tone="brand"
              label={`Orders by ${selectedUser}`}
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
              emptyHint={`${selectedUser} created no orders in this range that match the filters.`}
            />
          </Card>
        </>
      ) : (
        /* The report is about one person; until one is chosen there is
           nothing to report. The old page rendered NOTHING below the filters
           here, which read as the page having failed to load. */
        <Card>
          <EmptyState
            icon={HiOutlineUserCircle}
            title="Pick a user to see their orders"
            hint={
              isFilterReady
                ? "Choose a user from the list above."
                : "Start with a main group — the user list is narrowed to it."
            }
          />
        </Card>
      )}
    </Page>
  );
}
