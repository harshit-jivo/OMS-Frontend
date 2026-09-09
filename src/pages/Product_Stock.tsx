/**
 * The Product Stock page: the header and its refresh/download actions, plus
 * the summary cards, filter toolbar, product-demand panel, main table and
 * pagination, and the party order-selection dialog.
 *
 * Everything else moved out in Phase 4 decomposition — the data-fetching,
 * state and every derived list into `productStock/useProductStock`, the KPI
 * cards into `productStock/components/SummaryCards`, the search box and the
 * filters into `productStock/components/FilterToolbar`, the per-product
 * open-orders panel into `productStock/components/ProductDemandPanel`, the
 * (Phase 5.5 virtualized) main table into `productStock/components/StockTable`,
 * and the party open-sales-orders dialog into
 * `productStock/components/OrderModal`. What's left here is what belongs to
 * neither: the header and wiring the page together.
 */
import { HiOutlineArrowDownTray, HiOutlineArrowPath } from "react-icons/hi2";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/ui/page";
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

  const busy = loading || partyOrdersLoading || productOrdersLoading;

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Reports" }, { label: "Product Stock" }]} />

      <PageHeader
        eyebrow="Live warehouse inventory"
        title="Product Stock"
        description="HANA stock, open order demand, and left-over quantity by warehouse."
        actions={
          <>
            {hasSelectedSalesOrders && (
              <Button
                variant="ghost"
                onClick={downloadSelectedOrdersExcel}
                disabled={busy || filteredProducts.length === 0}
              >
                <HiOutlineArrowDownTray aria-hidden="true" />
                Download Excel
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                void fetchProducts();
                void fetchOpenParties();
              }}
              disabled={busy}
            >
              <HiOutlineArrowPath className={busy ? "animate-spin" : ""} aria-hidden="true" />
              {busy ? "Refreshing" : "Refresh"}
            </Button>
          </>
        }
      />

      <SummaryCards ps={ps} />
      <FilterToolbar ps={ps} />
      {selectedProductCode && <ProductDemandPanel ps={ps} />}
      <StockTable ps={ps} />

      {filteredProducts.length > ITEMS_PER_PAGE && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          summary={
            "Showing " +
            (pageStart + 1) +
            "-" +
            Math.min(pageStart + ITEMS_PER_PAGE, filteredProducts.length) +
            " of " +
            filteredProducts.length
          }
        />
      )}

      <OrderModal ps={ps} />
    </Page>
  );
}
