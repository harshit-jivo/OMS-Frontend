/**
 * Re-pricing a whole set of parties in one pass.
 *
 * The rest of Party Product Assignment works one party at a time, which is the
 * wrong shape for the job that actually comes up: "Haryana's mustard goes up ₹4
 * on Monday" is one item across forty parties, not forty items on one party.
 * Done through the single-party screen that is forty selections and forty rate
 * dialogs, and nothing at the end says whether the forty agree.
 *
 * So this reads the other way round. Pick the parties (the filters above this
 * card narrow forty down to "Haryana, distributors"), and it answers with the
 * UNIQUE items they hold between them — each row carrying how many of them hold
 * it and the spread of rates they hold it at, because a rate that has drifted
 * apart is the thing you most need to see before overwriting it.
 */
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlineChevronDown, HiOutlineChevronRight } from "react-icons/hi2";

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
import {
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSelect,
} from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Notice } from "@/components/ui/page";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { showToast } from "@/lib/toastStore";
import { useSapParties } from "@/lib/sapQueries";
import api from "../../services/api";

import CopyCatalogueDialog from "./CopyCatalogueDialog";

export type PartySelection = { card_code: string; category: string | null };

import { RATE_MODES, applyMode, parseValue, type RateMode } from "./rateMath";

/** One product as it is held across the selected parties. */
type BulkProductRow = {
  item_code: string;
  item_name: string;
  category: string;
  brand: string | null;
  variety: string | null;
  sub_group: string | null;
  sal_pack_unit: string | null;
  /** Selected parties that hold it. */
  party_count: number;
  /** Selected parties that COULD hold it — an OIL item cannot reach a MART party. */
  eligible_parties: number;
  missing_parties: number;
  /** Which selected parties hold it, and at what rate each. */
  holders: { card_code: string; basic_rate: number }[];
  /** Selected, eligible, and NOT holding it. */
  missing: string[];
  min_rate: number;
  max_rate: number;
  /** How many different rates the selection holds it at. 1 is agreement. */
  distinct_rates: number;
  /** The rate most of them are already on — what the New rate box starts at. */
  common_rate: number;
};

type ApplyResult = {
  updated: number;
  created?: number;
  unchanged: number;
  skipped?: number;
  /** Availability only: ticked rows the party does not hold, so there was
      nothing to turn on or off. Never a create — assigning is a different verb. */
  missing?: number;
  parties: number;
  items: number;
  errors: string[];
};

type ApplyTo = "existing" | "all";

/**
 * What the ticked rows are for.
 *
 * One selection, several verbs — the same shape `Tracker_Queue` uses. Re-pricing
 * needs a figure per row; turning an assignment off or on needs only the tick,
 * so the rate controls and the two rate columns are absent rather than disabled
 * for those: there is no figure to give, not a figure you may not give.
 */
type Operation = "reprice" | "deactivate" | "reactivate";

const OPERATIONS: { value: Operation; label: string }[] = [
  { value: "reprice", label: "Change rates" },
  { value: "deactivate", label: "Turn off" },
  { value: "reactivate", label: "Turn on" },
];

const money = (value: number) => "₹" + Number(value || 0).toFixed(2);
const rowKey = (row: { item_code: string; category: string }) =>
  row.item_code + "||" + row.category;

/**
 * card_code -> party name, from the list the picker upstream already loaded.
 *
 * The API deliberately returns codes rather than names: joining `Party` there
 * would cost a third query for something the client is holding anyway, and
 * this view's two-query budget is pinned by a test.
 */
function usePartyNames() {
  const { items: parties } = useSapParties();
  return useMemo(() => {
    const names = new Map<string, string>();
    parties.forEach((party) => {
      if (!names.has(party.card_code)) names.set(party.card_code, party.card_name);
    });
    return names;
  }, [parties]);
}

export default function BulkRateEditor({ selections }: { selections: PartySelection[] }) {
  // Which product's party breakdown is open. One at a time: the point is to
  // inspect a row before re-pricing it, not to read six at once.
  const [openRow, setOpenRow] = useState<string | null>(null);
  // Names for the codes the API returns. `useSapParties` is already in cache
  // from the picker that built this selection, so this costs no request.
  const partyNames = usePartyNames();
  const queryClient = useQueryClient();

  /*
   * Keyed on the selection itself, sorted — pick the same forty parties in a
   * different order and it is the same question, so it should be the same cache
   * entry rather than a second fetch of identical data.
   */
  const selectionKey = useMemo(
    () =>
      selections
        .map((selection) => selection.card_code + "||" + (selection.category || ""))
        .sort()
        .join(","),
    [selections],
  );

  const {
    data: rows = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["party", "bulk-products", selectionKey],
    enabled: selections.length > 0,
    queryFn: async () => {
      const response = await api.post("/auth/bulk-party/products/", {
        party_selections: selections,
      });
      return (response.data?.data?.products || []) as BulkProductRow[];
    },
  });

  const [operation, setOperation] = useState<Operation>("reprice");
  const [mode, setMode] = useState<RateMode>("set");
  const [applyTo, setApplyTo] = useState<ApplyTo>("existing");
  /**
   * Rows per page.
   *
   * The selection can hold every product several hundred parties buy between
   * them, and this table drew all of them: measured at 30,000px tall, which is
   * a page nobody reads and a scrollbar nobody can aim. 25, matching the other
   * archive tables in the app.
   */
  const PAGE_SIZE = 25;
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [varietyFilter, setVarietyFilter] = useState("ALL");
  const [ticked, setTicked] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fillValue, setFillValue] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [copying, setCopying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);

  /*
   * A figure typed as an absolute rate would be read as a percentage after a
   * mode switch — "152" becoming "+152%" across forty parties. The drafts are
   * dropped with the mode rather than reinterpreted.
   */
  const changeMode = (next: RateMode) => {
    setMode(next);
    setValues({});
    setFillValue("");
    // Only `set` can reach a party that does not hold the product yet: there is
    // no existing rate for a percentage to move.
    if (next !== "set") setApplyTo("existing");
  };

  /* Ticks are kept across a verb change — the products you meant are the same
     ones — but typed figures are not. A rate drafted for "Change rates" means
     nothing under "Turn off", and leaving it would quietly re-price on the next
     switch back. Same reasoning as `changeMode`. */
  const changeOperation = (next: Operation) => {
    setOperation(next);
    setValues({});
    setFillValue("");
    if (next !== "reprice") setApplyTo("existing");
  };

  const isReprice = operation === "reprice";

  const categories = useMemo(
    () => [...new Set(rows.map((row) => row.category).filter(Boolean))].sort(),
    [rows],
  );

  /** Varieties within whatever category is showing — the "subgroup" filter. */
  const varieties = useMemo(
    () =>
      [
        ...new Set(
          rows
            .filter((row) => categoryFilter === "ALL" || row.category === categoryFilter)
            .map((row) => row.variety || row.sub_group || "")
            .filter(Boolean),
        ),
      ].sort(),
    [rows, categoryFilter],
  );

  /* A variety left over from another category matches nothing, and an empty
     table reads as "these parties hold nothing" rather than as a dead filter.
     Held as "All" until it is one of the varieties on offer again. */
  const effectiveVariety =
    varietyFilter !== "ALL" && varieties.includes(varietyFilter) ? varietyFilter : "ALL";

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryFilter !== "ALL" && row.category !== categoryFilter) return false;
      if (effectiveVariety !== "ALL" && (row.variety || row.sub_group || "") !== effectiveVariety)
        return false;
      if (!term) return true;
      return (
        (row.item_name || "").toLowerCase().includes(term) ||
        (row.item_code || "").toLowerCase().includes(term) ||
        (row.brand || "").toLowerCase().includes(term) ||
        (row.variety || "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, categoryFilter, effectiveVariety]);

  /*
   * ONE PAGE IS DRAWN. "Visible" still means every row the filters leave.
   *
   * That distinction is load-bearing: the tick-all box, the two Fill buttons
   * and the counts below all read `visibleRows`, so they go on meaning "every
   * product this filter shows" rather than quietly shrinking to whatever
   * twenty-five rows happen to be under the cursor. Pagination here is what
   * the table DRAWS, not what the bulk actions reach — the opposite would
   * change what a re-price does without saying so.
   */
  /*
   * The page is stamped with the filters it was turned to.
   *
   * Narrowing the list has to send you back to page 1 — a search run from page
   * 6 would otherwise land past the end of its own results and draw nothing.
   * Stamping is how the rest of this app does that (see `Product_Rates`): an
   * effect calling `setPage` would be a second render and the lint rule that
   * forbids cascading renders, both for a value that can simply be derived.
   */
  const pageStamp = [search, categoryFilter, effectiveVariety, selectionKey].join("|");
  const [paging, setPaging] = useState({ stamp: pageStamp, page: 1 });
  const setPage = (next: number) => setPaging({ stamp: pageStamp, page: next });

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(
    Math.max(1, paging.stamp === pageStamp ? paging.page : 1),
    pageCount,
  );
  const pageRows = useMemo(
    () => visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visibleRows, safePage],
  );

  /*
   * Ticks that no longer name a listed product — the selection changed under
   * them — are ignored rather than cleared, so nothing has to be reset when the
   * parties move. `pending` reads the same set, so a stale tick can never reach
   * the server, and the counts on screen only ever describe rows that exist.
   */
  const availableKeys = useMemo(() => new Set(rows.map(rowKey)), [rows]);
  const activeTicked = useMemo(
    () => ticked.filter((key) => availableKeys.has(key)),
    [ticked, availableKeys],
  );

  const tickedSet = useMemo(() => new Set(activeTicked), [activeTicked]);
  const visibleKeys = visibleRows.map(rowKey);
  const allVisibleTicked =
    visibleKeys.length > 0 && visibleKeys.every((key) => tickedSet.has(key));

  const toggleRow = (key: string) =>
    setTicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const toggleAllVisible = () =>
    setTicked((prev) =>
      allVisibleTicked
        ? prev.filter((key) => !visibleKeys.includes(key))
        : [...new Set([...prev, ...visibleKeys])],
    );

  /** Every ticked row that also carries a usable figure — what Apply will send. */
  const pending = useMemo(
    () =>
      rows
        .filter((row) => tickedSet.has(rowKey(row)))
        .map((row) => ({ row, parsed: parseValue(values[rowKey(row)] ?? "", mode) }))
        .filter((entry) => entry.parsed.ok)
        .map((entry) => ({ row: entry.row, value: entry.parsed.value })),
    [rows, tickedSet, values, mode],
  );

  /**
   * The rows this run acts on.
   *
   * Re-pricing acts on ticked rows that carry a usable figure; turning an
   * assignment off or on acts on the tick alone, because there is nothing to
   * type. Everything downstream — the count, the confirm list, the request —
   * reads this, so the two verbs cannot drift apart.
   */
  const targetRows = useMemo(
    () =>
      isReprice
        ? pending.map((entry) => entry.row)
        : rows.filter((row) => tickedSet.has(rowKey(row))),
    [isReprice, pending, rows, tickedSet],
  );

  /* Ticked but nothing typed: the row is silently ignored, which on a price
     change is worth saying out loud rather than reporting "12 updated" for 20.
     Only re-pricing can have such a row. */
  const tickedWithoutValue = isReprice ? activeTicked.length - pending.length : 0;

  /** Parties the run will touch — the reach of the categories in play. */
  const partiesTouched = useMemo(() => {
    if (targetRows.length === 0) return 0;
    const keys = new Set<string>();
    targetRows.forEach((row) => keys.add(row.category));
    return selections.filter(
      (selection) => !selection.category || keys.has(selection.category),
    ).length;
  }, [targetRows, selections]);

  const fillTicked = () => {
    const parsed = parseValue(fillValue, mode);
    if (!parsed.ok || activeTicked.length === 0) return;
    setValues((prev) => {
      const next = { ...prev };
      activeTicked.forEach((key) => {
        next[key] = fillValue.trim();
      });
      return next;
    });
  };

  /** Tick everything showing and put the rate most of them already use in each
      row — the starting point for "bring the outliers into line". */
  const fillWithCommon = () => {
    setTicked((prev) => [...new Set([...prev, ...visibleKeys])]);
    setValues((prev) => {
      const next = { ...prev };
      visibleRows.forEach((row) => {
        next[rowKey(row)] = String(row.common_rate);
      });
      return next;
    });
  };

  const apply = useMutation({
    mutationFn: async () => {
      if (isReprice) {
        const response = await api.post("/auth/bulk-party/update-rates/", {
          party_selections: selections,
          rate_mode: mode,
          apply_to: applyTo,
          items: pending.map(({ row, value }) => ({
            item_code: row.item_code,
            category: row.category,
            basic_rate: value,
          })),
        });
        return (response.data?.data || {}) as ApplyResult;
      }
      const response = await api.post("/auth/bulk-party/set-active/", {
        party_selections: selections,
        is_active: operation === "reactivate",
        items: targetRows.map((row) => ({
          item_code: row.item_code,
          category: row.category,
        })),
      });
      return (response.data?.data || {}) as ApplyResult;
    },
    onSuccess: (data) => {
      setConfirming(false);
      setResult(data);
      setTicked([]);
      setValues({});
      void queryClient.invalidateQueries({ queryKey: ["party", "bulk-products"] });
      // The single-party catalogue below is showing rates this just changed.
      void queryClient.invalidateQueries({ queryKey: ["party", "products"] });
      showToast({
        title: isReprice
          ? "Rates applied"
          : operation === "deactivate"
            ? "Products turned off"
            : "Products turned on",
        message:
          data.updated +
          (isReprice
            ? " rate" + (data.updated === 1 ? "" : "s") + " updated"
            : " assignment" + (data.updated === 1 ? "" : "s") + " changed") +
          " across " +
          data.parties +
          " parties" +
          (isReprice && data.created ? ", " + data.created + " newly assigned" : "") +
          ".",
      });
    },
    onError: (error) => {
      console.error("Error applying bulk party-product change:", error);
      setConfirming(false);
      showToast({
        title: isReprice ? "Could not apply the rates" : "Could not change availability",
        message: "Nothing was changed. Check your connection and try again.",
      });
    },
  });

  const valueLabel =
    mode === "set" ? "New rate (₹)" : mode === "percent" ? "Change (%)" : "Change (₹)";

  /* Derived, not typed: the two rate columns are absent for the availability
     verbs, and a hardcoded colSpan would straddle the wrong number of them. */
  const columnCount = isReprice ? 6 : 4;

  const verbLabel =
    operation === "deactivate" ? "Turn off" : operation === "reactivate" ? "Turn on" : "Apply";

  return (
    <>
      <Card className="p-0">
        <CardHeader className="mb-0 flex-wrap gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <CardTitle>Rates across {selections.length} parties</CardTitle>
            <p className="m-0 mt-0.5 text-[12px] text-subtle">
              Every product these parties are assigned between them, once. Set a rate here and it
              is written to all of them.
            </p>
          </div>
          <span className="flex flex-none items-center gap-2">
            <Button variant="ghost" size="xs" onClick={() => setCopying(true)}>
              Copy catalogue
            </Button>
            <Button variant="ghost" size="xs" onClick={() => void refetch()} disabled={isPending}>
              {isPending ? "Loading…" : "Refresh"}
            </Button>
          </span>
        </CardHeader>

        <div className="space-y-3 p-4">
          {isError ? (
            <Notice tone="bad">
              The assigned products could not be loaded, so nothing is listed below — this is not
              an empty catalogue. Try Refresh.
            </Notice>
          ) : null}

          <FilterBar>
            <FilterSearch
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Item name, code, brand or variety…"
              fieldClassName="min-w-[220px]"
            />
            <div className="flex flex-none flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle">
                Category
              </span>
              <SegmentedControl
                size="xs"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { value: "ALL", label: "All" },
                  ...categories.map((category) => ({ value: category, label: category })),
                ]}
                aria-label="Filter by category"
              />
            </div>
            <FilterSelect
              label="Variety"
              value={effectiveVariety}
              onChange={(event) => setVarietyFilter(event.target.value)}
              fieldClassName="min-w-[160px]"
            >
              <option value="ALL">All varieties</option>
              {varieties.map((variety) => (
                <option key={variety} value={variety}>
                  {variety}
                </option>
              ))}
            </FilterSelect>
            <FilterCount>
              {visibleRows.length} of {rows.length} products · {activeTicked.length} ticked
            </FilterCount>
          </FilterBar>

          {/* ── What the ticked rows are for, and what the figures mean ── */}
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5 rounded-card border border-line bg-surface px-3 py-2.5">
            <div className="flex flex-none flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle">
                Do what
              </span>
              <SegmentedControl
                size="xs"
                value={operation}
                onChange={(next) => changeOperation(next as Operation)}
                options={OPERATIONS}
                aria-label="What to do with the ticked products"
              />
            </div>

            {!isReprice ? (
              <span className="flex h-control-xs items-center text-[12px] text-subtle">
                {operation === "deactivate"
                  ? "Ticked products stop being sellable to these parties. Their rates are kept."
                  : "Ticked products become sellable again, at the rate each party already had."}
              </span>
            ) : null}

            {isReprice ? (
              <>
                <div className="flex flex-none flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle">
                    Revision
                  </span>
                  <SegmentedControl
                    size="xs"
                    value={mode}
                    onChange={(next) => changeMode(next as RateMode)}
                    options={RATE_MODES}
                    aria-label="How the rate changes"
                  />
                </div>

                <div className="flex flex-none flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle">
                    Apply to
                  </span>
                  {mode === "set" ? (
                <SegmentedControl
                  size="xs"
                  value={applyTo}
                  onChange={(next) => setApplyTo(next as ApplyTo)}
                  options={[
                    { value: "existing", label: "Parties that have it" },
                    { value: "all", label: "All selected" },
                  ]}
                  aria-label="Which parties to write to"
                />
                  ) : (
                    // Not a greyed-out control: a percentage has nothing to move
                    // from on a party that does not hold the product yet, so the
                    // choice does not exist here rather than being unavailable.
                    <span className="flex h-control-xs items-center text-[12px] text-subtle">
                      Parties that have it — a change needs a rate to move from.
                    </span>
                  )}
                </div>

                <div className="flex min-w-[190px] flex-col gap-1">
                  <label
                    htmlFor="bulk-fill"
                    className="text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle"
                  >
                    {valueLabel} for every ticked row
                  </label>
                  <span className="flex items-center gap-2">
                    <Input
                      id="bulk-fill"
                      type="number"
                      step="0.01"
                      min={mode === "set" ? "0" : undefined}
                      placeholder={mode === "percent" ? "e.g. 5 or -2.5" : "0.00"}
                      value={fillValue}
                      onChange={(event) => setFillValue(event.target.value)}
                      className="h-control-xs w-28"
                    />
                    <Button
                      size="xs"
                      onClick={fillTicked}
                      disabled={!parseValue(fillValue, mode).ok || activeTicked.length === 0}
                      title={
                        activeTicked.length === 0
                          ? "Tick the products to change first."
                          : !parseValue(fillValue, mode).ok
                            ? "Enter a figure first."
                            : undefined
                      }
                    >
                      Fill {activeTicked.length || ""} ticked
                    </Button>
                  </span>
                </div>

                {mode === "set" && visibleRows.length > 0 ? (
                  <Button size="xs" variant="ghost" onClick={fillWithCommon}>
                    Use each product&rsquo;s commonest rate
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>

          {isReprice && applyTo === "all" ? (
            <Notice tone="hold">
              Products ticked below will be assigned to every selected party that does not have
              them yet — {selections.length} parties, not only the ones already selling them.
            </Notice>
          ) : null}

          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead className="w-9">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-brand"
                    checked={allVisibleTicked}
                    onChange={toggleAllVisible}
                    aria-label="Tick every product shown"
                    disabled={visibleRows.length === 0}
                  />
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Parties</TableHead>
                <TableHead className="text-right">Current rate</TableHead>
                {isReprice ? (
                  <>
                    <TableHead className="w-36 text-right">{valueLabel}</TableHead>
                    <TableHead className="text-right">Becomes</TableHead>
                  </>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableEmpty colSpan={columnCount}>Loading the assigned products…</TableEmpty>
              ) : visibleRows.length === 0 ? (
                <TableEmpty colSpan={columnCount}>
                  {rows.length === 0
                    ? "These parties have no products assigned yet. Use Add products to all above."
                    : "No product matches these filters."}
                </TableEmpty>
              ) : (
                pageRows.map((row) => {
                  const key = rowKey(row);
                  const isTicked = tickedSet.has(key);
                  const raw = values[key] ?? "";
                  const parsed = parseValue(raw, mode);
                  const bad = raw.trim() !== "" && !parsed.ok;
                  const varies = row.distinct_rates > 1;
                  const isOpen = openRow === key;

                  return (
                    <Fragment key={key}>
                    <TableRow className={isTicked ? "bg-brand-soft/40" : undefined}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-3.5 accent-brand"
                          checked={isTicked}
                          onChange={() => toggleRow(key)}
                          aria-label={"Change the rate of " + row.item_name}
                        />
                      </TableCell>

                      <TableCell>
                        <span className="block font-semibold text-ink">{row.item_name}</span>
                        <span className="text-[11px] text-subtle">
                          <span className="font-mono">{row.item_code}</span> ·{" "}
                          {[row.category, row.brand, row.variety, row.sal_pack_unit]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {/* The counts said "1 without" and stopped there —
                            without WHICH, you cannot tell whether the odd one
                            out matters before overwriting the rest. */}
                        <button
                          type="button"
                          onClick={() => setOpenRow(isOpen ? null : key)}
                          aria-expanded={isOpen}
                          className="inline-flex appearance-none items-center gap-1.5 rounded-sm border-0 bg-transparent px-1 py-0 [font-family:inherit] hover:bg-surface"
                          title={isOpen ? "Hide the parties" : "Show which parties"}
                        >
                          <span>
                            {row.party_count}
                            <span className="text-subtle"> / {row.eligible_parties}</span>
                          </span>
                          {row.missing_parties > 0 ? (
                            <Badge tone="hold">{row.missing_parties} without</Badge>
                          ) : null}
                          {isOpen ? (
                            <HiOutlineChevronDown className="size-3.5 text-subtle" aria-hidden />
                          ) : (
                            <HiOutlineChevronRight className="size-3.5 text-subtle" aria-hidden />
                          )}
                        </button>
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {varies ? (
                          <>
                            <span className="text-ink">
                              {money(row.min_rate)} – {money(row.max_rate)}
                            </span>
                            <Badge tone="hold" className="ml-1.5">
                              {row.distinct_rates} rates
                            </Badge>
                          </>
                        ) : (
                          <span className="font-semibold text-ink">{money(row.min_rate)}</span>
                        )}
                      </TableCell>

                      {isReprice ? (
                        <>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min={mode === "set" ? "0" : undefined}
                              placeholder={mode === "set" ? String(row.common_rate) : "0"}
                              aria-label={valueLabel + " for " + row.item_name}
                              aria-invalid={bad || undefined}
                              value={raw}
                              onChange={(event) =>
                                setValues((prev) => ({ ...prev, [key]: event.target.value }))
                              }
                              className={
                                "h-control-xs w-32 text-right " + (bad ? "border-bad" : "")
                              }
                            />
                          </TableCell>

                          <TableCell className="text-right tabular-nums">
                            {parsed.ok ? (
                              <>
                                <span className="font-semibold text-ink">
                                  {money(applyMode(row.common_rate, mode, parsed.value))}
                                </span>
                                {mode !== "set" && varies ? (
                                  // The figure moves each party's own rate, so a
                                  // single "becomes" is only an illustration here.
                                  <span className="block text-[11px] text-subtle">
                                    from {money(row.common_rate)}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-subtle">—</span>
                            )}
                          </TableCell>
                        </>
                      ) : null}
                    </TableRow>

                    {isOpen ? (
                      <TableRow className="hover:bg-surface">
                        <TableCell colSpan={columnCount} className="bg-surface-subtle">
                          <PartyBreakdown
                            row={row}
                            names={partyNames}
                            varies={varies}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>

          {pageCount > 1 ? (
            <Pagination
              className="border-t border-line pt-3"
              page={safePage}
              totalPages={pageCount}
              onPageChange={setPage}
              summary={`Showing ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(
                safePage * PAGE_SIZE,
                visibleRows.length,
              )} of ${visibleRows.length}`}
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <p className="m-0 text-[12px] text-subtle">
              {targetRows.length === 0
                ? isReprice
                  ? "Tick the products to re-price and enter a figure for each."
                  : "Tick the products to " +
                    (operation === "deactivate" ? "turn off." : "turn on.")
                : targetRows.length +
                  " product" +
                  (targetRows.length === 1 ? "" : "s") +
                  " · " +
                  partiesTouched +
                  " parties" +
                  (tickedWithoutValue > 0
                    ? " · " +
                      tickedWithoutValue +
                      " ticked row" +
                      (tickedWithoutValue === 1 ? "" : "s") +
                      " left blank and will not change"
                    : "")}
            </p>
            <Button
              variant="primary"
              onClick={() => setConfirming(true)}
              disabled={targetRows.length === 0 || apply.isPending}
              title={
                targetRows.length === 0
                  ? isReprice
                    ? "Tick a product and enter a figure first."
                    : "Tick a product first."
                  : undefined
              }
            >
              {isReprice ? "Review and apply" : "Review and " + verbLabel.toLowerCase()}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Confirm ──
          A price written to forty parties at once is not something to discover
          afterwards, so the count of both sides is said before it happens. */}
      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !apply.isPending) setConfirming(false);
        }}
      >
        {confirming && (
          <DialogContent
            title={isReprice ? "Apply rates" : verbLabel + " products"}
            size="md"
          >
            <DialogHeader>
              <DialogTitle>
                {isReprice ? "Change" : verbLabel} {targetRows.length} product
                {targetRows.length === 1 ? "" : "s"} across {partiesTouched} parties?
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              {!isReprice ? (
                <Notice tone={operation === "deactivate" ? "hold" : "info"}>
                  {operation === "deactivate"
                    ? "These stop being sellable to the selected parties. The rate each party " +
                      "negotiated is kept, so turning them back on restores it."
                    : "These become sellable again at the rate each party already had. A party " +
                      "that was never assigned the product is left alone."}
                </Notice>
              ) : applyTo === "all" ? (
                <Notice tone="hold">
                  Parties that do not have these products will be given them at the rate below.
                </Notice>
              ) : (
                <Notice tone="info">
                  Only parties that already sell these products are changed. Parties without them
                  are left alone.
                </Notice>
              )}
              <ul className="m-0 max-h-64 list-none divide-y divide-line overflow-y-auto rounded-sm border border-line p-0 text-[12.5px]">
                {targetRows.map((row) => {
                  const typed = pending.find((entry) => entry.row === row);
                  return (
                    <li
                      key={rowKey(row)}
                      className="flex items-baseline justify-between gap-3 px-3 py-1.5"
                    >
                      <span className="min-w-0 truncate text-ink">{row.item_name}</span>
                      <span className="shrink-0 tabular-nums text-subtle">
                        {row.party_count} parties
                        {isReprice && typed ? (
                          <>
                            {" · "}
                            <strong className="text-ink">
                              {mode === "set"
                                ? money(typed.value)
                                : mode === "percent"
                                  ? (typed.value >= 0 ? "+" : "") + typed.value + "%"
                                  : (typed.value >= 0 ? "+" : "") + money(typed.value)}
                            </strong>
                          </>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirming(false)} disabled={apply.isPending}>
                Cancel
              </Button>
              <Button
                variant={operation === "deactivate" ? "danger" : "primary"}
                onClick={() => apply.mutate()}
                disabled={apply.isPending}
              >
                {apply.isPending
                  ? "Applying…"
                  : (isReprice ? "Apply to " : verbLabel + " for ") +
                    partiesTouched +
                    " parties"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── What it did ── */}
      <Dialog
        open={Boolean(result)}
        onOpenChange={(next) => {
          if (!next) setResult(null);
        }}
      >
        {result && (
          <DialogContent
            title={isReprice ? "Rate update result" : "Availability result"}
            size="md"
          >
            <DialogHeader>
              <DialogTitle>
                {result.errors.length
                  ? "Applied, with problems"
                  : isReprice
                    ? "Rates applied"
                    : operation === "deactivate"
                      ? "Products turned off"
                      : "Products turned on"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <div className="flex flex-wrap gap-4">
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ok">{result.updated}</strong>
                  {isReprice ? "rates changed" : "assignments changed"}
                </span>
                {isReprice ? (
                  <span className="text-[13px]">
                    <strong className="block text-[20px] font-bold text-ink">
                      {result.created ?? 0}
                    </strong>
                    newly assigned
                  </span>
                ) : null}
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ink">
                    {result.unchanged}
                  </strong>
                  {isReprice ? "already at that rate" : "already like that"}
                </span>
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ink">
                    {isReprice ? (result.skipped ?? 0) : (result.missing ?? 0)}
                  </strong>
                  not assigned, left alone
                </span>
                <span className="text-[13px]">
                  <strong
                    className={
                      "block text-[20px] font-bold " +
                      (result.errors.length ? "text-bad" : "text-ink")
                    }
                  >
                    {result.errors.length}
                  </strong>
                  failed
                </span>
              </div>

              {result.errors.length > 0 && (
                <>
                  <Notice tone="bad">
                    These were not applied. Everything else was — the update does not roll back.
                  </Notice>
                  <ul className="m-0 max-h-64 list-none space-y-1 overflow-y-auto rounded-sm border border-line bg-surface p-2 text-[12px] text-body">
                    {result.errors.map((message, index) => (
                      <li key={index} className="border-b border-line/60 pb-1 last:border-0">
                        {message}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => setResult(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <CopyCatalogueDialog
        open={copying}
        onOpenChange={setCopying}
        selections={selections}
      />
    </>
  );
}


/**
 * Which of the selected parties hold this product, and at what rate each.
 *
 * The row above answers "2 / 2" or "1 / 2 · 1 without", which is enough to
 * spot an inconsistency and not enough to act on one: before overwriting a
 * rate across a selection you need to know WHOSE rate you are overwriting, and
 * whether the ones you are about to align were ever aligned.
 *
 * Rates that disagree are marked rather than merely listed — an even spread of
 * numbers reads as noise, and the outlier is the whole reason to look.
 */
function PartyBreakdown({
  row,
  names,
  varies,
}: {
  row: BulkProductRow;
  names: Map<string, string>;
  varies: boolean;
}) {
  const nameFor = (code: string) => names.get(code) ?? code;
  // Against the commonest rate, not the minimum: the majority is the baseline
  // a reader is checking the others against.
  const odd = (rate: number) => varies && rate !== row.common_rate;

  return (
    <div className="space-y-1.5 py-1">
      <p className="m-0 text-[11.5px] text-subtle">
        {row.holders.length} hold it
        {row.missing.length > 0 ? ` · ${row.missing.length} do not` : ""}
        {varies
          ? ` · ${row.distinct_rates} rates, commonest ${money(row.common_rate)}`
          : ` · all on ${money(row.common_rate)}`}
      </p>

      {/* A plain list, not a nested <Table>. A table inside a table cell brings
          its own header, padding and rules, which is three kinds of chrome for
          two columns of data — and it doubled the row height. One line per
          party: who, and what they are on. */}
      <ul className="m-0 list-none divide-y divide-line/50 p-0">
        {row.holders.map((holder) => (
          <li
            key={holder.card_code}
            className="flex items-baseline justify-between gap-3 py-1 text-[12px]"
          >
            <span className="min-w-0 truncate text-ink">
              {nameFor(holder.card_code)}
              <span className="ml-1.5 font-mono text-[10.5px] text-subtle">
                {holder.card_code}
              </span>
            </span>
            <span
              className={
                "shrink-0 tabular-nums " +
                (odd(holder.basic_rate) ? "font-semibold text-hold" : "text-ink")
              }
            >
              {money(holder.basic_rate)}
            </span>
          </li>
        ))}
        {row.missing.map((code) => (
          <li
            key={code}
            className="flex items-baseline justify-between gap-3 py-1 text-[12px]"
          >
            <span className="min-w-0 truncate text-subtle">
              {nameFor(code)}
              <span className="ml-1.5 font-mono text-[10.5px]">{code}</span>
            </span>
            <span className="shrink-0 text-[11px] text-subtle">not assigned</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
