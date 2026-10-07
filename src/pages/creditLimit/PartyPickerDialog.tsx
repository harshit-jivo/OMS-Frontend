/**
 * Pick the parties a credit limit submission is for, from the synced SAP
 * party table of one company.
 *
 * Several parties can be ticked and added in one go — each becomes its own
 * request with its own approval chain. Parties already on the form are shown
 * ticked and locked, so the same party cannot be added twice.
 *
 * The synced table can be stale, so the page still reads each customer live
 * from SAP once it is added; this list only answers "which customers".
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
  added,
  onClose,
  onAdd,
}: {
  open: boolean;
  company: CreditLimitCompany;
  /** Card codes already on the form. */
  added: ReadonlySet<string>;
  onClose: () => void;
  onAdd: (parties: Party[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Select parties" size="lg">
        {/* Mounted only while open, so search and ticks start empty each time. */}
        {open && (
          <PickerBody company={company} added={added} onClose={onClose} onAdd={onAdd} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  company,
  added,
  onClose,
  onAdd,
}: {
  company: CreditLimitCompany;
  added: ReadonlySet<string>;
  onClose: () => void;
  onAdd: (parties: Party[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Map<string, Party>>(new Map());
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

  const toggle = (party: Party) => {
    if (added.has(party.card_code)) return;
    setPicked((current) => {
      const next = new Map(current);
      if (next.has(party.card_code)) next.delete(party.card_code);
      else next.set(party.card_code, party);
      return next;
    });
  };

  return (
    <>
      <DialogHeader className="pr-10">
        <div className="min-w-0">
          <DialogTitle>Select parties</DialogTitle>
          <DialogDescription className="mt-0.5">
            {company} customers — tick one or more
          </DialogDescription>
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
          <TableSkeleton columns={5} rows={6} label="Loading parties" />
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
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Main group</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((party) => {
                const already = added.has(party.card_code);
                return (
                  <TableRow
                    key={party.card_code}
                    className={already ? "opacity-60" : "cursor-pointer"}
                    data-picked={picked.has(party.card_code) ? "true" : undefined}
                    onClick={() => toggle(party)}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-brand"
                        aria-label={`Select ${party.card_name || party.card_code}`}
                        checked={already || picked.has(party.card_code)}
                        disabled={already}
                        title={already ? "Already on the form." : undefined}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggle(party)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-ink">
                      {party.card_code}
                    </TableCell>
                    <TableCell className="text-ink">{party.card_name}</TableCell>
                    <TableCell className="text-subtle">{party.main_group || "—"}</TableCell>
                    <TableCell className="text-subtle">{party.state || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={picked.size === 0}
          onClick={() => onAdd([...picked.values()])}
        >
          {picked.size > 1 ? `Add ${picked.size} parties` : "Add party"}
        </Button>
      </DialogFooter>
    </>
  );
}
