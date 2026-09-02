import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { sapService, type Product, type Party } from "../services/sapService";
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
const NO_PRODUCTS: Product[] = [];
const NO_PARTIES: Party[] = [];

export default function Sales_Report() {
  const { t } = useUILabels();
  const [selectedVariety, setSelectedVariety] = useState<string>("");
  const [selectedParty, setSelectedParty] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [focFilter, setFocFilter] = useState<"all" | "foc" | "non_foc">("all");
  const [partySearch, setPartySearch] = useState<string>("");
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(false);
  const [varietySearch, setVarietySearch] = useState<string>("");
  const [varietyDropdownOpen, setVarietyDropdownOpen] = useState(false);
  const [openFilterDropdown, setOpenFilterDropdown] = useState<string | null>(null);
  // The two lookups only this report needs. Same reason as the shared three:
  // the product catalogue does not change while someone reads a report, and
  // `console.log(data)` in the old parties fetch shipped to production.
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

  // Shared with Daily_Report and PersonWise_Report — see lib/reportQueries.ts.
  const { orders, isOrdersLoading } = useManagerOrders();
  const { users } = useUserList();
  const { items: mainGroup } = useMainGroups();

  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [mgDropdownOpen, setMgDropdownOpen] = useState(false);
  // const [selectedUser] = useState<string>("");
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  /*
   * The page number, stamped with the filters it was chosen under — same
   * pattern as the other two manager reports. Two effects used to keep a bare
   * number in step; deriving it during render does the job in one pass.
   */
  const [pageRequest, setPageRequest] = useState({ signature: "", page: 1 });
  const itemsPerPage = 10;
  const groupRef = useRef<HTMLDivElement>(null);
  const partyDropdownRef = useRef<HTMLDivElement>(null);
  const varietyRef = useRef<HTMLDivElement>(null);

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

      if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) {
        setPartyDropdownOpen(false);
      }

      if (varietyRef.current && !varietyRef.current.contains(event.target as Node)) {
        setVarietyDropdownOpen(false);
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
    const userGroupIds = (u.main_groups || []).map((g) => g.id);

    const matchGroup =
      selectedGroups.length === 0 || selectedGroups.some((id) => userGroupIds.includes(id));

    return matchGroup;
  });

  const allowedUserIds = filteredUsers.map((u) => u.id);
  const normalize = (value?: string | null) => (value || "").toLowerCase().trim();
  const selectedGroupNames = mainGroup
    .filter((group) => selectedGroups.includes(group.id))
    .map((group) => normalize(group.name));

  const filteredPartyOptions = parties.filter((party) => {
    const partyGroup = normalize(party.main_group);

    const matchGroup =
      selectedGroupNames.length === 0 ||
      selectedGroupNames.some(
        (groupName) =>
          partyGroup === groupName ||
          partyGroup.includes(groupName) ||
          groupName.includes(partyGroup),
      );

    return matchGroup;
  });

  const partyDropdownOptions = Array.from(
    new Map(
      filteredPartyOptions
        .filter((party) => party.card_name?.trim() && party.card_code?.trim())
        .map((party) => [party.card_code.trim(), party]),
    ).values(),
  ).sort((a, b) => a.card_name.localeCompare(b.card_name));

  const filteredPartyDropdownOptions = partyDropdownOptions.filter((party) => {
    const search = normalize(partySearch);
    if (!search) return true;

    return (
      normalize(party.card_name).includes(search) || normalize(party.card_code).includes(search)
    );
  });
  /*
   * Narrowing the group list can strip out the party already chosen. That was
   * corrected by an effect writing "" back into state; deriving it does the same
   * in one render pass and leaves the original choice intact if the group filter
   * is cleared again. `partySearch` is the user's own typing, so it is left
   * alone rather than blanked behind their back.
   */
  const activeParty = partyDropdownOptions.some((party) => party.card_code === selectedParty)
    ? selectedParty
    : "";

  const selectedPartyDetails =
    partyDropdownOptions.find((party) => party.card_code === activeParty) || null;

  const toggleGroup = (id: number) => {
    setSelectedGroups((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleAllGroups = () => {
    const allSelected = selectedGroups.length === mainGroup.length;
    setSelectedGroups(allSelected ? [] : mainGroup.map((g) => g.id));
  };

  // const selectedUserObj = filteredUsers.find((u) => u.name === selectedUser);
  // const selectedUsername = selectedUserObj?.username || selectedUserObj?.name || "";

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

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
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
      fileName: `Sales_Report_${exportDateStamp()}.xlsx`,
      sheetName: "All Orders",
      totalsRow: ORDER_TOTALS,
    });
  };

  const uniqueVarieties = [
    ...new Set(
      varietyList.map((v) => v.variety).filter((variety): variety is string => Boolean(variety)),
    ),
  ];

  const filteredVarieties = uniqueVarieties.filter((v) =>
    v.toLowerCase().includes(varietySearch.toLowerCase()),
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

  return (
    <div className="dr-page">
      {/* LIST VIEW */}
      {!showDetails && (
        <>
          <div className="dr-header">
            <h1 className="dr-title">
              Sales Report
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

              {/* Parties */}
              <div className="dr-field">
                <label className="dr-label">Party</label>
                <div
                  className={`sl-party-dropdown${partyDropdownOpen ? " open" : ""}`}
                  ref={partyDropdownRef}
                >
                  <button
                    type="button"
                    className="sl-party-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={partyDropdownOpen}
                    onClick={() => setPartyDropdownOpen((prev) => !prev)}
                  >
                    <span className="sl-party-trigger-text">
                      {selectedPartyDetails ? (
                        <>
                          <span className="sl-party-trigger-label">
                            {selectedPartyDetails.card_name}
                          </span>
                          <span className="sl-party-trigger-code">
                            {selectedPartyDetails.card_code}
                          </span>
                        </>
                      ) : (
                        "--select--"
                      )}
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
                  {partyDropdownOpen && (
                    <div className="sl-party-menu">
                      <div className="sl-party-search-wrap">
                        <input
                          type="text"
                          className="sl-party-search"
                          placeholder="Search party..."
                          aria-label="Search party"
                          value={partySearch}
                          onChange={(e) => setPartySearch(e.target.value)}
                        />
                      </div>
                      <div className="sl-party-options">
                        {filteredPartyDropdownOptions.length > 0 ? (
                          filteredPartyDropdownOptions.map((party) => (
                            <button
                              type="button"
                              key={party.card_code}
                              className="sl-party-option"
                              onClick={() => {
                                setSelectedParty(party.card_code);
                                setPartySearch("");
                                setPartyDropdownOpen(false);
                              }}
                            >
                              <span className="sl-party-option-label">{party.card_name}</span>
                              <span className="sl-party-option-code">{party.card_code}</span>
                            </button>
                          ))
                        ) : (
                          <div className="sl-party-empty">No parties found</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Variety */}
              <div className="dr-field">
                <label className="dr-label">Variety</label>
                <div
                  className={`sl-party-dropdown${varietyDropdownOpen ? " open" : ""}`}
                  ref={varietyRef}
                >
                  <button
                    type="button"
                    className="sl-party-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={varietyDropdownOpen}
                    onClick={() => setVarietyDropdownOpen((prev) => !prev)}
                  >
                    <span className="sl-party-trigger-text">
                      {selectedVariety || "-- Select Variety --"}
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
                  {varietyDropdownOpen && (
                    <div className="sl-party-menu">
                      <div className="sl-party-search-wrap">
                        <input
                          type="text"
                          className="sl-party-search"
                          placeholder="Search variety..."
                          aria-label="Search variety"
                          value={varietySearch}
                          onChange={(e) => setVarietySearch(e.target.value)}
                        />
                      </div>
                      <div className="sl-party-options">
                        <button
                          type="button"
                          className="sl-party-option"
                          aria-label="All varieties"
                          onClick={() => {
                            setSelectedVariety("");
                            setVarietySearch("");
                            setVarietyDropdownOpen(false);
                          }}
                        ></button>
                        {filteredVarieties.length > 0 ? (
                          filteredVarieties.map((variety, index) => (
                            <button
                              type="button"
                              key={index}
                              className="sl-party-option"
                              onClick={() => {
                                setSelectedVariety(variety);
                                setVarietySearch("");
                                setVarietyDropdownOpen(false);
                              }}
                            >
                              <span className="sl-party-option-label">{variety}</span>
                            </button>
                          ))
                        ) : (
                          <div className="sl-party-empty">No varieties found</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* From */}
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
            </div>
          </div>

          {(selectedGroups.length > 0 ||
            activeParty ||
            selectedCategory ||
            selectedVariety ||
            focFilter !== "all") && (
            <div className="dr-report-card">
              <div className="dr-report-header">
                <h2 className="dr-report-title">Orders</h2>
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

      {/* DETAIL VIEW */}
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

          <div className="dr-d-header-card">
            <div className="dr-d-info-grid">
              <div className="dr-d-info-field dr-d-info-span2">
                <span className="dr-d-hf-label">Order Number</span>
                <div className="dr-d-ordnum-row">
                  <span className="dr-d-ordnum">{orderDetails.order_number}</span>
                  <Badge tone={toneForStatus(orderDetails.status_display)}>
                    {orderDetails.status_display}
                  </Badge>
                  {orderDetails.is_foc ? (
                    <span className="dr-foc-badge dr-foc-badge-detail">FOC ORDER</span>
                  ) : null}
                </div>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">Created At</span>
                <span className="dr-d-hf-value">
                  {formatOrderCreatedAt(orderDetails.created_at)}
                </span>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">Delivery Date</span>
                <span className="dr-d-hf-value">{orderDetails.delivery_date || "-"}</span>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">PO Number</span>
                <span className="dr-d-hf-value">{orderDetails.po_number || "-"}</span>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">Party Name</span>
                <span className="dr-d-hf-value">{orderDetails.card_name}</span>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">Card Code</span>
                <span className="dr-d-hf-value">{orderDetails.card_code}</span>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">Bill To</span>
                <span className="dr-d-hf-value">{orderDetails.bill_to_address || "-"}</span>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">Ship To</span>
                <span className="dr-d-hf-value">{orderDetails.ship_to_address || "-"}</span>
              </div>
            </div>
          </div>

          <div className="dr-d-items">
            <div className="dr-d-items-head">
              <span className="dr-d-items-title">Items</span>
              <span className="dr-d-items-count">{selectedItems.length}</span>
            </div>
            <div className="dr-d-items-scroll">
              {selectedItems.length > 0 ? (
                <div className="order-detail-card-list">
                  {selectedItems.map((item, i) => {
                    const schemes = getOrderItemSchemes(item);

                    return (
                      <article
                        className="order-detail-item-card"
                        key={`${item.item_code}-detail-card-${i}`}
                      >
                        {/* <div className="order-detail-item-top">
                          <span className="order-detail-item-index">Item {i + 1}</span>
                          <span className="order-detail-item-code">{item.item_code}</span>
                        </div> */}
                        <div className="order-detail-item-main">
                          <div className="order-detail-item-title-wrap">
                            <span className="order-detail-label">Item Name</span>
                            <h4 className="order-detail-item-title">{item.item_name}</h4>
                          </div>
                          <div className="order-detail-item-tags">
                            <span className="order-detail-item-category">
                              {item.category || "-"}
                            </span>
                            {schemes.map((scheme, schemeIndex) => (
                              <span
                                className="order-detail-scheme-chip"
                                key={`${item.item_code}-scheme-card-${schemeIndex}`}
                              >
                                <em>Sch</em>
                                {scheme.name || "-"} <strong>Qty {scheme.qty || 0}</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="order-detail-item-metrics">
                          <div>
                            <span>Qty</span>
                            <strong>{item.qty}</strong>
                          </div>
                          <div>
                            <span>Pcs</span>
                            <strong>{item.pcs}</strong>
                          </div>
                          <div>
                            <span>Boxes</span>
                            <strong>{Number(item.boxes).toFixed(2)}</strong>
                          </div>
                          <div>
                            <span>Ltrs</span>
                            <strong>{item.ltrs}</strong>
                          </div>
                          {schemes.length > 0 ? (
                            <div>
                              <span>Total Ltrs</span>
                              <strong>{getOrderItemTotalLtrs(item).toFixed(2)}</strong>
                            </div>
                          ) : null}
                          <div>
                            <span>{t("price_list", "Price List (Basic)")}</span>
                            <strong>{Number(item.price_list_basic).toFixed(2)}</strong>
                          </div>
                          <div>
                            <span>Basic Price</span>
                            <strong>{Number(item.basic_price).toFixed(2)}</strong>
                          </div>
                          <div>
                            <span>Tax %</span>
                            <strong>{Number(item.tax_rate).toFixed(2)}</strong>
                          </div>
                          <div className="order-detail-item-amount">
                            <span>Amount</span>
                            <strong>{Number(item.total).toFixed(2)}</strong>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="order-detail-empty">No items found</div>
              )}
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead className="app-col-item">Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Variety</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead>Scheme Qty</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Pcs</TableHead>
                    <TableHead>Boxes</TableHead>
                    <TableHead>Ltrs</TableHead>
                    {/* <TableHead>Scheme Ltrs</TableHead> */}
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
                        <TableCell>{item.variety}</TableCell>
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
                        {/* <TableCell className="text-center">{item.scheme_name ? ((item as any).scheme_ltrs || 0) : "-"}</TableCell> */}
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
                      <TableCell colSpan={15} className="dr-empty">
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
