/**
 * SAP Sync · Parties & Addresses.
 *
 * Parties and addresses were two flat, unrelated lists; they describe one
 * thing. This is a master/detail view: pick a party on the left, and the right
 * pane tabulates every address SAP holds for it — one table per category, and
 * within each table a Billing (address_type "B") block and a Shipping ("S")
 * block, which is exactly how SAP's CRD1 key stores the pair.
 */
import { useMemo, useState } from "react";
import {
  HiArrowPath,
  HiBuildingOffice2,
  HiMapPin,
  HiTruck,
  HiUsers,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterActions, FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Notice,
  Stat,
  StatRow,
} from "@/components/ui/page";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Address } from "../../services/sapService";
import { useSapAddresses, useSapParties } from "../../lib/sapQueries";
import { dash, num } from "./format";

const UNCATEGORISED = "Uncategorised";

const isShipping = (address: Address) => String(address.address_type || "").toUpperCase() === "S";

type CategoryGroup = { category: string; billing: Address[]; shipping: Address[] };

// Group one party's addresses by category, then by bill-to / ship-to.
const groupByCategory = (addresses: Address[]): CategoryGroup[] => {
  const groups = new Map<string, CategoryGroup>();
  for (const address of addresses) {
    const category = String(address.category || "").trim() || UNCATEGORISED;
    let group = groups.get(category);
    if (!group) {
      group = { category, billing: [], shipping: [] };
      groups.set(category, group);
    }
    (isShipping(address) ? group.shipping : group.billing).push(address);
  }
  const sortByName = (a: Address, b: Address) =>
    String(a.address_name || "").localeCompare(String(b.address_name || ""));
  const result = [...groups.values()];
  for (const group of result) {
    group.billing.sort(sortByName);
    group.shipping.sort(sortByName);
  }
  // Real categories first, "Uncategorised" last.
  return result.sort((a, b) => {
    if (a.category === UNCATEGORISED) return 1;
    if (b.category === UNCATEGORISED) return -1;
    return a.category.localeCompare(b.category);
  });
};

export default function PartyDirectory() {
  // Two queries rather than one `Promise.all`, so a slow address list no longer
  // holds the party list off the screen — and so each is cached under its own
  // key, which the (now dead) standalone Parties and Addresses pages also used.
  const {
    items: parties,
    isLoading: partiesLoading,
    isError: partiesFailed,
    refetch: reloadParties,
  } = useSapParties();
  const {
    items: addresses,
    isLoading: addressesLoading,
    isError: addressesFailed,
    refetch: reloadAddresses,
  } = useSapAddresses();
  const loadDirectory = () => {
    void reloadParties();
    void reloadAddresses();
  };
  const loading = partiesLoading || addressesLoading;
  // The message is unchanged; what changed is that it is now driven by the
  // query's own error state rather than by a `catch` that also swallowed the
  // reason into `console.log`.
  const failed = partiesFailed || addressesFailed;

  const [search, setSearch] = useState("");
  /**
   * Which party the user last clicked. NOT which one is shown — see below.
   */
  const [requestedCode, setRequestedCode] = useState<string>("");

  // card_code → that party's addresses (card_code is a plain string on both
  // tables; there is no FK, so the join happens here).
  const addressesByCode = useMemo(() => {
    const map = new Map<string, Address[]>();
    for (const address of addresses) {
      const code = String(address.card_code || "");
      if (!code) continue;
      const bucket = map.get(code);
      if (bucket) bucket.push(address);
      else map.set(code, [address]);
    }
    return map;
  }, [addresses]);

  const filteredParties = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return parties;
    return parties.filter((party) =>
      [party.card_code, party.card_name, party.main_group, party.category, party.state].some(
        (field) =>
          String(field || "")
            .toLowerCase()
            .includes(needle),
      ),
    );
  }, [parties, search]);

  /**
   * The party actually on screen: the clicked one while it is still in the
   * filtered list, otherwise the first match.
   *
   * This was an effect that wrote `selectedCode` whenever the filter moved
   * underneath it — a render, then a setState, then a second render, with the
   * first one painting a detail panel for a party no longer in the list. It
   * only passed lint because the unanalysable fetch effect above it suppressed
   * the rule; converting that fetch to a query is what made it visible.
   */
  const selectedCode = useMemo(() => {
    if (filteredParties.length === 0) return "";
    const stillVisible = filteredParties.some((party) => party.card_code === requestedCode);
    return stillVisible ? requestedCode : String(filteredParties[0].card_code || "");
  }, [filteredParties, requestedCode]);

  const selectedParty = useMemo(
    () => parties.find((party) => String(party.card_code || "") === selectedCode) || null,
    [parties, selectedCode],
  );

  // Memoised because `groups` below depends on it: a fresh `[]` on every
  // render regrouped the addresses on every render.
  const selectedAddresses = useMemo(
    () => (selectedCode ? addressesByCode.get(selectedCode) || [] : []),
    [addressesByCode, selectedCode],
  );
  const groups = useMemo(() => groupByCategory(selectedAddresses), [selectedAddresses]);
  const billingTotal = addresses.filter((address) => !isShipping(address)).length;
  const selectedBilling = selectedAddresses.filter((address) => !isShipping(address)).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <StatRow>
        <Stat label="Parties" value={num(parties.length)} icon={HiUsers} />
        <Stat label="Addresses" value={num(addresses.length)} icon={HiMapPin} />
        <Stat label="Billing" value={num(billingTotal)} icon={HiBuildingOffice2} />
        <Stat
          label="Shipping"
          value={num(addresses.length - billingTotal)}
          icon={HiTruck}
          tone="ok"
        />
      </StatRow>

      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Party code, name, group, category or state…"
          fieldClassName="min-w-[300px]"
        />
        <FilterCount>
          {num(filteredParties.length)} part{filteredParties.length === 1 ? "y" : "ies"}
          {search ? " of " + num(parties.length) : ""}
        </FilterCount>
        <FilterActions>
          <Button onClick={loadDirectory} disabled={loading}>
            <HiArrowPath className={loading ? "animate-spin" : ""} aria-hidden="true" />
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </FilterActions>
      </FilterBar>

      {failed && (
        <Notice tone="bad" title="Could not load the directory">
          Unable to load parties and addresses. Anything shown below is from an earlier load.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:items-start">
        {/* ── Master: party selector ── */}
        <Card className="overflow-hidden p-0 lg:sticky lg:top-4">
          <CardHeader className="mb-0 border-b border-line px-4 py-3">
            <CardTitle>Parties</CardTitle>
            <span className="text-[12px] text-subtle">{num(filteredParties.length)}</span>
          </CardHeader>
          {filteredParties.length === 0 ? (
            <EmptyState
              icon={HiUsers}
              title={loading ? "Loading parties…" : "No parties match this search"}
              hint={loading ? undefined : "Try a shorter code, or part of the party name."}
            />
          ) : (
            <ul
              className="m-0 max-h-[540px] list-none overflow-y-auto p-0"
              aria-label="Parties"
            >
              {filteredParties.map((party) => {
                const code = String(party.card_code || "");
                const count = addressesByCode.get(code)?.length || 0;
                const selected = code === selectedCode;
                return (
                  <li key={party.id ?? code}>
                    <button
                      type="button"
                      /*
                       * Hand-rolled rather than `ui/button`: this is a
                       * selectable list row, not an action — full-bleed, three
                       * lines tall, and it carries a selected state. The reset
                       * on the first line is the one from DESIGN_SYSTEM §1.1,
                       * which a bare <button> must copy because preflight is
                       * not imported.
                       */
                      className={
                        "flex w-full cursor-pointer appearance-none flex-col gap-1 border-0 border-b border-line/70 border-solid px-4 py-2.5 text-left [font-family:inherit] text-[13px] transition-colors " +
                        (selected
                          ? "bg-brand-soft"
                          : "bg-transparent hover:bg-surface")
                      }
                      aria-current={selected ? "true" : undefined}
                      onClick={() => setRequestedCode(code)}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={
                            "font-mono text-[12px] font-semibold " +
                            (selected ? "text-brand" : "text-ink")
                          }
                        >
                          {code}
                        </span>
                        {/* The address count is the reason to click a row, so
                            it stays visible when zero rather than hiding — a
                            party with no synced address is the interesting
                            case, not the boring one. */}
                        <span
                          className={
                            "rounded-full px-1.5 py-px text-[11px] font-bold " +
                            (count === 0
                              ? "bg-surface-strong text-subtle"
                              : "bg-white text-body ring-1 ring-line")
                          }
                          title={count + " address" + (count === 1 ? "" : "es")}
                        >
                          {count}
                        </span>
                      </span>
                      <span className="truncate font-semibold text-ink">
                        {dash(party.card_name)}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {party.category && <Badge tone="info">{party.category}</Badge>}
                        {party.main_group && <Badge>{party.main_group}</Badge>}
                        {party.state && (
                          <span className="text-[11px] text-subtle">{party.state}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ── Detail: the selected party's addresses, tabulated ── */}
        <div className="space-y-4">
          {!selectedParty ? (
            <Card>
              <EmptyState
                icon={HiMapPin}
                title="Select a party"
                hint="Its billing and shipping addresses appear here, grouped by category."
              />
            </Card>
          ) : (
            <>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="font-mono text-[12px] font-semibold text-brand">
                      {selectedParty.card_code}
                    </span>
                    <h2 className="m-0 mt-0.5 text-[16px] font-semibold text-ink">
                      {dash(selectedParty.card_name)}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-subtle">
                      <span>
                        Group:{" "}
                        <strong className="font-semibold text-body">
                          {dash(selectedParty.main_group)}
                        </strong>
                      </span>
                      <span>
                        Category:{" "}
                        <strong className="font-semibold text-body">
                          {dash(selectedParty.category)}
                        </strong>
                      </span>
                      <span>
                        State:{" "}
                        <strong className="font-semibold text-body">
                          {dash(selectedParty.state)}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <dl className="m-0 flex shrink-0 gap-5 text-center">
                    <div>
                      <dd className="m-0 text-[18px] font-bold text-ink">
                        {selectedAddresses.length}
                      </dd>
                      <dt className="text-[11px] uppercase tracking-wide text-subtle">
                        Addresses
                      </dt>
                    </div>
                    <div>
                      <dd className="m-0 text-[18px] font-bold text-brand">{selectedBilling}</dd>
                      <dt className="text-[11px] uppercase tracking-wide text-subtle">Billing</dt>
                    </div>
                    <div>
                      <dd className="m-0 text-[18px] font-bold text-ok">
                        {selectedAddresses.length - selectedBilling}
                      </dd>
                      <dt className="text-[11px] uppercase tracking-wide text-subtle">Shipping</dt>
                    </div>
                  </dl>
                </div>
              </Card>

              {groups.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={HiMapPin}
                    title="No addresses for this party"
                    hint="Nothing has been synced against this card code yet."
                  />
                </Card>
              ) : (
                groups.map((group) => (
                  <Card className="overflow-hidden p-0" key={group.category}>
                    <CardHeader className="mb-0 border-b border-line px-4 py-3">
                      <CardTitle>{group.category}</CardTitle>
                      <span className="text-[12px] text-subtle">
                        {group.billing.length} billing · {group.shipping.length} shipping
                      </span>
                    </CardHeader>
                    <div className="overflow-x-auto">
                      <Table density="compact">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Address Name</TableHead>
                            <TableHead>Full Address</TableHead>
                            <TableHead>City</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>PIN</TableHead>
                            <TableHead>GST Number</TableHead>
                          </TableRow>
                        </TableHeader>
                        <AddressRows kind="billing" items={group.billing} />
                        <AddressRows kind="shipping" items={group.shipping} />
                      </Table>
                    </div>
                  </Card>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One address-type block inside a category table: a labelled group header row
 * followed by that type's rows, or an explicit "none" row.
 *
 * A separate `<tbody>` per block rather than one flat list, because that is
 * what makes the group header a real structural boundary rather than a row
 * that happens to look different.
 */
function AddressRows({ kind, items }: { kind: "billing" | "shipping"; items: Address[] }) {
  const title = kind === "billing" ? "Billing" : "Shipping";
  const Icon = kind === "billing" ? HiBuildingOffice2 : HiTruck;
  return (
    <tbody>
      <tr className={kind === "billing" ? "bg-brand-soft/60" : "bg-ok-soft/50"}>
        <th
          colSpan={6}
          scope="colgroup"
          className="px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-body"
        >
          <span className="inline-flex items-center gap-1.5">
            <Icon aria-hidden="true" />
            {title}
            <span className="rounded-full bg-white/70 px-1.5 font-bold text-subtle">
              {items.length}
            </span>
          </span>
        </th>
      </tr>
      {items.length === 0 ? (
        <TableRow>
          <TableCell colSpan={6} className="text-center text-subtle">
            No {title.toLowerCase()} address in this category.
          </TableCell>
        </TableRow>
      ) : (
        items.map((address) => (
          <TableRow key={address.id}>
            <TableCell className="font-semibold text-ink">{dash(address.address_name)}</TableCell>
            <TableCell className="min-w-[220px] whitespace-normal text-subtle">
              {dash(address.full_address)}
            </TableCell>
            <TableCell>{dash(address.city)}</TableCell>
            <TableCell>{dash(address.state)}</TableCell>
            <TableCell className="whitespace-nowrap">{dash(address.zip_code)}</TableCell>
            <TableCell className="whitespace-nowrap font-mono text-[12px]">
              {dash(address.gst_number)}
            </TableCell>
          </TableRow>
        ))
      )}
    </tbody>
  );
}
