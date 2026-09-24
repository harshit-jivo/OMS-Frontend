/**
 * Bulk Product Assignment — the same question from both ends.
 *
 * Party Product Assignment answers "what does THIS party buy". That is the right
 * shape for onboarding one vendor and the wrong shape for almost everything
 * else, so the bulk work lives here instead of being bolted onto it.
 *
 * Two tabs, because the job genuinely has two directions and neither is a view
 * of the other:
 *
 *   By product — pick products, see every party holding each and at what rate.
 *                This is the one that had no answer anywhere in the app, and it
 *                is how you find out who is still on last quarter's price, or
 *                withdraw a SKU from sale everywhere at once.
 *   By party   — pick parties, see what they hold between them, re-price it.
 *                Lifted unchanged from Party Product Assignment.
 *
 * "Turn off for every party" does NOT send a party list. One item is held by up
 * to 522 parties, past the server's own selection cap, and a list built when the
 * page loaded would miss a party assigned between then and the click. The server
 * resolves the holders inside the transaction that acts on them — see
 * `party_scope` in `users/views/bulk_assignments.py`.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineCube,
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
  MultiSelect,
  SearchSelect,
  type MultiSelectOption,
} from "@/components/ui/dropdown";
import { FilterBar, FilterCount, FilterMultiSelect } from "@/components/ui/filter-bar";
import { Field, Input } from "@/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Notice,
  Page,
  PageHeader,
} from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tab, TabList } from "@/components/ui/tabs";
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

import BulkRateEditor, { type PartySelection } from "./partyProducts/BulkRateEditor";

type ProductPartyRow = {
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
  variety: string | null;
  sal_pack_unit: string | null;
  product_active: boolean;
  party_count: number;
  active_count: number;
  inactive_count: number;
  min_rate: number;
  max_rate: number;
  distinct_rates: number;
  common_rate: number;
  parties: ProductPartyRow[];
};

type ActivationResult = {
  updated: number;
  unchanged: number;
  missing: number;
  parties: number;
  items: number;
  errors: string[];
};

/** What an about-to-run action is, held as one value so a second question
    cannot open over the first. */
type Pending = {
  block: ProductBlock;
  isActive: boolean;
  /** Empty means every party holding it — resolved by the server, not here. */
  cardCodes: string[];
};

/** A party the assign dialog may offer, with the fields its facets filter on. */
type PartyOption = MultiSelectOption<string> & {
  state: string;
  mainGroup: string;
  chain: string;
};

const money = (value: number) => "₹" + Number(value || 0).toFixed(2);
const itemKey = (item: { item_code: string; category: string }) =>
  item.item_code + "||" + item.category;

/**
 * Tighter than the shared `compact` density (`py-2.5`), for this table only.
 *
 * A party row is one line of text and a status chip; at 2.5 it measured 83px
 * tall with the code stacked under the name, and 54px once that was inlined.
 * Trimming the vertical padding here rather than changing `Table`'s compact
 * density keeps every other table in the app exactly as it is.
 */
const ROW_CELL = "py-1.5";

/**
 * Party lists are not all the same size, so the card cannot treat them alike.
 *
 * The average product is held by 22 parties and the largest by 521 — and the
 * page used to render every row of every chosen product at once, so picking
 * five of the big ones laid out well over two thousand rows with no way to
 * find anything in them.
 *
 * `AUTO_EXPAND_UPTO` keeps the common case exactly as it was: a product with
 * an ordinary list opens showing it, no extra click. Past that the card opens
 * collapsed, because a wall of rows is not a useful default view of 521
 * parties — the summary line answers most questions about them anyway.
 *
 * `ROWS_BEFORE_MORE` then caps what an expanded big list paints, so the DOM
 * cost is bounded whether you expand one card or ten. The search runs over the
 * WHOLE list, not the capped slice, so filtering is how you reach row 400.
 */
const AUTO_EXPAND_UPTO = 25;
const ROWS_BEFORE_MORE = 50;

/**
 * The card codes of every party assigned to a user.
 *
 * `user_party_assignments` and `party_product_assignments` both key on
 * (card_code, category), so a salesperson's book maps onto either direction of
 * this page without a join table. Both directions need it — adding a product
 * across a book, and withdrawing one from it — so the read lives here rather
 * than twice.
 *
 * `category=all` matters: the same card_code can be assigned under OIL and
 * BEVERAGES, and the endpoint's default scoping returns only one of them.
 */
function useUserPartyCodes() {
  return useMutation({
    mutationFn: async (userId: number) => {
      const response = await userService.getUserParties(userId, "all");
      const parties = (response?.data?.parties ?? []) as { card_code: string }[];
      return [...new Set(parties.map((party) => party.card_code))];
    },
  });
}

/** The user picker both shortcuts hang off. */
function UserPartyPicker({
  value,
  onChange,
  placeholder,
  busy,
  note,
}: {
  value: number | "";
  onChange: (next: number | "") => void;
  placeholder: string;
  busy: boolean;
  note: string | null;
}) {
  const { users } = useUserList();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <SearchSelect
        value={value}
        onChange={onChange}
        options={users.map((user) => ({
          value: user.id,
          label: user.name || user.username,
          hint: user.username,
        }))}
        placeholder={placeholder}
        searchPlaceholder="Search users…"
        maxShown={60}
        size="xs"
        className="min-w-[250px]"
        disabled={busy}
      />
      {busy ? (
        <span className="text-[12px] text-subtle">Reading their parties…</span>
      ) : note ? (
        <span className="text-[12px] text-subtle">{note}</span>
      ) : null}
    </span>
  );
}

export default function Bulk_Product_Assignment() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"product" | "party">("product");

  return (
    <Page>
      <Breadcrumbs
        items={[{ label: "Order Config" }, { label: "Bulk Products" }]}
      />
      <PageHeader
        eyebrow="Order Config"
        title="Bulk Product Assignment"
        description="Change what many parties are sold, and at what rate, in one pass."
      />

      <TabList label="Which way round">
        <Tab selected={tab === "product"} onClick={() => setTab("product")}>
          By product
        </Tab>
        <Tab selected={tab === "party"} onClick={() => setTab("party")}>
          By party
        </Tab>
      </TabList>

      {tab === "product" ? (
        <ByProduct queryClient={queryClient} />
      ) : (
        <ByParty />
      )}
    </Page>
  );
}

/* ── By product ─────────────────────────────────────────────────────────── */

function ByProduct({
  queryClient,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { items: products } = useSapProducts();
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState<ActivationResult | null>(null);

  const productOptions: MultiSelectOption<string>[] = useMemo(
    () =>
      products.map((product) => ({
        value: itemKey(product as unknown as ProductBlock),
        label: product.item_name || product.item_code,
        hint: [product.item_code, product.category, product.brand]
          .filter(Boolean)
          .join(" · "),
      })),
    [products],
  );

  const items = useMemo(
    () =>
      chosen.map((key) => {
        const [item_code, category] = key.split("||");
        return { item_code, category };
      }),
    [chosen],
  );

  const { data: blocks = [], isPending } = useQuery({
    queryKey: ["party", "product-parties", [...chosen].sort().join(",")],
    enabled: items.length > 0,
    queryFn: async () => {
      const response = await api.post("/auth/bulk-product/parties/", { items });
      return (response.data?.data?.items || []) as ProductBlock[];
    },
  });

  const apply = useMutation({
    mutationFn: async (request: Pending) => {
      const body: Record<string, unknown> = {
        is_active: request.isActive,
        items: [
          { item_code: request.block.item_code, category: request.block.category },
        ],
      };
      if (request.cardCodes.length === 0) {
        // Every holder, resolved server-side. See the note at the top.
        body.party_scope = "all_holders";
      } else {
        body.party_selections = request.cardCodes.map((card_code) => ({
          card_code,
          category: request.block.category,
        }));
      }
      const response = await api.post("/auth/bulk-party/set-active/", body);
      return (response.data?.data || {}) as ActivationResult;
    },
    onSuccess: (data) => {
      setPending(null);
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ["party", "product-parties"] });
      void queryClient.invalidateQueries({ queryKey: ["party", "bulk-products"] });
      void queryClient.invalidateQueries({ queryKey: ["party", "products"] });
      showToast({
        title: "Availability changed",
        message: data.updated + " assignments changed across " + data.parties + " parties.",
      });
    },
    onError: (error) => {
      console.error("Error changing availability:", error);
      setPending(null);
      showToast({
        title: "Could not change availability",
        message: "Nothing was changed. Check your connection and try again.",
      });
    },
  });



  return (
    <>
      <FilterBar>
        <FilterMultiSelect
          label="Products"
          value={chosen}
          onChange={setChosen}
          options={productOptions}
          placeholder="Choose products…"
          searchable
          selectAll={false}
          maxShown={60}
          fieldClassName="min-w-[320px]"
        />
        <FilterCount>
          {chosen.length} chosen · {blocks.length} loaded
        </FilterCount>
      </FilterBar>

      {chosen.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineCube}
            title="No product chosen"
            hint="Pick one or more products to see which parties are assigned them."
          />
        </Card>
      ) : isPending ? (
        // Was an `EmptyState` reading "Loading…" — which is not an empty state,
        // and announced nothing to a screen reader. `TableSkeleton` carries its
        // own live region and shows the shape that is coming.
        <Card className="p-0">
          <TableSkeleton
            columns={5}
            label="Finding the parties assigned these products"
          />
        </Card>
      ) : (
        blocks.map((block) => (
          <ProductBlockCard
            key={itemKey(block)}
            block={block}
            onAct={(isActive, cardCodes) =>
              setPending({ block, isActive, cardCodes })
            }
          />
        ))
      )}

      {/* ── Confirm ── */}
      <Dialog
        open={Boolean(pending)}
        onOpenChange={(next) => {
          if (!next && !apply.isPending) setPending(null);
        }}
      >
        {pending && (
          <DialogContent title="Change availability" size="sm">
            {/*
              Only ever reached by "Turn off for every party" now — the per-party
              branch it used to carry is gone with the ticking, since choosing
              WHICH parties happens in the action dialog.
            */}
            <DialogHeader>
              <DialogTitle>
                Turn off {pending.block.item_name} for every party?
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <Notice tone="hold">
                This reaches every party assigned this product —{" "}
                {pending.block.party_count} of them, including any assigned since this
                page loaded. Rates are kept, so turning it back on restores them.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setPending(null)} disabled={apply.isPending}>
                Cancel
              </Button>
              <Button
                variant={pending.isActive ? "primary" : "danger"}
                onClick={() => apply.mutate(pending)}
                disabled={apply.isPending}
              >
                {apply.isPending
                  ? "Applying…"
                  : pending.isActive
                    ? "Turn on"
                    : "Turn off"}
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
          <DialogContent title="Availability result" size="md">
            <DialogHeader>
              <DialogTitle>
                {result.errors.length ? "Applied, with problems" : "Availability changed"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <div className="flex flex-wrap gap-4">
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ok">
                    {result.updated}
                  </strong>
                  assignments changed
                </span>
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ink">
                    {result.unchanged}
                  </strong>
                  already like that
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
                <ul className="m-0 max-h-64 list-none space-y-1 overflow-y-auto rounded-sm border border-line bg-surface p-2 text-[12px] text-body">
                  {result.errors.map((message, index) => (
                    <li key={index} className="border-b border-line/60 pb-1 last:border-0">
                      {message}
                    </li>
                  ))}
                </ul>
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

/* ── One product, its parties ───────────────────────────────────────────── */

function ProductBlockCard({
  block,
  onAct,
}: {
  block: ProductBlock;
  /** Only "turn off for every party", which sends no party list. */
  onAct: (isActive: boolean, cardCodes: string[]) => void;
}) {
  const [open, setOpen] = useState(block.parties.length <= AUTO_EXPAND_UPTO);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  // Which action's dialog is open, if any. One at a time: they all choose
  // parties, so a second would be a second answer to the same question.
  const [action, setAction] = useState<PartyAction | null>(null);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return block.parties;
    return block.parties.filter((party) =>
      [party.card_name, party.card_code, party.state, party.main_group]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [block.parties, search]);

  const shown = showAll ? matches : matches.slice(0, ROWS_BEFORE_MORE);

  return (
    <Card className="p-0">
      <CardHeader className="mb-0 flex-wrap gap-3 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-expanded={open}
          // `appearance-none border-0 bg-transparent p-0` is not optional in
          // this app: Tailwind's preflight is layered here and the UA's own
          // button chrome still lands, so a bare <button> renders as a grey
          // bordered box. Every other raw button in the codebase carries the
          // same reset — see `dropdown.tsx`'s option buttons.
          className="flex min-w-0 flex-1 appearance-none items-center gap-2 border-0 bg-transparent p-0 text-left [font-family:inherit]"
        >
          {open ? (
            <HiOutlineChevronDown className="size-4 shrink-0 text-subtle" aria-hidden />
          ) : (
            <HiOutlineChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
          )}
          <span className="min-w-0">
            <CardTitle>{block.item_name}</CardTitle>
            <span className="m-0 mt-0.5 block text-[12px] text-subtle">
              <span className="font-mono">{block.item_code}</span> ·{" "}
              {[block.category, block.brand, block.variety, block.sal_pack_unit]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </button>
        <span className="flex flex-wrap items-center gap-2">
          {!block.product_active ? (
            <Badge tone="bad">Not an active SAP product</Badge>
          ) : null}
          {block.inactive_count > 0 ? (
            <Badge tone="hold">{block.inactive_count} turned off</Badge>
          ) : null}
          {block.distinct_rates > 1 ? (
            <Badge tone="hold">
              {block.distinct_rates} rates · {money(block.min_rate)} –{" "}
              {money(block.max_rate)}
            </Badge>
          ) : block.active_count > 0 ? (
            <Badge tone="ok">All at {money(block.common_rate)}</Badge>
          ) : null}
        </span>
      </CardHeader>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-[12px] text-subtle">
            {block.party_count} parties assigned · {block.active_count} sellable
            {block.inactive_count ? ` · ${block.inactive_count} turned off` : ""}
          </p>
          {/*
            Three actions, one way of choosing who they apply to.
            ──────────────────────────────────────────────────────────────────
            Turning on, turning off and assigning all need the same answer
            first: WHICH parties. That used to be answered twice — by ticking
            rows in the table below for on/off, and in a filtered modal for
            assign — so the filters only helped one of the three, and the table
            was a selection surface as well as a report.

            Each button now opens the same dialog, which differs only in the
            candidates it offers. The table below is a read-only view of who
            holds the product and at what rate.
          */}
          <span className="flex flex-wrap items-center gap-2">
            <Button
              size="xs"
              onClick={() => setAction("on")}
              disabled={block.inactive_count === 0}
              title={
                block.inactive_count === 0
                  ? "It is already sellable everywhere it is assigned."
                  : undefined
              }
            >
              Turn on…
            </Button>
            <Button
              size="xs"
              onClick={() => setAction("off")}
              disabled={block.active_count === 0}
              title={
                block.active_count === 0 ? "It is already off everywhere." : undefined
              }
            >
              Turn off…
            </Button>
            <Button
              size="xs"
              onClick={() => setAction("rate")}
              disabled={block.party_count === 0}
              title={
                block.party_count === 0 ? "No party holds it yet." : undefined
              }
            >
              Set rate…
            </Button>
            <Button size="xs" variant="primary" onClick={() => setAction("assign")}>
              Assign to more parties…
            </Button>
            {/*
              The one action that sends NO party list: the server resolves every
              holder inside the transaction, so a party assigned since this page
              loaded is still covered. See `party_scope` in the backend.
            */}
            <Button
              size="xs"
              variant="danger"
              onClick={() => onAct(false, [])}
              disabled={block.active_count === 0}
              title={
                block.active_count === 0 ? "It is already off everywhere." : undefined
              }
            >
              Turn off for every party
            </Button>
          </span>
        </div>

        {action ? (
          <AssignMoreDialog
            block={block}
            action={action}
            open
            onClose={() => setAction(null)}
          />
        ) : null}

        {!open ? null : (
          <>
            {block.parties.length > AUTO_EXPAND_UPTO ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setShowAll(false);
                  }}
                  placeholder="Search party, code or state…"
                  aria-label={"Search the parties assigned " + block.item_name}
                  className="max-w-[280px]"
                />
                <span className="text-[12px] text-subtle">
                  {shown.length === matches.length
                    ? `showing ${matches.length}`
                    : `showing ${shown.length} of ${matches.length}`}
                  {matches.length !== block.parties.length
                    ? ` (filtered from ${block.parties.length})`
                    : ""}
                </span>
              </div>
            ) : null}


            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Party</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.length === 0 ? (
                  <TableEmpty colSpan={4}>
                    {block.parties.length === 0
                      ? "No party is assigned this product."
                      : "No party here matches that search."}
                  </TableEmpty>
                ) : (
                  shown.map((party) => {
                    return (
                      <TableRow key={party.card_code}>
                        {/* Name and code on ONE line. Stacked, they made every
                            row two lines tall — measured at 83px each, so a
                            50-party list ran to four screens of mostly
                            whitespace. The code is the quieter half of one
                            fact, not a second fact needing its own line. */}
                        <TableCell className={ROW_CELL}>
                          <span className="truncate font-medium text-ink">
                            {party.card_name}
                          </span>
                          <span className="ml-1.5 font-mono text-[10.5px] text-subtle">
                            {party.card_code}
                          </span>
                        </TableCell>
                        <TableCell className={ROW_CELL + " text-subtle"}>{party.state || "—"}</TableCell>
                        <TableCell className={ROW_CELL + " text-right tabular-nums"}>
                          {money(party.basic_rate)}
                        </TableCell>
                        <TableCell className={ROW_CELL + " text-right"}>
                          {party.is_active ? (
                            <Badge tone="ok">Sellable</Badge>
                          ) : (
                            <Badge tone="hold">Turned off</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {matches.length > shown.length ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setShowAll(true)}
                className="w-full"
              >
                Show the remaining {matches.length - shown.length}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

/* ── Assign one item to parties that do not hold it ─────────────────────── */

/**
 * The direction the "By product" tab could not go.
 *
 * Everything else on this card acts on parties that ALREADY hold the item:
 * turn it off, turn it back on, re-price it. There was no way to put the item
 * somewhere new, so "add this SKU to the twelve Punjab distributors" meant
 * opening Party Products twelve times.
 *
 * `/auth/bulk-party/assign-products/` has always done this — `Party_Product_
 * Assignment` posts to it — it was simply never reachable from here.
 *
 * TWO RULES THE SERVER ENFORCES, MIRRORED IN THE PICKER SO IT CANNOT LIE:
 *
 *  * It writes with `update_or_create(..., is_active=True)`, so naming a party
 *    that already holds the item OVERWRITES its rate. Current holders are
 *    therefore not offered at all — re-pricing is the rate editor's job, and a
 *    silent re-price from a dialog labelled "assign" is the kind of thing
 *    nobody finds until a month of invoices is wrong.
 *  * A party carrying a category only takes that category's products
 *    (`if party_category and category != party_category: continue`). Such a
 *    party would be accepted, skipped, and counted in neither `added` nor
 *    `errors` — so it is filtered out here rather than appearing to work.
 */
/** What the one party dialog is being used for. */
type PartyAction = "assign" | "on" | "off" | "rate";

const ACTION_COPY: Record<
  PartyAction,
  { title: string; verb: string; pane: string; empty: string; done: string }
> = {
  assign: {
    title: "Assign",
    verb: "Assign",
    pane: "Parties without it",
    empty: "Every eligible party already holds this item.",
    done: "Parties assigned",
  },
  on: {
    title: "Turn on",
    verb: "Turn on",
    pane: "Parties it is turned off for",
    empty: "It is already sellable for every party that holds it.",
    done: "Turned on",
  },
  off: {
    title: "Turn off",
    verb: "Turn off",
    pane: "Parties it is sellable for",
    empty: "It is already turned off for every party that holds it.",
    done: "Turned off",
  },
  rate: {
    title: "Set the rate for",
    verb: "Re-price",
    pane: "Parties that hold it",
    empty: "No party holds this product yet.",
    done: "Rate changed",
  },
};

/** The two actions that write a price, and so need the rate box. */
const NEEDS_RATE: PartyAction[] = ["assign", "rate"];

function AssignMoreDialog({
  block,
  action,
  open,
  onClose,
}: {
  block: ProductBlock;
  action: PartyAction;
  open: boolean;
  onClose: () => void;
}) {
  const copy = ACTION_COPY[action];
  const queryClient = useQueryClient();
  const { items: parties } = useSapParties();
  const [chosen, setChosen] = useState<string[]>([]);
  // Seeded from the common rate when every holder agrees, because "same item,
  // same price, more parties" is the usual shape of this job.
  const [rate, setRate] = useState(() =>
    block.distinct_rates === 1 && block.active_count > 0
      ? String(block.common_rate)
      : "",
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [showAllAvailable, setShowAllAvailable] = useState(false);
  const [fromUser, setFromUser] = useState<number | "">("");
  const [userAdded, setUserAdded] = useState<string | null>(null);

  const sameCategory = (value: string | null | undefined) =>
    (value ?? "").trim().toLowerCase() === block.category.trim().toLowerCase();

  /**
   * Candidates keep their raw fields, not just a label.
   *
   * The facet filters below narrow on `state` / `main_group` / `chain`, so the
   * option cannot be flattened to `{value,label,hint}` before they run.
   */
  const options: PartyOption[] = useMemo(() => {
    const known = new Map(parties.map((party) => [party.card_code, party]));

    /*
     * Assigning looks OUTWARD, the other two look INWARD.
     *
     * A party can only be assigned the item if it does not already hold it, so
     * those candidates come from the SAP party list minus the holders. Turning
     * on and off act on rows that already exist, so those candidates are the
     * holders themselves — taken from the block, NOT by intersecting with the
     * party list. A holder missing from that list (a party synced away, say)
     * would otherwise vanish from the dialog while its assignment stayed live
     * and sellable, which is the worst of both.
     *
     * The party list is still consulted, for `chain`, which the block's rows do
     * not carry. Absent, the chain facet simply does not match it.
     */
    if (action === "assign") {
      const holders = new Set(block.parties.map((party) => party.card_code));
      return parties
        .filter(
          (party) =>
            !holders.has(party.card_code) &&
            (!party.category || sameCategory(party.category)),
        )
        .map((party) => ({
          value: party.card_code,
          label: party.card_name,
          hint: [party.card_code, party.state, party.category]
            .filter(Boolean)
            .join(" · "),
          keywords: party.main_group || undefined,
          state: party.state || "",
          mainGroup: party.main_group || "",
          chain: party.chain || "",
        }));
    }

    return block.parties
      .filter((party) =>
        action === "rate"
          ? true // Re-pricing reaches a turned-off row too: it keeps its rate
          : action === "off"
            ? party.is_active
            : !party.is_active,
      )
      .map((party) => ({
        value: party.card_code,
        label: party.card_name,
        hint: [party.card_code, party.state, money(party.basic_rate)]
          .filter(Boolean)
          .join(" · "),
        keywords: party.main_group || undefined,
        state: party.state || "",
        mainGroup: party.main_group || "",
        chain: known.get(party.card_code)?.chain || "",
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parties, block.parties, block.category, action]);

  /**
   * Facets, combinable, each offering only what the OTHERS still allow.
   *
   * Picking parties one at a time out of ~950 is the job this dialog exists
   * for, and a name search only helps when you already know the names. The
   * real questions are "every GT party in Punjab" and "all the distributors in
   * Delhi" — state, main group and chain, ANDed together.
   *
   * Counts come from the candidates left after the OTHER facets, so a state
   * showing 12 really does yield 12 once chosen; a facet that would yield
   * nothing is not offered at all.
   */
  const [facets, setFacets] = useState<{
    state: string[];
    mainGroup: string[];
    chain: string[];
  }>({ state: [], mainGroup: [], chain: [] });

  /**
   * Each facet is a SET: empty means "no constraint", otherwise membership.
   * Values within one facet are OR'd (Punjab or Haryana), and the facets are
   * AND'd with each other (GT, in Punjab or Haryana).
   */
  const passesFacet = (chosen: string[], value: string) =>
    chosen.length === 0 || chosen.includes(value);

  const passesFacets = (option: PartyOption, except?: keyof typeof facets) =>
    (except === "state" || passesFacet(facets.state, option.state)) &&
    (except === "mainGroup" || passesFacet(facets.mainGroup, option.mainGroup)) &&
    (except === "chain" || passesFacet(facets.chain, option.chain));

  const facetValues = (key: keyof typeof facets) => {
    const counts = new Map<string, number>();
    options.forEach((option) => {
      const value = option[key];
      if (!value || !passesFacets(option, key)) return;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  };

  /**
   * The left pane: eligible, not already holding it, and not already chosen.
   *
   * Chosen parties LEAVE this list rather than sitting in it ticked. With 944
   * candidates a checkbox three screens down is not an answer to "what have I
   * picked" — moving them across is, which is the whole point of the split.
   */
  const available = useMemo(() => {
    const picked = new Set(chosen);
    const needle = search.trim().toLowerCase();
    return options.filter(
      (option) =>
        !picked.has(option.value) &&
        passesFacets(option) &&
        (!needle ||
          [option.label, option.hint, option.keywords]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(needle))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, chosen, search, facets]);

  // Same reason the party tables are capped: 944 rows of DOM for a list nobody
  // reads past the first screen of. The search runs over all of them.
  const shownAvailable = showAllAvailable
    ? available
    : available.slice(0, ROWS_BEFORE_MORE);

  /**
   * "Assign this product to everyone <user> sells to."
   *
   * `user_party_assignments` and `party_product_assignments` both key on
   * (card_code, category), so a salesperson's book maps onto this dialog's
   * candidate list directly — no join table to invent. It matters at the real
   * sizes: one user carries 531 parties and several carry 27–42, which is the
   * difference between a click and an afternoon.
   *
   * It ADDS to the selection rather than replacing it, and reports what it
   * could not take. A party of theirs that already holds the item, or that the
   * server would skip on category, is silently absent from `available` — and a
   * shortcut that quietly adds 27 of 42 without saying so is how you end up
   * believing a product went somewhere it did not.
   */
  const readBook = useUserPartyCodes();

  /**
   * "Assign this product to everyone <user> sells to."
   *
   * It ADDS to the selection rather than replacing it, and reports what it
   * could not take. A party of theirs that already holds the item, or that the
   * server would skip on category, is simply absent from `options` — and a
   * shortcut that quietly adds 27 of 42 without saying so is how you end up
   * believing a product went somewhere it did not.
   */
  const addUsersParties = (userId: number) =>
    readBook.mutate(userId, {
      onSuccess: (codes) => {
        const offered = new Set(options.map((option) => option.value));
        const takeable = codes.filter(
          (code) => offered.has(code) && !chosen.includes(code),
        );
        setChosen((prev) => [...prev, ...takeable]);
        const skipped = codes.length - takeable.length;
        setUserAdded(
          `Added ${takeable.length} of ${codes.length}` +
            (skipped > 0
              ? ` — ${skipped} already hold it, are a different category, or were already chosen.`
              : "."),
        );
      },
      onError: () => setUserAdded("Could not read that user's parties."),
    });

  const rateValue = Number(rate);
  const rateValid = rate.trim() !== "" && Number.isFinite(rateValue) && rateValue >= 0;

  const selections = () =>
    chosen.map((card_code) => ({ card_code, category: block.category }));

  const assign = useMutation({
    mutationFn: async () => {
      /*
       * Two endpoints behind one dialog.
       *
       * Assigning creates or re-prices a row, so it carries the rate and goes
       * to `assign-products`. Turning on and off only flip `is_active` on rows
       * that already exist, which is `set-active` — the same endpoint the
       * card's "Turn off for every party" uses, just with an explicit party
       * list instead of a server-resolved scope.
       */
      if (action === "assign") {
        const response = await api.post("/auth/bulk-party/assign-products/", {
          party_selections: selections(),
          products: [
            {
              item_code: block.item_code,
              category: block.category,
              basic_rate: rateValue,
            },
          ],
        });
        const data = (response.data?.data ?? {}) as {
          added?: number;
          updated?: number;
          errors?: string[];
        };
        return {
          changed: (data.added ?? 0) + (data.updated ?? 0),
          errors: data.errors ?? [],
          note: ` at ${money(rateValue)}`,
        };
      }

      if (action === "rate") {
        const response = await api.post("/auth/bulk-party/update-rates/", {
          party_selections: selections(),
          // `set` writes the figure as-is, and `existing` keeps it to rows that
          // already exist — this dialog never creates one, that is Assign.
          rate_mode: "set",
          apply_to: "existing",
          items: [
            {
              item_code: block.item_code,
              category: block.category,
              basic_rate: rateValue,
            },
          ],
        });
        const data = (response.data?.data ?? {}) as {
          updated?: number;
          errors?: string[];
        };
        return {
          changed: data.updated ?? 0,
          errors: data.errors ?? [],
          note: ` to ${money(rateValue)}`,
        };
      }

      const response = await api.post("/auth/bulk-party/set-active/", {
        is_active: action === "on",
        items: [{ item_code: block.item_code, category: block.category }],
        party_selections: selections(),
      });
      const data = (response.data?.data ?? {}) as {
        updated?: number;
        errors?: string[];
      };
      return { changed: data.updated ?? 0, errors: data.errors ?? [], note: "" };
    },
    onSuccess: (data) => {
      setErrors(data.errors);
      void queryClient.invalidateQueries({ queryKey: ["party", "product-parties"] });
      void queryClient.invalidateQueries({ queryKey: ["party", "bulk-products"] });
      void queryClient.invalidateQueries({ queryKey: ["party", "products"] });
      showToast({
        title: copy.done,
        message: `${data.changed} ${data.changed === 1 ? "party" : "parties"}${data.note}.`,
      });
      // Held open when the server reported per-party problems: closing would
      // throw away the only place they are named.
      if (!data.errors.length) {
        setChosen([]);
        onClose();
      }
    },
    onError: (error) => {
      console.error("Bulk party action failed:", error);
      showToast({
        title: `Could not ${copy.verb.toLowerCase()}`,
        message: "Nothing was changed. Check your connection and try again.",
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !assign.isPending) {
          setErrors([]);
          onClose();
        }
      }}
    >
      {open && (
        <DialogContent
          title={`${copy.title} — choose parties`}
          size="xl"
          // Wider than any `size` offers. `cn` is tailwind-merge, so this beats
          // the variant's `max-w-[960px]` — two side-by-side party lists plus a
          // row of filters do not fit the scale the shared sizes were cut for.
          className="max-w-[1280px]"
        >
          <DialogHeader>
            <DialogTitle>
              {copy.title} {block.item_name}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {/*
              Two panes, not a dropdown.
              ─────────────────────────────────────────────────────────────
              A `MultiSelect` here was the wrong instrument: its panel opened
              OVER the dialog it belongs to, and with three parties picked the
              chip rail wrapped to two lines and pushed the rest of the form
              down. Choosing tens of items out of 944 is a transfer list's job —
              the candidates stay put on the left, and what you have chosen is
              a standing list on the right rather than something you have to
              reopen a panel to check.
            */}
            {/*
              Every way of narrowing 1,278 candidates, on one line.

              The three facets used to sit inside the left pane, under its own
              header, which put them in a 450px column and read as belonging to
              the list rather than to the choosing. They are the same kind of
              control as the user shortcut beside them — each one answers "which
              parties am I even considering" — so they live together.

              All of them AND: a user's book, within a state, within a main
              group, is four clicks.
            */}
            <div className="flex flex-wrap items-center gap-2">
              <UserPartyPicker
                value={fromUser}
                onChange={(next) => {
                  setFromUser(next);
                  setUserAdded(null);
                  if (next !== "") addUsersParties(Number(next));
                }}
                placeholder="Add everyone assigned to a user…"
                busy={readBook.isPending}
                note={userAdded}
              />
              {(
                [
                  ["state", "State"],
                  ["mainGroup", "Main group"],
                  ["chain", "Chain"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label} className="min-w-[150px]">
                  {(control) => (
                    <MultiSelect
                      {...control}
                      value={facets[key]}
                      onChange={(next) => {
                        setFacets((prev) => ({ ...prev, [key]: next }));
                        setShowAllAvailable(false);
                      }}
                      options={facetValues(key).map(([value, count]) => ({
                        value,
                        label: value,
                        // The count of what this value would still leave, given
                        // the other facets — not its total across every party.
                        meta: count,
                      }))}
                      placeholder={`Any ${label.toLowerCase()}`}
                      searchable
                      searchPlaceholder={`Search ${label.toLowerCase()}…`}
                      selectAll={false}
                      size="xs"
                    />
                  )}
                </Field>
              ))}
              {facets.state.length || facets.mainGroup.length || facets.chain.length ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setFacets({ state: [], mainGroup: [], chain: [] })}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <TransferPane
                title={copy.pane}
                count={available.length}
                empty={copy.empty}
                action={
                  // Filtering to "every GT party in Punjab" and then clicking
                  // 40 rows is most of the work still left, so the filtered set
                  // can be taken whole.
                  available.length > 0 &&
                  (facets.state.length ||
                    facets.mainGroup.length ||
                    facets.chain.length ||
                    search.trim()) ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        setChosen((prev) => [
                          ...prev,
                          ...available.map((option) => option.value),
                        ])
                      }
                    >
                      Add all {available.length}
                    </Button>
                  ) : null
                }
              >
                <div className="border-b border-line/60 p-1.5">
                  <Input
                    type="search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setShowAllAvailable(false);
                    }}
                    placeholder="Search name, code or state…"
                    aria-label="Search parties without this item"
                    className="h-control-xs"
                  />
                </div>
                <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-1">
                  {shownAvailable.map((option) => (
                    <li key={option.value}>
                      <button
                        type="button"
                        onClick={() => setChosen((prev) => [...prev, option.value])}
                        className="flex w-full appearance-none items-baseline justify-between gap-2 rounded-sm border-0 bg-transparent px-2 py-1 text-left text-[12px] [font-family:inherit] hover:bg-brand-soft hover:text-brand"
                      >
                        <span className="min-w-0 truncate text-ink">{option.label}</span>
                        <span className="shrink-0 font-mono text-[10.5px] text-subtle">
                          {option.hint}
                        </span>
                      </button>
                    </li>
                  ))}
                  {available.length > shownAvailable.length ? (
                    <li>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="w-full"
                        onClick={() => setShowAllAvailable(true)}
                      >
                        Show the remaining {available.length - shownAvailable.length}
                      </Button>
                    </li>
                  ) : null}
                  {available.length === 0 ? (
                    <li className="px-2 py-3 text-center text-[12px] text-subtle">
                      {search.trim() ? "No party matches that search." : "None left."}
                    </li>
                  ) : null}
                </ul>
              </TransferPane>

              <TransferPane
                title="Will be assigned"
                count={chosen.length}
                empty="Nothing chosen yet — pick from the left."
                action={
                  chosen.length > 0 ? (
                    <Button size="xs" variant="ghost" onClick={() => setChosen([])}>
                      Clear
                    </Button>
                  ) : null
                }
              >
                <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-1">
                  {chosen.map((code) => {
                    const option = options.find((candidate) => candidate.value === code);
                    return (
                      <li key={code}>
                        <button
                          type="button"
                          onClick={() =>
                            setChosen((prev) => prev.filter((value) => value !== code))
                          }
                          className="flex w-full appearance-none items-baseline justify-between gap-2 rounded-sm border-0 bg-transparent px-2 py-1 text-left text-[12px] [font-family:inherit] hover:bg-bad-soft hover:text-bad"
                          aria-label={`Remove ${option?.label ?? code}`}
                        >
                          <span className="min-w-0 truncate text-ink">
                            {option?.label ?? code}
                          </span>
                          <span aria-hidden="true" className="shrink-0 text-subtle">
                            ×
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </TransferPane>
            </div>

            {/* Only assigning sets a price. Turning on or off flips a flag on
                rows that already have one, and showing a rate box there would
                imply it re-prices them. */}
            {NEEDS_RATE.includes(action) ? (
            <Field label="Basic rate" hint="Applied to every party chosen here.">
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min="0"
                  step="0.01"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  placeholder="0.00"
                />
              )}
            </Field>

            ) : null}

            {NEEDS_RATE.includes(action) && block.distinct_rates > 1 ? (
              <Notice tone="hold">
                Existing holders are on {block.distinct_rates} different rates (
                {money(block.min_rate)} – {money(block.max_rate)}), so there is no
                obvious one to copy. The rate above applies only to the parties you
                choose here; nobody else is re-priced.
              </Notice>
            ) : null}

            {errors.length > 0 ? (
              <>
                <Notice tone="bad">
                  {errors.length} {errors.length === 1 ? "party" : "parties"} could not
                  be assigned. The rest went through.
                </Notice>
                <ul className="m-0 max-h-48 list-none space-y-1 overflow-y-auto rounded-sm border border-line bg-surface p-2 text-[12px] text-body">
                  {errors.map((message, index) => (
                    <li key={index} className="border-b border-line/60 pb-1 last:border-0">
                      {message}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => {
                setErrors([]);
                onClose();
              }}
              disabled={assign.isPending}
            >
              {errors.length ? "Close" : "Cancel"}
            </Button>
            <Button
              variant="primary"
              onClick={() => assign.mutate()}
              disabled={
                chosen.length === 0 ||
                (NEEDS_RATE.includes(action) && !rateValid) ||
                assign.isPending
              }
              title={
                !rateValid && chosen.length > 0 ? "Enter a rate first." : undefined
              }
            >
              {assign.isPending
                ? "Assigning…"
                : chosen.length > 0
                  ? `${copy.verb} ${chosen.length}`
                  : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

/* ── By party ───────────────────────────────────────────────────────────── */

function ByParty() {
  const { items: parties } = useSapParties();
  const [chosen, setChosen] = useState<string[]>([]);

  const partyOptions: MultiSelectOption<string>[] = useMemo(
    () =>
      parties.map((party) => ({
        value: party.card_code + "||" + (party.category || ""),
        label: party.card_name,
        hint: [party.card_code, party.state, party.category].filter(Boolean).join(" · "),
        keywords: party.main_group || undefined,
      })),
    [parties],
  );

  const selections: PartySelection[] = useMemo(
    () =>
      chosen.map((key) => {
        const [card_code, category] = key.split("||");
        return { card_code, category: category || null };
      }),
    [chosen],
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Choose parties</CardTitle>
          {chosen.length > 1 ? (
            <Button variant="ghost" size="xs" onClick={() => setChosen([])}>
              Clear all
            </Button>
          ) : null}
        </CardHeader>
        <Field label="Parties" hint="Pick two or more to re-price them together.">
          {(control) => (
            <MultiSelect
              {...control}
              value={chosen}
              onChange={setChosen}
              options={partyOptions}
              placeholder="Search parties…"
              searchable
              selectAll={false}
              maxShown={60}
            />
          )}
        </Field>
      </Card>

      {selections.length > 1 ? (
        <BulkRateEditor selections={selections} />
      ) : (
        <Card>
          <EmptyState
            icon={HiOutlineCube}
            title={selections.length === 1 ? "One party chosen" : "No party chosen"}
            hint="Pick at least two parties to work on their rates together. For a single party, use Party Products."
          />
        </Card>
      )}
    </>
  );
}

/**
 * One side of the transfer list: a titled, scrolling column.
 *
 * Both panes are the same height and scroll independently, so the dialog does
 * not grow as parties move across — the layout with three chosen looks like
 * the layout with thirty.
 */
function TransferPane({
  title,
  count,
  empty,
  action,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-[440px] flex-col overflow-hidden rounded-md border border-line/60 bg-card">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line/60 px-2.5 py-1.5">
        <h3 className="m-0 text-[12px] font-semibold text-ink">
          {title}{" "}
          <span className="font-normal text-subtle">{count}</span>
        </h3>
        {action}
      </header>
      {count === 0 ? (
        <p className="m-0 flex flex-1 items-center justify-center px-3 text-center text-[12px] text-subtle">
          {empty}
        </p>
      ) : (
        children
      )}
    </section>
  );
}
