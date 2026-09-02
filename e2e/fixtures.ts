/**
 * API responses for the visual suite.
 *
 * WHY THESE EXIST AT ALL
 * ----------------------
 * The first version of this harness answered every request with `[]`. Seven
 * pages promptly threw — `Cannot read properties of undefined (reading
 * 'filter')` and friends — because they read a field off an envelope object
 * that a bare array does not have. Without a guard those seven crash screens
 * were captured as baselines and the suite passed twice.
 *
 * So each entry below is not decoration: it is the shape that page's endpoint
 * actually returns, read out of the code that consumes it. Every fixture cites
 * the line it was derived from, because the second version of this file guessed
 * at a few and broke a page that had been working — a uniform `{data: ...}`
 * envelope over the `/auth/` lookups turned App_User and Add_Sales into
 * `X.find is not a function`. Only ONE of those endpoints is enveloped.
 * Symmetry is not evidence.
 *
 * DATA, NOT EMPTINESS
 * -------------------
 * Several fixtures carry ROWS rather than an empty list. That is the point for
 * Phase 2: an empty table proves nothing about a table. A screenshot of a page
 * with no rows would happily survive replacing the table component with
 * something that renders every cell wrong, because there are no cells.
 *
 * Values are fixed and boring — no dates computed at load, no random ids — so
 * the same code always produces the same image.
 */

/** A response body. Untyped on purpose: these mimic the server, not the client. */
type Body = unknown;

/** Rows shared by the several list screens, so their images stay comparable. */
const PARTY_ROWS = [
  {
    id: 1,
    card_code: "C000123",
    card_name: "Northern Traders",
    state: "Punjab",
    category: "Distributor",
  },
  {
    id: 2,
    card_code: "C000456",
    card_name: "Southern Supply Co",
    state: "Kerala",
    category: "Retail",
  },
  {
    id: 3,
    card_code: "C000789",
    card_name: "Eastern Foods Ltd",
    state: "West Bengal",
    category: "Wholesale",
  },
];

/**
 * Users, matching `User` in `services/userService.ts`.
 *
 * `role` is a STRING and `company` a NUMBER — the obvious-looking `{id, name}`
 * for each is what React error #31 was: an object rendered straight into a
 * table cell. `main_groups` and `states` are the fields that really are arrays
 * of `{id, name}`.
 */
const USER_ROWS = [
  {
    id: 1,
    username: "amit.k",
    name: "Amit Kumar",
    email: "amit@example.com",
    phone: "9876543210",
    role: "billing",
    role_name: "Billing",
    is_active: true,
    company: 1,
    main_groups: [{ id: 1, name: "Main Group" }],
    states: [{ id: 1, name: "Punjab" }],
    category: { id: 1, category: "Distributor" },
    categories: [{ id: 1, category: "Distributor" }],
    variety: null,
    extra_pages: [],
  },
  {
    id: 2,
    username: "priya.s",
    name: "Priya Singh",
    email: "priya@example.com",
    phone: "9876543211",
    role: "auditor",
    role_name: "Auditor",
    is_active: true,
    company: 1,
    main_groups: [{ id: 1, name: "Main Group" }],
    states: [{ id: 2, name: "Kerala" }],
    category: { id: 2, category: "Retail" },
    categories: [{ id: 2, category: "Retail" }],
    variety: null,
    extra_pages: [],
  },
  {
    id: 3,
    username: "ravi.m",
    name: "Ravi Menon",
    email: "ravi@example.com",
    phone: "9876543212",
    role: "manager",
    role_name: "Manager",
    is_active: false,
    company: 2,
    main_groups: [{ id: 1, name: "Main Group" }],
    states: [
      { id: 1, name: "Punjab" },
      { id: 2, name: "Kerala" },
    ],
    category: null,
    categories: [],
    variety: null,
    extra_pages: [],
  },
];

const lookup = (id: number, name: string) => ({
  id,
  name,
  code: name.slice(0, 3).toUpperCase(),
  is_active: true,
});

/**
 * Two tracker invoices, matching the `Invoice` interface in
 * `services/trackerService.ts`. Deliberately unalike — different stage, an
 * overdue one, a partial payment, a pending rejection — so the badge and the
 * overdue treatment both land in the image rather than only the happy path.
 */
const TRACKER_INVOICES = [
  {
    id: 1,
    invoice_date: "2026-06-01",
    effective_month: "2026-06-01",
    party_name: "Acme Logistics",
    party_code: "V001",
    party_gstin: "03AABCU9603R1ZM",
    invoice_number: "INV-1001",
    taxable_value: "105932.20",
    gst_type: 1,
    gst_type_name: "Regular",
    gst_rate: 1,
    gst_rate_label: "18%",
    gst_amount: "19067.80",
    additional_charge_type: "",
    additional_charge_type_display: null,
    additional_charge_amount: "0.00",
    invoice_value: "125000.00",
    debit_amount: "0.00",
    hold_amount: "0.00",
    net_invoice_value: "125000.00",
    category: 1,
    category_name: "Freight",
    unit: 1,
    unit_name: "Nos",
    branch: 1,
    branch_name: "Oil",
    mode: 1,
    mode_name: "Courier",
    current_stage: 1,
    current_stage_code: "ENTRY",
    current_stage_name: "Entry",
    status: "IN_PROGRESS",
    current_stage_entered_at: "2026-06-12T10:00:00+05:30",
    is_locked: false,
    rejection_pending: false,
    days_at_stage: "3",
    is_overdue: false,
    editable: true,
    payment_status: null,
    paid_amount: null,
    open_balance: null,
    is_partially_paid: false,
    created_by: 1,
    created_by_name: "Amit Kumar",
    created_at: "2026-06-01T09:00:00+05:30",
    updated_at: "2026-06-12T10:00:00+05:30",
    arrived_via_return: false,
  },
  {
    id: 2,
    invoice_date: "2026-06-03",
    effective_month: "2026-06-01",
    party_name: "Northern Traders",
    party_code: "C000123",
    party_gstin: "03AAACN1234F1Z5",
    invoice_number: "INV-1002",
    taxable_value: "45952.86",
    gst_type: 1,
    gst_type_name: "Regular",
    gst_rate: 2,
    gst_rate_label: "5%",
    gst_amount: "2297.64",
    additional_charge_type: "DEMURRAGE",
    additional_charge_type_display: "Demurrage",
    additional_charge_amount: "1500.00",
    invoice_value: "48250.50",
    debit_amount: "1250.00",
    hold_amount: "5000.00",
    net_invoice_value: "47000.50",
    category: 2,
    category_name: "Supplies",
    unit: 2,
    unit_name: "Kg",
    branch: 2,
    branch_name: "Beverage",
    mode: 2,
    mode_name: "Hand",
    current_stage: 2,
    current_stage_code: "JSAP",
    current_stage_name: "JSAP",
    status: "IN_PROGRESS",
    current_stage_entered_at: "2026-06-04T14:30:00+05:30",
    is_locked: false,
    rejection_pending: true,
    days_at_stage: "11",
    is_overdue: true,
    editable: false,
    payment_status: "OPEN",
    paid_amount: "20000.00",
    open_balance: "27000.50",
    is_partially_paid: true,
    created_by: 2,
    created_by_name: "Priya Singh",
    created_at: "2026-06-03T11:20:00+05:30",
    updated_at: "2026-06-04T14:30:00+05:30",
    arrived_via_return: false,
  },
];

/**
 * Devices, matching `DeviceRow` in `services/deviceAdminService.ts`.
 *
 * One row per `DeviceStatus`, which is the point: `StatusBadge` draws a
 * different colour for each, and with an empty list the screenshot proved
 * nothing about any of them. This was noticed when the Badge primitive replaced
 * that component and `/Device_Management` came back byte-identical — not
 * because nothing changed, but because nothing was rendered.
 */
const DEVICE_ROWS = (["online", "idle", "offline", "inactive"] as const).map((status, i) => ({
  id: i + 1,
  device_id: `DEV-000${i + 1}`,
  user_id: i + 1,
  username: ["amit.k", "priya.s", "ravi.m", "sunil.d"][i],
  user_name: ["Amit Kumar", "Priya Singh", "Ravi Menon", "Sunil Desai"][i],
  email: `user${i + 1}@example.com`,
  role: ["billing", "auditor", "manager", "sales"][i],
  status,
  update_status: (["latest", "old", "unknown", "latest"] as const)[i],
  platform: ["android", "ios", "web", "android"][i],
  app_type: "oms",
  app_version: ["2.4.1", "2.3.0", "—", "2.4.1"][i],
  build_number: [141, 130, 0, 141][i],
  device_name: ["Galaxy S22", "iPhone 13", "Chrome", "Redmi Note 12"][i],
  manufacturer: ["Samsung", "Apple", "—", "Xiaomi"][i],
  device_model: ["SM-S901E", "iPhone14,5", "—", "22111317I"][i],
  browser_name: ["", "", "Chrome", ""][i],
  browser_version: ["", "", "126.0", ""][i],
  os_name: ["Android", "iOS", "Windows", "Android"][i],
  os_version: ["14", "17.5", "11", "13"][i],
  language: "en-IN",
  timezone: "Asia/Kolkata",
  first_login: "2026-01-12T09:15:00+05:30",
  last_login: "2026-06-14T18:40:00+05:30",
  last_active: "2026-06-15T09:05:00+05:30",
  is_active: status !== "inactive",
  created_at: "2026-01-12T09:15:00+05:30",
  updated_at: "2026-06-15T09:05:00+05:30",
}));

/**
 * Orders, matching `Order` in `services/ordersService.ts`.
 *
 * Five rows, one per status the app draws a different colour for. That is the
 * point: `View_Orders` builds its badge class from `status_display` itself
 * (`vo-badge-${slug}`), so a single-status fixture would exercise exactly one
 * branch of the thing Phase 2.2 replaces.
 *
 * Note `Pending Approval` and `Need Approval` are both here. They are amber and
 * violet respectively, and keeping that distinction was a deliberate decision
 * in statusTone.ts — a fixture that only had one of them would let the other be
 * flattened without any screenshot moving.
 *
 * `Draft` is the sixth, and it is here for a different reason: `getDrafts()`
 * (ordersService.ts) fetches this same `/orders/ordersbyuser/` list and keeps
 * only the rows whose `status_display` is exactly "draft". With no draft row,
 * `/Drafts` rendered "No saved drafts" — a stable, green screenshot of an empty
 * table, which is the fifth time a baseline in this suite has been a picture of
 * nothing. It shows up on the other order lists too; that is correct, a draft
 * IS one of the user's orders and those pages do not filter it out.
 */
const ORDER_ROWS = [
  ["Pending", false],
  ["Approved", false],
  ["Rejected", false],
  ["Billed", true],
  ["Pending Approval", false],
  ["Draft", false],
].map(([status, foc], i) => ({
  id: i + 1,
  status: i + 1,
  order_number: `SO-20${26}0${i + 1}`,
  order_type: "PARTY",
  card_code: ["C000123", "C000456", "C000789", "C000123", "C000456", "C000789"][i],
  card_name: [
    "Northern Traders",
    "Southern Supply Co",
    "Eastern Foods Ltd",
    "Northern Traders",
    "Southern Supply Co",
    "Eastern Foods Ltd",
  ][i],
  delivery_date: `2026-06-${String(10 + i).padStart(2, "0")}`,
  status_display: status as string,
  bill_to_address: "12 Mill Road, Ludhiana, Punjab",
  ship_to_address: "12 Mill Road, Ludhiana, Punjab",
  po_number: `PO-${900 + i}`,
  is_foc: foc as boolean,
  items: [],
  items_count: [4, 2, 7, 1, 3, 2][i],
  // All five land on the frozen clock's date. Daily_Report and Sales_Report
  // filter to `new Date().toISOString().split("T")[0]` — "today" — so rows
  // dated earlier in the month made those pages render empty while their
  // baselines read as coverage. See harness.ts FROZEN_NOW.
  created_at: `2026-06-15T10:${String(10 + i * 7).padStart(2, "0")}:00+05:30`,
  created_by: 1,
  created_by_name: "Amit Kumar",
  rejected_by: status === "Rejected" ? "Priya Singh" : null,
  rejection_reason: status === "Rejected" ? "Rate not approved" : null,
  total_amount: [125000, 48250.5, 91300, 15400, 63200, 27800][i],
  quotation_cancelled: false,
  party_state: ["Punjab", "Kerala", "West Bengal", "Punjab", "Kerala", "West Bengal"][i],
}));

/**
 * Invoice review logs, matching `InvoiceRecord` in `pages/InvoiceReview.tsx`.
 *
 * One row per `InvoiceStatus` the page recognises. `normalizeStatus` folds
 * everything it does not know into `PENDING`, so a fixture with a single status
 * would exercise one branch of a six-way badge and quietly pass whatever
 * happened to the other five.
 */
const INVOICE_LOG_ROWS = [
  ["APPROVED", null],
  ["REJECTED", "Rate not approved for this party"],
  ["PENDING", null],
  ["EDITED", null],
  ["ERROR", "SAP returned -5002: attachment path not reachable"],
  ["POSTED_TO_SAP", null],
  ["CL_RAISED", null],
].map(([status, note], i) => ({
  id: i + 1,
  so_number: `SO-20260${i + 1}`,
  party_name: [
    "Northern Traders",
    "Southern Supply Co",
    "Eastern Foods Ltd",
    "Northern Traders",
    "Southern Supply Co",
    "Eastern Foods Ltd",
    "Northern Traders",
  ][i],
  total_amount: [125000, 48250.5, 91300, 15400, 63200, 27800, 54100][i],
  status: status as string,
  error_message: status === "ERROR" ? (note as string) : "",
  rejection_reason: status === "REJECTED" ? (note as string) : "",
  invoice_log: i + 1,
  created_by: 1,
  created_by_name: "Amit Kumar",
  created_at: `2026-06-0${i + 1}T09:${String(10 + i * 5).padStart(2, "0")}:00+05:30`,
  updated_at: `2026-06-0${i + 1}T11:${String(10 + i * 5).padStart(2, "0")}:00+05:30`,
  branch: i % 2 === 0 ? "Oil" : "Beverage",
  warehouse: i % 2 === 0 ? "WH-OIL-01" : "WH-BEV-01",
  invoice_payload: { CardCode: "C000123", DocumentLines: [] },
  item_names: {},
  sap_doc_num: status === "POSTED_TO_SAP" ? "626070166" : null,
  sap_doc_entry: status === "POSTED_TO_SAP" ? "88213" : null,
  supersedes: null,
  supersedes_so_number: null,
  supersedes_status: null,
  supersedes_rejection_reason: null,
}));

/**
 * SAP/HANA stock rows, matching `Product` in `services/sapService.ts`.
 *
 * Four rows engineered to land on each of Product_Stock's four stock states —
 * available, low, shortage, out — because `ps-badge` draws a different colour
 * for each and the page derives the state from the numbers rather than a field.
 */
const STOCK_ROWS = [
  { item_code: "OIL-1L-01", item_name: "Mustard Oil 1L", on_hand: 4200, pending_required_qty: 900 },
  { item_code: "OIL-5L-02", item_name: "Mustard Oil 5L", on_hand: 260, pending_required_qty: 240 },
  {
    item_code: "BEV-2L-03",
    item_name: "Sparkling Water 2L",
    on_hand: 120,
    pending_required_qty: 800,
  },
  {
    item_code: "BEV-1L-04",
    item_name: "Sparkling Water 1L",
    on_hand: 0,
    pending_required_qty: 350,
  },
].map((r, i) => ({
  id: i + 1,
  ...r,
  brand: i < 2 ? "Jivo" : "Aqua",
  category: i < 2 ? "Oil" : "Beverage",
  variety: i < 2 ? "Mustard" : "Sparkling",
  type: "FG",
  sal_pack_unit: i < 2 ? "Ltr" : "Btl",
  staff_rate: 0,
  total_on_hand: r.on_hand,
  warehouse_code: i < 2 ? "WH-OIL-01" : "WH-BEV-01",
  warehouse_name: i < 2 ? "Oil Main" : "Beverage Main",
  warehouse_stock: r.on_hand,
  left_over_stock: Number(r.on_hand) - Number(r.pending_required_qty),
}));

/** An empty `ChartSeries` — `{total, slices}`, not the plausible `{labels, series}`. */
const CHART = { total: 0, slices: [] };

const PAGINATION = { page: 1, page_size: 10, total: 0, total_pages: 1 };

/**
 * Path fragment -> body. The FIRST match wins, so order from most specific to
 * least. Matched on the path only, because the API origin is an env var that
 * differs between machines.
 */
export const FIXTURES: Array<[pattern: RegExp, body: Body]> = [
  // ---- Users and reference data ------------------------------------------
  // ONE of these is enveloped and the rest are not, which is not an oversight.
  // App_User reads `data.data` for the user list (App_User.tsx:127) and the RAW
  // body for every other lookup — `setMainGroup(data2)`, `setRole(data4)` and
  // so on. Wrapping them uniformly produced `C.find is not a function` on
  // App_User and `D.find` on Add_Sales, which had been passing.
  [/\/auth\/users\/list\//, { data: USER_ROWS }],
  [/\/auth\/mainGroup\//, [{ id: 1, name: "Main Group" }]],
  [
    /\/auth\/states\//,
    [
      { id: 1, name: "Punjab" },
      { id: 2, name: "Kerala" },
    ],
  ],
  [/\/auth\/roles\//, [lookup(1, "billing"), lookup(2, "auditor"), lookup(3, "manager")]],
  [
    /\/auth\/companies\//,
    [
      { id: 1, name: "Oil" },
      { id: 2, name: "Beverage" },
      // Add_Sales auto-selects the company whose name contains "jivo wellness"
      // (Add_Sales.tsx:276-283). Added rather than renaming the two above,
      // which App_User also reads.
      { id: 3, name: "Jivo Wellness" },
    ],
  ],
  [/\/auth\/categories\//, [lookup(1, "Distributor"), lookup(2, "Retail")]],

  // ---- Document tracker ---------------------------------------------------
  // `Lookups` in services/trackerService.ts — every key is read
  // unconditionally, so a missing one is a crash rather than an empty dropdown.
  [
    /\/tracker\/lookups\//,
    {
      categories: [lookup(1, "Freight"), lookup(2, "Supplies")],
      units: [lookup(1, "Nos"), lookup(2, "Kg")],
      branches: [lookup(1, "Oil"), lookup(2, "Beverage")],
      modes: [lookup(1, "Courier"), lookup(2, "Hand")],
      gst_types: [lookup(1, "Regular"), lookup(2, "Composition")],
      gst_rates: [
        { id: 1, rate: "18.00", name: "18%" },
        { id: 2, rate: "5.00", name: "5%" },
      ],
      stages: [
        { id: 1, code: "ENTRY", name: "Entry", order: 1, sequence: 1 },
        { id: 2, code: "JSAP", name: "JSAP", order: 2, sequence: 2 },
        { id: 3, code: "AP", name: "AP Invoice", order: 3, sequence: 3 },
      ],
    },
  ],
  [/\/tracker\/vendors\//, [{ id: 1, name: "Acme Logistics", code: "V001" }]],
  // Tracker_Admin. Added because the page changed by EXACTLY ZERO pixels when
  // its badges were converted — not because nothing changed, but because with
  // no stages and no users it draws no badges at all. One active row and one
  // inactive, so both tones land in the image.
  [
    /\/tracker\/admin\/stages\//,
    [
      {
        id: 1,
        code: "ENTRY",
        name: "Entry",
        order: 1,
        threshold_days: 3,
        status_choices: ["OK", "HOLD"],
        requires_status: false,
        can_return: false,
        is_terminal: false,
        is_active: true,
      },
      {
        id: 2,
        code: "JSAP",
        name: "JSAP",
        order: 2,
        threshold_days: 5,
        status_choices: ["OK", "HOLD", "DEBIT"],
        requires_status: true,
        can_return: true,
        is_terminal: false,
        is_active: true,
      },
      {
        id: 3,
        code: "ARCHIVE",
        name: "Archive",
        order: 9,
        threshold_days: 0,
        status_choices: [],
        requires_status: false,
        can_return: false,
        is_terminal: true,
        is_active: false,
      },
    ],
  ],
  [
    /\/tracker\/admin\/users\//,
    [
      {
        id: 1,
        username: "amit.k",
        name: "Amit Kumar",
        email: "amit@example.com",
        phone: "9876543210",
        role: "tracker_entry",
        role_display: "Entry Desk",
        is_active: true,
      },
      {
        id: 2,
        username: "priya.s",
        name: "Priya Singh",
        email: "priya@example.com",
        phone: "9876543211",
        role: "tracker_jsap",
        role_display: "JSAP Desk",
        is_active: false,
      },
    ],
  ],
  /*
   * The admin lookup tables, per `LookupRow` in services/trackerService.ts.
   *
   * Two entries, because the shape depends on the kind: `gst_rates` rows carry
   * `label` + `rate` and every other kind carries `name`, and `LookupsTab`
   * renders a different column set for each. One fixture would have left the
   * GST Rates tab drawing empty cells and passing.
   *
   * Both MUST stay above the `/tracker/admin/` catch-all below, which answers
   * `[]` and is what made this tab empty in every baseline until now.
   */
  [
    /\/tracker\/admin\/lookups\/gst_rates\//,
    [
      { id: 1, label: "GST 5%", rate: "5.00", sort_order: 1, is_active: true },
      { id: 2, label: "GST 12%", rate: "12.00", sort_order: 2, is_active: true },
      { id: 3, label: "GST 18%", rate: "18.00", sort_order: 3, is_active: false },
    ],
  ],
  [
    /\/tracker\/admin\/lookups\//,
    [
      { id: 1, name: "Freight", sort_order: 1, is_active: true },
      { id: 2, name: "Packing", sort_order: 2, is_active: true },
      { id: 3, name: "Handling", sort_order: 3, is_active: false },
    ],
  ],
  [/\/tracker\/admin\//, []],
  // `myQueue()` returns `{stages, invoices}` and the page destructures both
  // (Tracker_Queue.tsx:196). `stages` drives the tabs, so an empty one renders
  // a page with no tabs — technically valid, and worthless as a baseline.
  [
    /\/tracker\/my-queue\//,
    {
      stages: [
        { code: "ENTRY", name: "Entry", order: 1, count: 1 },
        { code: "JSAP", name: "JSAP", order: 2, count: 1 },
      ],
      invoices: TRACKER_INVOICES,
    },
  ],
  // The single-invoice endpoint, and it has to come FIRST: the list pattern
  // below also matches `/tracker/invoices/1/`, so without this the timeline
  // modal received the whole ARRAY and rendered a dialog with an empty title
  // and no events — which is exactly what the first screenshot of it showed.
  [
    /\/tracker\/invoices\/\d+\//,
    {
      ...TRACKER_INVOICES[0],
      events: [
        {
          id: 1,
          stage: 1,
          stage_name: "Entry",
          stage_code: "ENTRY",
          event_type: "RECEIVE",
          stage_status: "DONE",
          hold_type: "",
          amount: null,
          receiving_note: "ON_TIME",
          remarks: "Received with the courier docket.",
          acted_by: 1,
          acted_by_name: "Amit Kumar",
          entered_at: "2026-06-01T09:00:00+05:30",
          exited_at: "2026-06-02T11:30:00+05:30",
          days_spent: "1.1",
        },
        {
          id: 2,
          stage: 2,
          stage_name: "JSAP Desk",
          stage_code: "JSAP",
          event_type: "ADVANCE",
          stage_status: "IN_PROGRESS",
          hold_type: "PARTIAL",
          amount: "5000.00",
          receiving_note: "LATE",
          remarks: "Partial hold pending the rate approval.",
          acted_by: 2,
          acted_by_name: "Priya Singh",
          entered_at: "2026-06-02T18:40:00+05:30",
          exited_at: null,
          days_spent: null,
        },
      ],
    },
  ],
  [/\/tracker\/(invoices|all-invoices)\//, TRACKER_INVOICES],
  // `ReportData` in services/trackerService.ts. `summary` is read
  // unconditionally on first paint (Tracker_Reports.tsx:132), so the bare `[]`
  // this used to get was an error boundary, not an empty report.
  [
    /\/tracker\/reports\//,
    {
      summary: { in_progress: 2, completed: 14, overdue: 1, avg_cycle_days: 6.4 },
      pending_by_stage: [
        { stage_code: "ENTRY", stage_name: "Entry", order: 1, count: 1 },
        { stage_code: "JSAP", stage_name: "JSAP", order: 2, count: 1 },
      ],
      avg_days_per_stage: [
        { stage_code: "ENTRY", stage_name: "Entry", order: 1, avg_days: 3.1, visits: 16 },
        { stage_code: "JSAP", stage_name: "JSAP", order: 2, avg_days: 4.8, visits: 15 },
      ],
      bottleneck_by_person: [
        { key: "Priya Singh", avg_days: 5.2, visits: 9 },
        { key: "Amit Kumar", avg_days: 2.4, visits: 7 },
      ],
      bottleneck_by_vendor: [{ key: "Acme Logistics", avg_days: 4.1, visits: 6 }],
      bottleneck_by_category: [{ key: "Freight", avg_days: 3.7, visits: 11 }],
      ageing: [
        { bucket: "0-3 days", count: 1 },
        { bucket: "4-7 days", count: 0 },
        { bucket: "8+ days", count: 1 },
      ],
    },
  ],
  // `StuckAlert[]` — the alerts screen is a list, and an empty one is a real
  // state (nothing is stuck). Given rows anyway: the badges on this page are
  // exactly what Phase 2.2 changes, and an empty list would draw none of them.
  [
    /\/tracker\/alerts\//,
    [
      {
        id: 1,
        invoice: 2,
        invoice_number: "INV-1002",
        party_name: "Northern Traders",
        invoice_value: "48250.50",
        stage: 2,
        stage_name: "JSAP",
        stage_code: "JSAP",
        stage_entered_at: "2026-06-04T14:30:00+05:30",
        days_stuck: "11",
        threshold_days: 5,
        over_by: 6,
        is_active: true,
      },
      {
        id: 2,
        invoice: 1,
        invoice_number: "INV-1001",
        party_name: "Acme Logistics",
        invoice_value: "125000.00",
        stage: 1,
        stage_name: "Entry",
        stage_code: "ENTRY",
        stage_entered_at: "2026-06-12T10:00:00+05:30",
        days_stuck: "3",
        threshold_days: 5,
        over_by: 0,
        is_active: false,
      },
    ],
  ],
  [/\/tracker\/(stage-advanced|stage-decisions)\//, []],

  // ---- e-Invoice and e-Way Bill -------------------------------------------
  // Both list endpoints return `{results}`; the pages read `data.results`.
  // `InvoiceListResponse` — `{company_db, results}`. Four rows covering every
  // `irn_status`, because `InvoiceBrowser` draws a different badge for each
  // (`GENERATED` ok, `FAILED` err, `SKIPPED` muted, null warn) and an empty
  // list draws none of them. The first version of this fixture returned no
  // results, so the interaction screenshot that was supposed to cover those
  // badges captured "No pending invoices" instead.
  [
    /\/einvoice\/invoices\//,
    {
      company_db: "JIVO_OIL_HANADB",
      results: [
        {
          docentry: 88213,
          docnum: 626070166,
          cardname: "Northern Traders",
          docdate: "2026-06-01",
          doctotal: 125000,
          irn: "a5c1e9d4f77b3a2c8e10b6d4f9a3c7e2b8d5f1a9c3e7b2d6f4a8c1e5b9d3f7a2",
          irn_status: "GENERATED",
          irn_source: "OMS",
          last_error: null,
        },
        {
          docentry: 88214,
          docnum: 626070167,
          cardname: "Southern Supply Co",
          docdate: "2026-06-02",
          doctotal: 48250.5,
          irn: null,
          irn_status: "FAILED",
          irn_source: null,
          last_error: "2172: Duplicate IRN for the document",
        },
        {
          docentry: 88215,
          docnum: 626070168,
          cardname: "Eastern Foods Ltd",
          docdate: "2026-06-03",
          doctotal: 91300,
          irn: null,
          irn_status: "SKIPPED",
          irn_source: null,
          last_error: null,
        },
        {
          docentry: 88216,
          docnum: 626070169,
          cardname: "Northern Traders",
          docdate: "2026-06-04",
          doctotal: 15400,
          irn: null,
          irn_status: null,
          irn_source: null,
          last_error: null,
        },
      ],
    },
  ],
  [
    /\/einvoice\/companies\//,
    {
      results: [
        { label: "OIL", company_db: "JIVO_OIL_HANADB" },
        { label: "BEVERAGE", company_db: "JIVO_BEVERAGES_HANADB" },
      ],
    },
  ],
  /*
   * The auto-generation log (GenLogs, the Einvoice page's "Logs" tab).
   *
   * MUST stay above the `/einvoice/` catch-all below. That catch-all has no
   * `totals` key, and GenLogs renders `data.totals.SUCCESS` (GenLogs.tsx:69)
   * the moment `data` is truthy — so the catch-all does not merely leave this
   * tab empty, it throws `Cannot read properties of undefined`. Nothing caught
   * it because "Invoices" is the default tab and no test has ever opened
   * "Logs".
   *
   * One row per `outcome`, because `tone()` (GenLogs.tsx:51) maps each to a
   * different badge, and the FAILED row carries `validation_errors` so the
   * expandable "Details" row and the Retry button — both gated on outcome and
   * on `irn` being absent — are actually drawn.
   */
  [
    /\/einvoice\/logs\//,
    {
      count: 3,
      totals: { SUCCESS: 1, FAILED: 1, SKIPPED: 1 },
      results: [
        {
          id: 1,
          docentry: 4471,
          company_db: "JIVO_OIL_HANADB",
          environment: "sandbox",
          trigger: "invoice_create",
          attempt_no: 1,
          outcome: "SUCCESS",
          doc_no: "INV-4471",
          irn: "a5c12f8e93b74d6a8f21e0c4b7d93a5612f8e93b74d6a8f21e0c4b7d93a5612f",
          ack_no: "112410000123456",
          error_code: null,
          error_message: null,
          validation_errors: null,
          duration_ms: 1840,
          created_at: "2026-06-15T09:12:00+05:30",
        },
        {
          id: 2,
          docentry: 4472,
          company_db: "JIVO_OIL_HANADB",
          environment: "sandbox",
          trigger: "polling_job",
          attempt_no: 3,
          outcome: "FAILED",
          doc_no: "INV-4472",
          irn: null,
          ack_no: null,
          error_code: "2150",
          error_message: "Duplicate IRN request for the same document",
          validation_errors: [
            {
              field: "ItemList[0].HsnCd",
              code: "3028",
              message: "HSN code is mandatory and must be at least 4 digits",
            },
            {
              field: "BuyerDtls.Gstin",
              code: "3010",
              message: "Buyer GSTIN is not registered on the portal",
            },
          ],
          duration_ms: 920,
          created_at: "2026-06-15T09:35:00+05:30",
        },
        {
          id: 3,
          docentry: 4473,
          company_db: "JIVO_BEVERAGES_HANADB",
          environment: "sandbox",
          trigger: "manual_retry",
          attempt_no: 1,
          outcome: "SKIPPED",
          doc_no: "INV-4473",
          irn: null,
          ack_no: null,
          error_code: null,
          error_message: "Below the e-invoicing threshold for this company",
          validation_errors: null,
          duration_ms: 40,
          created_at: "2026-06-15T10:02:00+05:30",
        },
      ],
    },
  ],
  [/\/einvoice\//, { results: [], count: 0, companies: [{ db: "OIL", name: "Oil" }] }],
  [/\/ewaybill\//, { results: [], count: 0 }],

  /*
   * State-wise report. `/orders/dashboardW/charts/` had no fixture at all, so
   * the page answered `null`, read `state_item_sales` off nothing and rendered
   * an empty table — which is exactly the screenshot that would have been
   * baselined as coverage. Two states with two products each is the minimum
   * that exercises the flatMap, the state/product/type filters and the totals
   * row; the pagination needs more than ten rows and is not worth the noise
   * here.
   */
  [
    /\/orders\/dashboardW\/charts\//,
    {
      /*
       * Top Parties and the status pie/legend — Dashboard.tsx reads both off
       * this same endpoint (`charts.top_parties`, `charts.status_distribution`)
       * and neither had a fixture, so both always rendered their empty state
       * ("No party data for this period" / "No data for this period") in
       * every baseline that ever opened /Dashboard. That is exactly the gap
       * that let two Phase 6.3 conversions (`.db-party-list-badge`'s
       * nth-child palette cycle and `.db-pie-cell`) sit unverified. Three
       * parties is the minimum that shows per-row colour cycling; three
       * statuses (including one over 0) is the minimum that renders a
       * non-trivial pie with a clickable legend.
       */
      top_parties: [
        { card_code: "CUST000001", card_name: "Northern Traders", category: "OIL", count: 42, completed_count: 30, revenue: 812400 },
        { card_code: "CUST000002", card_name: "Southern Supply Co", category: "BEVERAGES", count: 27, completed_count: 20, revenue: 456200 },
        { card_code: "CUST000003", card_name: "Ravi Menon", category: "MART", count: 15, completed_count: 9, revenue: 198500 },
      ],
      status_distribution: [
        { status: "COMPLETED", label: "Completed", count: 48 },
        { status: "PENDING", label: "Pending", count: 22 },
        { status: "REJECTED", label: "Rejected", count: 6 },
      ],
      state_item_sales: [
        {
          state: "Punjab",
          products: [
            {
              item_code: "JV-CAN-1L",
              item_name: "JIVO CANOLA OIL 1 LTR",
              category: "Edible Oil",
              variety: "Canola",
              total_sales: 128400,
              quantity: 1200,
              boxes: 100,
              ltrs: 1200,
              count: 24,
            },
            {
              item_code: "JV-OLV-500",
              item_name: "JIVO OLIVE OIL 500 ML",
              category: "Edible Oil",
              variety: "Olive",
              total_sales: 64200,
              quantity: 600,
              boxes: 50,
              ltrs: 300,
              count: 12,
            },
          ],
        },
        {
          state: "Kerala",
          products: [
            {
              item_code: "JV-CAN-1L",
              item_name: "JIVO CANOLA OIL 1 LTR",
              category: "Edible Oil",
              variety: "Canola",
              total_sales: 96300,
              quantity: 900,
              boxes: 75,
              ltrs: 900,
              count: 18,
            },
            {
              item_code: "JV-RIC-5L",
              item_name: "JIVO RICE BRAN OIL 5 LTR",
              category: "Edible Oil",
              variety: "Rice Bran",
              total_sales: 45000,
              quantity: 300,
              boxes: 60,
              ltrs: 1500,
              count: 9,
            },
          ],
        },
      ],
    },
  ],

  /*
   * Inventory report. `/hana/inventory-report/` had no fixture, so it answered
   * `[]` — truthy, with no `groups` — and the page's own loader crashed on
   * `[].warehouses.map()` INSIDE its try, fell into the catch, and rendered
   * "Could not load inventory from SAP". That error card is what
   * inventory-report.png has been a picture of. Two warehouses and two
   * sub-groups is the least that exercises the warehouse column picker, the
   * per-group totals and the drop-an-all-zero-row rule.
   */
  [
    /\/hana\/inventory-report\//,
    {
      branch: "OIL",
      warehouses: [
        { code: "LDH", name: "Ludhiana" },
        { code: "DEL", name: "Delhi" },
      ],
      groups: [
        {
          sub_group: "Canola",
          total: 900,
          totals: { LDH: 600, DEL: 300 },
          items: [
            {
              item_code: "JV-CAN-1L",
              item_name: "JIVO CANOLA OIL 1 LTR",
              sku: "1 LTR",
              sub_group: "Canola",
              variety: "Canola",
              brand: "Jivo",
              stock: { LDH: 400, DEL: 200 },
              total: 600,
            },
            {
              item_code: "JV-CAN-5L",
              item_name: "JIVO CANOLA OIL 5 LTR",
              sku: "5 LTR",
              sub_group: "Canola",
              variety: "Canola",
              brand: "Jivo",
              stock: { LDH: 200, DEL: 100 },
              total: 300,
            },
          ],
        },
        {
          sub_group: "Olive",
          total: 250,
          totals: { LDH: 150, DEL: 100 },
          items: [
            {
              item_code: "JV-OLV-500",
              item_name: "JIVO OLIVE OIL 500 ML",
              sku: "500 ML",
              sub_group: "Olive",
              variety: "Olive",
              brand: "Jivo",
              stock: { LDH: 150, DEL: 100 },
              total: 250,
            },
          ],
        },
      ],
      totals: { LDH: 750, DEL: 400 },
      grand_total: 1150,
      item_count: 3,
    },
  ],

  // ---- Payments dashboard -------------------------------------------------
  // `DashboardData` in services/paymentsDashboardService.ts. Two fields here
  // were wrong on earlier attempts and each cost a run: `filters.date_from` is
  // read on first paint, and a `ChartSeries` is `{total, slices}` — the
  // plausible-looking `{labels, series}` gives `slices.filter of undefined`
  // (AnalyticsTab.tsx:208).
  [/\/payments\/dashboard\/collection-performance\//, { results: [], pagination: PAGINATION }],
  [
    /\/payments\/dashboard\//,
    {
      filters: {
        company: "OIL",
        preset: "this_month",
        date_from: "2026-06-01",
        date_to: "2026-06-15",
      },
      kpis: {
        total_payments: 0,
        total_payments_count: 0,
        deposit_total: 0,
        deposit_collected: 0,
        deposit_count: 0,
        received_total: 0,
        received_count: 0,
        against_invoice: 0,
        against_invoice_count: 0,
        advance_payment: 0,
        advance_count: 0,
        pending_receipts: 0,
        pending_receipts_count: 0,
        pending_deposits: 0,
        pending_deposits_count: 0,
        blocked_total: 0,
        blocked_count: 0,
      },
      charts: { received: CHART, methods: CHART, deposits: CHART },
      collection_performance: { results: [], pagination: PAGINATION },
    },
  ],
  [
    /\/payments\/companies\//,
    [
      { db: "OIL", name: "Oil" },
      { db: "BEV", name: "Beverage" },
    ],
  ],

  // ---- SAP sync tabs ------------------------------------------------------
  // Sap_Sync mounts five sub-pages as tabs (Sap_Sync.tsx:34). Only "Status" is
  // the default, so the other four — and the whole `sd-badge` family with them
  // — are reachable only by clicking, which is why they had no coverage.
  [
    /\/sap\/logs\//,
    [
      {
        id: 1,
        sync_type: "products",
        status: "success",
        records_processed: 1284,
        records_created: 12,
        records_updated: 41,
        triggered_by: "amit.k",
        created_at: "2026-06-15T08:00:00+05:30",
      },
      {
        id: 2,
        sync_type: "parties",
        status: "failed",
        records_processed: 0,
        records_created: 0,
        records_updated: 0,
        triggered_by: "scheduler",
        created_at: "2026-06-14T08:00:00+05:30",
      },
      {
        id: 3,
        sync_type: "branches",
        status: "success",
        records_processed: 7,
        records_created: 0,
        records_updated: 2,
        triggered_by: "priya.s",
        created_at: "2026-06-13T08:00:00+05:30",
      },
    ],
  ],
  [
    /\/sap\/branches\//,
    [
      {
        id: 1,
        bpl_id: 1,
        bpl_name: "Ludhiana Plant",
        is_active: true,
        updated_at: "2026-06-15T07:30:00+05:30",
      },
      {
        id: 2,
        bpl_id: 2,
        bpl_name: "Kochi Depot",
        is_active: false,
        updated_at: "2026-06-10T07:30:00+05:30",
      },
    ],
  ],
  /*
   * Combo_Mapping's list — `/auth/combo-mappings/`, read as
   * `response.data?.data?.combos` (userService.ts:267), so a bare array here
   * would unwrap to `[]` and the page would draw "No combo packs are assigned
   * to any party yet."  That is exactly what its first baseline photographed,
   * and 45 of the app's inline styles live in the table it was hiding.
   *
   * Three rows, one per mapping state, because the row is drawn differently in
   * each: fully mapped, partially mapped (the `is_partially_mapped` warning
   * path), and untouched. The halves point at real `/sap/products/` codes so
   * the picker and the row agree on names.
   */
  [
    /\/auth\/combo-mappings\//,
    {
      data: {
        combos: [
          {
            item_code: "FG0000021",
            item_name: "JIVO CANOLA OIL 1 LTR + JIVO OLIVE OIL 500 ML",
            category: "OIL",
            sal_factor2: 12,
            party_count: 4,
            mapped_party_count: 4,
            parent_item_code: "FG0000011",
            parent_item: {
              item_code: "FG0000011",
              item_name: "Jivo Canola Oil 1 L",
              sal_factor2: 12,
            },
            free_item_code: "FG0000013",
            free_qty_per_unit: 1,
            free_item: {
              item_code: "FG0000013",
              item_name: "Jivo Olive Oil 5 L",
              sal_factor2: 4,
            },
            is_partially_mapped: false,
          },
          {
            item_code: "FG0000022",
            item_name: "JIVO BEVERAGE 250 ML + JIVO CANOLA OIL 1 LTR",
            category: "BEVERAGES",
            sal_factor2: 24,
            party_count: 3,
            mapped_party_count: 1,
            parent_item_code: "FG0000012",
            parent_item: {
              item_code: "FG0000012",
              item_name: "Jivo Beverage 250 ml",
              sal_factor2: 24,
            },
            free_item_code: null,
            free_qty_per_unit: null,
            free_item: null,
            is_partially_mapped: true,
          },
          {
            item_code: "FG0000023",
            item_name: "JIVO OLIVE OIL 5 L + JIVO BEVERAGE 250 ML",
            category: "OIL",
            sal_factor2: 4,
            party_count: 2,
            mapped_party_count: 0,
            parent_item_code: null,
            parent_item: null,
            free_item_code: null,
            free_qty_per_unit: null,
            free_item: null,
            is_partially_mapped: false,
          },
        ],
      },
    },
  ],

  /*
   * The shared SAP catalogue behind ["sap","products"] — Products,
   * Combo_Mapping, Party_Product_Assignment, Status and Scheme_Manager.
   *
   * The codes are FG-prefixed because SAP prefixes item codes by KIND (FG
   * finished goods, PM packing material, RM raw material, CG, SC) and
   * Scheme_Manager filters this list with `isFinishedGood`
   * (Scheme_Manager.tsx:41), which keeps only `FG*`. They used to be `JV-`
   * codes carrying `type: "FG"`, so every row was filtered out and that page's
   * catalogue was empty: its item picker had nothing in it and every scheme
   * rule rendered a raw code where a product name belongs. `FG0000011` and
   * `FG0000013` are the two items the `/orders/v2/schemes/` fixture references,
   * so the name resolution is actually exercised.
   *
   * The `JV-` codes elsewhere in this file are order/party-product rows, which
   * never pass through that filter and are deliberately left alone.
   */
  [
    /\/sap\/products\//,
    [
      {
        id: 1,
        item_code: "FG0000011",
        item_name: "Jivo Canola Oil 1 L",
        brand: "Jivo",
        category: "Oil",
        variety: "Canola",
        type: "FG",
        sal_pack_unit: "12",
      },
      {
        id: 2,
        item_code: "FG0000012",
        item_name: "Jivo Beverage 250 ml",
        brand: "Jivo",
        category: "Beverages",
        variety: "Mango",
        type: "FG",
        sal_pack_unit: "24",
      },
      {
        id: 3,
        item_code: "FG0000013",
        item_name: "Jivo Olive Oil 5 L",
        brand: "Jivo",
        category: null,
        variety: "Olive",
        type: "FG",
        sal_pack_unit: "4",
      },
    ],
  ],
  [
    /\/sap\/parties\//,
    [
      {
        id: 1,
        card_code: "C000123",
        card_name: "Northern Traders",
        category: "Distributor",
        main_group: "Main Group",
        state: "Punjab",
      },
      {
        id: 2,
        card_code: "C000456",
        card_name: "Southern Supply Co",
        category: "Retail",
        main_group: "Main Group",
        state: "Kerala",
      },
    ],
  ],
  [
    /\/sap\/addresses\//,
    [
      {
        id: 1,
        card_code: "C000123",
        address_name: "Head Office",
        address_type: "B",
        street: "12 Mill Road",
        city: "Ludhiana",
        state: "Punjab",
        zip_code: "141001",
        gstin: "03AABCU9603R1ZM",
      },
      {
        id: 2,
        card_code: "C000123",
        address_name: "Warehouse",
        address_type: "S",
        street: "Plot 44, Focal Point",
        city: "Ludhiana",
        state: "Punjab",
        zip_code: "141010",
        gstin: "03AABCU9603R1ZM",
      },
    ],
  ],

  // ---- Approvals ----------------------------------------------------------
  /*
   * MUST stay above the `/approvals/workflows/` fixture below: that pattern
   * has no trailing anchor, so `/approvals/workflows/1/preview/` matches it
   * too and would otherwise be answered with the workflow LIST instead of a
   * preview object. `PreviewCard` (ApprovalManagement.tsx:1166) reads
   * `preview.data?.levels` — an array has no `.levels`, so `?.` doesn't save
   * it, and `.filter()` on `undefined` crashed the whole Levels tab. Found by
   * opening it for the first time in Phase 6.3 coverage work; nothing had
   * ever clicked that tab in a test before.
   */
  [
    /\/approvals\/workflows\/\d+\/preview\//,
    {
      workflow: "Receipt approval",
      company: "OIL",
      total_levels: 2,
      levels: [
        {
          sequence: 1,
          name: "Branch head",
          role: "manager",
          min_approvals: 1,
          eligible_approvers: ["Amit Kumar"],
          eligible_count: 1,
          blocked: false,
        },
        {
          sequence: 2,
          name: "Finance",
          role: "auditor",
          min_approvals: 1,
          eligible_approvers: [],
          eligible_count: 0,
          blocked: true,
        },
      ],
    },
  ],

  /*
   * The Levels and Approvers tabs each fetch a workflow's levels separately
   * from the embedded `levels` array on the workflow list below — without
   * this, both tabs' own level list showed "No levels defined" even though
   * the same workflow's embedded/preview data clearly had some. `approvers:
   * []` on both rows exercises the Approvers tab's "No named approvers"
   * notice, which needs an empty list to show at all.
   */
  [
    /\/approvals\/levels\//,
    [
      {
        id: 1,
        workflow: 1,
        sequence: 1,
        name: "Branch head",
        role: 1,
        role_name: "manager",
        min_approvals: 1,
        is_active: true,
        approvers: [],
      },
      {
        id: 2,
        workflow: 1,
        sequence: 2,
        name: "Finance",
        role: 2,
        role_name: "auditor",
        min_approvals: 1,
        is_active: true,
        approvers: [],
      },
    ],
  ],

  // `rows()` in approvalService.ts accepts an array or a `{results}` envelope,
  // so the `[]` default would not crash. These rows are here because they ARE
  // the Payments_Dashboard screenshot: `w.levels.filter(...)` runs per row
  // (ApprovalManagement.tsx:499), so `levels` has to be present on each.
  [
    /\/approvals\/workflows\//,
    [
      {
        id: 1,
        name: "Receipt approval",
        company: "OIL",
        document_type: "RECEIPT",
        is_active: true,
        min_amount: "0.00",
        max_amount: null,
        levels: [
          {
            id: 1,
            workflow: 1,
            sequence: 1,
            name: "Branch head",
            is_active: true,
            role: 1,
            role_name: "manager",
            approvers: [],
          },
          {
            id: 2,
            workflow: 1,
            sequence: 2,
            name: "Finance",
            is_active: true,
            role: 2,
            role_name: "auditor",
            approvers: [],
          },
        ],
      },
      {
        id: 2,
        name: "Deposit approval",
        company: "BEV",
        document_type: "DEPOSIT",
        is_active: false,
        min_amount: "50000.00",
        max_amount: null,
        levels: [
          {
            id: 3,
            workflow: 2,
            sequence: 1,
            name: "Cashier",
            is_active: true,
            role: 1,
            role_name: "billing",
            approvers: [],
          },
        ],
      },
    ],
  ],

  /*
   * The admin UI-label rows.
   *
   * `/UI_Labels` had a route baseline and NO fixture, so `listLabels()`
   * unwrapped the harness's `[]` fallback and the page rendered its empty
   * state — the screenshot was a picture of "No labels yet", and a conversion
   * that broke the table would have passed it. Fifth time this trap has been
   * found in this suite, which is why every fixture added since is paired with
   * an assertion that the data is actually on screen.
   *
   * `po_number` is the load-bearing row: its `is_enabled` / `is_required`
   * flags are what `useFieldConfig` serves to Add Sales, and "PO is not
   * mandatory" is a decision this table encodes.
   */
  [
    /\/ui-config\/admin\/labels\//,
    [
      {
        id: 1,
        field_key: "po_number",
        display_name: "PO Number",
        description: "Customer purchase order reference on a sales order.",
        is_active: true,
        is_enabled: true,
        is_required: false,
        created_at: "2026-05-02T09:00:00+05:30",
        updated_at: "2026-06-01T11:30:00+05:30",
      },
      {
        id: 2,
        field_key: "delivery_date",
        display_name: "Delivery Date",
        description: "Date the customer expects the goods.",
        is_active: true,
        is_enabled: true,
        is_required: true,
        created_at: "2026-05-02T09:05:00+05:30",
        updated_at: "2026-05-02T09:05:00+05:30",
      },
      {
        id: 3,
        field_key: "remarks",
        display_name: "Order Remarks",
        description: "Free text carried to SAP as the document comment.",
        is_active: false,
        is_enabled: false,
        is_required: false,
        created_at: "2026-05-03T15:20:00+05:30",
        updated_at: "2026-05-20T10:00:00+05:30",
      },
    ],
  ],

  // ---- The signed-in user -------------------------------------------------
  //
  // The most load-bearing fixture in the file, and it was missing.
  // `loadCurrentUserOrderSummaries()` reads `data.data.id` here and then calls
  // `/orders/ordersbyuser/<id>/`. With no profile there is no id, so it
  // returned `[]` early and EVERY order screen rendered empty — View_Orders,
  // Order_Tracking, Daily_Report and the rest, all quietly showing nothing and
  // all passing their screenshots.
  [
    /\/auth\/profile\//,
    {
      data: {
        id: 1,
        username: "vrtester",
        name: "Visual Tester",
        role: "admin",
        email: "vr@example.com",
      },
    },
  ],

  /*
   * One order, in full, for the EDIT path.
   *
   * `Add_Sales` reaches its legacy single-page form only when `mode` arrives on
   * `location.state`, which `page.goto()` cannot supply — a test has to click
   * Edit on Order_Tracking, and that button renders only for a REJECTED order
   * (Order_Tracking.tsx:823). So this answers for ORDER_ROWS[2], the rejected
   * one: `card_code` C000789, which is deliberately NOT in the party list,
   * because the edit loader injects the order's own party into `parties`
   * (Add_Sales.tsx:586-604) and that injection is part of what is under test.
   *
   * `category` on the items is what `getOrderCategory` reads to filter the
   * catalogue, so it has to be the same one string the party-products fixture
   * uses — the vocabulary trap that cost a session's time on the wizard.
   */
  [
    /\/orders\/orderdetailsbyid\//,
    {
      id: 3,
      order_number: "SO-202603",
      order_type: "PARTY",
      status: 3,
      status_display: "Rejected",
      card_code: "C000789",
      card_name: "Eastern Foods Ltd (C000789)",
      bill_to_id: 11,
      bill_to_address: "12 Mall Road, Ludhiana, Punjab 141001",
      ship_to_id: 21,
      ship_to_address: "Plot 9, Focal Point, Ludhiana, Punjab 141010",
      dispatch_from_id: 1,
      dispatch_from_name: "Ludhiana",
      delivery_date: "2026-06-20",
      po_number: "PO-902",
      warehouse_code: "GP-FGM",
      remarks: "Rejected: rate not approved",
      is_foc: false,
      company: 1,
      party_state: "PB",
      created_at: "2026-06-15T10:24:00+05:30",
      created_by: 1,
      created_by_name: "Amit Kumar",
      rejected_by: "Priya Singh",
      rejection_reason: "Rate not approved",
      total_amount: 6420,
      tax_amount: 321,
      grand_total: 6741,
      items: [
        {
          id: 31,
          item_code: "JV-CAN-1L",
          item_name: "JIVO CANOLA OIL 1 LTR",
          category: "Edible Oil",
          brand: "Jivo",
          variety: "Canola",
          // NOT a free label. `item_type` is the pack size parsed out of the
          // item name by `getProductType` ("1 LTR" here), and it is what the
          // legacy form's Type select is populated from — a value outside that
          // vocabulary leaves Type on "--select--", which filters the Item
          // select to nothing and loads the order back as a blank row.
          item_type: "1 LTR",
          qty: 60,
          pcs: 12,
          boxes: 5,
          ltrs: 60,
          price_list_basic: 107,
          basic_price: 107,
          tax_rate: 5,
          total: 6420,
          total_ltrs: 60,
          schemes: [],
        },
      ],
    },
  ],

  /*
   * An order's log timeline — `/orders/<id>/orderlogs/`, `OrderLog[]`
   * (ordersService.ts:411).
   *
   * It had no fixture, so every timeline in the app drew "No tracking logs
   * found for this order." The first `distributor-tracking-panel.png` proved
   * it: the panel was on screen and the timeline — the part carrying most of
   * that page's inline styles — was not. A passing screenshot of the wrong
   * half.
   *
   * Four rows so the timeline renders its full vocabulary: a first entry, two
   * middle ones, and a rejection, which is the branch that colours the dot and
   * shows a remark.
   */
  [
    /\/orders\/\d+\/orderlogs\//,
    [
      {
        id: 1,
        status_name: "Pending",
        remarks: "Order created",
        performed_by_name: "Amit Kumar",
        created_at: "2026-06-15T10:24:00+05:30",
      },
      {
        id: 2,
        status_name: "Pending Approval",
        remarks: "Sent for rate approval",
        performed_by_name: "Amit Kumar",
        created_at: "2026-06-15T11:02:00+05:30",
      },
      {
        id: 3,
        status_name: "Need Approval",
        remarks: "Awaiting rate approver",
        performed_by_name: null,
        created_at: "2026-06-15T12:15:00+05:30",
      },
      {
        id: 4,
        status_name: "Rejected",
        remarks: "Rate not approved",
        performed_by_name: "Priya Singh",
        created_at: "2026-06-15T14:40:00+05:30",
      },
    ],
  ],

  // ---- Orders -------------------------------------------------------------
  [/\/orders\/ordersbyuser\//, ORDER_ROWS],
  [/\/orders\/list\//, ORDER_ROWS],
  // Order_Status_Tracking's own endpoint — the one that makes `ot-badge`
  // render. It was converted a step earlier with no coverage at all; this is
  // what turns that from "probably fine" into a screenshot.
  [/\/orders\/status-tracking\//, ORDER_ROWS],
  [/\/orders\/mart\/list\//, ORDER_ROWS],
  [
    /\/orders\/status\//,
    [
      { id: 1, name: "Pending", status_display: "Pending" },
      { id: 2, name: "Approved", status_display: "Approved" },
      { id: 3, name: "Rejected", status_display: "Rejected" },
      { id: 4, name: "Billed", status_display: "Billed" },
      { id: 5, name: "Pending Approval", status_display: "Pending Approval" },
    ],
  ],

  // ---- Invoice review -----------------------------------------------------
  // `extractRecords` accepts a bare array, `{results}` or `{data}`; a plain
  // array is what the endpoint sends.
  [/\/invoice\/logs\/all\//, INVOICE_LOG_ROWS],
  // The revision chain for one log. Rows here were the difference between the
  // history drawer showing a status trail and showing "No history available
  // for this entry" — which is what the first interaction baseline captured,
  // and which would have covered nothing while looking like it covered a modal.
  [
    /\/invoice\/history\//,
    [
      {
        ...INVOICE_LOG_ROWS[2],
        id: 101,
        status: "PENDING",
        created_at: "2026-06-01T09:10:00+05:30",
      },
      {
        ...INVOICE_LOG_ROWS[3],
        id: 102,
        status: "EDITED",
        created_at: "2026-06-01T10:05:00+05:30",
      },
      {
        ...INVOICE_LOG_ROWS[1],
        id: 103,
        status: "REJECTED",
        created_at: "2026-06-01T11:40:00+05:30",
      },
      {
        ...INVOICE_LOG_ROWS[0],
        id: 104,
        status: "APPROVED",
        created_at: "2026-06-02T08:20:00+05:30",
      },
      {
        ...INVOICE_LOG_ROWS[5],
        id: 105,
        status: "POSTED_TO_SAP",
        created_at: "2026-06-02T09:00:00+05:30",
      },
    ],
  ],

  // ---- SAP / HANA ---------------------------------------------------------
  [/\/hana\/product-stock\//, STOCK_ROWS],
  [
    /\/hana\/open-parties\//,
    [
      { CardCode: "C000123", CardName: "Northern Traders", Num_of_Open_SalesOrder: 3 },
      { CardCode: "C000456", CardName: "Southern Supply Co", Num_of_Open_SalesOrder: 1 },
    ],
  ],
  // `PendingDispatchResponse`. Two orders, one per `status`, so both
  // `sovi-badge` variants land in the image.
  [
    /\/hana\/pending-dispatch\//,
    {
      branch: "OIL",
      order_count: 2,
      line_count: 3,
      invoice_count: 1,
      orders: [
        {
          so_doc_entry: 501,
          sales_order: 20601,
          order_date: "2026-06-01",
          delivery_date: "2026-06-10",
          card_code: "C000123",
          party_name: "Northern Traders",
          so_name: "Northern Traders",
          location: "Ludhiana",
          chain: "GT",
          dispatch_from: "Oil Main",
          lines: [],
          invoices: [],
          qty_ordered: 400,
          qty_invoiced: 0,
          qty_pending: 400,
          ltr_pending: 400,
          boxes_pending: 34,
          value_pending: 125000,
          invoiced_value: 0,
          invoiced_pct: 0,
          line_count: 2,
          pending_line_count: 2,
          invoice_count: 0,
          status: "NOT INVOICED",
        },
        {
          so_doc_entry: 502,
          sales_order: 20602,
          order_date: "2026-06-02",
          delivery_date: "2026-06-11",
          card_code: "C000456",
          party_name: "Southern Supply Co",
          so_name: "Southern Supply Co",
          location: "Kochi",
          chain: "MT",
          dispatch_from: "Beverage Main",
          lines: [],
          invoices: [],
          qty_ordered: 300,
          qty_invoiced: 180,
          qty_pending: 120,
          ltr_pending: 120,
          boxes_pending: 10,
          value_pending: 19300,
          invoiced_value: 29000,
          invoiced_pct: 60,
          line_count: 1,
          pending_line_count: 1,
          invoice_count: 1,
          status: "PARTLY INVOICED",
        },
      ],
    },
  ],

  // ---- Devices ------------------------------------------------------------
  // `res.data.data` — an envelope, and then `{results, pagination}` inside it.
  [
    /\/admin\/devices\/analytics\//,
    {
      data: {
        total: 4,
        by_status: { online: 1, idle: 1, offline: 1, inactive: 1 },
        by_platform: {},
        daily: [],
      },
    },
  ],
  [/\/admin\/version-policy\//, { data: { android: null, ios: null } }],
  [
    /\/admin\/devices\//,
    {
      data: {
        results: DEVICE_ROWS,
        // Its own pagination rather than the shared empty one: the page prints
        // the TOTAL as "N devices", so a shared `total: 0` renders "0 devices"
        // above four visible rows — a screenshot that contradicts itself.
        // `total_pages: 3`, not 1. Device_Management pages server-side, so this
        // is the only fixture in the file that can make a pager render at all —
        // every other paginated screen has fewer rows than one page holds, and
        // 17 pagination conversions produced ZERO screenshot diffs because of
        // it. Three pages of four rows is inconsistent, and it is the one
        // inconsistency that buys coverage of the <Pagination> primitive.
        pagination: { page: 1, page_size: 4, total: 12, total_pages: 3 },
      },
    },
  ],

  // ---- Hardware Assets (HAIS) ----------------------------------------------
  /*
   * No `/hais/*` endpoint had a fixture at all, so `AssetLookup`'s "asset &&"
   * block — and the `AssetHistory` component nested inside it — never
   * rendered in any test; every history timeline in the app has only ever
   * shown "No history recorded yet." Four log entries below, one per
   * `dotTone()` branch (handover/maintenance/eol/default — AssetHistory.tsx),
   * plus a `reason` and a `config_change` so those two optional lines render
   * too. Field names match the RAW API shape `assetFromApi` expects
   * (`asset_type_name`, `department_name`, `logs`), not the transformed
   * `Asset`/`AssetHistoryEntry` shape the rest of the app reads.
   */
  [
    /\/hais\/assets\/HAIS-001\//,
    {
      asset_id: "HAIS-001",
      asset_type_name: "Laptop",
      company: "Dell",
      model_num: "Latitude 5440",
      serial_num: "SN-88213",
      warranty_ends: "2027-03-01",
      processor: "Intel i5-1335U",
      memory: "16 GB",
      operating_system: "Windows 11 Pro",
      storage: "512 GB SSD",
      current_user_id: "EMP2210",
      current_user_name: "Priya Nair",
      prev_user_id: "EMP1187",
      prev_user_name: "Amit Kumar",
      department_name: "Accounts",
      email_id: "priya.nair@jivo.example",
      current_location: "2nd floor",
      handover_date: "2026-05-10",
      vendor: "Dell India",
      date_of_last_service: "2026-04-01",
      working_status: "Working",
      remarks: "",
      logs: [
        {
          event_date: "10/05/2026",
          action: "Assigned",
          to_user_id: "EMP1187",
          to_user_name: "Amit Kumar",
          department_name: "Accounts",
          location: "2nd floor",
        },
        {
          event_date: "02/01/2026",
          action: "Config Updated",
          department_name: "Accounts",
          location: "2nd floor",
          config_change: "Memory 8 GB → 16 GB",
        },
        {
          event_date: "15/11/2025",
          action: "Sent for Service",
          department_name: "Accounts",
          location: "2nd floor",
          reason: "Trackpad not responding",
        },
        {
          event_date: "20/07/2025",
          action: "Handover",
          from_user_id: "EMP1187",
          from_user_name: "Amit Kumar",
          to_user_id: "EMP2210",
          to_user_name: "Priya Nair",
          department_name: "Accounts",
          location: "2nd floor",
        },
      ],
    },
  ],

  // ---- Notifications ------------------------------------------------------
  // The bell polls these on every page, so a wrong shape breaks EVERY
  // screenshot rather than one.
  /*
   * Notifications, populated.
   *
   * These answered empty until now, which meant the bell rendered without its
   * badge and the notifications dialog rendered its empty state — so the
   * grouping logic, the unread dot, the filter chips and 26 inline styles in
   * `Sidebar.tsx` had no screenshot between them. The bell itself is gated on
   * `["auditor","billing","manager"]`, so even an empty one was invisible to a
   * suite that runs as `admin`; see `asRole` in harness.ts.
   *
   * `Notification` is `{id, message, is_read, order_id, created_at}`
   * (components/sidebar/notificationGrouping.ts:11). The dates are relative to
   * the harness's frozen clock so the grouping lands in "Today" and
   * "Yesterday" deterministically rather than drifting into "Older" as the
   * real date moves.
   */
  [
    /\/orders\/notifications\/history\//,
    {
      results: [
        {
          id: 1,
          message: "SO-202601 needs your approval — Northern Traders",
          is_read: false,
          order_id: 1,
          created_at: "2026-06-15T09:10:00+05:30",
        },
        {
          id: 2,
          message: "SO-202602 was approved by the rate approver",
          is_read: false,
          order_id: 2,
          created_at: "2026-06-15T08:05:00+05:30",
        },
        {
          id: 3,
          message: "SO-202603 was rejected — rate not approved",
          is_read: true,
          order_id: 3,
          created_at: "2026-06-14T17:40:00+05:30",
        },
      ],
      next_offset: null,
      unread_count: 2,
    },
  ],
  [
    /\/orders\/notifications\//,
    [
      { id: 1, message: "SO-202601 needs your approval — Northern Traders", is_read: false, order_id: 1, created_at: "2026-06-15T09:10:00+05:30" },
      { id: 2, message: "SO-202602 was approved by the rate approver", is_read: false, order_id: 2, created_at: "2026-06-15T08:05:00+05:30" },
      { id: 3, message: "SO-202603 was rejected — rate not approved", is_read: true, order_id: 3, created_at: "2026-06-14T17:40:00+05:30" },
    ],
  ],

  // ---- Parties and products ----------------------------------------------
  /*
   * ---- Add_Sales -------------------------------------------------------
   *
   * The order-entry wizard, which had no fixtures at all. Its route baseline
   * is step 1 with every dropdown closed, so roughly 1,400 lines of that page
   * — the item editor, the summary and review steps, the legacy form — could
   * be deleted without the image changing. These are what let a test drive it
   * past step 1.
   *
   * `/orders/parties/` MUST come before the broad party pattern below, and
   * must not be merged into it. Add_Sales reads `party.value` and
   * `party.label` (Add_Sales.tsx:2763, 2765, 1848-1851); `PARTY_ROWS` has
   * neither, so today the dropdown renders three options with blank labels
   * whose click handler is called with `undefined`. PARTY_ROWS itself is left
   * alone because `/auth/users/{id}/parties/` and
   * `/auth/parties/{code}/products/` also land on that pattern and feed
   * Party_Product_Assignment.
   *
   * `category` here is NOT the party's business type. Choosing a party seeds
   * the first row with it (Add_Sales.tsx:1613) and filters the catalogue by it
   * (:398-403), and the item picker then matches it against the PRODUCT's
   * category — so a party and the goods it can be sold share one vocabulary.
   * "Distributor" here, as in PARTY_ROWS, would filter the catalogue down to
   * nothing and leave the picker permanently empty.
   */
  [
    /\/orders\/parties\//,
    [
      {
        value: "C000123",
        label: "Northern Traders (C000123)",
        card_code: "C000123",
        card_name: "Northern Traders",
        category: "Edible Oil",
        state: "Punjab",
        state_code: "PB",
        gst_no: "03ABCDE1234F1Z5",
      },
      {
        value: "C000456",
        label: "Southern Supply Co (C000456)",
        card_code: "C000456",
        card_name: "Southern Supply Co",
        category: "Edible Oil",
        state: "Kerala",
        state_code: "KL",
        gst_no: "32ABCDE1234F1Z5",
      },
    ],
  ],

  // Without this the branch auto-default at Add_Sales.tsx:267-272 never fires,
  // so `formData.dispatch` stays "" and Continue is disabled forever.
  [
    /\/orders\/branch\//,
    [
      { bpl_id: 1, bpl_name: "Ludhiana" },
      { bpl_id: 2, bpl_name: "Delhi" },
    ],
  ],

  /*
   * Addresses. `fetchPartyAddresses` falls back to the OTHER list only when one
   * is empty (Add_Sales.tsx:384-393), and choosing a party deliberately blanks
   * both form values — nothing refills them, so a test has to click an option
   * in each. Both lists are populated here so that click path is the one
   * exercised rather than the fallback.
   */
  [
    /\/orders\/addresses\//,
    {
      bill_to: [
        { id: 11, address_id: "BILL-1", address_name: "Head Office", full_address: "12 Mall Road, Ludhiana, Punjab 141001" },
        { id: 12, address_id: "BILL-2", address_name: "Registered Office", full_address: "4 Civil Lines, Ludhiana, Punjab 141001" },
      ],
      ship_to: [
        { id: 21, address_id: "SHIP-1", address_name: "Main Warehouse", full_address: "Plot 9, Focal Point, Ludhiana, Punjab 141010" },
        { id: 22, address_id: "SHIP-2", address_name: "Cold Store", full_address: "Plot 22, Focal Point, Ludhiana, Punjab 141010" },
      ],
    },
  ],

  /*
   * The party catalogue. Two traps here, both load-bearing:
   *
   *   * `sal_factor2` MUST be a non-zero number on every product. It becomes
   *     `row.pcs`, and a row with pcs <= 0 cannot be confirmed at all
   *     (salesOrderRow.ts rowProblem) — so a catalogue with it missing makes
   *     every item unorderable and the wizard untestable past step 2.
   *   * `category` is filtered case-INSENSITIVELY after the fetch
   *     (Add_Sales.tsx:426-431) but compared case-SENSITIVELY in the item
   *     picker. These use one exact spelling throughout so the two agree.
   */
  [
    /\/orders\/party-products\//,
    [
      {
        item_code: "JV-CAN-1L",
        item_name: "JIVO CANOLA OIL 1 LTR",
        category: "Edible Oil",
        brand: "Jivo",
        variety: "Canola",
        sal_factor2: 12,
        sal_pack_unit: "1",
        tax_rate: 5,
        basic_rate: 107,
      },
      {
        item_code: "JV-OLV-500",
        item_name: "JIVO OLIVE OIL 500 ML",
        category: "Edible Oil",
        brand: "Jivo",
        variety: "Olive",
        sal_factor2: 24,
        sal_pack_unit: "0.5",
        tax_rate: 5,
        basic_rate: 214,
      },
      {
        item_code: "JV-RIC-5L",
        item_name: "JIVO RICE BRAN OIL 5 LTR",
        category: "Edible Oil",
        brand: "Jivo",
        variety: "Rice Bran",
        sal_factor2: 4,
        sal_pack_unit: "5",
        tax_rate: 5,
        basic_rate: 500,
      },
      /*
       * The MART row, and the only one on this list that is not "Edible Oil".
       *
       * `/Distributor` hard-codes `CATEGORY = "MART"` (Distributor/index.tsx:38)
       * and filters this response down to it, so with three Edible Oil rows it
       * rendered "No MART products are assigned to your party yet." — which,
       * combined with the missing `/auth/users/<id>/parties/` fixture, is why
       * that page's baseline was a photograph of an error banner.
       *
       * `updated_at` is inside the frozen clock's month on purpose:
       * `isCurrentMonth` (index.tsx:85-93) blocks ordering against a
       * party-product assignment that was not refreshed this month, so a date
       * outside 2026-06 would list the product but leave it unorderable — a
       * third variant of "looks fine, does nothing". See harness.ts FROZEN_NOW.
       */
      {
        item_code: "JV-MART-ATTA",
        item_name: "JIVO CHAKKI ATTA 5 KG",
        category: "MART",
        brand: "Jivo",
        variety: "Atta",
        sub_group: "Atta",
        sal_factor2: 6,
        sal_pack_unit: "5",
        tax_rate: 5,
        basic_rate: 250,
        updated_at: "2026-06-10T09:00:00+05:30",
      },
    ],
  ],

  // The name-only fallback used when a row's item is not in the party
  // catalogue (Add_Sales.tsx:1498-1500).
  [
    /\/orders\/products\//,
    [
      { item_code: "JV-CAN-1L", item_name: "JIVO CANOLA OIL 1 LTR", sal_factor2: 12, sal_pack_unit: "1" },
      { item_code: "JV-OLV-500", item_name: "JIVO OLIVE OIL 500 ML", sal_factor2: 24, sal_pack_unit: "0.5" },
    ],
  ],

  /*
   * Add_Scheme's manage table. Both entries MUST stay above the bare
   * `/orders/schemes/` entry below them — first match wins, and that one
   * answers `[]`, which `getSchemesForManage` (ordersService.ts:877) reads as
   * `[].data ?? []`. The page then renders "No schemes found.", so
   * `/Add_Scheme` would have baselined as a picture of an empty table.
   *
   * TWO entries, split on the query string, because `include_inactive` is a
   * server-side filter that the page now expresses as a QUERY KEY. `fulfil()`
   * matches on `route.request().url()`, which carries the query string, so the
   * fixture can model the filter honestly instead of returning the same rows
   * either way. That is what lets the interaction test toggle "Show
   * deactivated" and watch the count go 2 -> 3 — which is the only assertion
   * that actually proves the key is wired up rather than ignored.
   *
   * Enveloped as `{data: [...]}` because that method unwraps
   * `response.data?.data`, unlike the bare-array scheme lookup underneath it.
   */
  [
    /\/orders\/schemes\/manage\/.*include_inactive=true/,
    {
      data: [
        {
          scheme_id: 1,
          scheme_name: "Canola Carton Offer",
          item_code: "JV-CAN-1L",
          item_name: "JIVO CANOLA OIL 1 LTR",
          state: 1,
          state_code: "PB",
          state_name: "Punjab",
          is_active: true,
          product_id: 11,
          sal_factor2: 12,
          sal_pack_unit: "1",
        },
        {
          scheme_id: 2,
          scheme_name: "Olive Half-Litre Trade Scheme",
          item_code: "JV-OLV-500",
          item_name: "JIVO OLIVE OIL 500 ML",
          state: 2,
          state_code: "KL",
          state_name: "Kerala",
          is_active: true,
          product_id: 12,
          sal_factor2: 24,
          sal_pack_unit: "0.5",
        },
        {
          scheme_id: 3,
          scheme_name: "Mustard Monsoon Offer (closed)",
          item_code: "JV-MUS-1L",
          item_name: "JIVO MUSTARD OIL 1 LTR",
          state: null,
          state_code: null,
          state_name: null,
          is_active: false,
          product_id: 13,
          sal_factor2: 12,
          sal_pack_unit: "1",
        },
      ],
    },
  ],
  /* The default view: the deactivated scheme is filtered out by the server, so
     the page's own list must be two rows until the checkbox is ticked. */
  [
    /\/orders\/schemes\/manage\//,
    {
      data: [
        {
          scheme_id: 1,
          scheme_name: "Canola Carton Offer",
          item_code: "JV-CAN-1L",
          item_name: "JIVO CANOLA OIL 1 LTR",
          state: 1,
          state_code: "PB",
          state_name: "Punjab",
          is_active: true,
          product_id: 11,
          sal_factor2: 12,
          sal_pack_unit: "1",
        },
        {
          scheme_id: 2,
          scheme_name: "Olive Half-Litre Trade Scheme",
          item_code: "JV-OLV-500",
          item_name: "JIVO OLIVE OIL 500 ML",
          state: 2,
          state_code: "KL",
          state_name: "Kerala",
          is_active: true,
          product_id: 12,
          sal_factor2: 24,
          sal_pack_unit: "0.5",
        },
      ],
    },
  ],

  // Scheme lookup. An empty list is the honest default — schemes are a
  // separate branch and giving every order one would make the plain path the
  // untested one. Explicit rather than absent so the request is not a miss.
  [/\/orders\/schemes\//, []],

  /*
   * The v2 scheme engine's dry run. Add_Sales debounces a POST here on every
   * quantity change (Add_Sales.tsx:1755-1800) and turns each proposal into an
   * order line the salesperson never picked — the branch that carries
   * `scheme_v2_id`, which is the ONLY key the backend qualifies a v2 entry on.
   *
   * `line_index` must be 0 and `qty_is_user_supplied` false, or the proposal is
   * dropped before it reaches a row and the fixture proves nothing.
   */
  [
    /\/orders\/v2\/schemes\/preview\//,
    {
      success: true,
      context: {
        card_code: "C000123",
        category: "Edible Oil",
        state_code: "PB",
        main_group: "Main",
      },
      proposals: [
        {
          line_index: 0,
          trigger_item_code: "JV-CAN-1L",
          scheme_id: 42,
          scheme_code: "SCH-042",
          scheme_name: "Canola Carton Offer",
          benefit_id: 91,
          benefit_item_code: "JV-OLV-500",
          free_uom: "BOX",
          qty: "1",
          qty_pieces: "24",
          qualifying_qty: "5",
          scope_type: "PARTY",
          scope_value: "C000123",
          priority: 1,
          stackable: false,
          qty_is_user_supplied: false,
        },
      ],
    },
  ],

  /*
   * Scheme_Manager's list. MUST stay BELOW the `/orders/v2/schemes/preview/`
   * entry above — this pattern would otherwise swallow the preview POST, which
   * is a different shape entirely.
   *
   * Why it was missing at all: the fixture file already had
   * `[/\/orders\/schemes\//, []]`, and it is easy to read that as covering
   * this page. It does not — `schemeService.list` calls `/orders/v2/schemes/`,
   * which that pattern never matches, so `scheme-manager.png` was a baseline of
   * an empty table while its reference data (states, parties, products) loaded
   * fine and made the page look convincingly alive.
   *
   * Enveloped as `{data: [...]}` (`schemeService.ts:388` reads
   * `response.data?.data`). Two rows, one inactive, because the list draws
   * those differently and swaps the row action to "Turn on".
   */
  [
    /\/orders\/v2\/schemes\//,
    {
      data: [
        {
          id: 42,
          code: "SCH-042",
          name: "Canola Carton Offer",
          description: "Buy 10 cartons of 1 LTR canola, get 1 free.",
          category: "Edible Oil",
          valid_from: "2026-06-01",
          valid_to: "2026-12-31",
          is_active: true,
          priority: 10,
          stackable: false,
          benefits: [
            {
              id: 1,
              free_item_code: "FG0000011",
              free_uom: "BOX",
              per_qty: 10,
              free_qty: 1,
              max_free_qty: null,
            },
          ],
          triggers: [
            {
              id: 1,
              match_type: "ITEM",
              match_value: "FG0000011",
              min_qty: 10,
              min_uom: "BOX",
              applies_to: "LINE",
            },
          ],
          assignments: [
            {
              id: 1,
              scope_type: "STATE",
              scope_value: "PB",
              category: "Edible Oil",
              is_exclusion: false,
              valid_from: null,
              valid_to: null,
            },
          ],
        },
        {
          id: 43,
          code: "SCH-043",
          name: "Olive Monsoon Offer (turned off)",
          description: "Seasonal offer, currently switched off.",
          category: "Edible Oil",
          valid_from: "2026-07-01",
          valid_to: "2026-09-30",
          is_active: false,
          priority: 20,
          stackable: true,
          benefits: [
            {
              id: 2,
              free_item_code: "FG0000013",
              free_uom: "PCS",
              per_qty: 24,
              free_qty: 2,
              max_free_qty: 10,
            },
          ],
          triggers: [
            {
              id: 2,
              match_type: "ITEM",
              match_value: "FG0000013",
              min_qty: 24,
              min_uom: "PCS",
              applies_to: "LINE",
            },
          ],
          assignments: [],
        },
      ],
    },
  ],

  /*
   * The parties already assigned to one user — Party_Assignment's third fetch.
   *
   * MUST stay above the `/parties/` catch-all directly below it. `/auth/users/
   * 1/parties/` matches that catch-all, which answers `PARTY_ROWS` — a bare
   * array with no `parties` key — so `res.data?.parties || []` came back empty
   * and every checkbox rendered unchecked. The page's baseline photographed
   * that as if it were "this user has no parties yet".
   *
   * ONE of the two parties `/sap/parties/` returns — deliberately not both.
   * The picker lists the SAP parties and checks the ones in this response, so
   * one assigned and one unassigned is what proves the seed: a checked box AND
   * an unchecked one on the same screen. A fixture that assigned both could not
   * tell "seeded from the server" apart from "select-all is stuck on".
   *
   * It must be a card_code that EXISTS in `/sap/parties/` (which is its own
   * two-row fixture further up, NOT the three-row PARTY_ROWS). An assigned
   * party missing from the SAP list simply never renders a row, which is how
   * the first version of this fixture quietly asserted nothing.
   *
   * `category` must match what `isPartyInUserCategory` compares against, or the
   * page filters the row straight back out.
   */
  [
    /\/auth\/users\/\d+\/parties\//,
    {
      data: {
        parties: [
          { card_code: "C000123", card_name: "Northern Traders", category: "Distributor" },
        ],
      },
    },
  ],

  /*
   * The products already assigned to ONE party — Party_Product_Assignment's
   * grid, which is everything below the party picker on that page.
   *
   * MUST stay above the `/parties/` catch-all below: `/auth/parties/C000123/
   * products/` matches that pattern, which answers `PARTY_ROWS` — a bare array
   * with no `products` key — so `res.data?.products || res.products || []`
   * unwrapped to empty and the grid never drew. That page carries 85 inline
   * styles, more than any other file in the app, and almost all of them are in
   * the markup this fixture switches on.
   *
   * Codes match `/sap/products/` so the "Add products" modal (which lists the
   * SAP catalogue minus what is already assigned) has exactly one row left to
   * offer — assigned and unassigned both visible from one fixture.
   */
  [
    /\/auth\/parties\/[^/]+\/products\//,
    {
      products: [
        {
          id: 1,
          item_code: "FG0000011",
          item_name: "Jivo Canola Oil 1 L",
          category: "OIL",
          brand: "Jivo",
          variety: "Canola",
          sal_pack_unit: "12",
          basic_rate: 1250.5,
        },
        {
          id: 2,
          item_code: "FG0000012",
          item_name: "Jivo Beverage 250 ml",
          category: "BEVERAGES",
          brand: "Jivo",
          variety: "Mango",
          sal_pack_unit: "24",
          basic_rate: 480,
        },
      ],
    },
  ],

  [/\/(orders\/parties|parties|party)\//, PARTY_ROWS],
];

/**
 * The body for a URL, or `null` when nothing matches.
 *
 * A miss is deliberately not an error here — most endpoints are happy with the
 * bare-array default, and demanding a fixture for all ~220 of them would make
 * this file impossible to keep honest. The error-boundary check in
 * `gotoStable` is what turns a miss that actually matters into a failure.
 */
export function fixtureFor(url: string): Body | null {
  for (const [pattern, body] of FIXTURES) {
    if (pattern.test(url)) return body;
  }
  return null;
}
