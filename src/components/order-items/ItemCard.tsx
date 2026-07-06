import { memo, useState } from "react";
import {
  LuBadgeCheck,
  LuBox,
  LuBoxes,
  LuChevronDown,
  LuDroplets,
  LuEllipsisVertical,
  LuLeaf,
  LuPackage,
  LuRuler,
  LuTag,
  LuUsers,
} from "react-icons/lu";
import { getOrderItemSchemes, type OrderItem } from "../../services/ordersService";
import Metric from "./Metric";
import MetaChip from "./MetaChip";
import ApprovalAvatar from "./ApprovalAvatar";
import { formatCurrency, getCategoryIcon, titleCase, varietyTone } from "./helpers";

type PriceMetricProps = {
  label: string;
  value: string;
  highlight?: boolean;
};

/** Pricing cell — the Total variant is emphasised (green, larger). */
const PriceMetric = memo(function PriceMetric({ label, value, highlight }: PriceMetricProps) {
  return (
    <div className={`isec-price${highlight ? " isec-price--total" : ""}`}>
      <span className="isec-price__label">{label}</span>
      <span className="isec-price__value">{value}</span>
    </div>
  );
});

const toNumber = (value: unknown) => Number(value ?? 0);

function ItemCard({ item }: { item: OrderItem }) {
  const [schemeOpen, setSchemeOpen] = useState(false);

  const CategoryIcon = getCategoryIcon(item);
  const approvers = Array.isArray(item.approval_approvers) ? item.approval_approvers : [];
  const schemes = getOrderItemSchemes(item);
  const showScheme = Boolean(item.is_scheme_visible) && schemes.length > 0;
  const hasLastPurchasePrice =
    item.last_purchase_price !== null &&
    item.last_purchase_price !== undefined &&
    item.last_purchase_price !== "";

  return (
    <article className="isec-card">
      {/* ── Header ── */}
      <header className="isec-card__head">
        <div className="isec-card__id">
          <span className="isec-card__icon" aria-hidden="true">
            <CategoryIcon />
          </span>
          <div className="isec-card__titles">
            <h4 className="isec-card__name" title={item.item_name}>
              {item.item_name}
            </h4>
            <span className="isec-card__code">{item.item_code}</span>
          </div>
        </div>

        {hasLastPurchasePrice && (
          <div className="isec-card__lpp" title="Last purchase price for this item">
            <span className="isec-card__lpp-label">Last Purchase</span>
            <span className="isec-card__lpp-value">{formatCurrency(item.last_purchase_price)}</span>
          </div>
        )}

        {/* <div className="isec-card__actions">
          <span className="isec-card__chip" title={item.item_code}>
            {item.item_code}
          </span>
          <button type="button" className="isec-card__menu" aria-label="Item actions">
            <LuEllipsisVertical />
          </button>
        </div> */}
      </header>

      {/* ── Metadata chips ── */}
      <div className="isec-card__meta">
        <MetaChip
          tone={varietyTone(item.variety_type)}
          icon={<LuBadgeCheck />}
          label={titleCase(item.variety_type)}
        />
        <MetaChip icon={<LuLeaf />} label={titleCase(item.variety)} />
        <MetaChip icon={<LuRuler />} label={item.item_type} />
        <MetaChip icon={<LuTag />} label={item.brand} />
      </div>

      {/* ── Metrics ── */}
      <div className="isec-card__metrics">
        <Metric icon={<LuPackage />} label="Qty" value={toNumber(item.qty)} />
        <Metric icon={<LuBox />} label="PCS" value={toNumber(item.pcs)} />
        <Metric icon={<LuBoxes />} label="Boxes" value={toNumber(item.boxes).toFixed(2)} />
        <Metric icon={<LuDroplets />} label="Litres" value={toNumber(item.ltrs)} />
      </div>

      {/* ── Pricing ── */}
      <div className="isec-card__pricing">
        <PriceMetric label="Basic Price" value={formatCurrency(item.basic_price)} />
        <PriceMetric label="Price List" value={formatCurrency(item.price_list_basic)} />
        <PriceMetric label="GST" value={`${toNumber(item.tax_rate)}%`} />
        <PriceMetric label="Total" value={formatCurrency(item.total)} highlight />
      </div>

      {/* ── Approvers ──
      {approvers.length > 0 && (
        <div className="isec-card__approval">
          <span className="isec-card__approval-icon" aria-hidden="true">
            <LuUsers />
          </span>
          <div className="isec-avatars">
            {approvers.map((approver) => (
              <ApprovalAvatar key={approver.id} name={approver.name} />
            ))}
          </div>
          <span className="isec-card__approval-text">
            {approvers.length === 1 ? approvers[0].name : `${approvers.length} approvers`}
          </span>
        </div>
      )} */}

      {/* ── Scheme (only when visible) ── */}
      {showScheme && (
        <div className={`isec-scheme${schemeOpen ? " open" : ""}`}>
          <button
            type="button"
            className="isec-scheme__toggle"
            aria-expanded={schemeOpen}
            onClick={() => setSchemeOpen((open) => !open)}
          >
            <span>{schemes.length > 1 ? `Schemes (${schemes.length})` : "Scheme"}</span>
            <LuChevronDown className="isec-scheme__chev" aria-hidden="true" />
          </button>
          {schemeOpen && (
            <ul className="isec-scheme__list">
              {schemes.map((scheme, index) => (
                <li className="isec-scheme__item" key={`${scheme.name}-${index}`}>
                  <span className="isec-scheme__name">{scheme.name || "-"}</span>
                  <span className="isec-scheme__qty">Qty {scheme.qty || 0}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

export default memo(ItemCard);
