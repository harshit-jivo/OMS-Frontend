import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiArchiveBox, HiArrowPath, HiArrowRight, HiChevronLeft, HiDocumentText, HiPhoto, HiTrash, HiXMark } from "react-icons/hi2";
import DraftStep from "./DraftStep";
import OrdersStep from "./OrdersStep";
import { apiFetch, useSalesInvoice, type SalesInvoiceState } from "./useSalesInvoice";
import { formatMoney, type SelectedLine } from "./salesInvoice.utils";
import "../../styles/Sales_Invoice.css";

type PartyPickerModalProps = {
  state: SalesInvoiceState;
  onClose: () => void;
  onSelect: () => void;
};

type InvoiceSourceMode = "sales-order" | "items";
type ItemFilterModal = "brand" | "subGroup" | "variety" | "packSize";

type FinishedGoodItem = {
  ItemCode: string;
  ItemName: string;
  U_Brand?: string | null;
  U_Variety?: string | null;
  U_Sub_Group?: string | null;
  U_SKU?: string | null;
  Quantity?: number | string | null;
  OnHand?: number | string | null;
  InStock?: number | string | null;
  AvailableQty?: number | string | null;
  AvailableQuantity?: number | string | null;
  TotalQty?: number | string | null;
  "SUM(Quantity)"?: number | string | null;
  Price?: number | string | null;
  UnitPrice?: number | string | null;
  PriceBefDi?: number | string | null;
  TaxCode?: string | null;
  VatGroup?: string | null;
  VatPrcnt?: number | string | null;
  DiscPrcnt?: number | string | null;
};

type ItemPriceRecord = {
  Price?: number | string | null;
  UnitPrice?: number | string | null;
  PriceBefDi?: number | string | null;
  PriceBeforeDiscount?: number | string | null;
  TaxCode?: string | null;
  VatGroup?: string | null;
  VatPrcnt?: number | string | null;
  TaxPercent?: number | string | null;
  DiscPrcnt?: number | string | null;
  DiscountPercent?: number | string | null;
  [key: string]: unknown;
};

type ItemPriceApiResponse =
  | ItemPriceRecord
  | ItemPriceRecord[]
  | { data?: ItemPriceRecord[] | ItemPriceRecord; results?: ItemPriceRecord[] | ItemPriceRecord };

type InventoryWarehouse = {
  WhsCode: string;
  "SUM(Quantity)"?: number;
};

type BatchDetail = {
  SysNumber?: number;
  BatchNum?: string;
  BatchNumber?: string;
  DistNumber?: string;
  BatchNo?: string;
  BatchCode?: string;
  BatchID?: string;
  BatchId?: string;
  Batch?: string;
  LotNumber?: string;
  MnfSerial?: string;
  InternalSerialNumber?: string;
  SerialNumber?: string;
  ItemCode: string;
  ItemName: string;
  WhsCode: string;
  PrdDate?: string | null;
  ExpDate?: string | null;
  InDate?: string | null;
  Quantity: number;
  BaseType?: number;
  BaseNum?: number;
  BaseEntry?: number;
  SystemSerialNumber?: number;
  AbsEntry?: number;
  [key: string]: unknown;
};

type SelectedBatch = {
  warehouseCode: string;
  warehouseQuantity: number;
  batches: Array<{
    batch: BatchDetail;
    quantity: number;
  }>;
};

type ItemInvoiceRow = {
  id: number;
  type: "Item";
  item: FinishedGoodItem | null;
  invoiceQty: number;
  batch: SelectedBatch | null;
};

const stateNameByCode: Record<string, string> = {
  AD: "Andhra Pradesh",
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AS: "Assam",
  AUS: "Australia",
  AZ: "Arizona",
  BH: "Bihar",
  CA: "California",
  CH: "Chandigarh",
  CT: "Chhattisgarh",
  DB: "Dadra and Nagar Haveli and Daman and Diu",
  DL: "Delhi",
  DN: "Dadra and Nagar Haveli and Daman and Diu",
  GJ: "Gujarat",
  GL: "Goa",
  GO: "Goa",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu and Kashmir",
  KR: "Kerala",
  KT: "Karnataka",
  MH: "Maharashtra",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NG: "Nagaland",
  NSW: "New South Wales",
  OD: "Odisha",
  PB: "Punjab",
  RJ: "Rajasthan",
  TE: "Telangana",
  TN: "Tamil Nadu",
  TO: "Tripura",
  UK: "Uttarakhand",
  UP: "Uttar Pradesh",
  WA: "Western Australia",
  WB: "West Bengal",
};

const formatStateName = (stateCode?: string | null) => {
  const code = String(stateCode || "").trim();
  return code ? stateNameByCode[code] || code : "";
};

const nullChainValue = "__NO_CHAIN__";

const getChainValue = (chain?: string | null) => {
  const text = String(chain || "").trim();
  return text || nullChainValue;
};

const formatChainName = (chainValue: string) => chainValue === nullChainValue ? "No Chain" : chainValue;

const getPartyOpenOrders = (party: { OpenOrders?: number; Num_of_Open_SalesOrder?: number }) =>
  Number(party.OpenOrders ?? party.Num_of_Open_SalesOrder ?? 0);

const getItemTotalQty = (item: FinishedGoodItem) => {
  const qty = Number(item.TotalQty ?? item.AvailableQty ?? item.AvailableQuantity ?? item.Quantity ?? item.OnHand ?? item.InStock ?? 0);
  return Number.isFinite(qty) ? qty : 0;
};

const stateFilterOrder = [
  "PB", "HR", "DL", "UP", "AP", "GJ", "MH", "WB", "JK", "TE", "KT", "RJ", "GO", "AS", "HP", "UK",
  "BH", "MP", "TN", "CT", "DB", "MN",
];

const chainFilterOrder = [
  "DISTRIBUTOR", "D MART", "SUPER STOCKIST", "RETAILER", nullChainValue, "WALMART", "INDIVIDUALS",
  "BIG BASKET", "GT", "SINGLE SHOPS", "RELIANCE FRESH", "ARY SHOPS", "GURUDWARA", "METRO CASH & CARRY",
  "ABRL", "RAJ MANDIR", "AMAZON", "BULK", "STAFF",
];

const mainGroupFilterOrder = [
  "GT", "MT", "ROI", "E-COMMERCE", "BRANCH", "CSD", "CORPORATE", "HORECA", "STAFF", "REFERENCE",
  "SANGAT", "CALL CENTER", "BULK OIL", "EXPORT", "EVENTS & EXHIBITIONS", "PURCHASE OIL",
];

const sortByFilterOrder = (order: string[]) => (optionA: string, optionB: string) => {
  const indexA = order.indexOf(optionA);
  const indexB = order.indexOf(optionB);
  if (indexA !== -1 || indexB !== -1) {
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  }
  return optionA.localeCompare(optionB);
};

function PartyPickerModal({ state, onClose, onSelect }: PartyPickerModalProps) {
  const [selectedState, setSelectedState] = useState("");
  const [selectedMainGroup, setSelectedMainGroup] = useState("");
  const [selectedChain, setSelectedChain] = useState("");
  const [partyQuery, setPartyQuery] = useState("");
  const [filterModal, setFilterModal] = useState<"state" | "mainGroup" | "chain" | null>(null);
  const stateOptions = useMemo(() => {
    return [...new Set(state.parties.map((party) => String(party.State1 || "").trim()).filter(Boolean))]
      .sort(sortByFilterOrder(stateFilterOrder));
  }, [state.parties]);
  const mainGroupOptions = useMemo(() => {
    const groups = state.parties
      .filter((party) => !selectedState || party.State1 === selectedState)
      .map((party) => String(party.U_Main_Group || "").trim())
      .filter(Boolean);
    return [...new Set(groups)].sort(sortByFilterOrder(mainGroupFilterOrder));
  }, [selectedState, state.parties]);
  const chainOptions = useMemo(() => {
    const chains = state.parties
      .filter((party) => !selectedState || party.State1 === selectedState)
      .filter((party) => !selectedMainGroup || party.U_Main_Group === selectedMainGroup)
      .map((party) => getChainValue(party.U_Chain));
    const uniqueChains = [...new Set(chains)].sort((chainA, chainB) =>
      formatChainName(chainA).localeCompare(formatChainName(chainB)),
    );
    return uniqueChains.sort(sortByFilterOrder(chainFilterOrder));
  }, [selectedMainGroup, selectedState, state.parties]);
  const filteredParties = useMemo(() => {
    const normalizedQuery = partyQuery.trim().toLowerCase();
    return state.parties.filter((party) => {
      const stateMatches = !selectedState || party.State1 === selectedState;
      const mainGroupMatches = !selectedMainGroup || party.U_Main_Group === selectedMainGroup;
      const chainMatches = !selectedChain || getChainValue(party.U_Chain) === selectedChain;
      const queryMatches = !normalizedQuery
        || [party.CardName, party.CardCode, formatStateName(party.State1), party.U_Main_Group, party.U_Chain]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));
      return stateMatches && mainGroupMatches && chainMatches && queryMatches;
    });
  }, [partyQuery, selectedChain, selectedMainGroup, selectedState, state.parties]);

  useEffect(() => {
    setSelectedMainGroup((current) => (current && !mainGroupOptions.includes(current) ? "" : current));
  }, [mainGroupOptions]);

  useEffect(() => {
    setSelectedChain((current) => (current && !chainOptions.includes(current) ? "" : current));
  }, [chainOptions]);

  const visibleStates = useMemo(() => {
    const selectedFirstStates = selectedState
      ? [selectedState, ...stateOptions.filter((stateCode) => stateCode !== selectedState)]
      : stateOptions;
    return selectedFirstStates.slice(0, Math.max(4, selectedState ? 5 : 4));
  }, [selectedState, stateOptions]);
  const hiddenStateCount = Math.max(stateOptions.length - visibleStates.length, 0);
  const visibleMainGroups = useMemo(() => {
    const selectedFirstGroups = selectedMainGroup
      ? [selectedMainGroup, ...mainGroupOptions.filter((group) => group !== selectedMainGroup)]
      : mainGroupOptions;
    return selectedFirstGroups.slice(0, 6);
  }, [mainGroupOptions, selectedMainGroup]);
  const hiddenMainGroupCount = Math.max(mainGroupOptions.length - visibleMainGroups.length, 0);
  const visibleChains = useMemo(() => {
    const selectedFirstChains = selectedChain
      ? [selectedChain, ...chainOptions.filter((chain) => chain !== selectedChain)]
      : chainOptions;
    return selectedFirstChains.slice(0, 6);
  }, [chainOptions, selectedChain]);
  const hiddenChainCount = Math.max(chainOptions.length - visibleChains.length, 0);
  const clearPartyFilters = () => {
    setSelectedState("");
    setSelectedMainGroup("");
    setSelectedChain("");
  };
  const modalOptions = filterModal === "state" ? stateOptions : filterModal === "mainGroup" ? mainGroupOptions : chainOptions;
  const modalTitle = filterModal === "state" ? "Select State" : filterModal === "mainGroup" ? "Select Main Group" : "Select Chain";
  const modalAllLabel = filterModal === "state" ? "All states" : filterModal === "mainGroup" ? "All main groups" : "All chains";
  const isModalAllActive = filterModal === "state" ? !selectedState : filterModal === "mainGroup" ? !selectedMainGroup : !selectedChain;
  const isModalOptionActive = (option: string) => (
    filterModal === "state" ? selectedState === option : filterModal === "mainGroup" ? selectedMainGroup === option : selectedChain === option
  );
  const selectModalOption = (option: string) => {
    if (filterModal === "state") setSelectedState(option);
    else if (filterModal === "mainGroup") setSelectedMainGroup(option);
    else setSelectedChain(option);
    setFilterModal(null);
  };
  const clearModalOption = () => {
    if (filterModal === "state") setSelectedState("");
    else if (filterModal === "mainGroup") setSelectedMainGroup("");
    else setSelectedChain("");
    setFilterModal(null);
  };
  const formatModalOption = (option: string) => (
    filterModal === "state" ? formatStateName(option) : filterModal === "mainGroup" ? option : formatChainName(option)
  );

  return (
    <div className="si-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="si-party-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Select party"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="si-so-modal-head">
          <div>
            <h2>Select party</h2>
          </div>
          <button
            className="si-modal-icon-btn si-modal-icon-close"
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <HiXMark aria-hidden="true" />
          </button>
        </header>

        <div className="si-party-modal-body">
          <aside className="si-party-filter-panel">
            <span className="si-party-filter-label">State</span>
            <div className="si-party-state-filters" aria-label="State filters">
              <button
                className={`si-state-chip${!selectedState ? " is-active" : ""}`}
                type="button"
                onClick={() => setSelectedState("")}
              >
                All states
              </button>
              {visibleStates.map((vendorState) => (
                <button
                  className={`si-state-chip${selectedState === vendorState ? " is-active" : ""}`}
                  type="button"
                  key={vendorState}
                  onClick={() => setSelectedState(vendorState)}
                >
                  {formatStateName(vendorState)}
                </button>
              ))}
              {hiddenStateCount > 0 && (
                <button className="si-state-chip si-state-chip-more" type="button" onClick={() => setFilterModal("state")}>
                  More +{hiddenStateCount}
                </button>
              )}
            </div>

            <span className="si-party-filter-label">Main Group</span>
            <div className="si-party-state-filters" aria-label="Main group filters">
              <button
                className={`si-state-chip${!selectedMainGroup ? " is-active" : ""}`}
                type="button"
                onClick={() => setSelectedMainGroup("")}
              >
                All main groups
              </button>
              {visibleMainGroups.map((mainGroup) => (
                <button
                  className={`si-state-chip${selectedMainGroup === mainGroup ? " is-active" : ""}`}
                  type="button"
                  key={mainGroup}
                  onClick={() => setSelectedMainGroup(mainGroup)}
                >
                  {mainGroup}
                </button>
              ))}
              {hiddenMainGroupCount > 0 && (
                <button className="si-state-chip si-state-chip-more" type="button" onClick={() => setFilterModal("mainGroup")}>
                  More +{hiddenMainGroupCount}
                </button>
              )}
            </div>

            <span className="si-party-filter-label">Chain</span>
            <div className="si-party-state-filters" aria-label="Chain filters">
              <button
                className={`si-state-chip${!selectedChain ? " is-active" : ""}`}
                type="button"
                onClick={() => setSelectedChain("")}
              >
                All chains
              </button>
              {visibleChains.map((chain) => (
                <button
                  className={`si-state-chip${selectedChain === chain ? " is-active" : ""}`}
                  type="button"
                  key={chain}
                  onClick={() => setSelectedChain(chain)}
                >
                  {formatChainName(chain)}
                </button>
              ))}
              {hiddenChainCount > 0 && (
                <button className="si-state-chip si-state-chip-more" type="button" onClick={() => setFilterModal("chain")}>
                  More +{hiddenChainCount}
                </button>
              )}
            </div>

            {(selectedState || selectedMainGroup || selectedChain) && (
              <button className="si-btn si-btn-outline si-party-clear-filters" type="button" onClick={clearPartyFilters}>
                Clear filters
              </button>
            )}
          </aside>

          <section className="si-party-results-panel">
            <input
              className="si-search-input si-party-search-input"
              value={partyQuery}
              onChange={(event) => setPartyQuery(event.target.value)}
              placeholder="Search party, code, state, main group or chain"
              autoFocus
            />
            {state.partyError && <div className="si-inline-error">{state.partyError}</div>}

            <div className="si-party-modal-results">
            {state.loadingParties ? (
              <div className="si-loader">Loading customers...</div>
            ) : filteredParties.length === 0 ? (
              <div className="si-empty">No customers found.</div>
            ) : (
              filteredParties.map((party) => (
                <button
                  className="si-party-row"
                  key={`${party.CardCode}-${party.State1 || ""}-${party.U_Main_Group || ""}-${party.U_Chain || ""}`}
                  type="button"
                  onClick={() => {
                    state.selectParty(party);
                    onSelect();
                  }}
                >
                  <span>
                    <strong>{party.CardName}</strong>
                  </span>
                  <small className="si-party-so-count">
                    {getPartyOpenOrders(party).toLocaleString("en-IN")} open SO
                  </small>
                </button>
              ))
            )}
            </div>
          </section>
        </div>

        {filterModal && (
          <div
            className="si-nested-modal-backdrop"
            role="presentation"
            onClick={(event) => {
              event.stopPropagation();
              setFilterModal(null);
            }}
          >
            <section
              className="si-filter-options-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`${modalTitle} filter`}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="si-filter-options-head">
                <h3>{modalTitle}</h3>
                <button
                  className="si-modal-icon-btn si-modal-icon-close"
                  type="button"
                  aria-label="Close"
                  title="Close"
                  onClick={() => setFilterModal(null)}
                >
                  <HiXMark aria-hidden="true" />
                </button>
              </header>
              <div className="si-filter-options-grid">
                <button
                  className={`si-state-chip${isModalAllActive ? " is-active" : ""}`}
                  type="button"
                  onClick={clearModalOption}
                >
                  {modalAllLabel}
                </button>
                {modalOptions.map((option) => (
                  <button
                    className={`si-state-chip${isModalOptionActive(option) ? " is-active" : ""}`}
                    type="button"
                    key={option}
                    onClick={() => selectModalOption(option)}
                  >
                    {formatModalOption(option)}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

type SkeletonInvoiceProps = {
  state: SalesInvoiceState;
  onOpenParty: () => void;
  onOpenOrders: () => void;
  sourceMode: InvoiceSourceMode | null;
  onOpenItems: () => void;
  itemRows: ItemInvoiceRow[];
  onOpenItemPicker: (rowId: number) => void;
  onOpenBatchPicker: (rowId: number) => void;
  onAddItemRow: () => void;
  onRemoveItemRow: (rowId: number) => void;
  itemDraftError: string;
  onReset: () => void;
};

function InvoiceSourceChoice({
  openSalesOrderCount,
  loadingOrders,
  ordersError,
  onChooseSalesOrder,
  onChooseItems,
}: {
  openSalesOrderCount: number;
  loadingOrders: boolean;
  ordersError: string;
  onChooseSalesOrder: () => void;
  onChooseItems: () => void;
}) {
  const salesOrderMeta = loadingOrders
    ? "Loading open sales orders..."
    : ordersError || `${openSalesOrderCount} open sales ${openSalesOrderCount === 1 ? "order" : "orders"}`;

  return (
    <section className="si-source-choice" aria-label="Invoice source">
      <div className="si-source-choice-grid">
        <button className="si-source-card si-source-card-items" type="button" onClick={onChooseItems}>
          <HiArchiveBox className="si-source-card-watermark" aria-hidden="true" />
          <span className="si-source-card-icon" aria-hidden="true">
            <HiArchiveBox />
          </span>
          <strong>Individual Items</strong>
          <span className="si-source-card-copy">Select items directly for this party.</span>
          <em>
            Continue
            <HiArrowRight aria-hidden="true" />
          </em>
        </button>
        <button className="si-source-card si-source-card-orders" type="button" onClick={onChooseSalesOrder}>
          <HiDocumentText className="si-source-card-watermark" aria-hidden="true" />
          <span className="si-source-card-icon" aria-hidden="true">
            <HiDocumentText />
          </span>
          <strong>
            Sales Order
            <small>{salesOrderMeta}</small>
          </strong>
          <span className="si-source-card-copy">Pick open sales orders and continue the existing invoice flow.</span>
          <em>
            Continue
            <HiArrowRight aria-hidden="true" />
          </em>
        </button>
      </div>
    </section>
  );
}

function ItemInvoiceLines({
  rows,
  onOpenItemPicker,
  onOpenBatchPicker,
  onAddRow,
  onRemoveRow,
  draftError,
}: {
  rows: ItemInvoiceRow[];
  onOpenItemPicker: (rowId: number) => void;
  onOpenBatchPicker: (rowId: number) => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: number) => void;
  draftError: string;
}) {
  return (
    <div className="si-item-lines-panel">
      <header className="si-item-source-head">
        <div>
          <span className="si-eyebrow">Individual Items</span>
          <h2>Invoice Lines</h2>
          <p>Select finished goods directly for this invoice.</p>
        </div>
        <div className="si-item-source-actions">
          <button className="si-item-add-btn" type="button" onClick={onAddRow}>
            Add Items
          </button>
        </div>
      </header>
      {draftError && <div className="si-inline-error">{draftError}</div>}
      <div className="si-invoice-line-grid si-individual-item-card-grid">
        {rows.map((row) => {
          const batchQty = row.batch?.batches.reduce((sum, batch) => sum + batch.quantity, 0) || 0;
          const invoiceQty = toFiniteQuantity(row.invoiceQty);
          const batchWarehouse = row.batch?.warehouseCode || "-";
          const availableQty = row.batch ? row.batch.warehouseQuantity : row.item ? getItemTotalQty(row.item) : 0;
          const batchQtyMismatch = Boolean(row.item) && Math.abs(batchQty - invoiceQty) >= 0.0001;

          return (
            <article className="si-invoice-line-card" key={row.id}>
              <div className="si-invoice-item-visual">
                <span />
                <button
                  className="si-invoice-line-remove"
                  type="button"
                  onClick={() => onRemoveRow(row.id)}
                  aria-label={`Remove ${row.item?.ItemName || "item row"}`}
                >
                  <HiTrash aria-hidden="true" />
                </button>
              </div>
              <div className="si-invoice-item-copy">
                <strong>{row.item?.ItemName || "Select an item"}</strong>
                <button className="si-item-card-select-btn" type="button" onClick={() => onOpenItemPicker(row.id)}>
                  {row.item?.ItemCode || "Click to Select Item"}
                </button>
                <dl>
                  <div>
                    <dt>Quantity</dt>
                    <dd>
                      <input value={row.item ? row.invoiceQty : ""} placeholder="Qty" readOnly />
                    </dd>
                  </div>
                  <div>
                    <dt>Unit Price</dt>
                    <dd>{row.item ? formatMoney(pickItemNumber(row.item, ["Price", "UnitPrice", "PriceBefDi"], 0)) : "-"}</dd>
                  </div>
                </dl>
                <button
                  className={`si-batch-select-btn${batchQtyMismatch ? " has-error" : ""}`}
                  type="button"
                  disabled={!row.item}
                  onClick={() => onOpenBatchPicker(row.id)}
                >
                  {row.batch ? (
                    <span>
                      Warehouse: {batchWarehouse} | Available Qty: {availableQty.toLocaleString("en-IN")}
                    </span>
                  ) : (
                    <span>
                      {row.item
                        ? `Warehouse: ${batchWarehouse} | Available Qty: ${availableQty.toLocaleString("en-IN")}`
                        : "Select item first"}
                    </span>
                  )}
                  {batchQtyMismatch && (
                    <strong className="si-batch-select-warning">
                      Batch quantity does not match invoice quantity.
                    </strong>
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function InvoicePageHeader({ onOpenSkuGallery, onReload }: { onOpenSkuGallery: () => void; onReload: () => void }) {
  return (
    <header className="si-page-head">
      <div>
        <span className="si-eyebrow">SAP Billing</span>
        <h1>Sales Invoice</h1>
      </div>
      <div className="si-page-head-actions">
        <button className="si-header-action-btn si-header-action-btn-secondary" type="button" onClick={onReload}>
          <HiArrowPath aria-hidden="true" />
        </button>
        <button className="si-header-action-btn" type="button" onClick={onOpenSkuGallery}>
          <HiPhoto aria-hidden="true" />
          SKU Gallery
        </button>
      </div>
    </header>
  );
}

function InvoiceDocumentStrip({ state }: { state: SalesInvoiceState }) {
  const [postingDateEditable, setPostingDateEditable] = useState(false);
  const updatePostingDate = (postingDate: string) => {
    state.updateForm({
      postingDate,
      dueDate: postingDate,
      documentDate: postingDate,
    });
  };

  return (
    <label className="si-draft-summary-date">
      <span>Posting Date</span>
      <input
        type="date"
        value={state.form.postingDate}
        readOnly={!postingDateEditable}
        className={postingDateEditable ? "si-date-editable" : ""}
        onDoubleClick={(event) => {
          setPostingDateEditable(true);
          window.requestAnimationFrame(() => {
            event.currentTarget.focus();
            event.currentTarget.showPicker?.();
          });
        }}
        onBlur={() => setPostingDateEditable(false)}
        onChange={(event) => updatePostingDate(event.target.value)}
      />
    </label>
  );
}

function ItemPickerModal({
  onClose,
  onBack,
  onSelect,
  selectingItemCode,
}: {
  onClose: () => void;
  onBack: () => void;
  onSelect: (item: FinishedGoodItem) => void | Promise<void>;
  selectingItemCode: string;
}) {
  const [items, setItems] = useState<FinishedGoodItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedSubGroup, setSelectedSubGroup] = useState("");
  const [selectedVariety, setSelectedVariety] = useState("");
  const [selectedPackSize, setSelectedPackSize] = useState("");
  const [filterModal, setFilterModal] = useState<ItemFilterModal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadItems = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<FinishedGoodItem[] | { data?: FinishedGoodItem[]; results?: FinishedGoodItem[] }>(
          "/api/hana/fg-items/",
        );
        const nextItems = Array.isArray(data) ? data : data.data || data.results || [];
        if (active) setItems(nextItems);
      } catch (err) {
        console.error(err);
        if (active) setError("Unable to load finished goods.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadItems();
    return () => {
      active = false;
    };
  }, []);

  const getFilterOptions = (field: keyof FinishedGoodItem, filters: Partial<Record<keyof FinishedGoodItem, string>>) =>
    Object.entries(
      items
        .filter((item) =>
          Object.entries(filters).every(([key, value]) => !value || String(item[key as keyof FinishedGoodItem] || "") === value),
        )
        .reduce<Record<string, number>>((counts, item) => {
          const value = String(item[field] || "").trim();
          if (!value) return counts;
          counts[value] = (counts[value] || 0) + 1;
          return counts;
        }, {}),
    )
      .sort(([optionA, countA], [optionB, countB]) => countB - countA || optionA.localeCompare(optionB))
      .map(([option]) => option);

  const brandOptions = getFilterOptions("U_Brand", {
    U_Sub_Group: selectedSubGroup,
    U_Variety: selectedVariety,
    U_SKU: selectedPackSize,
  });
  const subGroupOptions = getFilterOptions("U_Sub_Group", {
    U_Brand: selectedBrand,
    U_Variety: selectedVariety,
    U_SKU: selectedPackSize,
  });
  const varietyOptions = getFilterOptions("U_Variety", {
    U_Brand: selectedBrand,
    U_Sub_Group: selectedSubGroup,
    U_SKU: selectedPackSize,
  });
  const packSizeOptions = getFilterOptions("U_SKU", {
    U_Brand: selectedBrand,
    U_Sub_Group: selectedSubGroup,
    U_Variety: selectedVariety,
  });

  useEffect(() => {
    if (selectedBrand && !brandOptions.includes(selectedBrand)) setSelectedBrand("");
    if (selectedSubGroup && !subGroupOptions.includes(selectedSubGroup)) setSelectedSubGroup("");
    if (selectedVariety && !varietyOptions.includes(selectedVariety)) setSelectedVariety("");
    if (selectedPackSize && !packSizeOptions.includes(selectedPackSize)) setSelectedPackSize("");
  }, [
    brandOptions,
    packSizeOptions,
    selectedBrand,
    selectedPackSize,
    selectedSubGroup,
    selectedVariety,
    subGroupOptions,
    varietyOptions,
  ]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    const filterMatches =
      (!selectedBrand || item.U_Brand === selectedBrand)
      && (!selectedSubGroup || item.U_Sub_Group === selectedSubGroup)
      && (!selectedVariety || item.U_Variety === selectedVariety)
      && (!selectedPackSize || item.U_SKU === selectedPackSize);
    const queryMatches = !normalizedQuery
      || [item.ItemCode, item.ItemName, item.U_Brand, item.U_Variety, item.U_Sub_Group, item.U_SKU]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    return filterMatches && queryMatches;
  });

  const clearItemFilters = () => {
    setSelectedBrand("");
    setSelectedSubGroup("");
    setSelectedVariety("");
    setSelectedPackSize("");
  };

  const itemFilterConfig: Record<ItemFilterModal, {
    allLabel: string;
    options: string[];
    selectedValue: string;
    setSelectedValue: (value: string) => void;
    title: string;
  }> = {
    brand: {
      allLabel: "All brands",
      options: brandOptions,
      selectedValue: selectedBrand,
      setSelectedValue: setSelectedBrand,
      title: "Select Brand",
    },
    subGroup: {
      allLabel: "All sub groups",
      options: subGroupOptions,
      selectedValue: selectedSubGroup,
      setSelectedValue: setSelectedSubGroup,
      title: "Select Sub Group",
    },
    variety: {
      allLabel: "All varieties",
      options: varietyOptions,
      selectedValue: selectedVariety,
      setSelectedValue: setSelectedVariety,
      title: "Select Variety",
    },
    packSize: {
      allLabel: "All pack sizes",
      options: packSizeOptions,
      selectedValue: selectedPackSize,
      setSelectedValue: setSelectedPackSize,
      title: "Select Pack Size",
    },
  };
  const activeFilterConfig = filterModal ? itemFilterConfig[filterModal] : null;
  const selectItemFilterModalOption = (option: string) => {
    activeFilterConfig?.setSelectedValue(option);
    setFilterModal(null);
  };
  const clearItemFilterModalOption = () => {
    activeFilterConfig?.setSelectedValue("");
    setFilterModal(null);
  };

  const renderFilterChips = (
    filterKey: ItemFilterModal,
    label: string,
    allLabel: string,
    options: string[],
    selectedValue: string,
    setSelectedValue: (value: string) => void,
  ) => {
    const visibleOptions = options.slice(0, 6);
    const hiddenCount = Math.max(options.length - visibleOptions.length, 0);

    return (
      <div className="si-party-state-filters" aria-label={`${label} filters`}>
        <span className="si-item-filter-label">{label}</span>
        <button
          className={`si-state-chip${!selectedValue ? " is-active" : ""}`}
          type="button"
          onClick={() => setSelectedValue("")}
        >
          {allLabel}
        </button>
        {visibleOptions.map((option) => (
          <button
            className={`si-state-chip${selectedValue === option ? " is-active" : ""}`}
            type="button"
            key={option}
            onClick={() => setSelectedValue(option)}
          >
            {option}
          </button>
        ))}
        {hiddenCount > 0 && (
          <button className="si-state-chip si-state-chip-more" type="button" onClick={() => setFilterModal(filterKey)}>
            More +{hiddenCount}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="si-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="si-so-modal si-item-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Select finished good item"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="si-so-modal-head">
          <div>
            <span className="si-eyebrow">Finished Goods</span>
            <h2>Select Item</h2>
            <p>{loading ? "Loading items..." : `${filteredItems.length} items`}</p>
          </div>
          <div className="si-modal-head-actions">
            <button
              className="si-modal-icon-btn si-modal-icon-back"
              type="button"
              aria-label="Back"
              title="Back"
              onClick={onBack}
            >
              <HiChevronLeft aria-hidden="true" />
            </button>
            <button
              className="si-modal-icon-btn si-modal-icon-close"
              type="button"
              aria-label="Close"
              title="Close"
              onClick={onClose}
            >
              <HiXMark aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="si-item-picker-body">
          <aside className="si-item-filter-panel">
            {renderFilterChips("brand", "Brand", "All brands", brandOptions, selectedBrand, setSelectedBrand)}
            {renderFilterChips(
              "subGroup",
              "Sub Group",
              "All sub groups",
              subGroupOptions,
              selectedSubGroup,
              setSelectedSubGroup,
            )}
            {renderFilterChips(
              "variety",
              "Variety",
              "All varieties",
              varietyOptions,
              selectedVariety,
              setSelectedVariety,
            )}
            {renderFilterChips(
              "packSize",
              "Pack Size",
              "All pack sizes",
              packSizeOptions,
              selectedPackSize,
              setSelectedPackSize,
            )}
            {(selectedBrand || selectedSubGroup || selectedVariety || selectedPackSize) && (
              <button className="si-btn si-btn-outline" type="button" onClick={clearItemFilters}>
                Clear filters
              </button>
            )}
          </aside>

          <section className="si-item-results-panel">
            <input
              className="si-search-input si-item-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search item name, code, brand, variety, group or SKU"
              autoFocus
            />
            {error && <div className="si-inline-error">{error}</div>}
            {loading ? (
              <div className="si-loader">Loading finished goods...</div>
            ) : filteredItems.length === 0 ? (
              <div className="si-empty">No items found.</div>
            ) : (
              <div className="si-item-picker-results" aria-label="Finished goods">
                {filteredItems.map((item) => (
                  <button
                    className="si-item-picker-row"
                    key={item.ItemCode}
                    type="button"
                    disabled={selectingItemCode === item.ItemCode}
                    onClick={() => onSelect(item)}
                  >
                    <strong>{item.ItemName}</strong>
                    <small className="si-item-qty-count">
                      {selectingItemCode === item.ItemCode
                        ? "Fetching price..."
                        : `Qty: ${getItemTotalQty(item).toLocaleString("en-IN")}`}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {activeFilterConfig && (
          <div
            className="si-nested-modal-backdrop"
            role="presentation"
            onClick={(event) => {
              event.stopPropagation();
              setFilterModal(null);
            }}
          >
            <section
              className="si-filter-options-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`${activeFilterConfig.title} filter`}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="si-filter-options-head">
                <h3>{activeFilterConfig.title}</h3>
                <button
                  className="si-modal-icon-btn si-modal-icon-close"
                  type="button"
                  aria-label="Close"
                  title="Close"
                  onClick={() => setFilterModal(null)}
                >
                  <HiXMark aria-hidden="true" />
                </button>
              </header>
              <div className="si-filter-options-grid">
                <button
                  className={`si-state-chip${!activeFilterConfig.selectedValue ? " is-active" : ""}`}
                  type="button"
                  onClick={clearItemFilterModalOption}
                >
                  {activeFilterConfig.allLabel}
                </button>
                {activeFilterConfig.options.map((option) => (
                  <button
                    className={`si-state-chip${activeFilterConfig.selectedValue === option ? " is-active" : ""}`}
                    type="button"
                    key={option}
                    onClick={() => selectItemFilterModalOption(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

const formatBatchDate = (value?: string | null) => {
  if (!value) return "-";
  const dateOnly = value.split("T")[0]?.split(" ")[0] || value;
  const [year, month, day] = dateOnly.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
};

const toFiniteQuantity = (value: unknown, fallback = 1) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getBatchSortTime = (batch: BatchDetail) => {
  const expTime = batch.ExpDate ? new Date(batch.ExpDate).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isFinite(expTime)) return expTime;
  const inTime = batch.InDate ? new Date(batch.InDate).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(inTime) ? inTime : Number.POSITIVE_INFINITY;
};

const allocateFefoBatches = (batches: BatchDetail[], requiredQty: number) => {
  let remainingQty = toFiniteQuantity(requiredQty);
  const allocations: SelectedBatch["batches"] = [];

  [...batches]
    .filter((batch) => Number(batch.Quantity || 0) > 0)
    .sort((batchA, batchB) => getBatchSortTime(batchA) - getBatchSortTime(batchB))
    .some((batch) => {
      const quantity = Math.min(remainingQty, Number(batch.Quantity || 0));
      if (quantity > 0) {
        allocations.push({ batch, quantity });
        remainingQty -= quantity;
      }
      return remainingQty <= 0;
    });

  return allocations;
};

const pickItemNumber = (item: FinishedGoodItem, keys: string[], fallback = 0) => {
  const source = item as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const pickRecordNumber = (source: Record<string, unknown>, keys: string[], fallback: number | null = null) => {
  for (const key of keys) {
    const parsed = Number(source[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const pickRecordText = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
};

const unwrapItemPriceRecord = (data: ItemPriceApiResponse): ItemPriceRecord | null => {
  if (Array.isArray(data)) return data[0] || null;
  const wrappedData = data.data;
  if (Array.isArray(wrappedData)) return wrappedData[0] || null;
  if (wrappedData && typeof wrappedData === "object") return wrappedData as ItemPriceRecord;
  const wrappedResults = data.results;
  if (Array.isArray(wrappedResults)) return wrappedResults[0] || null;
  if (wrappedResults && typeof wrappedResults === "object") return wrappedResults as ItemPriceRecord;
  return data as ItemPriceRecord;
};

const mergeItemPrice = (item: FinishedGoodItem, priceRecord: ItemPriceRecord | null) => {
  if (!priceRecord) return item;
  const source = priceRecord as Record<string, unknown>;
  const price = pickRecordNumber(source, ["Price", "UnitPrice", "Unit_Price", "price", "Rate"]);
  const priceBeforeDiscount = pickRecordNumber(
    source,
    ["PriceBefDi", "PriceBeforeDiscount", "Price_Bef_Di", "Price", "UnitPrice", "price"],
    price,
  );
  const taxCode = pickRecordText(source, ["TaxCode", "VatGroup", "Tax_Code"]);
  const taxPercent = pickRecordNumber(source, ["VatPrcnt", "TaxPercent", "Tax_Percent"]);
  const discountPercent = pickRecordNumber(source, ["DiscPrcnt", "DiscountPercent", "Discount_Percent"]);

  return {
    ...item,
    ...(price !== null ? { Price: price, UnitPrice: price } : {}),
    ...(priceBeforeDiscount !== null ? { PriceBefDi: priceBeforeDiscount } : {}),
    ...(taxCode ? { TaxCode: taxCode, VatGroup: taxCode } : {}),
    ...(taxPercent !== null ? { VatPrcnt: taxPercent } : {}),
    ...(discountPercent !== null ? { DiscPrcnt: discountPercent } : {}),
  };
};

const pickItemText = (item: FinishedGoodItem, keys: string[]) => {
  const source = item as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
};

const getBatchDateTokens = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return new Set<string>();

  const tokens = new Set([text.toLowerCase().replace(/[^a-z0-9]/g, "")]);
  const dateOnly = text.split("T")[0]?.split(" ")[0] || text;
  const parts = dateOnly.split(/[/-]/).map((part) => part.trim()).filter(Boolean);

  if (parts.length === 3) {
    const [first, second, third] = parts;
    const year = first.length === 4 ? first : third;
    const month = second.padStart(2, "0");
    const day = first.length === 4 ? third.padStart(2, "0") : first.padStart(2, "0");

    if (year.length === 4) {
      tokens.add(`${year}${month}${day}`);
      tokens.add(`${day}${month}${year}`);
    }
  }

  return tokens;
};

const isBatchDateValue = (value: string, batch: BatchDetail) => {
  const candidateTokens = getBatchDateTokens(value);
  const dateTokens = [batch.ExpDate, batch.PrdDate, batch.InDate].reduce<Set<string>>((tokens, dateValue) => {
    getBatchDateTokens(dateValue).forEach((token) => tokens.add(token));
    return tokens;
  }, new Set());

  return [...candidateTokens].some((token) => token && dateTokens.has(token));
};

const getBatchNumber = (batch: BatchDetail) => {
  const source = batch as Record<string, unknown>;
  const candidateKeys = [
    "BatchNumber",
    "DistNumber",
    "BatchNo",
    "BatchCode",
    "BatchID",
    "BatchId",
    "Batch",
    "LotNumber",
    "BatchNum",
    "MnfSerial",
    "InternalSerialNumber",
    "SerialNumber",
  ];

  let dateLikeFallback = "";
  for (const key of candidateKeys) {
    const value = String(source[key] ?? "").trim();
    if (!value) continue;
    if (!isBatchDateValue(value, batch)) return value;
    if (!dateLikeFallback) dateLikeFallback = value;
  }

  // Some batches are legitimately named after a date (e.g. "06/06/2026").
  // Prefer a non-date identifier, but never drop the batch number entirely.
  return dateLikeFallback;
};

const getBatchSystemSerialNumber = (batch: BatchDetail) => {
  const value = batch.SystemSerialNumber ?? batch.SysNumber ?? batch.AbsEntry;
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
};

const getItemRowsValidationError = (rows: ItemInvoiceRow[]) => {
  const selectedRows = rows.filter((row) => row.item);
  if (selectedRows.length === 0) return "Select at least one item.";

  const rowWithoutBatch = selectedRows.find((row) => !row.batch?.warehouseCode || row.batch.batches.length === 0);
  if (rowWithoutBatch) return `Choose batches for ${rowWithoutBatch.item?.ItemName || "every selected item"}.`;

  const mismatchedRow = selectedRows.find((row) => {
    const invoiceQty = toFiniteQuantity(row.invoiceQty);
    const batchQty = row.batch?.batches.reduce((sum, allocation) => sum + allocation.quantity, 0) || 0;
    const displayedBatchQty = row.batch?.warehouseQuantity || batchQty;
    return displayedBatchQty + 0.0001 < invoiceQty || batchQty + 0.0001 < invoiceQty;
  });
  if (mismatchedRow) return `Batch quantity must be at least invoice quantity for ${mismatchedRow.item?.ItemName || "each item"}.`;

  return "";
};

const itemRowsToSelectedLines = (rows: ItemInvoiceRow[]): SelectedLine[] =>
  rows
    .filter((row): row is ItemInvoiceRow & { item: FinishedGoodItem; batch: SelectedBatch } =>
      Boolean(row.item && row.batch),
    )
    .map((row) => {
      const invoiceQty = toFiniteQuantity(row.invoiceQty);
      const price = pickItemNumber(row.item, ["Price", "UnitPrice", "U_Price", "PriceBefDi"], 0);
      const priceBeforeDiscount = pickItemNumber(row.item, ["PriceBefDi", "PriceBeforeDiscount", "Price"], price);
      const taxCode = pickItemText(row.item, ["TaxCode", "VatGroup", "Tax_Code"]);
      const openQty = Math.max(row.batch.warehouseQuantity || invoiceQty, invoiceQty);

      return {
        SourceType: "items",
        DocEntry: -1,
        DocNum: 0,
        LineNum: row.id,
        ItemCode: row.item.ItemCode,
        Dscription: row.item.ItemName,
        OpenQty: openQty,
        Price: price,
        PriceBefDi: priceBeforeDiscount,
        DiscPrcnt: pickItemNumber(row.item, ["DiscPrcnt", "DiscountPercent"], 0),
        VatPrcnt: pickItemNumber(row.item, ["VatPrcnt", "TaxPercent"], 0),
        TaxCode: taxCode,
        WhsCode: row.batch.warehouseCode,
        invoiceQty,
        BatchNumbers: row.batch.batches
          .map(({ batch, quantity }) => {
            const systemSerialNumber = getBatchSystemSerialNumber(batch);
            const batchNumber = getBatchNumber(batch);
            return {
              ...(batchNumber ? { BatchNumber: batchNumber } : {}),
              ...(systemSerialNumber !== undefined ? { SystemSerialNumber: systemSerialNumber } : {}),
              Quantity: quantity,
            };
          })
          .filter((batch) => (batch.BatchNumber || batch.SystemSerialNumber !== undefined) && batch.Quantity > 0),
      };
    });

function BatchPickerModal({
  item,
  invoiceQty,
  selectedBatch,
  onBack,
  onClose,
  onSelect,
  onQuantityChange,
  onCreateDraft,
  canCreateDraft,
  creatingDraft,
  draftError,
}: {
  item: FinishedGoodItem;
  invoiceQty: number;
  selectedBatch: SelectedBatch | null;
  onBack: () => void;
  onClose: () => void;
  onSelect: (batch: SelectedBatch) => void;
  onQuantityChange: (quantity: number) => void;
  onCreateDraft: () => void;
  canCreateDraft: boolean;
  creatingDraft: boolean;
  draftError: string;
}) {
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [selectedWhsCode, setSelectedWhsCode] = useState(selectedBatch?.warehouseCode || "");
  const [batches, setBatches] = useState<BatchDetail[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [error, setError] = useState("");
  const lastAppliedBatchSignature = useRef("");

  useEffect(() => {
    let active = true;

    const loadWarehouses = async () => {
      setLoadingWarehouses(true);
      setError("");
      try {
        const data = await apiFetch<InventoryWarehouse[]>(
          `/api/hana/inventory-details/?item_code=${encodeURIComponent(item.ItemCode)}`,
        );
        const nextWarehouses = Array.isArray(data) ? data : [];
        if (!active) return;
        setWarehouses(nextWarehouses);
        setSelectedWhsCode((current) =>
          current && nextWarehouses.some((warehouse) => warehouse.WhsCode === current) ? current : "",
        );
      } catch (err) {
        console.error(err);
        if (active) {
          setWarehouses([]);
          setError("Unable to load warehouse quantities.");
        }
      } finally {
        if (active) setLoadingWarehouses(false);
      }
    };

    loadWarehouses();
    return () => {
      active = false;
    };
  }, [item.ItemCode]);

  useEffect(() => {
    if (!selectedWhsCode) {
      setBatches([]);
      return;
    }

    let active = true;

    const loadBatches = async () => {
      setLoadingBatches(true);
      setError("");
      try {
        const data = await apiFetch<BatchDetail[]>(
          `/api/hana/batch-details/?item_code=${encodeURIComponent(item.ItemCode)}&whs_code=${encodeURIComponent(selectedWhsCode)}`,
        );
        if (active) setBatches(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        if (active) {
          setBatches([]);
          setError("Unable to load batches for this warehouse.");
        }
      } finally {
        if (active) setLoadingBatches(false);
      }
    };

    loadBatches();
    return () => {
      active = false;
    };
  }, [item.ItemCode, selectedWhsCode]);

  const selectedWarehouse = warehouses.find((warehouse) => warehouse.WhsCode === selectedWhsCode) || null;
  const selectedWarehouseQuantity = Number(selectedWarehouse?.["SUM(Quantity)"] || 0);
  const unitPrice = pickItemNumber(item, ["Price", "UnitPrice", "PriceBefDi"], 0);
  const allocations = allocateFefoBatches(batches, invoiceQty);
  const allocatedQty = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
  const displayedBatchQty = selectedWarehouseQuantity || allocatedQty;
  const batchAllocationMatches = allocatedQty + 0.0001 >= invoiceQty;
  const quantityMatches = selectedWarehouseQuantity > 0
    && selectedWarehouseQuantity + 0.0001 >= invoiceQty
    && batchAllocationMatches;
  const cannotCreateDraft = !quantityMatches || !canCreateDraft || creatingDraft || loadingBatches || loadingWarehouses;
  const batchSignature = `${selectedWhsCode}|${invoiceQty}|${allocations
    .map((allocation) => `${allocation.batch.BatchNum}:${allocation.quantity}`)
    .join("|")}`;

  useEffect(() => {
    if (!selectedWhsCode || loadingBatches || batches.length === 0) return;
    if (lastAppliedBatchSignature.current === batchSignature) return;
    lastAppliedBatchSignature.current = batchSignature;
    onSelect({
      warehouseCode: selectedWhsCode,
      warehouseQuantity: selectedWarehouseQuantity,
      batches: allocations,
    });
  }, [batchSignature, batches.length, loadingBatches, selectedWarehouseQuantity, selectedWhsCode]);

  return (
    <div className="si-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="si-so-modal si-batch-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose item batch"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="si-so-modal-head">
          <div>
            <span className="si-eyebrow">Batch Selection</span>
            <h2>{item.ItemCode}</h2>
            <p>{item.ItemName}</p>
          </div>
          <div className="si-modal-head-actions">
            <button
              className="si-modal-icon-btn si-modal-icon-back"
              type="button"
              aria-label="Back"
              title="Back"
              onClick={onBack}
            >
              <HiChevronLeft aria-hidden="true" />
            </button>
            <button
              className="si-modal-icon-btn si-modal-icon-close"
              type="button"
              aria-label="Close"
              title="Close"
              onClick={onClose}
            >
              <HiXMark aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="si-batch-picker-body">
          <aside className="si-batch-warehouse-panel">
            <div className="si-batch-panel-title">
              <span>Warehouse Stock</span>
              <strong>{loadingWarehouses ? "Loading..." : `${warehouses.length} warehouses`}</strong>
            </div>
            {loadingWarehouses ? (
              <div className="si-loader">Loading warehouse quantities...</div>
            ) : warehouses.length === 0 ? (
              <div className="si-empty">No warehouse stock found.</div>
            ) : (
              <div className="si-batch-warehouse-list">
                {warehouses.map((warehouse) => {
                  const quantity = Number(warehouse["SUM(Quantity)"] || 0);
                  return (
                    <button
                      className={`si-warehouse-option${selectedWhsCode === warehouse.WhsCode ? " is-active" : ""}`}
                      type="button"
                      key={warehouse.WhsCode}
                      onClick={() => setSelectedWhsCode(warehouse.WhsCode)}
                    >
                      <span>{warehouse.WhsCode}</span>
                      <strong>{quantity.toLocaleString("en-IN")}</strong>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <section className="si-batch-list-panel">
            <div className="si-batch-panel-title">
              <span>Batches</span>
              <strong>{selectedWhsCode || "Select warehouse"}</strong>
            </div>
            <label className="si-batch-quantity-field">
              <span>Invoice Quantity</span>
              <input
                type="number"
                min="1"
                value={invoiceQty}
                onChange={(event) => onQuantityChange(toFiniteQuantity(event.target.value))}
              />
            </label>
            <div className="si-batch-price-field">
              <span>Unit Price</span>
              <strong>{formatMoney(unitPrice)}</strong>
            </div>
            <div className={`si-batch-match-status${quantityMatches ? " is-match" : " has-error"}`}>
              <span>
                Invoice Qty: {invoiceQty.toLocaleString("en-IN")} | Batch Qty: {displayedBatchQty.toLocaleString("en-IN")}
              </span>
            </div>
            {error && <div className="si-inline-error">{error}</div>}
            {draftError && <div className="si-inline-error">{draftError}</div>}
            {!selectedWhsCode ? (
              <div className="si-empty">Select a warehouse to view batches.</div>
            ) : loadingBatches ? (
              <div className="si-loader">Loading batches...</div>
            ) : batches.length === 0 ? (
              <div className="si-empty">No batches found for this warehouse.</div>
            ) : (
              <div className="si-table-wrap">
                <table className="si-lines-table si-batch-table">
                  <thead>
                    <tr>
                      <th>Expiration Date</th>
                      <th>Batch Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => {
                      return (
                        <tr
                          key={`${batch.BatchNum}-${batch.BaseEntry || ""}-${batch.InDate || ""}`}
                        >
                          <td>{formatBatchDate(batch.ExpDate)}</td>
                          <td>{Number(batch.Quantity || 0).toLocaleString("en-IN")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <footer className={`si-order-selection-bar si-batch-draft-bar${draftError ? " has-error" : ""}`}>
          <div>
            <strong>{item.ItemName}</strong>
            <span>
              Warehouse: {selectedWhsCode || "-"} - Invoice Qty: {invoiceQty.toLocaleString("en-IN")} - Batch Qty:{" "}
              {displayedBatchQty.toLocaleString("en-IN")}
            </span>
            {draftError && <span className="si-order-selection-error">{draftError}</span>}
          </div>
          <button
            className="si-btn si-btn-primary si-order-selection-next"
            type="button"
            disabled={cannotCreateDraft}
            onClick={onCreateDraft}
          >
            {creatingDraft ? "Creating..." : "Create Draft"}
            <HiArrowRight aria-hidden="true" />
          </button>
        </footer>
      </section>
    </div>
  );
}

function SkeletonInvoice({
  state,
  onOpenParty,
  onOpenOrders,
  sourceMode,
  onOpenItems,
  itemRows,
  onOpenItemPicker,
  onOpenBatchPicker,
  onAddItemRow,
  onRemoveItemRow,
  itemDraftError,
  onReset,
}: SkeletonInvoiceProps) {
  const partyLabel = state.selectedParty
    ? state.selectedParty.CardName
    : "Select Party";

  return (
    <div className="si-draft-stage">
      <section className="si-card si-draft-party-card si-draft-summary-card si-skeleton-party-card">
        <div className="si-draft-party-name-cell">
          <span>Party Name</span>
          {state.selectedParty ? (
            <strong>{partyLabel}</strong>
          ) : (
            <button className="si-draft-party-select-btn" type="button" onClick={onOpenParty}>
              {partyLabel}
            </button>
          )}
          <div className="si-draft-summary-actions">
            {state.selectedParty && sourceMode === "sales-order" && (
              <button className="si-btn si-btn-primary" type="button" onClick={onOpenOrders}>
                Select Open SO ({state.salesOrders.length})
              </button>
            )}
            {state.selectedParty && sourceMode === "items" && (
              <button className="si-btn si-btn-primary" type="button" onClick={onOpenItems}>
                Add Items
              </button>
            )}
            {state.selectedParty && (
              <button className="si-draft-change-party-btn" type="button" onClick={onReset}>
                Change Party
              </button>
            )}
          </div>
        </div>
        <InvoiceDocumentStrip state={state} />
      </section>

      <section className="si-card si-tabs-card si-skeleton-lines">
        {sourceMode !== "items" && (
          <div className="si-table-wrap">
            <table className="si-lines-table">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Tax Code</th>
                  <th>Line Total</th>
                </tr>
              </thead>
            </table>
          </div>
        )}
        {!state.selectedParty && <div className="si-empty">Select a party to begin.</div>}
        {state.selectedParty && !sourceMode && <div className="si-empty">Choose invoice source from the modal window.</div>}
        {state.selectedParty && sourceMode === "sales-order" && (
          <div className="si-empty">Select open sales orders to fill invoice lines.</div>
        )}
        {state.selectedParty && sourceMode === "items" && (
          <ItemInvoiceLines
            rows={itemRows}
            onOpenItemPicker={onOpenItemPicker}
            onOpenBatchPicker={onOpenBatchPicker}
            onAddRow={onAddItemRow}
            onRemoveRow={onRemoveItemRow}
            draftError={itemDraftError}
          />
        )}
      </section>
    </div>
  );
}

export default function SalesInvoiceWizard() {
  const state = useSalesInvoice();
  const navigate = useNavigate();
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [itemPickerRowId, setItemPickerRowId] = useState<number | null>(null);
  const [batchPickerRowId, setBatchPickerRowId] = useState<number | null>(null);
  const [sourceMode, setSourceMode] = useState<InvoiceSourceMode | null>(null);
  const [itemRows, setItemRows] = useState<ItemInvoiceRow[]>([{ id: 1, type: "Item", item: null, invoiceQty: 1, batch: null }]);
  const [itemDraftError, setItemDraftError] = useState("");
  const [creatingItemDraft, setCreatingItemDraft] = useState(false);
  const [pricingItemCode, setPricingItemCode] = useState("");

  useEffect(() => {
    if (sourceMode === "sales-order" && state.selectedParty && state.step === 2 && !state.customerDetails) {
      setOrdersModalOpen(true);
    }
  }, [sourceMode, state.customerDetails, state.selectedParty, state.step]);

  const openOrdersModal = () => {
    if (!state.selectedParty) return;
    setSourceMode("sales-order");
    setItemDraftError("");
    setSourceModalOpen(false);
    setItemPickerRowId(null);
    setBatchPickerRowId(null);
    setOrdersModalOpen(true);
  };

  const getNextAddItemRowId = () => {
    const emptyRow = itemRows.find((row) => !row.item);
    return emptyRow?.id || Math.max(0, ...itemRows.map((row) => row.id)) + 1;
  };

  const chooseItems = () => {
    if (!state.selectedParty) return;
    closeOrdersModal();
    setSourceMode("items");
    setItemDraftError("");
    setSourceModalOpen(false);
    state.loadPartyAddresses();
    setItemPickerRowId(getNextAddItemRowId());
  };

  const openItemsModal = () => {
    if (!state.selectedParty) return;
    setSourceMode("items");
    setItemDraftError("");
    setItemPickerRowId(getNextAddItemRowId());
  };

  const closeOrdersModal = () => {
    setOrdersModalOpen(false);
  };

  const closeSourceModal = () => {
    setSourceModalOpen(false);
  };

  const closeItemPicker = () => {
    setItemPickerRowId(null);
  };

  const closeBatchPicker = () => {
    setBatchPickerRowId(null);
  };

  const openPartyModal = () => {
    setPartyModalOpen(true);
  };

  const closePartyModal = () => {
    setPartyModalOpen(false);
  };

  const resetInvoiceFlow = () => {
    closePartyModal();
    closeOrdersModal();
    closeSourceModal();
    closeItemPicker();
    closeBatchPicker();
    setSourceMode(null);
    setItemRows([{ id: 1, type: "Item", item: null, invoiceQty: 1, batch: null }]);
    setItemDraftError("");
    setCreatingItemDraft(false);
    setPricingItemCode("");
    state.changeParty();
    setPartyModalOpen(true);
  };

  const createDraftFromSelectedOrders = async () => {
    const ok = await state.proceedToDraft();
    if (ok) closeOrdersModal();
  };

  const backToPartyModal = () => {
    closeOrdersModal();
    closeSourceModal();
    closeItemPicker();
    closeBatchPicker();
    setSourceMode(null);
    setPartyModalOpen(true);
  };

  const addItemRow = () => {
    setItemDraftError("");
    setItemPickerRowId(getNextAddItemRowId());
  };

  const removeItemRow = (rowId: number) => {
    setItemDraftError("");
    setItemRows((current) => {
      const nextRows = current.filter((row) => row.id !== rowId);
      return nextRows.length > 0 ? nextRows : [{ id: 1, type: "Item", item: null, invoiceQty: 1, batch: null }];
    });
    setItemPickerRowId((current) => (current === rowId ? null : current));
    setBatchPickerRowId((current) => (current === rowId ? null : current));
  };

  const openBatchPicker = (rowId: number) => {
    const row = itemRows.find((itemRow) => itemRow.id === rowId);
    if (!row?.item) return;
    setBatchPickerRowId(rowId);
  };

  const fetchItemWithCustomerPrice = async (item: FinishedGoodItem) => {
    const priceList = toFiniteQuantity(state.selectedParty?.ListNum, 1);
    const data = await apiFetch<ItemPriceApiResponse>(
      `/api/hana/item-price/?item_code=${encodeURIComponent(item.ItemCode)}&price_list=${encodeURIComponent(String(priceList))}`,
    );
    return mergeItemPrice(item, unwrapItemPriceRecord(data));
  };

  const selectItemForRow = async (item: FinishedGoodItem) => {
    if (itemPickerRowId === null || pricingItemCode) return;
    const rowId = itemPickerRowId;
    setItemDraftError("");
    setPricingItemCode(item.ItemCode);

    let pricedItem: FinishedGoodItem;
    try {
      pricedItem = await fetchItemWithCustomerPrice(item);
    } catch (err) {
      console.error(err);
      setItemDraftError(`Unable to load item price for ${item.ItemCode}.`);
      setPricingItemCode("");
      return;
    }

    setItemRows((current) => {
      const existingRow = current.find((row) => row.id === rowId);
      if (!existingRow) return [...current, { id: rowId, type: "Item", item: pricedItem, invoiceQty: 1, batch: null }];
      return current.map((row) =>
        row.id === rowId ? { ...row, item: pricedItem, invoiceQty: row.invoiceQty || 1, batch: null } : row,
      );
    });
    setPricingItemCode("");
    closeItemPicker();
    setBatchPickerRowId(rowId);
  };

  const selectBatchForRow = (batch: SelectedBatch) => {
    if (batchPickerRowId === null) return;
    setItemDraftError("");
    setItemRows((current) => current.map((row) => (row.id === batchPickerRowId ? { ...row, batch } : row)));
  };

  const itemRowsValidationError = getItemRowsValidationError(itemRows);
  const createDraftFromItems = async () => {
    const validationError = getItemRowsValidationError(itemRows);
    if (validationError) {
      setItemDraftError(validationError);
      return;
    }

    setCreatingItemDraft(true);
    setItemDraftError("");
    try {
      const ok = await state.proceedToDraftFromItems(itemRowsToSelectedLines(itemRows));
      if (ok) {
        closeItemPicker();
        closeBatchPicker();
      } else {
        setItemDraftError("Unable to create draft from selected items.");
      }
    } finally {
      setCreatingItemDraft(false);
    }
  };

  const showOrdersModal = Boolean(state.selectedParty) && ordersModalOpen;
  const showSourceModal = Boolean(state.selectedParty) && sourceModalOpen;
  const showItemPickerModal = Boolean(state.selectedParty) && itemPickerRowId !== null;
  const batchPickerRow = itemRows.find((row) => row.id === batchPickerRowId) || null;
  const showBatchPickerModal = Boolean(state.selectedParty && batchPickerRow?.item);
  const showDraft = Boolean(state.selectedParty && state.step === 4);
  const openSalesOrderCount = state.salesOrders.length;

  return (
    <div className="si-page">
      <InvoicePageHeader
        onReload={() => window.location.reload()}
        onOpenSkuGallery={() => navigate("/Sales_Invoice/SKU_Images")}
      />

      {!showDraft && (
        <SkeletonInvoice
          state={state}
          onOpenParty={openPartyModal}
          onOpenOrders={openOrdersModal}
          sourceMode={sourceMode}
          onOpenItems={openItemsModal}
          itemRows={itemRows}
          onOpenItemPicker={setItemPickerRowId}
          onOpenBatchPicker={openBatchPicker}
          onAddItemRow={addItemRow}
          onRemoveItemRow={removeItemRow}
          itemDraftError={itemDraftError || state.draftError}
          onReset={resetInvoiceFlow}
        />
      )}

      {showDraft && (
        <DraftStep
          state={state}
          onReset={resetInvoiceFlow}
          onAddItems={sourceMode === "items" ? openItemsModal : undefined}
        />
      )}

      {partyModalOpen && (
        <PartyPickerModal
          state={state}
          onClose={closePartyModal}
          onSelect={() => {
            setSourceMode(null);
            closePartyModal();
            setSourceModalOpen(true);
          }}
        />
      )}

      {showSourceModal && (
        <div className="si-modal-backdrop" role="presentation" onClick={closeSourceModal}>
          <section
            className="si-source-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose invoice source"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="si-so-modal-head">
              <div>
                <span className="si-eyebrow">Invoice Against</span>
                <h2>{state.selectedParty?.CardName}</h2>
                <p>{state.selectedParty?.CardCode}</p>
              </div>
              <div className="si-modal-head-actions">
                <button
                  className="si-modal-icon-btn si-modal-icon-back"
                  type="button"
                  aria-label="Back"
                  title="Back"
                  onClick={backToPartyModal}
                >
                  <HiChevronLeft aria-hidden="true" />
                </button>
                <button
                  className="si-modal-icon-btn si-modal-icon-close"
                  type="button"
                  aria-label="Close"
                  title="Close"
                  onClick={closeSourceModal}
                >
                  <HiXMark aria-hidden="true" />
                </button>
              </div>
            </header>
            <InvoiceSourceChoice
              openSalesOrderCount={openSalesOrderCount}
              loadingOrders={state.loadingOrders}
              ordersError={state.ordersError}
              onChooseSalesOrder={openOrdersModal}
              onChooseItems={chooseItems}
            />
          </section>
        </div>
      )}

      {showOrdersModal && (
        <div className="si-modal-backdrop" role="presentation" onClick={closeOrdersModal}>
          <section
            className="si-so-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Select open sales orders"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="si-so-modal-head">
              <div>
                <span className="si-eyebrow">Open Sales Orders</span>
                <h2>{state.selectedParty?.CardName}</h2>
                <p>
                  {state.selectedParty?.CardCode} - {openSalesOrderCount} open sales{" "}
                  {openSalesOrderCount === 1 ? "order" : "orders"}
                </p>
              </div>
              <div className="si-modal-head-actions">
                <button
                  className="si-modal-icon-btn si-modal-icon-back"
                  type="button"
                  aria-label="Back"
                  title="Back"
                  onClick={backToPartyModal}
                >
                  <HiChevronLeft aria-hidden="true" />
                </button>
                <button
                  className="si-modal-icon-btn si-modal-icon-close"
                  type="button"
                  aria-label="Close"
                  title="Close"
                  onClick={closeOrdersModal}
                >
                  <HiXMark aria-hidden="true" />
                </button>
              </div>
            </header>
            <OrdersStep
              state={state}
              continueLabel="Create Draft"
              continueLoadingLabel="Creating draft..."
              onContinue={createDraftFromSelectedOrders}
            />
          </section>
        </div>
      )}

      {showItemPickerModal && (
        <ItemPickerModal
          onBack={closeItemPicker}
          onClose={closeItemPicker}
          onSelect={selectItemForRow}
          selectingItemCode={pricingItemCode}
        />
      )}

      {showBatchPickerModal && batchPickerRow?.item && (
        <BatchPickerModal
          item={batchPickerRow.item}
          invoiceQty={batchPickerRow.invoiceQty}
          selectedBatch={batchPickerRow.batch}
          onBack={() => {
            closeBatchPicker();
            setItemPickerRowId(batchPickerRow.id);
          }}
          onClose={closeBatchPicker}
          onSelect={selectBatchForRow}
          onQuantityChange={(quantity) => {
            const nextQuantity = toFiniteQuantity(quantity);
            setItemDraftError("");
            setItemRows((current) =>
              current.map((row) =>
                row.id === batchPickerRow.id ? { ...row, invoiceQty: nextQuantity, batch: null } : row,
              ),
            );
          }}
          onCreateDraft={createDraftFromItems}
          canCreateDraft={!itemRowsValidationError}
          creatingDraft={creatingItemDraft}
          draftError={itemDraftError || state.draftError}
        />
      )}
    </div>
  );
}
