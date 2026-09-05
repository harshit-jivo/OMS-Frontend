import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import PageLoading from "./components/PageLoading";

/*
 * Every page below is loaded on demand — Phase 5.1 of the frontend plan.
 *
 * They were all statically imported, which meant one chunk containing all 108
 * pages: 2.71 MB (730 kB gzipped) downloaded before the LOGIN screen could
 * render. A user signing in to check a report was paying for the Excel writer,
 * the QR scanner and the charting library first.
 *
 * `Login` is the deliberate exception. It is what an anonymous visitor sees,
 * so splitting it would add a round trip in front of the only thing they can
 * do — the opposite of the point.
 *
 * These are plain `lazy(() => import(...))` calls rather than a clever
 * registry, because Vite needs a STATIC, literal import specifier to know what
 * to split; a computed path silently produces one chunk again, or fails at
 * runtime with no build error.
 */
import Login from "./pages/Login";
import ProtectedPage from "./components/ProtectedPage";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const App_User = lazy(() => import("./pages/App_User"));
const Sap_sync = lazy(() => import("./pages/Sap_Sync"));
const Add_Sales = lazy(() => import("./pages/Add_Sales"));
const Drafts = lazy(() => import("./pages/Drafts"));
const View_Orders = lazy(() => import("./pages/View_Orders"));
const Auditor_orders = lazy(() => import("./pages/Auditor_Order"));
const Billing_orders = lazy(() => import("./pages/Billing_Order"));
const RateApproverOrders = lazy(() => import("./pages/Rate_Approver_Order"));
const Order_Status_Tracking = lazy(() => import("./pages/Order_Status_Tracking"));
const Daily_Report = lazy(() => import("./pages/Daily_Report"));
const PersonWise_Report = lazy(() => import("./pages/PersonWise_Report"));
const Sales_Report = lazy(() => import("./pages/Sales_Report"));
const StateWise_Report = lazy(() => import("./pages/StateWise_Report"));
const Order_Tracking = lazy(() => import("./pages/Order_Tracking"));
import "./styles/AppShell.css";
import "./styles/UIConsistency.css";
const Party_Assignment = lazy(() => import("./pages/Party_Assignment"));
const Party_Product_Assignment = lazy(() => import("./pages/Party_Product_Assignment"));
const Add_Scheme = lazy(() => import("./pages/Add_Scheme"));
const Scheme_Manager = lazy(() => import("./pages/Scheme_Manager"));
const Combo_Mapping = lazy(() => import("./pages/Combo_Mapping"));
const FOC = lazy(() => import("./pages/FOC"));
/*
 * Sales_Invoice was the ONE page Phase 5.1 missed — it stayed a static
 * import while its 100 neighbours became lazy(), so the whole invoicing
 * screen (index + useSalesInvoice + ContentsTab + DraftStep + OrdersStep,
 * ~173 kB before minification) shipped inside the entry chunk and was
 * downloaded before the LOGIN form could paint. Nothing about it needs to
 * be eager: it is a routed page like every other one below.
 */
const SalesInvoice = lazy(() => import("./pages/Sales_Invoice"));
const SkuGalleryPage = lazy(() => import("./pages/SalesInvoice/SkuGalleryPage"));
const InvoiceReview = lazy(() => import("./pages/InvoiceReview"));
const Staff = lazy(() => import("./pages/Staff"));
const Staff_Rate_Assignment = lazy(() => import("./pages/Staff_Rate_Assignment"));
const Order_Stock_Check = lazy(() => import("./pages/Order_Stock_Check"));
const Product_Stock = lazy(() => import("./pages/Product_Stock"));
const Order_Flow_Settings = lazy(() => import("./pages/Order_Flow_Settings"));
const Page_Permissions = lazy(() => import("./pages/Page_Permissions"));
const Role_Permissions = lazy(() => import("./pages/Role_Permissions"));
const UI_Labels = lazy(() => import("./pages/UI_Labels"));
const PaymentsDashboard = lazy(() => import("./pages/Payments/ApprovalManagement"));
// import Sales_Quotation from "./pages/Sales_Quotation";  // DISABLED 2026-08-27 — quotation flow closed
const LabelChecker = lazy(() => import("./pages/Label_Checker"));
const NutritionManager = lazy(() => import("./pages/Nutrition_Manager"));
const ComplianceRules = lazy(() => import("./pages/Compliance_Rules"));
const LabelHistory = lazy(() => import("./pages/Label_History"));
const Einvoice = lazy(() => import("./pages/Einvoice"));
const Ewaybill = lazy(() => import("./pages/Ewaybill"));
const Tracker_Entry = lazy(() => import("./pages/Tracker_Entry"));
const Tracker_Queue = lazy(() => import("./pages/Tracker_Queue"));
const Tracker_Admin = lazy(() => import("./pages/Tracker_Admin"));
const Tracker_Reports = lazy(() => import("./pages/Tracker_Reports"));
const Tracker_Alerts = lazy(() => import("./pages/Tracker_Alerts"));
const Tracker_Invoices = lazy(() => import("./pages/Tracker_Invoices"));
const Profile = lazy(() => import("./pages/Profile"));
const Device_Management = lazy(() => import("./pages/Device_Management"));
const Invoice_Report = lazy(() => import("./pages/Invoice_Report"));
const HAIS = lazy(() => import("./pages/HAIS"));
const AssetPublicView = lazy(() => import("./pages/HAIS/AssetPublicView"));
const Inventory_Report = lazy(() => import("./pages/Inventory_Report"));
const SO_Invoice_Report = lazy(() => import("./pages/SO_Invoice_Report"));
const Distributor = lazy(() => import("./pages/Distributor"));
const Distributor_Order_Tracking = lazy(() => import("./pages/Distributor/Order_Tracking"));
const MartApproval = lazy(() => import("./pages/MartApproval"));
const Ap_Invoice_Entry = lazy(() => import("./pages/Ap_Invoice_Entry"));

import { AuthProvider } from "./auth";

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      {/* Resolves the session ABOVE the router, so a route guard has the
          user's grants when it runs. Previously the only thing that loaded
          them was Sidebar.fetchCurrentUser — which runs after routing has
          already decided what to render. See src/auth/AuthContext.tsx. */}
      <AuthProvider>
      {/* Covers the routes that render without the shell — the public device
          page, and the redirects. Everything inside ProtectedPage has its own
          boundary there, so the sidebar survives a lazy navigation. */}
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Login />} />

        {/* Standalone device page opened by scanning a device QR (no sidebar). */}
        <Route path="/hais/device/:code" element={<AssetPublicView />} />

        <Route
          path="/Dashboard"
          element={
            <ProtectedPage>
              <Dashboard />
            </ProtectedPage>
          }
        />

        <Route
          path="/Profile"
          element={
            <ProtectedPage>
              <Profile />
            </ProtectedPage>
          }
        />

        {/* System — Device & Version Management (admin) */}
        <Route
          path="/Device_Management"
          element={
            <ProtectedPage>
              <Device_Management />
            </ProtectedPage>
          }
        />

        <Route
          path="/App_User"
          element={
            <ProtectedPage>
              <App_User />
            </ProtectedPage>
          }
        />

        <Route
          path="/Sap_Sync"
          element={
            <ProtectedPage>
              <Sap_sync />
            </ProtectedPage>
          }
        />

        <Route
          path="/Add_Sales"
          element={
            <ProtectedPage>
              <Add_Sales />
            </ProtectedPage>
          }
        />

        <Route
          path="/Drafts"
          element={
            <ProtectedPage>
              <Drafts />
            </ProtectedPage>
          }
        />

        <Route
          path="/FOC"
          element={
            <ProtectedPage>
              <FOC />
            </ProtectedPage>
          }
        />

        <Route
          path="/Sales_Invoice"
          element={
            <ProtectedPage>
              <SalesInvoice />
            </ProtectedPage>
          }
        />

        <Route
          path="/Sales_Invoice/SKU_Images"
          element={
            <ProtectedPage>
              <SkuGalleryPage />
            </ProtectedPage>
          }
        />

        <Route
          path="/Invoice_Review"
          element={
            <ProtectedPage>
              <InvoiceReview />
            </ProtectedPage>
          }
        />

        <Route
          path="/Invoice_Report"
          element={
            <ProtectedPage>
              <Invoice_Report />
            </ProtectedPage>
          }
        />

        <Route
          path="/Inventory_Report"
          element={
            <ProtectedPage>
              <Inventory_Report />
            </ProtectedPage>
          }
        />

        <Route
          path="/SO_Invoice_Report"
          element={
            <ProtectedPage>
              <SO_Invoice_Report />
            </ProtectedPage>
          }
        />

        <Route
          path="/View_Orders"
          element={
            <ProtectedPage>
              <View_Orders />
            </ProtectedPage>
          }
        />

        <Route
          path="/Auditor_orders"
          element={
            <ProtectedPage>
              <Auditor_orders />
            </ProtectedPage>
          }
        />

        <Route
          path="/Billing_orders"
          element={
            <ProtectedPage>
              <Billing_orders />
            </ProtectedPage>
          }
        />

        <Route
          path="/Rate_Approver_orders"
          element={
            <ProtectedPage>
              <RateApproverOrders />
            </ProtectedPage>
          }
        />

        <Route
          path="/Auditor_status_tracking"
          element={
            <ProtectedPage>
              <Order_Status_Tracking mode="auditor" />
            </ProtectedPage>
          }
        />

        <Route
          path="/Billing_status_tracking"
          element={
            <ProtectedPage>
              <Order_Status_Tracking mode="billing" />
            </ProtectedPage>
          }
        />

        <Route
          path="/Rate_Approver_status_tracking"
          element={
            <ProtectedPage>
              <Order_Status_Tracking mode="rate_approver" />
            </ProtectedPage>
          }
        />

        <Route
          path="/Daily_Report"
          element={
            <ProtectedPage>
              <Daily_Report />
            </ProtectedPage>
          }
        />

        <Route
          path="/PersonWise_Report"
          element={
            <ProtectedPage>
              <PersonWise_Report />
            </ProtectedPage>
          }
        />

        <Route
          path="/Sales_Report"
          element={
            <ProtectedPage>
              <Sales_Report />
            </ProtectedPage>
          }
        />

        <Route
          path="/StateWise_Report"
          element={
            <ProtectedPage>
              <StateWise_Report />
            </ProtectedPage>
          }
        />

        <Route
          path="/Order_Tracking"
          element={
            <ProtectedPage>
              <Order_Tracking />
            </ProtectedPage>
          }
        />

        <Route
          path="/Distributor_Order_Tracking"
          element={
            <ProtectedPage>
              <Distributor_Order_Tracking />
            </ProtectedPage>
          }
        />

        <Route
          path="/Party_Assignment"
          element={
            <ProtectedPage>
              <Party_Assignment />
            </ProtectedPage>
          }
        />

        <Route
          path="/Party_Product_Assignment"
          element={
            <ProtectedPage>
              <Party_Product_Assignment />
            </ProtectedPage>
          }
        />

        <Route
          path="/Add_Scheme"
          element={
            <ProtectedPage>
              <Add_Scheme />
            </ProtectedPage>
          }
        />

        <Route
          path="/Scheme_Manager"
          element={
            <ProtectedPage>
              <Scheme_Manager />
            </ProtectedPage>
          }
        />

        <Route
          path="/Combo_Mapping"
          element={
            <ProtectedPage>
              <Combo_Mapping />
            </ProtectedPage>
          }
        />

        <Route
          path="/Staff"
          element={
            <ProtectedPage>
              <Staff />
            </ProtectedPage>
          }
        />

        <Route
          path="/Staff_Rate_Assignment"
          element={
            <ProtectedPage>
              <Staff_Rate_Assignment />
            </ProtectedPage>
          }
        />
        <Route
          path="/Product_Stock"
          element={
            <ProtectedPage>
              <Product_Stock />
            </ProtectedPage>
          }
        />

        <Route
          path="/Order_Stock_Check"
          element={
            <ProtectedPage>
              <Order_Stock_Check />
            </ProtectedPage>
          }
        />

        <Route
          path="/Order_Flow_Settings"
          element={
            <ProtectedPage>
              <Order_Flow_Settings />
            </ProtectedPage>
          }
        />

        <Route
          path="/Page_Permissions"
          element={
            <ProtectedPage>
              <Page_Permissions />
            </ProtectedPage>
          }
        />

        <Route
          path="/Role_Permissions"
          element={
            <ProtectedPage>
              <Role_Permissions />
            </ProtectedPage>
          }
        />

        {/* Sales Quotation — DISABLED 2026-08-27. The quotation flow is
            closed and no longer used; its backend routes and views are
            commented out in OMS-Backend (orders/urls.py, sap_sync/urls.py).
            The SalesQuotationLog table is kept, so history stays queryable.
        <Route
          path="/Sales_Quotation"
          element={
            <ProtectedPage>
              <Sales_Quotation />
            </ProtectedPage>
          }
        />
        */}

       

       
        
       
        <Route
          path="/Label_Checker"
          element={
            <ProtectedPage>
              <LabelChecker />
            </ProtectedPage>
          }
        />

        <Route
          path="/Nutrition_Manager"
          element={
            <ProtectedPage>
              <NutritionManager />
            </ProtectedPage>
          }
        />

        <Route
          path="/Compliance_Rules"
          element={
            <ProtectedPage>
              <ComplianceRules />
            </ProtectedPage>
          }
        />

        <Route
          path="/Label_History"
          element={
            <ProtectedPage>
              <LabelHistory />
            </ProtectedPage>
          }
        />

        <Route
          path="/UI_Labels"
          element={
            <ProtectedPage>
              <UI_Labels />
            </ProtectedPage>
          }
        />

        <Route
          path="/Payments_Dashboard"
          element={
            <ProtectedPage>
              <PaymentsDashboard />
            </ProtectedPage>
          }
        />

        {/* The page was called Approval Management until it became the
            dashboard. Redirected rather than dropped so existing bookmarks and
            the page-permission rows that still carry the old path keep working. */}
        <Route
          path="/Approval_Management"
          element={<Navigate to="/Payments_Dashboard" replace />}
        />

        {/* AP (vendor) invoice entry — copy from GRPO */}
        <Route
          path="/Ap_Invoice_Entry"
          element={
            <ProtectedPage>
              <Ap_Invoice_Entry />
            </ProtectedPage>
          }
        />


        {/* Any unknown path falls back to the dashboard instead of a blank page. */}
        <Route path="*" element={<Navigate to="/Dashboard" replace />} />
        <Route
          path="/Einvoice"
          element={
            <ProtectedPage>
              <Einvoice />
            </ProtectedPage>
          }
        />

        <Route
          path="/Ewaybill"
          element={
            <ProtectedPage>
              <Ewaybill />
            </ProtectedPage>
          }
        />

        <Route
          path="/HAIS"
          element={
            <ProtectedPage>
              <HAIS />
            </ProtectedPage>
          }
        />

        <Route
          path="/Distributor"
          element={
            <ProtectedPage>
              <Distributor />
            </ProtectedPage>
          }
        />

        <Route
          path="/Mart_Approval"
          element={
            <ProtectedPage>
              <MartApproval />
            </ProtectedPage>
          }
        />

        <Route
          path="/Tracker_Entry"
          element={
            <ProtectedPage>
              <Tracker_Entry />
            </ProtectedPage>
          }
        />

        <Route
          path="/Tracker_Queue"
          element={
            <ProtectedPage>
              <Tracker_Queue />
            </ProtectedPage>
          }
        />

        <Route
          path="/Tracker_Admin"
          element={
            <ProtectedPage>
              <Tracker_Admin />
            </ProtectedPage>
          }
        />

        <Route
          path="/Tracker_Reports"
          element={
            <ProtectedPage>
              <Tracker_Reports />
            </ProtectedPage>
          }
        />

        <Route
          path="/Tracker_Alerts"
          element={
            <ProtectedPage>
              <Tracker_Alerts />
            </ProtectedPage>
          }
        />

        <Route
          path="/Tracker_Invoices"
          element={
            <ProtectedPage>
              <Tracker_Invoices />
            </ProtectedPage>
          }
        />
      </Routes>
      </Suspense>
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
