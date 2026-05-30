import { useEffect, useMemo, useState } from "react";
import { HiArchiveBox, HiArrowRight, HiDocumentText } from "react-icons/hi2";
import DraftStep from "./DraftStep";
import OrdersStep from "./OrdersStep";
import { apiFetch, useSalesInvoice, type SalesInvoiceState } from "./useSalesInvoice";
import "../../styles/Sales_Invoice.css";

type PartyPickerModalProps = {
  state: SalesInvoiceState;
  onClose: () => void;
  onSelect: () => void;
};

type InvoiceSourceMode = "sales-order" | "items";

type FinishedGoodItem = {
  ItemCode: string;
  ItemName: string;
  U_Brand?: string | null;
  U_Variety?: string | null;
  U_Sub_Group?: string | null;
  U_SKU?: string | null;
};

type InventoryWarehouse = {
  WhsCode: string;
  "SUM(Quantity)"?: number;
};

type BatchDetail = {
  SysNumber?: number;
  BatchNum: string;
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
};

type SelectedBatch = {
  warehouseCode: string;
  warehouseQuantity: number;
  batch: BatchDetail;
};

type ItemInvoiceRow = {
  id: number;
  type: "Item";
  item: FinishedGoodItem | null;
  batch: SelectedBatch | null;
};

const formatPartyAddressOption = (address: { Address: string; GSTRegnNo?: string | null }) =>
  [address.Address, address.GSTRegnNo ? `GST: ${address.GSTRegnNo}` : ""].filter(Boolean).join(" | ");

type ChainOption = {
  U_Chain: string | null;
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

const fetchStateChains = async (stateCode: string) => {
  const token = localStorage.getItem("access");
  const url = stateCode
    ? `/api/hana/state-chain/?state_code=${encodeURIComponent(stateCode)}`
    : "/api/hana/state-chain/";
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`Unable to load chains: ${response.status}`);
  const data = await response.json() as ChainOption[];
  return Array.isArray(data)
    ? [...new Set(data.map((item) => getChainValue(item.U_Chain)))].sort((a, b) =>
        formatChainName(a).localeCompare(formatChainName(b)),
      )
    : [];
};

function PartyPickerModal({ state, onClose, onSelect }: PartyPickerModalProps) {
  const [selectedState, setSelectedState] = useState("");
  const [showAllStates, setShowAllStates] = useState(false);
  const [chainOptions, setChainOptions] = useState<string[]>([]);
  const [selectedChain, setSelectedChain] = useState("");
  const [showAllChains, setShowAllChains] = useState(false);
  const [loadingChains, setLoadingChains] = useState(false);
  const filteredParties = useMemo(() => {
    return state.parties.filter((party) => {
      const stateMatches = !selectedState || party.State1 === selectedState;
      const chainMatches = !selectedChain || getChainValue(party.U_Chain) === selectedChain;
      return stateMatches && chainMatches;
    });
  }, [selectedChain, selectedState, state.parties]);

  useEffect(() => {
    let active = true;

    const loadChains = async () => {
      setLoadingChains(true);
      try {
        const chains = await fetchStateChains(selectedState);
        if (!active) return;
        setChainOptions(chains);
        setSelectedChain((current) => (current && !chains.includes(current) ? "" : current));
      } catch (error) {
        console.error(error);
        if (active) setChainOptions([]);
      } finally {
        if (active) setLoadingChains(false);
      }
    };

    loadChains();
    return () => {
      active = false;
    };
  }, [selectedState]);

  const preferredStates = ["DL", "HR", "PB", "MH"];
  const visibleStates = useMemo(() => {
    const availablePreferredStates = preferredStates.filter((stateCode) => state.vendorStates.includes(stateCode));
    const remainingStates = state.vendorStates.filter((stateCode) => !preferredStates.includes(stateCode));
    const orderedStates = [...availablePreferredStates, ...remainingStates];
    const selectedFirstStates = selectedState
      ? [selectedState, ...orderedStates.filter((stateCode) => stateCode !== selectedState)]
      : orderedStates;
    return showAllStates ? selectedFirstStates : selectedFirstStates.slice(0, Math.max(4, selectedState ? 5 : 4));
  }, [selectedState, showAllStates, state.vendorStates]);
  const hiddenStateCount = Math.max(state.vendorStates.length - visibleStates.length, 0);
  const preferredChains = ["D MART", "DISTRIBUTOR", "GT", "RETAILER"];
  const visibleChains = useMemo(() => {
    const availablePreferredChains = preferredChains.filter((chain) => chainOptions.includes(chain));
    const remainingChains = chainOptions.filter((chain) => !preferredChains.includes(chain));
    const orderedChains = [...availablePreferredChains, ...remainingChains];
    const selectedFirstChains = selectedChain
      ? [selectedChain, ...orderedChains.filter((chain) => chain !== selectedChain)]
      : orderedChains;
    return showAllChains ? selectedFirstChains : selectedFirstChains.slice(0, 6);
  }, [chainOptions, selectedChain, showAllChains]);
  const hiddenChainCount = Math.max(chainOptions.length - visibleChains.length, 0);
  const clearPartyFilters = () => {
    setSelectedState("");
    setSelectedChain("");
  };

  return (
    <div className="si-modal-backdrop" role="presentation">
      <section className="si-party-modal" role="dialog" aria-modal="true" aria-label="Select party">
        <header className="si-so-modal-head">
          <div>
            <span className="si-eyebrow">Party</span>
            <h2>Select Party</h2>
            <p>Choose a customer to start the sales invoice header.</p>
          </div>
          <button className="si-btn si-btn-outline" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="si-party-modal-body">
          <aside className="si-party-filter-panel">
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
                <button className="si-state-chip si-state-chip-more" type="button" onClick={() => setShowAllStates(true)}>
                  More +{hiddenStateCount}
                </button>
              )}
              {showAllStates && (
                <button className="si-state-chip si-state-chip-less" type="button" onClick={() => setShowAllStates(false)}>
                  Less
                </button>
              )}
            </div>

            <div className="si-party-state-filters" aria-label="Chain filters">
              <button
                className={`si-state-chip${!selectedChain ? " is-active" : ""}`}
                type="button"
                onClick={() => setSelectedChain("")}
              >
                All chains
              </button>
              {loadingChains ? (
                <span className="si-filter-loading">Loading chains...</span>
              ) : (
                <>
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
                    <button className="si-state-chip si-state-chip-more" type="button" onClick={() => setShowAllChains(true)}>
                      More +{hiddenChainCount}
                    </button>
                  )}
                  {showAllChains && (
                    <button className="si-state-chip si-state-chip-less" type="button" onClick={() => setShowAllChains(false)}>
                      Less
                    </button>
                  )}
                </>
              )}
            </div>

            {(selectedState || selectedChain) && (
              <button className="si-btn si-btn-outline si-party-clear-filters" type="button" onClick={clearPartyFilters}>
                Clear filters
              </button>
            )}
          </aside>

          <section className="si-party-results-panel">
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
                  key={party.CardCode}
                  type="button"
                  onClick={() => {
                    state.selectParty(party);
                    onSelect();
                  }}
                >
                  <span>
                    <strong>{party.CardName}</strong>
                    <small>{party.CardCode}</small>
                  </span>
                </button>
              ))
            )}
            </div>
          </section>
        </div>
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
  onReset: () => void;
};

function InvoiceSourceChoice({
  partyName,
  openSalesOrderCount,
  loadingOrders,
  ordersError,
  onChooseSalesOrder,
  onChooseItems,
}: {
  partyName: string;
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
      <div className="si-source-banner">
        <div>
          <span className="si-eyebrow">Invoice Against</span>
          <h2>Choose invoice source</h2>
          <p>{partyName}</p>
        </div>
        <div className="si-source-banner-icons" aria-hidden="true">
          <HiArchiveBox />
          <HiDocumentText />
        </div>
      </div>
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
}: {
  rows: ItemInvoiceRow[];
  onOpenItemPicker: (rowId: number) => void;
  onOpenBatchPicker: (rowId: number) => void;
  onAddRow: () => void;
}) {
  return (
    <div className="si-item-lines-panel">
      <header className="si-item-source-head">
        <div>
          <span className="si-eyebrow">Individual Items</span>
          <h2>Invoice Lines</h2>
          <p>Select finished goods directly for this invoice.</p>
        </div>
        <button className="si-btn si-btn-outline" type="button" onClick={onAddRow}>
          Add Row
        </button>
      </header>
      <div className="si-table-wrap">
        <table className="si-lines-table si-item-entry-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Item No.</th>
              <th>Description</th>
              <th>Batch</th>
              <th>Brand</th>
              <th>Variety</th>
              <th>SKU</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td>{index + 1}</td>
                <td>
                  <select value={row.type} disabled>
                    <option>Item</option>
                  </select>
                </td>
                <td>
                  <button className="si-item-select-btn" type="button" onClick={() => onOpenItemPicker(row.id)}>
                    {row.item?.ItemCode || "Click to Select..."}
                  </button>
                </td>
                <td>
                  <input value={row.item?.ItemName || ""} placeholder="Description" readOnly />
                </td>
                <td>
                  <button
                    className="si-batch-select-btn"
                    type="button"
                    disabled={!row.item}
                    onClick={() => onOpenBatchPicker(row.id)}
                  >
                    {row.batch
                      ? `${row.batch.batch.BatchNum} / ${row.batch.warehouseCode}`
                      : row.item
                        ? "Choose Batch"
                        : "Select item first"}
                  </button>
                  {row.batch && (
                    <span className="si-batch-line-meta">
                      Whs Qty: {row.batch.warehouseQuantity.toLocaleString("en-IN")} | Batch Qty:{" "}
                      {Number(row.batch.batch.Quantity || 0).toLocaleString("en-IN")}
                    </span>
                  )}
                </td>
                <td>{row.item?.U_Brand || "-"}</td>
                <td>{row.item?.U_Variety || "-"}</td>
                <td>{row.item?.U_SKU || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemPickerModal({
  onClose,
  onBack,
  onSelect,
}: {
  onClose: () => void;
  onBack: () => void;
  onSelect: (item: FinishedGoodItem) => void;
}) {
  const [items, setItems] = useState<FinishedGoodItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedSubGroup, setSelectedSubGroup] = useState("");
  const [selectedVariety, setSelectedVariety] = useState("");
  const [selectedPackSize, setSelectedPackSize] = useState("");
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [showAllSubGroups, setShowAllSubGroups] = useState(false);
  const [showAllVarieties, setShowAllVarieties] = useState(false);
  const [showAllPackSizes, setShowAllPackSizes] = useState(false);
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

  const renderFilterChips = (
    label: string,
    allLabel: string,
    options: string[],
    selectedValue: string,
    setSelectedValue: (value: string) => void,
    showAll: boolean,
    setShowAll: (value: boolean) => void,
  ) => {
    const visibleOptions = showAll ? options : options.slice(0, 6);
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
          <button className="si-state-chip" type="button" onClick={() => setShowAll(true)}>
            More +{hiddenCount}
          </button>
        )}
        {showAll && options.length > 6 && (
          <button className="si-state-chip" type="button" onClick={() => setShowAll(false)}>
            Less
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="si-modal-backdrop" role="presentation">
      <section className="si-so-modal" role="dialog" aria-modal="true" aria-label="Select finished good item">
        <header className="si-so-modal-head">
          <div>
            <span className="si-eyebrow">Finished Goods</span>
            <h2>Select Item</h2>
            <p>{loading ? "Loading items..." : `${filteredItems.length} items`}</p>
          </div>
          <div className="si-modal-head-actions">
            <button className="si-btn si-btn-outline" type="button" onClick={onBack}>
              Back
            </button>
            <button className="si-btn si-btn-outline" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div className="si-item-picker-body">
          <input
            className="si-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search item code, name, brand, variety, group or SKU"
            autoFocus
          />
          <div className="si-item-chip-filters">
            {renderFilterChips("Brand", "All brands", brandOptions, selectedBrand, setSelectedBrand, showAllBrands, setShowAllBrands)}
            {renderFilterChips(
              "Sub Group",
              "All sub groups",
              subGroupOptions,
              selectedSubGroup,
              setSelectedSubGroup,
              showAllSubGroups,
              setShowAllSubGroups,
            )}
            {renderFilterChips(
              "Variety",
              "All varieties",
              varietyOptions,
              selectedVariety,
              setSelectedVariety,
              showAllVarieties,
              setShowAllVarieties,
            )}
            {renderFilterChips(
              "Pack Size",
              "All pack sizes",
              packSizeOptions,
              selectedPackSize,
              setSelectedPackSize,
              showAllPackSizes,
              setShowAllPackSizes,
            )}
            {(selectedBrand || selectedSubGroup || selectedVariety || selectedPackSize) && (
              <button className="si-btn si-btn-outline" type="button" onClick={clearItemFilters}>
                Clear filters
              </button>
            )}
          </div>
          {error && <div className="si-inline-error">{error}</div>}
          {loading ? (
            <div className="si-loader">Loading finished goods...</div>
          ) : filteredItems.length === 0 ? (
            <div className="si-empty">No items found.</div>
          ) : (
            <div className="si-table-wrap">
              <table className="si-lines-table si-item-picker-table">
                <thead>
                  <tr>
                    <th>Item No.</th>
                    <th>Description</th>
                    <th>Brand</th>
                    <th>Variety</th>
                    <th>Group</th>
                    <th>SKU</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.ItemCode}>
                      <td>{item.ItemCode}</td>
                      <td>{item.ItemName}</td>
                      <td>{item.U_Brand || "-"}</td>
                      <td>{item.U_Variety || "-"}</td>
                      <td>{item.U_Sub_Group || "-"}</td>
                      <td>{item.U_SKU || "-"}</td>
                      <td>
                        <button className="si-btn si-btn-primary" type="button" onClick={() => onSelect(item)}>
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

function BatchPickerModal({
  item,
  selectedBatch,
  onClose,
  onSelect,
}: {
  item: FinishedGoodItem;
  selectedBatch: SelectedBatch | null;
  onClose: () => void;
  onSelect: (batch: SelectedBatch) => void;
}) {
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [selectedWhsCode, setSelectedWhsCode] = useState(selectedBatch?.warehouseCode || "");
  const [batches, setBatches] = useState<BatchDetail[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="si-modal-backdrop" role="presentation">
      <section className="si-so-modal si-batch-modal" role="dialog" aria-modal="true" aria-label="Choose item batch">
        <header className="si-so-modal-head">
          <div>
            <span className="si-eyebrow">Batch Selection</span>
            <h2>{item.ItemCode}</h2>
            <p>{item.ItemName}</p>
          </div>
          <div className="si-modal-head-actions">
            <button className="si-btn si-btn-outline" type="button" onClick={onClose}>
              Close
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
            {error && <div className="si-inline-error">{error}</div>}
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
                      <th aria-label="Select batch" />
                      <th>Batch No.</th>
                      <th>Batch Qty</th>
                      <th>Production</th>
                      <th>Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => (
                      <tr key={`${batch.BatchNum}-${batch.BaseEntry || ""}-${batch.InDate || ""}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={
                              selectedBatch?.warehouseCode === selectedWhsCode
                              && selectedBatch.batch.BatchNum === batch.BatchNum
                            }
                            onChange={() =>
                              onSelect({
                                warehouseCode: selectedWhsCode,
                                warehouseQuantity: selectedWarehouseQuantity,
                                batch,
                              })
                            }
                            aria-label={`Select batch ${batch.BatchNum}`}
                          />
                        </td>
                        <td>{batch.BatchNum}</td>
                        <td>{Number(batch.Quantity || 0).toLocaleString("en-IN")}</td>
                        <td>{formatBatchDate(batch.PrdDate)}</td>
                        <td>{formatBatchDate(batch.ExpDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
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
  onReset,
}: SkeletonInvoiceProps) {
  const partyLabel = state.selectedParty
    ? `${state.selectedParty.CardName} - ${state.selectedParty.CardCode}`
    : "Select Party";
  const updatePostingDate = (postingDate: string) => {
    state.updateForm({
      postingDate,
      dueDate: postingDate > state.form.dueDate ? postingDate : state.form.dueDate,
    });
  };
  const updateDueDate = (dueDate: string) => {
    state.updateForm({
      dueDate,
      postingDate: state.form.postingDate > dueDate ? dueDate : state.form.postingDate,
    });
  };

  return (
    <div className="si-draft-stage">
      <section className="si-draft-top-card si-skeleton-invoice-head">
        <div className="si-draft-document-panel">
          <div className="si-draft-top-title">
            <span>Document No.</span>
            <strong>{state.nextDocNumber || "Pending"}</strong>
          </div>
          <div className="si-draft-info-cell">
            <span>Status</span>
            <strong className="si-draft-status-pill">DRAFT</strong>
          </div>
          <label>
            Posting Date
            <input type="date" value={state.form.postingDate} onChange={(event) => updatePostingDate(event.target.value)} />
          </label>
          <label>
            Due Date
            <input type="date" value={state.form.dueDate} onChange={(event) => updateDueDate(event.target.value)} />
          </label>
          <label>
            Document Date
            <input
              type="date"
              value={state.form.documentDate}
              onChange={(event) => state.updateForm({ documentDate: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="si-card si-draft-party-card si-skeleton-party-card">
        <div className="si-draft-customer-panel">
          <div className="si-skeleton-party-field">
            <span>Party</span>
            <button className="si-skeleton-party-button" type="button" onClick={onOpenParty}>
              {partyLabel}
            </button>
            {state.selectedParty && sourceMode === "sales-order" && (
              <button className="si-btn si-btn-primary" type="button" onClick={onOpenOrders}>
                Select Open SO ({state.salesOrders.length})
              </button>
            )}
            {state.selectedParty && sourceMode === "items" && (
              <button className="si-btn si-btn-primary" type="button" onClick={onOpenItems}>
                Select Items
              </button>
            )}
            {state.selectedParty && (
              <button className="si-party-reset-btn" type="button" onClick={onReset}>
                Reset
              </button>
            )}
          </div>

          {sourceMode === "items" ? (
            <>
              <label className="si-skeleton-muted-field si-skeleton-address-field">
                <span>Bill To</span>
                <select
                  value={state.form.payTo}
                  onChange={(event) => state.updateForm({ payTo: event.target.value })}
                  disabled={state.loadingDraftDetails || state.billToAddresses.length === 0}
                >
                  {!state.form.payTo && <option value="">Select billing address</option>}
                  {state.billToAddresses.map((address, index) => (
                    <option value={address.Address} key={`${address.Address}-${address.City || ""}-${index}`}>
                      {formatPartyAddressOption(address)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="si-skeleton-muted-field si-skeleton-address-field">
                <span>Ship To</span>
                <select
                  value={state.form.shipTo}
                  onChange={(event) => state.updateForm({ shipTo: event.target.value })}
                  disabled={state.loadingDraftDetails || state.shipToAddresses.length === 0}
                >
                  {!state.form.shipTo && <option value="">Select shipping address</option>}
                  {state.shipToAddresses.map((address, index) => (
                    <option value={address.Address} key={`${address.Address}-${address.City || ""}-${index}`}>
                      {formatPartyAddressOption(address)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            ["Bill To", "Ship To"].map((label) => (
              <div className="si-skeleton-muted-field" key={label}>
                <span>{label}</span>
                <strong />
              </div>
            ))
          )}
        </div>
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
          />
        )}
      </section>
    </div>
  );
}

export default function SalesInvoiceWizard() {
  const state = useSalesInvoice();
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [itemPickerRowId, setItemPickerRowId] = useState<number | null>(null);
  const [batchPickerRowId, setBatchPickerRowId] = useState<number | null>(null);
  const [sourceMode, setSourceMode] = useState<InvoiceSourceMode | null>(null);
  const [itemRows, setItemRows] = useState<ItemInvoiceRow[]>([{ id: 1, type: "Item", item: null, batch: null }]);

  useEffect(() => {
    if (sourceMode === "sales-order" && state.selectedParty && state.step === 2 && !state.customerDetails) {
      setOrdersModalOpen(true);
    }
  }, [sourceMode, state.customerDetails, state.selectedParty, state.step]);

  const openOrdersModal = () => {
    if (!state.selectedParty) return;
    setSourceMode("sales-order");
    setSourceModalOpen(false);
    setItemPickerRowId(null);
    setBatchPickerRowId(null);
    setOrdersModalOpen(true);
  };

  const chooseItems = () => {
    if (!state.selectedParty) return;
    closeOrdersModal();
    setSourceMode("items");
    setSourceModalOpen(false);
    state.loadPartyAddresses();
  };

  const openItemsModal = () => {
    if (!state.selectedParty) return;
    setSourceMode("items");
    setItemPickerRowId(itemRows[0]?.id || 1);
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
    setItemRows([{ id: 1, type: "Item", item: null, batch: null }]);
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
    setItemRows((current) => [
      ...current,
      { id: Math.max(0, ...current.map((row) => row.id)) + 1, type: "Item", item: null, batch: null },
    ]);
  };

  const openBatchPicker = (rowId: number) => {
    const row = itemRows.find((itemRow) => itemRow.id === rowId);
    if (!row?.item) return;
    setBatchPickerRowId(rowId);
  };

  const selectItemForRow = (item: FinishedGoodItem) => {
    if (itemPickerRowId === null) return;
    const rowId = itemPickerRowId;
    setItemRows((current) => current.map((row) => (row.id === rowId ? { ...row, item, batch: null } : row)));
    closeItemPicker();
    setBatchPickerRowId(rowId);
  };

  const selectBatchForRow = (batch: SelectedBatch) => {
    if (batchPickerRowId === null) return;
    setItemRows((current) => current.map((row) => (row.id === batchPickerRowId ? { ...row, batch } : row)));
    closeBatchPicker();
  };

  const showOrdersModal = Boolean(state.selectedParty) && ordersModalOpen;
  const showSourceModal = Boolean(state.selectedParty) && sourceModalOpen;
  const showItemPickerModal = Boolean(state.selectedParty) && itemPickerRowId !== null;
  const batchPickerRow = itemRows.find((row) => row.id === batchPickerRowId) || null;
  const showBatchPickerModal = Boolean(state.selectedParty && batchPickerRow?.item);
  const showDraft = Boolean(state.selectedParty && state.customerDetails);
  const openSalesOrderCount = state.salesOrders.length;

  return (
    <div className="si-page">
      <header className="si-page-head">
        <div>
          <span className="si-eyebrow">SAP Billing</span>
          <h1>Sales Invoice</h1>
        </div>
      </header>

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
          onReset={resetInvoiceFlow}
        />
      )}

      {showDraft && <DraftStep state={state} onReset={resetInvoiceFlow} />}

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
        <div className="si-modal-backdrop" role="presentation">
          <section className="si-source-modal" role="dialog" aria-modal="true" aria-label="Choose invoice source">
            <header className="si-so-modal-head">
              <div>
                <span className="si-eyebrow">Invoice Against</span>
                <h2>{state.selectedParty?.CardName}</h2>
                <p>{state.selectedParty?.CardCode}</p>
              </div>
              <div className="si-modal-head-actions">
                <button className="si-btn si-btn-outline" type="button" onClick={backToPartyModal}>
                  Back
                </button>
                <button className="si-btn si-btn-outline" type="button" onClick={closeSourceModal}>
                  Close
                </button>
              </div>
            </header>
            <InvoiceSourceChoice
              partyName={`${state.selectedParty?.CardName || ""} - ${state.selectedParty?.CardCode || ""}`}
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
        <div className="si-modal-backdrop" role="presentation">
          <section className="si-so-modal" role="dialog" aria-modal="true" aria-label="Select open sales orders">
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
                <button className="si-btn si-btn-outline" type="button" onClick={backToPartyModal}>
                  Back
                </button>
                <button className="si-btn si-btn-outline" type="button" onClick={closeOrdersModal}>
                  Close
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
        />
      )}

      {showBatchPickerModal && batchPickerRow?.item && (
        <BatchPickerModal
          item={batchPickerRow.item}
          selectedBatch={batchPickerRow.batch}
          onClose={closeBatchPicker}
          onSelect={selectBatchForRow}
        />
      )}
    </div>
  );
}
