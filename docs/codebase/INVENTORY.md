# Frontend inventory

Extracted from source. Regex-based, so counts are indicative where noted.

## Routes — 59 declared, 4 guarded

`RequirePermission` is the client-side guard. It is explicitly **not**
the security boundary — the server is. An unguarded row here is only a
problem when the endpoints behind it are also open.

| path | component | client guard |
|---|---|---|
| `/` | `Login` | — |
| `/hais/device/:code` | `AssetPublicView` | — |
| `/Dashboard` | `Dashboard` | — |
| `/Profile` | `Profile` | — |
| `/Device_Management` | `Device_Management` | — |
| `/App_User` | `App_User` | — |
| `/Sap_Sync` | `Sap_sync` | — |
| `/Add_Sales` | `Add_Sales` | — |
| `/Drafts` | `Drafts` | — |
| `/FOC` | `FOC` | — |
| `/Sales_Invoice` | `SalesInvoice` | — |
| `/Sales_Invoice/SKU_Images` | `SkuGalleryPage` | — |
| `/Invoice_Review` | `InvoiceReview` | — |
| `/Invoice_Report` | `Invoice_Report` | — |
| `/Inventory_Report` | `Inventory_Report` | — |
| `/SO_Invoice_Report` | `SO_Invoice_Report` | — |
| `/View_Orders` | `View_Orders` | — |
| `/Auditor_orders` | `Auditor_orders` | — |
| `/Billing_orders` | `Billing_orders` | — |
| `/Rate_Approver_orders` | `RateApproverOrders` | — |
| `/Auditor_status_tracking` | `Order_Status_Tracking` | — |
| `/Billing_status_tracking` | `Order_Status_Tracking` | — |
| `/Rate_Approver_status_tracking` | `Order_Status_Tracking` | — |
| `/Daily_Report` | `Daily_Report` | — |
| `/PersonWise_Report` | `PersonWise_Report` | — |
| `/Sales_Report` | `Sales_Report` | — |
| `/StateWise_Report` | `StateWise_Report` | — |
| `/Order_Tracking` | `Order_Tracking` | — |
| `/Distributor_Order_Tracking` | `Distributor_Order_Tracking` | — |
| `/Party_Assignment` | `Party_Assignment` | — |
| `/Party_Product_Assignment` | `Party_Product_Assignment` | — |
| `/Add_Scheme` | `Add_Scheme` | — |
| `/Scheme_Manager` | `Scheme_Manager` | — |
| `/Combo_Mapping` | `Combo_Mapping` | — |
| `/Staff` | `Staff` | — |
| `/Staff_Rate_Assignment` | `Staff_Rate_Assignment` | — |
| `/Product_Stock` | `Product_Stock` | — |
| `/Order_Stock_Check` | `Order_Stock_Check` | — |
| `/Order_Flow_Settings` | `Order_Flow_Settings` | — |
| `/Page_Permissions` | `Page_Permissions` | — |
| `/Sales_Quotation` | `Sales_Quotation` | — |
| `/Label_Checker` | `LabelChecker` | Payments_Dashboard |
| `/Nutrition_Manager` | `NutritionManager` | Payments_Dashboard |
| `/UI_Labels` | `UI_Labels` | Payments_Dashboard |
| `/Payments_Dashboard` | `PaymentsDashboard` | Payments_Dashboard |
| `/Approval_Management` | `Ap_Invoice_Entry` | — |
| `/Ap_Invoice_Entry` | `Ap_Invoice_Entry` | — |
| `*` | `Einvoice` | — |
| `/Einvoice` | `Einvoice` | — |
| `/Ewaybill` | `Ewaybill` | — |
| `/HAIS` | `HAIS` | — |
| `/Distributor` | `Distributor` | — |
| `/Mart_Approval` | `MartApproval` | — |
| `/Tracker_Entry` | `Tracker_Entry` | — |
| `/Tracker_Queue` | `Tracker_Queue` | — |
| `/Tracker_Admin` | `Tracker_Admin` | — |
| `/Tracker_Reports` | `Tracker_Reports` | — |
| `/Tracker_Alerts` | `Tracker_Alerts` | — |
| `/Tracker_Invoices` | `Tracker_Invoices` | — |


## API calls — 220 call sites

Every endpoint the services layer touches. This is the contract with
OMS-Backend; cross-reference `OMS-Backend/docs/codebase/API_SURFACE.md`.


### `src/services/apInvoiceService.ts` — 4 calls

| line | method | url |
|---|---|---|
| 107 | GET | `/service-layer/ap/open-grpos/` |
| 117 | GET | `/service-layer/ap/grpo/` |
| 124 | GET | `/service-layer/ap/vendor-tds/` |
| 134 | POST | `/service-layer/ap/invoice/` |

### `src/services/api.ts` — 1 calls

| line | method | url |
|---|---|---|
| 139 | POST | `${API_BASE_URL}/auth/refresh/` |

### `src/services/approvalService.ts` — 35 calls

| line | method | url |
|---|---|---|
| 339 | GET | `/approvals/workflows/` |
| 344 | GET | `/approvals/workflows/${id}/` |
| 349 | POST | `/approvals/workflows/` |
| 357 | PATCH | `/approvals/workflows/${id}/` |
| 362 | DELETE | `/approvals/workflows/${id}/` |
| 374 | GET | `/approvals/workflows/${id}/preview/` |
| 382 | GET | `/approvals/levels/` |
| 389 | POST | `/approvals/levels/` |
| 397 | PATCH | `/approvals/levels/${id}/` |
| 402 | DELETE | `/approvals/levels/${id}/` |
| 407 | GET | `/approvals/levels/${levelId}/approvers/` |
| 415 | POST | `/approvals/levels/${levelId}/approvers/` |
| 423 | PATCH | `/approvals/approvers/${id}/` |
| 428 | DELETE | `/approvals/approvers/${id}/` |
| 442 | GET | `/approvals/requests/` |
| 448 | GET | `/approvals/requests/${id}/` |
| 453 | GET | `/approvals/inbox/` |
| 464 | POST | `/approvals/requests/${id}/act/` |
| 478 | GET | `/payments/admin/collection-persons/` |
| 487 | POST | `/payments/admin/collection-persons/` |
| 495 | PATCH | `/payments/admin/collection-persons/${id}/` |
| 503 | DELETE | `/payments/admin/collection-persons/${id}/` |
| 508 | GET | `/payments/collection-persons/` |
| 520 | GET | `/payments/admin/method-mapping-status/` |
| 534 | GET | `/payments/banks/` |
| 548 | PATCH | `/payments/admin/method-mappings/${id}/` |
| 549 | POST | `/payments/admin/method-mappings/` |
| 557 | PATCH | `/payments/admin/method-mappings/${id}/` |
| 563 | DELETE | `/payments/admin/method-mappings/${id}/` |
| 568 | GET | `/payments/company-mappings/` |
| 575 | POST | `/payments/company-mappings/` |
| 583 | PATCH | `/payments/company-mappings/${id}/` |
| 588 | DELETE | `/payments/company-mappings/${id}/` |
| 593 | GET | `/auth/roles/` |
| 598 | GET | `/auth/users/list/` |

### `src/services/authService.ts` — 2 calls

| line | method | url |
|---|---|---|
| 4 | POST | `/auth/login/` |
| 13 | GET | `/auth/profile/` |

### `src/services/deviceAdminService.ts` — 5 calls

| line | method | url |
|---|---|---|
| 165 | GET | `/admin/devices/` |
| 170 | GET | `/admin/devices/${id}/` |
| 175 | GET | `/admin/devices/analytics/` |
| 185 | GET | `/admin/version-policy/` |
| 196 | PUT | `/admin/version-policy/` |

### `src/services/einvoiceService.ts` — 18 calls

| line | method | url |
|---|---|---|
| 105 | GET | `einvoice/health/` |
| 108 | GET | `einvoice/companies/` |
| 109 | POST | `einvoice/token/` |
| 110 | GET | `einvoice/heartbeat/` |
| 121 | GET | `einvoice/irn/from-invoice/${identifier}/` |
| 132 | POST | `einvoice/irn/from-invoice/${identifier}/` |
| 137 | POST | `einvoice/irn/` |
| 139 | POST | `einvoice/irn/validate/` |
| 143 | POST | `einvoice/irn/cancel/` |
| 146 | GET | `einvoice/irn/${irn}/` |
| 148 | GET | `einvoice/irn/by-doc/` |
| 150 | GET | `einvoice/irn/rejected/` |
| 153 | GET | `einvoice/gstin/${gstin}/` |
| 154 | GET | `einvoice/gstin/${gstin}/sync/` |
| 162 | GET | `einvoice/invoices/` |
| 167 | GET | `einvoice/logs/` |
| 169 | POST | `einvoice/logs/retry/` |
| 173 | POST | `einvoice/qr/` |

### `src/services/ewaybillService.ts` — 14 calls

| line | method | url |
|---|---|---|
| 53 | POST | `ewaybill/token/` |
| 63 | GET | `ewaybill/from-invoice/${docentry}/` |
| 74 | POST | `ewaybill/from-invoice/${docentry}/` |
| 79 | POST | `ewaybill/generate/` |
| 83 | POST | `ewaybill/cancel/` |
| 85 | POST | `ewaybill/close/` |
| 87 | POST | `ewaybill/reject/` |
| 89 | POST | `ewaybill/update-part-b/` |
| 91 | POST | `ewaybill/extend-validity/` |
| 93 | POST | `ewaybill/update-transporter/` |
| 96 | GET | `ewaybill/${ewbNo}/` |
| 97 | GET | `einvoice/ewb/${irn}/` |
| 98 | GET | `ewaybill/gstin/${gstin}/` |
| 99 | GET | `ewaybill/transporter/${transId}/` |

### `src/services/haisService.ts` — 8 calls

| line | method | url |
|---|---|---|
| 296 | GET | `/hais/${path}/` |
| 305 | POST | `/hais/${path}/` |
| 326 | GET | `/hais/assets/` |
| 334 | GET | `/hais/assets/${encodeURIComponent(assetId)}/` |
| 340 | GET | `/hais/assets/by-serial/` |
| 349 | POST | `/hais/assets/` |
| 361 | PATCH | `/hais/assets/${encodeURIComponent(assetId)}/` |
| 394 | DELETE | `/hais/assets/${encodeURIComponent(assetId)}/` |

### `src/services/ordersService.ts` — 39 calls

| line | method | url |
|---|---|---|
| 548 | GET | `/orders/parties/` |
| 553 | GET | `/orders/dispatches/` |
| 558 | GET | `/orders/addresses/` |
| 565 | GET | `/orders/party-products/${card_code}/` |
| 570 | GET | `/orders/products/` |
| 575 | GET | `/orders/schemes/` |
| 582 | GET | `/orders/staff-products/` |
| 587 | GET | `/orders/flow-config/` |
| 594 | POST | `/orders/flow-config/` |
| 599 | GET | `/orders/party-flow-config/` |
| 609 | POST | `/orders/party-flow-config/` |
| 618 | DELETE | `/orders/party-flow-config/` |
| 628 | POST | `/orders/staff-products/` |
| 660 | POST | `/orders/create/` |
| 670 | POST | `/orders/create/` |
| 675 | GET | `/orders/mart/list/` |
| 682 | GET | `/orders/mart/${orderId}/` |
| 687 | POST | `/orders/mart/${orderId}/approve/` |
| 692 | POST | `/orders/mart/${orderId}/reject/` |
| 701 | GET | `/orders/sales-order-status/` |
| 710 | POST | `/orders/mart/${orderId}/resend-sap/` |
| 749 | POST | `/orders/create/` |
| 755 | GET | `/orders/ordersbyuser/${userId}/` |
| 763 | DELETE | `/orders/${orderId}/delete-draft/` |
| 778 | GET | `/orders/ordersbyuser/${userId}/` |
| 783 | GET | `/orders/orderdetailsbyid/${orderId}/` |
| 788 | GET | `/orders/${orderId}/orderlogs/` |
| 797 | GET | `/orders/quotation-status/` |
| 805 | POST | `/orders/${orderId}/cancel-quotation/` |
| 811 | GET | `/orders/quotation-overview/` |
| 816 | GET | `/orders/stock-check/` |
| 821 | GET | `/orders/status/` |
| 826 | GET | `/orders/status-tracking/` |
| 833 | GET | `/orders/branch/` |
| 839 | POST | `/orders/${orderId}/update-status/` |
| 852 | POST | `/orders/create-scheme/` |
| 868 | GET | `/orders/schemes/manage/` |
| 887 | PATCH | `/orders/schemes/${schemeId}/` |
| 896 | DELETE | `/orders/schemes/${schemeId}/` |

### `src/services/paymentsDashboardService.ts` — 4 calls

| line | method | url |
|---|---|---|
| 214 | GET | `/payments/dashboard/` |
| 230 | GET | `/payments/dashboard/collection-performance/` |
| 243 | GET | `/payments/dashboard/person/${kind}/${id}/` |
| 258 | GET | `/payments/companies/` |

### `src/services/sapService.ts` — 19 calls

| line | method | url |
|---|---|---|
| 262 | GET | `/sap/products/` |
| 267 | GET | `/sap/product-varieties/` |
| 274 | GET | `/hana/product-stock/` |
| 279 | GET | `/hana/inventory-report/` |
| 292 | GET | `/hana/pending-dispatch/` |
| 304 | GET | `/hana/warehouses/` |
| 313 | GET | `/sap/addresses/` |
| 318 | GET | `/sap/parties/` |
| 323 | GET | `/sap/parties/category/` |
| 330 | GET | `/hana/open-parties/` |
| 342 | GET | `/hana/so/` |
| 349 | GET | `/hana/product-so/` |
| 356 | GET | `/sap/branches/` |
| 361 | GET | `/sap/logs/` |
| 366 | GET | `/sap/quotation-log/${orderId}/` |
| 372 | POST | `/sap/sync/${endpoint}/` |
| 378 | POST | `/auth/assign-parties/` |
| 386 | GET | `/auth/users/${userId}/parties/` |
| 391 | POST | `/auth/remove-party/` |

### `src/services/schemeService.ts` — 10 calls

| line | method | url |
|---|---|---|
| 379 | GET | `/orders/v2/schemes/` |
| 392 | GET | `/orders/v2/schemes/${schemeId}/` |
| 397 | POST | `/orders/v2/schemes/` |
| 402 | PATCH | `/orders/v2/schemes/${schemeId}/` |
| 411 | DELETE | `/orders/v2/schemes/${schemeId}/` |
| 418 | GET | `/orders/v2/schemes/${schemeId}/assignments/` |
| 433 | POST | `/orders/v2/schemes/${schemeId}/assignments/` |
| 438 | DELETE | `/orders/v2/schemes/${schemeId}/assignments/` |
| 446 | POST | `/orders/v2/schemes/preview/` |
| 456 | GET | `/orders/v2/schemes/applicable/` |

### `src/services/trackerService.ts` — 33 calls

| line | method | url |
|---|---|---|
| 297 | GET | `/tracker/lookups/` |
| 302 | GET | `/tracker/vendors/` |
| 311 | GET | `/tracker/invoices/` |
| 316 | GET | `/tracker/invoices/${id}/` |
| 321 | POST | `/tracker/invoices/` |
| 326 | PATCH | `/tracker/invoices/${id}/` |
| 332 | DELETE | `/tracker/invoices/${id}/` |
| 336 | GET | `/tracker/my-queue/` |
| 341 | GET | `/tracker/stage-advanced/` |
| 356 | GET | `/tracker/stage-decisions/` |
| 375 | GET | `/tracker/stage-export/` |
| 384 | GET | `/tracker/invoices/${invoiceId}/jsap/` |
| 394 | POST | `/tracker/jsap/sync/` |
| 407 | POST | `/tracker/actions/bulk/` |
| 412 | PATCH | `/tracker/invoices/${id}/payment/` |
| 418 | GET | `/tracker/admin/stages/` |
| 422 | POST | `/tracker/admin/stages/` |
| 426 | PATCH | `/tracker/admin/stages/${id}/` |
| 430 | DELETE | `/tracker/admin/stages/${id}/` |
| 434 | GET | `/tracker/admin/lookups/${kind}/` |
| 438 | POST | `/tracker/admin/lookups/${kind}/` |
| 442 | PATCH | `/tracker/admin/lookups/${kind}/${id}/` |
| 446 | DELETE | `/tracker/admin/lookups/${kind}/${id}/` |
| 450 | GET | `/tracker/admin/users/` |
| 456 | PUT | `/tracker/admin/users/${userId}/stages/` |
| 461 | GET | `/tracker/admin/tracker-users/` |
| 468 | POST | `/tracker/admin/tracker-users/` |
| 475 | PATCH | `/tracker/admin/tracker-users/${id}/` |
| 479 | DELETE | `/tracker/admin/tracker-users/${id}/` |
| 484 | GET | `/tracker/alerts/` |
| 493 | GET | `/tracker/all-invoices/` |
| 502 | GET | `/tracker/all-invoices/export/` |
| 513 | GET | `/tracker/reports/` |

### `src/services/uiConfig.ts` — 4 calls

| line | method | url |
|---|---|---|
| 306 | GET | `/ui-config/admin/labels/` |
| 311 | POST | `/ui-config/admin/labels/` |
| 319 | PUT | `/ui-config/admin/labels/${id}/` |
| 324 | DELETE | `/ui-config/admin/labels/${id}/` |

### `src/services/userService.ts` — 20 calls

| line | method | url |
|---|---|---|
| 98 | GET | `/auth/users/list/` |
| 103 | GET | `/auth/mainGroup/` |
| 108 | GET | `/auth/states/` |
| 113 | GET | `/auth/roles/` |
| 118 | GET | `/auth/companies/` |
| 123 | GET | `/auth/categories/` |
| 128 | GET | `/auth/users/${userId}/parties/` |
| 141 | POST | `/auth/assign-parties/` |
| 146 | POST | `/auth/assign-parties/bulk-upload/` |
| 156 | POST | `/auth/remove-party/` |
| 161 | GET | `/auth/parties/${card_code}/products/` |
| 168 | POST | `/auth/party-product/remove/` |
| 177 | POST | `/auth/party-product/bulk-add/` |
| 186 | POST | `/auth/party-product/update-rate/` |
| 210 | POST | `/auth/users/create/` |
| 247 | PUT | `/auth/users/${id}/` |
| 252 | GET | `/auth/users/${userId}/page-permissions/` |
| 257 | PUT | `/auth/users/${userId}/page-permissions/` |
| 266 | GET | `/auth/combo-mappings/` |
| 271 | POST | `/auth/combo-mappings/` |

### `src/services/webDeviceService.ts` — 1 calls

| line | method | url |
|---|---|---|
| 313 | POST | `/devices/register/` |

### `src/services/webPushClient.ts` — 3 calls

| line | method | url |
|---|---|---|
| 106 | GET | `/orders/web-push/public-key/` |
| 196 | POST | `/orders/web-push/subscribe/` |
| 213 | DELETE | `/orders/web-push/subscribe/` |


## Page weight

`inline` = `style={{...}}` occurrences. `any` = explicit `any` usage.
`fetch` = direct API calls made from the page rather than a service.

| page | TSX | CSS | inline | any | useState | useEffect | fetch |
|---|---:|---:|---:|---:|---:|---:|---:|
| `Add_Sales.tsx` | 4410 | 2636 | 2 | 6 | 41 | 10 | 0 |
| `Sales_Invoice.tsx` | 1 | 6252 | 0 | 0 | 0 | 0 | 0 |
| `Dashboard.tsx` | 1846 | 1780 | 19 | 0 | 22 | 2 | 4 |
| `Product_Stock.tsx` | 1817 | 1260 | 0 | 0 | 29 | 7 | 0 |
| `InvoiceReview.tsx` | 1692 | 1042 | 0 | 0 | 28 | 2 | 0 |
| `Scheme_Manager.tsx` | 1658 | 953 | 8 | 0 | 32 | 5 | 0 |
| `Payments/ApprovalManagement.tsx` | 2406 | 0 | 7 | 0 | 23 | 0 | 0 |
| `App_User.tsx` | 1246 | 1141 | 8 | 3 | 22 | 4 | 0 |
| `SalesInvoice/index.tsx` | 2099 | 216 | 0 | 0 | 32 | 9 | 0 |
| `SO_Invoice_Report.tsx` | 968 | 821 | 1 | 0 | 11 | 3 | 0 |
| `View_Orders.tsx` | 804 | 959 | 15 | 2 | 21 | 6 | 0 |
| `Nutrition_Manager.tsx` | 789 | 943 | 0 | 0 | 22 | 4 | 12 |
| `Distributor/Order_Tracking.tsx` | 1228 | 494 | 19 | 1 | 13 | 5 | 0 |
| `Label_Checker.tsx` | 780 | 871 | 0 | 0 | 13 | 4 | 0 |
| `Order_Tracking.tsx` | 1055 | 494 | 9 | 0 | 9 | 5 | 0 |
| `Device_Management.tsx` | 946 | 536 | 0 | 0 | 19 | 7 | 0 |
| `Order_Status_Tracking.tsx` | 875 | 598 | 18 | 3 | 17 | 3 | 0 |
| `Auditor_Order.tsx` | 700 | 758 | 15 | 3 | 20 | 3 | 1 |
| `Party_Product_Assignment.tsx` | 1428 | 0 | 85 | 0 | 16 | 5 | 3 |
| `SalesInvoice/useSalesInvoice.ts` | 1320 | 0 | 0 | 2 | 30 | 9 | 0 |
| `Billing_Order.tsx` | 639 | 621 | 14 | 5 | 17 | 3 | 0 |
| `Tracker_Queue.tsx` | 1237 | 0 | 56 | 3 | 26 | 6 | 0 |
| `Order_Flow_Settings.tsx` | 741 | 462 | 0 | 2 | 14 | 4 | 0 |
| `Sales_Report.tsx` | 1125 | 0 | 16 | 2 | 25 | 6 | 0 |
| `Party_Assignment.tsx` | 816 | 186 | 54 | 4 | 13 | 2 | 0 |
| `Add_Scheme.tsx` | 482 | 501 | 0 | 0 | 13 | 4 | 0 |
| `Staff.tsx` | 956 | 0 | 0 | 3 | 15 | 3 | 0 |
| `MartApproval/index.tsx` | 688 | 216 | 8 | 6 | 15 | 2 | 0 |
| `Inventory_Report.tsx` | 501 | 392 | 0 | 0 | 9 | 3 | 0 |
| `SalesInvoice/ContentsTab.tsx` | 883 | 0 | 0 | 0 | 12 | 9 | 0 |
| `Ap_Invoice_Entry.tsx` | 634 | 197 | 0 | 2 | 24 | 2 | 0 |
| `SalesInvoice/SkuGalleryPage.tsx` | 823 | 0 | 1 | 3 | 29 | 4 | 0 |
| `Tracker_Entry.tsx` | 788 | 0 | 25 | 4 | 20 | 2 | 0 |
| `Distributor/index.tsx` | 546 | 216 | 0 | 3 | 10 | 2 | 0 |
| `Daily_Report.tsx` | 738 | 0 | 16 | 1 | 17 | 5 | 0 |
| `Rate_Approver_Order.tsx` | 730 | 0 | 14 | 1 | 16 | 3 | 0 |
| `PersonWise_Report.tsx` | 704 | 0 | 16 | 1 | 19 | 5 | 0 |
| `PartyDirectory.tsx` | 341 | 352 | 0 | 0 | 7 | 3 | 0 |
| `Combo_Mapping.tsx` | 664 | 0 | 45 | 2 | 15 | 2 | 0 |
| `UI_Labels.tsx` | 655 | 0 | 26 | 1 | 17 | 2 | 0 |
| `Payments/AnalyticsTab.tsx` | 648 | 0 | 1 | 0 | 13 | 3 | 0 |
| `Tracker_Admin.tsx` | 587 | 0 | 25 | 12 | 18 | 5 | 0 |
| `Page_Permissions.tsx` | 420 | 146 | 0 | 0 | 10 | 3 | 0 |
| `Status.tsx` | 213 | 329 | 0 | 1 | 7 | 2 | 0 |
| `Login.tsx` | 301 | 201 | 5 | 0 | 6 | 4 | 0 |
| `HAIS/AssetForm.tsx` | 475 | 0 | 3 | 0 | 9 | 2 | 0 |
| `SalesInvoice/OrdersStep.tsx` | 450 | 0 | 0 | 0 | 4 | 3 | 0 |
| `Invoice_Report.tsx` | 187 | 250 | 0 | 0 | 7 | 0 | 0 |
| `SalesInvoice/InteractiveLoader.tsx` | 166 | 271 | 1 | 0 | 4 | 4 | 0 |
| `Einvoice.tsx` | 47 | 388 | 0 | 0 | 2 | 0 | 0 |
| `Staff_Rate_Assignment.tsx` | 412 | 0 | 24 | 0 | 9 | 4 | 0 |
| `SalesInvoice/DraftStep.tsx` | 409 | 0 | 0 | 0 | 5 | 4 | 0 |
| `Payments/ApprovalUI.tsx` | 383 | 0 | 5 | 0 | 4 | 5 | 0 |
| `StateWise_Report.tsx` | 379 | 0 | 5 | 0 | 10 | 5 | 1 |
| `Logs.tsx` | 181 | 196 | 0 | 0 | 5 | 2 | 0 |
| `Products.tsx` | 175 | 200 | 0 | 0 | 5 | 2 | 0 |
| `SalesInvoice/sapErrorTranslator.ts` | 374 | 0 | 0 | 0 | 0 | 0 | 0 |
| `Branches.tsx` | 176 | 183 | 0 | 0 | 5 | 2 | 0 |
| `HAIS/HaisReports.tsx` | 346 | 0 | 14 | 0 | 6 | 2 | 0 |
| `HAIS/index.tsx` | 129 | 216 | 3 | 0 | 3 | 0 | 0 |
| `Addresses.tsx` | 110 | 232 | 0 | 0 | 5 | 2 | 0 |
| `Payments/ConfigTab.tsx` | 342 | 0 | 3 | 0 | 11 | 2 | 0 |
| `Tracker_Invoices.tsx` | 315 | 0 | 32 | 1 | 10 | 2 | 0 |
| `SalesInvoice/useSapPost.ts` | 311 | 0 | 0 | 0 | 0 | 0 | 0 |
| `Payments/CollectionTable.tsx` | 303 | 0 | 1 | 0 | 0 | 0 | 0 |
| `Payments/PersonDetailDialog.tsx` | 262 | 0 | 2 | 0 | 0 | 0 | 0 |
| `Sap_Sync.tsx` | 87 | 174 | 0 | 0 | 2 | 0 | 0 |
| `HAIS/AssetRegister.tsx` | 245 | 0 | 18 | 0 | 9 | 2 | 0 |
| `Parties.tsx` | 85 | 159 | 0 | 0 | 5 | 2 | 0 |
| `Sales_Quotation.tsx` | 244 | 0 | 14 | 0 | 7 | 3 | 0 |
| `SalesInvoice/salesInvoice.utils.ts` | 239 | 0 | 0 | 0 | 0 | 0 | 0 |
| `Tracker_Reports.tsx` | 224 | 0 | 21 | 0 | 5 | 2 | 0 |
| `HAIS/AssetActionModal.tsx` | 211 | 0 | 9 | 0 | 11 | 0 | 0 |
| `einvoice/InvoiceBrowser.tsx` | 198 | 0 | 10 | 0 | 11 | 3 | 0 |
| `einvoice/GenerateIrn.tsx` | 190 | 0 | 7 | 0 | 11 | 2 | 0 |
| `Profile.tsx` | 187 | 0 | 12 | 0 | 2 | 0 | 0 |
| `ewaybill/GenerateEwb.tsx` | 181 | 0 | 7 | 0 | 9 | 0 | 0 |
| `HAIS/AssetLookup.tsx` | 175 | 0 | 5 | 0 | 7 | 0 | 0 |
| `Tracker_Alerts.tsx` | 170 | 0 | 9 | 0 | 4 | 2 | 0 |
| `SalesInvoice/LinesStep.tsx` | 164 | 0 | 0 | 0 | 0 | 0 | 0 |
| `SalesInvoice/SOCard.tsx` | 151 | 0 | 19 | 0 | 2 | 0 | 0 |

**108 pages · 55,944 TSX lines · 27,842 matched CSS lines · 815 inline styles · 77 `any` · 21 API calls made directly from pages.**
