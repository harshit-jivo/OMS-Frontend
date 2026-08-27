# Frontend duplication analysis

Why this matters: **108 pages, 18 shared components.** Most UI is built
per page. Every row below is a primitive shadcn already ships.

## Hand-rolled primitives

| primitive | pages | in `components/`? | shadcn replacement |
|---|---:|---|---|
| data table | **50** | yes | `Table` + TanStack Table |
| status badge | **37** | yes | `Badge` |
| modal / dialog | **36** | yes | `Dialog` / `AlertDialog` |
| loading spinner | **27** | **no** | `Skeleton` / `Spinner` |
| pagination | **23** | **no** | `Pagination` |
| toast / alert | **7** | yes | `Sonner` / `Toast` |
| date range picker | **9** | **no** | `Calendar` + `Popover` |
| confirm dialog | **8** | **no** | `AlertDialog` |
| file upload | **5** | **no** | `Input type=file` + `Progress` |
| tabs | **3** | **no** | `Tabs` |
| dropdown / select | **2** | **no** | `Select` / `DropdownMenu` |
| search / filter bar | **1** | **no** | `Input` + `Command` |

### Where each appears


**data table** — 51

`Add_Sales.tsx`, `Add_Scheme.tsx`, `Ap_Invoice_Entry.tsx`, `App_User.tsx`, `Auditor_Order.tsx`, `Billing_Order.tsx`, `Branches.tsx`, `Daily_Report.tsx`, `Dashboard.tsx`, `Device_Management.tsx`, `Distributor/Order_Tracking.tsx`, `Distributor/index.tsx`, `Drafts.tsx`, `HAIS/AssetRegister.tsx`, `HAIS/HaisReports.tsx`, `HAIS/OptionManager.tsx`, `Inventory_Report.tsx`, `InvoiceReview.tsx`, `Label_Checker.tsx`, `Logs.tsx`, `MartApproval/index.tsx`, `Nutrition_Manager.tsx`, `Order_Status_Tracking.tsx`, `Order_Tracking.tsx`, `PartyDirectory.tsx`, `Payments/ApprovalManagement.tsx`, `Payments/CollectionTable.tsx`, `Payments/ConfigTab.tsx`, `PersonWise_Report.tsx`, `Product_Stock.tsx`, `Products.tsx`, `Rate_Approver_Order.tsx`, `SO_Invoice_Report.tsx`, `SalesInvoice/LinesStep.tsx`, `SalesInvoice/OrdersStep.tsx`, `SalesInvoice/index.tsx`, `Sales_Quotation.tsx`, `Sales_Report.tsx`, `Staff.tsx`, `StateWise_Report.tsx` … +11 more

**status badge** — 41

`Add_Sales.tsx`, `Add_Scheme.tsx`, `Addresses.tsx`, `App_User.tsx`, `Auditor_Order.tsx`, `Billing_Order.tsx`, `Daily_Report.tsx`, `Dashboard.tsx`, `Distributor/Order_Tracking.tsx`, `InvoiceReview.tsx`, `Label_Checker.tsx`, `Logs.tsx`, `Order_Flow_Settings.tsx`, `Order_Status_Tracking.tsx`, `Order_Tracking.tsx`, `Page_Permissions.tsx`, `Parties.tsx`, `PartyDirectory.tsx`, `Payments/ApprovalManagement.tsx`, `PersonWise_Report.tsx`, `Product_Stock.tsx`, `Products.tsx`, `Rate_Approver_Order.tsx`, `SO_Invoice_Report.tsx`, `SalesInvoice/DraftStep.tsx`, `SalesInvoice/OrdersStep.tsx`, `SalesInvoice/SOCard.tsx`, `SalesInvoice/index.tsx`, `Sales_Report.tsx`, `Scheme_Manager.tsx`, `Staff.tsx`, `Tracker_Admin.tsx`, `Tracker_Alerts.tsx`, `Tracker_Entry.tsx`, `Tracker_Invoices.tsx`, `Tracker_Queue.tsx`, `View_Orders.tsx`, `components/MissionControlLoader.tsx`, `components/StatusBadge.tsx`, `components/order-items/ItemCard.tsx` … +1 more

**modal / dialog** — 38

`Add_Sales.tsx`, `Ap_Invoice_Entry.tsx`, `App_User.tsx`, `Auditor_Order.tsx`, `Billing_Order.tsx`, `Dashboard.tsx`, `HAIS/AssetActionModal.tsx`, `HAIS/AssetDetails.tsx`, `HAIS/AssetRegister.tsx`, `HAIS/ErrorPopup.tsx`, `HAIS/QrScanner.tsx`, `InvoiceReview.tsx`, `MartApproval/index.tsx`, `Nutrition_Manager.tsx`, `Order_Flow_Settings.tsx`, `Order_Status_Tracking.tsx`, `Page_Permissions.tsx`, `Party_Product_Assignment.tsx`, `Payments/ApprovalUI.tsx`, `Product_Stock.tsx`, `Rate_Approver_Order.tsx`, `SO_Invoice_Report.tsx`, `SalesInvoice/ContentsTab.tsx`, `SalesInvoice/DraftStep.tsx`, `SalesInvoice/InteractiveLoader.tsx`, `SalesInvoice/SkuGalleryPage.tsx`, `SalesInvoice/index.tsx`, `Scheme_Manager.tsx`, `Staff.tsx`, `Tracker_Admin.tsx`, `Tracker_Alerts.tsx`, `Tracker_Entry.tsx`, `Tracker_Invoices.tsx`, `Tracker_Queue.tsx`, `UI_Labels.tsx`, `View_Orders.tsx`, `components/Sidebar.tsx`, `components/order-items/PartyHeader.tsx`

**loading spinner** — 27

`Add_Sales.tsx`, `App_User.tsx`, `Auditor_Order.tsx`, `Billing_Order.tsx`, `Daily_Report.tsx`, `Dashboard.tsx`, `Distributor/Order_Tracking.tsx`, `Label_Checker.tsx`, `Login.tsx`, `Order_Flow_Settings.tsx`, `Order_Status_Tracking.tsx`, `Order_Tracking.tsx`, `Page_Permissions.tsx`, `PersonWise_Report.tsx`, `Product_Stock.tsx`, `Rate_Approver_Order.tsx`, `SalesInvoice/ContentsTab.tsx`, `SalesInvoice/DraftStep.tsx`, `SalesInvoice/InteractiveLoader.tsx`, `SalesInvoice/OrdersStep.tsx`, `SalesInvoice/PartyStep.tsx`, `SalesInvoice/SkuGalleryPage.tsx`, `SalesInvoice/index.tsx`, `Sales_Report.tsx`, `UI_Labels.tsx`, `View_Orders.tsx`, `einvoice/GenLogs.tsx`

**pagination** — 23

`Addresses.tsx`, `App_User.tsx`, `Auditor_Order.tsx`, `Billing_Order.tsx`, `Branches.tsx`, `Daily_Report.tsx`, `Device_Management.tsx`, `Distributor/Order_Tracking.tsx`, `Logs.tsx`, `Order_Status_Tracking.tsx`, `Order_Tracking.tsx`, `Parties.tsx`, `Payments/AnalyticsTab.tsx`, `Payments/CollectionTable.tsx`, `PersonWise_Report.tsx`, `Product_Stock.tsx`, `Products.tsx`, `Rate_Approver_Order.tsx`, `Sales_Quotation.tsx`, `Sales_Report.tsx`, `Staff_Rate_Assignment.tsx`, `StateWise_Report.tsx`, `View_Orders.tsx`

**toast / alert** — 9

`Ap_Invoice_Entry.tsx`, `Login.tsx`, `Tracker_Admin.tsx`, `Tracker_Entry.tsx`, `Tracker_Invoices.tsx`, `Tracker_Queue.tsx`, `UI_Labels.tsx`, `components/NotificationToaster.tsx`, `components/Sidebar.tsx`

**date range picker** — 9

`Auditor_Order.tsx`, `Billing_Order.tsx`, `Order_Status_Tracking.tsx`, `PersonWise_Report.tsx`, `Rate_Approver_Order.tsx`, `SO_Invoice_Report.tsx`, `Sales_Report.tsx`, `StateWise_Report.tsx`, `View_Orders.tsx`

**confirm dialog** — 8

`Add_Scheme.tsx`, `Combo_Mapping.tsx`, `Drafts.tsx`, `InvoiceReview.tsx`, `Party_Product_Assignment.tsx`, `SalesInvoice/index.tsx`, `Scheme_Manager.tsx`, `Tracker_Admin.tsx`

**file upload** — 5

`InvoiceReview.tsx`, `Label_Checker.tsx`, `Party_Assignment.tsx`, `Party_Product_Assignment.tsx`, `SalesInvoice/SkuGalleryPage.tsx`

**tabs** — 3

`HAIS/index.tsx`, `Label_Checker.tsx`, `Sap_Sync.tsx`

**dropdown / select** — 2

`Party_Assignment.tsx`, `Party_Product_Assignment.tsx`

**search / filter bar** — 1

`Party_Product_Assignment.tsx`


## Duplicated CSS blocks

Byte-identical declaration blocks appearing in 3+ stylesheets — the
design tokens nobody extracted. Each is a Tailwind utility or a theme
variable waiting to happen.

**88 blocks duplicated across 3 or more files.**

| appears in | declarations |
|---:|---|
| 14 | `grid-template-columns: repeat(2, minmax(0, 1fr));` |
| 8 | `display: flex; flex-direction: column; gap: 6px;` |
| 8 | `display:flex; align-items:center; justify-content:flex-end; gap:4px; margin-top:16px;` |
| 8 | `background:#f8fafc; border-color:#cbd5e1; color:#1e293b;` |
| 8 | `font-size:12px; font-weight:600; color:#1e293b; font-family:'Inter',sans-serif; padding:0 4px;` |
| 7 | `width: 100%; border-collapse: collapse; font-size: 13px;` |
| 7 | `flex-direction: column; align-items: stretch;` |
| 6 | `background: #fef2f2; border-color: #fecaca; color: #dc2626;` |
| 6 | `border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);` |
| 6 | `display: flex; align-items: center; gap: 10px; flex-wrap: wrap;` |
| 6 | `display: inline-flex; align-items: center; justify-content: center; min-height: 24px; padding: 3px 10px; border: 1px sol` |
| 6 | `display: flex; align-items: center; gap: 10px;` |
| 5 | `background: #f8fafc; border-color: #cbd5e1;` |
| 5 | `font-size: 12px; font-weight: 600; color: #64748b;` |
| 5 | `flex-direction: column; align-items: stretch; gap: 10px;` |
| 5 | `display: flex; flex-direction: column; min-width: 0;` |
| 5 | `text-align: right; font-variant-numeric: tabular-nums;` |
| 5 | `display: flex; align-items: center; gap: 6px;` |
| 5 | `background: #fff7ed; box-shadow: inset 4px 0 0 #f97316;` |
| 5 | `background: #fb923c; border-color: rgba(255,255,255,.32); box-shadow: 0 0 0 3px rgba(251,146,60,.18);` |
| 5 | `display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 14px; font-size: var(--font` |
| 4 | `opacity: 1; transform: translateY(0) scale(1);` |
| 4 | `display: flex; flex-direction: column; gap: 8px; min-width: 0;` |
| 4 | `font-family: 'Inter', sans-serif; width: 100%; min-width: 0; background: transparent; padding: 0; min-height: auto; box-` |
| 4 | `display: flex; flex-direction: column; gap: 3px; min-width: 0;` |

**54 stylesheets · 35,067 lines total.**
