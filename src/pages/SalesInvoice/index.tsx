import { useEffect, useMemo, useState } from "react";
import DraftStep from "./DraftStep";
import OrdersStep from "./OrdersStep";
import { useSalesInvoice, type SalesInvoiceState } from "./useSalesInvoice";
import "../../styles/Sales_Invoice.css";

type PartyPickerModalProps = {
  state: SalesInvoiceState;
  onClose: () => void;
  onSelect: () => void;
};

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
  const [query, setQuery] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [showAllStates, setShowAllStates] = useState(false);
  const [chainOptions, setChainOptions] = useState<string[]>([]);
  const [selectedChain, setSelectedChain] = useState("");
  const [showAllChains, setShowAllChains] = useState(false);
  const [loadingChains, setLoadingChains] = useState(false);
  const filteredParties = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.parties.filter((party) => {
      const stateMatches = !selectedState || party.State1 === selectedState;
      const chainMatches = !selectedChain || getChainValue(party.U_Chain) === selectedChain;
      const queryMatches = !normalized
        || [party.CardCode, party.CardName].some((value) => value?.toLowerCase().includes(normalized));
      return stateMatches && chainMatches && queryMatches;
    });
  }, [query, selectedChain, selectedState, state.parties]);

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
    return showAllStates ? [...availablePreferredStates, ...remainingStates] : availablePreferredStates;
  }, [showAllStates, state.vendorStates]);
  const hiddenStateCount = Math.max(state.vendorStates.length - visibleStates.length, 0);
  const preferredChains = ["D MART", "DISTRIBUTOR", "GT", "RETAILER"];
  const visibleChains = useMemo(() => {
    const availablePreferredChains = preferredChains.filter((chain) => chainOptions.includes(chain));
    const remainingChains = chainOptions.filter((chain) => !preferredChains.includes(chain));
    const orderedChains = [...availablePreferredChains, ...remainingChains];
    return showAllChains ? orderedChains : orderedChains.slice(0, 5);
  }, [chainOptions, showAllChains]);
  const hiddenChainCount = Math.max(chainOptions.length - visibleChains.length, 0);

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
          <input
            className="si-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search CardCode or CardName"
            autoFocus
          />

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
              <button className="si-state-chip" type="button" onClick={() => setShowAllStates(true)}>
                More +{hiddenStateCount}
              </button>
            )}
            {showAllStates && (
              <button className="si-state-chip" type="button" onClick={() => setShowAllStates(false)}>
                Less
              </button>
            )}
            {selectedState && (
              <button className="si-btn si-btn-outline" type="button" onClick={() => setSelectedState("")}>
                Clear filter
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
                  <button className="si-state-chip" type="button" onClick={() => setShowAllChains(true)}>
                    More +{hiddenChainCount}
                  </button>
                )}
                {showAllChains && (
                  <button className="si-state-chip" type="button" onClick={() => setShowAllChains(false)}>
                    Less
                  </button>
                )}
              </>
            )}
            {selectedChain && (
              <button className="si-btn si-btn-outline" type="button" onClick={() => setSelectedChain("")}>
                Clear chain
              </button>
            )}
          </div>

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
                    <small>
                      {[party.CardCode, formatStateName(party.State1), party.U_Chain].filter(Boolean).join(" - ")}
                    </small>
                  </span>
                  <em>Select</em>
                </button>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

type SkeletonInvoiceProps = {
  state: SalesInvoiceState;
  onOpenParty: () => void;
  onOpenOrders: () => void;
};

function SkeletonInvoice({ state, onOpenParty, onOpenOrders }: SkeletonInvoiceProps) {
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
            {state.selectedParty && (
              <button className="si-btn si-btn-primary" type="button" onClick={onOpenOrders}>
                Select Open SO
              </button>
            )}
          </div>

          {["Bill To", "Ship To", "State", "U-Chain"].map((label) => (
            <div className="si-skeleton-muted-field" key={label}>
              <span>{label}</span>
              <strong />
            </div>
          ))}
        </div>
      </section>

      <section className="si-card si-tabs-card si-skeleton-lines">
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
        <div className="si-empty">
          {state.selectedParty ? "Select open sales orders to fill invoice lines." : "Select a party to begin."}
        </div>
      </section>
    </div>
  );
}

export default function SalesInvoiceWizard() {
  const state = useSalesInvoice();
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [partyModalOpen, setPartyModalOpen] = useState(false);

  useEffect(() => {
    if (state.selectedParty && state.step === 2 && !state.customerDetails) {
      setOrdersModalOpen(true);
    }
  }, [state.customerDetails, state.selectedParty, state.step]);

  const openOrdersModal = () => {
    if (state.selectedParty) setOrdersModalOpen(true);
  };

  const closeOrdersModal = () => {
    setOrdersModalOpen(false);
  };

  const openPartyModal = () => {
    setPartyModalOpen(true);
  };

  const closePartyModal = () => {
    setPartyModalOpen(false);
  };

  const changeParty = () => {
    closePartyModal();
    closeOrdersModal();
    state.changeParty();
  };

  const createDraftFromSelectedOrders = async () => {
    const ok = await state.proceedToDraft();
    if (ok) closeOrdersModal();
  };

  const backToPartyModal = () => {
    closeOrdersModal();
    setPartyModalOpen(true);
  };

  const showOrdersModal = Boolean(state.selectedParty) && ordersModalOpen;
  const showDraft = Boolean(state.selectedParty && state.customerDetails);

  return (
    <div className="si-page">
      <header className="si-page-head">
        <div>
          <span className="si-eyebrow">SAP Billing</span>
          <h1>Sales Invoice</h1>
          <p>Create A/R invoice drafts from open SAP sales orders.</p>
        </div>
        {state.selectedParty && (
          <div className="si-selected-party">
            <strong>{state.selectedParty.CardName} - {state.selectedParty.CardCode}</strong>
            <button type="button" onClick={openOrdersModal}>Open SO</button>
            <button type="button" onClick={changeParty}>Change party</button>
          </div>
        )}
      </header>

      {!showDraft && <SkeletonInvoice state={state} onOpenParty={openPartyModal} onOpenOrders={openOrdersModal} />}

      {showDraft && <DraftStep state={state} />}

      {partyModalOpen && (
        <PartyPickerModal
          state={state}
          onClose={closePartyModal}
          onSelect={() => {
            closePartyModal();
          }}
        />
      )}

      {showOrdersModal && (
        <div className="si-modal-backdrop" role="presentation">
          <section className="si-so-modal" role="dialog" aria-modal="true" aria-label="Select open sales orders">
            <header className="si-so-modal-head">
              <div>
                <span className="si-eyebrow">Open Sales Orders</span>
                <h2>{state.selectedParty?.CardName}</h2>
                <p>{state.selectedParty?.CardCode}</p>
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
    </div>
  );
}
