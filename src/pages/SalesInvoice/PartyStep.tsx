import { useMemo, useState } from "react";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

export default function PartyStep({ state }: Props) {
  const [query, setQuery] = useState("");
  const filteredParties = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return state.parties;
    return state.parties.filter((party) =>
      [party.CardCode, party.CardName].some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [query, state.parties]);

  return (
    <section className="si-party-stage">
      <div className="si-search-panel">
        <div className="si-panel-title">
          <span>SAP A/R Invoice</span>
          <h2>Select Party</h2>
          <p>Search by customer code or name to begin invoice creation.</p>
        </div>

        <input
          className="si-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search CardCode or CardName"
          autoFocus
        />

        {state.partyError && <div className="si-inline-error">{state.partyError}</div>}

        <div className="si-party-results">
          {state.loadingParties ? (
            <div className="si-loader">Loading open parties...</div>
          ) : filteredParties.length === 0 ? (
            <div className="si-empty">No open parties found.</div>
          ) : (
            filteredParties.map((party) => (
              <button
                className="si-party-row"
                key={party.CardCode}
                type="button"
                onClick={() => state.selectParty(party)}
              >
                <span>
                  <strong>{party.CardName}</strong>
                  <small>{party.CardCode}</small>
                </span>
                <em>{party.Num_of_Open_SalesOrder || 0} open orders</em>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
