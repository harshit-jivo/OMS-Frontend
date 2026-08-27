# OMS-Frontend architecture

How the app is put together — the part the file listing and the inventory
tables cannot tell you. Structural claims are grounded in
[`INVENTORY.md`](INVENTORY.md), [`PAGES.md`](PAGES.md) and
[`DUPLICATION.md`](DUPLICATION.md), which are generated from source.

**102,738 lines · 100 pages · 18 components · 18 services · 54 stylesheets.**

---

## 1. The shape

```
main.tsx
  └── App.tsx  ── 59 <Route> declarations, all eagerly imported
        │
        ├── <Sidebar>            ← wraps almost every route; owns nav + access UI
        │     └── page component ← 100 of them, 53,392 lines
        │
        └── services/*.ts        ← 18 modules, 220 call sites
              └── services/api.ts ← one axios instance, interceptors, refresh
                    └── OMS-Backend  (also serves OMS-app, React Native)
```

There is no state layer, no data-fetching layer, and no component library. A
page is: `useState` for everything, `useEffect` to fetch on mount, a service
call, and hand-written JSX plus a matching stylesheet.

**Everything is eagerly imported.** All 59 routes are static imports in
`App.tsx`, so the first paint downloads every page, `exceljs`, `recharts`,
`html5-qrcode` and the QR generator — a 2.71 MB bundle to reach the login form.

---

## 2. Three layers, one of them missing

| layer | exists? | where |
|---|---|---|
| Transport | **yes, good** | `services/api.ts` — one axios instance, interceptors, refresh |
| Domain services | **yes** | 18 modules, 220 calls; only 21 calls escape to pages |
| **Client state** | **no** | `useState` per page + `localStorage` in 20 files |
| Presentation | partial | 18 components for 100 pages |

The missing state layer is what produces the rest of the symptoms. With no
cache, every page refetches on mount and every screen writes its own
`loading` / `error` / `refetch` logic. With no shared session object, 20 files
read `localStorage` keys by string.

### 2.1 `services/api.ts` is the best code in the repo

Worth preserving exactly:

- **One axios instance**, so headers and interceptors are defined once.
- **Auth paths are excluded from retry/refresh** — `/auth/login/`,
  `/auth/refresh/`, `/auth/logout/`. Retrying a failed login is a lockout.
- **Inversion of control for device headers.** `webDeviceService` registers a
  header provider; `api.ts` never imports it. That is deliberate — the reverse
  import is a cycle, since the device service uses `api` to POST.
- **`device_id` is deliberately excluded from the logout clear-down.** One
  browser must keep one device id across logins, or every logout mints a
  phantom device row on the backend.

---

## 3. Access control — three systems that must agree

This is the most intricate part of the frontend, and the easiest to break.

```
                    ┌─────────────────────────────┐
   role ───────────▶│ config/pageAccess.ts        │  TRACKER pages
                    │  TRACKER_ROLE_PAGES         │  role-driven
                    │  mirrors backend            │
                    │  tracker/permissions.py     │
                    └─────────────────────────────┘

                    ┌─────────────────────────────┐
   extra_pages ────▶│ config/adminPages.ts        │  ADMIN pages
   (localStorage)   │  GRANTABLE_ADMIN_PAGES      │  per-user grant
                    └─────────────────────────────┘
                                  │
                    ┌─────────────┴───────────────┐
                    ▼                             ▼
            Sidebar `canSee`              RequirePermission
            (hides links)                 (redirects)
```

Two independent models — role-driven for tracker, per-user grants for admin
pages — feeding two independent enforcers.

`pageAccess.ts` says it plainly, and it is right:

> Centralized Document-Tracker page access — **MUST mirror the backend rule in
> `OMS-Backend/tracker/permissions.py`**. To change who sees what, change a
> user's role — never page code.

That mirroring is real: `TRACKER_ROLE_PAGES` is the same shape as the backend's
`ROLE_PAGE_MAP`, with the same four sub-roles and the same admin-only pages.

### 3.1 But almost nothing is guarded

**Of 59 routes, exactly one uses a real permission check** —
`RequirePermission permission="Payments_Dashboard"`.

Every other route, including `/Tracker_Admin` (tracker configuration) and
`/App_User` (user management), renders for anyone who types the URL. The
sidebar hides the link; that is all.

`RequirePermission`'s own docstring anticipates this and is honest about it:

> The sidebar already hides links a user cannot use, but hiding a link is not
> access control — typing the URL would otherwise render the page. This is the
> client-side half of the check. **It is NOT the security boundary.**

So the consequence splits cleanly in two:

| pages | backend state | result of typing the URL |
|---|---|---|
| Tracker, payments, approvals, devices | **locked** (0 open routes) | Page renders, API calls 401/403 — a UX failure, not a breach |
| Orders, schemes, users, hana, sap_sync | **149 open endpoints** | Page renders **and works** |

The second row is a real exposure, and **it is a backend fix**. Adding client
guards would not close it — anyone can call the API directly.

### 3.2 "Admin" is defined in three places

`RequirePermission` (`role === 'admin'`), the sidebar's `canSee`, and the
backend's `granted_keys()`. The component's docstring flags this as
"three places that must agree on what admin means". Any refactor of roles has
to change all three together.

---

## 4. Styling

54 stylesheets, 35,067 lines, one per page by naming convention
(`Foo.tsx` ↔ `styles/Foo.css`), imported directly by the page.

**Nothing is scoped.** These are global classes kept apart by prefix
convention alone — `invr-`, `sl-`, `sch-`, `sib-`. There is no CSS-modules, no
styled-components, no build-time scoping. A duplicated class name in two
stylesheets silently overrides depending on import order.

**88 declaration blocks are byte-identical across 3+ stylesheets** — the design
tokens nobody extracted. Those blocks are the Tailwind theme, already written.

Plus **815 inline `style={{…}}`**, which no stylesheet can override and no
theme can reach.

---

## 5. The duplication, and why it happened

**100 pages, 18 components.** Measured hand-rolling:

| primitive | pages | already in `components/`? |
|---|---:|---|
| Data table | 50 | yes |
| Status badge | 37 | **yes — `StatusBadge` exists** |
| Modal / dialog | 36 | yes |
| Loading spinner | 27 | no |
| Pagination | 23 | no |

The `StatusBadge` case is the diagnostic one: the shared component exists, and
37 pages still built their own. The cause is not ignorance — it is that
reaching for the shared component was never easier than writing 20 lines of
JSX and a CSS block. **A component library only fixes this if adopting it is
cheaper than not adopting it**, which is the argument for shadcn (copy-in
components you own and can adapt) over a dependency you must fight.

---

## 6. Page structure — one page already shows the target

99 pages are a single `.tsx` file plus a stylesheet. One is not:

```
src/pages/SalesInvoice/
  index.tsx            2,099   view composition
  useSalesInvoice.ts   1,320   state + effects, extracted
  ContentsTab.tsx
  DraftStep.tsx
  OrdersStep.tsx
  SOCard.tsx
  salesInvoice.utils.ts
```

Logic separated from view, page-specific components co-located. **That is the
Phase 4 pattern and it already exists in-tree** — the same situation as
`payments` on the backend, where the target architecture is present and simply
was not applied elsewhere.

The contrast: `Add_Sales.tsx` is **4,410 lines with 41 `useState` calls** in one
component, plus 2,636 lines of its own CSS.

---

## 7. Cross-repo contract

The frontend is one of **three** clients of OMS-Backend:

```
OMS-Frontend  (this repo, React)
OMS-app       (React Native — separate repo, NOT in this workspace)
```

`devices/version_policy.py` on the backend returns **HTTP 426** to out-of-date
mobile builds, keyed off an `X-Platform` header — which exists because old app
builds stay in the field and cannot be updated in lockstep.

**Consequence for this refactor:** frontend changes are safe, but anything that
requires a backend response-shape change is not, because a client nobody here
can inspect consumes the same endpoints. Coordinate with the backend plan's
Phase 6 (API versioning).

---

## 8. What this means for the refactor

1. **The missing state layer causes most of the symptoms.** Adding TanStack
   Query removes per-page loading/error/refetch code across 100 pages. It is
   higher leverage than it looks.
2. **Tailwind's preflight is the one genuinely dangerous step.** It resets
   `button`, `table`, `h1`, `ul`, and 35,067 lines of CSS assume browser
   defaults. Disable or scope it, enable per page.
3. **Migrate primitives by count, not by interest.** Table (50) before Tabs (3).
4. **Delete CSS as components land.** 35,067 → under 5,000 is the honest
   progress metric.
5. **Do not decompose pages before Phase 2.** Splitting a page still full of
   bespoke tables and modals moves that code twice.
6. **Code-splitting is independent.** `React.lazy` per route plus dynamic
   `exceljs` is the largest single user-visible win and blocks on nothing.
7. **Access control is a backend problem.** Do not spend frontend effort
   "fixing" it beyond adding guards for honest UX.
