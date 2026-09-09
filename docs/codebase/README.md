# OMS-Frontend codebase reference

Reference material for the refactor. **Generated from source**, so it does not
rot the way prose does.

Written 2026-08-26. Companion to
[`OMS-Backend/docs/codebase/`](../../../OMS-Backend/docs/codebase/README.md).

## The files

**Start with [`ARCHITECTURE.md`](ARCHITECTURE.md)** — it explains how the app
fits together. The rest are lookup tables you consult from it.

| file | what it is | how it was made |
|---|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | **How the app works**: the three layers and the missing one, the three access-control systems, styling, the duplication cause, the cross-repo contract | Written from the reads + the generated files |
| [`PAGES.md`](PAGES.md) | **Every page**: its route, guard, services, reachable endpoints, stylesheet, size. 100 pages, 52 routed, **48 routed with no client guard** | Generated |
| [`INVENTORY.md`](INVENTORY.md) | **59 routes**, **220 API call sites**, per-page weight: TSX/CSS lines, inline styles, `any`, hooks | Generated |
| [`DUPLICATION.md`](DUPLICATION.md) | Hand-rolled primitives per page (50 tables, 37 badges, 36 modals…) and **88 CSS blocks duplicated across 3+ files** | Generated |
| [`INVARIANTS.md`](INVARIANTS.md) | **225 rules** the code states about itself, with `file:line`. The frontend has zero tests, so these are enforced by nothing | Mined from comments |
| [`ADD_SALES.md`](ADD_SALES.md) | **Deep read of `Add_Sales.tsx`** (4,410 lines, 41 `useState`, 5 modes in one component) and its 10-step refactor sequence | Read directly |
| [`../CODEBASE_AND_REFACTOR_PLAN.md`](../CODEBASE_AND_REFACTOR_PLAN.md) | Assessment and the 7-phase plan | Written from the above |

## Regenerating

```bash
python fe_inventory.py   > docs/codebase/INVENTORY.md
python fe_pages.py       > docs/codebase/PAGES.md
python fe_duplication.py > docs/codebase/DUPLICATION.md
python fe_invariants.py  > docs/codebase/INVARIANTS.md
```

Scripts are in the session scratchpad; move them to `scripts/` in Phase 0 so CI
can rebuild them. On Windows set `PYTHONIOENCODING=utf-8`.

`ARCHITECTURE.md` and `ADD_SALES.md` are written by hand; they cite the
generated files, so where a regenerated file contradicts them, it is right.

All generators are regex/structure based rather than AST based. Good enough for an
inventory, and they cannot break the build — but counts are indicative, not
exact. Where a number drives a decision, spot-check it.

## How to use this during the refactor

**Before adding a component** — check `DUPLICATION.md`. The thing you are about
to build probably exists 30 times already, and a shadcn primitive replaces it.

**Before changing a service call** — check `INVENTORY.md`'s API table against
[`OMS-Backend/docs/codebase/API_SURFACE.md`](../../../OMS-Backend/docs/codebase/API_SURFACE.md).
That is the contract between the two repos, and a third client
(`OMS-app`, React Native) consumes the same API without being in this workspace.

**Before deleting CSS** — confirm nothing else imports it. Stylesheets are
global and shared by naming convention only; there is no module scoping.

**Track progress in CSS lines removed.** 35,067 today. Phase 2 should take it
below 5,000. It is the most honest single measure of whether the component
migration is real.

## What is not here

- **Not every one of the 102,738 lines was read.** Structure, routing, the API
  surface, styling and duplication are measured and complete. Page business
  logic is not catalogued.
- **No runtime profiling.** Bundle sizes are from the real build; render
  performance was not measured.
- **`OMS-app` not examined** — separate repo, not in this workspace.
