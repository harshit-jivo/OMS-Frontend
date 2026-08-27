# OMS-Frontend — codebase reference and phased refactor plan

**Written 2026-08-26.** Companion to
[`OMS-Backend/docs/CODEBASE_AND_REFACTOR_PLAN.md`](../../OMS-Backend/docs/CODEBASE_AND_REFACTOR_PLAN.md).

Same two jobs as the backend document:

1. **Part I–II — what exists**, so a refactor can be checked against it.
2. **Part III — what to change**, phased so each step ships working.

Supporting detail is generated from source in [`docs/codebase/`](codebase/):
[`INVENTORY.md`](codebase/INVENTORY.md) (routes, all 220 API calls, per-page
weight) and [`DUPLICATION.md`](codebase/DUPLICATION.md) (hand-rolled primitives,
duplicated CSS).

---

# Part I — What the system is

## 1. Overview

| | |
|---|---|
| Framework | React 19.2, TypeScript 5.9, Vite 8 |
| Routing | react-router-dom 7.13 |
| HTTP | axios 1.13 |
| Styling | **hand-written CSS — 54 stylesheets, 35,067 lines** |
| State | **none** — `useState` + `localStorage` |
| Data fetching | **none** — axios called directly |
| Forms | **none** |
| Validation | **none** |
| Component library | **none** |
| Tests | **0** |
| Source size | **102,738 lines** across 211 files |

Other dependencies: `exceljs`, `xlsx`, `file-saver` (exports), `recharts`
(charts), `qrcode.react`, `html5-qrcode`, `react-icons`.

### 1.1 The ratio that explains everything

```
108 pages          55,944 lines
 18 components      4,546 lines
 54 stylesheets    35,067 lines
 18 services        5,903 lines
```

**Six pages for every shared component.** Almost every screen builds its own
UI from scratch, which is why there are 35,067 lines of CSS and why the same
table, modal and badge exist dozens of times over. This is the single fact the
whole refactor plan turns on.

### 1.2 What is already good

Worth stating, because a refactor should preserve it rather than replace it:

- **TypeScript is strict.** `strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch` all on. That is a real asset — many codebases
  this size are not.
- **The services layer is real.** 18 modules, 220 call sites, and only 21 API
  calls are made directly from a page. The API boundary is genuinely respected.
- **`src/services/api.ts` is well built** — one axios instance, token refresh
  with auth paths excluded from retry, and inversion of control for device
  headers so the API layer never imports the device service (avoiding a cycle).
  It documents its own decisions.
- **`RequirePermission` is honest.** Its docstring states plainly that it is
  *not* the security boundary and the server enforces the same key — which is
  the correct understanding.
- **The build works.** `tsc -b && vite build` passes with 0 TypeScript errors.

---

## 2. Routing and access

**59 routes. 4 use a client-side guard.**

`RequirePermission` checks `role === 'admin'` or a page key in the
`extra_pages` array held in `localStorage`. It fails closed on corrupt storage,
which is right.

The sidebar hides links a user cannot use, but hiding a link is not access
control — typing the URL still renders the page. That is precisely what the
component's own comment says, and it is why the server is supposed to be the
boundary.

> **Cross-repo finding.** The frontend is explicitly relying on server-side
> enforcement — and [the backend audit](../../OMS-Backend/docs/codebase/API_SURFACE.md)
> found **149 of 294 endpoints require no authentication at all**, including
> scheme/discount management and user creation. The two halves of that
> assumption do not currently meet. **This is a backend fix (Phase 1–2 there),
> not a frontend one** — adding more client guards would not close it.

Full route table in [`codebase/INVENTORY.md`](codebase/INVENTORY.md).

---

## 3. State and data

There is no state manager and no data-fetching library. In practice:

- **Server state lives in `useState`**, refetched per page mount, with no
  cache, no deduplication, no background revalidation, and hand-written
  `loading` / `error` flags per screen.
- **Session state lives in `localStorage`**, read directly in **20 files**:
  `access`, `refresh`, `user_id`, `username`, `name`, `role`, `role_display`,
  `company_id`, `company_name`, `main_group_id`, `main_group_name`,
  `extra_pages`.
- `device_id` is deliberately **excluded** from the logout clear-down, so one
  browser keeps one device id across logins. That is a real invariant —
  clearing it would mint phantom device rows on the backend.

`Add_Sales.tsx` holds **41 `useState` calls in one 4,410-line component**. That
is the shape of the problem, not an outlier.

---

## 4. Styling

54 stylesheets, 35,067 lines, imported per page by convention
(`Foo.tsx` ↔ `styles/Foo.css`). Plus **815 inline `style={{…}}`** occurrences.

Nothing scopes these: they are global classes distinguished by prefix
(`invr-`, `sl-`, `sch-`). Collisions are prevented by naming discipline alone.

**88 declaration blocks are byte-identical across 3 or more stylesheets** — the
design tokens nobody extracted. Largest files: `Sales_Invoice.css` (6,252),
`Add_Sales.css` (2,636), `Dashboard.css` (1,780).

Four stylesheets are orphaned (imported nowhere): `Branches.css`, `Logs.css`,
`Payments.css`, `Products.css` — 808 lines of dead weight.

---

## 5. Duplication — the case for shadcn

Measured in [`codebase/DUPLICATION.md`](codebase/DUPLICATION.md). Every row is a
primitive shadcn/ui already ships:

| primitive | pages hand-rolling it | shadcn replacement |
|---|---:|---|
| Data table | **50** | `Table` + TanStack Table |
| Status badge | **37** | `Badge` |
| Modal / dialog | **36** | `Dialog` / `AlertDialog` |
| Loading spinner | **27** | `Skeleton` |
| Pagination | **23** | `Pagination` |
| Date range picker | 9 | `Calendar` + `Popover` |
| Confirm dialog | 8 | `AlertDialog` |
| Toast / alert | 7 | `Sonner` |
| File upload | 5 | `Input` + `Progress` |
| Tabs | 3 | `Tabs` |

A `StatusBadge` component **already exists** in `src/components/` — and 37 pages
still roll their own. The problem is not that nobody tried; it is that nothing
made reuse the path of least resistance.

---

# Part II — Assessment

## 6. Quality signals

| signal | value |
|---|---|
| TypeScript errors | **0** |
| ESLint | **142 problems** (114 errors, 28 warnings) |
| Tests | **0** |
| Explicit `any` | 77 in pages, plus lint errors elsewhere |
| Inline styles | 815 |
| Production bundle | **2.71 MB** (729 KB gzipped) |
| Largest chunk | `index-*.js`, no route-level code splitting |

### 6.1 Bundle

The build warns. `exceljs` alone is 930 KB (256 KB gzipped) and is loaded by
three pages, but there is no route-level `React.lazy`, so **every user
downloads every page** — including the Excel writer, the QR scanner and
Recharts — to see the login screen.

This is the cheapest large win available and it is independent of everything
else in the plan.

### 6.2 No tests, and a merge that needed them

The frontend has zero tests. The four-branch merge on 2026-08-26 silently
deleted `formData.warehouse` from `Add_Sales.tsx`; nothing caught it except
`tsc`, and only because the field was *referenced* elsewhere. A deletion that
type-checks would have shipped. See
[`docs/BRANCH_MERGE_2026-08-26.md`](BRANCH_MERGE_2026-08-26.md) §F4.

### 6.3 Page weight

| page | TSX | CSS | useState |
|---|---:|---:|---:|
| `Add_Sales.tsx` | 4,410 | 2,636 | 41 |
| `Payments/ApprovalManagement.tsx` | 2,406 | — | 23 |
| `SalesInvoice/index.tsx` | 2,099 | 216 | 32 |
| `Dashboard.tsx` | 1,846 | 1,780 | 22 |
| `Product_Stock.tsx` | 1,817 | 1,260 | 29 |
| `InvoiceReview.tsx` | 1,692 | 1,042 | 28 |
| `Scheme_Manager.tsx` | 1,658 | 953 | 32 |

`SalesInvoice/` is the one page already decomposed into a directory with a
`useSalesInvoice.ts` hook (1,320 lines) separating logic from view. **That is
the pattern to repeat** — it exists in-tree, like `payments` does on the
backend.

---

# Part III — The refactor plan

## 7. Principles

1. **Every phase ships.** No phase depends on a later one to work.
2. **Adopt incrementally.** Tailwind and the existing CSS coexist; shadcn
   components land one primitive at a time. There is no rewrite.
3. **Visual parity first.** Phase 1 changes zero pixels. Encoding the *current*
   design as tokens is what makes later phases safe.
4. **Highest-count primitives first.** Table (50 pages) before Tabs (3).
5. **A mobile client exists.** `OMS-app` (React Native, separate repo) shares
   the API. Frontend changes do not affect it, but API changes do — coordinate
   with the backend plan.

---

## Phase 0 — Safety net *(~1 week)*

| # | task | why |
|---|---|---|
| 0.1 | Vitest + React Testing Library; CI on every push | 0 tests today |
| 0.2 | Smoke test per route: renders, no crash | 59 routes, none covered |
| 0.3 | Tests for `services/api.ts` — refresh, 401, auth-path exclusion | The riskiest shared code |
| 0.4 | Fix the 114 ESLint errors; make lint blocking | Noise hides real defects |
| 0.5 | Delete the 4 orphan stylesheets | Free, and shrinks Phase 2 |
| 0.6 | Playwright smoke path: login → order → submit | Catches what unit tests cannot |

**Exit:** CI green, lint clean and blocking, every route has a render test.

---

## Phase 1 — Foundation: Tailwind + shadcn, zero visual change *(~1 week)*

| # | task |
|---|---|
| 1.1 | Install Tailwind; scope the preflight so existing CSS is not reset |
| 1.2 | Extract the **88 duplicated CSS blocks** into `tailwind.config` theme tokens — colours, spacing, radii, shadows |
| 1.3 | `shadcn init`; add `cn()`, `clsx`, `tailwind-merge`, `class-variance-authority` |
| 1.4 | Configure shadcn's theme to emit **the current design**, not shadcn defaults |
| 1.5 | Add Tailwind to one small page as a proving ground; ship it |

> **1.1 is the step that goes wrong.** Tailwind's preflight resets `button`,
> `h1`, `table`, `ul` — and 35,067 lines of CSS assume browser defaults.
> Disable preflight initially, or scope it, and enable it per-page as each is
> migrated. Skipping this restyles all 108 pages at once.

**Exit:** Tailwind and shadcn installed, tokens match today's design, one page
converted, nothing else looks different.

---

## Phase 2 — Primitives, by payback *(~4 weeks, incremental)*

One primitive at a time, in count order. Each is independently shippable.

| # | primitive | pages | notes |
|---|---|---:|---|
| 2.1 | `Table` + TanStack Table | **50** | Biggest win. Gives sorting/filtering/virtualisation the hand-rolled ones lack |
| 2.2 | `Badge` | **37** | Fold in the existing `StatusBadge`; single source for status colour |
| 2.3 | `Dialog` / `AlertDialog` | **36+8** | Fixes focus trapping and Escape handling, which hand-rolled modals rarely get right |
| 2.4 | `Skeleton` | **27** | Replaces bespoke spinners |
| 2.5 | `Pagination` | **23** | |
| 2.6 | `Calendar` + `Popover`, `Sonner`, `Tabs`, `Select` | 9/7/3/2 | Cheap once the pattern is established |

As each primitive lands, delete the CSS it replaces. **Track CSS lines removed
as the phase's progress metric** — the target is 35,067 → under 5,000.

---

## Phase 3 — Data layer *(~2 weeks)*

| # | task |
|---|---|
| 3.1 | TanStack Query for all server state — cache, dedupe, background refetch, one loading/error convention |
| 3.2 | Generate types from the backend's `drf-spectacular` schema (Backend Phase 0.6) so the 220 call sites are typed end to end |
| 3.3 | Replace 20 files of direct `localStorage` with one typed `useAuth()` / `useSession()` |
| 3.4 | `react-hook-form` + `zod` for the large forms, starting with `Add_Sales` |

3.2 is the highest-leverage item in the whole plan: it makes the FE↔BE contract
compiler-checked instead of conventional, and it depends on a backend task
that is already scheduled.

---

## Phase 4 — Page decomposition *(~3 weeks)*

Follow `SalesInvoice/` — the pattern already in-tree:

```
pages/Add_Sales/
  index.tsx          view composition only
  useAddSales.ts     state + effects
  components/        page-specific pieces
  types.ts
```

Order: `Add_Sales` (4,410) → `ApprovalManagement` (2,406) → `Dashboard`
(1,846) → `Product_Stock` (1,817) → `InvoiceReview` (1,692) →
`Scheme_Manager` (1,658).

Do not start before Phase 2 — decomposing a page still full of bespoke tables
and modals means moving that code twice.

---

## Phase 5 — Performance *(~1 week)*

| # | task | expected |
|---|---|---|
| 5.1 | `React.lazy` per route | The largest single win — no user should download `exceljs` to log in |
| 5.2 | Dynamic-import `exceljs` / `xlsx` at click time | −930 KB from the main chunk |
| 5.3 | Dynamic-import `recharts` and `html5-qrcode` | Chart and scanner pages only |
| 5.4 | `manualChunks` for the remaining vendor split | |
| 5.5 | Virtualise the largest tables (free with TanStack, Phase 2.1) | |

5.1 and 5.2 are independent of every other phase and could be done first if a
quick win is wanted.

---

## Phase 6 — Quality *(~1 week)*

| # | task |
|---|---|
| 6.1 | Accessibility pass — shadcn/Radix gives keyboard and ARIA behaviour for free; audit what remains |
| 6.2 | Error boundaries per route (`ErrorBoundary` exists; apply it) |
| 6.3 | Remove the remaining 815 inline styles |
| 6.4 | Remove the remaining `any` |
| 6.5 | Storybook for the shadcn-based component set |

---

## 8. Suggested order

```
WEEK 1      Phase 0   safety net
WEEK 2      Phase 1   tailwind + shadcn foundation
WEEK 3      Phase 5.1-5.2  code splitting        ← independent, big, cheap
WEEK 4-7    Phase 2   primitives, by count
WEEK 8-9    Phase 3   data layer  (needs backend 0.6 for 3.2)
WEEK 10-12  Phase 4   page decomposition
WEEK 13     Phase 5   remaining performance
WEEK 14     Phase 6   quality
```

Phase 5.1–5.2 is pulled forward deliberately: it is a large, visible
improvement that touches almost nothing else.

---

## 9. Invariants — do not break these

1. **`device_id` and `device_last_sync` must survive logout.** Clearing them
   mints a new device per login and fills the backend with phantom rows.
2. **Auth paths are never auto-retried or refreshed** — `/auth/login/`,
   `/auth/refresh/`, `/auth/logout/`. Retrying a failed login is a lockout.
3. **`api.ts` must not import `webDeviceService`.** The header provider is
   registered by inversion of control specifically to avoid that cycle.
4. **`RequirePermission` is not security.** Do not let a refactor present it as
   such. The server is the boundary — and per §2 it currently is not enforcing.
5. **Admin passes implicitly** in three places — `RequirePermission`, the
   sidebar's `canSee`, and the backend's `granted_keys()`. All three must agree.
6. **Company/branch is a lookup key, not a label.** Oil, Beverages and Mart are
   separate SAP databases; the same DocNum is a different document in each.
7. **`Invoice_Report` sends DocNum through the backend proxy**, not DocEntry to
   the Crystal service directly. Settled 2026-08-26 — see
   [`BRANCH_MERGE_2026-08-26.md`](BRANCH_MERGE_2026-08-26.md) §F2.2.
8. **`.gitattributes` must stay.** Three branches committed CRLF blobs; without
   `* text=auto` every future merge degenerates into whole-file conflicts.

---

## 10. What this document does not cover

- **Not every one of the 102,738 lines was read.** Routes, the API surface, page
  weight, duplication and styling were measured mechanically and are complete.
  `services/api.ts`, `RequirePermission` and the config were read directly.
  Individual page business logic was not.
- **No runtime profiling.** Bundle figures come from the real build; render
  performance was not measured.
- **No design review.** This plan preserves the current visual design; whether
  that design should change is a separate decision.
- **`OMS-app` (React Native) not examined** — separate repo, not checked out.
