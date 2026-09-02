/**
 * The `.ps-summary` KPI card row — total products, stock, order-required
 * quantity (and its litre equivalent once sales orders are selected),
 * shortage count and low/out count.
 */
import { formatQuantity, formatRoundedQuantity } from "../productStockUtils";
import type { ProductStockState } from "../useProductStock";

export default function SummaryCards({ ps }: { ps: ProductStockState }) {
  const { selectedPartyCodes, summary, selectedSalesOrders } = ps;

  return (
    <section className="ps-summary">
      <div className="ps-card ps-card-products">
        <span>{selectedPartyCodes.length > 0 ? "Selected Party Items" : "Total Products"}</span>
        <strong>{summary.totalProducts}</strong>
        {selectedPartyCodes.length > 0 && (
          <small>
            {selectedPartyCodes.length} {selectedPartyCodes.length === 1 ? "party" : "parties"}{" "}
            selected
          </small>
        )}
      </div>
      <div className="ps-card ps-card-stock">
        <span>Total Stock</span>
        <strong>{formatQuantity(summary.totalStock)}</strong>
      </div>
      <div className="ps-card ps-card-required">
        <span>Order Required Qty</span>
        <strong>{formatQuantity(summary.pendingRequired)}</strong>
      </div>
      {Object.keys(selectedSalesOrders).length > 0 && (
        <div className="ps-card ps-card-required">
          <span>Order Required Qty Ltrs</span>
          <strong>{formatRoundedQuantity(summary.pendingRequiredLtrs)}</strong>
        </div>
      )}
      <div className="ps-card ps-card-danger">
        <span>Shortage</span>
        <strong>{summary.shortage}</strong>
      </div>
      <div className="ps-card ps-card-warning">
        <span>Low / Out</span>
        <strong>{summary.low + summary.out}</strong>
      </div>
    </section>
  );
}
