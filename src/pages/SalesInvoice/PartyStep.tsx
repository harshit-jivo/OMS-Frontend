/**
 * Step 1 — pick the customer the invoice is for.
 *
 * The list is every party with at least one open sales order, so the count on
 * each row is the reason to choose it.
 */
import { useMemo, useState } from "react";
import { HiOutlineUsers } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { Card, CardHeader, CardTitle, EmptyState, Notice } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
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
    <div className="space-y-4">
      <FilterBar>
        <FilterSearch
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Customer code or name…"
          fieldClassName="min-w-[320px]"
          autoFocus
        />
        <FilterCount>
          {filteredParties.length} part{filteredParties.length === 1 ? "y" : "ies"}
          {query ? " of " + state.parties.length : ""}
        </FilterCount>
      </FilterBar>

      {state.partyError && <Notice tone="bad">{state.partyError}</Notice>}

      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 border-b border-line px-4 py-3">
          <CardTitle>Parties with open orders</CardTitle>
        </CardHeader>

        {state.loadingParties ? (
          <div className="space-y-2 p-4" aria-label="Loading open parties">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filteredParties.length === 0 ? (
          <EmptyState
            icon={HiOutlineUsers}
            title={query ? "No party matches this search" : "No open parties"}
            hint={
              query
                ? "Try the card code on its own."
                : "A party appears here once it has an open sales order to invoice."
            }
          />
        ) : (
          <ul className="m-0 max-h-[520px] list-none divide-y divide-line overflow-y-auto p-0">
            {filteredParties.map((party) => (
              <li key={party.CardCode}>
                <button
                  type="button"
                  /* A selectable row, so it carries the DESIGN_SYSTEM §1.1
                     reset rather than being a `ui/button`. */
                  className="flex w-full cursor-pointer appearance-none items-center justify-between gap-3 border-0 bg-transparent px-4 py-2.5 text-left [font-family:inherit] text-[13px] transition-colors hover:bg-surface"
                  onClick={() => state.selectParty(party)}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold text-ink">{party.CardName}</span>
                    <span className="font-mono text-[11.5px] text-subtle">{party.CardCode}</span>
                  </span>
                  <Badge tone="info">{party.Num_of_Open_SalesOrder || 0} open</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
