# Page catalogue

The vertical trace for every page: the route that reaches it, its client
guard, the services it uses, the backend endpoints behind those, and the
stylesheet it owns.

**If a page is not in here, the refactor has no record it existed.**

100 page files · 52 reachable by a route · 48 not directly routed.

Endpoints are listed per *service*, so a page shows every endpoint its
services expose, not only the ones it calls. Cross-reference
`OMS-Backend/docs/codebase/API_SURFACE.md` for the auth status of each.


## Routed pages


### `Add_Sales` — 4410 lines + 2636 CSS

- **file**: `src/pages/Add_Sales.tsx`
- **route**: `/Add_Sales`
- **guard**: **none**
- **styles**: `Add_Sales.css`
- **services**: `authService`, `ordersService`, `schemeService`, `uiConfig`, `userService`
- **endpoints reachable** (72):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `DELETE /orders/v2/schemes/${schemeId}/`
  - `DELETE /orders/v2/schemes/${schemeId}/assignments/`
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/profile/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - … +58 more

### `ApprovalManagement` — 2406 lines + 1646 CSS

- **file**: `src/pages/Payments/ApprovalManagement.tsx`
- **route**: `/Payments_Dashboard`
- **guard**: Payments_Dashboard
- **styles**: `Approval_Admin.css`, `Payments_Dashboard.css`, `Payments_Dashboard_Table.css`
- **services**: `approvalService`
- **endpoints reachable** (34):
  - `DELETE /approvals/approvers/${id}/`
  - `DELETE /approvals/levels/${id}/`
  - `DELETE /approvals/workflows/${id}/`
  - `DELETE /payments/admin/collection-persons/${id}/`
  - `DELETE /payments/admin/method-mappings/${id}/`
  - `DELETE /payments/company-mappings/${id}/`
  - `GET /approvals/inbox/`
  - `GET /approvals/levels/`
  - `GET /approvals/levels/${levelId}/approvers/`
  - `GET /approvals/requests/`
  - `GET /approvals/requests/${id}/`
  - `GET /approvals/workflows/`
  - `GET /approvals/workflows/${id}/`
  - `GET /approvals/workflows/${id}/preview/`
  - … +20 more

### `Dashboard` — 1846 lines + 1780 CSS

- **file**: `src/pages/Dashboard.tsx`
- **route**: `/Dashboard`
- **guard**: **none**
- **styles**: `Dashboard.css`
- **services**: `api`, `authService`, `ordersService`, `uiConfig`
- **endpoints reachable** (43):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /auth/profile/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - `GET /orders/branch/`
  - `GET /orders/dispatches/`
  - `GET /orders/flow-config/`
  - `GET /orders/mart/${orderId}/`
  - `GET /orders/mart/list/`
  - `GET /orders/orderdetailsbyid/${orderId}/`
  - `GET /orders/ordersbyuser/${userId}/`
  - … +29 more

### `Product_Stock` — 1817 lines + 1260 CSS

- **file**: `src/pages/Product_Stock.tsx`
- **route**: `/Product_Stock`
- **guard**: **none**
- **styles**: `Product_Stock.css`
- **services**: `sapService`
- **endpoints reachable** (19):
  - `GET /auth/users/${userId}/parties/`
  - `GET /hana/inventory-report/`
  - `GET /hana/open-parties/`
  - `GET /hana/pending-dispatch/`
  - `GET /hana/product-so/`
  - `GET /hana/product-stock/`
  - `GET /hana/so/`
  - `GET /hana/warehouses/`
  - `GET /sap/addresses/`
  - `GET /sap/branches/`
  - `GET /sap/logs/`
  - `GET /sap/parties/`
  - `GET /sap/parties/category/`
  - `GET /sap/product-varieties/`
  - … +5 more

### `InvoiceReview` — 1692 lines + 1042 CSS

- **file**: `src/pages/InvoiceReview.tsx`
- **route**: `/Invoice_Review`
- **guard**: **none**
- **styles**: `InvoiceReview.css`
- **services**: `api`
- **endpoints reachable** (1):
  - `POST ${API_BASE_URL}/auth/refresh/`

### `Scheme_Manager` — 1658 lines + 953 CSS

- **file**: `src/pages/Scheme_Manager.tsx`
- **route**: `/Scheme_Manager`
- **guard**: **none**
- **styles**: `Scheme_Manager.css`
- **services**: `sapService`, `schemeService`, `userService`
- **endpoints reachable** (46):
  - `DELETE /orders/v2/schemes/${schemeId}/`
  - `DELETE /orders/v2/schemes/${schemeId}/assignments/`
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - `GET /auth/users/${userId}/page-permissions/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /auth/users/list/`
  - `GET /hana/inventory-report/`
  - `GET /hana/open-parties/`
  - … +32 more

### `Party_Product_Assignment` — 1428 lines

- **file**: `src/pages/Party_Product_Assignment.tsx`
- **route**: `/Party_Product_Assignment`
- **guard**: **none**
- **services**: `api`, `ordersService`, `sapService`, `userService`
- **endpoints reachable** (73):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - `GET /auth/users/${userId}/page-permissions/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /auth/users/list/`
  - `GET /hana/inventory-report/`
  - … +59 more

### `App_User` — 1246 lines + 1141 CSS

- **file**: `src/pages/App_User.tsx`
- **route**: `/App_User`
- **guard**: **none**
- **styles**: `App_User.css`
- **services**: `sapService`, `userService`
- **endpoints reachable** (36):
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - `GET /auth/users/${userId}/page-permissions/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /auth/users/list/`
  - `GET /hana/inventory-report/`
  - `GET /hana/open-parties/`
  - `GET /hana/pending-dispatch/`
  - `GET /hana/product-so/`
  - … +22 more

### `Tracker_Queue` — 1237 lines + 363 CSS

- **file**: `src/pages/Tracker_Queue.tsx`
- **route**: `/Tracker_Queue`
- **guard**: **none**
- **styles**: `Tracker.css`
- **services**: `trackerService`
- **endpoints reachable** (33):
  - `DELETE /tracker/admin/lookups/${kind}/${id}/`
  - `DELETE /tracker/admin/stages/${id}/`
  - `DELETE /tracker/admin/tracker-users/${id}/`
  - `DELETE /tracker/invoices/${id}/`
  - `GET /tracker/admin/lookups/${kind}/`
  - `GET /tracker/admin/stages/`
  - `GET /tracker/admin/tracker-users/`
  - `GET /tracker/admin/users/`
  - `GET /tracker/alerts/`
  - `GET /tracker/all-invoices/`
  - `GET /tracker/all-invoices/export/`
  - `GET /tracker/invoices/`
  - `GET /tracker/invoices/${id}/`
  - `GET /tracker/invoices/${invoiceId}/jsap/`
  - … +19 more

### `Order_Tracking` — 1228 lines + 494 CSS

- **file**: `src/pages/Distributor/Order_Tracking.tsx`
- **route**: `/Distributor_Order_Tracking`
- **guard**: **none**
- **styles**: `Order_Tracking.css`
- **services**: `ordersService`
- **endpoints reachable** (36):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - `GET /orders/branch/`
  - `GET /orders/dispatches/`
  - `GET /orders/flow-config/`
  - `GET /orders/mart/${orderId}/`
  - `GET /orders/mart/list/`
  - `GET /orders/orderdetailsbyid/${orderId}/`
  - `GET /orders/ordersbyuser/${userId}/`
  - `GET /orders/parties/`
  - `GET /orders/party-flow-config/`
  - … +22 more

### `Sales_Report` — 1125 lines + 1059 CSS

- **file**: `src/pages/Sales_Report.tsx`
- **route**: `/Sales_Report`
- **guard**: **none**
- **styles**: `Report.css`
- **services**: `ordersService`, `sapService`, `uiConfig`, `userService`
- **endpoints reachable** (76):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - `GET /auth/users/${userId}/page-permissions/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /auth/users/list/`
  - … +62 more

### `Order_Tracking` — 1055 lines + 494 CSS

- **file**: `src/pages/Order_Tracking.tsx`
- **route**: `/Order_Tracking`
- **guard**: **none**
- **styles**: `Order_Tracking.css`
- **services**: `ordersService`
- **endpoints reachable** (36):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - `GET /orders/branch/`
  - `GET /orders/dispatches/`
  - `GET /orders/flow-config/`
  - `GET /orders/mart/${orderId}/`
  - `GET /orders/mart/list/`
  - `GET /orders/orderdetailsbyid/${orderId}/`
  - `GET /orders/ordersbyuser/${userId}/`
  - `GET /orders/parties/`
  - `GET /orders/party-flow-config/`
  - … +22 more

### `SO_Invoice_Report` — 968 lines + 821 CSS

- **file**: `src/pages/SO_Invoice_Report.tsx`
- **route**: `/SO_Invoice_Report`
- **guard**: **none**
- **styles**: `SO_Invoice_Report.css`
- **services**: `sapService`
- **endpoints reachable** (19):
  - `GET /auth/users/${userId}/parties/`
  - `GET /hana/inventory-report/`
  - `GET /hana/open-parties/`
  - `GET /hana/pending-dispatch/`
  - `GET /hana/product-so/`
  - `GET /hana/product-stock/`
  - `GET /hana/so/`
  - `GET /hana/warehouses/`
  - `GET /sap/addresses/`
  - `GET /sap/branches/`
  - `GET /sap/logs/`
  - `GET /sap/parties/`
  - `GET /sap/parties/category/`
  - `GET /sap/product-varieties/`
  - … +5 more

### `Staff` — 956 lines + 2636 CSS

- **file**: `src/pages/Staff.tsx`
- **route**: `/Staff`
- **guard**: **none**
- **styles**: `Add_Sales.css`
- **services**: `ordersService`, `uiConfig`, `userService`
- **endpoints reachable** (60):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - `GET /auth/users/${userId}/page-permissions/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /auth/users/list/`
  - … +46 more

### `Device_Management` — 946 lines + 536 CSS

- **file**: `src/pages/Device_Management.tsx`
- **route**: `/Device_Management`
- **guard**: **none**
- **styles**: `Device_Management.css`
- **services**: `deviceAdminService`
- **endpoints reachable** (5):
  - `GET /admin/devices/`
  - `GET /admin/devices/${id}/`
  - `GET /admin/devices/analytics/`
  - `GET /admin/version-policy/`
  - `PUT /admin/version-policy/`

### `Order_Status_Tracking` — 875 lines + 1356 CSS

- **file**: `src/pages/Order_Status_Tracking.tsx`
- **route**: `/Auditor_status_tracking`, `/Billing_status_tracking`, `/Rate_Approver_status_tracking`
- **guard**: **none**
- **styles**: `Auditor_Order.css`, `Order_Status_Tracking.css`
- **services**: `ordersService`, `sapService`, `uiConfig`
- **endpoints reachable** (59):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /hana/inventory-report/`
  - `GET /hana/open-parties/`
  - `GET /hana/pending-dispatch/`
  - `GET /hana/product-so/`
  - `GET /hana/product-stock/`
  - `GET /hana/so/`
  - `GET /hana/warehouses/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - … +45 more

### `SkuGalleryPage` — 823 lines + 6252 CSS

- **file**: `src/pages/SalesInvoice/SkuGalleryPage.tsx`
- **route**: `/Sales_Invoice/SKU_Images`
- **guard**: **none**
- **styles**: `Sales_Invoice.css`
- **services**: `api`
- **endpoints reachable** (1):
  - `POST ${API_BASE_URL}/auth/refresh/`

### `Party_Assignment` — 816 lines + 186 CSS

- **file**: `src/pages/Party_Assignment.tsx`
- **route**: `/Party_Assignment`
- **guard**: **none**
- **styles**: `Party_Assignment.css`
- **services**: `sapService`, `userService`
- **endpoints reachable** (36):
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - `GET /auth/users/${userId}/page-permissions/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /auth/users/list/`
  - `GET /hana/inventory-report/`
  - `GET /hana/open-parties/`
  - `GET /hana/pending-dispatch/`
  - `GET /hana/product-so/`
  - … +22 more

### `View_Orders` — 804 lines + 1717 CSS

- **file**: `src/pages/View_Orders.tsx`
- **route**: `/View_Orders`
- **guard**: **none**
- **styles**: `Auditor_Order.css`, `View_Orders.css`
- **services**: `ordersService`, `uiConfig`
- **endpoints reachable** (40):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - `GET /orders/branch/`
  - `GET /orders/dispatches/`
  - `GET /orders/flow-config/`
  - `GET /orders/mart/${orderId}/`
  - `GET /orders/mart/list/`
  - `GET /orders/orderdetailsbyid/${orderId}/`
  - `GET /orders/ordersbyuser/${userId}/`
  - `GET /orders/parties/`
  - … +26 more

### `Nutrition_Manager` — 789 lines + 943 CSS

- **file**: `src/pages/Nutrition_Manager.tsx`
- **route**: `/Nutrition_Manager`
- **guard**: Payments_Dashboard
- **styles**: `Nutrition_Manager.css`
- **services**: `api`
- **endpoints reachable** (1):
  - `POST ${API_BASE_URL}/auth/refresh/`

### `Tracker_Entry` — 788 lines + 363 CSS

- **file**: `src/pages/Tracker_Entry.tsx`
- **route**: `/Tracker_Entry`
- **guard**: **none**
- **styles**: `Tracker.css`
- **services**: `trackerService`
- **endpoints reachable** (33):
  - `DELETE /tracker/admin/lookups/${kind}/${id}/`
  - `DELETE /tracker/admin/stages/${id}/`
  - `DELETE /tracker/admin/tracker-users/${id}/`
  - `DELETE /tracker/invoices/${id}/`
  - `GET /tracker/admin/lookups/${kind}/`
  - `GET /tracker/admin/stages/`
  - `GET /tracker/admin/tracker-users/`
  - `GET /tracker/admin/users/`
  - `GET /tracker/alerts/`
  - `GET /tracker/all-invoices/`
  - `GET /tracker/all-invoices/export/`
  - `GET /tracker/invoices/`
  - `GET /tracker/invoices/${id}/`
  - `GET /tracker/invoices/${invoiceId}/jsap/`
  - … +19 more

### `Label_Checker` — 780 lines + 871 CSS

- **file**: `src/pages/Label_Checker.tsx`
- **route**: `/Label_Checker`
- **guard**: Payments_Dashboard
- **styles**: `Label_Checker.css`

### `Order_Flow_Settings` — 741 lines + 785 CSS

- **file**: `src/pages/Order_Flow_Settings.tsx`
- **route**: `/Order_Flow_Settings`
- **guard**: **none**
- **styles**: `Order_Flow_Settings.css`, `Order_Flow_Settings_Parties.css`
- **services**: `ordersService`, `sapService`
- **endpoints reachable** (55):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /hana/inventory-report/`
  - `GET /hana/open-parties/`
  - `GET /hana/pending-dispatch/`
  - `GET /hana/product-so/`
  - `GET /hana/product-stock/`
  - `GET /hana/so/`
  - `GET /hana/warehouses/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - `GET /orders/branch/`
  - … +41 more

### `Daily_Report` — 738 lines + 1059 CSS

- **file**: `src/pages/Daily_Report.tsx`
- **route**: `/Daily_Report`
- **guard**: **none**
- **styles**: `Report.css`
- **services**: `ordersService`, `uiConfig`, `userService`
- **endpoints reachable** (60):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - `GET /auth/users/${userId}/page-permissions/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /auth/users/list/`
  - … +46 more

### `Rate_Approver_Order` — 730 lines + 758 CSS

- **file**: `src/pages/Rate_Approver_Order.tsx`
- **route**: `/Rate_Approver_orders`
- **guard**: **none**
- **styles**: `Auditor_Order.css`
- **services**: `ordersService`, `uiConfig`
- **endpoints reachable** (40):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - `GET /orders/branch/`
  - `GET /orders/dispatches/`
  - `GET /orders/flow-config/`
  - `GET /orders/mart/${orderId}/`
  - `GET /orders/mart/list/`
  - `GET /orders/orderdetailsbyid/${orderId}/`
  - `GET /orders/ordersbyuser/${userId}/`
  - `GET /orders/parties/`
  - … +26 more

### `PersonWise_Report` — 704 lines + 1059 CSS

- **file**: `src/pages/PersonWise_Report.tsx`
- **route**: `/PersonWise_Report`
- **guard**: **none**
- **styles**: `Report.css`
- **services**: `ordersService`, `uiConfig`, `userService`
- **endpoints reachable** (60):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - `GET /auth/users/${userId}/page-permissions/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /auth/users/list/`
  - … +46 more

### `Auditor_Order` — 700 lines + 758 CSS

- **file**: `src/pages/Auditor_Order.tsx`
- **route**: `/Auditor_orders`
- **guard**: **none**
- **styles**: `Auditor_Order.css`
- **services**: `api`, `ordersService`, `uiConfig`
- **endpoints reachable** (41):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - `GET /orders/branch/`
  - `GET /orders/dispatches/`
  - `GET /orders/flow-config/`
  - `GET /orders/mart/${orderId}/`
  - `GET /orders/mart/list/`
  - `GET /orders/orderdetailsbyid/${orderId}/`
  - `GET /orders/ordersbyuser/${userId}/`
  - `GET /orders/parties/`
  - … +27 more

### `Combo_Mapping` — 664 lines

- **file**: `src/pages/Combo_Mapping.tsx`
- **route**: `/Combo_Mapping`
- **guard**: **none**
- **services**: `sapService`, `userService`
- **endpoints reachable** (36):
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - `GET /auth/users/${userId}/page-permissions/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /auth/users/list/`
  - `GET /hana/inventory-report/`
  - `GET /hana/open-parties/`
  - `GET /hana/pending-dispatch/`
  - `GET /hana/product-so/`
  - … +22 more

### `UI_Labels` — 655 lines + 1141 CSS

- **file**: `src/pages/UI_Labels.tsx`
- **route**: `/UI_Labels`
- **guard**: Payments_Dashboard
- **styles**: `App_User.css`
- **services**: `uiConfig`
- **endpoints reachable** (4):
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /ui-config/admin/labels/`
  - `POST /ui-config/admin/labels/`
  - `PUT /ui-config/admin/labels/${id}/`

### `Billing_Order` — 639 lines + 621 CSS

- **file**: `src/pages/Billing_Order.tsx`
- **route**: `/Billing_orders`
- **guard**: **none**
- **styles**: `Billing_Order.css`
- **services**: `ordersService`, `uiConfig`
- **endpoints reachable** (40):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - `GET /orders/branch/`
  - `GET /orders/dispatches/`
  - `GET /orders/flow-config/`
  - `GET /orders/mart/${orderId}/`
  - `GET /orders/mart/list/`
  - `GET /orders/orderdetailsbyid/${orderId}/`
  - `GET /orders/ordersbyuser/${userId}/`
  - `GET /orders/parties/`
  - … +26 more

### `Ap_Invoice_Entry` — 634 lines + 197 CSS

- **file**: `src/pages/Ap_Invoice_Entry.tsx`
- **route**: `/Approval_Management`, `/Ap_Invoice_Entry`
- **guard**: **none**
- **styles**: `Ap_Invoice_Entry.css`
- **services**: `apInvoiceService`
- **endpoints reachable** (4):
  - `GET /service-layer/ap/grpo/`
  - `GET /service-layer/ap/open-grpos/`
  - `GET /service-layer/ap/vendor-tds/`
  - `POST /service-layer/ap/invoice/`

### `Tracker_Admin` — 587 lines + 363 CSS

- **file**: `src/pages/Tracker_Admin.tsx`
- **route**: `/Tracker_Admin`
- **guard**: **none**
- **styles**: `Tracker.css`
- **services**: `trackerService`
- **endpoints reachable** (33):
  - `DELETE /tracker/admin/lookups/${kind}/${id}/`
  - `DELETE /tracker/admin/stages/${id}/`
  - `DELETE /tracker/admin/tracker-users/${id}/`
  - `DELETE /tracker/invoices/${id}/`
  - `GET /tracker/admin/lookups/${kind}/`
  - `GET /tracker/admin/stages/`
  - `GET /tracker/admin/tracker-users/`
  - `GET /tracker/admin/users/`
  - `GET /tracker/alerts/`
  - `GET /tracker/all-invoices/`
  - `GET /tracker/all-invoices/export/`
  - `GET /tracker/invoices/`
  - `GET /tracker/invoices/${id}/`
  - `GET /tracker/invoices/${invoiceId}/jsap/`
  - … +19 more

### `Inventory_Report` — 501 lines + 392 CSS

- **file**: `src/pages/Inventory_Report.tsx`
- **route**: `/Inventory_Report`
- **guard**: **none**
- **styles**: `Inventory_Report.css`
- **services**: `sapService`
- **endpoints reachable** (19):
  - `GET /auth/users/${userId}/parties/`
  - `GET /hana/inventory-report/`
  - `GET /hana/open-parties/`
  - `GET /hana/pending-dispatch/`
  - `GET /hana/product-so/`
  - `GET /hana/product-stock/`
  - `GET /hana/so/`
  - `GET /hana/warehouses/`
  - `GET /sap/addresses/`
  - `GET /sap/branches/`
  - `GET /sap/logs/`
  - `GET /sap/parties/`
  - `GET /sap/parties/category/`
  - `GET /sap/product-varieties/`
  - … +5 more

### `Add_Scheme` — 482 lines + 501 CSS

- **file**: `src/pages/Add_Scheme.tsx`
- **route**: `/Add_Scheme`
- **guard**: **none**
- **styles**: `Add_Scheme.css`
- **services**: `ordersService`, `userService`
- **endpoints reachable** (56):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - `GET /auth/users/${userId}/page-permissions/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /auth/users/list/`
  - `GET /orders/${orderId}/orderlogs/`
  - … +42 more

### `Page_Permissions` — 420 lines + 608 CSS

- **file**: `src/pages/Page_Permissions.tsx`
- **route**: `/Page_Permissions`
- **guard**: **none**
- **styles**: `Order_Flow_Settings.css`, `Page_Permissions.css`
- **services**: `userService`
- **endpoints reachable** (20):
  - `GET /auth/categories/`
  - `GET /auth/combo-mappings/`
  - `GET /auth/companies/`
  - `GET /auth/mainGroup/`
  - `GET /auth/parties/${card_code}/products/`
  - `GET /auth/roles/`
  - `GET /auth/states/`
  - `GET /auth/users/${userId}/page-permissions/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /auth/users/list/`
  - `POST /auth/assign-parties/`
  - `POST /auth/assign-parties/bulk-upload/`
  - `POST /auth/combo-mappings/`
  - `POST /auth/party-product/bulk-add/`
  - … +6 more

### `Staff_Rate_Assignment` — 412 lines

- **file**: `src/pages/Staff_Rate_Assignment.tsx`
- **route**: `/Staff_Rate_Assignment`
- **guard**: **none**
- **services**: `ordersService`, `sapService`
- **endpoints reachable** (55):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `GET /auth/users/${userId}/parties/`
  - `GET /hana/inventory-report/`
  - `GET /hana/open-parties/`
  - `GET /hana/pending-dispatch/`
  - `GET /hana/product-so/`
  - `GET /hana/product-stock/`
  - `GET /hana/so/`
  - `GET /hana/warehouses/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - `GET /orders/branch/`
  - … +41 more

### `StateWise_Report` — 379 lines + 1059 CSS

- **file**: `src/pages/StateWise_Report.tsx`
- **route**: `/StateWise_Report`
- **guard**: **none**
- **styles**: `Report.css`
- **services**: `api`
- **endpoints reachable** (1):
  - `POST ${API_BASE_URL}/auth/refresh/`

### `Tracker_Invoices` — 315 lines + 363 CSS

- **file**: `src/pages/Tracker_Invoices.tsx`
- **route**: `/Tracker_Invoices`
- **guard**: **none**
- **styles**: `Tracker.css`
- **services**: `trackerService`
- **endpoints reachable** (33):
  - `DELETE /tracker/admin/lookups/${kind}/${id}/`
  - `DELETE /tracker/admin/stages/${id}/`
  - `DELETE /tracker/admin/tracker-users/${id}/`
  - `DELETE /tracker/invoices/${id}/`
  - `GET /tracker/admin/lookups/${kind}/`
  - `GET /tracker/admin/stages/`
  - `GET /tracker/admin/tracker-users/`
  - `GET /tracker/admin/users/`
  - `GET /tracker/alerts/`
  - `GET /tracker/all-invoices/`
  - `GET /tracker/all-invoices/export/`
  - `GET /tracker/invoices/`
  - `GET /tracker/invoices/${id}/`
  - `GET /tracker/invoices/${invoiceId}/jsap/`
  - … +19 more

### `Login` — 301 lines + 201 CSS

- **file**: `src/pages/Login.tsx`
- **route**: `/`
- **guard**: **none**
- **styles**: `Login.css`
- **services**: `api`, `authService`, `uiConfig`, `webDeviceService`
- **endpoints reachable** (8):
  - `DELETE /ui-config/admin/labels/${id}/`
  - `GET /auth/profile/`
  - `GET /ui-config/admin/labels/`
  - `POST ${API_BASE_URL}/auth/refresh/`
  - `POST /auth/login/`
  - `POST /devices/register/`
  - `POST /ui-config/admin/labels/`
  - `PUT /ui-config/admin/labels/${id}/`

### `Sales_Quotation` — 244 lines

- **file**: `src/pages/Sales_Quotation.tsx`
- **route**: `/Sales_Quotation`
- **guard**: **none**
- **services**: `ordersService`
- **endpoints reachable** (36):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - `GET /orders/branch/`
  - `GET /orders/dispatches/`
  - `GET /orders/flow-config/`
  - `GET /orders/mart/${orderId}/`
  - `GET /orders/mart/list/`
  - `GET /orders/orderdetailsbyid/${orderId}/`
  - `GET /orders/ordersbyuser/${userId}/`
  - `GET /orders/parties/`
  - `GET /orders/party-flow-config/`
  - … +22 more

### `Tracker_Reports` — 224 lines + 363 CSS

- **file**: `src/pages/Tracker_Reports.tsx`
- **route**: `/Tracker_Reports`
- **guard**: **none**
- **styles**: `Tracker.css`
- **services**: `trackerService`
- **endpoints reachable** (33):
  - `DELETE /tracker/admin/lookups/${kind}/${id}/`
  - `DELETE /tracker/admin/stages/${id}/`
  - `DELETE /tracker/admin/tracker-users/${id}/`
  - `DELETE /tracker/invoices/${id}/`
  - `GET /tracker/admin/lookups/${kind}/`
  - `GET /tracker/admin/stages/`
  - `GET /tracker/admin/tracker-users/`
  - `GET /tracker/admin/users/`
  - `GET /tracker/alerts/`
  - `GET /tracker/all-invoices/`
  - `GET /tracker/all-invoices/export/`
  - `GET /tracker/invoices/`
  - `GET /tracker/invoices/${id}/`
  - `GET /tracker/invoices/${invoiceId}/jsap/`
  - … +19 more

### `Invoice_Report` — 187 lines + 250 CSS

- **file**: `src/pages/Invoice_Report.tsx`
- **route**: `/Invoice_Report`
- **guard**: **none**
- **styles**: `Invoice_Report.css`
- **services**: `api`
- **endpoints reachable** (1):
  - `POST ${API_BASE_URL}/auth/refresh/`

### `Profile` — 187 lines

- **file**: `src/pages/Profile.tsx`
- **route**: `/Profile`
- **guard**: **none**
- **services**: `webDeviceService`
- **endpoints reachable** (1):
  - `POST /devices/register/`

### `Tracker_Alerts` — 170 lines + 363 CSS

- **file**: `src/pages/Tracker_Alerts.tsx`
- **route**: `/Tracker_Alerts`
- **guard**: **none**
- **styles**: `Tracker.css`
- **services**: `trackerService`
- **endpoints reachable** (33):
  - `DELETE /tracker/admin/lookups/${kind}/${id}/`
  - `DELETE /tracker/admin/stages/${id}/`
  - `DELETE /tracker/admin/tracker-users/${id}/`
  - `DELETE /tracker/invoices/${id}/`
  - `GET /tracker/admin/lookups/${kind}/`
  - `GET /tracker/admin/stages/`
  - `GET /tracker/admin/tracker-users/`
  - `GET /tracker/admin/users/`
  - `GET /tracker/alerts/`
  - `GET /tracker/all-invoices/`
  - `GET /tracker/all-invoices/export/`
  - `GET /tracker/invoices/`
  - `GET /tracker/invoices/${id}/`
  - `GET /tracker/invoices/${invoiceId}/jsap/`
  - … +19 more

### `Drafts` — 129 lines

- **file**: `src/pages/Drafts.tsx`
- **route**: `/Drafts`
- **guard**: **none**
- **services**: `authService`, `ordersService`
- **endpoints reachable** (38):
  - `DELETE /orders/${orderId}/delete-draft/`
  - `DELETE /orders/party-flow-config/`
  - `DELETE /orders/schemes/${schemeId}/`
  - `GET /auth/profile/`
  - `GET /orders/${orderId}/orderlogs/`
  - `GET /orders/addresses/`
  - `GET /orders/branch/`
  - `GET /orders/dispatches/`
  - `GET /orders/flow-config/`
  - `GET /orders/mart/${orderId}/`
  - `GET /orders/mart/list/`
  - `GET /orders/orderdetailsbyid/${orderId}/`
  - `GET /orders/ordersbyuser/${userId}/`
  - `GET /orders/parties/`
  - … +24 more

### `AssetPublicView` — 106 lines + 789 CSS

- **file**: `src/pages/HAIS/AssetPublicView.tsx`
- **route**: `/hais/device/:code`
- **guard**: **none**
- **styles**: `Einvoice.css`, `HAIS.css`
- **services**: `haisService`
- **endpoints reachable** (8):
  - `DELETE /hais/assets/${encodeURIComponent(assetId)}/`
  - `GET /hais/${path}/`
  - `GET /hais/assets/`
  - `GET /hais/assets/${encodeURIComponent(assetId)}/`
  - `GET /hais/assets/by-serial/`
  - `PATCH /hais/assets/${encodeURIComponent(assetId)}/`
  - `POST /hais/${path}/`
  - `POST /hais/assets/`

### `Sap_Sync` — 87 lines + 174 CSS

- **file**: `src/pages/Sap_Sync.tsx`
- **route**: `/Sap_Sync`
- **guard**: **none**
- **styles**: `Sap_Sync.css`

### `Einvoice` — 47 lines + 850 CSS

- **file**: `src/pages/Einvoice.tsx`
- **route**: `*`, `/Einvoice`
- **guard**: **none**
- **styles**: `Einvoice.css`, `Order_Flow_Settings.css`

### `Ewaybill` — 39 lines + 850 CSS

- **file**: `src/pages/Ewaybill.tsx`
- **route**: `/Ewaybill`
- **guard**: **none**
- **styles**: `Einvoice.css`, `Order_Flow_Settings.css`

### `FOC` — 5 lines

- **file**: `src/pages/FOC.tsx`
- **route**: `/FOC`
- **guard**: **none**

### `Order_Stock_Check` — 5 lines

- **file**: `src/pages/Order_Stock_Check.tsx`
- **route**: `/Order_Stock_Check`
- **guard**: **none**

### `Sales_Invoice` — 1 lines

- **file**: `src/pages/Sales_Invoice.tsx`
- **route**: `/Sales_Invoice`
- **guard**: **none**


## Not directly routed

Sub-components, tabs, modals and shared page pieces — plus anything
genuinely dead. Worth auditing: a page here with no importer is dead code.

| file | lines | services |
|---|---:|---|
| `SalesInvoice/index.tsx` | 2099 | — |
| `SalesInvoice/ContentsTab.tsx` | 883 | `api` |
| `MartApproval/index.tsx` | 688 | `ordersService` |
| `Payments/AnalyticsTab.tsx` | 648 | `paymentsDashboardService` |
| `Distributor/index.tsx` | 546 | `ordersService`, `userService` |
| `HAIS/AssetForm.tsx` | 475 | `haisService` |
| `SalesInvoice/OrdersStep.tsx` | 450 | — |
| `SalesInvoice/DraftStep.tsx` | 409 | — |
| `Payments/ApprovalUI.tsx` | 383 | `approvalService` |
| `HAIS/HaisReports.tsx` | 346 | `haisService` |
| `Payments/ConfigTab.tsx` | 342 | `approvalService` |
| `PartyDirectory.tsx` | 341 | `sapService` |
| `Payments/CollectionTable.tsx` | 303 | `paymentsDashboardService` |
| `Payments/PersonDetailDialog.tsx` | 262 | `paymentsDashboardService` |
| `HAIS/AssetRegister.tsx` | 245 | `haisService` |
| `Status.tsx` | 213 | `sapService` |
| `HAIS/AssetActionModal.tsx` | 211 | `haisService` |
| `einvoice/InvoiceBrowser.tsx` | 198 | `einvoiceService` |
| `einvoice/GenerateIrn.tsx` | 190 | `einvoiceService` |
| `Logs.tsx` | 181 | `sapService` |
| `ewaybill/GenerateEwb.tsx` | 181 | `ewaybillService` |
| `Branches.tsx` | 176 | `sapService` |
| `HAIS/AssetLookup.tsx` | 175 | `haisService` |
| `Products.tsx` | 175 | `sapService` |
| `SalesInvoice/InteractiveLoader.tsx` | 166 | — |
| `SalesInvoice/LinesStep.tsx` | 164 | — |
| `SalesInvoice/SOCard.tsx` | 151 | — |
| `einvoice/GenLogs.tsx` | 149 | `einvoiceService` |
| `HAIS/AssetDetails.tsx` | 148 | `haisService` |
| `Distributor/SearchableSelect.tsx` | 134 | — |
| `ewaybill/ManageEwb.tsx` | 130 | `ewaybillService` |
| `HAIS/index.tsx` | 129 | `haisService` |
| `HAIS/OptionManager.tsx` | 128 | `haisService` |
| `einvoice/CancelIrn.tsx` | 118 | `einvoiceService` |
| `HAIS/AssetHistory.tsx` | 113 | `haisService` |
| `Addresses.tsx` | 110 | `sapService` |
| `einvoice/IrnLookup.tsx` | 108 | `einvoiceService` |
| `Payments/DonutChart.tsx` | 102 | `paymentsDashboardService` |
| `einvoice/EinvTools.tsx` | 96 | `einvoiceService` |
| `HAIS/QrScanner.tsx` | 92 | — |
| `Parties.tsx` | 85 | `sapService` |
| `einvoice/IrnQr.tsx` | 83 | `einvoiceService` |
| `ewaybill/EwbLookup.tsx` | 75 | `ewaybillService` |
| `HAIS/AssetQr.tsx` | 64 | `api`, `haisService` |
| `SalesInvoice/InvoiceDraftPanel.tsx` | 63 | — |
| `SalesInvoice/PartyStep.tsx` | 62 | — |
| `SalesInvoice/LogisticsTab.tsx` | 49 | — |
| `HAIS/ErrorPopup.tsx` | 27 | — |

---

**100 pages · 53,392 lines · 48 routed pages with no client guard.**
