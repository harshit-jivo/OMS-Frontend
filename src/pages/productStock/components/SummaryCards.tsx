/**
 * The KPI row — total products, stock, order-required quantity (and its litre
 * equivalent once sales orders are selected), shortage count and low/out count.
 */
import {
  HiOutlineArchiveBox,
  HiOutlineCube,
  HiOutlineExclamationTriangle,
  HiOutlineScale,
  HiOutlineShoppingCart,
} from "react-icons/hi2";

import { Stat, StatRow } from "@/components/ui/page";
import { formatQuantity, formatRoundedQuantity } from "../productStockUtils";
import type { ProductStockState } from "../useProductStock";

export default function SummaryCards({ ps }: { ps: ProductStockState }) {
  const { selectedPartyCodes, summary, selectedSalesOrders } = ps;
  const partyScoped = selectedPartyCodes.length > 0;

  return (
    <StatRow>
      <Stat
        label={partyScoped ? "Selected party items" : "Total products"}
        value={summary.totalProducts}
        hint={
          partyScoped
            ? selectedPartyCodes.length +
              (selectedPartyCodes.length === 1 ? " party" : " parties") +
              " selected"
            : undefined
        }
        icon={HiOutlineCube}
      />
      <Stat label="Total stock" value={formatQuantity(summary.totalStock)} icon={HiOutlineArchiveBox} />
      <Stat
        label="Order required qty"
        value={formatQuantity(summary.pendingRequired)}
        icon={HiOutlineShoppingCart}
      />
      {Object.keys(selectedSalesOrders).length > 0 && (
        <Stat
          label="Order required qty (L)"
          value={formatRoundedQuantity(summary.pendingRequiredLtrs)}
          icon={HiOutlineScale}
        />
      )}
      <Stat
        label="Shortage"
        value={summary.shortage}
        icon={HiOutlineExclamationTriangle}
        tone={summary.shortage > 0 ? "bad" : "neutral"}
      />
      <Stat
        label="Low / out"
        value={summary.low + summary.out}
        icon={HiOutlineExclamationTriangle}
        tone={summary.low + summary.out > 0 ? "hold" : "neutral"}
      />
    </StatRow>
  );
}
