/**
 * Choose which parties' open orders drive the demand figures.
 *
 * A dialog rather than the popover it replaces, because of what a row here
 * actually does: it does NOT toggle a value, it opens that party's open sales
 * orders so you can pick which of them count. The old control drew a
 * checkbox-shaped mark beside each row and then opened a modal when you
 * clicked it — a checkbox that is not a checkbox.
 *
 * So the mark is now a read-only Badge saying how many of that party's orders
 * are selected, and the row reads as what it is: "open this party's orders".
 * Select all / Deselect all stay, because they are the two bulk verbs the
 * screen genuinely needs.
 */
import { useMemo } from "react";
import { HiOutlineChevronRight, HiOutlineUsers } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { EmptyState, Notice } from "@/components/ui/page";
import { getPartyCode, getPartyName } from "../productStockUtils";
import type { ProductStockState } from "../useProductStock";

export default function PartyPickerDialog({ ps }: { ps: ProductStockState }) {
  const {
    partyPickerOpen,
    setPartyPickerOpen,
    partySearch,
    setPartySearch,
    openParties,
    filteredOpenParties,
    selectedPartyCodes,
    setSelectedPartyCodes,
    setSelectedSalesOrders,
    selectedSalesOrders,
    handlePartyClick,
  } = ps;

  /** How many selected sales orders each party contributes. */
  const ordersByParty = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(selectedSalesOrders).forEach((order) => {
      const code = String(order.CardCode || "").trim();
      if (code) counts[code] = (counts[code] ?? 0) + 1;
    });
    return counts;
  }, [selectedSalesOrders]);

  // Selected parties first, then alphabetical — the same order the popover
  // used, and the reason is the same: once a few are picked they must not
  // scroll away below four hundred that are not.
  const sorted = useMemo(
    () =>
      [...filteredOpenParties].sort((a, b) => {
        const aCode = getPartyCode(a);
        const bCode = getPartyCode(b);
        const aSel = selectedPartyCodes.includes(aCode) ? 0 : 1;
        const bSel = selectedPartyCodes.includes(bCode) ? 0 : 1;
        if (aSel !== bSel) return aSel - bSel;
        return (getPartyName(a) || aCode)
          .toLowerCase()
          .localeCompare((getPartyName(b) || bCode).toLowerCase());
      }),
    [filteredOpenParties, selectedPartyCodes],
  );

  return (
    <Dialog
      open={partyPickerOpen}
      onOpenChange={(next) => {
        if (!next) {
          setPartyPickerOpen(false);
          setPartySearch("");
        }
      }}
    >
      {partyPickerOpen && (
        <DialogContent title="Parties" size="md">
          <DialogHeader>
            <DialogTitle>Parties with open orders</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <Notice tone="info">
              Open a party to choose which of its sales orders count towards the demand figures.
              A party with no orders chosen contributes nothing.
            </Notice>

            <FilterBar className="border-0 bg-transparent p-0">
              <FilterSearch
                value={partySearch}
                onChange={(event) => setPartySearch(event.target.value)}
                placeholder="Party name or code…"
                fieldClassName="min-w-[220px]"
              />
              <FilterCount>
                {selectedPartyCodes.length} of {openParties.length} selected
              </FilterCount>
            </FilterBar>

            {sorted.length === 0 ? (
              <EmptyState
                icon={HiOutlineUsers}
                title={partySearch ? "No parties match that search" : "No parties with open orders"}
                hint={partySearch ? "Try the party code on its own." : undefined}
              />
            ) : (
              <ul className="m-0 max-h-[400px] list-none divide-y divide-line overflow-y-auto rounded-sm border border-line p-0">
                {sorted.map((party) => {
                  const partyCode = getPartyCode(party);
                  const partyName = getPartyName(party);
                  const chosen = selectedPartyCodes.includes(partyCode);
                  const orderCount = ordersByParty[partyCode] ?? 0;

                  return (
                    <li key={partyCode}>
                      <button
                        type="button"
                        /* A row that opens something, so it carries the
                           DESIGN_SYSTEM §1.1 reset rather than being a
                           `ui/button`. */
                        className={
                          "flex w-full cursor-pointer appearance-none items-center gap-2.5 border-0 px-3 py-2 text-left [font-family:inherit] text-[13px] transition-colors " +
                          (chosen ? "bg-brand-soft" : "bg-transparent hover:bg-surface")
                        }
                        onClick={() => handlePartyClick(party)}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-semibold text-ink">
                            {partyName || partyCode}
                          </span>
                          <span className="text-[11.5px] text-subtle">
                            {partyCode}
                            {party.open_sales_order_count !== undefined
                              ? " · " + party.open_sales_order_count + " open"
                              : ""}
                          </span>
                        </span>
                        {orderCount > 0 && (
                          <Badge tone="info">
                            {orderCount} chosen
                          </Badge>
                        )}
                        <HiOutlineChevronRight aria-hidden="true" className="text-subtle" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              className="mr-auto"
              disabled={openParties.length === 0}
              onClick={() => {
                setSelectedPartyCodes(
                  openParties.map((party) => getPartyCode(party)).filter(Boolean),
                );
                setSelectedSalesOrders({});
              }}
            >
              Select all
            </Button>
            <Button
              disabled={selectedPartyCodes.length === 0}
              onClick={() => {
                setSelectedPartyCodes([]);
                setSelectedSalesOrders({});
                setPartySearch("");
              }}
            >
              Deselect all
            </Button>
            <Button variant="primary" onClick={() => setPartyPickerOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
