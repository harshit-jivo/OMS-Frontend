/**
 * The Product Stock page: the hero header and its refresh/download actions,
 * plus the summary cards, filter toolbar, product-demand panel, main table
 * and pagination, and the party order-selection dialog.
 *
 * Everything else moved out in Phase 4 decomposition — the data-fetching,
 * state and every derived list into `productStock/useProductStock`, the KPI
 * cards into `productStock/components/SummaryCards`, the search box and five
 * filter dropdowns into `productStock/components/FilterToolbar`, the
 * per-product open-orders panel into
 * `productStock/components/ProductDemandPanel`, the (Phase 5.5 virtualized)
 * main table into `productStock/components/StockTable`, and the party
 * open-sales-orders dialog into `productStock/components/OrderModal`. What's
 * left here is what belongs to neither: the header and wiring the page
 * together.
 */
import { HiArrowDownTray, HiArrowPath } from "react-icons/hi2";
import "../styles/Product_Stock.css";
import { Pagination } from "@/components/ui/pagination";

import { ITEMS_PER_PAGE } from "./productStock/productStockUtils";
import { useProductStock } from "./productStock/useProductStock";
import SummaryCards from "./productStock/components/SummaryCards";
import FilterToolbar from "./productStock/components/FilterToolbar";
import ProductDemandPanel from "./productStock/components/ProductDemandPanel";
import StockTable from "./productStock/components/StockTable";
import OrderModal from "./productStock/components/OrderModal";

export default function Product_Stock() {
  const ps = useProductStock();
  const {
    loading,
    partyOrdersLoading,
    productOrdersLoading,
    hasSelectedSalesOrders,
    downloadSelectedOrdersExcel,
    fetchProducts,
    fetchOpenParties,
    selectedProductCode,
    filteredProducts,
    currentPage,
    setCurrentPage,
    totalPages,
    pageStart,
  } = ps;

  return (
    <div className="ps-page">
      <div className="ps-header">
        <div>
          <span className="ps-kicker">Live Warehouse Inventory</span>
          <h1 className="ps-title">Product Stock</h1>
          <p className="ps-subtitle">
            HANA stock, open order demand, and left-over quantity by warehouse.
          </p>
        </div>

        <div className="ps-header-actions">
          {hasSelectedSalesOrders && (
            <button
              className="ps-refresh ps-download"
              type="button"
              onClick={downloadSelectedOrdersExcel}
              disabled={
                loading ||
                partyOrdersLoading ||
                productOrdersLoading ||
                filteredProducts.length === 0
              }
            >
              <HiArrowDownTray />
              Download Excel
            </button>
          )}
          <button
            className="ps-refresh"
            type="button"
            onClick={() => {
              void fetchProducts();
              void fetchOpenParties();
            }}
            disabled={loading || partyOrdersLoading || productOrdersLoading}
          >
            <HiArrowPath />
            {loading || partyOrdersLoading || productOrdersLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      <SummaryCards ps={ps} />
      <FilterToolbar ps={ps} />
      {selectedProductCode && <ProductDemandPanel ps={ps} />}
      <StockTable ps={ps} />

      {filteredProducts.length > ITEMS_PER_PAGE && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          summary={`Showing ${pageStart + 1}-${Math.min(
            pageStart + ITEMS_PER_PAGE,
            filteredProducts.length,
          )} of ${filteredProducts.length}`}
        />
      )}

      <OrderModal ps={ps} />
    </div>
  );
}
