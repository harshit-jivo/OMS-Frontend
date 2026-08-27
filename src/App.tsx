import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Login from "./pages/Login";
import ProtectedPage from "./components/ProtectedPage";
import Dashboard from "./pages/Dashboard";
import App_User from "./pages/App_User";
import Sap_sync from "./pages/Sap_Sync";
import Add_Sales from "./pages/Add_Sales";
import Drafts from "./pages/Drafts";
import View_Orders from "./pages/View_Orders";
import Auditor_orders from "./pages/Auditor_Order";
import Billing_orders from "./pages/Billing_Order";
import RateApproverOrders from "./pages/Rate_Approver_Order";
import Order_Status_Tracking from "./pages/Order_Status_Tracking";
import Daily_Report from "./pages/Daily_Report";
import PersonWise_Report from "./pages/PersonWise_Report";
import Sales_Report from "./pages/Sales_Report";
import StateWise_Report from "./pages/StateWise_Report";
import Order_Tracking from "./pages/Order_Tracking";
import "./styles/AppShell.css";
import "./styles/UIConsistency.css";
import Party_Assignment from "./pages/Party_Assignment";
import Party_Product_Assignment from "./pages/Party_Product_Assignment";
import Add_Scheme from "./pages/Add_Scheme";
import Scheme_Manager from "./pages/Scheme_Manager";
import Combo_Mapping from "./pages/Combo_Mapping";
import FOC from "./pages/FOC";
import SalesInvoice from "./pages/Sales_Invoice";    
import SkuGalleryPage from "./pages/SalesInvoice/SkuGalleryPage";
import InvoiceReview from "./pages/InvoiceReview";
import Staff from "./pages/Staff";
import Staff_Rate_Assignment from "./pages/Staff_Rate_Assignment";
import Order_Stock_Check from "./pages/Order_Stock_Check";
import Product_Stock from "./pages/Product_Stock";
import Order_Flow_Settings from "./pages/Order_Flow_Settings";
import Page_Permissions from "./pages/Page_Permissions";
import UI_Labels from "./pages/UI_Labels";
import PaymentsDashboard from "./pages/Payments/ApprovalManagement";
// import Sales_Quotation from "./pages/Sales_Quotation";  // DISABLED 2026-08-27 — quotation flow closed
import LabelChecker from "./pages/Label_Checker";
import NutritionManager from "./pages/Nutrition_Manager";
import Einvoice from "./pages/Einvoice";
import Ewaybill from "./pages/Ewaybill";
import Tracker_Entry from "./pages/Tracker_Entry";
import Tracker_Queue from "./pages/Tracker_Queue";
import Tracker_Admin from "./pages/Tracker_Admin";
import Tracker_Reports from "./pages/Tracker_Reports";
import Tracker_Alerts from "./pages/Tracker_Alerts";
import Tracker_Invoices from "./pages/Tracker_Invoices";
import Profile from "./pages/Profile";
import Device_Management from "./pages/Device_Management";
import Invoice_Report from "./pages/Invoice_Report";
import HAIS from "./pages/HAIS";
import AssetPublicView from "./pages/HAIS/AssetPublicView";
import Inventory_Report from "./pages/Inventory_Report";
import SO_Invoice_Report from "./pages/SO_Invoice_Report";
import Distributor from "./pages/Distributor";
import Distributor_Order_Tracking from "./pages/Distributor/Order_Tracking";
import MartApproval from "./pages/MartApproval";
import Ap_Invoice_Entry from "./pages/Ap_Invoice_Entry";

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
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
