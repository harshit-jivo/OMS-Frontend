import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Login from "./pages/Login";
import Sidebar from "./components/Sidebar";
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
import Sales_Quotation from "./pages/Sales_Quotation";
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

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route
          path="/Dashboard"
          element={
            <Sidebar>
              <Dashboard />
            </Sidebar>
          }
        />

        <Route
          path="/Profile"
          element={
            <Sidebar>
              <Profile />
            </Sidebar>
          }
        />

        {/* System — Device & Version Management (admin) */}
        <Route
          path="/Device_Management"
          element={
            <Sidebar>
              <Device_Management />
            </Sidebar>
          }
        />

        <Route
          path="/App_User"
          element={
            <Sidebar>
              <App_User />
            </Sidebar>
          }
        />

        <Route
          path="/Sap_Sync"
          element={
            <Sidebar>
              <Sap_sync />
            </Sidebar>
          }
        />

        <Route
          path="/Add_Sales"
          element={
            <Sidebar>
              <Add_Sales />
            </Sidebar>
          }
        />

        <Route
          path="/Drafts"
          element={
            <Sidebar>
              <Drafts />
            </Sidebar>
          }
        />

        <Route
          path="/FOC"
          element={
            <Sidebar>
              <FOC />
            </Sidebar>
          }
        />

        <Route
          path="/Sales_Invoice"
          element={
            <Sidebar>
              <SalesInvoice />
            </Sidebar>
          }
        />

        <Route
          path="/Sales_Invoice/SKU_Images"
          element={
            <Sidebar>
              <SkuGalleryPage />
            </Sidebar>
          }
        />

        <Route
          path="/Invoice_Review"
          element={
            <Sidebar>
              <InvoiceReview />
            </Sidebar>
          }
        />

        <Route
          path="/Invoice_Report"
          element={
            <Sidebar>
              <Invoice_Report />
            </Sidebar>
          }
        />

        <Route
          path="/View_Orders"
          element={
            <Sidebar>
              <View_Orders />
            </Sidebar>
          }
        />

        <Route
          path="/Auditor_orders"
          element={
            <Sidebar>
              <Auditor_orders />
            </Sidebar>
          }
        />

        <Route
          path="/Billing_orders"
          element={
            <Sidebar>
              <Billing_orders />
            </Sidebar>
          }
        />

        <Route
          path="/Rate_Approver_orders"
          element={
            <Sidebar>
              <RateApproverOrders />
            </Sidebar>
          }
        />

        <Route
          path="/Auditor_status_tracking"
          element={
            <Sidebar>
              <Order_Status_Tracking mode="auditor" />
            </Sidebar>
          }
        />

        <Route
          path="/Billing_status_tracking"
          element={
            <Sidebar>
              <Order_Status_Tracking mode="billing" />
            </Sidebar>
          }
        />

        <Route
          path="/Rate_Approver_status_tracking"
          element={
            <Sidebar>
              <Order_Status_Tracking mode="rate_approver" />
            </Sidebar>
          }
        />

        <Route
          path="/Daily_Report"
          element={
            <Sidebar>
              <Daily_Report />
            </Sidebar>
          }
        />

        <Route
          path="/PersonWise_Report"
          element={
            <Sidebar>
              <PersonWise_Report />
            </Sidebar>
          }
        />

        <Route
          path="/Sales_Report"
          element={
            <Sidebar>
              <Sales_Report />
            </Sidebar>
          }
        />

        <Route
          path="/StateWise_Report"
          element={
            <Sidebar>
              <StateWise_Report />
            </Sidebar>
          }
        />

        <Route
          path="/Order_Tracking"
          element={
            <Sidebar>
              <Order_Tracking />
            </Sidebar>
          }
        />

        <Route
          path="/Party_Assignment"
          element={
            <Sidebar>
              <Party_Assignment />
            </Sidebar>
          }
        />

        <Route
          path="/Party_Product_Assignment"
          element={
            <Sidebar>
              <Party_Product_Assignment />
            </Sidebar>
          }
        />

        <Route
          path="/Add_Scheme"
          element={
            <Sidebar>
              <Add_Scheme />
            </Sidebar>
          }
        />

        <Route
          path="/Staff"
          element={
            <Sidebar>
              <Staff />
            </Sidebar>
          }
        />

        <Route
          path="/Staff_Rate_Assignment"
          element={
            <Sidebar>
              <Staff_Rate_Assignment />
            </Sidebar>
          }
        />
        <Route
          path="/Product_Stock"
          element={
            <Sidebar>
              <Product_Stock />
            </Sidebar>
          }
        />

        <Route
          path="/Order_Stock_Check"
          element={
            <Sidebar>
              <Order_Stock_Check />
            </Sidebar>
          }
        />

        <Route
          path="/Order_Flow_Settings"
          element={
            <Sidebar>
              <Order_Flow_Settings />
            </Sidebar>
          }
        />

        <Route
          path="/Page_Permissions"
          element={
            <Sidebar>
              <Page_Permissions />
            </Sidebar>
          }
        />

        <Route
          path="/Sales_Quotation"
          element={
            <Sidebar>
              <Sales_Quotation />
            </Sidebar>
          }
        />

       

       
        
       
        <Route
          path="/Label_Checker"
          element={
            <Sidebar>
              <LabelChecker />
            </Sidebar>
          }
        />

        <Route
          path="/Nutrition_Manager"
          element={
            <Sidebar>
              <NutritionManager />
            </Sidebar>
          }
        />

        <Route
          path="/UI_Labels"
          element={
            <Sidebar>
              <UI_Labels />
            </Sidebar>
          }
        />

        {/* Any unknown path falls back to the dashboard instead of a blank page. */}
        <Route path="*" element={<Navigate to="/Dashboard" replace />} />
        <Route
          path="/Einvoice"
          element={
            <Sidebar>
              <Einvoice />
            </Sidebar>
          }
        />

        <Route
          path="/Ewaybill"
          element={
            <Sidebar>
              <Ewaybill />
            </Sidebar>
          }
        />

        <Route
          path="/Tracker_Entry"
          element={
            <Sidebar>
              <Tracker_Entry />
            </Sidebar>
          }
        />

        <Route
          path="/Tracker_Queue"
          element={
            <Sidebar>
              <Tracker_Queue />
            </Sidebar>
          }
        />

        <Route
          path="/Tracker_Admin"
          element={
            <Sidebar>
              <Tracker_Admin />
            </Sidebar>
          }
        />

        <Route
          path="/Tracker_Reports"
          element={
            <Sidebar>
              <Tracker_Reports />
            </Sidebar>
          }
        />

        <Route
          path="/Tracker_Alerts"
          element={
            <Sidebar>
              <Tracker_Alerts />
            </Sidebar>
          }
        />

        <Route
          path="/Tracker_Invoices"
          element={
            <Sidebar>
              <Tracker_Invoices />
            </Sidebar>
          }
        />
      </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
