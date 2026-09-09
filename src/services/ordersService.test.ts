/**
 * What `POST /orders/create/` actually receives.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `Add_Sales.tsx` builds a ~40-field order payload and hands it to
 * `createOrder`/`saveDraft`, which do NOT just post it — each re-maps every
 * line through a normaliser. Nothing tested that normaliser, and nothing
 * tested the shape it produces, so the contract between the wizard and the
 * backend was asserted nowhere: a field could be renamed, coerced to NaN, or
 * dropped entirely and every existing test would still pass.
 *
 * Phase 3.4 splits `Add_Sales.tsx` apart. These are the snapshots that make
 * that split provable rather than hopeful — they pin the wire format, which is
 * the only part of that file the backend can see.
 *
 * The assertions read `config.data`, i.e. the JSON string axios is about to
 * send. That matters: `Number(undefined)` is NaN in JS but serialises to
 * `null`, so an object-level assertion would report a value the server never
 * sees. Parsing the serialised body is the only honest check.
 */
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateOrder, OrderItem } from "./ordersService";

/** A minimal, non-expired JWT. Only `exp` is ever read. */
function token(): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + 3600 };
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

/** Load `ordersService` against an adapter that records the serialised body. */
async function loadService() {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000/api");
  vi.stubEnv("VITE_API_VERSION", "");

  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config as InternalAxiosRequestConfig);
    const response: AxiosResponse = {
      data: { order_number: "SO-1" },
      status: 200,
      statusText: "200",
      headers: {},
      config,
    };
    return response;
  };

  const api = (await import("./api")).default;
  api.defaults.adapter = adapter;
  const { ordersService } = await import("./ordersService");
  return { ordersService, seen };
}

/**
 * The body as the server will parse it — not as JS holds it.
 *
 * Typed as index signatures of `unknown` rather than `any`: the wire has no
 * TypeScript type, and `expect()` takes `unknown` happily, so nothing is
 * gained by pretending otherwise.
 */
interface WireItem {
  [key: string]: unknown;
}
interface WireBody {
  [key: string]: unknown;
  items?: WireItem[];
}

function sent(config: InternalAxiosRequestConfig): WireBody {
  return JSON.parse(String(config.data)) as WireBody;
}

/**
 * One line, exactly as `Add_Sales.tsx` builds it (submitOrder, ~:895-960).
 * Numbers arrive as strings because the wizard's inputs are text inputs and
 * nothing between them and here converts.
 */
function line(overrides: Record<string, unknown> = {}) {
  return {
    item_code: "JV-CAN-1L",
    item_name: "JIVO CANOLA OIL 1 LTR",
    category: "Edible Oil",
    brand: "Jivo",
    variety: "Canola",
    item_type: "PACK",
    qty: "60",
    pcs: "12",
    boxes: "5",
    ltrs: "60",
    price_list_basic: "107",
    basic_price: "107",
    tax_rate: "5",
    total: "6420",
    schemes: [],
    is_scheme: false,
    total_ltrs: 60,
    ...overrides,
  } as unknown as OrderItem;
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    card_code: "C000123",
    card_name: "Northern Traders",
    bill_to_id: 11,
    ship_to_id: 21,
    dispatch_from_id: 1,
    delivery_date: "2026-06-20",
    company: 1,
    items: [line()],
    ...overrides,
  } as unknown as CreateOrder;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("access", token());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  localStorage.clear();
});

describe("createOrder — the create payload", () => {
  it("posts to /orders/create/ with the header fields untouched", async () => {
    const { ordersService, seen } = await loadService();

    await ordersService.createOrder(order());

    expect(seen[0].url).toBe("/orders/create/");
    expect(seen[0].method).toBe("post");
    const body = sent(seen[0]);
    // The two ids the backend resolves addresses by. They are `Number(...)` of
    // a picker value in the wizard, so a non-numeric option silently sends
    // NaN -> null and the order saves against no address at all.
    expect(body.bill_to_id).toBe(11);
    expect(body.ship_to_id).toBe(21);
    expect(body.card_code).toBe("C000123");
    expect(body.is_draft).toBeUndefined();
  });

  it("coerces every numeric line field, which arrive as strings", async () => {
    const { ordersService, seen } = await loadService();

    await ordersService.createOrder(order());

    const item = sent(seen[0]).items![0];
    for (const key of [
      "qty",
      "pcs",
      "boxes",
      "ltrs",
      "price_list_basic",
      "basic_price",
      "tax_rate",
      "total",
    ]) {
      expect(typeof item[key], key).toBe("number");
    }
    expect(item.qty).toBe(60);
    expect(item.total).toBe(6420);
  });

  it("fills sub_group from variety, which is the column the backend writes", async () => {
    const { ordersService, seen } = await loadService();

    await ordersService.createOrder(order());

    // `_create_order_item` reads `sub_group or variety` itself, so this is
    // belt-and-braces — but the wizard never sends `sub_group`, and this is
    // the only place one is ever produced.
    expect(sent(seen[0]).items![0].sub_group).toBe("Canola");
  });

  it("keeps a legacy hand-picked scheme intact", async () => {
    const { ordersService, seen } = await loadService();

    await ordersService.createOrder(
      order({
        items: [
          line({
            is_scheme: true,
            scheme_id: "7",
            scheme_qty: "3",
            schemes: [{ scheme_id: 7, scheme_qty: 3 }],
          }),
        ],
      }),
    );

    const item = sent(seen[0]).items![0];
    expect(item.scheme_id).toBe(7);
    expect(item.schemes).toEqual([{ scheme_id: 7, scheme_qty: 3 }]);
  });

  it("carries a v2 engine scheme's own keys through to the wire", async () => {
    const { ordersService, seen } = await loadService();

    // Exactly what Add_Sales builds from a `schemeService.preview` proposal
    // (Add_Sales.tsx:940-955). It has no legacy `scheme_id` at all — a v2
    // giveaway points at a Scheme, not at a SchemeProduct row.
    await ordersService.createOrder(
      order({
        items: [
          line({
            is_scheme: true,
            schemes: [
              {
                scheme_v2_id: 42,
                benefit_id: 91,
                benefit_item_code: "JV-OLV-500",
                scheme_qty: 24,
                computed_qty: 24,
                benefit_uom: "BOX",
                benefit_qty: 1,
                is_manual_override: false,
                scope_type: "PARTY",
                scope_value: "C000123",
              },
            ],
          }),
        ],
      }),
    );

    // `_extract_order_item_schemes` qualifies a v2 entry on `scheme_v2_id`
    // ALONE (orders/services/order_items.py:101-121). The normaliser used to
    // rebuild each scheme as `{scheme_id, scheme_qty}` from scratch, which
    // dropped that key — so the backend saw an entry with neither a scheme nor
    // a scheme_v2_id and skipped it outright. Every engine-resolved giveaway
    // placed through this wizard was silently discarded, while the Mart path
    // (createMartOrder, which posts its payload unmapped) kept working.
    const scheme = (sent(seen[0]).items![0].schemes as WireItem[])[0];
    expect(scheme.scheme_v2_id).toBe(42);
    expect(scheme.benefit_id).toBe(91);
    expect(scheme.benefit_item_code).toBe("JV-OLV-500");
    expect(scheme.scheme_qty).toBe(24);
    // And no invented `scheme_id: null` for `_resolve_scheme_by_id` to shrug
    // off — NaN is what `Number(undefined)` gives, and it serialises to null.
    expect("scheme_id" in scheme).toBe(false);
  });
});

describe("saveDraft — the draft payload", () => {
  it("marks the order a draft and omits order_id when starting fresh", async () => {
    const { ordersService, seen } = await loadService();

    await ordersService.saveDraft(order());

    const body = sent(seen[0]);
    // Same endpoint as a real order — `is_draft` is the only thing keeping it
    // out of the approval flow.
    expect(seen[0].url).toBe("/orders/create/");
    expect(body.is_draft).toBe(true);
    expect(body.order_id).toBeUndefined();
  });

  it("updates in place when resuming an existing draft", async () => {
    const { ordersService, seen } = await loadService();

    await ordersService.saveDraft(order(), 4321);

    expect(sent(seen[0]).order_id).toBe(4321);
  });

  it("normalises a half-filled line rather than rejecting it", async () => {
    const { ordersService, seen } = await loadService();

    // A draft deliberately includes rows the user has only started
    // (Add_Sales.tsx:1014), so blanks reach here that `createOrder` never sees.
    await ordersService.saveDraft(order({ items: [line({ qty: "", boxes: "", total: "" })] }));

    const item = sent(seen[0]).items![0];
    expect(item.qty).toBe(0);
    expect(item.boxes).toBe(0);
    expect(item.total).toBe(0);
  });

  it("survives a payload with no items at all", async () => {
    const { ordersService, seen } = await loadService();

    // `items` is optional on the draft type, and the page can save before a
    // single row exists.
    await ordersService.saveDraft({ card_code: "C000123" } as Partial<CreateOrder>);

    expect(sent(seen[0]).items).toEqual([]);
  });
});
