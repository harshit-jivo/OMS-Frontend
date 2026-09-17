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
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
import { showToast } from "@/lib/toastStore";
import api from "../../services/api";

export type PartySelection = { card_code: string; category: string | null };

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
  min_rate: number;
  max_rate: number;
  /** How many different rates the selection holds it at. 1 is agreement. */
  distinct_rates: number;
  /** The rate most of them are already on — what the New rate box starts at. */
  common_rate: number;
};

type ApplyResult = {
  updated: number;
  created: number;
  unchanged: number;
  skipped: number;
  parties: number;
  items: number;
  errors: string[];
};

/** `set` writes the figure; the other two move each party's OWN rate. */
type RateMode = "set" | "percent" | "amount";
type ApplyTo = "existing" | "all";

const RATE_MODES: { value: RateMode; label: string }[] = [
  { value: "set", label: "Set rate" },
  { value: "percent", label: "Change by %" },
  { value: "amount", label: "Change by ₹" },
];

const money = (value: number) => "₹" + Number(value || 0).toFixed(2);
const rowKey = (row: { item_code: string; category: string }) =>
  row.item_code + "||" + row.category;

/**
 * What the typed figure means in each mode, and whether it is usable.
 *
 * A percentage or a rupee change may be negative — that is a price CUT, the
 * second most common revision there is. Only an absolute rate cannot be.
 */
const parseValue = (raw: string, mode: RateMode) => {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false as const, value: NaN };
  const value = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(value)) return { ok: false as const, value: NaN };
  if (mode === "set" && value < 0) return { ok: false as const, value };
  return { ok: true as const, value };
};

/** The new rate a base rate lands on. Mirrors `_revised_rate` on the server. */
const applyMode = (base: number, mode: RateMode, value: number) => {
  if (mode === "set") return value;
  if (mode === "percent") return base * (1 + value / 100);
  return base + value;
};

export default function BulkRateEditor({ selections }: { selections: PartySelection[] }) {
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

  const [mode, setMode] = useState<RateMode>("set");
  const [applyTo, setApplyTo] = useState<ApplyTo>("existing");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [varietyFilter, setVarietyFilter] = useState("ALL");
  const [ticked, setTicked] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fillValue, setFillValue] = useState("");
  const [confirming, setConfirming] = useState(false);
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

  /* Ticked but nothing typed: the row is silently ignored, which on a price
     change is worth saying out loud rather than reporting "12 updated" for 20. */
  const tickedWithoutValue = activeTicked.length - pending.length;

  /** Parties the run will touch — the reach of the categories in play. */
  const partiesTouched = useMemo(() => {
    if (pending.length === 0) return 0;
    const keys = new Set<string>();
    pending.forEach(({ row }) => keys.add(row.category));
    return selections.filter(
      (selection) => !selection.category || keys.has(selection.category),
    ).length;
  }, [pending, selections]);

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
        title: "Rates applied",
        message:
          data.updated +
          " rate" +
          (data.updated === 1 ? "" : "s") +
          " updated across " +
          data.parties +
          " parties" +
          (data.created ? ", " + data.created + " newly assigned" : "") +
          ".",
      });
    },
    onError: (error) => {
      console.error("Error applying bulk rates:", error);
      setConfirming(false);
      showToast({
        title: "Could not apply the rates",
        message: "Nothing was changed. Check your connection and try again.",
      });
    },
  });

  const valueLabel =
    mode === "set" ? "New rate (₹)" : mode === "percent" ? "Change (%)" : "Change (₹)";

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
          <Button variant="ghost" size="xs" onClick={() => void refetch()} disabled={isPending}>
            {isPending ? "Loading…" : "Refresh"}
          </Button>
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

          {/* ── What the figures in the table mean ── */}
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5 rounded-card border border-line bg-surface px-3 py-2.5">
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
          </div>

          {applyTo === "all" ? (
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
                <TableHead className="w-36 text-right">{valueLabel}</TableHead>
                <TableHead className="text-right">Becomes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableEmpty colSpan={6}>Loading the assigned products…</TableEmpty>
              ) : visibleRows.length === 0 ? (
                <TableEmpty colSpan={6}>
                  {rows.length === 0
                    ? "These parties have no products assigned yet. Use Add products to all above."
                    : "No product matches these filters."}
                </TableEmpty>
              ) : (
                visibleRows.map((row) => {
                  const key = rowKey(row);
                  const isTicked = tickedSet.has(key);
                  const raw = values[key] ?? "";
                  const parsed = parseValue(raw, mode);
                  const bad = raw.trim() !== "" && !parsed.ok;
                  const varies = row.distinct_rates > 1;

                  return (
                    <TableRow key={key} className={isTicked ? "bg-brand-soft/40" : undefined}>
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
                        {row.party_count}
                        <span className="text-subtle"> / {row.eligible_parties}</span>
                        {row.missing_parties > 0 ? (
                          <Badge tone="hold" className="ml-1.5">
                            {row.missing_parties} without
                          </Badge>
                        ) : null}
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
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <p className="m-0 text-[12px] text-subtle">
              {pending.length === 0
                ? "Tick the products to re-price and enter a figure for each."
                : pending.length +
                  " product" +
                  (pending.length === 1 ? "" : "s") +
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
              disabled={pending.length === 0 || apply.isPending}
              title={
                pending.length === 0 ? "Tick a product and enter a figure first." : undefined
              }
            >
              Review and apply
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
          <DialogContent title="Apply rates" size="md">
            <DialogHeader>
              <DialogTitle>
                Change {pending.length} product{pending.length === 1 ? "" : "s"} across{" "}
                {partiesTouched} parties?
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              {applyTo === "all" ? (
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
                {pending.map(({ row, value }) => (
                  <li
                    key={rowKey(row)}
                    className="flex items-baseline justify-between gap-3 px-3 py-1.5"
                  >
                    <span className="min-w-0 truncate text-ink">{row.item_name}</span>
                    <span className="shrink-0 tabular-nums text-subtle">
                      {row.party_count} parties ·{" "}
                      <strong className="text-ink">
                        {mode === "set"
                          ? money(value)
                          : mode === "percent"
                            ? (value >= 0 ? "+" : "") + value + "%"
                            : (value >= 0 ? "+" : "") + money(value)}
                      </strong>
                    </span>
                  </li>
                ))}
              </ul>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirming(false)} disabled={apply.isPending}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => apply.mutate()}
                disabled={apply.isPending}
              >
                {apply.isPending ? "Applying…" : "Apply to " + partiesTouched + " parties"}
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
          <DialogContent title="Rate update result" size="md">
            <DialogHeader>
              <DialogTitle>
                {result.errors.length ? "Applied, with problems" : "Rates applied"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <div className="flex flex-wrap gap-4">
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ok">{result.updated}</strong>
                  rates changed
                </span>
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ink">{result.created}</strong>
                  newly assigned
                </span>
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ink">
                    {result.unchanged}
                  </strong>
                  already at that rate
                </span>
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ink">{result.skipped}</strong>
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
    </>
  );
}

