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

| signal | as written (2026-08-26) | now (2026-08-27) |
|---|---|---|
| TypeScript errors | **0** | 0 |
| ESLint | **142 problems** (114 errors, 28 warnings) | 126 (98 errors, 28 warnings) |
| Tests | **0** | **271**, 12 files |
| Explicit `any` | 77 in pages, plus lint errors elsewhere | 87 lint errors remaining |
| Inline styles | 815 | 815 |
| Production bundle | **2.71 MB** (729 KB gzipped) | **466 KB** (137 KB gzipped) initial |
| Largest chunk | `index-*.js`, no route-level code splitting | per-route chunks; `exceljs`/`xlsx`/scanner on demand |

> The right-hand column is the state after the work recorded in §11. The
> left-hand column is what this document was written against and is kept so the
> plan's reasoning still reads against the evidence that produced it.

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
| 2.3 | `Dialog` / `AlertDialog` | **mostly done** — **48 of 57 modals converted**. Primitive built on `@radix-ui/react-dialog` (the first Radix package in the tree; the other primitives are hand-rolled cva, but a focus trap is not worth writing a 45th time). 9 unit tests assert BEHAVIOUR — Escape, Tab wrapping, the page behind leaving the accessibility tree, focus returning to the trigger — every one of which fails on the markup it replaces. The tracker family was converted structurally (`DialogHeader` / `Body` / `Footer`); the rest use `variant="bare"`, which keeps each panel's own stylesheet and inner markup and takes only the behaviour, so 35 modals moved without a restyle. Accessible name is a required `title` prop, deliberately separate from the visible heading. 157 lines of overlay CSS commented out. **Not converted:** 4 busy/progress overlays (not dismissible, so Escape must not close them), `ApprovalUI`'s generic `Modal`, and 4 SalesInvoice/HAIS dialogs whose markup did not fit the wrapper shape. |
| 2.4 | `Skeleton` | **27** | Replaces bespoke spinners |
| 2.5 | `Pagination` | **23** | |
| 2.6 | `Tabs`, `Toast` | **done** — the two that were worth doing. `TabList`/`Tab` adds the half of the ARIA tabs pattern all three tablists were missing: arrow keys, Home/End, and a roving tabindex. Getting `role="tablist"` right and the keys wrong is worse than plain buttons, because the role promises an interaction that is not there. `Toast` makes the five silent confirmations announce — and renders the live region unconditionally, because `{toast && <div>}` mounts region and message together, which is precisely how an aria-live region ends up saying nothing. Both keep their legacy classes, so no restyle. 8 unit tests. |
| 2.6 | `Calendar` + `Popover` | **not doing** — the plan counted 9 pages of date fields, but they are ~30 native `<input type="date">`. A JS calendar behind a popover would LOSE things they already have: typing a date straight in, the OS picker on mobile, the browser's own locale handling and its built-in keyboard support. This is an order-entry app where people type dates all day. Every other primitive in Phase 2 replaced something hand-rolled with something better; this one would replace a platform control with a worse copy of it. Revisit only if a design calls for range selection, which nothing here does. |
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

## Phase 4 — Page decomposition *(~3 weeks)* — **done, 2026-09-02**

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

`Add_Sales` was already split by the time this phase started — a side effect
of Phase 3.4's eight-step form rewrite left it as a 184-line entry point plus
a sibling `salesOrder/` folder. The other five were split today; see "Phase 4
— the last five page decompositions" near the end of this document.

---

## Phase 5 — Performance *(~1 week)*

| # | task | expected |
|---|---|---|
| 5.1 | `React.lazy` per route | The largest single win — no user should download `exceljs` to log in |
| 5.2 | Dynamic-import `exceljs` / `xlsx` at click time | −930 KB from the main chunk |
| 5.3 | Dynamic-import `recharts` and `html5-qrcode` | Chart and scanner pages only |
| 5.4 | `manualChunks` for the remaining vendor split | **done** — see 5.4 below. First load 204.5 → 170.5 kB gz (most of it one page that was never lazy); per-deploy re-download 140.6 → 16.3 kB gz, and a cache cascade that re-hashed 38 of 97 chunks now re-hashes 3 of 88. |
| 5.5 | Virtualise the largest tables (free with TanStack, Phase 2.1) | **done, 2026-09-02** — `@tanstack/react-virtual` added and wired into Product_Stock, InvoiceReview and Scheme_Manager's main lists, folded into their Phase 4 splits. Deliberately skipped on ApprovalManagement and Dashboard — every table on those two pages is small by construction (a handful of rows at most), so virtualising them would add a dependency and DOM complexity for no benefit. |

5.1 and 5.2 are independent of every other phase and could be done first if a
quick win is wanted.

---

## Phase 6 — Quality *(~1 week)*

| # | task |
|---|---|
| 6.1 | Accessibility pass — shadcn/Radix gives keyboard and ARIA behaviour for free; audit what remains | **done, 2026-09-02** — 42 files fixed (icon-button accessible names, label/input association, alt text, focus-suppression). Scoped to order-entry, tracker, invoice and approval pages first; a handful of lower-traffic settings screens (Combo_Mapping, FOC, Drafts, UI_Labels, Staff) were left for a follow-up pass — see below. |
| 6.2 | Error boundaries per route (`ErrorBoundary` exists; apply it) | **done** — see "6.2 — error boundaries per route" below. |
| 6.3 | Remove the remaining 815 inline styles | **done** — 447 → 48 (14 of those are a dead route left inline on purpose; the rest are genuinely data-driven values). See the Phase 6.3 sections below. |
| 6.4 | Remove the remaining `any` | **done** — 0 `any`, 0 lint errors. See "Phase 6.4" below. |
| 6.5 | Storybook for the shadcn-based component set | **done, 2026-09-02** — installed (Vite builder), one story file per Phase 2 primitive (Table, Badge, Dialog, Skeleton, Pagination, Tabs, Toast) with real domain content, not every component in the tree. |

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

---


### Phase 3 — data layer

| # | state |
|---|---|
| 3.1 | **done, 2026-09-02** — 18 pages converted in the original batches (tracker module, manager reports, SAP master-data tabs, three order-history pages), plus 2 more found by a 2026-09-02 sweep of the whole `src/pages/` tree that the original map had missed entirely (`Label_Checker.tsx`, `Nutrition_Manager.tsx`). What remains hand-fetched is deliberate: the three `*_Order` mutation/submit paths (React Compiler bailout risk, no user-visible gain), `Order_Tracking.tsx`'s click-triggered details fetch (same latent-risk shape, treated as its own follow-up), and a couple of `SalesInvoice/` files already mid-split. See below. |
| 3.2 | **extended, 2026-09-02, still honestly partial** — see below and "Phase 3.2 continued". |
| 3.3 | `useAuth()` — done (see above) |
| 3.4 | **done** — Tracker_Entry established the pattern; `Add_Sales` followed in eight steps (0-7), see below. |

#### 3.1 — the query client, and why its defaults are the deliverable

`src/lib/queryClient.ts` is the whole of Phase 3.1's value so far, because the
defaults are decisions the 220 call sites are currently making implicitly, in
whatever each `useEffect` happens to do. Each one has a test in
`queryClient.test.ts`:

* **`retry` is a predicate, not `3`.** The library default means three round
  trips before a user is told they lack permission, and three attempts to
  submit a payload the server already rejected. Only 5xx and "no response at
  all" repeat.
* **Mutations never retry.** Repeating a failed write is how an order gets
  submitted twice.
* **`refetchOnWindowFocus: false`.** Eight queries on a dashboard means eight
  requests for alt-tabbing to Excel and back. Live screens opt in with
  `refetchInterval`.
* **`staleTime: 30s`** — long enough that a detail-page round trip does not
  refire the list, short enough that two people working the same queue are not
  acting on each other's stale rows.

**Tracker_Alerts** (query only) is the clearest before/after: its old
`setInterval(load, 60000)` kept firing while the tab was in the background, set
state after an await with no cancellation, resolved overlapping loads in
arrival order, and left stale alerts on screen when a poll threw.

**Tracker_Invoices** (query + mutation) shows the other half. Its filters split
into a draft and an `applied` set, which is now the query key — so re-running a
search is a cache hit, and, more importantly, deleting a row invalidates the key
rather than calling `load()` with whatever the form currently holds. The old
code would silently change the table under a user who had edited a filter
without pressing Apply.

**The tracker module is now converted end to end** — Alerts, Queue, Invoices,
Reports, and the stage admin — which is the point of doing a module rather than
scattered pages. Stages were previously fetched independently by four places
with four independent copies, so renaming a stage in the admin tab left the
assignment grid beside it showing the old name until a reload. They now share
one key and one cache entry.

**One panel was deliberately NOT converted**, and the reason generalises. The
lookup editor and the user-assignment grid edit rows in place before saving, so
their state is a *draft* of server state rather than server state. Putting that
in the query cache lets a background refetch overwrite what someone is halfway
through typing — the cache is authoritative and the keystrokes are not.
Separating draft from fetched is real work, not a mechanical swap, and any
sweep of the remaining call sites will hit this shape repeatedly.

**Not swept.** ~213 call sites remain. Each conversion is a judgement about
staleness and invalidation for that screen, and doing them mechanically would
produce 218 copies of a default that suits none of them.

#### The `catch (error: any)` count, and the fix the plan said was blocked

The "what remains" note above says the 36 `catch (error: any)`s were blocked on
plan item 3.2, because typing them individually needs a response type per
endpoint. That reasoning was half right. Typing *the error* does not need a
per-endpoint type: the shapes a DRF API can return on failure are a short,
closed list, and `src/lib/apiError.ts` is that list.

`messageFrom(error, fallback)` was promoted from
`pages/Payments/useApprovalAdmin.ts`, which had it right for one module while 36
other sites each did it worse. **All 36 are now gone** — every `catch (x: any)`
outside `Add_Sales` is `catch (x)`.

Three passes, because the shapes were not uniform:

1. The plain `x?.response?.data?.detail || "…"` — 8 sites.
2. The same with a `|| JSON.stringify(x?.response?.data) ||` middle term, which
   `messageFrom` supersedes: it reads the field map properly instead of dumping
   a JSON blob at the user — 23 sites.
3. Five that route a NAMED field somewhere specific, and so genuinely could not
   use a "first field wins" extractor: a duplicate invoice number onto the
   invoice-number input, an import's per-row error list into a summary,
   `UI_Labels`' two fields in a deliberate order, and user creation. Those got
   `errorBody()` and `fieldError()` — typed access to the body, which is all
   they ever needed the `any` for.

`App_User`'s is worth singling out. Creating a user is a multi-write call and
the common failure is a duplicate username *or email or both*; DRF reports that
as two field errors, and reading only the first tells the admin to change the
username while the email is also taken — so they fix one thing, submit, and fail
again. Collapsing the pair into one sentence is why that function exists, and it
is exactly what a generic extractor would have destroyed.

**One key order changed as a result.** `sap_error` now sits above the generic
`error`: a Service Layer failure sends both, the generic one says "Failed to
post" and the SAP one names the item. `MartApproval` had worked that out by hand
(index.tsx:131) and nothing else had.

**This changes user-visible text, deliberately.** A site that read only `detail`
showed its own generic fallback whenever the server answered with `message` —
"Action failed" in place of the reason. The keys are now tried in a fixed order
(`detail`, `message`, `error`, `sap_error`, `details`, then non-field, then a
named field error), so the server's own wording wins wherever it exists and the
caller's fallback becomes what it was always meant to be: the last resort. A
non-axios throw returns the fallback rather than its own `.message`, because
"Cannot read properties of null" is not something to show a billing clerk.

#### 3.4 — the form pattern, established on Tracker_Entry rather than Add_Sales

The plan names `Add_Sales` as the starting point. It is 4,400 lines with no
form-level test coverage, and a screenshot cannot catch a validation rule that
stopped firing or a field that silently stopped submitting — so it is the worst
possible place to learn what the conversion costs. Tracker_Entry has 14 fields,
a hand-rolled `validate()`, a review step and a create/update pair: the same
shape, small enough to check.

**The schema is the deliverable.** `src/schemas/trackerInvoice.ts` replaces
thirteen `if (!form.x) e.x = "Required"` lines, and fixes what that shape always
costs:

* **The rule and the type were separate claims.** `InvoiceWrite` types
  `gst_type: number`, so `gst_type: 0` type-checked and then failed a check
  living in another file. The schema now produces the type, so they cannot
  drift.
* **Every message said "Required".** Accurate, and the least useful thing
  thirteen messages can say when eleven fields are empty at once. Each field
  names itself.
* **A rule the `if` chain could not express**: an additional charge with no
  amount posted silently as zero. It is now an error on the amount field.
* **Validation ran only on Review.** `mode: "onTouched"` re-checks a field once
  the user has left it.

**The conversion stayed a state-layer swap.** `watch()` rather than
`getValues()` means the JSX reads `form.x` exactly as it did under `useState`,
so thirty controlled inputs were not rewritten — the only reason a form this
size could move without form-level tests. The two multi-field writes
(`pickVendor`, typing over a picked vendor) became explicit `setValue` calls,
which made the un-picking rule visible where it had been buried in a spread.

Server-side field errors go through `setError`, so a duplicate invoice number
lands on the invoice-number field beside the schema's own messages rather than
in a separate alert.

**Covered from both sides.** `schemas/trackerInvoice.test.ts` (10 tests) proves
the rules; an interaction test proves they are WIRED — the resolver runs, the
messages reach the fields, and Review does not open over an invalid form. A
schema can be perfect and connected to nothing.

#### 3.2 — generated types, and the honest size of them

`npm run types:api` regenerates `src/types/openapi.yml` and
`src/types/api.generated.ts` from the backend. The generator script is
`scripts/generate-schema.mjs` rather than an inline npm command, because the
Python interpreter path is not the same string on every machine.

**The schema has 281 paths and 65 component schemas.** That gap is the finding,
not a setup error: `drf-spectacular` can only infer a response from a
`serializer_class`, and 1,119 of this backend's operations are function-based
views or bare `APIView`s that assemble their JSON by hand. Those type as
`unknown`. So the generated types cover the ORM-backed masters — parties,
products, branches, assets, approvals, invoice logs, SKUs — and NOT orders,
auth users or the tracker, which are exactly the hand-rolled ones. Closing that
needs `@extend_schema` on the backend views; the plan's original phrasing
("so the 220 call sites are typed end to end") assumed the schema already
described them, and it does not.

**What was built on top is the part that pays.** `src/types/conformance.ts`
asserts, at compile time, that every value the server can send fits the type the
client declares — and only that direction, so a page may still type a narrow
subset. It fired immediately on six types:

* `Product.item_name` is nullable on the server and was `string` here. It found
  a real call site: `Product_Stock` passed a raw row into a `ProductOption`
  that requires a name, so a SAP item imported without a description would have
  put `undefined` where a product name goes.
* `Party.address`, `PartyAddress.full_address`/`city`/`state`/… — nullable on
  the server, `string | undefined` here.
* `Branch.is_active` and every counter on `SyncLog` — optional on the server,
  required here.

The 87 `any`s are a separate problem and mostly not this one: 36 are
`catch (error: any)`, which no amount of response typing fixes.

## 11. Status — 2026-08-27

Work completed against this plan, in the order it happened rather than the
order §8 suggests. Access control came first because the cross-repo finding in
§2 made it the most urgent item, not because the plan ranked it so.

| plan item | state | note |
|---|---|---|
| 0.1 Vitest + CI | **done** | Vitest + React Testing Library, 247 tests, CI workflow added. |
| 0.2 Smoke test per route | **done** | All 54 page components mount without throwing (`src/pages/routes.smoke.test.tsx`); a coverage test fails if a route is added to the access table without one. |
| 0.3 `services/api.ts` tests | **done** | Refresh single-flight, 401 retry, correlation IDs, deprecation headers — exercised through the real interceptors. |
| 0.4 Fix 114 ESLint errors | **done (2026-09-02)** | 114 → 98 as of this table, then → 0 via Phase 6.4/6.6's compiler-backed hook-rule work. CI runs lint on every push, so it is blocking. |
| 0.6 Playwright: login → order → submit | **done (2026-09-02)** | `e2e/smoke-e2e-path.spec.ts` — real login, builds an order through the Add_Sales wizard, submits, asserts the success dialog. |
| 2.1 `Table` primitive | **started** | See "Phase 2" below. |
| 0.5 Delete 4 orphan stylesheets | **done** | `Branches`, `Logs`, `Payments`, `Products` — 808 lines. |
| 0.6 Playwright | **partial** | Visual regression harness done: 33 route baselines, mutation-tested. The login → order → submit path is still to write. See "Visual regression" below. |
| 3.3 localStorage → one `useAuth()` | **done** | `src/auth/` — provider above the router, one session loader, one permission rule mirroring `core/permissions.py`. |
| 5.1 `React.lazy` per route | **done** | 52 pages split. `Login` stays eager. |
| 5.2 Dynamic-import `exceljs` / `xlsx` | **done** | `exceljs` already was; `xlsx` now loads at import/export time via `utils/xlsxLoader.ts`. |
| 5.3 Dynamic-import scanner | **done** | `html5-qrcode` behind the existing `scanning &&` guard. `recharts` splits per chart page automatically. |
| 5.4 `manualChunks` vendor split | **done** | Caching improvement, and a size one after all: Sales_Invoice was never lazy. First load 204.5 → 170.5 kB gz; per-deploy 140.6 → 16.3 kB gz. See below. |
| — react-router upgrade | **done** | 7.13.1 → 7.18.3, clearing 12 high advisories. Not a plan item; found while measuring chunks. |
| 6.2 Error boundaries per route | **done** | `RouteErrorBoundary` inside the shell, keyed on the pathname. See below. |

### Beyond the plan

Access control was rebuilt because §2's finding cut both ways: the server was
not enforcing, and neither was the client. 58 of 59 routes rendered for anyone
who typed the URL.

- `auth/routeAccess.ts` — one table, read by both the router and the sidebar,
  covering all 59 routes. `ProtectedPage` attaches the check to the shell, so a
  new route cannot be added unguarded.
- `auth/actions.ts` — the same for actions rather than pages. Every entry
  records **how the server enforces it**, which is what surfaced that
  `PATCH /api/invoice/<id>/update-status/` carries only `IsAuthenticated`: any
  signed-in user can approve an invoice. That endpoint needs a permission
  class; the client gate is not a substitute.
- `Sidebar.tsx` 1,291 → 922 lines; notifications and web push moved to
  `components/sidebar/`.

### 6.2 — error boundaries per route

The root boundary sits above the router, so a render error anywhere unmounted
**everything**: sidebar, header, and the navigation the user would have used to
get out. What was left was a full-screen apology whose two buttons were both
`window.location` calls — a hard document reload, throwing away every cached
query and every open form in the app.

It also could not recover. A class boundary holds `hasError` until something
remounts it, and above the router nothing ever does — which is *why* its
buttons had to reload.

`RouteErrorBoundary` sits inside `ProtectedPage`, beside the Suspense boundary,
with `key={location.pathname}`:

* the shell survives, so the user navigates away instead of reloading;
* the key makes navigation itself the reset — leaving the broken page clears it;
* "Try again" re-renders the same page, so a transient failure recovers in place.

The root boundary stays, now catching what it should always have been for: a
crash in the shell itself.

**One detail is load-bearing.** The heading is still the exact string
`e2e/harness.ts` refuses to screenshot. Rewording it would let a crashed page be
baselined as if it were fine — the failure that guard exists to prevent — so
both boundaries say "Something went wrong" deliberately.

**Finding, from writing the e2e test.** The first version induced a crash by
feeding `/tracker/my-queue/` a bad shape. It did not crash: the Phase 3.1
conversion reads `data?.invoices ?? []`, so the query layer had made that page
resilient by accident. A crash test has to target a page that still crashes —
`/Tracker_Reports` does.

### 5.4 — chunking: one missed page, and a cache that never held

Measured on the production build, first load = the entry chunk plus everything
`index.html` preloads.

| | before | after |
|---|---|---|
| first load | 724.1 kB / **204.5 kB gz** / 12 files | 567.0 kB / **170.5 kB gz** / 10 files |
| render-blocking CSS | 132.2 kB / 23.5 kB gz | 43.3 kB / 9.6 kB gz |
| re-downloaded per deploy | 480.7 kB / **140.6 kB gz** + 34 page chunks | 61.0 kB / **16.3 kB gz** + 2 page chunks |
| total JS | 3,816 kB | 3,812 kB |

**Sales_Invoice was never lazy.** Phase 5.1 converted 100 pages and missed one:
`import SalesInvoice from "./pages/Sales_Invoice"` sat between two `lazy()`
lines, so `index.tsx` + `useSalesInvoice` + `ContentsTab` + `DraftStep` +
`OrdersStep` — about 173 kB before minification, plus 89 kB of stylesheet —
were downloaded before the login form could paint, by every user, including the
ones who never issue an invoice. That single line is most of the first-load
figure above: 204.5 → 166.7 kB gz on its own.

**The vendor split does not make the first load smaller, and that is fine.**
Grouping cost 1.5 kB gz in cross-chunk boilerplate; nothing about splitting a
bundle removes bytes. What it buys is the third row. The entry chunk used to mix
react-dom, react-router, Radix and TanStack Query — which change a few times a
year — with `App.tsx`, `Sidebar` and the services, which change most weeks. One
chunk means one hash, so a one-line Sidebar edit invalidated all 140.6 kB and
every returning user re-downloaded React to read a corrected tooltip.

**The groups name packages, never `/node_modules/`.** The obvious one-line
`vendor` rule is actively harmful here: it would put exceljs (930 kB), xlsx
(425 kB), html5-qrcode (370 kB) and recharts (303 kB) in the same chunk as
React, and because the shell needs React, all four would land in front of the
login form. Those are already isolated behind dynamic imports (5.2) and must
stay that way. `react-icons` is excluded for the same reason: the sidebar
imports `hi2`, and a blanket rule would drag every other set onto the critical
path, so the group names `hi2|lu` — the two sets the shell actually loads.

#### The finding: the cache was cascading anyway

The first version of this split looked right and was worth almost nothing. A
one-character edit to a string in `Sidebar.tsx`, rebuilt, re-hashed **38 of 97
chunks** — every page in the app.

The cause is that lazy page chunks imported the *entry* chunk. `services/api`,
`auth/session`, `config/pageAccess` and the `ui/` primitives were living in the
entry because the shell imports them too, which made the entry a dependency of
34 page chunks. Change the entry's hash and the `from "./index-xxx.js"`
specifier inside all 34 changes with it, so they re-hash as well. A deploy
invalidated essentially the whole app no matter how small the change — before
this phase and after the vendor split alike.

A `shared` group for the app's own cross-cutting modules cuts that edge. Pages
now import `shared-<hash>.js`, which changes only when the shared code does:

* one-line Sidebar edit → **3 of 88 chunks re-hash**, down from 38 of 97;
* the 85 unchanged chunks include every vendor chunk and every page.

`src/services/` as a whole is *not* the rule. That directory mixes the axios
instance every request goes through with one wrapper per feature —
`ordersService`, `schemeService`, `haisService` and ten more. Matching the
directory put all 107 kB of it in front of the login form, and `haisService` is
of no interest to anyone who never opens HAIS. Naming the core four leaves the
feature wrappers in the chunk of whichever page imports them, which Vite already
splits out on its own when several do. Narrowing the rule this way took the
`shared` chunk from 69.7 kB to 30.6 kB with no change to the cascade result.

Two page chunks still follow the entry: `UI_Labels` and `Profile` import
`showToast` from `components/NotificationToaster`, a shell component that also
exports an imperative API. Moving that API into `lib/` would close the last edge
and probably clear a `react-refresh/only-export-components` warning; it is a
source change rather than a build change and only two pages are affected.

**This is not verified by the visual suite.** A screenshot cannot see a chunk
boundary. The evidence is the rebuild-and-diff above, run against emitted
filenames; the suite's job here was only to prove that reorganising the graph
changed nothing a user sees, and 372 unit tests / 60 baselines stayed green.

#### 5.4 follow-up — the cascade is closed, and my own rule was wrong twice

The `shared` group left two page chunks pinned to the entry. Both are fixed, and
both fixes came from reading the imports rather than reasoning about them.

**`showToast` moved to `lib/toastStore.ts`.** `NotificationToaster.tsx` exported
a component *and* two functions, so any page wanting a toast imported a SHELL
component and dragged the entry chunk into its graph. That was the last thing
pinning `UI_Labels`. Moving the store out also cleared the file's two
`react-refresh/only-export-components` errors — editing the toaster had stopped
hot-reloading cleanly for the same reason. `subscribeToToasts` now returns its
own unsubscribe, so `useEffect(() => subscribeToToasts(setItems), [])` is
correct by construction; the old add/delete pair made forgetting the cleanup the
default. 5 unit tests.

**`SERVICE_CORE` had the wrong membership, in both directions.** The rule is one
question, and the imports answer it: *does the shell and at least one page
import this?*

* `webDeviceService` — Sidebar, `main.tsx`, Login **and** Profile. It was
  missing, which is what pinned `Profile`. Adding it costs nothing on first
  load: it was already eager, sitting in the entry chunk instead.
* `notificationBus` — only the sidebar's notification code. It was in the list
  on the assumption it was cross-cutting. A shell-only module in `shared`
  re-hashes every page chunk when it changes, for pages that never imported it.
  Removed.

| one-line Sidebar edit re-hashes | chunks |
|---|---|
| before Phase 5.4 | **38 of 97** |
| after the `shared` group | 3 of 88 |
| after these two fixes | **1 of 88** |

First load is unchanged at 566.9 kB / 170.3 kB gz — both moves were between
chunks that were already eager. Lint 64 → **62 errors**.

#### 2.3 — the Approval console's `Modal`, and two defects it exposed

One component behind **nine call sites**, so it is the highest-leverage modal
left. It already had more than most: Escape, a body-scroll lock, `aria-modal`
and a real accessible name. What it could not do was trap focus (Tab walked
into the page behind), hide the background from assistive tech (`aria-modal` is
advisory), or put focus back on close.

The props are unchanged, so none of the nine call sites were touched.

**The conversion did not work, and the test said so.** Focus still landed on
`<body>`. All nine call sites render `{condition && <Modal … />}`, so `onClose`
drops the whole subtree — Dialog included — in the same commit. Radix restores
focus while tearing down a dialog that transitions open → closed; an abrupt
unmount never gives it that transition. `Modal` now captures the opener in a
mount effect and restores it on unmount, guarded on `isConnected` so a modal
that deletes the row its own button lived in cannot throw.

A structural sweep for other conditionally-mounted `<Dialog>` roots found
**none** — every direct conversion binds `open` to state and keeps the Dialog
mounted. The defect was unique to `Modal` because it is the only wrapper that
owns its Dialog while the *caller* controls its mounting.

**The primitive was putting two headings in the accessibility tree.** Radix's
`Title` renders `Primitive.h2`, so the sr-only accessible-name element was a
heading — and every converted dialog that also shows a visible heading gave a
screen-reader user the same title twice when walking by heading. `asChild` with
a `<span>` fixes it in one place for all 30-odd conversions; the element only
has to carry the `aria-labelledby` target, not be a heading.

Neither defect was visible to the visual suite — a screenshot cannot show a
focus trap or a heading list — and no baseline had an `apv` modal open at all.
**8 unit tests** cover it instead.

One deliberate visual change: the backdrop is now the primitive's, matching the
30 modals already converted. Same colour (`#0f172a`), 0.45 → 0.50 alpha, plus
the 2px blur. `.apv-modal-overlay` is commented out — Radix renders backdrop and
panel as siblings in a portal, so its flex centring could never position the
panel again. Its 20px padding moved onto `.apv-modal`'s width, which is why that
went from `100%` to `calc(100% - 40px)`: the panel is now fixed-positioned, so
`100%` resolves against the viewport rather than a padded parent.

#### 3.1 — first report pages, and three baselines that were pictures of nothing

`StateWise_Report` and `Inventory_Report` moved to `useQuery`. Two pages is a
small batch; what came out of them is not.

**StateWise_Report** keys on the DERIVED period rather than the two dates.
`getDashboardPeriod` collapses a range to a year and a month, and that pair is
all the request carries — so nudging a day inside the same month is now a cache
hit instead of a refetch.

**Inventory_Report** could not be swapped mechanically, and shows why the
"pages holding drafts of server state" caveat is real. `selectedWhs` was seeded
from the response on every load (`setSelectedWhs(data.warehouses.map(...))`),
and v5 has no `onSuccess`. Worse, the sentinel was already broken: a comment
said empty meant "all", but the filter reads `selectedWhs.includes(...)`, so the
**Clear** button showed *no* warehouses — only the constant re-seeding kept the
two readings from colliding. It is now `string[] | null`, where `null` is a
value the user cannot produce.

**Three baselines were photographs of nothing, and the third was a crash.**

* `/orders/dashboardW/charts/` had no fixture, so `StateWise_Report` rendered an
  empty table — and it was routed with **no baseline at all**, which is how its
  data layer got refactored with nothing watching.
* The **Dashboard** reads `state_item_sales` off that same endpoint
  (`Dashboard.tsx:403`) and branches on `length === 0` at `:2086`. Its baseline
  has been a picture of the empty branch since the panel was written. Adding one
  fixture populated a panel on a page this batch never touched.
* `/hana/inventory-report/` had no fixture either, so the endpoint answered `[]`
  — truthy, with no `groups`. The old loader crashed on `[].warehouses.map()`
  **inside its try**, fell into the catch, and rendered "Could not load
  inventory from SAP". `inventory-report.png` was a picture of that error card.
  Moving to `useQuery` removed the accidental throw, so the page crashed for
  real and `gotoStable`'s error-boundary guard caught it — the guard doing
  exactly its job.

That last one is the case for the guard in one paragraph: the failure was
already there, the screenshot was stable, it never flaked, and it looked exactly
like coverage.

**The linter could not see two effects until the fetch left.** Converting
StateWise's fetch surfaced three `react-hooks/set-state-in-effect` errors on
code that predates this work — the unanalysable fetch effect above them was
suppressing the rule. Both are now derived during render: a filter signature
stamped onto the page number (which also clamps it, so the shrinking-row-count
effect goes too), and the chosen item resolved against the current options.
`StateWise_Report` now has **no effects at all**. Lint is back at 62.

Coverage added: 2 route baselines and **5 interaction tests**, each asserting
the data is on screen before anything is photographed — including one that
unticks a warehouse, which is the behaviour the `null` sentinel most endangers
and which no route screenshot can see.

#### 2.3 — the three busy overlays, and the suite hitting a machine limit

`Auditor_Order`, `Billing_Order` and `Rate_Approver_Order` each put up a
blocking overlay while an order posts to SAP. They were excluded from 2.3 as
"deliberately not dialogs", and that was wrong: they are the modals where
containment matters most.

Each was a plain fixed `div`. It dimmed the page and stopped nothing — **Tab
walked straight into the page behind, so a keyboard user could re-press the
button that started the post while it was still running.** Auditor's carried
`aria-hidden="false"` on the backdrop, which does nothing about that.

They now use the primitive with Escape, pointer-down-outside and interact-outside
all cancelled, so they gain the trap, the inert background and focus restored
when the post finishes, while staying undismissable. The `role="status"` /
`aria-busy` wrapper is kept — and added to the two pages that never had one,
where the spinner was a bare animated `div` invisible to assistive tech.

`overlayClassName` is new on `DialogContent`, for the same reason
`variant="bare"` exists: the busy backdrop is deliberately heavier and blurred,
because that is how the screen says the page is blocked, and flattening it to
the default would erase a signal the design was making on purpose. No CSS
translation was needed — `.ao-modal`/`.bo-modal` are `width: 90%` inside a
full-bleed overlay, which is the same 90% of the viewport once the panel is
fixed-positioned. **5 unit tests**, none of which a screenshot could replace: no
baseline captures a SAP post in flight.

#### The visual suite outgrew this machine, and the trace says so exactly

At 66 checks the full run began failing one arbitrary test per run — a different
one each time, every one passing in isolation. The trace gives the cause without
guesswork: **`net::ERR_NO_BUFFER_SPACE`** fetching the entry chunk, with a blank
white page.

Every test gets a fresh browser context, so its HTTP cache starts empty and it
re-fetches the whole critical path over new sockets. Windows holds a closed
socket in TIME_WAIT for four minutes; a full run now takes about four minutes.
Connections from the first test are still held when the last one starts and the
ephemeral port pool runs dry.

Run as two processes the suite is green: **43 route checks + 23 interaction
checks**. `npm run test:visual:split` does that, and each half finishes inside
the TIME_WAIT window. Retries are deliberately not configured — they would hide
this, and hide a real failure with it.

Worth being explicit: this is a limit of the machine, not a defect, and the
evidence for that is the error code rather than "it passed when I ran it again".

#### 3.1 — the three manager reports, and a crash TypeScript did not catch

`Daily_Report`, `PersonWise_Report` and `Sales_Report` each fetched the same
three things on mount — the manager order history, the users, the main groups —
with near-identical try/catch/setState blocks. Nine copies for three pieces of
data. They now come from `lib/reportQueries.ts`.

**Sharing the key is the point, not sharing the code.** All three sit behind the
same Reports menu and people move between them. `loadManagerOrders` is the
expensive one — the whole order history the reports filter down — and it was
refetched in full on every navigation between the three. One key per dataset
means the second and third page render from cache.

Sales_Report's own two lookups (SAP products, SAP parties) went the same way,
which also removed a `console.log(data)` that was shipping to production.

**A ReferenceError that `tsc` passed.** Deriving `activeParty` put its `const`
below its first use. TypeScript only flags a temporal-dead-zone reference when
it is direct; this one sat inside a `.find()` callback, which TS treats as
deferred — but `.find()` runs immediately, so the page would have thrown
`Cannot access 'activeParty' before initialization` on first render. Caught by
reading the line numbers back, not by the compiler and not by a test.

**The same linter blind spot as StateWise, three more times.** Removing the
fetch effects made eight pre-existing `set-state-in-effect` errors visible
across the three pages: the reset-page-on-filter-change and clamp-page-on-shrink
pairs. All are now the stamped-signature derivation. Lint finished at **61**,
one below where this batch started, because the last `any` in Sales_Report's
user filter went with them.

**Process note.** I tried to do all three pages with one parameterised script.
It half-applied, left two files that would not compile, and failed on the third
— and since nothing is committed, `git checkout` would have discarded the whole
session's work on those pages. Repairing forward was the only option. A script
that edits three files should verify all three before writing any.

#### 3.4 step 0 — the Add_Sales wizard, driven past step 1 for the first time

Six endpoints had no fixture, so the order-entry wizard could never be tested
beyond its first screen. It now can: **5 interaction tests** take it from a cold
load to a confirmed line item on step 2, then to step 3 and the PO field.

What the fixtures fixed, each verified by an assertion rather than a screenshot:

* **`/orders/parties/`** fell through to `PARTY_ROWS`, which has
  `card_code`/`card_name`. The page reads `party.value` and `party.label`, so
  the dropdown rendered options with blank labels whose click handler was
  called with `undefined`. `PARTY_ROWS` is left alone — `/auth/users/{id}/
  parties/` and `/auth/parties/{code}/products/` also land on that pattern.
* **`/orders/branch/`** answered `[]`, so the dispatch auto-default never fired
  and `canAdvance(1)` was false forever. **Step 1 was unsubmittable, and its
  baseline is a picture of that.**
* **`/orders/addresses/`**, **`/orders/party-products/`**, `/orders/products/`
  and `/orders/schemes/` likewise.
* `/auth/companies/` gained a "Jivo Wellness" row, which is what the company
  auto-default matches on. Added rather than renamed — App_User reads it too.

**The finding that cost the most time: `category` is one vocabulary, not two.**
The first catalogue fixture gave products `category: "Edible Oil"` and parties
`category: "Distributor"`, copying PARTY_ROWS. The picker stayed empty. Choosing
a party seeds the first row with the party's category (`Add_Sales.tsx:1613`) and
filters the catalogue by it (`:398-403`), and the picker then matches that
against the PRODUCT's category — so a party and the goods sellable to it share
one set of strings. "Distributor" filters the catalogue to nothing. This is
exactly the class of wrong-shape fixture that produces a plausible screen and no
error.

**Two test-writing mistakes worth recording**, both of which would have passed
while asserting nothing:

* The combos only render their options on focus, so the first version waited on
  `.sl-party-option` that could never appear.
* `Pcs` is a readOnly `<input>`, so `toContainText` looks at text content and
  would have passed on a blank field. `toHaveValue` is the assertion that means
  anything there — and it is what makes the fixture's `sal_factor2` load-bearing
  rather than decorative, since a missing pack size makes every row
  unconfirmable.

The route baseline was regenerated: step 1 now shows a dispatch branch instead
of an empty form.

#### 3.4 step 0, part two — the payload snapshots, and the bug they found

The wire format is the only part of `Add_Sales.tsx` the backend can see, so it
is what makes the coming split provable rather than hopeful. It is now pinned in
two places, deliberately: **9 unit tests** in `src/services/ordersService.test.ts`
for what the service sends given a payload, and an interaction test that drives
the wizard to step 4 and snapshots the POST the page actually builds — the half
no unit test can reach, because that payload comes from ~40 pieces of component
state that only exist after four screens of clicking.

Both parse `config.data` / `request.postDataJSON()`, i.e. the serialised body,
not the JS object. That is not pedantry: `Number(undefined)` is `NaN` in JS and
`null` on the wire, so an object-level assertion reports a value the server
never receives.

**The bug: every v2 engine scheme was discarded in transit.** `createOrder` and
`saveDraft` each rebuilt every scheme as a fresh `{scheme_id, scheme_qty}`. That
is lossless for a legacy hand-picked scheme, which has nothing else, and total
loss for one the v2 engine resolved — the backend qualifies a v2 entry on
`scheme_v2_id` **alone** (`orders/services/order_items.py`,
`_extract_order_item_schemes`), and a scheme stripped of it has neither a scheme
nor a scheme_v2_id, so the entry is skipped outright. The salesperson saw the
giveaway on the review screen; the order saved without it. The Mart flow never
hit this because `createMartOrder` posts its payload unmapped.

Fixed by spreading the scheme rather than rebuilding it, and by emitting
`scheme_id` only when the source has one (otherwise `Number(undefined)` reaches
the backend as `null`, a lookup for nothing). The two character-identical copies
of the line normaliser are now one function — they were never allowed to differ,
since both post to `/orders/create/`.

The e2e half needed a `/orders/v2/schemes/preview/` fixture, and then a wait for
the giveaway to appear on the review screen before saving: the preview POST is
debounced 400ms and its proposals land well after the step advances, so without
that gate the payload depends on machine speed. The test failed exactly once
that way before the gate went in.

**Draft saving was unreachable from the wizard, and is now fixed.**
`renderWizardFooter` offered Back and Save Order; "Save as Draft" existed only
on the legacy form, which `useWizard` (`:234`) renders for edit / duplicate /
FOC. Creating a fresh order — the one flow a draft is for — could not reach it,
while `handleSaveDraft`, its payload builder and the whole `/Drafts` page stayed
live. The button now sits in the wizard footer on **every** step, not only the
last: an order you can finish is not the one you need to park. It is disabled
until a party is chosen, because `handleSaveDraft` sends `card_code` straight
through and a draft without one is a row nobody can resume.

T5 is therefore a real end-to-end snapshot after all, and the `add-sales` route
baseline was regenerated for the new footer — the only image in the suite that
moved.

#### 3.4 step 0, part three — the other form

`page.goto()` cannot reach the legacy branch: `useWizard` picks it only for
edit / duplicate / FOC, and `mode` arrives on `location.state`. The way in is to
click Edit on Order_Tracking — which renders only for a **rejected** order
(`Order_Tracking.tsx:823`), so the new `/orders/orderdetailsbyid/` fixture
answers for ORDER_ROWS[2]. Its `card_code` is deliberately one the party list
does not contain, because the edit loader injects the order's own party into
`parties` and that injection is part of what is under test.

**`item_type` is not a free label**, which cost the first attempt. It is the pack
size parsed out of the item name by `getProductType` — "1 LTR", not "PACK" — and
it populates the legacy Type select. A value outside that vocabulary leaves Type
on "--select--", which filters the Item select to nothing, and the order loads
back as a blank row. Same class of mistake as the party/product `category`
vocabulary above, in a different field.

**The step-6 hazard, now pinned by a test.** The legacy branch sits inside a real
`<form>`, so its `required` attributes participate in constraint validation; the
wizard's copies do not, because `renderWizard()` renders outside any form. An RHF
migration naturally wraps the wizard in a `<form>` and turns them all live at
once. `Deliverydate` and the per-row `boxes`/`qty` inputs are asserted to carry
them.

**Four of those attributes are already no-ops.** Dispatch, both addresses and
company are `required` on `type="hidden"` inputs (`:3452`, `:3522`, `:3582`,
`:4102`), and a hidden input is barred from constraint validation by the HTML
spec — the browser has never checked any of them. `validateBeforeSave` is the
only thing guarding those four fields, and re-creating these attributes during
the migration would re-create four no-ops. The test asserts the count, so
deleting them is a visible decision rather than a silent one.

The branch also has **its first screenshot**: ~850 lines — the legacy item table,
its scheme panel, its totals block — had never been rendered by any test, and
that is exactly the code Phase 4 decomposes. Captured after the load assertions,
so it photographs a loaded order rather than an empty form.

**Step 0 is complete.**

#### 3.4 step 1 — the split

`Add_Sales.tsx` was **4,282 lines**. It is now **184**, and the page is what its
name says: a heading, an edit-load spinner, the choice between two forms, and
the two dialogs that follow a save.

| file | lines | what it is |
| --- | --- | --- |
| `pages/Add_Sales.tsx` | 184 | the page |
| `pages/salesOrder/useSalesOrderForm.ts` | 2,051 | all state, effects, fetchers, derivations, handlers |
| `pages/salesOrder/OrderWizard.tsx` | 1,414 | the 4-step create flow, and the item modal |
| `pages/salesOrder/LegacyOrderForm.tsx` | 1,030 | the single-page edit / duplicate / FOC form |
| `pages/salesOrder/WarehouseField.tsx` | 36 | the one field both forms draw |

Deliberately a **move, not a rewrite** — the same code in the same order, lifted
out whole. The evidence is that nothing changed: `tsc` clean, 407 unit tests,
**76 visual checks including a pixel-identical legacy-form screenshot** and the
wizard payload snapshots, and lint unchanged at 61/24 (the split relocated the
existing violations and introduced none).

**The hook returns one object, not ninety values.** Consumers destructure what
they need and `SalesOrderForm = ReturnType<typeof useSalesOrderForm>` is its
inferred type, so a value added there reaches a consumer without a second
declaration. One hook is safe for two forms because `useWizard` is decided from
`location.state` and never changes for the life of a mount — only one form is
ever rendered against it.

**The two forms turned out to share almost nothing**, which is what made this a
clean cut rather than a shared-component layer. Of the twenty-two helpers
between them, exactly two are used by both: the Warehouse field (now a
component) and `isSchemePanelHidden` (pure logic, so it moved into the hook).
Everything else — the row dropdown, the facet rail, the item picker and modal,
the summary cards, the stepper — belongs to one side only. The scheme *panel* is
wizard-only; the legacy form has its own inline scheme markup, which is one of
the duplications step 2 can now see.

**What this unblocks.** `OrderWizard` renders outside any `<form>`, which is why
its `required` attributes are inert; the migration wraps it in one and they all
go live at once. That change is now confined to a 1,414-line file with the
legacy branch — where those attributes already fire — untouched behind a
different import.

#### 3.4 step 2 — the deletions the split made visible, and the ones it didn't

Small, and the interesting part is what did NOT turn out to be dead.

*Deleted:* the wizard's copy of the legacy draft-button guard,
`(!isEditMode || editOrderIsDraft)`. `useWizard` requires mode "create" and
`isEditMode` requires mode "edit", so inside `OrderWizard` that condition cannot
be false — it was a guard I had copied across an hour earlier.

*Not deleted, on inspection:* the legacy form's "Create FOC Order" label and its
`isLoadingFromOrder ? "Cancel" : "Clear"`. Both look dead — the legacy branch
only renders when an order is being loaded, so `isFocMode` is false and
`isLoadingFromOrder` true. But `mode` comes from `location.state`, and a state
carrying `mode: "edit"` with no `editOrderId` produces `isEditMode === false`
with `useWizard === false`: the legacy form, not loading from an order. The
labels are defensive against a malformed navigation, and they stay.

*Also:* `selectedCompany` and `martCompany` are consumed by nobody since the
split — they are inputs to `selectedCompanyLabel` and `isMartOrder`, not values
a form draws. Commented out of the hook's return rather than removed.

The four new files were run through Prettier, which the rest of the app already
follows and the extraction had not preserved.

#### 3.4 step 3 — a row is now something, not somewhere

`schemeOptions` (the legacy picker's options) and `schemeProposals` (what the v2
engine resolved) are `Record<..., …>` maps living **beside** `rows`, and they
were keyed by the row's POSITION.

`SalesRow` now carries a `uid`, minted by a module counter — a counter and not a
UUID or a timestamp because the visual suite freezes `Date` and seeds
`Math.random`, so anything drawn from either would differ between a test run and
a reload. `createEmptyRow` assigns one; `mapOrderToRows` assigns one to each line
of a loaded order.

What that removed:

* **`handleDeleteRow`'s renumbering.** It shifted every key above the deleted
  index down by one. Any other code path that reordered rows without repeating
  that fix-up handed one row's schemes to another; dropping the deleted row's
  own key is now housekeeping rather than correctness.
* **The index pairing in `submitOrder`.** It paired each row with its original
  index *before* filtering to confirmed rows, because filtering renumbered the
  keys the proposals were under. It is a plain `filter().map()` now.
* **The last blocker on `useFieldArray`** (step 6), whose `remove` and `move`
  renumber silently with nothing to hook.

`fetchSchemesForRow` takes a uid instead of an index for the same reason it now
matters: callers have the index to hand, but by the time the response lands the
row may have moved, and the index would write another row's options.

Two unit tests pin it — that uids are distinct, and that they survive the
spread-based updates every handler uses. 409 tests, 76 visual checks, lint 61/24.

**A miss in step 3, caught in step 4.** Three writes were still keyed by index:
the facet-clear in `handleRowChange`, the same in `OrderWizard`, and the edit
loader's `nextSchemeOptions[index]`. None of them READ the map, which is why the
re-key looked complete — and a computed number key compiles cleanly against
`Record<string, …>`, so `tsc` had nothing to say either. They were storing under
`"0"` what is only ever read back under `"row-1"`. Every write now goes through
`setRowSchemeOptions(uid, options)`, which takes a `string`, so passing an index
is a type error rather than a shrug.

#### 3.4 step 4 — the arithmetic, out of the component and under test

`recalculateRowTotals`, `computeLandingPrice` and `applyFocPricingToRow` now
live in `salesOrder/rowTotals.ts` as pure functions, with **12 unit tests**.

They were inside the component, closed over its state, so the only way to
exercise a pack factor was to mount the page and type into a box. The numbers
that decide what a customer is charged had no test at all, while the badge
colours had seventy.

`recalculateRowTotals` returns a NEW row and no longer assigns onto its
argument. That was survivable only because its one caller happened to pass a
fresh `{ ...row }`; the function promised nothing, and `useFieldArray` (step 6)
hands out the live field object, where the same code would mutate form state
behind the resolver's back and re-render nothing. One test does nothing but
assert the input is unchanged.

**Removed: a duplicated boxes calculation.** `handleRowChange` had two blocks —
`if (name === "boxes")` and `if (name === "boxes" || name === "scheme")` — with
identical bodies over identical inputs. A boxes change ran the whole calculation
twice and overwrote each value with itself. Commented out, not deleted.

**Not merged, deliberately:** that surviving block is *not*
`recalculateRowTotals(row, "boxes")` and must not be replaced by it. The helper
prices strictly off `basicPrice` and rewrites `priceListBasic`; the block falls
back to `priceListBasic` when there is no basic rate and leaves it alone. Two
pricing rules on two paths — a real inconsistency, and not one to resolve by
accident inside a refactor.

**The FOC defect is now pinned by a test** rather than only described in this
document: `applyFocPricingToRow` zeroes `priceListBasic`, keeps `basicPrice` and
prices the line off it, so an FOC order can carry a line worth 6,420 beside a
price list of 0. The test asserts today's behaviour, so fixing it is a
deliberate change with a failing test to prove it landed.

421 tests, 76 visual checks, lint 61/24.

#### 3.4 step 5 — the header, as one set of rules

`salesOrder/orderHeaderSchema.ts` (zod) plus **17 unit tests**. The header only —
the line items carry array state, two scheme maps and a confirm gate, and they
are step 6.

The header was validated by three different sets of rules, and they disagreed:

* **The wizard checked it; the save path did not.** `canAdvance(1)` requires a
  party, both addresses, a dispatch branch and a delivery date;
  `canAdvance(3)` requires a company. `validateBeforeSave` checked the items and
  the PO field and stopped — **none** of those six.
* **The legacy form checked nothing at all.** It has no `canAdvance`, and its
  `required` attributes for dispatch, both addresses and company sit on
  `type="hidden"` inputs, which the HTML spec bars from constraint validation.
  An order with no ship-to address could be saved from it, and `Number("")`
  reaches the backend as `null`.
* **The gates were written twice**, in two files, in two styles.

All three now defer to the schema. That is a **behaviour change on the save
path**, and the intended one: a save that would have shipped `null` addresses
now stops with a message naming the control to use.

The id fields are checked as **digits**, not as "not empty", because
`submitOrder` sends `Number(formData.billAddress)` — a label where an id was
expected becomes `NaN` and serialises to `null`, which is the same silent
failure T4 documented from the other end. `parties` is deliberately not in that
group: a card code is `C000123`.

Two details worth keeping:

* `idOf` is a single `superRefine`, not `.min(1).regex(...)`. Those are not
  short-circuited, so an empty field reported two messages, one of which
  ("could not be read") is wrong for a field nobody has touched. A field gets
  one problem at a time.
* The step gates ask only about the fields their own step owns. A required PO is
  a step 3 field, so gating step 1 on it would make the only screen showing the
  PO input unreachable. There is a test whose whole job is that.

`headerIssues` returns every problem with its field, which is what step 7 needs
to mark inputs individually; `headerProblem` returns the first, which is what
today's `alert` shows.

438 tests, 76 visual checks, lint 61/24.

#### 3.4 step 6 — `useFieldArray`, and the keystroke it ate

The line items now live in a react-hook-form field array. On its own that
changes nothing a user can see, which is the point: it is what lets step 7
address a row field as `rows.3.boxes` and put the message beside the input that
caused it, instead of in an `alert`.

It was blocked until step 3. `remove` and `move` renumber silently, and the two
scheme maps beside `rows` were keyed by position — any reorder handed one row's
schemes to another with nothing to hook. `keyName` is left at RHF's default
rather than pointed at `uid`, which would have RHF overwrite our identity with
one of its own: the same failure by a different route.

The twenty `setRows` call sites did not become twenty array operations. Those
that genuinely replace the whole list — reset, load-for-edit, seed a default
category — kept a `setRows` shim over `replace`; the per-row handlers became
`updateRow(index, row => …)` over `update`, `appendRow` and `remove`. "Which row
does this handler touch" is the first argument now instead of a comparison
inside a `.map`.

**The regression, and the test that caught it.** First version read the rows
with `useWatch({ control, name: "rows" })`. `useWatch` delivers through a
subscription, so within the render it triggers, `rows` is still the PREVIOUS
array — and these inputs are controlled from it. A keystroke landed in
`update()`, the re-render painted the value from before that keystroke, and the
character was gone: **typing "12" into Boxes left "2"**. `form.watch("rows")`
reads the form's current values at render time and fixes it.

Nothing already in the suite could see this. Every existing test uses
`fill()`, which sets a value in one shot and passes on a form that loses a
character per keystroke. The new test types **one key at a time** with
`pressSequentially`, then asserts the value, the focus, and that the derived Qty
followed — the only shape of test that can tell a working field array from one
that drops every other character.

438 unit tests, 77 visual checks, lint 61/24.

#### 3.4 step 7 — the alerts become messages

Six `alert()` calls, each returning at the first failure, are now one function —
`salesOrder/orderProblems.ts`, **10 unit tests** — returning the problems as
data: a map from header field to message, a map from **row uid** to message, and
one item-list message belonging to no row. The rules did not change. Where the
answers are delivered did.

What was wrong with an alert, in the order it matters:

* **One at a time.** Six empty fields meant six submits, each answered by a
  dialog that had to be dismissed before the form could be looked at again.
* **Nowhere.** "Choose a ship-to address" names the field but not where it is,
  and on the wizard it can be two steps behind the one you are on.
* **Nothing to test.** An `alert` has to be intercepted with a `window.alert`
  stub, and the test then takes the page's word for what it meant. The new e2e
  test stubs nothing: it clicks Add Item with no quantity typed and reads the
  message off the modal. Had it still been an alert, Playwright would have
  auto-dismissed the dialog and the assertion would have found nothing.

Messages appear only after the first save attempt, then stay live — a field
stops complaining as soon as it is fixed rather than at the next submit.
`handleConfirmRow` now RETURNS whether it confirmed, so the wizard's item modal
branches on the outcome instead of re-running `rowProblem` and risking a
different answer.

**`ProblemSummary` is a backstop, and the plan says so rather than implying
otherwise.** Trying to reach it from the UI is what proved it: both item
problems already disable the Save button, and every header field carrying a
LIVE native `required` — the delivery date, the PO when it is required — blocks
the submit before `validateBeforeSave` runs. What reaches the summary is the
case no click can produce: an order *loaded* with a hole in it, which is exactly
what the legacy edit path does with a null `bill_to_id`, and which had no check
at all before step 5.

**Plan item 3.4 is complete.** 448 unit tests, 78 visual checks, lint 61/24.

### 3.1 continued — two more query modules

**`lib/sapQueries.ts` — the Sap Sync tabs.** Products, Branches, Logs and
PartyDirectory are copies of one page: fetch a list on mount, filter it by a
search box, paginate it. Each carried its own `useState` + `useEffect` +
try/catch, and each got the same three things wrong the same way — a `loading`
flag that only described the first load, an error swallowed into `console.log`
leaving "No parties found" on screen, and a refetch every time the user switched
back to a tab.

**Two of the five files I converted first turned out to be dead.**
`pages/Parties.tsx` and `pages/Addresses.tsx` have no route and no import
anywhere in `src` — Sap_Sync's "Parties & Addresses" tab renders
`PartyDirectory`, which fetches and joins both lists itself, and the standalone
pages were orphaned when those two tabs were merged. I converted them before
checking who rendered them; the live page was the one I had not touched. Both
now carry a header saying so, and both keep the conversion, so adopting either
again is not a conversion job. The lesson is cheap and general: **check the
importers before the imports.**

Two behaviours changed, both improvements the old shape could not express:

* **Refresh no longer blanks the table.** `loading` was one flag for "first
  load" and "reloading", so pressing Refresh replaced the whole table with the
  word "Loading…". `isLoading` is the first load; `isFetching` is the button.
* **The array coercion is in the query.** Three of the five pages trusted the
  endpoint to return an array and two did not. Now none of them can forget.

They share a `["sap", …]` key prefix so a future "sync finished" handler can
invalidate `["sap"]` and reload every tab — which is what the Sync button ought
to do and currently cannot.

`PartyDirectory` gained two things beyond the shared key. It fetched both lists
in one `Promise.all`, so a slow address list held the party list off the screen;
they are two queries now. And its **error state is real**: the `catch` set a
message but also swallowed the reason into `console.log`, so a failed load and
an empty database looked identical — it reads the query's own `isError` now.

Converting it also exposed a latent `set-state-in-effect`, the same class the
reports had: an effect re-selected the visible party whenever the search filter
moved underneath it, which meant a render, a setState, then a second render —
the first of which painted a detail panel for a party no longer in the list. It
is a derivation now. Removing the fetch effect is what made the rule able to see
it; that is the third page where this exact thing was hiding.

**`lib/orderQueries.ts` — the three order-history pages.** View_Orders,
Order_Tracking and the distributor's Order_Tracking each fetched
`loadCurrentUserOrderSummaries()` — the user's whole order history — on mount,
separately. They sit next to each other in the menu.

Two details worth keeping:

* View_Orders mirrored a cancelled quotation into its local `orders` state so
  the button would disappear at once. That write goes into the query cache now,
  so the two tracker pages reading the same key see it too — it used to be
  invisible to them until their next full refetch.
* The party-filter de-duplication moved into `select`, where it runs once per
  fetch instead of inside the effect that fetched it.

**`UI_Labels`** followed the same shape: the list is a query, and the three CRUD
handlers still patch the table without a refetch — the array they patch just
lives in the query cache now, so the patch survives a remount.

Lint went 61/24 to **61/23** across these batches (the `PartyDirectory` fix
cleared a real one); 448 tests green, and the visual suite covers the Sap Sync
tabs, `/UI_Labels` and all three order-history pages.

### An orphan scan, prompted by getting it wrong

Converting two dead files before the live one was worth a proper answer rather
than a lucky second look, so every module under `src` was checked for importers.
Fifteen files are reachable from nothing:

* **Eight were mine** — `__lint_repro_*.tsx` and `__lint_real_billing.tsx`, an
  837-line copy of Billing_Order, all created during this session while pinning
  down the `set-state-in-effect` rule and left in `src/pages/`. They were being
  type-checked and linted, and anyone grepping the pages directory would have
  found a stale duplicate of a real screen. Moved to the scratchpad.
* **Two are the ones already known**: `pages/Parties.tsx`, `pages/Addresses.tsx`.
* **Five predate this work and are left alone**: `SalesInvoice/LinesStep`,
  `PartyStep`, `SOCard`, `LogisticsTab`, `InvoiceDraftPanel`, plus
  `components/RequirePermission.tsx` and `components/order-items/ApprovalAvatar.tsx`.

`RequirePermission` is worth a decision rather than a cleanup: a permission
wrapper that nothing renders, in a codebase whose stated goal is permission-based
rendering.

### A save that could never happen — `Staff_Rate_Assignment`

Found while mapping the page for conversion, then verified against the code
because the agent that reported it named the wrong file.

`handleSave` computes `removedProducts` — products that WERE assigned and are no
longer ticked — and refuses only when **both** lists are empty ("Please select at
least one product or remove an assigned product"). The button was
`disabled={isSaving || selectedProducts.length === 0}`. Un-ticking every product
produced exactly the state that save path exists for, with the button switched
off: **un-assigning a staff member's last product was impossible from this
screen.**

`removedProducts` is derived at component level now, so the button's disabled
rule and the handler's guard read the same value and cannot drift apart again.
A behaviour change — a save that was unreachable now works — so it is recorded
here rather than folded into a conversion.

Swept the class rather than the instance: every `disabled={… .length === 0}` in
`src/pages` and `src/components` was checked against its handler's own guard. The
rest are export buttons, where "nothing to export" is the correct rule.
`Page_Permissions` looks like the same shape and is not — its guard is about
which USERS are selected, and an empty page set is a legitimate save.

### Security — two dependency findings, one fixed

`npm audit --omit=dev` on the production tree:

**react-router 7.13.1 — 12 advisories, all high, fix available. Upgraded to
7.18.3.** Most are framework-mode issues that do not apply to a client-only
SPA (RSC deserialization, single-fetch, `__manifest`), but three do: open
redirect via a backslash in `<Link>`/`useNavigate`, open redirect via a
protocol-relative `//` path, and inefficient route matching. The advisory range
ends at 7.18.1. Cost: +1.2 kB gz in the router chunk. Verified with `tsc -b`,
372 unit tests and 60 baselines.

**xlsx — high, `fixAvailable: false`, and it stays for now.** No published
version fixes it; SheetJS moved off npm. The tempting swap is exceljs, already
a dependency and already used for every *write* — xlsx survives only to *read*
uploaded workbooks on Party Assignment, Party & Product Assignment and Tracker
Reports, and the API surface in use is four calls wide.

The swap is blocked on a product decision, not a technical one: both upload
inputs declare `accept=".xlsx,.xls,.csv"`, and exceljs cannot read legacy BIFF
`.xls` at all. Replacing the reader would silently break a format the UI
advertises. Someone has to answer whether distributors still send `.xls` before
this can move; if the answer is no, dropping xlsx removes 425 kB and the only
unfixable advisory in the tree in one change.

Also open, both from exceljs's own dependencies and neither reachable in a
browser build: `uuid` <11.1.1 and `brace-expansion` (via `archiver`, which is
Node-only). `npm audit fix --force` "fixes" them by downgrading exceljs to
3.4.0, a major version back — not worth it.

### 3.4 — Add_Sales: mapped before touching, and the map says stop

Tracker_Entry established the form pattern in one commit. Add_Sales cannot
follow it, and the reason is not size. Four spot-checked findings:

**The `add-sales` baseline proves nothing.** `currentStep` starts at 1,
`renderWizard` renders only the active branch, and `useWizard` is true on plain
navigation — so the 850-line legacy form is absent, every combo is closed, and
the item editor never mounts. Roughly **1,400 lines could be deleted and the
screenshot would be byte-identical**. Worse, `/orders/parties/` falls through to
`PARTY_ROWS` (`fixtures.ts:747`), whose shape is
`{id, card_code, card_name, state, category}` — but the page reads
`party.value` and `party.label` (2763, 2765, 1848-1851). Neither exists. The
baseline has been photographing a party list with blank labels whose options
call `handlePartySelect(undefined, …)`. **Step 0 is fixtures and tests, not
code.**

**The file is two mutually exclusive forms.** Line 3318 is a ternary: wizard, or
the legacy `<form>` at 3321-4168. They never coexist in the DOM, they have
different party controls and different item entry, and they *do not validate
alike* — the legacy branch has live native `required` attributes; the wizard's
copies are inert because `renderWizard()` renders outside any `<form>`. An RHF
migration naturally wraps the wizard in a form element, and **the moment it does,
the hardcoded `required` at line 3000 goes live and empty-PO submission starts
failing on a path where it never has.** Split before converting.

**Sibling state is keyed by array index.** `schemeOptions` and `schemeProposals`
are `Record<number, …>` keyed by row *position*, living outside `rows`.
`useFieldArray`'s `remove`/`move` renumber silently. `schemeProposals` self-heals
only when `previewSignature` changes — which it does not when you delete an
unconfirmed row; `schemeOptions` never self-heals. Re-keying by a stable row uid
is a precondition, not a cleanup.

**Two pre-existing defects the migration would surface rather than cause:**

* `applyFocPricingToRow` (Add_Sales.tsx:71-82) sets `priceListBasic: "0"` and
  clears schemes, but leaves `basicPrice` alone and recomputes `amount` from it.
  The Basic Price input is editable on both paths, so an FOC order can ship
  `basic_price: 170` alongside `price_list_basic: 0`. Fix in that function.
* `_apply_engine_schemes` (`orders/services/order_items.py:182`) — the backend's
  scheme safety net — has **zero production callers**. Its only references are
  `tests_scheme_engine.py` and a docstring in `views/schemes.py:8` explaining
  why it stayed in `_legacy` during the views split. It is tested and never
  runs, so a payload-shape test on the frontend would be asserting a contract
  that currently ships nothing. Note that in the test rather than mistake it for
  a pass.

**Both open decisions were answered, and both are implemented** (2026-08-29).

*PO is not mandatory.* The unconditional block in `validateBeforeSave` is gone;
the check that honours `poField.required` — previously unreachable, sitting
below it — is now the live one, and the `required` attribute on both PO inputs
is bound to the same flag instead of hardcoded. The label already told the
truth: it renders its red asterisk only when `poField.required` is set, while
the code demanded a value either way. Admin config now decides, as the field
config was always meant to.

*A missing pack size names the item master.* `rowProblem()` replaces the boolean
`isRowValid`, so both confirm buttons say what is wrong instead of "Please
complete this item before confirming it." A blank or zero `pcs` gets its own
sentence — it is `sal_factor2` copied off the product and both of its inputs are
`readOnly`, so the old *"must have PCS, boxes and quantity greater than 0"* told
people to fix a field with no keyboard path to it. It is reported before
boxes/qty deliberately: it is the one nobody on this screen can fix.

The submit-side rule is split the same way, and it is genuinely reachable
despite the confirm gate: an order opened for edit arrives with
`confirmed: true` from `mapOrderToRows` and never passes through that gate, so
a product that lost its pack size made an existing order unsaveable with no
editable field to blame.

`SalesRow`, `createEmptyRow` and `rowProblem` moved to `pages/salesOrderRow.ts`
— exporting helpers from a component file breaks Fast Refresh, and it is a small
down-payment on step 1. **8 unit tests** cover the rules, including that a
scheme row hydrated with `schemes: []` is still accepted (tightening it would
reject orders that load and save fine today).

**Not covered by a test: the `required` binding.** The PO input renders only on
wizard step 3, which cannot be reached without the fixtures step 0 builds. That
half is verified by the compiler and by reading, and the honest place to close
it is step 0.

**Order of work** — each step green before the next:

0. Fixtures (`/orders/parties|branch|addresses|party-products|products/`,
   company, scheme preview) + 8 interaction tests. No source change.
1. Split wizard / legacy / shared hook. Mechanical; the branches are already
   exclusive.
2. Behaviour-neutral deletions (unreachable `handleAddRow` guard, dead second PO
   check, `row.scheme`/`row.schemeQty` whose only reader can only see `""`,
   dead `source === "boxes"` branch) and bind `required={poField.required}` at
   3000 and 4029 before any form element appears.
3. Re-key the sibling maps by row uid; delete `shiftByIndex`. Own commit.
4. Make `recalculateRowTotals` pure — it currently mutates and would write into
   RHF's `_formValues` with no subscriber notification.
5. **Header schema only** (11 fields), rows stay `useState`. Rename the four
   option arrays that collide with their own field names (`billAddress`,
   `shipAddress`, `parties`, `company`) in this same commit. *This step alone is
   most of the value.*
6. Rows into `useFieldArray`, wizard first.
7. Server errors via `setError`, replacing the alerts.

Two rules changes need a decision rather than a silent fix: PO requiredness
(honest encoding makes it optional where it is mandatory today, which the code
comments say is the intent), and `pcs > 0` blocking on a **readOnly derived
field** — a product missing `sal_factor2` blocks the order on something the user
cannot type into.

### What remains, and why it was not swept

**87 `any`s.** 36 are `catch (error: any)`, and they are not uniform — the sites
read `message`, `detail`, `error`, `sap_error`, `details` and nested
`errors.field_key[0]`. One shared extractor would change user-visible error
text at ~25 sites with no test to catch a regression; typing them individually
means per-endpoint response types, which is **plan item 3.2** (generate from
`drf-spectacular`). That is the right fix and it is already scheduled.

**26 `exhaustive-deps` warnings.** Most are the ordinary mount-only `load()`
pattern. A few are not: `SalesInvoice/index.tsx:1450` calls
`onSelect({ batches: allocations })` with `allocations` neither in the deps nor
in the guard, so an allocation edited after the batch signature settles may
never reach the parent. Whether that is a bug depends on whether the modal has
an explicit apply step — a question about intended behaviour, not about code.

### Phase 2 — Primitives

| # | primitive | state |
|---|---|---|
| 2.1 | `Table` | **done** — **73 tables across 48 files** converted in one batch (the 6 tracker screens, then everything else). Every family maps to `density="compact"` except `ir-table` and `au-table`, whose 14–15px cell padding is the comfortable scale. **300 rules / 1,569 lines** of table CSS commented out afterwards, and the full visual suite stayed green through that step — which is the proof those lines were dead rather than the assumption that they were. Live CSS: 35,067 → **27,515**. |
| 2.2 | `Badge` | **mostly done** — badge classes in live CSS: **119 -> 44**. Converted: 6 tracker screens, App_User, Device_Management, View_Orders, both Order_Trackings, PartyHeader, Invoice_Review, the 7 e-invoice/e-way-bill screens via NicUI, the 3 Order_Status_Tracking modes, the 3 `dr-badge` reports, Payments approvals, and all 5 Sap_Sync sub-pages (`sd-badge`, `st-status-badge`). 30 already-dead rules removed. Visual suite: **53 baselines**. Still unconverted: `mcl-badge` (loader), `si-*`/`sl-*` (Sales_Invoice and Add_Sales wizard steps), `lc-badge`, `asg-badge`, `pt-badge`/`ad-badge` (unrouted files), and the `*-foc-badge` chips, which are not status badges. |
| 2.3 | `Dialog` / `AlertDialog` | **started** — primitive built on `@radix-ui/react-dialog` (the first Radix package in the tree; the other primitives are hand-rolled cva, but a focus trap is not something to write a 45th time). 9 unit tests assert the BEHAVIOUR the hand-rolled modals lack, not the styling. **13 of 44 modals converted** — all six tracker screens — plus the suite's first three modal screenshots and 53 lines of `.trk-modal-*` CSS commented out. The accessible name is a required `title` prop, deliberately separate from the visible heading, so a decorated header cannot leak into what a screen reader announces. |
| 2.4 | `Skeleton` | **done for the tables** — the 12 shared `order-loading-state` blocks (spinner + "Loading orders...") are now `<TableSkeleton>`. This is the one Phase 2 change a user can see, and it is layout-only: the same `isLoading ? … : …` branch, the same fetch, the same data. What it fixes is that the spinner block is ~40px tall and the table replacing it is several hundred, so every one of those pages jumped when the data landed. The skeleton also carries `role="status"` + `aria-busy` (the spinner was a bare animated `<span>`, invisible to assistive tech) and puts its shimmer behind `motion-safe:`. 4 unit tests and one screenshot taken with the response held open — a loading state is invisible to every other test in the suite, because `gotoStable` waits for exactly it to disappear. **Left:** 2 in-modal spinners for timeline logs, where a table skeleton is the wrong shape.  |
| 2.5 | `Pagination` | **done** — **18 of 20 pagers converted** (the two left are in `Parties.tsx` / `Addresses.tsx`, which nothing imports). One `<nav aria-label="Pagination">` with an `aria-live` position and plain-word button names, replacing 19 anonymous divs whose accessible names read "left arrow Prev". 8 unit tests. 245 lines of CSS commented out. **The conversion produced zero screenshot diffs, and that was the finding**: every paginated screen in the fixtures had fewer rows than one page holds, so not one pager rendered. Device_Management pages server-side, so its fixture now claims 3 pages and carries the primitive's only in-situ coverage. |

`components/ui/table.tsx` covers the presentation for all 77 tables. TanStack
Table is deliberately NOT in it: most of these tables are presentational, and
requiring a column model to adopt the styling would make the cheap change
expensive. It goes in a separate `DataTable` for the tables that want sorting.

**Two densities, not one.** The 77 tables are not 77 designs, they are two:
`.au-table td` is `15px 20px`, `.nic-table td` is `9px 14px` — a record list
people scan, and a dense grid people read down a column of. Collapsing both
into one padding would restyle roughly half the app on the pretext of
consolidating it, so `density` is a prop and everything else is not.

**`App_User` first.** Its table CSS is commented out (~55 lines), and the
screenshot after commenting it out is byte-identical to the one before — which
is the proof it was dead rather than an assumption that it was.

#### 2.2 — the badge, and the thing it actually fixes

Unlike the table, the 37 badge variants are not several designs. They are ONE
design that drifted — pill, 3-5px x 9-11px, 10-11.5px text, weight 600-800.
Consolidating that geometry is tidying.

The colours are not tidying. The same status word is drawn in different colours
on different screens, and in one case in colours that mean opposite things:

| status | what the stylesheets say |
|---|---|
| `billed` | **green** in View_Orders, Order_Tracking, Billing_Order · **blue** in Daily_Report (`.dr-badge-billed`, #2563eb) |
| `pending` | amber #d97706 · brown #a16207 · and **grey** #64748b |
| `rejected` | #991b1b · #dc2626 · #b91c1c |

The shades are drift. `billed` is not: green reads as "settled", blue reads as
"informational", and someone moving between Daily Report and View Orders had no
way to tell whether the difference meant anything. So the tone for a status is
now decided once, in `components/ui/statusTone.ts`, and the component only
knows how to draw a tone.

**What was deliberately NOT flattened.** View_Orders distinguishes "pending
approval" (amber — someone is dealing with it) from "needs approval" (violet —
nothing moves until you act), on the same screen. Collapsing those would be
losing information while calling it consistency, so `note` is a sixth tone.

**Also folded in:** `components/StatusBadge.tsx`, the app's first attempt at
this, is now a thin wrapper. It keeps its `LABELS` map — device vocabulary is
not badge behaviour — and its stylesheet is orphaned.

**Still to do in 2.2:** ~35 pages, and the SECOND component called
`StatusBadge`, in `components/NicUI.tsx`, which has its own competing
status→tone function. That one is deferred rather than done: its badges only
render after a button click, so converting it now would be a change with no
visual coverage. It needs an interaction-based screenshot first.

#### Interaction screenshots — `e2e/interactions.visual.spec.ts`

Three badge families turned out to render ONLY after a click: `ir-badge` on
Invoice_Review (its table's status column is already commented out, so the
badge survives only in the detail and history modals), `nic-badge` across the
seven e-invoice screens (nothing loads until "Load Invoices"), and the ones on
Tracker_Entry. A route screenshot cannot see any of them.

So the suite gained a second spec for states you have to click to reach. The
settle logic moved out of `gotoStable` into an exported `settle()` — an
interaction has TWO settling points, after the navigation and again after the
click, and the second is the one people forget. Duplicating the wait would have
meant approximating it, and an approximation of a settle wait is a flake with a
delay on it.

These are captured at the viewport, not full page: a modal is positioned
against the viewport, and a full-page shot of one is mostly the dimmed content
behind it, which drifts for reasons that have nothing to do with the modal.

**The first e-invoice baseline was worthless and looked fine.** It clicked
"Load Invoices" and captured "No pending invoices", because the fixture returned
`results: []`. A screenshot of a click that produced nothing — the same failure
mode as the empty tables, one level deeper. The fixture now returns four rows
covering every `irn_status`, and all four badge tones appear in the image.

That unblocked the last deferred item in 2.2: `NicUI.StatusBadge`, the app's
SECOND component of that name. It keeps its `ok`/`err`/`warn`/`muted` prop —
seven screens pass those, and what counts as an error on a NIC response is NIC's
vocabulary — and only the colour is now shared.

#### Five families converted with NO visual coverage — stated, not hidden

`dr-badge` (Daily_Report, PersonWise_Report, Sales_Report), `ot-badge`
(Order_Status_Tracking) and `apv-badge` (the Payments approval screens) are
converted. Two routes were added to the suite first, and it made no difference:
after the conversion **all 41 screenshots were unchanged**, because none of
these badges render in any baseline. Every one of those pages still needs a
fixture (`/orders/dashboardW/`, `/hana/product-stock/`, `/hana/pending-dispatch/`,
and whatever Daily_Report's date filter wants) before a screenshot can see them.

So these five are carried by `tsc` and the `statusTone` unit tests alone. That
is weaker than everything above it in this section, and it is recorded here
rather than folded into the same "converted" column without comment. The
mechanical shape is identical to the `vo-badge` conversion that WAS verified —
`status_display` in, `toneForStatus` out — which is the argument for the risk
being low, not for it being zero.

`sovi-badge` and `ps-badge` were held back for the same reason, and without
that mitigating argument: their suffixes are page states
(`sovi-badge-partly-invoiced`, `ps-badge-shortage`), not statuses, so there was
no proven mapping to lean on. Both are now converted WITH coverage — the HANA
fixtures (`/hana/product-stock/`, `/hana/open-parties/`,
`/hana/pending-dispatch/`) made Product_Stock render four rows landing on four
stock states, and SO_Invoice_Report two orders on both dispatch states.

Their tone maps are deliberately LOCAL rather than routed through
`statusTone.ts`: "low" on a stock row and "low" on an order would not mean the
same thing, and a shared map that has to be read two ways is worse than two
maps that each say what they mean.

Still uncovered, and still carried by `tsc` alone: `dr-badge`, `ot-badge` and
`apv-badge`. Daily_Report, Order_Status_Tracking and Payments_Dashboard render
zero rows even with the order fixtures in place — each needs its own endpoint
worked out.

#### Invoice_Review, and a rule for when statuses share a colour

`ir-badge` drew seven statuses in seven hues — amber, green, red, orange, blue,
violet, teal. Four now share two tones: `rejected` and `error` are both red,
`approved` and `posted_to_sap` are the outcome and the system state that follows
it. The rule this settled, written into `statusTone.ts`:

> **Tone is the outcome; the label is the detail.** A colour answers "is this
> fine, waiting, or wrong?" at a glance. The WORD answers "why". Giving every
> distinct cause its own hue means seven colours on one screen and none of them
> meaning anything on any other screen.
>
> The exception is where the app draws a distinction people *act* on —
> `pending_approval` (someone is dealing with it) versus `need_approval`
> (nothing moves until you act). That is not two causes of one outcome; it is
> two different asks.

`cl_raised`'s teal is the one thing genuinely lost.

**One correction worth recording.** `posted_to_sap` was mapped to green first,
which produced a green badge sitting beside its own blue timeline dot on the
same row — `.ir-dot-posted_to_sap` is blue, because the page reads "posted" as a
system state rather than a verdict. It is blue now. The screenshot is what
caught it; no test would have.

**The history drawer's first baseline was empty** and looked fine — "No history
available for this entry", because `/invoice/history/` had no fixture. Third
time this exact shape of false coverage has appeared: empty table, empty click,
empty modal.

#### 22 badge rules were not waiting to be converted, they were already dead

Before converting more pages, the badge classes were counted: **119 defined in
CSS, 33 with no reference anywhere in the code.** `Auditor_Order.css` and
`Billing_Order.css` between them carry 16 status-colour rules for pages whose
TSX renders only a FOC chip. `UIConsistency.css` still named `.pr-badge`,
`.br-badge-*` and `.lg-badge-*` — Products, Branches and Logs, the four
stylesheets Phase 0.5 deleted as orphans. The rules for those pages went; this
shared selector kept naming them, which is how they survived that sweep.

22 rules commented out, and all 36 screenshots unchanged — which is what makes
"dead" a measurement rather than an assumption.

#### The suite covered the chrome, not the content

Before converting the order screens, the obvious question was finally asked
directly: **on which pages does a badge actually render?** A probe counted
elements with a badge class on all 17 remaining baselined routes.

The answer was **zero, on every one of them**. Seventeen screenshots, no badges
in any of them. The suite was covering page chrome — headers, filters, empty
cards — and none of the row-level content that Phase 2 changes.

The cause was one missing fixture. `loadCurrentUserOrderSummaries()` reads
`data.data.id` from `/auth/profile/` and then calls
`/orders/ordersbyuser/<id>/`. With no profile there was no id, so it returned
`[]` early and every order screen in the app rendered empty — and passed.

With `/auth/profile/`, `/orders/ordersbyuser/`, `/orders/list/`,
`/orders/status/` and `/orders/mart/list/` added, `View_Orders` and
`Order_Tracking` now render five orders covering five different statuses. The
five were chosen deliberately, including both `Pending Approval` (amber) and
`Need Approval` (violet), so that the distinction statusTone.ts keeps on purpose
cannot be flattened without a screenshot moving.

#### `approved` had two colours, and import order picked one

Converting `.vo-badge` turned up a sharper version of the 2.2 finding. The same
class is defined in two stylesheets:

    View_Orders.css     .vo-badge-approved  #dcfce7 / #166534   (green)
    UIConsistency.css   .vo-badge-approved  #ccfbf1 / #0f766e   (teal)

Both unlayered, both equally specific, both loaded. Which one a user saw came
down to stylesheet import order. That is a stronger argument for a single source
of status colour than "two greens were slightly off": nobody could say what
colour `approved` was without knowing the bundler's ordering.

`UIConsistency.css` keeps its `.ot-badge-*` halves — `Order_Status_Tracking.tsx`
still uses them, and it is next.

#### The tracker family — and the tolerance that was hiding changes

`.trk-badge` was the largest badge family in the app: 37 uses across all six
Tracker screens. All six are converted; the tones map onto the shared set with
nothing lost (`stage`->info, `ok`/`success`->ok, `warn`/`late`->hold,
`danger`->bad, `muted`->neutral), and `.trk-badge-late` turned out to be
byte-identical to the shared `--color-hold` pair, which is where those tokens
were read from.

Three of those screens (`Tracker_Admin`, `Tracker_Alerts`, `Tracker_Reports`)
had no baseline. They were added to the visual suite BEFORE converting them,
rather than after, so the conversion had something to be measured against.
`Tracker_Reports` immediately failed with `Cannot read properties of undefined
(reading 'in_progress')` — the error-boundary guard doing its job on a fixture
that was a bare `[]`.

**The finding that matters here is about the suite, not the badges.** Six files
changed; the suite reported four. `/Tracker_Alerts` differed by **935 pixels** —
six badges in a new colour and a new font weight — and PASSED, because 935 is
under 0.2% of a 1440x900 image.

That 0.2% was a guess, written with the comment "far too tight to let a changed
padding, colour or font size through". It was not. A badge is small; so is a
status colour, an icon, a focus ring — precisely what Phase 2 changes. The
measured noise floor, once fonts came from the cache, is not 0.2%: it is
**exactly zero**, run after run, across 32 unchanged pages. So the threshold is
now `maxDiffPixels: 0`.

The lesson generalises past this suite: a tolerance derived from reasoning about
what *might* vary, rather than from measuring what *does*, is a number that lets
real changes through and reads as confidence.

#### A gap the badge work exposed in the visual suite

`/Device_Management` came back byte-identical after `StatusBadge` was rewritten
underneath it. Not because nothing changed — because nothing was rendered: the
fixture returned no devices, so the page had no badges to draw. The same empty
-fixture blind spot the table work found, in a second place.

`e2e/fixtures.ts` now returns one device per `DeviceStatus`, which is the point
— four rows, four colours, all four in the image. Worth stating as a rule for
the rest of Phase 2: **a fixture with no rows is not coverage of the thing that
draws rows**, and a passing screenshot is not evidence until you have checked
that the thing under test is actually on it.

The same check caught `Tracker_Admin` in the very next batch: it changed by
exactly zero pixels when its badges were converted, because with no stages and
no users it draws no badges at all. It now gets three stages (two active, one
off) and two users. **`Tracker_Entry` is still in that state** — its badges sit
behind a vendor picker and an invoice selection — so its conversion is currently
carried by the unit tests alone, and is flagged rather than claimed.

#### Two cascade traps found on the first conversion

Both were silent: no error, no warning, the class present in the DOM and
matching a real rule in a loaded stylesheet, doing nothing.

**1. An unlayered `* { padding: 0 }` outranked every padding utility in the
app.** It existed twice — the top of `styles/Login.css` and again in
`components/Sidebar.css` — and both load on every page, because `Login` is the
one eager route and the sidebar is on every protected one. A rule named after
one page had been resetting all 108 for years. Unlayered CSS beats every
cascade layer regardless of specificity, so `.py-4` lost to `*`.

It has moved into `@layer base` in `styles/tailwind.css` rather than being
deleted: against the 50 unlayered stylesheets it was already the weakest thing
in the cascade (`*` is 0,0,0 — any class selector beats it), and a layered rule
loses to unlayered CSS outright, so nothing else changes. The only rules it now
yields to are Tailwind's. All 32 other route screenshots were unchanged by the
move, which is the evidence for that paragraph rather than the reasoning.

**2. A rem here is 18px, not 16px.** `index.css` sets
`:root { font: 18px/145% var(--sans) }`, so Tailwind's default
`--spacing: 0.25rem` made `p-4` render at 18px — a 12.5% disagreement with the
50 stylesheets it is meant to reproduce, enough to move a table row and not
enough to look like a bug. `--spacing` is now pinned to `4px`. Font sizes stay
in rem deliberately: those *should* track the root, because a reader who
enlarges text expects text to enlarge.

Both are now guarded by tests in `styles/tailwind.test.ts`, and all three
guards were mutation-tested — each was confirmed to fail when its condition is
violated, rather than assumed to.

### Visual regression

Phase 2 replaces hand-rolled tables, modals and badges across 50 pages and
deletes the CSS behind them. Its entire risk surface is "does it still look
right" — which `tsc` and all 271 unit tests pass regardless of. So the harness
came first.

`npx playwright test` checks 33 full-page screenshots; `--update-snapshots`
accepts a change, deliberately, after looking at the diff.

**Two things it does that are not obvious, both because their absence bit.**

*It refuses to baseline a crash.* The first run captured `App_User`, `Einvoice`
and `Ewaybill` as stable baselines. All three were the ErrorBoundary — the
harness answered every request with `[]` and those pages read a field off an
envelope. Three error screens became the reference images those pages would be
compared against forever, and the suite passed twice. A screenshot of a crash is
worse than no screenshot: it never flakes, and it looks exactly like coverage.
`gotoStable` now throws if the boundary is on screen.

*It renders rows, not empty states.* An empty table proves nothing about a
table; a screenshot of a page with no rows would survive replacing the table
component with one that renders every cell wrong. `e2e/fixtures.ts` carries real
rows, each shape read out of the code that consumes it rather than guessed —
guessing cost three runs (`{data: ...}` over the `/auth/` lookups when only one
of them is enveloped; `{labels, series}` for a `ChartSeries` that is
`{total, slices}`; `{id, name}` for a `role` that is a string).

**The flake, and why it was not just retried away.** About one full run in
five, a single page came out 900px tall instead of 911 — a different page each
time, and every one of them passing when run on its own. The tempting reading
is "that test is flaky"; the actual cause was that the harness fetched Google
Fonts over the network on every run. Every page in that 11px cluster is one
whose document height comes from the SIDEBAR rather than its own content, so a
hair of difference in how Inter measured moved the whole page — on whichever
route happened to catch the slow fetch.

The fonts are now served from a committed 206 kB cache (`e2e/__fonts__`), so CI
and an offline laptop render exactly what the baselines were taken with. They
are cached rather than blocked deliberately: blocking would be more hermetic
and would screenshot a fallback face no user ever sees, making every diff a diff
against something fictional. `gotoStable` also now waits for the page's own
content to stop changing, not just its height — a skeleton is built to occupy
the space its content will, so a height-only check calls it settled.

**Proven, not assumed.** Changing one `td` padding by 2px in `App_User.css`
fails exactly one test, on exactly that page, at 5x the diff threshold — 5,367
pixels against a 0.2% tolerance. An earlier version of the config did *not*
catch that same change, which is how both defects above were found.

### Phase 1 — Tailwind + shadcn foundation

| # | task | state |
|---|---|---|
| 1.1 | Tailwind installed, preflight scoped out | **done** |
| 1.2 | Duplicated CSS blocks extracted to theme tokens | **done** |
| 1.3 | `cn()`, clsx, tailwind-merge, cva; `components.json` | **done** |
| 1.4 | shadcn theme emits the CURRENT design | **done** |
| 1.5 | One component converted as a proving ground | **done** |

**Zero visual change, verified rather than asserted.** The built CSS was
captured before the change and diffed after: all 32 stylesheets are byte-for-byte
identical, and `index.css` keeps 1,139 of its 1,140 rules (the one "missing" is
the font `@import` line, re-chunked by the diff, still present and still first).
Tailwind emitted 31 utilities (2 kB) from scanner hits on words in the existing
CSS — and **no JSX uses any of those 31 names as a bare `className`**, so they
apply to nothing.

Two collisions were found and fixed before they could bite:

* shadcn's convention declares `--accent`, `--muted`, `--border` on `:root`.
  This codebase already defines `--accent` (index.css + 2 stylesheets, 40
  references) and `--muted` (2 stylesheets, 17 references). Two unlayered
  `:root` blocks means the later import wins, so `bg-accent` would have come out
  as the app's blue rather than the subtle surface shadcn means. They are
  declared as `--sh-*` and mapped through `@theme inline`; shadcn components
  reference the utility, so a component pasted from the registry works unchanged.
* Within the theme file itself, the app's `--color-accent`/`--color-muted` and
  shadcn's occupy Tailwind's single colour namespace. Renamed to
  `--color-brand`/`--color-subtle`. A test now fails on any duplicate
  `--color-*` definition.

**Cascade note that will surprise someone:** every existing stylesheet is
unlayered, and unlayered CSS beats a layered Tailwind utility regardless of
specificity. Adding `class="p-4"` to an element whose stylesheet already sets
padding will appear to do nothing. Migration must remove the old rule, not add
classes beside it.

**Cost:** the initial JS chunk grew 439 → 466 kB (128 → 137 kB gzipped), almost
all of it `tailwind-merge`. That is foundational rather than waste — every
shadcn component in Phase 2 needs `cn()` — but it is a real regression against
the code-splitting win until Phase 2 starts deleting CSS.

### Dependency security

`npm audit` on the install surfaced a **high-severity axios advisory** affecting
the pinned 1.13.6 — *Credential Theft and Response Hijacking via Prototype
Pollution Gadget in Config Merge* (GHSA-3g43-6gmg-66jw), plus a full-MITM gadget
in `config.proxy`. Upgraded to 1.20.0, which is semver-compatible; build, types
and all tests pass on it.

**`xlsx` has no fix available.** The npm-registry package is frozen at 0.18.5
with prototype-pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS advisories open;
SheetJS now publishes only from their own CDN. That matters more than a
transitive dev advisory would, because this library parses **user-uploaded
workbooks** on Party Assignment and Party & Product Assignment — untrusted input
is exactly its threat model. Options are to install from the SheetJS CDN tarball,
move parsing server-side, or accept the risk knowingly. This is an infrastructure
decision, so it is recorded rather than taken.

### Deployment note for 5.1

Lazily-loaded chunks are fetched by filename. A browser holding a cached
`index.html` from a previous deploy will ask for chunk names that no longer
exist and fail with *"Failed to fetch dynamically imported module"* on the
first navigation. Either keep old chunks on disk across a deploy, or serve
`index.html` with `Cache-Control: no-cache`.

---

## Phase 3.1 — mapping the remaining hand-fetching pages, then converting them

### The map

Thirty-four pages were still fetching by hand. Rather than work through them in
file order, all thirty-four were analysed first — what each one fetches, what it
does with the result after a mutation, whether it has a `set-state-in-effect`
violation hiding behind an unanalysable fetch effect, whether it polls, and
whether it reads `location.state` — and then batched by shared data and by risk.
Thirty-two came back; the group holding `Product_Stock` and `Dashboard` died and
those two are still unmapped.

The single most useful thing the map produced was not the batching. It was this:

> The baselines cover **19 routes, but only 12 of them actually render data.**

The other seven photograph an empty table or, in one case, an error banner —
and every one of them is stable, green, and reads as coverage. This is the fifth
time this trap has been hit in this refactor, so it is now the gate on every
batch: **a page gets a fixture and an assertion that its data is on screen
before it gets a screenshot, and before it gets converted.**

Specifically found:

| Page | What its "passing" baseline is actually a picture of |
|---|---|
| `Distributor` | the **"No party is assigned to your account"** error banner — `/auth/users/<id>/parties/` has no fixture |
| `Scheme_Manager` | reference data, but an **empty scheme table** — `schemeService.list` calls `/orders/v2/schemes/`, which the `/orders/schemes/` fixture does not match |
| `Order_Flow_Settings` | empty — neither `/orders/flow-config/` nor `/orders/party-flow-config/` is fixtured |
| `HAIS/AssetRegister` | "No assets found." — there is **no `/hais/` fixture at all** |
| `Payments/ConfigTab` | "No accounts returned by SAP." |

`FIXTURES` is an ordered `[RegExp, body]` array and **the first match wins**, so
several of the missing fixtures are not merely absent — they are *shadowed*, and
adding them at the end of the file would change nothing. Three had to be
inserted above an existing broader pattern.

### Batch 1 as executed

The plan's batches are ordered by value-per-risk. This first commit deliberately
cuts across them and takes the five pages that are **unambiguously safe** — the
ones the map confirmed have no latent lint violation, no polling, no
`location.state` dependency and no server-seeded editable state — so that the
fixture and baseline machinery is proven before the harder batches rely on it.

**`Status.tsx`** (Sap Sync's default tab). Four hand-rolled fetchers replaced by
the four hooks `src/lib/sapQueries.ts` already exported. Three things fall out:

* The Sync button now calls `invalidateQueries({queryKey: ["sap"]})`. That is
  what `sapQueries.ts`'s own header comment said the button "ought to do and
  currently cannot" — it previously re-ran only this tab's four fetchers, so
  Products, Parties & Addresses, Branches and Logs kept showing pre-sync data
  until the page was reloaded.
* All four fetchers assigned `response.data` into state with **no `Array.isArray`
  guard**, so a non-array body made `.length` undefined and the footer total
  read `NaN`. The queries coerce.
* Four errors that went to `console.log` and left the count at 0 are now a
  visible banner. A zero that is really a failure is the worst possible bug on a
  screen whose entire job is telling you whether the data arrived.

The mount effect also reduced to a bare `setLastSync(JSON.parse(saved))`, which
is a `react-hooks/set-state-in-effect` error the moment the fetches above it
leave. It moved into a lazy `useState` initialiser, and the parse — previously
unguarded, so a corrupt `localStorage` key took the whole tab down — is now
wrapped.

**`Drafts.tsx`**. The delete used to do `setDrafts(prev => prev.filter(...))`,
which left the cache holding the deleted draft. It is now an invalidate. The
swallowed error is now `isError`: a 500 or an expired session used to render
*"No saved drafts. Use Save as Draft on the Add Sales page to create one."* —
telling someone whose drafts had failed to load that they had never written any.

**`Add_Scheme.tsx`**. `includeInactive` became part of the query key rather than
a dependency of a `useCallback`/`useEffect` pair that rebuilt the fetcher and
threw the previous result away, so toggling the checkbox back no longer
re-downloads a list it already had. The load error used to be caught into
`feedback` **and** empty the list, so a failure read as "No schemes found."

**`einvoice/GenLogs.tsx`**. The outcome filter became the query key — four tabs,
four cache entries instead of a refetch per click. A successful retry now
invalidates *every* tab, not just the visible one: a retry moves a row from
FAILED to SUCCESS, so the Failed tab and the All tab are both wrong afterwards
and only the visible one was being refreshed. The load error and the retry error
were also sharing one `error` state and overwriting each other.

**`Sales_Quotation.tsx` — NOT converted.** It surfaced as a 3.1 target and it
genuinely is one, but it is dead: `App.tsx` has both the import and the
`/Sales_Quotation` route commented out, the sidebar entry and the `routeAccess`
entry are commented out, and the backend's routes and views are commented out.
Converting it would mean fixing a real `set-state-in-effect` violation at
L107-109 on code that cannot run. It got a dead-file banner instead, matching
`Parties.tsx` and `Addresses.tsx`.

### Fixtures and baselines added first

* A sixth `ORDER_ROWS` entry with `status_display: "draft"`. `getDrafts()` filters
  `/orders/ordersbyuser/` on exactly that string and none of the five existing
  rows had it, so `/Drafts` would have baselined as an empty table. The row shows
  up on the other order lists too, which is correct — a draft **is** one of the
  user's orders and those pages do not filter it out.
* `/orders/schemes/manage/`, inserted **above** the bare `/orders/schemes/`
  entry, which answers `[]` and would otherwise have shadowed it. Enveloped as
  `{data: [...]}` because `getSchemesForManage` unwraps `response.data?.data`.
  One of the three rows is inactive, because the manage table draws those
  differently and a fixture of only active rows leaves half the row states
  undrawn.
* `/einvoice/logs/`, inserted **above** the `/einvoice/` catch-all. This one was
  not merely missing: the catch-all has no `totals` key and `GenLogs` reads
  `data.totals.SUCCESS` the moment `data` is truthy, so opening the Logs tab
  **threw**. Nothing caught it because "Invoices" is the default tab and no test
  had ever clicked "Logs".
* Route baselines for `/Drafts` and `/Add_Scheme`, plus four interaction tests
  that assert the data is on screen — the draft count reads `Total: 1`, the
  scheme count reads `(3)`, the three log badges read `1 success / 1 failed /
  1 skipped` with the Retry button on the FAILED row only, and the Sap Sync KPI
  is a real number rather than `0` or `NaN`.

### Where `useStates` lives

`src/lib/authQueries.ts`, keyed `["auth", "states"]`. The state list never
changes during a session and Add_Scheme, Scheme_Manager and App_User each
fetched it on mount. `useUserList` and `useMainGroups` are also `/auth/` lookups
and belong there too; they are in `reportQueries.ts` because that is where the
three manager reports needed them first, and moving them is a rename across
their consumers with no behaviour change — left for whichever batch already has
those pages open rather than done as drive-by churn.

### The remaining batches, in order

2. **User and lookup master data** — `App_User`, `Party_Assignment`,
   `Page_Permissions`. Lands `["users"]` on six consumers. Note that
   `Page_Permissions.handleSave`'s local patch **is** the persistence; as
   `setQueryData(["users"], ...)` it becomes visible to the three reports, which
   is correct but is new cross-page behaviour.
3. **Order queues and details** — `Billing_Order`, `Auditor_Order`,
   `Rate_Approver_Order`, `MartApproval`, `Order_Status_Tracking`.
   `getOrderDetails` is called from eight sites, twice per order per page. All
   three `*_Order` pages carry the same latent `location.state` violation, which
   surfaces as `react-hooks/immutability` the moment `submitReview` becomes a
   mutation — so the detail panel must be driven by a keyed query, not by
   calling a setState-ing function from an effect.
4. **Current-user lists** — `Drafts` (done), `SO_Invoice_Report`,
   `Tracker_Entry`. `getCurrentUser` has six call sites and wants one key.
5. **Chained party-scoped data** — `Distributor`, `Add_Scheme` (done). This is
   where `enabled: false` implies `isPending: true` forever, and it bites visibly.
6. **Catalogue and assignment screens** — `Staff`, `Staff_Rate_Assignment`,
   `Party_Product_Assignment`. All three seed fetched data into user-editable
   state; none of the three has a baseline. That combination is why it is sixth
   and not second.
7. **e-Invoice tabs** — `InvoiceBrowser`, `GenerateIrn`, `GenLogs` (done), and
   `NicUI.CompanyDbSelect`, which must go first because it fetches on mount,
   holds a module-level cache and calls `onChange` from inside its own effect.
8. **Config screens and imperative forms** — `Order_Flow_Settings`,
   `Payments/ConfigTab`, `Ap_Invoice_Entry`. In all three the refetch is not a
   plain refetch; `ConfigTab`'s Sync button forwards `refresh=true` as a query
   param that `refetch()` will not send.
9. **Zero-fixture screens** — `HAIS/AssetRegister`, `HAIS/AssetForm`,
   `SkuGalleryPage`.
10. **The heavyweights** — `InvoiceReview`, `Device_Management`. Last despite
    having the best baselines, because neither shares a service call with
    anything else: there is no cache value, only the loading/error states and
    killing a hand-rolled 60s `setInterval`.

**Not to be converted:** `Sales_Quotation` (dead). `SalesInvoice/ContentsTab`
only in part — its allocation loop is a fetch-then-write-back whose write changes
the dependency of the effect that issued the fetch, so making it a `useQuery` is
an infinite loop. `Ap_Invoice_Entry` gets an interaction test rather than a route
baseline, because nothing fetches on mount and a route screenshot of it would be
an empty form.

### Twenty-three latent `set-state-in-effect` sites

The map ran eslint against stripped copies to confirm six of them rather than
infer them, including the three `*_Order` pages and `Device_Management`'s
`PolicyForm`. Two findings matter beyond their own files:

* **`SalesInvoice/ContentsTab.tsx`'s `eslint-disable-next-line
  react-hooks/exhaustive-deps` at L727 suppresses the compiler-backed rules for
  the WHOLE FILE.** Deleting only that comment makes L619 error immediately.
* **`SkuGalleryPage` and `BatchPickerModal` bail out of those rules for an
  unidentified reason** — an injected, blatantly illegal effect was still not
  reported. A clean `npx eslint` on either file currently proves nothing.

`Tracker_Entry` is permanently exempt: the React Compiler reports *Compilation
Skipped: Use of incompatible library* on its `const form = watch()`, so the rule
can never fire there.

### The one group the map lost

`Product_Stock.tsx` and `Dashboard.tsx` — roughly 4,100 lines between them. The
analysis agent covering that pair lost its connection mid-response and its group
was dropped, so they appear in no batch above. They were read directly and
converted last; see the note at the end of the batches 3-10 section.

### `--update-snapshots` can write a blank page as a baseline

Accepting the eight expected diffs above was done with a suite-wide
`npx playwright test e2e/routes.visual.spec.ts --update-snapshots`. That run
reported **45 passed** — and quietly rewrote `label-checker.png`, a page this
batch does not touch, as a **completely blank white image**. The page had
rendered empty in that one run; `--update-snapshots` does not care why, it
writes whatever it captured and reports success.

It was caught only because the next plain run failed on a size mismatch
(1440x900 against the real 1440x911). Had the blank capture happened to be the
same height, it would have become a permanent, passing baseline for a blank
page — the sixth instance of that trap in this refactor, and the first caused by
the tooling rather than by a missing fixture.

**So: after any bulk `--update-snapshots`, sort the baselines by file size and
look at the smallest.** A blank 1440x900 PNG is about 5 kB; the smallest real
page in this suite is about 72 kB. One `ls -S | tail` separates them, and it is
the only check that catches a page which regenerated as nothing:

```
ls -S e2e/__screenshots__/**/*.png | tail -12 | xargs wc -c
```

Better still, prefer `-g "<one test>" --update-snapshots` over a suite-wide
accept, so the blast radius of a bad capture is one file you are already looking
at rather than forty-five you are not.

### Batch 2 — user and lookup master data

`App_User`, `Party_Assignment`, `Page_Permissions`. Twelve hand-rolled fetches
across the three, replaced by six shared hooks in `src/lib/authQueries.ts` plus
one in `sapQueries.ts`.

`useUserList` and `useMainGroups` **moved out of `reportQueries.ts`** into
`authQueries.ts`. They are `/auth/` lookups, not report data; they only lived
there because the three manager reports needed them first. `["users"]` now has
six consumers — the three reports plus these three pages.

**The unwrapping is the point.** `userService` returns `response.data` untyped
for every one of these, and the six consumers disagreed about the shape. The
user list alone was read three ways:

| File | Unwrap | Behaviour on the other shape |
|---|---|---|
| `App_User.tsx:129` | `data.data` | `users.filter is not a function` |
| `Party_Assignment.tsx:130` | `data.data.filter(...)` | throws inside the fetch |
| `Page_Permissions.tsx:70` | `Array.isArray(r) ? r : r?.data ?? []` | survives |

The tolerant one is the version that survived, and it is now the only one.
`asList` in `sapQueries.ts` was widened the same way and for the same reason —
Scheme_Manager and Combo_Mapping had each independently added an envelope
fallback for `/sap/parties/`, and three consumers reaching for one is evidence
the endpoint has answered with it.

**Three latent bugs fixed while the files were open:**

* `App_User` L95-97 — `useEffect(() => fetchVarieties(selectedCategoryName), [...])`,
  where `fetchVarieties` opened with a synchronous `setVarietyOptions([])` before
  its first await. A `react-hooks/set-state-in-effect` violation that only passed
  lint because the mount fetch made the component unanalysable. It is now
  `useProductVarieties(category)` with `enabled` — the effect and the clearing
  branch both disappear. Note its `isLoading` is `enabled && isPending`, NOT
  `isPending`: **a disabled TanStack v5 query reports `isPending: true` forever**,
  so a spinner bound to it would show permanently on a form nobody has touched.
* `Page_Permissions` L131-140 — `setPages(computePagesFor(next))` called from
  *inside* a `setSelectedUserIds` updater. StrictMode double-invokes those, and
  `computePagesFor` closes over `users`; with the list now served from a cache
  that can refetch underneath the page, deriving grants from a stale closure
  would let Save write the wrong permissions. `next` is computed outside the
  updater now.
* `App_User:163` — a `console.log("Roles fetched:", role)` in the render body.

**The cross-page behaviour change, stated deliberately:**
`Page_Permissions.handleSave`'s local `setUsers` patch **is** the persistence —
nothing refetches after a save, and the page reads `extra_pages` back out of the
list to seed the next selection. As `queryClient.setQueryData(["users"], …)` it
keeps working here *and* becomes visible to App_User, Party_Assignment and the
three reports, which will now show the grant before any of them has re-read the
server. That is correct, and it is new.

**What stayed imperative, on purpose.** `Party_Assignment`'s `selectedParties` is
server-seeded *and* user-editable: `fetchUserParties` seeds it, then the
checkboxes and the Excel import edit it before Save. It therefore cannot *be*
query data, and it must not be re-seeded from a `useEffect` on the query either —
a background refetch would discard edits the user has not saved. It stays
`useState`, seeded through `queryClient.fetchQuery` on
`["party","assigned",userId,category]`, so re-selecting a user already looked at
no longer re-requests their list.

### Two fixtures, and what they were hiding

**`/auth/users/<id>/parties/`** had none, and was being answered by the
`/parties/` catch-all — a bare array with no `parties` key — so
`res.data?.parties || []` came back empty and every checkbox rendered unchecked.
Nothing failed, because no test had ever selected a user.

Writing it exposed a second trap immediately. The first version assigned
`C000789`, which does not exist in `/sap/parties/` — that endpoint has **its own
two-row fixture**, not the three-row `PARTY_ROWS` most of the file uses. The
picker lists SAP parties and checks the ones in the assignment response, so an
assigned party missing from the SAP list simply never renders a row: the
assertion was green against a checkbox that could not exist. It now assigns
`C000123` only, and the test asserts one checked box, one unchecked box, and the
`Select All (1/2)` counter that would fail if either moved.

**`/orders/party-products/`** had three rows, all `category: "Edible Oil"`.
`/Distributor` hard-codes `CATEGORY = "MART"` and filters this response down to
it, so it rendered "No MART products are assigned to your party yet." A MART row
was added, dated inside the frozen clock's month — `isCurrentMonth`
(`Distributor/index.tsx:85-93`) blocks ordering against an assignment not
refreshed this month, so a date outside 2026-06 would list the product but leave
it unorderable, which is a third variant of "looks fine, does nothing".

**`distributor.png` was re-accepted deliberately.** It was a photograph of the
*"No party is assigned to your account"* banner — the worst kind of baseline,
because a failure that renders consistently is a passing test forever. It is now
the working page, and a test asserts the whole chain (party, then that party's
MART products) resolves before the image is taken. `/Distributor` itself is
Batch 5 and is not yet converted; only its fixtures moved.

### Batches 3–10 — the rest of Phase 3.1

Twenty-two more pages converted, in the order the map ranked them. New shared
modules: `src/lib/approvalQueries.ts` (`useOrderQueue`, `useOrderDetailsFetcher`).
Everything else reuses `authQueries` / `sapQueries` / `orderQueries`.

**The mutations were deliberately NOT converted.** The map confirmed by
experiment that the three `*_Order` pages carry a latent `location.state`
violation which surfaces as `react-hooks/immutability` — "Cannot access variable
before it is declared" — the moment `submitReview` becomes a `useMutation`. It
is the try/catch, not async/await, that keeps the React Compiler bailed out.
Converting the LISTS gets the caching, the real `isPending`/`isError` and the
dead-code removal; converting the mutations in the same pass would have turned
three pages red for no user-visible gain. Lint confirms: those files are clean.

**Patterns that carried the batch:**

* *Re-seed during render, never in an effect.* Four pages seed editable state
  from fetched data — `Staff_Rate_Assignment` (four vars from one merge),
  `Order_Flow_Settings` (`config`), `HAIS/AssetForm` (`form`), and
  `Party_Assignment`. Each uses a `seededFrom` identity guard and assigns during
  render, which React supports and which an effect would make a
  `set-state-in-effect` violation. It also lands a render earlier, so a
  keystroke cannot be swallowed.
* *Committed filters as the key.* `SO_Invoice_Report`, `Scheme_Manager`,
  `HAIS/AssetRegister` and `InvoiceBrowser` all apply their filters on a button,
  not per keystroke. Keying on the raw inputs would fire a request per
  character; each now holds a separate `applied` state. This deleted
  `Scheme_Manager`'s `overrides` parameter outright — it existed only because
  the setters had not flushed when `loadSchemes` was called from the same
  handler.
* *Derive the page number, do not clamp it in an effect.*
  `Staff_Rate_Assignment` had two effects — `setCurrentPage(1)` on `[search]`
  and a clamp against `totalPages` — replaced by
  `const currentPage = Math.min(rawPage, totalPages)`.

**Behaviour changes worth knowing:**

* `Device_Management`'s hand-rolled 60s `setInterval` (plus the `loadRef` that
  existed only to stop it closing over stale filters) is now `refetchInterval`.
  The old guard was `document.hidden`; `refetchIntervalInBackground: false` keys
  off window FOCUS, so a visible-but-unfocused tab no longer refreshes.
* `InvoiceBrowser`'s module-level `cache` object is gone. Its rows are the query
  cache; its FILTER VALUES no longer survive a tab switch. That cache also had a
  bug: `cache.loaded` was set only on success, so a failed first load re-fired
  the request on every keystroke in the Search box until one succeeded.
* `Order_Status_Tracking`'s quotation path is commented out, not ported.
  `QUOTATION_FLOW_ENABLED` is already `false` and the backend route is gone, but
  the effect that drove it ran after EVERY render (`paginatedOrders` is a
  `.slice`, not a memo) and reached `setOrders` — the worst of the 23 latent
  violations.

**Bugs fixed on the way past:** `HAIS/AssetRegister`'s Reset cleared the inputs
and then refetched with the PREVIOUS filters; `InvoiceReview` sorted the
response array in place in two places (cache corruption once the body is
shared), and funnelled list failures and action failures through one `error`
state; `Party_Product_Assignment` assigned `/sap/products/` straight into state
with no `Array.isArray` guard — the only consumer in the repo that did not
coerce; `Ap_Invoice_Entry` reset thirteen fields from an effect on `[branch]`.

**Deliberately not converted:**

* `einvoice/GenerateIrn` — all three fetches are button-driven and the failed
  RESPONSE BODY is data, not an error (`err.response.data` is what renders the
  NIC validation list). A query layer that reduces errors to a message string
  breaks it. `NicUI.CompanyDbSelect`, which it shares, IS converted.
* `SalesInvoice/ContentsTab` — only the read-only queries are candidates; its
  allocation loop is a fetch-then-write-back whose write changes the dependency
  of the effect that issued the fetch, so `useQuery` there is an infinite loop.
* ~~`Product_Stock` and `Dashboard`~~ — **since converted.** They were the one
  group the map lost (that analysis agent dropped its connection), so they were
  read directly instead. Both came back pixel-identical.

  `Dashboard` was the interesting one and is worth reading before the next
  conversion of its kind: its year fallback called `setYear(fallbackYear)` from
  INSIDE the fetch, so keying a query on `[year, month]` would have re-keyed and
  refetched forever. The fallback now lives in the queryFn and RETURNS the year
  it settled on, with an identity-guarded adopt during render — the same shape
  `Order_Flow_Settings` needed for `flow_type`. Its three reads also stay in one
  `Promise.allSettled`: the 401-and-log-out check reads all three results
  together, and "unable to load" is reported only when BOTH data calls fail.

  `Product_Stock` was two independent mount reads and converted plainly; its
  `openParties` error had been swallowed into a `console.error`, which on a
  filter dropdown is indistinguishable from "no parties have open orders".

**One live gap in the harness:** `scheme-manager.png` is still a baseline of an
EMPTY scheme table. `schemeService.list` calls `/orders/v2/schemes/` and the
fixture pattern is `/orders/schemes/`, which does not match. The conversion is
therefore unwatched by the visual suite. Adding
`[/\/orders\/v2\/schemes\/(\?|$)/, {data: [...]}]` **after** the existing
`/orders/v2/schemes/preview/` entry fixes it, and the baseline must then be
re-accepted deliberately.

### The Scheme_Manager baseline gap, closed — and the one behind it

`scheme-manager.png` had been a route baseline for some time and was a picture
of an **empty scheme table** throughout. The file already carried
`[/\/orders\/schemes\//, []]`, which reads as coverage; `schemeService.list`
actually calls `/orders/v2/schemes/`, which that pattern never matches. The
page's reference data did load, so it looked convincingly alive.

A `/orders/v2/schemes/` fixture now sits **below** the `/orders/v2/schemes/
preview/` entry — below, because placed above it would swallow the preview POST,
which is a different shape entirely. Two schemes, one turned off. The baseline
went from 94 kB to 110 kB on re-accept, which is the rows arriving.

**The gap behind it, left open deliberately.** Scheme_Manager filters the shared
`["sap","products"]` catalogue through `isFinishedGood` (Scheme_Manager.tsx:41),
which requires `item_code` to start with `"FG"`. Every row in the
`/sap/products/` fixture uses a `JV-` code and carries `type: "FG"` instead — so
none survive that filter and the catalogue is empty on this page regardless of
the fixture being present. `itemNameOf` then falls back to printing the raw item
code, which is exactly the failure mode the map warned about.

Fixing it means changing item codes that the Add_Sales fixtures depend on, with
its own baseline churn, so it is recorded rather than bundled in. The
interaction test states this explicitly at the point where the obvious assertion
would have gone, so the next person does not read its absence as an oversight.

### The FG gap, closed — and it was narrower than it looked

The catalogue mismatch above is fixed. The three `/sap/products/` rows now carry
`FG0000011` / `FG0000012` / `FG0000013` instead of `JV-OIL-1L` / `JV-BEV-250` /
`JV-OIL-5L`, which is the convention SAP actually uses — `Add_Scheme` prompts
for one (`Eg: FG0000005`, Add_Scheme.tsx:314), and the API examples in
`openapi.yml` are `FG001` / `FG002`. The fixture was the wrong side of the
mismatch, not `isFinishedGood`.

The churn turned out to be far smaller than the note above predicted. The
`JV-` codes the Add_Sales fixtures depend on are **order rows and party-product
rows** — they never pass through `isFinishedGood`, and they were left alone.
Only two fixtures needed to change: the `/sap/products/` catalogue, and the four
item references inside the `/orders/v2/schemes/` list, which now point at two
catalogue rows so the name resolution is exercised rather than assumed.

One baseline moved: `scheme-manager.png`, 110 kB → 111 kB, re-accepted on its
own with `-g "scheme-manager" --update-snapshots`. Every other route baseline
passed untouched, which is itself the evidence that the `JV-` codes elsewhere
were the right ones to leave.

The interaction test now asserts what its predecessor explicitly could not:

```ts
await expect(appPage.getByText(/buy 10 boxes of Jivo Canola Oil 1 L/)).toBeVisible();
await expect(
  appPage.getByText(/of Jivo Olive Oil 5 L free for every 24, up to 10/),
).toBeVisible();
```

Both read through `itemNameOf`, so an empty catalogue fails them — the rule
lines would print raw `FG0000011` codes. One covers an active scheme's trigger,
the other a turned-off scheme's benefit, so both scheme states and both halves
of the nested `triggers` / `benefits` shape stay covered.

**Left alone, seen while there:** `describeBenefit` renders "1 boxes of ..." —
it does not singularise the unit. Cosmetic, in `schemeService.ts:337`, and
outside a data-layer phase.

### The mutations, converted — and the blocker that wasn't

The three approval queues (`Billing_Order`, `Auditor_Order`,
`Rate_Approver_Order`) kept their `submitReview` as a hand-rolled async function
through all of 3.1, on the recorded grounds that converting it surfaced
`react-hooks/immutability` — "Cannot access variable before it is declared" —
and would turn three pages red.

That reading was wrong, and the fix was two lines of reordering. The complaint
is a plain **use-before-declare**: the `location.state?.openOrderId` effect calls
`fetchOrderDetails`, which is a `const` declared about ten lines BELOW it. It
works at runtime — the const is assigned during render, the effect runs after —
but no static analysis can know that. Hoisting the declaration above the effect
removes it. All three files are lint-clean after the conversion; nothing needed
re-keying.

**What each conversion actually buys.** `isProcessing` / `isCreating` was a
`useState` set before the request and reset in a `finally`. `isPending` is the
same boolean owned by the mutation, and it cannot be left stuck on by a path
that returns before the reset — which matters more than it sounds, because on
`Rate_Approver_Order` and `Auditor_Order` that flag drives a **blocking Dialog**
that refuses Escape and outside clicks. A stuck flag there is a page the user
cannot leave.

Each conversion also deleted a `refetchOrders()` that ran immediately after
`removeHandledOrder`, which already invalidates the same queue key — two round
trips per approval, one of them redundant. `refetchOrders` is no longer
destructured on any of the three; each failure state is a message, not a retry
button.

`Auditor_Order`'s two awaits — push to SAP, then move the status — stay in ONE
mutation deliberately. They are one business action, and an order that reached
SAP but whose status never moved is the exact failure this page exists to
prevent.

**The coverage gap this exposed, closed.** `billing-orders.png` and
`auditor-orders.png` were route baselines, so the queue lists were watched; the
review modal and the write behind it were not, and `/Rate_Approver_orders` had
no baseline at all — the worst arrangement for three near-copy pages, since a
change made to all three would show up in two screenshots and vanish in the
third.

Added: a `rate-approver-orders` route baseline (146 kB, six rows), and a
`phase 3.1 approval writes` describe with one test per page. Each drives the
real two-step modal and answers the POST itself, so it can assert the **request
body**:

| page | status code sent | also sends |
|---|---|---|
| `Billing_Order` | `10` | — |
| `Auditor_Order` | `9` | `/sap/approve-sales-order/` FIRST |
| `Rate_Approver_Order` | `6` | `reason: "Approved"` by default |

Those codes are the only thing distinguishing the three writes, and a conversion
that sent the wrong one would still have rendered a success dialog. The Billing
test also asserts the mutation has NOT fired after the first two clicks, since
the review/confirm separation is the point of the flow, and the Auditor test
asserts the call ORDER (`["sap", "status"]`) plus the quotation number, which
can only appear if both awaits ran.

**Still not converted, unchanged reasons:** `einvoice/GenerateIrn` (the failed
response body is data, not an error) and `SalesInvoice/ContentsTab`'s allocation
loop (a fetch-then-write-back whose write changes the dependency of the effect
that issued it).

**Verification after both pieces of work:** 448 unit tests, `tsc -b` and
`tsc -p tsconfig.e2e.json` clean, production build clean, lint unchanged at 55
errors / 17 warnings, **46 route baselines and 48 interaction tests green**.
Two baselines were re-accepted individually — `scheme-manager.png` and
`sap-sync-products.png` — each looked at before being accepted, never through a
suite-wide `--update-snapshots`. Nothing committed.

## Phase 6.3 — inline styles, started with the coverage it needed

874 `style={{...}}` uses across the app (the plan's 815 was out of date). This
pass removed 179 of them, in five files, and every baseline those files appear
in stayed **pixel-identical** — which is the whole verification story: a style
move that changes nothing is correct by definition, and the screenshot is the
only thing that can say so.

### The files, and why these five

| file | inline styles | had a stylesheet? |
|---|---|---|
| `Party_Product_Assignment` | 85 | no |
| `Combo_Mapping` | 45 | no |
| `Staff_Rate_Assignment` | 24 | no |
| `Drafts` | 13 | no |
| `Profile` | 12 | no |

Not the top five by count — the top five **with no stylesheet at all**. That
distinction turned out to matter more than the raw number. The 695 that remain
are mostly of a different kind: a one-line tweak sitting beside a class that
already exists (`className="trk-sub" style={{ fontSize: 11 }}` — `Tracker_Queue`
has 55 of those). Converting them means inventing a modifier class per tweak,
in files whose stylesheets are already large. Worth doing, but it is a different
job with a different payoff, and it should not be mistaken for this one.

### Coverage first, again

Three of the five pages were **routed with no baseline** — the densest
inline-style files in the app, in the one phase most likely to move pixels. They
got baselines BEFORE any style moved, and two needed fixtures to be worth
anything:

* `Combo_Mapping` photographed "No combo packs are assigned to any party yet."
  `/auth/combo-mappings/` is read as `response.data?.data?.combos`, and nothing
  matched it. The fixture now carries three combos — mapped, partially mapped,
  untouched — because the row is drawn differently in each.
* `Party_Product_Assignment`'s route baseline is a party picker and an upload
  card; the grid, the counters and the rate rows all wait for a party to be
  chosen. Its 85 styles were behind one click. `/auth/parties/{code}/products/`
  was landing on the `/parties/` catch-all and unwrapping to nothing, so even
  after the click there was no grid. Two interaction shots now cover the grid
  and the add-products modal.

### What changed shape, and what deliberately did not

Every declaration moved verbatim. Three patterns were rewritten rather than
copied, all behaviour-preserving:

* **Hover handlers became `:hover`.** The party dropdown row wrote
  `e.currentTarget.style.backgroundColor` in `onMouseEnter`/`onMouseLeave`, with
  both branches spent preserving the checked row's own background. Two handlers
  gone per row.
* **Computed `opacity`/`cursor`/`background` became `:disabled`** on buttons
  that already carried the identical condition as their `disabled` attribute —
  the condition was written twice, once as an attribute and once as a style.
* **Nested ternaries became modifier classes** — the four counter cards (which
  carried four literal colour objects in an array *in the markup*) and the
  category badge.

One case looked like `:disabled` and is not: `Combo_Mapping`'s save button was
blue whenever both halves were chosen, INCLUDING mid-save, while `disabled`
covers both-halves-missing *and* mid-save. Those differ in one state, so the
fill stayed on its own `.is-ready` modifier. `:disabled` there would have been a
silent visual change wearing the costume of a refactor.

Not shared: `Staff_Rate_Assignment`'s product card and
`Party_Product_Assignment`'s modal row are the same treatment down to the hex
values, and they stayed in two files. A shared class between two pages with no
shared component is how the next visual change lands somewhere nobody looked.

### Left open

* **695 inline styles**, the tweak-beside-a-class kind described above.
* **`Sidebar`'s 31** are almost all in the notifications panel, which opens on a
  click and has no screenshot. Converting them blind is exactly what this phase
  should not do.
* **The party-category vocabulary gap.** `/sap/parties/` gives its rows
  `Distributor` / `Retail`, while product categories in this app are OIL /
  BEVERAGES / MART. `Party_Product_Assignment` keeps a product only when its
  category is one of the selected party's, so its add-products modal can only
  ever be empty under the current fixtures. The modal screenshot covers its
  chrome and says so at the assertion.

### 6.3 continued — the einvoice and HAIS families

Another 66 removed, bringing the phase to **275 of the original 874** (599 left).
Nine more files, and this batch is the *second* kind of inline style — the
one-line tweak beside a class that already exists — done the way it should be.

`GenLogs`, `InvoiceBrowser`, `GenerateIrn`, `IrnQr`, `EinvTools`, `GenerateEwb`,
`HaisReports`, `AssetRegister`, `AssetLookup`, `AssetForm`, `OptionManager` and
`HAIS/index` all share one stylesheet (`Einvoice.css`, which the HAIS pages
import too), and they were repeating each other constantly:

* the same icon adjustment (`verticalAlign: -3px, marginRight: 6`) **fourteen
  times** across ten files — now `.nic-icon-lead`;
* the same row-action button (`minHeight: 30, padding: "0 10px", fontSize: 11`)
  in both e-invoice tables — now `.nic-btn-xs`;
* `whiteSpace: "nowrap"` on five table cells, `textAlign: "right"` on three.

That is the actual argument for this phase, and it is not "inline styles are
untidy": the same decision was written out fourteen times, so changing it meant
finding fourteen places.

**Every modifier is written with two class selectors** — `.ofs-secondary.nic-btn-xs`,
not `.nic-btn-xs`. An inline style beat `.ofs-secondary` (which lives in
`Order_Flow_Settings.css`) whatever order the two bundles loaded in. A
single-class modifier would tie, and the winner would depend on chunk order —
a bug that would appear in production and not in the harness.

**Coverage first, again, and it found more holes.** `/Einvoice` opens on
Invoices and `/HAIS` on Asset Register, so eleven of the thirteen panels across
the two pages had no screenshot at all. Two new describes — `e-invoice tabs`
(5 shots) and `HAIS tabs` (6) — were baselined BEFORE anything moved. The HAIS
one needed its click scoped to `.nic-tabs`: the Asset Register panel carries its
own "Add Asset" and "Lookup" buttons, so the tab names matched two elements each.

`ErrorBoundary`'s 8 went too, checked by the crash screenshot. Its stylesheet
keeps an explicit `font-family` rather than inheriting: the boundary renders
when the app has already failed, and it should not depend on a shell that may
not have mounted.

**Values kept rather than tidied.** `nic-form-grid` had `marginTop: 12` in
`InvoiceBrowser` and `14` in the other four — almost certainly an accident, and
preserved as two modifiers anyway. Same for `AssetForm`'s two negative note
margins, `-4` and `-6`, four hundred lines apart. This phase moves declarations;
it does not decide them.

### 6.3 continued — the Tracker family, and a specificity trap the baseline caught

152 more removed across the five Tracker pages. The phase now stands at
**427 of 874 (447 left)** — just under half.

`Tracker_Queue` alone held 55, and the same object kept coming back: `.trk-sub`
plus `fontSize: 11` **fourteen times in one file**, `padding: "5px 9px"` on nine
row buttons across four files, `.trk-field` plus `gap: 4` fourteen times, an
11px filter label twenty-one times. None of it was ever a design decision made
fourteen times; it was one decision copied.

**The trap, and why the harness exists.** The new CSS opens with a warning that
any modifier overriding an existing rule must carry enough selector to win —
and the very first rule I wrote broke it. `.trk-search-input { padding-left:
32px }` (0,1,0) lost to `.trk-header input` (0,1,1), which the inline style had
been beating all along. The result: the search placeholder sat underneath the
magnifying glass. `tracker-queue.png` failed with **640 differing pixels**, the
diff pointed straight at the search box, and the fix was
`.trk-header input.trk-search-input`. That is the entire argument for baselining
before converting: the mistake is invisible in review and obvious in a diff.

**Coverage added first:** `tracker-queue-detail.png` — the invoice detail
dialog, which holds the `sections` loop and about a fifth of that file's inline
styles, and had no screenshot.

**Deliberately transcribed, not verified:** `Tracker_Queue`'s payment dialog.
Its five read-only inputs used a `const ro = { background: "#f3f4f6",
fontWeight: 600 } as const` spread onto each — invisible to a `style={{` count,
which is worth remembering: the grep undercounts. Reaching that dialog needs an
invoice parked at a terminal stage and no fixture provides one, so those five
are marked in `Tracker.css` as unverified.

**One inline style kept on purpose:** `Tracker_Reports`' KPI icon colour is a
`tone` prop passed per card. The geometry moved to `.trk-kpi-icon`; the colour
stays inline, because it is a value the component receives, not a decision the
stylesheet can hold.

## Phase 6.4 — the explicit `any`s

38 at the start of this pass, **12 left** (lint errors 55 → 29). The remaining
twelve sit in four files that were being read by a background analysis at the
time and were left alone rather than edited underneath it:
`Tracker_Admin` (5), `SkuGalleryPage` (3), `Party_Assignment` (2),
`Order_Status_Tracking` (2).

The point of the phase is not tidiness. Three of the removals surfaced a defect
that `any` had been hiding:

* **`useSalesOrderForm` (10 `any`s).** Four option lists were `useState<any[]>`
  because `ordersService` / `userService` return `response.data` untyped, so
  every read of `.value`, `.bpl_id`, `.name` was unchecked. Typing them broke
  the build in exactly one interesting place: `selectedBillAddressLabel` ends
  its `||` chain on `address_id`, which the API sends as a **number** for some
  rows, and it feeds a `string`-typed prop. It is coerced explicitly now.
* **`Distributor/index`.** The `.filter((p: any) => …).map((p: any) => …)` that
  builds `PartyProduct[]` was allowed to produce `item_code: undefined` against
  a type that demands a string. Now coerced, with the assumption written down
  instead of made silently.
* **`trackerService`.** The five admin-lookup methods were `any` in and `any`
  out. One exported `LookupRow` covers all six kinds — `gst_rates` carries
  `label` + `rate`, every other kind carries `name`, which is why both are
  optional.

The rest: `ordersService`'s undeclared `total_ltrs` (a backend-computed field,
now named in a narrow cast rather than an open one), `uiConfig`'s envelope
unwrapper, `Staff`'s three coercion helpers, `Ap_Invoice_Entry`'s error reader
and line-payload builder, and `vite.config`'s `res: any` → `ServerResponse`.

## Phase 3.3 — the last direct session reads

`src/auth/session.ts` and `useAuth()` already existed; what remained were call
sites still reading the session's `localStorage` keys by hand. Four moved:

| file | was | now |
|---|---|---|
| `sidebar/useNotifications` | `localStorage.getItem("access")` | `getAccessToken()` |
| `Distributor/index` | `Number(localStorage.getItem("user_id"))` | `useAuth().session?.userId` |
| `SalesInvoice/useSalesInvoice` | same, module-level | `loadSession()?.userId` |
| `Profile` | its own `readLocal()` over five keys | `useAuth().session` |

`Profile` is the clearest case: a page that displays the account had its own
private opinion of how a session is stored. It now reads the same object every
guard reads.

**Deliberately still on `localStorage`, and correctly so:** `api.ts` (the
interceptor reads the token per request — documented there), `webDeviceService`
(the device id must survive logout), `uiConfig`'s label mirror,
`notificationPermission`, and the three per-browser conveniences —
`sidebar_collapsed`, `lastSync`, `sales_invoice_draft`. None of those are
session data.

`Sidebar` and `Dashboard` each still clear session keys by hand; both were in
use by the same background analysis and are the last two.

**One oddity worth recording:** `tsc -b` began reporting a missing
`e2e/zzprobe.spec.ts` that had never existed in this working tree — a stale
entry in `node_modules/.tmp/tsconfig.e2e.tsbuildinfo`, left by a probe file an
analysis agent created and removed. Deleting that build-info file cleared it.
Incremental build state can outlive the file that caused it.

## Phase 6.6 — the compiler-backed hook rules

Nine `react-hooks/set-state-in-effect` errors, plus the two neighbouring React
Compiler errors. Every one of them is the same shape: **state that is really
derived, kept in sync by an effect.** The effect makes React render once with
the stale value and then again with the fresh one, so there is always a frame
where the screen disagrees with itself.

Eight of the nine, and both compiler errors, are gone. Lint errors 29 → 14.

| file | the derived thing | how it is derived now |
|---|---|---|
| `SalesInvoice/index` | `selectedMainGroup`, `selectedChain` | `options.includes(choice) ? choice : ""` at render |
| `SalesInvoice/DraftStep` | the error banner, the success modal | open ⇔ the hook is reporting something not yet dismissed |
| `SalesInvoice/DraftStep` | the totals modal, closed on post | closed in the Submit handler that starts the post |
| `SalesInvoice/OrdersStep` | `activeOrderKey` when the search narrows | `activeKey`, the same fallback the render already used |
| `Tracker_Admin` | the draft cleared on tab change | cleared in the tab's own click handler |
| `order-items/ItemSection` | collapsed groups reset on new items | the previous-value pattern, keyed on the item codes |

Two of these are worth spelling out.

**`DraftStep` needed the event handler, not just a derivation.** Storing "what
was dismissed" instead of "what is open" is the obvious rewrite, and on its own
it is wrong: submit, fail with error X, dismiss it, submit again, fail with the
identical X — the dismissal still matches and the user gets no feedback at all.
What makes it correct is that `postInvoice` has *exactly one caller*, the
Submit button in the totals modal, so that handler can clear both dismissal
markers as it starts a post. The same single call site is what lets the totals
modal close there rather than in an effect on `state.posting`. A derivation
alone would have been a silent regression.

**`ItemSection`'s effect was firing far more often than intended.** It read
"fully expand whenever a different order's items load", but its dependency was
`items` — a new array identity on every parent render. It threw the user's
collapsed groups away on renders where nothing had changed. Keying on the item
codes makes it do what the comment always said.

`OrdersStep` also carried `preserve-manual-memoization`: its `activeItemCodes`
`useMemo` depended on `activeOrderLines`, rebuilt every render, so the memo
never hit *and* the React Compiler skipped compiling the whole component
because it could not preserve it. Removing the manual memo lets the compiler
memoize it properly — the opposite of what the code was trying to do by hand.

`ItemCard`'s `static-components` error was `const CategoryIcon =
getCategoryIcon(item)`. The lookup returns a stable `IconType`, so it was never
an actual remount, but a capitalised const assigned during render is
indistinguishable from a component declared during render. `createElement(...)`
says the same thing without the ambiguity.

**The one left:** `Sidebar.tsx:158`, which was in use by the background style
analysis. It is the last of the nine.

### `react-refresh/only-export-components` — a false positive worth fixing

`ui/dialog.tsx` exported four Radix primitives as `export const Dialog =
DialogPrimitive.Root`. Those exports *are* components; the rule cannot tell,
because a re-exported member expression is not statically a component — so Fast
Refresh gave up on the module that 44 converted modals depend on. Wrapping each
in the `export function X(props: React.ComponentProps<typeof …>)` form the same
file already uses for `DialogOverlay` and `DialogContent` makes it true rather
than silenced. React 19 passes `ref` as a prop, so nothing is lost forwarding
`{...props}`. Every modal test in the suite passed unchanged, which is the
coverage that claim needed.

The rule is switched off for test files (`eslint.config.js:31`) and that scope
is right — these were real source files, not covered by it.

Left: `NicUI`'s `apiErrorMessage`, whose 20 importers are the einvoice /
ewaybill / HAIS files, and `SkuGalleryPage`.

### The Lookups tab had no baseline, and something was wrong on it

`/tracker/admin/` answered `[]` for everything beneath it, so `Tracker_Admin`'s
Lookups tab drew an empty table in every run: its rows, its inline editors, its
two different column sets and its add form were all invisible to the suite.
Two fixtures now feed it — `gst_rates` carries `label` + `rate`, every other
kind carries `name`, and one fixture for all six would have left the GST Rates
table drawing empty cells and passing. Three baselines.

The first screenshot showed the add dialog titled **"Add Categorie"**.
`kindLabel.replace(/s$/, "")` had been stripping the plural, and "Categories"
is the one label here whose plural is not a trailing `s`. Each kind now carries
an explicit `singular`. Worth noting how it surfaced: not from reading the
code — the expression looks reasonable — but from looking at the picture. And
"Add GST Rate" was already correct under both schemes, so its baseline did not
move, which is the consistency check on the fix.

**What the coverage does *not* prove.** `LookupsTab`'s effect also called
`setDraft({})` and `setShowAdd(false)`, and neither is reachable through the
UI: the add form is a Radix dialog, so the kind tabs behind it cannot be
clicked while a draft exists, and `openAdd` rebuilds the draft each time it
opens. Moving those into the tab's click handler removes a cascading render and
nothing else. The tests are recorded as coverage of a tab that had none, not as
a regression test for a bug — the comment in the spec says so, so the next
person does not read more into a green run than it earns.

### The last ten, and zero lint errors

`Sidebar`'s nav-group effect was the ninth `set-state-in-effect` and the most
visible of them: it opened the group owning the current route and closed the
other two, from an effect on `location.pathname`. As an effect that drew the
sidebar once with the *previous* route's group still open, on every navigation.

The groups are not purely derived — clicking a group header opens one on any
route — so this is React's "adjust state when a prop changes" pattern, not a
plain derivation: compare against the path last synced, re-sync only when it
moves. The three path predicates moved to module scope, which also lets the
initial state be read off the first pathname instead of starting every group
closed and opening the right one a render later. `useLocation()` is hoisted
above the state for that; `window.location` would have been the wrong source,
since it ignores the router's basename and its own history.

All 49 route baselines matched unchanged, and that is a real check rather than
a formality: the sidebar is on every one of them, and `Add_Sales`,
`View_Orders`, `Sales_Report` and `Distributor` are exactly the routes whose
group must be open on arrival.

The remaining `any`s went the same way as the rest — to a type the file already
had. `Party_Assignment`'s two were `(p: any)` feeding
`isPartyInUserCategory(party: Party, …)` declared 120 lines above them;
`Order_Status_Tracking`'s two were `(ra: any)` over `rate_approvals`, already
`RateApproval[]` on `Order`. `SkuGalleryPage`'s three were `apiUpload<any>` /
`apiDelete<any>` whose bodies all three callers discard — `unknown` says there
is a value and we do not know its shape, which is true, where `any` said we
did. Its `react-refresh` error was `export const cropImageToSquare`, exported
but called only on line 456 of its own file; dropping the `export` was the
whole fix.

**Phase 6.4 is complete: 0 `any`, 0 lint errors, down from 55.** Fifteen
`exhaustive-deps` warnings remain and are unchanged.

### `apiErrorMessage` was `messageFrom`, written worse

The last error was `NicUI`'s `apiErrorMessage`, a non-component export in a
module of components. Moving it would have fixed the rule; it was the wrong
fix, because the function should not exist. `src/lib/apiError.ts` already is
the one place a thrown request becomes a sentence — its header describes being
promoted out of `Payments/useApprovalAdmin` precisely because 36 other sites
each did it worse. `apiErrorMessage` was one of those sites, and 17 files
imported it.

Three ways it was narrower, all of which are now fixed at those 17 files:

* **Three response keys against five.** It never looked at `sap_error`, so a
  SAP Service Layer failure that names the item or the account showed the
  generic "Failed to post" instead. `messageFrom` puts `sap_error` above the
  generic `error` for exactly that reason.
* **No distinction between an HTTP failure and our own bug.** It ended on
  `e?.message`, so a `TypeError` thrown by mapping code reached the screen as
  developer text. `messageFrom` returns the caller's fallback.
* **No wording for a request that never completed.** Offline, DNS, CORS and
  timeouts all produced "Request failed"; they now say so.

The old fallback string is passed explicitly at every call site, so the
last-resort wording on those screens is unchanged. The function is kept
commented in `NicUI` so the old key order stays readable beside the new one.

**This changes user-visible text on the e-invoice, e-way-bill and HAIS
screens**, and deliberately: it is the same change, and the same argument, that
`apiError.ts` was created to make. The fixtures do not exercise error paths, so
the baselines confirm the 17 files still render — not which sentence they show
when a request fails.

### A note for whoever applies the style maps

This batch shifted line numbers in files the background style analysis had
already mapped: `Sidebar` substantially, and the 17 e-invoice / e-way-bill /
HAIS files by one line each (the added import). Match those maps on the inline
style text rather than on the line numbers they record.

## Phase 6.3 continued — the maps came back PARTIAL, and the first file showed why

The background analysis produced seven maps covering ~40 files and 447 inline
styles, then verified each file adversarially. **Almost every verdict is
PARTIAL: the central judgement survives, the supporting evidence does not.**
The maps are an inventory of where the inline styles are. They are not a plan
that can be applied as written.

What the verifiers found, by kind:

* **Invented facts.** The `Sidebar` map reasoned at length about
  `.sb-notif-filter.is-active`, `.sb-notif-group-label` and `.sb-notif-item-dot`
  and issued a hazard warning about them. `grep -rn "sb-notif" src/` returns
  nothing. Those class names do not exist anywhere in the codebase.
* **Recipes that produce blank baselines.** `App_User`'s proposed selector
  matches four elements and dies on Playwright strict mode; making it unique
  would then screenshot a dropdown with no fixture behind it — "exactly the
  empty-picture baseline this project keeps shipping", in the verifier's words.
  `Login`'s map recorded `hazards: []` for a Toast that calls
  `setTimeout(onClose, 3500)`: losing that race yields a green, never-flaking
  screenshot of a toast-less login page.
* **Counts that do not reconcile.** `Party_Assignment` was reported as 33 of 53
  objects uncovered; it is 21. Its own arithmetic implied a 55-object file.
* **Contradictory instructions.** Two `Party_Assignment` items ask for one
  fixture user to carry one category and two categories.
* **Understated blast radius.** The `Party_Assignment` fixture change was filed
  as moving `app-user.png`; `useUserList` also feeds `Page_Permissions`,
  `Daily_Report`, `PersonWise_Report` and `Sales_Report`.

So the maps are being used as a census, with every hazard re-checked against
the file before anything moves. The first conversion is why that is the right
call.

### The Sidebar header — four styles, and the CSS was lying

Four inline styles in the header are covered by all 49 route baselines, because
the header is on all 49. The map's read was that `.header-right` and
`.header-profile` already declare byte-identical rules and the inline styles
are dead duplicates. Half right, and the wrong half matters:

| element | class declares | inline said | who won |
|---|---|---|---|
| `.header-right` | `display:flex; align-items:center` | the same two | tie — a real duplicate |
| `.header-profile` | the three flex properties | those three **plus** `margin-right`, `text-decoration` | class for three, inline-only for two |
| `.header-profile-name` | `.88rem`, `#334155` | `.9rem`, `#0f172a` | **inline** |
| `.header-profile-role` | `.58rem`, `#0f766e` uppercase | `.75rem`, `#64748b` | **inline** |

The last two are not duplicates at all. The values in `Sidebar.css` have never
rendered — an inline style beats them, and has for as long as both have
existed. Deleting the inline styles and trusting the classes would have
restyled the profile block on every page in the app.

So the classes were changed to the values that were actually on screen. The
stylesheet now says what the header shows.

**And one trap underneath that one.** `@media (max-width: 480px)` sets
`.header-profile-name { font-size: .78rem }` and `.header-profile-role {
font-size: .52rem }`. An inline style beats a media query too, so those rules
have also never applied. Moving the values into the base classes would have
brought them to life — shrinking the header profile on mobile for the first
time, at a breakpoint the suite (1440x900) does not watch. They are commented
out with that explanation. Reviving them may well be right; it is a design
decision, not a side effect of moving a style off an element.

All 49 route and 65 interaction baselines stayed pixel-identical.

**Not touched in this file:** the notification bell (`Sidebar.tsx:285-330`) and
the notifications dialog (`979-1188`), together the bulk of the file's 31
inline styles. Both are gated on
`["auditor","billing","manager"].includes(normalizedRole) || isRateApprover`
and the harness session is `admin`, so neither has ever appeared in a
screenshot. Covering them needs a per-test `/auth/profile/` stub rather than a
seeded `localStorage` role — `AuthProvider` overwrites the session from that
response — and the push-permission modal then auto-opens on top of the shot.
That is the next piece of work on this file, and it is coverage work, not
conversion work.

### The workflow finished, and 9 of its 46 agents did not

37 of 46 completed; 9 verify agents died on `You've hit your session limit ·
resets 8pm (Asia/Kolkata)` — `Tracker_Alerts`, `SalesInvoice/index`,
`Dashboard`, `Scheme_Manager`, `QrViewer`, `ManageEwb`, `EwbLookup`,
`IrnLookup` and `CancelIrn`. Those nine files have a map and **no adversarial
check on it**. Given that every map which *was* checked came back PARTIAL, an
unchecked one is worth less, not more. They are flagged here so nobody later
mistakes "no corrections recorded" for "verified clean".

### App_User — four sites, four different situations

All four are on `app-user.png`, and not one of them is "move the declarations
into a class of the same name":

* **L509** overrode `align-items` and `margin-bottom` on an element carrying
  BOTH `.au-header` and `.app-page-head`, which declare the same two properties
  as each other. A single-class modifier would be `0,1,0` — a tie with both,
  broken by whichever stylesheet the bundler emitted last. `.au-header.au-header--center`
  is `0,2,0` and wins outright, including over the `@media (max-width: 768px)`
  rule that sets `align-items` again, which is what the inline style did.
* **L515** sat on `.au-subtitle { display: none }`. Its three declarations have
  never painted a pixel. Deleted as dead rather than moved into a class —
  putting them in a stylesheet would make "should this subtitle be visible?"
  look answered when nobody has answered it.
* **L520** was a verbatim copy of `.au-header-actions`, a class that existed in
  `App_User.css`, declared exactly those three properties, and had no users. It
  was written for this div and never attached to it.
* **L555** was `margin: 0` on an element the layered reset already zeroes. A
  no-op.

### The four manager reports — 50 objects, 8 declaration sets, one class set

`Daily_Report`, `PersonWise_Report` and `Sales_Report` are near-copies.
Rather than assume that, the inline style bodies were normalised and compared
as multisets: **all three carry the identical 15**, and `StateWise_Report`'s 5
are a strict subset. So one set of decisions converts all four files.

Eight distinct declaration sets, and nine of the fifteen uses are nothing but
`text-align`.

**Alignment went to Tailwind, not to new CSS.** `TableHead` already ships
`text-left` and `TableCell` ships `text-body` (`ui/table.tsx`), and `cn()` is
`twMerge` — so `className="text-right"` *replaces* the default rather than
racing it. A hand-written `.dr-right` would also have won, because `Report.css`
is unlayered and Tailwind's utilities are in `@layer utilities`, but it would
have won by a cascade subtlety instead of by saying what it means.

Everything that is not alignment went into `Report.css`, which all four pages
already import: `.dr-col-item`, `.dr-cell-index`, `.dr-cell-name`,
`.dr-cell-total`.

Two things found on the way:

* **`.dr-title` was an empty rule** whose only content was the comment
  *"Styles moved to inline in JSX for consistency with other pages"*. This
  phase is the reversal of that decision, so the comment was replaced with one
  that says so rather than silently contradicted.
* **`.dr-empty` was losing on two properties.** It declared `padding: 2.6rem`
  and `color: #94a3b8`; the inline set `40px` and `#64748b` and beat both. The
  class now holds the values that were actually on screen.

And the same breakpoint trap as the Sidebar header, twice over:
`@media (max-width: 768px) .dr-title { font-size: 26px }` has never applied,
because the inline `24px` beat it at every width. Moving `24px` into the base
class would have brought it to life and made the title bigger on a tablet, so
it is commented out with that explanation. The `≤480px` rule sets `24px` — the
same value the base class now carries — so it is merely redundant and is left
alone.

**Coverage first, as always.** The detail table opens only on the eye button in
a report row, so all 39 of those cells sat behind one click that no baseline
made. `daily-report-detail.png` was captured BEFORE the conversion and passed
unchanged after it, which is the pixel-identity proof. The test asserts the
item name is visible before shooting: without a row the table renders its empty
state and the screenshot would pass forever while proving nothing.

`PersonWise_Report` and `Sales_Report` gate their whole orders table on a Main
Group *and* a user being chosen, so neither has a row to click and neither has
its own detail baseline. Their markup is identical to Daily_Report's by the
multiset comparison above, which is why they were converted alongside it — but
that is an argument, not a screenshot, and it is recorded as outstanding
coverage rather than glossed.

**Running total for 6.3:** Sidebar header 4, App_User 4, the report family 50.

### Ordering the rest of 6.3 so the work compounds

The remaining files were not taken largest-first. They were clustered by
**shared declaration set** — normalise each inline style body, compare the
multisets — because two files carrying the same sets need ONE class set and ONE
round of specificity decisions. That measurement changed the order completely:

* **94 of the then-370 objects turned out to be one table's vocabulary**,
  repeated across twelve pages: the four manager reports, the four order
  queues, and the order-detail views behind three tracking pages.
* `Party_Assignment` is the largest single file at 53 objects — and has **49
  distinct declaration sets**. Almost nothing repeats, so it is the *lowest*
  leverage file in the set, not the highest. It was deliberately deferred.

So the order became: promote the shared classes once → convert every file that
uses them → then buy the one capability that unlocks the next cluster.

**Step 1 — promote before spreading.** The order-item table's classes were
created in `Report.css` under a `dr-` (daily report) name. Left there, eight
more pages would have had to duplicate them or import a report stylesheet
sideways. They moved to `UIConsistency.css` — loaded once in `App.tsx` for
every route, and unlayered, so a rule there beats Tailwind's layered utilities
without a per-page import — and were renamed `app-col-item`, `app-cell-index`,
`app-cell-name`, `app-cell-total`. Four files were re-touched to do it, which
is the cheap version of the same edit across twelve.

**Step 2 — the four order queues, 52 objects, no new decisions.**
`Auditor_Order`, `Billing_Order`, `Rate_Approver_Order` and `View_Orders` carry
the identical seven declaration sets as the reports. Their detail table sits
behind `showDetails` and the existing `phase 3.1 approval writes` tests never
leave the list, so four new baselines came first; each was captured BEFORE the
conversion and passed unchanged after, which is the pixel-identity proof.
`Order_Status_Tracking` added two more from the same vocabulary.

**Three empty-state divs in that family were deliberately left inline.** They
render only when the order list is empty, which no fixture produces, so nothing
could verify the change — and `.ao-empty` (Auditor_Order.css:69) carries
`padding: 32px !important`, which BEATS the inline `40px`. That is the reverse
of every other override found in this phase, and converting it unverified is
exactly how an 8px shift ships. Worth noting alongside it: `UIConsistency.css`
still holds a commented-out `.order-loading-state` whose declarations are
character-for-character the inline set now repeated in six files. A shared class
existed and was inlined away.

### The capability that unlocked the next cluster

Three components render only for `auditor` / `billing` / `manager` — the
notification bell, the notifications dialog, the push-permission modal — and
the suite signs in as `admin` for a good reason (a screenshot of a page you are
redirected away from is a screenshot of the Dashboard). So 39 inline styles
were unreachable by construction, not by oversight.

`asRole(page, role)` in `harness.ts` fixes that once, for anything role-gated.
It writes the role in **two** places on purpose:

1. **`localStorage`**, which is what `AuthProvider` falls back to. Today that
   is the only one that matters, and by accident: `getCurrentUser` returns
   `response.data.data` (authService.ts:14), no `/auth/profile/` fixture
   exists, so the harness's bare `[]` makes that `undefined`, `sessionFromApi`
   throws on it, and the provider keeps the stored session.
2. **The `/auth/profile/` response**, which would win the moment anyone adds
   that fixture. Without this half, adding one would silently revert every
   role-gated test to the fixture's role while the screenshots kept passing.

An earlier analysis claimed seeding `localStorage` "is not sufficient and is
not durable". Half right: it *is* sufficient today, and only because the
profile fixture is broken. Writing both halves means the test does not depend
on which of those is true.

It also suppresses the push-permission modal, which auto-opens for exactly
these roles and would otherwise sit on top of whatever the test came to
photograph.

**The notification fixtures had the same shape of gap.** `/orders/notifications/`
answered `[]`, so even with the right role the bell had no badge and the dialog
drew its empty state. Three rows now — two unread, one read, dated against the
frozen clock so the grouping lands in "Today" and "Yesterday" deterministically.

`sidebar-notifications.png` is the first baseline in the suite showing the
grouping logic, the filter chips, the unread dots and the permission banner.

**Sidebar: 26 → 1.** One hazard inside it is worth recording. `.sb-modal-title`
is on two elements — the notifications `<h3>` and the Logout modal's — and the
inline style overrode its font-size, colour and margin for the first one only.
Folding those values into `.sb-modal-title` would have restyled the Logout
title as a side effect, so they went into `.sb-modal-title.sb-notif-title`
(`0,2,0`). `font-weight: 700` was never overridden and still comes from the
base class.

A footnote on the earlier map: it reasoned at length about `.sb-notif-filter`,
`.sb-notif-group-label` and `.sb-notif-item-dot` and warned about their
specificity. Those names existed nowhere. Three of them exist now, because this
conversion created them.

### Where 6.3 stands

**447 → 291 live inline styles** over the day, across 38 files. The shared
vocabulary is now spent: only 36 objects remain in sets used by three or more
files, and the biggest of those is `marginRight: 6 | verticalAlign: "-3px"` (10
uses) — the icon-lead spacing already solved as `.nic-icon-lead` in
`Einvoice.css` and needing the same promotion treatment.

What is left is genuinely per-file work: `Party_Assignment` (53 objects / 49
sets), `UI_Labels` (25), `SOCard`, `Distributor/Order_Tracking` and `Dashboard`
(19 each). None of them share a vocabulary with anything else, so none of them
gets cheaper by waiting.

### A flaky test, recorded

`add sales wizard › step 3 shows the PO field, and it is not mandatory` failed
once in a full run and passed on re-run and in isolation. Nothing in that
run's changes touches the wizard. It is recorded here rather than left to be
rediscovered: a baseline that fails one run in ten teaches people to re-run
instead of read, which is how a real regression gets waved through.

### Reuse paying off, and a regression the new baseline caught

`nic-icon-lead` already existed in `Einvoice.css` from an earlier batch and ten
more sites still had its two declarations inline. `Einvoice.css` is imported by
`Einvoice`, `Ewaybill`, `HAIS/index` and `HAIS/AssetPublicView`, and `QrViewer`
renders only inside einvoice pages — so the class already reached every one of
them and no promotion was needed. The hazard checked before converting: two
`svg`-scoped rules in that file (`.nic-alert svg`, `.nic-vlist-head svg`, both
`0,1,1`) would beat a single class, but all ten icons sit inside `.ofs-primary`
or `.nic-tab` buttons, so neither applies.

**`UI_Labels` imports `App_User.css`.** Its page header is byte-identical to
App_User's, so the first four of its 25 objects converted with *no new CSS at
all* — `.au-header--center`, `.au-header-actions` and the two dead ones were
already decided. This is the compounding the clustering was ordered for.

Its two dialogs needed coverage first: 17 of the 25 sit behind them, and the
existing `ui labels` describe asserts three table cells and takes no screenshot.
`ui-labels-form.png` and `ui-labels-delete.png` fixed that — and the form one
immediately failed on the conversion.

**The regression, and it was mine.** The "Active (uncheck to fall back…)" label
carries `.au-label` and its inline style set only `display: flex; align-items:
center; gap: 8px`. The two "Field behaviour" toggles below it are bare labels
whose inline styles ALSO set `font-size: 14px` and a colour. Writing one
`.au-check-row` for all three folded that type into the shared class — and
because the new rule sits later in `App_User.css` than `.au-label`, at equal
specificity it won, stripping that label's uppercase and tracking. 1,855 pixels.

The fix is the distinction the markup was already making: `.au-check-row` is
layout only, `.au-toggle-row` carries the type, and only the two toggles get
both. The muted variant is `.au-toggle-row.au-toggle-row--muted` (`0,2,0`) so
it beats the base colour whatever order the rules end up in.

Worth stating plainly, because it is the argument for the whole coverage-first
sequence: three elements looked interchangeable, a single class for all three
read as obvious cleanup, and the only thing that said otherwise was a
screenshot taken twenty minutes earlier.

### Dashboard is mostly not convertible, and that is the finding

18 inline objects, and **twelve of them are computed per row** —
`PALETTE[index % PALETTE.length]`, `getSalesWidth(item.sales, max)`,
`getStatusColor(item)`, `` `${overviewRate}%` ``. Those belong on the element.
A class per palette entry per bar length is not a stylesheet, it is a lookup
table written in CSS. Five static ones moved; the twelfth, a `z-index` bump on
the order-detail backdrop, is behind a click no baseline makes and was left.

Recording that split matters as much as the conversion: the raw count said 18
and the honest number is 6, and a later reader chasing "why does Dashboard
still have inline styles" should find the answer here rather than re-derive it.

### `/Distributor_Order_Tracking` had no baseline at all

A declared route (`App.tsx:347`) that no screenshot had ever reached — the same
hole `/Rate_Approver_orders` had, found the same way: by looking for coverage
before converting. A route baseline was added, then an interaction test for the
timeline panel behind "Track", where 15 of its 18 styles live.

**And the first version of that baseline was of the wrong half.** The panel was
on screen; the timeline said *"No tracking logs found for this order."*
`/orders/<id>/orderlogs/` had no fixture, so every log timeline in the app drew
its empty state. Four log rows now exist, and the panel renders dots, the
connector, "Performed By" and the remark rows — the markup actually being
converted.

That fixture reached further than its own page. `view-orders.png` moved,
because `View_Orders` renders `By: {rejectedByByOrderId[order.id]}` only when
the logs name a rejector (View_Orders.tsx:603) — so `.vo-rejected-by` had been
dead in every baseline since it was written. The updated shot is coverage
gained, not a regression, and it is the second time in this phase that adding
one fixture revived markup nobody knew was invisible.

### The last shared set, and a conversion the baseline caught mid-air

`.app-chip-amber` in `UIConsistency.css` replaces five byte-identical copies of
the "pending with" chip across `Order_Tracking`, `Distributor/Order_Tracking`
and `Order_Status_Tracking`. **That was the last declaration set in the codebase
shared by three or more files** — the clustering that ordered this phase is now
fully spent, and everything remaining is per-file work.

`.tracker-log-meta` is declared twice in `Order_Tracking.css`, six lines apart:
the first sets font-size, line-height and colour, the second margin, weight and
transform. Left as found — merging them is a different change — but the two new
states are written as `.tracker-log-meta.tracker-log-meta--approval` /
`--pending` (`0,2,0`) so they win regardless of which of those the cascade
lands on.

**One conversion shipped broken and the baseline said so within a minute.** The
script that wrote the JSX crashed on an indentation mismatch *after* converting
the chips and *before* appending `.tracker-status-row`, `.tracker-sap-head` and
`.tracker-sap-title`. Re-running the JSX half by hand left three elements
referencing classes that did not exist; the panel lost 10px of margin and every
element below it shifted up. `grep -c` on the stylesheet returned 0. This is
the failure mode a partially-applied script produces, and the only thing that
caught it was a screenshot taken before the change.

### Party_Assignment — a 186-line stylesheet that had never applied

This file went last on purpose: 53 inline objects in 49 distinct declaration
sets, so nothing in it gets cheaper by sharing. What was not expected is what
sits underneath it.

**`Party_Assignment.css` is 186 lines, 25 rules, and every single one is
dead.** Checked class by class against the TSX — `.pa-container`, `.pa-header`,
`.pa-select`, `.pa-dropdown`, `.pa-party-row`, `.pa-btn-primary`, `.pa-empty`,
all of them: zero references. The page styles itself entirely inline. The proof
is that commenting the whole file out moved **not one pixel** of
`party-assignment.png`.

They are worse than unused, because they are exactly the names a conversion of
this page reaches for:

* `.pa-party-row input` is `0,1,1` and would beat any single-class checkbox
  rule written for the picker rows.
* `.pa-party-row:hover` is `0,2,0`, and **Playwright never hovers** — so
  attaching that name would pull in an old hover state that no baseline could
  ever show.
* `.pa-container` sets `padding: 40px; background: #f8fafc; min-height: 100vh`
  for a page that now renders inside `.pa-page app-page` and takes its shell
  from `AppShell.css`. The sheet describes a superseded design, so reviving it
  is not an option either.

So the rules are commented out with that explanation, and the live rules are
new, under names chosen not to collide with any of them. Commented rather than
deleted: they are the only surviving record of what this page looked like
before it drifted inline.

**CSS comments do not nest, and the first attempt at that wrapper was broken.**
The dead block contains its own section headers (`/* ===== BUTTONS ===== */`),
so a single `/* ... */` around it terminated at the first inner `*/` and left
the remainder live. `grep -c '/\*'` showed 18 where there should have been a
handful. The inner delimiters are stripped now and the block closes where it
should. Worth recording because the failure is silent: the file still parses,
just not as intended.

Fourteen objects converted — the first card, which is all `party-assignment.png`
reaches at first paint (`showParties` is false there). The `disabled` branch of
the Upload button (`cursor: isImporting ? "not-allowed" : "pointer"`,
`opacity: isImporting ? 0.75 : 1`) became `.pa-btn-go:disabled`, driven by the
attribute the button already carries rather than a second copy of the same
state in JS.

Thirty-nine remain in this file: the user dropdown, the assigned-parties
section and the second panel, of which the seeded interaction baseline reaches
eighteen.

### Party_Assignment, batch 2 — the remaining 39

The seeded interaction test only proved 20 of those 39: the second panel
(Assign Parties) is what `party-assignment-seeded.png` actually shows when it
takes its screenshot, after the dropdown has already closed and the
Assigned-Parties section has already been replaced. The other 19 — the
user-search dropdown and the Assigned Parties section on the first panel — are
exercised functionally by that same test (it opens the dropdown and clicks a
name, and the assigned-parties view renders in between) but were never in a
screenshot, exactly the gap this project has hit twice before.

So the test gained two more screenshots, captured **before** any conversion:
`party-assignment-dropdown.png` (right after clicking the search box, before a
name is picked) and `party-assignment-assigned.png` (right after picking Ravi
Menon, before "+ Assign New Parties" is clicked). All three baselines —
those two plus the existing seeded one — passed unchanged after converting all
39 objects, which is the pixel-identity proof for the whole file.

**Button classes needed to be self-contained, not shared with `.pa-btn`.**
The temptation was to reuse `.pa-btn`/`.pa-btn-outline` (already live, for
Download Template) on "← Back", "Cancel", "+ Assign New Parties" and "Save
Assignments" — but those four carry a different padding and font-weight
(`8px 16px`/`10px 20px`, weight 500) than `.pa-btn` (`9px 14px`, weight 600),
and Cancel's text color (`#475569`) differs from Back's (`#334155`) even
though the two look almost identical. Forcing them onto `.pa-btn` would have
silently resized and reweighted all four. They got their own classes instead
— `.pa-btn-back`, `.pa-btn-assign`, `.pa-btn-cancel`, `.pa-btn-save` — each
fully self-contained so none of them depend on cascade order against a base
class they don't actually match.

**Several new live names reuse names from the dead block on purpose.**
`.pa-dropdown`, `.pa-dropdown-item`, `.pa-party-row`, `.pa-party-name`,
`.pa-assigned-title`, `.pa-btn-back`, `.pa-btn-cancel` and `.pa-btn-primary`
(as `.pa-btn-assign`'s sibling shape) all appear in the commented-out block at
the top of the file. That is not a collision — a comment has no cascade
weight — and renaming around it would have meant less natural names for no
functional benefit. Noted inline in the CSS so a future reader doesn't read it
as a mistake.

Party_Assignment is done: 53 objects, 0 remaining, all seven verification
gates green (lint, both `tsc -b` targets, 448 unit tests, 50 route baselines,
76 interaction baselines, production build).

### Where 6.3 stands now

**447 → 206 live inline styles**, 46 files. What's left is the long tail with
no shared vocabulary: `SOCard` (19), `Dashboard` and `Distributor/Order_Tracking`
(19-ish each, mostly per-row computed styles — see Dashboard's note above on
convertibility), `Sales_Quotation` (14), and a scatter of one-and two-object
files (`Login`, `AssetActionModal`, `PersonDetailDialog`, the loaders, etc.)
that were always going to be priced individually rather than in bulk.

### SOCard.tsx — dead code, converted anyway

`SOCard.tsx` is not imported anywhere in the codebase. Grepped for `SOCard`
across every `.tsx`/`.ts` file and the only hit is its own `export default`
declaration; grepped for its classes (`si-so-card`, `si-so-head`,
`si-line-row`, `si-line-copy`, `si-item-badge`, `si-so-actions`,
`si-line-list`, `si-line-side`) and every hit is inside this one file too. It
is not rendered by `OrdersStep.tsx`, `DraftStep.tsx`, or anything else in
`SalesInvoice/` — whatever used to mount it is gone, and this component was
left behind.

That makes it the single safest file in the whole phase to convert: since
nothing on screen can ever reflect a change here, there is no visual
regression it is possible to introduce. It was **not** deleted — no removal
was in scope here, per the standing rule on this refactor — but flagging it
for the user: this may be worth an intentional decision (wire it back in, or
remove it) outside the scope of a styling pass.

Its 19 inline styles turned out to be mostly **exact duplicates of the CSS
classes already sitting right next to them** — `si-so-card`, `si-so-head`,
`si-line-list`, `si-line-copy`, `si-line-side`, `.si-so-actions` all already
declared the same `display`/`background`/`color` the inline style repeated,
so most of this was deletion, not promotion. Checked byte-for-byte against
`Sales_Invoice.css` before removing each one. What genuinely needed a home:

* `opacity: usedBy && !selectedCount ? 0.62 : 1` — a real state the CSS didn't
  have. `.is-already-logged` gained `opacity: 0.62`, and a new
  `.has-selected-lines` modifier (added whenever `selectedCount > 0`) resets
  it to `1` when a deliberate selection is made on an already-logged order,
  matching what the ternary did.
* `.si-so-head`, `.si-so-actions span` and `.si-line-row` were each missing
  one or two declarations the inline style carried (`min-height`, `color`,
  `cursor: pointer`, `display: inline-flex`) — added directly to the base
  rule, since every one of these classes is scoped to this single orphaned
  file and cannot affect anything else.
* Found and fixed a **latent bug while doing this**: `.si-line-row.is-disabled`
  declared `opacity: 0.5`, but the inline override on the same element always
  rendered `0.55` — so that class's real value had never once been visible.
  Corrected the class to `0.55` to match what the app actually showed, rather
  than encode a number nobody had ever seen render.
* A `<p>` and its child `<span>`s needed `margin: 0` and `display: inline-flex`
  added to the existing shared selectors (`.si-line-copy div, .si-line-copy p`
  and `.si-item-badge, .si-line-copy p span`) — both selectors already existed
  for exactly these elements, they just hadn't picked up every declaration.

No screenshot exists for this file and none was worth adding — a baseline of
dead code proves nothing except that dead code renders the same dead way
twice. Verified instead by the seven usual gates (lint, both `tsc -b` targets,
448 unit tests, 50 route baselines, 76 interaction baselines, production
build) passing unchanged, since none of them ever executes this component
either.

**A second known flake, unrelated to this change:** `HAIS tabs › the Reports
tab` failed once in the full interactions run and passed clean twice in
isolation immediately after. Nothing in this SOCard batch touches HAIS.
Recorded alongside the earlier `add sales wizard` flake from this phase —
two data points now pointing at something flaky in how the full suite
schedules against the dev server, not in any page under test.

**447 → 187 live inline styles**, 47 files.

### Order_Status_Tracking's billing-only timeline — 15 → 2

`Order_Status_Tracking.tsx`'s "Order Log Timeline" block (mode==="billing"
only) carried 15 of the file's inline styles. Almost all of it turned out to
be a per-log render loop with the same three shapes already solved elsewhere
in this phase: a tone (`approved`/`rejected`/`pending`/`progress`) driving a
dot colour, a boolean (`isLast`) driving a connector line and padding, and
another boolean (`isPending`) driving a card's background. All three became
modifier classes exactly the way `Order_Tracking`'s tone-based dot/card
classes already work — `ot-log-dot--${tone}`, `ot-log-row.is-last`,
`ot-log-card--pending`.

No baseline reached this block at all going in — the existing status-tracking
test only opens `/Auditor_status_tracking`, and this timeline is
billing-only. Added a new test, captured `order-log-timeline.png` **before**
converting anything, then converted and confirmed it unchanged.

**Two objects stay inline, deliberately.** The `isPending && pendingWithName`
branch — "Pending with: `<name>`" — needs a log whose tone is "pending" AND
is the last entry in the list, on an order that carries `rate_approvals`. No
fixture produces that combination (the shared orderlogs fixture always ends
in a rejection), so it cannot be screenshotted. Rather than convert two
objects on faith, they were left inline with a comment pointing at this
paragraph.

**447 → 174 live inline styles.**

### Dashboard — 4 of 14 were genuinely convertible

Went through all 14 by hand rather than trusting the earlier "mostly not
convertible" note at face value. Ten are correctly unconvertible:
- Five (`.db-manager-rank-fill`, three places, plus the two state-item
  panels) mix a continuous computed `width` (`getSalesWidth(...)`, a
  percentage with no fixed set of values) with a `PALETTE[index % 8]`
  background in the SAME object — splitting the color out would not reduce
  the inline-style count (the width half still has to stay), so there's no
  payoff for the extra CSS.
- One (`db-progress-fill`) is a plain continuous `width: ${rate}%` with
  nothing else in it.
- Four (`db-legend-dot`, `Cell`'s `fill`, ×2 each) come from `getStatusColor`,
  which returns a colour based on a status's **position in the live,
  server-fetched `statusItems` array** — not a fixed enum. Two different API
  responses can order statuses differently and hand the same label a
  different colour. Pinning colours to classes would only be correct for
  today's ordering.

Four were not, and are now converted:
- **`.db-party-list-badge`'s `PALETTE[index % 8]`** — unlike the five above,
  this one is ONLY a background with nothing continuous riding along, and
  `.db-party-list-item` is the sole child type its `.map()` produces, so
  `:nth-child(8n+1)` through `(8n+8)` reproduces the exact JS modulo with no
  JS at all.
- **The pie `<Cell>`'s `cursor`/`outline` ternary** — gated by
  `statusClickable`, one boolean for the whole chart (role-derived), not
  per-slice. Recharts' `Cell` extends `SVGProps`, so it takes `className`
  directly; became `.db-pie-cell` / `.db-pie-cell--clickable`.
  `fill={getStatusColor(item)}` stays a prop — that's the genuinely dynamic
  half of the same element.
- **The order-detail backdrop's `zIndex: 1100`** — a fixed constant. This
  modal is hand-rolled rather than the shared `<Dialog>`, and needs to
  out-rank a Radix dialog already open behind it (it can be reached from a
  row inside the status-orders modal); `.db-status-modal-backdrop` already
  had `z-index: 1000`, so `--stacked` is the one override.
- **The wide chart box's `gridColumn`** — `undefined` for admin, `"1 / -1"`
  otherwise. Two fixed states, one boolean check; became
  `.db-chart-box--full-span`.

**None of these four were reachable by any existing baseline.** Checked
before assuming otherwise: `charts.top_parties` and `charts.status_distribution`
both come off `/orders/dashboardW/charts/`, which had a fixture for
`state_item_sales` only (added earlier for StateWise_Report) — so the Top
Parties list and the whole status pie/legend have rendered their EMPTY
states in every Dashboard screenshot this project has ever taken, admin
role included. Fixed at the source: three parties and three statuses added
to that same fixture object, `dashboard.png` regenerated (it moves — the
empty-state text is gone, replaced by real rows), and two new tests added:
one opens the status legend and the order-detail modal it leads to
(covering the badge cycle, the clickable pie cell, AND the stacked backdrop
in one interaction), the other switches to a non-admin role for the
full-span case. `sidebar-bell.png` / `sidebar-notifications.png` were
checked too, since they also load `/Dashboard` first — both are viewport
(not full-page) shots cropped above where the new content sits, so neither
moved.

**447 → 170 live inline styles.**

### The 8-agent batch — HAIS/e-waybill, Order_Tracking, Auditor_Order family, Payments/Approval, Notifications, Scheme_Manager, Tracker_Alerts, Login/App_User

Ran eight agents in parallel, one per CSS-ownership cluster (each cluster's
files share a stylesheet, so no two agents ever touched the same CSS file).
~123 objects converted across 21 files. Centralized verification afterward
(lint, both `tsc -b` targets, 448 unit tests, route + interaction suites)
came back clean — 0 new errors, the same 15 pre-existing `exhaustive-deps`
warnings.

Coverage-checking the batch surfaced one genuine, pre-existing crash, unrelated
to the styling work: opening Payments Dashboard's **Levels** tab threw
`Cannot read properties of undefined (reading 'filter')`. Root cause —
`/approvals/workflows/` (fixtured) has no trailing anchor, so it also matched
`/approvals/workflows/1/preview/` and answered the workflow LIST instead of a
preview object; `PreviewCard` reads `preview.data?.levels.filter(...)`, and an
array has no `.levels`, so `?.` didn't save it. Nobody had ever opened that tab
in a test before. Fixed with a fixture for the `/preview/` endpoint (ordered
above the general pattern) plus one for `/approvals/levels/` — both were
missing, not wrong. Also added:
- `hais-asset-history.png` / `hais-handover-modal.png`: no `/hais/*` endpoint
  had a fixture, so `AssetHistory` (12 converted objects, including a
  `dotColor()`→`dotTone()` rename from raw hex to a fixed-tone modifier class)
  had only ever shown "No history recorded yet." One asset fixture with 4 log
  entries exercises all four tone branches plus the `reason`/`config_change`
  lines, and opens the Handover modal (`AssetActionModal`'s 9 objects) too.
- `approvals-levels.png` / `approvals-approvers.png` / `approvals-masters.png`:
  Levels, Approvers and Masters (which embeds `ConfigTab`) had never been
  opened by any test — only the sibling Workflows/Analytics tabs had coverage.

**447 → 48 live inline styles**, across every file this phase set out to
convert. What remains is `Sales_Quotation.tsx` (14, a dead route deliberately
left unconverted per an earlier note in this same file) and a long tail of
single-digit files carrying genuinely continuous or data-order-dependent
values (progress-bar fills, per-row drag state, colours keyed to a
server-fetched array's position) that this phase has repeatedly established
must stay inline.

---

## 2026-09-02 — closing out every remaining phase

Everything left in this document — 0.4, 0.6, the rest of 3.1, more of 3.2, all
of Phase 4, 5.5, 6.1, 6.5 — was finished in one day under real time pressure.
Ten agents ran in parallel, grouped so no two ever touched the same file: five
independent tracks (0.6, 3.2, 3.1, 6.1, 6.5) plus five page decompositions
(Phase 4), each of which also picked up its own Phase 3.1/5.5/6.1 work where
it applied, because doing that inside the same pass that already had the page
open was cheaper than a separate agent re-reading it later.

Two facts changed the shape of the work before any code moved. First, 0.4 was
already done — a fresh `npx eslint .` came back 0 errors, 15 warnings, same as
the pre-existing set; Phase 6.4/6.6's compiler-backed hook-rule work had
quietly finished it days earlier without this document being updated to say
so. Second, `Add_Sales` — Phase 4's largest and first-listed target at 4,410
lines — no longer existed at that size: Phase 3.4's eight-step rewrite had
already left it as a 184-line entry point over a `salesOrder/` sibling folder.
Phase 4's real remaining scope was five pages, not six, and Phase 0.4 needed
nothing at all.

Centralized verification ran once, after all ten agents finished, rather than
per-agent — `tsc -b`, `eslint`, `vitest`, and the full Playwright suite need a
single shared production build and preview server (port 4173), and ten agents
each trying to build and serve concurrently would have raced each other into
meaningless failures. Individual agents verified with `tsc`/`eslint`/`vitest`
against their own files only. The one centralized run came back clean: 0 type
errors, 0 lint errors (15 pre-existing warnings, three of them now living in
`dashboard/useDashboard.ts` because the code they were attached to moved with
Phase 4, not because they're new), 448/448 unit tests, and 134/134 Playwright
tests — 83 interaction tests, 50 route baselines, and the one new smoke test.

### Phase 4 — the last five page decompositions

`ApprovalManagement`, `Dashboard`, `Product_Stock`, `InvoiceReview` and
`Scheme_Manager` all followed the `Add_Sales.tsx` + `salesOrder/` convention:
the top-level file keeps its exact path and default export — so nothing else,
not `App.tsx`, not a single import — needed to change — and becomes a thin
view-composition file over a new sibling folder (`approvalManagement/`,
`dashboard/`, `productStock/`, `invoiceReview/`, `schemeManager/`) holding a
`useXxx.ts` hook, `components/`, and `types.ts`.

`ApprovalManagement.tsx` (2,411 → 144 lines) was the one with a second job:
it had zero `useQuery`/`useMutation` calls going in, so extracting its data
layer also did Phase 3.1 for it — every read became `useQuery`, all ~20
write handlers (workflow/level/approver/company-mapping/collection-person
save, delete, toggle, reorder) became `useMutation`, mirroring the mutation
pattern already in `Tracker_Invoices.tsx` and the `useQuery` pattern its own
already-converted `ConfigTab.tsx` sibling used. No retry/staleTime overrides
were added — both inherit `src/lib/queryClient.ts`'s shared defaults, per the
rest of Phase 3.1. Virtualization was evaluated and deliberately skipped here:
every table on this page is small by construction (`Company` is a 3-value
union type; workflows, levels and approvers are all short lists) — adding
`@tanstack/react-virtual` would have meant a new dependency and DOM-structure
risk to the `approvals-*.png` baselines for tables that will never need it.

`Dashboard.tsx` (2,158 → 139 lines) moved verbatim — every `db-*` class name
and every deliberately-inline data-driven style from the 2026-09-01 CSS pass
(`getStatusColor`, palette cell fills, progress-bar widths) came across
untouched. `useDashboard.ts` is one mega-hook (`DashboardState = ReturnType
<typeof useDashboard>`), matching the shape `useSalesOrderForm.ts` already
established, plus `constants.ts` (static config), `format.ts` (formatting
helpers) and five presentational components. Virtualization was evaluated and
skipped: `@tanstack/react-virtual` isn't installed anywhere in this repo, and
this document already scopes "virtualise the largest tables" to Phase 5, not
something to bolt onto one page mid-decomposition — Dashboard's lists (top
parties, the status-orders modal, manager/state rankings) stay exactly as
non-virtualized as they were before the split.

`Product_Stock.tsx` (1,928 → 110 lines) is this app's largest table and the
priority virtualization target. Its main table is now virtualized with
`@tanstack/react-virtual` via the padding-row technique inside the existing
`.ps-table-wrap` scroll container — the pre-existing `ITEMS_PER_PAGE=15`
client-side pagination stayed exactly as it was rather than being replaced
with an unpaginated virtualized list, since the task was "the DOM-mounting
strategy changes," not "how paging works changes."

`InvoiceReview.tsx` (1,786 → 127 lines) split the same way; its status-color
logic (`toneForStatus` / `statusTone.ts`) was read but not touched, preserving
the Phase 2.2 "tone is the outcome" rule exactly. Its table used
`useWindowVirtualizer` rather than an internal scrolling container — this page
has never had its own scrollbar, the whole document scrolls, and giving it an
internal `overflow:auto` container to virtualize the usual way would have
been a real, visible change.

`Scheme_Manager.tsx` (1,634 → 158 lines) also used `useWindowVirtualizer`,
for the same reason. One thing to watch here specifically: `.sch-item`'s row
dividers came from a CSS adjacent-sibling selector (`.sch-item + .sch-item`),
which row virtualization can defeat at the top edge of the rendered range —
it was replaced with a per-row inline `borderTop` computed from list index
rather than DOM adjacency. Verified pixel-identical against
`e2e/routes.visual.spec.ts`'s `scheme-manager` baseline and the existing
"Scheme_Manager lists the schemes it fetched" interaction test, both green,
but it's the one piece of this batch built on a technique the `InvoiceTable`/
`ProductStock` precedents didn't need — worth an extra look if a future CSS
change to that page ever touches row borders.

Three shared-file collision risks surfaced from having three of these five
agents add `@tanstack/react-virtual` concurrently: `package.json` and
`package-lock.json` are the same two files for all five agents. Each install
only *added* a line; nothing was removed or downgraded, and the centralized
`npm install` afterward reconciled the lockfile cleanly with no conflicts —
but it's a real collision surface inherent to running decomposition agents
in parallel that add dependencies, not something this batch could have
avoided while still doing the work concurrently.

### Phase 3.1 continued — the two pages the original map missed

A sweep of every file under `src/pages/` for the hand-rolled-fetch signature
(a mount `useEffect` calling `axios`/`apiFetch`/a `*Service`, with no
`useQuery`/`useMutation` in the file) turned up two pages absent from every
earlier Phase 3.1 batch list: `Label_Checker.tsx` and `Nutrition_Manager.tsx`
— the same kind of gap the map had already shown once before, for
`Product_Stock`/`Dashboard`.

`Label_Checker.tsx` (779 → 782 lines): the mount fetch of the reference item
list became `useQuery`. Converting it exposed two `react-hooks/set-state-in-
effect` violations that the unconverted mount fetch had been hiding (the same
"unanalysable component" shape this document already describes for `Status.tsx`
in Batch 1) — both fixed with the established `seededFrom`-style render-time
identity guard (a `useState` comparison, not a `ref` — a ref-based attempt was
tried first and rejected by `react-hooks/refs`).

`Nutrition_Manager.tsx` (889 → 918 lines): a full CRUD master/detail page that
had zero TanStack Query anywhere. Two mount/selection effects became two
`useQuery` calls (one `enabled`-gated on a selection, using `isFetching`
rather than `isPending` specifically to avoid the "a disabled v5 query reports
`isPending: true` forever" trap this document already documents elsewhere);
all nine write handlers now patch the query cache via `queryClient.setQueryData`
instead of local `setItems`/`setUoms`/`setRows` splices. One deliberate,
documented behavior change: load failures now render as a persistent,
non-dismissable banner (via `isError`), where a write failure keeps the old
dismissable one — previously a single dismissable string covered both. This
mirrors the established precedent elsewhere in this refactor (`Combo_Mapping`'s
non-dismissable `loadError` vs. dismissable `notice`), so it was treated as
"following convention," not a regression — flagged here in case a reviewer
wants the old always-dismissable banner back.

What's still hand-fetched, and why it's staying that way: `Order_Tracking.tsx`
(top-level)'s click-triggered order-details-and-logs fetch inside `handleTrack`
carries the same `location.state`-driven shape this document already flags as
a latent-risk conversion for the `*_Order` mutation pages — treated as its own
future batch, not a today drive-by. `einvoice/GenerateIrn.tsx` was already an
explicit prior "deliberately not converted" (a failed response body is data
the page renders, not an error a query layer should reduce to a string).
`SalesInvoice/ContentsTab.tsx`'s allocation loop is a documented
fetch-then-write-back shape that would infinite-loop as a `useQuery`.

### Phase 3.2 continued — one more replacement, and the honest remaining gap

`npm run types:api` was re-run against the live backend schema (unchanged
since 2026-08-29: 281 paths, 65 component schemas, 1,119 endpoints still
untyped because they're hand-rolled Django views rather than
`serializer_class`-backed ones). One more hand-written type was replaced with
a schema-derived one — `CollectionPerson` in `src/services/approvalService.ts`
is now `Required<Pick<Schemas["CollectionPerson"], ...>>` rather than a
duplicated interface, so a backend field rename now fails this line at compile
time instead of drifting silently.

Every other candidate in the covered domains was left hand-written, for
reasons specific to each: `sapService.ts`'s `Product`/`Party`/`Address`/
`Branch`/`Log` are deliberately hybrid (SAP-master fields plus HANA-stock-
report-only fields the generated schema doesn't have, and `Product_Stock.tsx`
reads them directly). `approvalService.ts`'s `ApprovalWorkflow`/
`ApprovalLevel`/`LevelApprover` are near-matches, but the server marks several
fields optional that every call site in `ApprovalManagement.tsx` assumes are
required — widening them would need editing that file too. `haisService.ts`'s
`Asset` is a genuine translation layer (id/FK shape on the wire, name/array
shape in the app), not a duplicate. Closing the 1,119-endpoint gap needs
`@extend_schema` annotations on the backend's hand-rolled views — that's
backend work, and out of scope here; this document's honest assessment from
2026-08-27 (see "3.2 — generated types, and the honest size of them" above)
still holds.

**Later the same day, 131 of those operations were closed: 1,119 → 988.**
The backend gained `@extend_schema` on 27 views, chosen by tracing which
endpoints this frontend actually calls rather than by working down the list —
`ProfileView` and `LoginView` (every page load and the session gate),
`OrdersByUserView` / `OrderDetailsByOrderView` / `OrderListView` (the three
behind `useCurrentUserOrders`, `useOrderDetailsFetcher` and `useOrderQueue`,
feeding a dozen screens between them), `UpdateOrderStatusView` (every approve
and reject in the app), the tracker's `MyQueueView` / `LookupsView` /
`InvoiceDetailView`, and the order-entry cascade `PartyProductsView` /
`PartyView`. 27 views closed 131 operations because Phase 6.2 mounts every
route at both `/api/` and `/api/v1/`, and several views carry more than one
method.

`npm run types:api` was re-run against the new schema and **`tsc -b` stayed
clean** — which is the result that matters: the newly-generated real types
agreed with every hand-written interface already in the tree, and
`conformance.ts` (which fails the build if the server can send something the
client's type forbids) still compiles. Had any declaration been wrong, this is
where it would have surfaced.

Two traps were found and avoided on the backend side, both of which would have
produced *confidently wrong* types — worse than the `unknown` they replaced,
because the compiler would then have enforced a lie:

* **Component-name collisions.** `orders` and `sap_sync` each define a
  `ProductSerializer`, a `PartyAddressSerializer` and a `BranchSerializer`, on
  different models with different fields. `drf-spectacular` names a component
  after the serializer *class*, so the first pass silently overwrote
  `sap_sync`'s — `Branch` went from its 7 fields to `orders`' 3 — which would
  have handed this frontend a wrong type for the SAP master-data endpoints.
* **`SerializerMethodField` silently defaults to `string`.** Unhinted method
  fields were about to be published as `string` when they are booleans and
  numbers: `is_overdue`, `editable`, `is_partially_paid`, `days_at_stage`, and
  nine fields on `UserSerializer` including `roles` (an array) and `company`
  (an object or null).

The remaining 988 are still the long tail, and still not worth closing
wholesale — the value was never coverage, it was that a rename on a
high-traffic endpoint now breaks the build instead of production. Do the rest
opportunistically, as those views are touched.

### Phase 5.5 — virtualization, folded into Phase 4

Product_Stock, InvoiceReview and Scheme_Manager's main lists are now
virtualized (see "Phase 4" above for each). ApprovalManagement and Dashboard's
tables were evaluated and correctly judged too small to need it. No other page
in the app was audited for this — Phase 5.5's original scope ("the largest
tables") is exactly the Phase 4 set, since those were already identified as
this app's biggest files, and in practice its biggest tables too.

### Phase 6.1 — accessibility, scoped to where users actually are

A custom scan (icon-only buttons with no accessible name, unlabeled inputs/
selects, missing `alt`, unlabeled checkboxes, custom-dropdown `role`/
`aria-expanded` gaps, CSS focus-outline suppression) ran across `src/pages/`
and `src/components/`, excluding the five Phase 4 pages (which got their own
pass as part of their decomposition). 42 files were fixed — icon-button
`aria-label`s, `htmlFor`/`id` pairing on form inputs, the one real missing
`alt` (`HAIS/AssetQr.tsx`'s print-window QR image), `aria-haspopup`/
`aria-expanded`/`role="listbox"` on custom dropdowns.

This was prioritized, not exhaustive: order entry, tracker, invoice and
approval pages went first, since that's where users actually spend time.
Left for a follow-up pass, by name: `Combo_Mapping.tsx`, `Nutrition_Manager.tsx`
(dropdown menus only — its icon buttons were already fine), `FOC.tsx`,
`Drafts.tsx`, `UI_Labels.tsx` (checkbox/select labels), `Staff.tsx` (13 flagged
items — per-row rate/type/item dropdowns, Total/Tax/Grand Total display
fields), and `Order_Status_Tracking.tsx`'s already-dead, commented-out status
`<select>`. A mechanical codemod pass produced two duplicate `aria-label`
attributes (`Device_Management.tsx`, `Payments/CollectionTable.tsx`) — caught
by `tsc -b` before the pass finished and fixed directly.

### Phase 6.5 — Storybook, for the primitive set Phase 2 built

Storybook 10.5.10 (Vite builder) is installed via `.storybook/main.ts` +
`preview.tsx`; `preview.tsx` imports `src/styles/tailwind.css` then
`src/index.css` in the same order `src/main.tsx` does, so stories render in
the app's real design tokens rather than shadcn defaults. One `.stories.tsx`
per Phase 2 primitive — Badge, Dialog, Pagination, Skeleton, Table, Tabs,
Toast — colocated next to each component, with real OMS domain content (sales
orders, invoices, party names) run through the actual `toneForStatus()`
rather than placeholder text. There is no separate `AlertDialog` component in
this repo, only `dialog.tsx`'s `panel`/`bare` variant split, which the Dialog
story covers instead of inventing one. This covers the Phase 2 primitive set
specifically, not every component in `src/components/`.

One environment note for whoever runs `build-storybook` in CI: Storybook's
Vite builder deliberately extends the sibling `vite.config.ts`, which has a
hard `throw` if `VITE_BUILD_NUMBER` is unset. It happened to succeed here only
because that variable was already set in the environment — a CI job invoking
`build-storybook` needs it set too, or it will fail on that unrelated line.
