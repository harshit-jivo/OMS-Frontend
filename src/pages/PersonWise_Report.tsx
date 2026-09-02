import { useState, useEffect, useRef } from "react";
import { useManagerOrders } from "@/lib/reportQueries";
import { useMainGroups, useUserList } from "@/lib/authQueries";
import type { Order, OrderItem } from "../services/ordersService";
import {
  formatOrderCreatedAt,
  getOrderItemSchemeNames,
  getOrderItemSchemes,
  getOrderItemSchemeQtyText,
  getOrderItemTotalLtrs,
  ordersService,
} from "../services/ordersService";
import { startExcelExport, exportDateStamp } from "../utils/excelExport";
import { useUILabels } from "../services/uiConfig";
import "../styles/Report.css";
import ItemSection from "../components/order-items/ItemSection";
import PartyHeader from "../components/order-items/PartyHeader";
import { Badge } from "@/components/ui/badge";
import { toneForStatus } from "@/components/ui/statusTone";
import {
  HiEye, // View
  HiArrowDownTray, // Download
} from "react-icons/hi2";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";

const now = new Date();

// First day of current month
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

// Last day of current month
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split("T")[0];

/** Stable empties: a new [] each render would re-run every useMemo below. */

export default function PersonWise_Report() {
  const { t } = useUILabels();
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [mgDropdownOpen, setMgDropdownOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [userSearch, setUserSearch] = useState("");
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [focFilter, setFocFilter] = useState<"all" | "foc" | "non_foc">("all");
  const [openFilterDropdown, setOpenFilterDropdown] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  /*
   * The page number, stamped with the filters it was chosen under.
   *
   * Two effects used to keep a bare number in step — one resetting to 1 when a
   * filter changed, one clamping it when the row count shrank. Both wrote state
   * from inside an effect, costing a second render pass each time. Deriving the
   * page during render does the same job in one.
   *
   * These effects predate this work; moving the fetches to useQuery is what let
   * the linter see them, because the unanalysable fetch effect above them went.
   */
  const [pageRequest, setPageRequest] = useState({ signature: "", page: 1 });
  // Shared with the other two manager reports — see lib/reportQueries.ts.
  const { orders, isOrdersLoading } = useManagerOrders();
  const { users } = useUserList();
  const { items: mainGroup } = useMainGroups();

  const itemsPerPage = 10;
  const groupRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  const fetchOrderDetails = async (orderId: number) => {
    try {
      const data = await ordersService.getOrderDetails(orderId);

      setOrderDetails(data);
      setSelectedItems(data.items || []);
      setShowDetails(true);
    } catch (error) {
      console.log("Error fetching order details:", error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(event.target as Node)) {
        setMgDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
      if (!(event.target as Element).closest(".dr-choice")) {
        setOpenFilterDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredUsers = users.filter((u) => {
    const role = u.role_name?.toLowerCase() || u.role?.toLowerCase();
    if (role !== "manager" && role !== "billing") return false;

    const userGroupIds = (u.main_groups || []).map((g) => g.id);

    if (selectedGroups.length > 0) {
      const hasGroup = selectedGroups.some((id) => userGroupIds.includes(id));
      if (!hasGroup) return false;
    }

    return true;
  });

  const userNames = [...new Set(filteredUsers.map((u) => u.name))];
  const searchedUserNames = userNames.filter((name) =>
    name.toLowerCase().includes(userSearch.trim().toLowerCase()),
  );

  const categoryOptions = [
    ...new Set(
      orders
        .flatMap((order) => order.items || [])
        .map((item) => item.category)
        .filter((category): category is string => Boolean(category)),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const focOptions = [
    { value: "all", label: "All Orders" },
    { value: "foc", label: "Only FOC" },
    { value: "non_foc", label: "Without FOC" },
  ] as const;

  const toggleGroup = (id: number) => {
    setSelectedGroups((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleAllGroups = () => {
    const allSelected = selectedGroups.length === mainGroup.length;
    setSelectedGroups(allSelected ? [] : mainGroup.map((g) => g.id));
  };

  const selectedUserObj = filteredUsers.find((u) => u.name === selectedUser);

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

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const filterSignature = JSON.stringify([
    selectedGroups,
    selectedUser,
    selectedCategory,
    focFilter,
    fromDate,
    toDate,
    orders,
  ]);
  // Clamped as well as stamped: the row count can shrink without any filter
  // changing, when a refetch returns fewer orders.
  const currentPage =
    pageRequest.signature === filterSignature ? Math.min(pageRequest.page, totalPages) : 1;
  const setCurrentPage = (page: number) => setPageRequest({ signature: filterSignature, page });

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // const viewOrderDetails = (order: Order) => {
  //   setOrderDetails(order);
  //   setSelectedItems(order.items || []);
  //   setShowDetails(true);

  // };

  // Raw values only — exportToExcel infers the Excel type per column, so dates
  // stay dates and money stays numeric and summable.
  const buildOrderRows = (order: Order): Record<string, unknown>[] => {
    if (!order.items || order.items.length === 0) {
      return [
        {
          "Order Number": order.order_number,
          "Card Code": order.card_code,
          "Card Name": order.card_name,
          "Created At": order.created_at,
          "Bill To": order.bill_to_address,
          "Ship To": order.ship_to_address,
          "Delivery Date": order.delivery_date,
          Status: order.status_display,
          FOC: Boolean(order.is_foc),
          // Item columns are held open so an order with no line items still
          // produces the same sheet layout as every other export.
          "Item Code": null,
          "Item Name": null,
          Scheme: null,
          "Scheme Qty": null,
          Qty: null,
          Boxes: null,
          Liters: null,
          "Total Ltrs": null,
          "Price List (Basic)": null,
          "Basic Price": null,
          "Tax Rate": null,
          "Total Amount": null,
          "Grand Total": null,
        },
      ];
    }

    return order.items.map((item: OrderItem) => {
      const total = Number(item.total || 0);
      const taxRate = Number(item.tax_rate || 0);
      return {
        "Order Number": order.order_number,
        "Card Code": order.card_code,
        "Card Name": order.card_name,
        "Created At": order.created_at,
        "Bill To": order.bill_to_address,
        "Ship To": order.ship_to_address,
        "Delivery Date": order.delivery_date,
        Status: order.status_display,
        FOC: Boolean(order.is_foc),
        "Item Code": item.item_code,
        "Item Name": item.item_name,
        Scheme: getOrderItemSchemeNames(item),
        "Scheme Qty": getOrderItemSchemeQtyText(item),
        Qty: item.qty,
        Boxes: item.boxes,
        Liters: item.ltrs,
        "Total Ltrs": getOrderItemTotalLtrs(item),
        "Price List (Basic)": item.price_list_basic,
        "Basic Price": item.basic_price,
        "Tax Rate": taxRate,
        "Total Amount": total,
        "Grand Total": total + (total * taxRate) / 100,
      };
    });
  };

  const ORDER_TOTALS = {
    sum: ["Total Amount", "Grand Total"],
    labelColumn: "Tax Rate",
    label: "TOTAL",
  };

  const downloadExcel = (order: Order) => {
    startExcelExport(buildOrderRows(order), {
      fileName: `Order_${order.order_number}.xlsx`,
      sheetName: "Order Details",
      totalsRow: ORDER_TOTALS,
    });
  };

  const downloadAllExcel = () => {
    if (filteredOrders.length === 0) return;
    startExcelExport(filteredOrders.flatMap(buildOrderRows), {
      fileName: `PersonWise_Report_${selectedUser}_${exportDateStamp()}.xlsx`,
      sheetName: "All Orders",
      totalsRow: ORDER_TOTALS,
    });
  };

  const isFilterReady = selectedGroups.length > 0;

  return (
    <div className="dr-page">
      {/* â”€â”€ LIST VIEW â”€â”€ */}
      {!showDetails && (
        <>
          <div className="dr-header">
            <h1 className="dr-title">
              PersonWise Report
            </h1>
          </div>

          <div className="dr-filter-card">
            <div className="dr-filter-row">
              {/* Main Group */}
              <div className="dr-field">
                <label className="dr-label">Main Group</label>
                <div className={`dr-dropdown${mgDropdownOpen ? " open" : ""}`} ref={groupRef}>
                  <div
                    className="dr-dropdown-trigger"
                    role="button"
                    tabIndex={0}
                    aria-haspopup="true"
                    aria-expanded={mgDropdownOpen}
                    onClick={() => setMgDropdownOpen((v) => !v)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setMgDropdownOpen((v) => !v);
                      }
                    }}
                  >
                    {selectedGroups.length === 1
                      ? mainGroup.find((g) => g.id === selectedGroups[0])?.name || "1 selected"
                      : selectedGroups.length > 1
                        ? `${selectedGroups.length} selected`
                        : "Select Main Group"}
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke="#64748b"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  {mgDropdownOpen && (
                    <div className="dr-dropdown-menu">
                      <label className="dr-dropdown-item dr-select-all">
                        <input
                          type="checkbox"
                          checked={
                            mainGroup.length > 0 && selectedGroups.length === mainGroup.length
                          }
                          onChange={toggleAllGroups}
                        />
                        Select All
                      </label>
                      {mainGroup.map((g) => (
                        <label key={g.id} className="dr-dropdown-item">
                          <input
                            type="checkbox"
                            checked={selectedGroups.includes(g.id)}
                            onChange={() => toggleGroup(g.id)}
                          />
                          {g.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* User */}
              <div className="dr-field">
                <label className="dr-label">User</label>
                <div
                  className={`sl-party-dropdown${userDropdownOpen ? " open" : ""}`}
                  ref={userDropdownRef}
                  style={!isFilterReady ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                >
                  <button
                    type="button"
                    className="sl-party-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={userDropdownOpen}
                    onClick={() => isFilterReady && setUserDropdownOpen((prev) => !prev)}
                    disabled={!isFilterReady}
                  >
                    <span>
                      {selectedUser ||
                        (!isFilterReady ? "Select Main Group first" : "-- Select User --")}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke="#64748b"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {userDropdownOpen && (
                    <div className="sl-party-menu">
                      <div className="sl-party-search-wrap">
                        <input
                          type="text"
                          className="sl-party-search"
                          placeholder="Search user..."
                          aria-label="Search user"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                        />
                      </div>
                      <div className="sl-party-options">
                        <button
                          type="button"
                          className="sl-party-option"
                          onClick={() => {
                            setSelectedUser("");
                            setUserSearch("");
                            setUserDropdownOpen(false);
                          }}
                        >
                          <span className="sl-party-option-label">All Users</span>
                        </button>
                        {searchedUserNames.length > 0 ? (
                          searchedUserNames.map((name, index) => (
                            <button
                              type="button"
                              key={index}
                              className="sl-party-option"
                              onClick={() => {
                                setSelectedUser(name);
                                setUserSearch("");
                                setUserDropdownOpen(false);
                              }}
                            >
                              <span className="sl-party-option-label">{name}</span>
                            </button>
                          ))
                        ) : (
                          <div className="sl-party-empty">No users found</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="dr-field">
                <label className="dr-label">Category</label>
                <div className={`dr-choice${openFilterDropdown === "category" ? " open" : ""}`}>
                  <button
                    type="button"
                    className="dr-choice-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={openFilterDropdown === "category"}
                    onClick={() =>
                      setOpenFilterDropdown((current) =>
                        current === "category" ? null : "category",
                      )
                    }
                  >
                    <span>{selectedCategory || "All Categories"}</span>
                    <span className="dr-choice-caret">⌄</span>
                  </button>
                  {openFilterDropdown === "category" ? (
                    <div className="dr-choice-menu">
                      <button
                        type="button"
                        className={`dr-choice-option${!selectedCategory ? " is-selected" : ""}`}
                        onClick={() => {
                          setSelectedCategory("");
                          setOpenFilterDropdown(null);
                        }}
                      >
                        All Categories
                      </button>
                      {categoryOptions.map((category) => (
                        <button
                          type="button"
                          key={category}
                          className={`dr-choice-option${selectedCategory === category ? " is-selected" : ""}`}
                          onClick={() => {
                            setSelectedCategory(category);
                            setOpenFilterDropdown(null);
                          }}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="dr-field">
                <label className="dr-label">FOC</label>
                <div className={`dr-choice${openFilterDropdown === "foc" ? " open" : ""}`}>
                  <button
                    type="button"
                    className="dr-choice-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={openFilterDropdown === "foc"}
                    onClick={() =>
                      setOpenFilterDropdown((current) => (current === "foc" ? null : "foc"))
                    }
                  >
                    <span>
                      {focOptions.find((option) => option.value === focFilter)?.label ||
                        "All Orders"}
                    </span>
                    <span className="dr-choice-caret">⌄</span>
                  </button>
                  {openFilterDropdown === "foc" ? (
                    <div className="dr-choice-menu">
                      {focOptions.map((option) => (
                        <button
                          type="button"
                          key={option.value}
                          className={`dr-choice-option${focFilter === option.value ? " is-selected" : ""}`}
                          onClick={() => {
                            setFocFilter(option.value);
                            setOpenFilterDropdown(null);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* From */}
              <div className="dr-field">
                <label className="dr-label">From</label>
                <input aria-label="From"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="dr-date-input"
                />
              </div>

              {/* To */}
              <div className="dr-field">
                <label className="dr-label">To</label>
                <input aria-label="To"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="dr-date-input"
                />
              </div>
            </div>
          </div>

          {/* Orders Report of show today's orders by default */}
          {selectedUser && (
            <div className="dr-report-card">
              <div className="dr-report-header">
                <h2 className="dr-report-title">
                  {selectedUser ? `Orders of ${selectedUser}` : null}
                </h2>
                <div className="dr-report-stats">
                  <span className="dr-stat">
                    Total Orders: <strong>{filteredOrders.length}</strong>
                  </span>
                  <span className="dr-stat">
                    Total Amount:{" "}
                    <strong>
                      {filteredOrders
                        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
                        .toFixed(2)}
                    </strong>
                  </span>
                  <button
                    className="dr-d-export"
                    onClick={downloadAllExcel}
                    disabled={filteredOrders.length === 0}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M7 1v8m0 0L4 6.5M7 9l3-2.5M2.5 12h9"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Download All
                  </button>
                </div>
              </div>

              {isOrdersLoading ? (
                <TableSkeleton columns={8} label="Loading orders" />
              ) : filteredOrders.length > 0 ? (
                <div className="dr-table-wrap">
                  <Table density="compact">
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Order Number</TableHead>
                        <TableHead>Card Code</TableHead>
                        <TableHead>Card Name</TableHead>
                        <TableHead>Created At</TableHead>
                        <TableHead>Delivery Date</TableHead>
                        <TableHead>FOC</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Generate Report</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedOrders.map((order, i) => (
                        <TableRow key={order.id} className={order.is_foc ? "dr-foc-row" : ""}>
                          <TableCell className="dr-muted">
                            {(currentPage - 1) * itemsPerPage + i + 1}
                          </TableCell>
                          <TableCell className="dr-bold">{order.order_number}</TableCell>
                          <TableCell>{order.card_code}</TableCell>
                          <TableCell>{order.card_name}</TableCell>
                          <TableCell>{formatOrderCreatedAt(order.created_at)}</TableCell>
                          <TableCell>{order.delivery_date}</TableCell>
                          <TableCell>
                            {order.is_foc ? (
                              <span className="dr-foc-badge">FOC</span>
                            ) : (
                              <span className="dr-foc-empty">No</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge tone={toneForStatus(order.status_display)}>
                              {order.status_display}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <button
                              className="ao-btn-icon view"
                              aria-label="View order details"
                              title="View Order"
                              onClick={() => fetchOrderDetails(order.id)}
                            >
                              {" "}
                              <HiEye size={22} />
                            </button>
                          </TableCell>
                          <TableCell>
                            <button
                              className="ao-btn-icon download"
                              aria-label="Download order"
                              title="Download Order"
                              onClick={() => downloadExcel(order)}
                            >
                              <HiArrowDownTray size={22} />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="dr-empty">
                  No orders found
                </div>
              )}
              {filteredOrders.length > itemsPerPage && (
                <Pagination
                  page={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* â”€â”€ DETAIL VIEW â”€â”€ */}
      {showDetails && orderDetails && (
        <div className="dr-detail">
          <div className="dr-d-nav">
            <button className="dr-d-back" onClick={() => setShowDetails(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 13L5 8l5-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back to Report
            </button>
            <button className="dr-d-export" onClick={() => downloadExcel(orderDetails)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 1v8m0 0L4 6.5M7 9l3-2.5M2.5 12h9"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Export Excel
            </button>
          </div>

          <PartyHeader order={orderDetails} />

          <div className="dr-d-items">
            <div className="dr-d-items-head">
              <span className="dr-d-items-title">Items</span>
              <span className="dr-d-items-count">{selectedItems.length}</span>
            </div>
            <div className="dr-d-items-scroll">
              <ItemSection items={selectedItems} />
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead className="app-col-item">Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead>Scheme Qty</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Pcs</TableHead>
                    <TableHead>Boxes</TableHead>
                    <TableHead>Ltrs</TableHead>
                    {/* <TableHead>Scheme Ltrs</TableHead>*/}
                    <TableHead>Total Ltrs</TableHead>
                    <TableHead>{t("price_list", "Price List (Basic)")}</TableHead>
                    <TableHead>Basic Price</TableHead>
                    <TableHead>Tax %</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedItems.length > 0 ? (
                    selectedItems.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-center app-cell-index">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <span className="dr-d-item-code">{item.item_code}</span>
                        </TableCell>
                        <TableCell className="app-col-item app-cell-name">
                          {item.item_name}
                        </TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell colSpan={2}>
                          {getOrderItemSchemes(item).length > 0 ? (
                            <div className="order-scheme-stack" aria-label="Applied schemes">
                              {getOrderItemSchemes(item).map((scheme, schemeIndex) => (
                                <div
                                  className="order-scheme-chip"
                                  key={`${item.item_code}-scheme-${schemeIndex}`}
                                >
                                  <span className="order-scheme-name">{scheme.name || "-"}</span>
                                  <span className="order-scheme-qty">Qty {scheme.qty || 0}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="order-scheme-empty">No scheme</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{item.qty}</TableCell>
                        <TableCell className="text-center">{item.pcs}</TableCell>
                        <TableCell className="text-center">
                          {Number(item.boxes).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">{item.ltrs}</TableCell>
                        {/* <TableCell style={{textAlign:'center'}}>{item.scheme_name ? ((item as any).scheme_ltrs || 0) : "-"}</TableCell> */}
                        <TableCell className="text-center">
                          {getOrderItemTotalLtrs(item).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(item.price_list_basic).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(item.basic_price).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          {Number(item.tax_rate).toFixed(2)}
                        </TableCell>
                        <TableCell
                          className="text-right app-cell-total"
                        >
                          {Number(item.total).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={14} className="dr-empty">
                        No items found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="dr-d-summary">
            <div className="dr-d-sum-row">
              <span className="dr-d-sum-label">Total Ltrs</span>
              <span className="dr-d-sum-val">
                {selectedItems.reduce((s, i) => s + getOrderItemTotalLtrs(i), 0).toFixed(2)}
              </span>
            </div>
            <div className="dr-d-sum-row">
              <span className="dr-d-sum-label">Subtotal</span>
              <span className="dr-d-sum-val">
                {selectedItems.reduce((s, i) => s + Number(i.total || 0), 0).toFixed(2)}
              </span>
            </div>
            <div className="dr-d-sum-row">
              <span className="dr-d-sum-label">Tax</span>
              <span className="dr-d-sum-val">
                {selectedItems
                  .reduce((s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0)) / 100, 0)
                  .toFixed(2)}
              </span>
            </div>
            {[
              {
                label: "Commodity",
                value: orderDetails.vareity_cost?.commodity_price,
                cls: "vc-commodity",
              },
              { label: "Other", value: orderDetails.vareity_cost?.other_total, cls: "vc-other" },
              {
                label: "Premium",
                value: orderDetails.vareity_cost?.premium_total,
                cls: "vc-premium",
              },
            ]
              .filter((entry) => Number(entry.value) > 0)
              .map((entry) => (
                <div className="dr-d-sum-row" key={entry.label}>
                  <span className={`dr-d-sum-label vc-pill ${entry.cls}`}>{entry.label}</span>
                  <span className="dr-d-sum-val">{Number(entry.value).toFixed(2)}</span>
                </div>
              ))}
            <div className="dr-d-sum-row dr-d-sum-grand">
              <span className="dr-d-sum-label">Grand Total</span>
              <span className="dr-d-sum-val">
                {(
                  selectedItems.reduce((s, i) => s + Number(i.total || 0), 0) +
                  selectedItems.reduce(
                    (s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0)) / 100,
                    0,
                  )
                ).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
