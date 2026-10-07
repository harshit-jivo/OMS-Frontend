/**
 * Pick the party a credit limit request is for, from the synced SAP party
 * table of one company.
 *
 * A row is the choice: clicking it selects the party and closes the dialog.
 * The code cell is a real button so the same choice is reachable by keyboard
 * without turning the `<tr>` into something that is not a table row.
 *
 * The synced table can be stale, so the page still reads the customer live
 * from SAP once a party is picked; this list only answers "which customer".
 */
import { useMemo, useState } from "react";
import { HiOutlineUsers } from "react-icons/hi2";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { FilterBar, FilterCount, FilterSearch } from "../../components/ui/filter-bar";
import { EmptyState, Notice } from "../../components/ui/page";
import { TableSkeleton } from "../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { useSapPartiesByCategory } from "../../lib/sapQueries";
import type { Party } from "../../services/sapService";
import type { CreditLimitCompany } from "../../services/creditLimitService";

/** Rendering thousands of rows to show a handful is wasted work; search narrows. */
const MAX_ROWS = 200;

export function PartyPickerDialog({
  open,
  company,
  onClose,
  onSelect,
}: {
  open: boolean;
  company: CreditLimitCompany;
  onClose: () => void;
  onSelect: (party: Party) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Select party" size="lg">
        {/* Mounted only while open, so the search starts empty each time. */}
        {open && <PickerBody company={company} onClose={onClose} onSelect={onSelect} />}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  company,
  onClose,
  onSelect,
}: {
  company: CreditLimitCompany;
  onClose: () => void;
  onSelect: (party: Party) => void;
}) {
  const [search, setSearch] = useState("");
  const { items, isLoading, isError } = useSapPartiesByCategory(company);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (p) =>
        (p.card_code || "").toLowerCase().includes(term) ||
        (p.card_name || "").toLowerCase().includes(term),
    );
  }, [items, search]);

  const shown = matches.slice(0, MAX_ROWS);

  return (
    <>
      <DialogHeader className="pr-10">
        <div className="min-w-0">
          <DialogTitle>Select party</DialogTitle>
          <DialogDescription className="mt-0.5">{company} customers</DialogDescription>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <FilterBar className="border-0 bg-transparent p-0 shadow-none">
          <FilterSearch
            label="Search parties"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Party code or name…"
            fieldClassName="min-w-[220px]"
            autoFocus
          />
          {!isLoading && !isError && (
            <FilterCount>
              {matches.length > MAX_ROWS
                ? `Showing ${MAX_ROWS} of ${matches.length} — refine the search`
                : `${matches.length} part${matches.length === 1 ? "y" : "ies"}`}
            </FilterCount>
          )}
        </FilterBar>

        {isLoading ? (
          <TableSkeleton columns={4} rows={6} label="Loading parties" />
        ) : isError ? (
          <Notice tone="bad">Could not load the {company} parties. Try again.</Notice>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={HiOutlineUsers}
            title={search ? "No parties match that search" : `No ${company} parties are synced`}
            hint={search ? "Try the party code on its own." : undefined}
          />
        ) : (
          <Table density="compact" containerClassName="max-h-[420px] overflow-y-auto">
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Main group</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((party) => (
                <TableRow
                  key={party.card_code}
                  className="cursor-pointer"
                  onClick={() => onSelect(party)}
                >
                  <TableCell className="whitespace-nowrap">
                    <button
                      type="button"
                      aria-label={`Select ${party.card_name || party.card_code}`}
                      className="cursor-pointer appearance-none border-0 bg-transparent p-0 font-mono text-[12.5px] font-semibold text-brand [font-family:inherit] hover:underline focus-visible:shadow-focus focus-visible:outline-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(party);
                      }}
                    >
                      {party.card_code}
                    </button>
                  </TableCell>
                  <TableCell className="text-ink">{party.card_name}</TableCell>
                  <TableCell className="text-subtle">{party.main_group || "—"}</TableCell>
                  <TableCell className="text-subtle">{party.state || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  );
}
