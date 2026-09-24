/**
 * Product Rates — turn a product on, turn it off, or change its rate, across
 * whichever parties you mean.
 *
 * One model, said once: FILTER THE PARTIES, PICK A PRODUCT IF YOU MEAN ONE,
 * TICK THE ROWS, ACT. Nothing on this page is a second way of choosing.
 *
 *   Product chosen   → one row per party holding it, with its rate and status.
 *   No product       → one row per product the filtered parties hold, with how
 *                      many hold it and at what spread. This is how "every
 *                      product for Raminder's parties goes up 5%" is one pass.
 *
 * The three actions are the same either way, and they act on the ticked rows
 * only. The filter bar (assigned user, state, group) defines which parties
 * are in scope; the search box only narrows what is on screen.
 *
 * Bulk Product Assignment carries a wider toolkit (assigning to new parties,
 * copying catalogues, a transfer-list picker). This page deliberately carries
 * none of it: it is the desk tool for the three revisions billing makes every
 * week, laid out so the next click is never in doubt.
 *
 * The endpoints are the ones `users/views/bulk_assignments.py` already serves:
 *
 *   bulk-product/parties/     who holds this product, at what rate, on or off
 *   bulk-party/products/      what these parties hold (include_inactive so a
 *                             turned-off product can be turned back on)
 *   bulk-party/set-active/    turn off / turn on
 *   bulk-party/update-rates/  change rates (set, by %, by ₹)
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineCurrencyRupee,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
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
  FilterMultiSelect,
  FilterSearch,
  FilterSearchSelect,
  FilterSegmented,
} from "@/components/ui/filter-bar";
import { Field, Input } from "@/components/ui/form";
import { Card, EmptyState, Notice, Page, PageHeader } from "@/components/ui/page";
import { SegmentedControl } from "@/components/ui/segmented";
import { TableSkeleton } from "@/components/ui/skeleton";
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
import { useSapParties, useSapProducts } from "@/lib/sapQueries";
import { useUserList } from "@/lib/authQueries";
import { userService } from "@/services/userService";
import api from "../services/api";

import type { PartySelection } from "./partyProducts/BulkRateEditor";
import { RATE_MODES, applyMode, parseValue, type RateMode } from "./partyProducts/rateMath";

/* ── Shapes the server sends ────────────────────────────────────────────── */

/** One party holding the chosen product — `bulk-product/parties/`. */
type PartyRow = {
  card_code: string;
  card_name: string;
  state: string | null;
  main_group: string | null;
  category: string;
  basic_rate: number;
  is_active: boolean;
};

type ProductBlock = {
  item_code: string;
  item_name: string;
  category: string;
  brand: string | null;
  sal_pack_unit: string | null;
  product_active: boolean;
  party_count: number;
  active_count: number;
  inactive_count: number;
  parties: PartyRow[];
};

/** One product held across the parties in scope — `bulk-party/products/`. */
type ProductRow = {
  item_code: string;
  item_name: string;
  category: string;
  brand: string | null;
  sal_pack_unit: string | null;
  party_count: number;
  active_count: number;
  inactive_count: number;
  eligible_parties: number;
  holders: { card_code: string; basic_rate: number; is_active: boolean }[];
  min_rate: number;
  max_rate: number;
  distinct_rates: number;
  common_rate: number;
};

type ApplyResult = {
  updated: number;
  created?: number;
  unchanged: number;
  skipped?: number;
  missing?: number;
  errors: string[];
};

/** What the last action did, shown in place rather than in a second dialog. */
type Outcome = {
  title: string;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: string[];
};

type Action = "on" | "off" | "rate";
type StatusFilter = "all" | "on" | "off";

const money = (value: number) => "₹" + Number(value || 0).toFixed(2);
const itemKey = (item: { item_code: string; category: string }) =>
  item.item_code + "||" + item.category;
const plural = (count: number, word: string) =>
  count + " " + (count === 1 ? word : word.endsWith("y") ? word.slice(0, -1) + "ies" : word + "s");

/** Rows painted before "Show the remaining N". The search runs over all of them. */
const ROWS_BEFORE_MORE = 100;

/** How many names a confirmation lists before it says "and N more". */
const NAMES_IN_CONFIRM = 8;

/** One line, one status chip — the shared compact density is taller than this needs. */
const CELL = "py-1.5";

/** The backend's own explanation of a 400, or a plain fallback. */
const errorMessage = (error: unknown) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
  "Nothing was changed. Check your connection and try again.";

const sum = (results: ApplyResult[], pick: (result: ApplyResult) => number | undefined) =>
  results.reduce((total, result) => total + (pick(result) ?? 0), 0);

const toOutcome = (title: string, results: ApplyResult[]): Outcome => ({
  title,
  updated: sum(results, (r) => r.updated) + sum(results, (r) => r.created),
  unchanged: sum(results, (r) => r.unchanged),
  skipped: sum(results, (r) => r.skipped) + sum(results, (r) => r.missing),
  errors: results.flatMap((result) => result.errors ?? []),
});

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function Product_Rates() {
  const queryClient = useQueryClient();
  const { items: products } = useSapProducts();
  const { items: parties } = useSapParties();
  const { users } = useUserList();

  const [productKey, setProductKey] = useState<string | "">("");
  const [userId, setUserId] = useState<number | "">("");
  const [states, setStates] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  /**
   * Ticks are stamped with the scope they were made in. Change the product or
   * any party filter and the stamp no longer matches, so the ticks are gone —
   * without an effect, and without a tick made against one list surviving
   * into another where the same code means a different row.
   */
  const scopeKey = [productKey, userId, states.join(","), groups.join(","), status].join("|");
  const [ticks, setTicks] = useState<{ scope: string; keys: string[] }>({
    scope: scopeKey,
    keys: [],
  });
  const ticked = useMemo(
    () => new Set(ticks.scope === scopeKey ? ticks.keys : []),
    [ticks, scopeKey],
  );
  const setTicked = (keys: string[]) => setTicks({ scope: scopeKey, keys });

  const [action, setAction] = useState<Action | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Product rows opened to show WHICH parties hold them. Keyed like ticks are,
  // and for the same reason: a different scope is a different list.
  const [expanded, setExpanded] = useState<{ scope: string; keys: string[] }>({
    scope: scopeKey,
    keys: [],
  });
  const opened = new Set(expanded.scope === scopeKey ? expanded.keys : []);
  const toggleOpen = (key: string) =>
    setExpanded({
      scope: scopeKey,
      keys: opened.has(key) ? [...opened].filter((k) => k !== key) : [...opened, key],
    });
  const [showScope, setShowScope] = useState(false);

  /* ── Filter options ── */

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: itemKey(product),
        label: product.item_name || product.item_code,
        hint: [product.item_code, product.category, product.brand].filter(Boolean).join(" · "),
      })),
    [products],
  );

  const facet = (pick: (party: (typeof parties)[number]) => string | null | undefined) =>
    [...new Set(parties.map(pick).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value }));
  const stateOptions = useMemo(() => facet((party) => party.state), [parties]); // eslint-disable-line react-hooks/exhaustive-deps
  const groupOptions = useMemo(() => facet((party) => party.main_group), [parties]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Scope: which parties this page means ── */

  // `category=all`: the same card_code can be assigned under OIL and BEVERAGES
  // and the endpoint's default scoping returns only one of them.
  const userParties = useQuery({
    queryKey: ["users", userId, "parties", "all"],
    enabled: userId !== "",
    queryFn: async () => {
      const response = await userService.getUserParties(userId as number, "all");
      const rows = (response?.data?.parties ?? []) as { card_code: string }[];
      return new Set(rows.map((row) => row.card_code));
    },
  });

  const filtered = userId !== "" || states.length > 0 || groups.length > 0;

  const scope = useMemo(() => {
    if (!filtered) return null;
    const codes = userParties.data;
    return parties.filter(
      (party) =>
        (!codes || codes.has(party.card_code)) &&
        (states.length === 0 || states.includes(party.state || "")) &&
        (groups.length === 0 || groups.includes(party.main_group || "")),
    );
  }, [filtered, parties, userParties.data, states, groups]);

  const partyByCode = useMemo(() => {
    const map = new Map<string, (typeof parties)[number]>();
    parties.forEach((party) => {
      if (!map.has(party.card_code)) map.set(party.card_code, party);
    });
    return map;
  }, [parties]);

  const scopeCodes = useMemo(
    () => (scope ? new Set(scope.map((party) => party.card_code)) : null),
    [scope],
  );

  const selections: PartySelection[] = useMemo(() => {
    const seen = new Set<string>();
    const out: PartySelection[] = [];
    (scope ?? []).forEach((party) => {
      const key = party.card_code + "||" + (party.category || "");
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ card_code: party.card_code, category: party.category || null });
    });
    return out;
  }, [scope]);

  const waitingForUser = userId !== "" && userParties.isPending;

  /* ── Data, one direction or the other ── */

  const product = useMemo(() => {
    if (!productKey) return null;
    const [item_code, category] = productKey.split("||");
    return { item_code, category };
  }, [productKey]);

  const byProduct = useQuery({
    queryKey: ["party", "product-parties", productKey],
    enabled: product !== null,
    queryFn: async () => {
      const response = await api.post("/auth/bulk-product/parties/", { items: [product] });
      const blocks = (response.data?.data?.items || []) as ProductBlock[];
      return blocks[0] ?? null;
    },
  });

  const byParties = useQuery({
    queryKey: ["party", "bulk-products", "scope", userId, states, groups, selections.length],
    enabled: product === null && selections.length > 0,
    queryFn: async () => {
      const response = await api.post("/auth/bulk-party/products/", {
        party_selections: selections,
        include_inactive: true,
      });
      return (response.data?.data?.products || []) as ProductRow[];
    },
  });

  const needle = search.trim().toLowerCase();
  const matchesSearch = (...fields: (string | null | undefined)[]) =>
    !needle || fields.some((field) => field && field.toLowerCase().includes(needle));

  const partyRows = useMemo(() => {
    const block = byProduct.data;
    if (!block) return [];
    return block.parties.filter(
      (party) =>
        (!scopeCodes || scopeCodes.has(party.card_code)) &&
        (status === "all" || (status === "on") === party.is_active) &&
        matchesSearch(party.card_name, party.card_code, party.state, party.main_group),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byProduct.data, scopeCodes, status, needle]);

  const productRows = useMemo(
    () =>
      (byParties.data ?? []).filter((row) =>
        matchesSearch(row.item_name, row.item_code, row.category, row.brand),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byParties.data, needle],
  );

  const rowKeys = product ? partyRows.map((row) => row.card_code) : productRows.map(itemKey);
  const tickedParties = partyRows.filter((row) => ticked.has(row.card_code));
  const tickedProducts = productRows.filter((row) => ticked.has(itemKey(row)));
  const tickedCount = product ? tickedParties.length : tickedProducts.length;
  const allTicked = rowKeys.length > 0 && rowKeys.every((key) => ticked.has(key));

  const toggleAll = () => setTicked(allTicked ? [] : rowKeys);
  const toggleOne = (key: string) =>
    setTicked(ticked.has(key) ? [...ticked].filter((k) => k !== key) : [...ticked, key]);

  /* ── The three actions ── */

  const finish = (outcomeToShow: Outcome) => {
    setAction(null);
    setTicked([]);
    setOutcome(outcomeToShow);
    void queryClient.invalidateQueries({ queryKey: ["party"] });
    showToast({
      title: outcomeToShow.title,
      message: plural(outcomeToShow.updated, "assignment") + " changed.",
    });
  };

  const fail = (error: unknown) => {
    console.error("Product Rates action failed:", error);
    setAction(null);
    setOutcome({
      title: "Nothing was changed",
      updated: 0,
      unchanged: 0,
      skipped: 0,
      errors: [errorMessage(error)],
    });
  };

  const setActive = useMutation({
    mutationFn: async (isActive: boolean): Promise<ApplyResult[]> => {
      if (product) {
        const response = await api.post("/auth/bulk-party/set-active/", {
          is_active: isActive,
          items: [product],
          party_selections: tickedParties.map((row) => ({
            card_code: row.card_code,
            category: row.category,
          })),
        });
        return [(response.data?.data || {}) as ApplyResult];
      }
      // One request per product, each naming only the parties it can change:
      // the endpoint takes one party list for all its items, and a party that
      // does not hold an item is reported as an error, so one list for three
      // products would file a complaint for every party missing any of them.
      const results: ApplyResult[] = [];
      for (const row of tickedProducts) {
        const targets = row.holders.filter((holder) => holder.is_active !== isActive);
        if (targets.length === 0) continue;
        const response = await api.post("/auth/bulk-party/set-active/", {
          is_active: isActive,
          items: [{ item_code: row.item_code, category: row.category }],
          party_selections: targets.map((holder) => ({
            card_code: holder.card_code,
            category: row.category,
          })),
        });
        results.push((response.data?.data || {}) as ApplyResult);
      }
      return results;
    },
    onSuccess: (results, isActive) => finish(toOutcome(isActive ? "Turned on" : "Turned off", results)),
    onError: fail,
  });

  const reprice = useMutation({
    mutationFn: async ({ mode, values }: { mode: RateMode; values: Record<string, number> }) => {
      // Sellable rows only, in both directions: a turned-off row keeps its
      // rate, the dialog counted only the parties that will move, and the
      // request should name exactly those.
      const body = product
        ? {
            party_selections: tickedParties
              .filter((row) => row.is_active)
              .map((row) => ({ card_code: row.card_code, category: row.category })),
            items: [{ ...product, basic_rate: values[productKey] }],
          }
        : {
            party_selections: tickedProducts.flatMap((row) =>
              row.holders
                .filter((holder) => holder.is_active)
                .map((holder) => ({ card_code: holder.card_code, category: row.category })),
            ),
            items: tickedProducts.map((row) => ({
              item_code: row.item_code,
              category: row.category,
              basic_rate: values[itemKey(row)],
            })),
          };
      const response = await api.post("/auth/bulk-party/update-rates/", {
        ...body,
        rate_mode: mode,
        apply_to: "existing",
      });
      return [(response.data?.data || {}) as ApplyResult];
    },
    onSuccess: (results) => finish(toOutcome("Rates changed", results)),
    onError: fail,
  });

  const busy = setActive.isPending || reprice.isPending;

  /* ── What the table shows ── */

  const block = byProduct.data;
  const loading = product
    ? byProduct.isPending
    : waitingForUser || (selections.length > 0 && byParties.isPending);
  const rows = product ? partyRows : productRows;
  const shown = showAll ? rows : rows.slice(0, ROWS_BEFORE_MORE);

  // Can the ticked rows take the action? Disabled buttons explain themselves.
  const canTurnOn = product
    ? tickedParties.some((row) => !row.is_active)
    : tickedProducts.some((row) => row.inactive_count > 0);
  const canTurnOff = product
    ? tickedParties.some((row) => row.is_active)
    : tickedProducts.some((row) => row.active_count > 0);
  const canReprice = product
    ? tickedParties.some((row) => row.is_active)
    : tickedProducts.some((row) => row.active_count > 0);

  const scopeNote = !filtered
    ? "All parties"
    : waitingForUser
      ? "Reading their parties…"
      : plural(scope?.length ?? 0, "party") + " in scope";

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Order Config" }, { label: "Product Rates" }]} />
      <PageHeader
        eyebrow="Order Config"
        title="Product Rates"
        description="Filter the parties, pick a product if you mean one, tick the rows, then turn on, turn off or change the rate."
      />

      <FilterBar>
        <FilterSearchSelect
          label="Product"
          value={productKey}
          onChange={(next) => {
            setProductKey(next);
            setShowAll(false);
          }}
          options={productOptions}
          placeholder="All products"
          searchPlaceholder="Search products…"
          clearLabel="All products"
          maxShown={60}
          fieldClassName="min-w-[280px]"
        />
        <FilterSearchSelect
          label="Assigned to"
          value={userId}
          onChange={setUserId}
          options={users.map((user) => ({
            value: user.id,
            label: user.name || user.username,
            hint: user.username,
          }))}
          placeholder="Any user"
          searchPlaceholder="Search users…"
          clearLabel="Any user"
          maxShown={60}
          fieldClassName="min-w-[200px]"
        />
        <FilterMultiSelect
          label="State"
          value={states}
          onChange={setStates}
          options={stateOptions}
          placeholder="Any state"
          searchable
          fieldClassName="min-w-[170px]"
        />
        <FilterMultiSelect
          label="Group"
          value={groups}
          onChange={setGroups}
          options={groupOptions}
          placeholder="Any group"
          searchable
          fieldClassName="min-w-[170px]"
        />
        {product ? (
          <FilterSegmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "on", label: "Sellable" },
              { value: "off", label: "Turned off" },
            ]}
          />
        ) : null}
        <FilterSearch
          label="Search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setShowAll(false);
          }}
          placeholder={product ? "Party, code or state…" : "Product or code…"}
          fieldClassName="min-w-[200px]"
        />
        {filtered && !waitingForUser ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setShowScope(true)}
            className="self-end"
            title="See which parties the filters matched"
          >
            {scopeNote}
          </Button>
        ) : (
          <FilterCount>{scopeNote}</FilterCount>
        )}
      </FilterBar>

      {outcome ? (
        <OutcomeNotice outcome={outcome} onDismiss={() => setOutcome(null)} />
      ) : null}

      {!product && !filtered ? (
        <Card>
          <EmptyState
            icon={HiOutlineCurrencyRupee}
            title="Choose a product, or narrow the parties"
            hint="Pick a product to see every party it is assigned to. Or filter by user, state or group to see everything those parties hold."
          />
        </Card>
      ) : loading ? (
        <Card className="p-0">
          <TableSkeleton
            columns={5}
            label={product ? "Finding the parties assigned this product" : "Finding what these parties hold"}
          />
        </Card>
      ) : (
        <Card className="p-0">
          {/* ── Action bar ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <p className="m-0 text-[12.5px] text-subtle">
              {product && block ? (
                <>
                  <span className="font-medium text-ink">{block.item_name}</span>
                  <span className="ml-1.5 font-mono text-[11px]">{block.item_code}</span>
                  {" · "}
                  {plural(block.party_count, "party")} assigned
                  {block.inactive_count ? ` · ${block.inactive_count} turned off` : ""}
                  {!block.product_active ? (
                    <Badge tone="bad" className="ml-2">
                      Not an active SAP product
                    </Badge>
                  ) : null}
                </>
              ) : (
                <>
                  {plural(productRows.length, "product")} held by{" "}
                  {plural(scope?.length ?? 0, "party")}
                </>
              )}
            </p>
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-subtle" aria-live="polite">
                {tickedCount === 0
                  ? "Tick rows to act on them"
                  : `${tickedCount} of ${rows.length} ticked`}
              </span>
              {tickedCount > 0 ? (
                <Button size="xs" variant="ghost" onClick={() => setTicked([])} disabled={busy}>
                  Clear
                </Button>
              ) : null}
              <Button
                size="xs"
                onClick={() => setAction("on")}
                disabled={busy || !canTurnOn}
                title={
                  tickedCount === 0
                    ? "Tick the rows first."
                    : !canTurnOn
                      ? "Everything ticked is already sellable."
                      : undefined
                }
              >
                Turn on
              </Button>
              <Button
                size="xs"
                onClick={() => setAction("off")}
                disabled={busy || !canTurnOff}
                title={
                  tickedCount === 0
                    ? "Tick the rows first."
                    : !canTurnOff
                      ? "Everything ticked is already turned off."
                      : undefined
                }
              >
                Turn off
              </Button>
              <Button
                size="xs"
                variant="primary"
                onClick={() => setAction("rate")}
                disabled={busy || !canReprice}
                title={
                  tickedCount === 0
                    ? "Tick the rows first."
                    : !canReprice
                      ? "A turned-off assignment keeps its rate; turn it on to re-price it."
                      : undefined
                }
              >
                Change rate…
              </Button>
            </span>
          </div>

          {/* ── Rows ── */}
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer accent-brand align-middle"
                    checked={allTicked}
                    onChange={toggleAll}
                    disabled={rows.length === 0}
                    aria-label={
                      product
                        ? `Tick all ${rows.length} parties shown`
                        : `Tick all ${rows.length} products shown`
                    }
                  />
                </TableHead>
                {product ? (
                  <>
                    <TableHead>Party</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Parties</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Turned off</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={6}>
                  {product
                    ? block && block.parties.length === 0
                      ? "No party is assigned this product."
                      : "No party here matches these filters."
                    : (byParties.data ?? []).length === 0
                      ? "These parties hold no products."
                      : "No product here matches that search."}
                </TableEmpty>
              ) : product ? (
                (shown as PartyRow[]).map((row) => (
                  <TableRow key={row.card_code} data-selected={ticked.has(row.card_code) || undefined}>
                    <TableCell className={CELL}>
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-brand align-middle"
                        checked={ticked.has(row.card_code)}
                        onChange={() => toggleOne(row.card_code)}
                        aria-label={"Tick " + row.card_name}
                      />
                    </TableCell>
                    <TableCell className={CELL}>
                      <span className="font-medium text-ink">{row.card_name}</span>
                      <span className="ml-1.5 font-mono text-[10.5px] text-subtle">{row.card_code}</span>
                    </TableCell>
                    <TableCell className={CELL + " text-subtle"}>{row.state || "—"}</TableCell>
                    <TableCell className={CELL + " text-subtle"}>{row.main_group || "—"}</TableCell>
                    <TableCell className={CELL + " text-right tabular-nums"}>{money(row.basic_rate)}</TableCell>
                    <TableCell className={CELL + " text-right"}>
                      {row.is_active ? <Badge tone="ok">Sellable</Badge> : <Badge tone="hold">Turned off</Badge>}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                (shown as ProductRow[]).map((row) => {
                  const key = itemKey(row);
                  const isOpen = opened.has(key);
                  return [
                    <TableRow key={key} data-selected={ticked.has(key) || undefined}>
                      <TableCell className={CELL}>
                        <input
                          type="checkbox"
                          className="size-4 cursor-pointer accent-brand align-middle"
                          checked={ticked.has(key)}
                          onChange={() => toggleOne(key)}
                          aria-label={"Tick " + row.item_name}
                        />
                      </TableCell>
                      <TableCell className={CELL}>
                        {/* The reset classes are not optional here: the UA
                            button chrome lands through the layered preflight,
                            so a bare <button> renders as a grey box. */}
                        <button
                          type="button"
                          onClick={() => toggleOpen(key)}
                          aria-expanded={isOpen}
                          aria-label={(isOpen ? "Hide" : "Show") + " the parties holding " + row.item_name}
                          className="inline-flex appearance-none items-center gap-1.5 border-0 bg-transparent p-0 text-left [font-family:inherit]"
                        >
                          {isOpen ? (
                            <HiOutlineChevronDown className="size-3.5 shrink-0 text-subtle" aria-hidden />
                          ) : (
                            <HiOutlineChevronRight className="size-3.5 shrink-0 text-subtle" aria-hidden />
                          )}
                          <span className="font-medium text-ink">{row.item_name}</span>
                        </button>
                        <span className="ml-1.5 font-mono text-[10.5px] text-subtle">{row.item_code}</span>
                        <span className="ml-1.5 text-[11px] text-subtle">
                          {[row.category, row.sal_pack_unit].filter(Boolean).join(" · ")}
                        </span>
                      </TableCell>
                      <TableCell className={CELL + " text-right tabular-nums text-subtle"}>
                        {row.party_count} of {row.eligible_parties}
                      </TableCell>
                      <TableCell className={CELL + " text-right tabular-nums"}>
                        {row.active_count === 0 ? (
                          <span className="text-subtle">{money(row.common_rate)} kept</span>
                        ) : row.distinct_rates > 1 ? (
                          <>
                            {money(row.min_rate)} – {money(row.max_rate)}
                            <span className="ml-1.5 text-[11px] text-subtle">{row.distinct_rates} rates</span>
                          </>
                        ) : (
                          money(row.common_rate)
                        )}
                      </TableCell>
                      <TableCell className={CELL + " text-right tabular-nums"}>
                        {row.inactive_count > 0 ? (
                          <Badge tone="hold">{row.inactive_count}</Badge>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </TableCell>
                    </TableRow>,
                    isOpen ? (
                      <TableRow key={key + "::holders"} className="bg-surface/60 hover:bg-surface/60">
                        <TableCell />
                        <TableCell colSpan={4} className="py-2">
                          <HolderList
                            holders={row.holders}
                            names={partyByCode}
                            missing={Math.max(row.eligible_parties - row.party_count, 0)}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null,
                  ];
                })
              )}
            </TableBody>
          </Table>

          {rows.length > shown.length ? (
            <Button size="xs" variant="ghost" onClick={() => setShowAll(true)} className="w-full">
              Show the remaining {rows.length - shown.length}
            </Button>
          ) : null}
        </Card>
      )}

      {/* ── Which parties the filters matched ── */}
      <Dialog open={showScope} onOpenChange={setShowScope}>
        {showScope && scope ? (
          <DialogContent title="Parties in scope" size="md">
            <DialogHeader>
              <DialogTitle>{plural(scope.length, "party")} in scope</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <ul className="m-0 max-h-[60vh] list-none space-y-1 overflow-y-auto p-0 text-[13px]">
                {[...scope]
                  .sort((a, b) => a.card_name.localeCompare(b.card_name))
                  .map((party) => (
                    <li key={party.card_code + (party.category || "")} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        <span className="text-ink">{party.card_name}</span>
                        <span className="ml-1.5 font-mono text-[10.5px] text-subtle">{party.card_code}</span>
                      </span>
                      <span className="shrink-0 text-subtle">
                        {[party.state, party.main_group].filter(Boolean).join(" · ")}
                      </span>
                    </li>
                  ))}
              </ul>
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => setShowScope(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* ── Turn on / off ── */}
      <Dialog
        open={action === "on" || action === "off"}
        onOpenChange={(next) => {
          if (!next && !busy) setAction(null);
        }}
      >
        {(action === "on" || action === "off") && (
          <DialogContent title={action === "on" ? "Turn on" : "Turn off"} size="sm">
            <DialogHeader>
              <DialogTitle>
                {action === "on" ? "Turn on " : "Turn off "}
                {product && block
                  ? `${block.item_name} for ${plural(tickedParties.filter((r) => r.is_active !== (action === "on")).length, "party")}?`
                  : `${plural(tickedProducts.length, "product")} for the parties in scope?`}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <NameList
                names={
                  product
                    ? tickedParties
                        .filter((row) => row.is_active !== (action === "on"))
                        .map((row) => row.card_name)
                    : tickedProducts.map((row) => {
                        const count = action === "on" ? row.inactive_count : row.active_count;
                        return `${row.item_name} — ${plural(count, "party")}`;
                      })
                }
              />
              <p className="m-0 text-[12.5px] text-subtle">
                {action === "off"
                  ? "Rates are kept, so turning it back on restores them."
                  : "Each assignment comes back at the rate it had when it was turned off."}
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setAction(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant={action === "on" ? "primary" : "danger"}
                onClick={() => setActive.mutate(action === "on")}
                disabled={busy}
              >
                {busy ? "Applying…" : action === "on" ? "Turn on" : "Turn off"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Change rate ── */}
      <Dialog
        open={action === "rate"}
        onOpenChange={(next) => {
          if (!next && !busy) setAction(null);
        }}
      >
        {action === "rate" && (
          <RateDialog
            product={product && block ? { key: productKey, block, parties: tickedParties.filter((r) => r.is_active) } : null}
            products={tickedProducts.filter((row) => row.active_count > 0)}
            busy={busy}
            onCancel={() => setAction(null)}
            onApply={(mode, values) => reprice.mutate({ mode, values })}
          />
        )}
      </Dialog>
    </Page>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

/**
 * The parties holding one product, under its row.
 *
 * Names come from the SAP party list the page already holds. The endpoint
 * returns codes only, on purpose, to stay at two queries however many parties
 * are selected. A holder the list does not know keeps its code.
 */
function HolderList({
  holders,
  names,
  missing,
}: {
  holders: ProductRow["holders"];
  names: Map<string, { card_name: string; state?: string | null }>;
  missing: number;
}) {
  const rows = holders
    .map((holder) => ({
      ...holder,
      name: names.get(holder.card_code)?.card_name ?? holder.card_code,
      state: names.get(holder.card_code)?.state ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-1.5">
      <ul className="m-0 grid list-none gap-x-6 gap-y-0.5 p-0 text-[12.5px] [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {rows.map((holder) => (
          <li key={holder.card_code} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className={holder.is_active ? "text-ink" : "text-subtle line-through"}>
                {holder.name}
              </span>
              <span className="ml-1.5 font-mono text-[10.5px] text-subtle">{holder.card_code}</span>
              {holder.state ? <span className="ml-1.5 text-[11px] text-subtle">{holder.state}</span> : null}
            </span>
            <span className="shrink-0 tabular-nums">
              {money(holder.basic_rate)}
              {!holder.is_active ? <span className="ml-1.5 text-[11px] text-hold">off</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {missing > 0 ? (
        <p className="m-0 text-[11.5px] text-subtle">
          {plural(missing, "party")} in scope {missing === 1 ? "does" : "do"} not hold this product.
        </p>
      ) : null}
    </div>
  );
}

function NameList({ names }: { names: string[] }) {
  const head = names.slice(0, NAMES_IN_CONFIRM);
  return (
    <ul className="m-0 list-none space-y-0.5 p-0 text-[13px] text-body">
      {head.map((name, index) => (
        <li key={index}>{name}</li>
      ))}
      {names.length > head.length ? (
        <li className="text-subtle">and {names.length - head.length} more</li>
      ) : null}
    </ul>
  );
}

function OutcomeNotice({ outcome, onDismiss }: { outcome: Outcome; onDismiss: () => void }) {
  const failed = outcome.errors.length > 0;
  return (
    <Notice tone={failed ? (outcome.updated ? "hold" : "bad") : "ok"} title={outcome.title}>
      <span className="inline-flex flex-wrap items-center gap-x-3">
        <span>{plural(outcome.updated, "assignment")} changed</span>
        {outcome.unchanged ? <span>{outcome.unchanged} already like that</span> : null}
        {outcome.skipped ? <span>{outcome.skipped} skipped</span> : null}
        {failed ? <span>{plural(outcome.errors.length, "problem")}</span> : null}
        <Button size="xs" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </span>
      {failed ? (
        <ul className="m-0 mt-2 max-h-40 list-none overflow-y-auto p-0 text-[12px]">
          {outcome.errors.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      ) : null}
    </Notice>
  );
}

/**
 * The rate dialog. In `set` mode each product gets its own figure — one
 * product needs one box, three products need three — because "set them all
 * to ₹180" is rarely what anyone means across different products. In `%` and
 * `₹` modes one figure moves every party's OWN rate, which is the whole point
 * of those modes.
 */
function RateDialog({
  product,
  products,
  busy,
  onCancel,
  onApply,
}: {
  product: { key: string; block: ProductBlock; parties: PartyRow[] } | null;
  products: ProductRow[];
  busy: boolean;
  onCancel: () => void;
  onApply: (mode: RateMode, values: Record<string, number>) => void;
}) {
  const [mode, setMode] = useState<RateMode>("set");
  const [single, setSingle] = useState("");
  const [perProduct, setPerProduct] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((row) => [itemKey(row), String(row.common_rate)])),
  );

  const usesPerProduct = !product && mode === "set";
  const parsedSingle = parseValue(single, mode);
  const parsedPer = Object.fromEntries(
    products.map((row) => [itemKey(row), parseValue(perProduct[itemKey(row)] ?? "", "set")]),
  );
  const ready = usesPerProduct
    ? products.length > 0 && products.every((row) => parsedPer[itemKey(row)].ok)
    : parsedSingle.ok;

  const partyCount = product
    ? product.parties.length
    : new Set(products.flatMap((row) => row.holders.filter((h) => h.is_active).map((h) => h.card_code))).size;

  const values = (): Record<string, number> =>
    usesPerProduct
      ? Object.fromEntries(products.map((row) => [itemKey(row), parsedPer[itemKey(row)].value]))
      : Object.fromEntries(
          (product ? [product.key] : products.map(itemKey)).map((key) => [key, parsedSingle.value]),
        );

  const unit = mode === "percent" ? "%" : "₹";
  const label = mode === "set" ? "New rate" : mode === "percent" ? "Change by %" : "Change by ₹";

  return (
    <DialogContent title="Change rate" size="md">
      <DialogHeader>
        <DialogTitle>
          Change the rate of{" "}
          {product ? product.block.item_name : plural(products.length, "product")} for{" "}
          {plural(partyCount, "party")}
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={RATE_MODES}
          size="xs"
          aria-label="How the figure applies"
        />

        {usesPerProduct ? (
          <div className="space-y-2">
            {products.map((row) => {
              const key = itemKey(row);
              return (
                <Field key={key} label={row.item_name} hint={row.distinct_rates > 1 ? `Currently ${money(row.min_rate)} – ${money(row.max_rate)} across ${plural(row.active_count, "party")}` : `Currently ${money(row.common_rate)} for ${plural(row.active_count, "party")}`}>
                  {(control) => (
                    <Input
                      {...control}
                      inputMode="decimal"
                      value={perProduct[key] ?? ""}
                      onChange={(event) =>
                        setPerProduct((prev) => ({ ...prev, [key]: event.target.value }))
                      }
                      className="max-w-[160px] tabular-nums"
                    />
                  )}
                </Field>
              );
            })}
          </div>
        ) : (
          <Field
            label={label}
            hint={
              mode === "set"
                ? "Every ticked party moves to this rate."
                : "Negative cuts the price. Each party moves from its own current rate."
            }
          >
            {(control) => (
              <Input
                {...control}
                inputMode="decimal"
                autoFocus
                value={single}
                onChange={(event) => setSingle(event.target.value)}
                placeholder={mode === "percent" ? "e.g. 5 or -2.5" : mode === "amount" ? "e.g. 4 or -3" : "e.g. 180"}
                className="max-w-[160px] tabular-nums"
              />
            )}
          </Field>
        )}

        {/* Preview: the first few rows, current → new, so the figure is seen landing before it does. */}
        {ready && !usesPerProduct ? (
          <ul className="m-0 list-none space-y-0.5 p-0 text-[12.5px] tabular-nums text-body">
            {product
              ? product.parties.slice(0, NAMES_IN_CONFIRM).map((row) => (
                  <li key={row.card_code} className="flex justify-between gap-4">
                    <span className="truncate">{row.card_name}</span>
                    <span>
                      <span className="text-subtle">{money(row.basic_rate)}</span> →{" "}
                      <span className="font-medium text-ink">{money(applyMode(row.basic_rate, mode, parsedSingle.value))}</span>
                    </span>
                  </li>
                ))
              : products.slice(0, NAMES_IN_CONFIRM).map((row) => (
                  <li key={itemKey(row)} className="flex justify-between gap-4">
                    <span className="truncate">{row.item_name}</span>
                    <span>
                      <span className="text-subtle">
                        {row.distinct_rates > 1 ? `${money(row.min_rate)} – ${money(row.max_rate)}` : money(row.common_rate)}
                      </span>{" "}
                      →{" "}
                      <span className="font-medium text-ink">
                        {row.distinct_rates > 1
                          ? `${money(applyMode(row.min_rate, mode, parsedSingle.value))} – ${money(applyMode(row.max_rate, mode, parsedSingle.value))}`
                          : money(applyMode(row.common_rate, mode, parsedSingle.value))}
                      </span>
                    </span>
                  </li>
                ))}
            {(product ? product.parties.length : products.length) > NAMES_IN_CONFIRM ? (
              <li className="text-subtle">
                and {(product ? product.parties.length : products.length) - NAMES_IN_CONFIRM} more
              </li>
            ) : null}
          </ul>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => onApply(mode, values())} disabled={busy || !ready}>
          {busy
            ? "Applying…"
            : mode === "set"
              ? `Set for ${plural(partyCount, "party")}`
              : `Change by ${mode === "percent" ? parsedSingle.value + unit : unit + parsedSingle.value} for ${plural(partyCount, "party")}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
