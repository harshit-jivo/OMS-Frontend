# `Add_Sales.tsx` — deep read

**4,410 lines · one component · 41 `useState` · 10 `useEffect` · 0 `useMemo` ·
0 `useCallback` · 2,636 lines of its own CSS.**

The frontend's counterpart to the backend's `orders/views.py`: the biggest
single file, the one holding the most business behaviour, and the one that will
dominate the refactor. This is the record of reading it.

Line numbers are against the file as of 2026-08-26 (post-merge, `test` branch).

---

## 1. Shape

```
   1 –  160   types, constants, pure helpers          (good — extractable today)
 161 – 3363   the component body                      ~3,200 lines
 3364 – 4410   one JSX return                         ~1,046 lines
```

Everything from line 161 down is inside a single
`export default function Add_Sales({ focMode = false })`.

### 1.1 State

41 `useState` calls, plus 6 `useRef`. Grouped by what they actually are:

| group | count | examples |
|---|---:|---|
| Server data | 8 | `parties`, `branch`, `billAddress`, `shipAddress`, `products`, `company`, `partyProducts`, `schemeOptions` |
| UI open/closed | 8 | `partyDropdownOpen`, `billDropdownOpen`, `shipDropdownOpen`, `companyDropdownOpen`, `dispatchDropdownOpen`, `openRowDropdown`, `dispatchInfoOpen`, `isPickingItem` |
| Search text | 4 | `partySearch`, `billSearch`, `shipSearch`, `itemSearch` |
| Save/submit | 6 | `isSaving`, `isSavingDraft`, `showSaveConfirm`, `saveSuccess`, `lastSaveWasDraft`, `isLoadingEditOrder` |
| Edit-mode | 4 | `editOrderFallback`, `editOrderIsFoc`, `editOrderIsDraft`, `userDefaultCategory` |
| Item modal | 3 | `itemModalIndex`, `itemModalSnapshot`, `itemModalIsNew` |
| The form itself | 2 | `formData` (10 fields), `rows` (the order lines) |
| Scheme engine | 2 | `schemeProposals`, `schemeOptions` |
| Misc | 4 | `currentStep`, `stateCode`, `category`, `selectedPartyCategory` |

**8 of these are server cache** and would disappear entirely under TanStack
Query. **12 more are dropdown open/search state** that shadcn's `Select` /
`Command` owns internally. So roughly half the state in this component is not
domain state at all — it is missing infrastructure.

### 1.2 No memoisation anywhere

Zero `useMemo`, zero `useCallback`, in a 4,410-line component holding a product
catalogue, a party list and an editable line-item grid. Every keystroke in any
of the four search boxes re-runs every derived computation and re-renders the
entire tree, including every order row.

This is the single largest render-performance problem in the app, and it is
invisible in the bundle numbers.

---

## 2. Five modes in one component

The same file serves five distinct screens, selected by `location.state`:

```ts
const mode = locationState?.mode ?? (editOrderId ? "edit" : "create");
const isEditMode      = mode === "edit"      && editOrderId !== null;
const isDuplicateMode = mode === "duplicate" && editOrderId !== null;
const isLoadingFromOrder = isEditMode || isDuplicateMode;
const isFocMode = focMode && !isLoadingFromOrder;
const useWizard = mode === "create" && !isLoadingFromOrder;
```

| mode | behaviour |
|---|---|
| Create | 4-step wizard |
| Create (FOC) | same wizard, price forced to 0, no scheme panel |
| Edit | single-page form, PO gated by `allowPoNumber` |
| Duplicate | loads an order, creates a new one |
| Wizard vs single-page | two different layouts from the same JSX |

**62 references to these mode flags** are interleaved through the body and the
JSX. Any change to one mode risks all five, and there are no tests.

`focMode` arrives as a **prop**, while the other modes arrive through
**router state** — two different mechanisms selecting between variants of the
same screen.

---

## 3. Six hand-rolled dropdowns

```ts
const partyDropdownRef    = useRef<HTMLDivElement>(null);
const dispatchDropdownRef = useRef<HTMLDivElement>(null);
const dispatchInfoRef     = useRef<HTMLDivElement>(null);
const billDropdownRef     = useRef<HTMLDivElement>(null);
const shipDropdownRef     = useRef<HTMLDivElement>(null);
const companyDropdownRef  = useRef<HTMLDivElement>(null);
```

Each pairs a `ref` with an `…DropdownOpen` boolean and a click-outside handler —
**69 references** to that pattern in this file alone. None of them get keyboard
navigation, type-ahead, focus return, or Escape handling, because those have to
be written by hand and were not.

`Select` / `Combobox` from shadcn (Radix underneath) replaces all six and brings
the keyboard and ARIA behaviour with it. **This is the clearest single payback
in the file.**

---

## 4. Data fetching

```ts
useEffect(() => {
  fetchPartyName();
  fetchBranch();
  fetchProducts();
  fetchCompany();
  fetchCurrentUserProfile();
}, []);
```

Five parallel fetches on mount, each an `async` function declared **below** the
`useEffect` that calls them (lines 287–472). It works — the effect runs after
render, so the `const` bindings are initialised — but it reads as a
temporal-dead-zone bug and invites one.

Each has its own ad-hoc `try/catch` and its own loading flag, or none. There is
no cache, so navigating away and back refetches the entire product catalogue.

**`fetchProducts` is 270 lines** (472–742). `fetchSchemesForRow` is another
163 (742–905).

---

## 5. Typing

Only 6 explicit `any` in the file — but they are on the load-bearing state:

```ts
const [parties, setParties]         = useState<any[]>([]);
const [branch, setBranch]           = useState<any[]>([]);
const [billAddress, setBillAddress] = useState<any[]>([]);
const [shipAddress, setShipAddress] = useState<any[]>([]);
const [company, setCompany]         = useState<any[]>([]);
const getUserCategoryText = (user: any) => …
```

Every server payload this screen consumes is untyped. `SalesRow`,
`SalesRowScheme` and `RowDropdownOption` *are* properly typed — so the
discipline exists; it just stops at the API boundary. Backend Phase 0.6
(`drf-spectacular` schema) plus generated types closes this exactly.

---

## 6. What is genuinely good here

The refactor must preserve these:

- **Scheme v2 integration is correct.** `schemeProposals` is documented as
  *"resolved from the party's targeting (vendor / state / main group), **not
  chosen by the user**"* — matching the backend's rule that the engine, not the
  client, is the authority on giveaways.
- **`formData.warehouse` defaults to `GP-FGM`** and is submitted as
  `warehouse_code`. This field was **silently deleted by the branch merge** and
  restored — see [`../BRANCH_MERGE_2026-08-26.md`](../BRANCH_MERGE_2026-08-26.md) §F4.
- **PO-number gating is deliberate and subtle.** `canEditPoNumber` is admin-
  configurable via `useFieldConfig`, but in *edit* mode the original
  `allowPoNumber` guard is preserved, *"so editing an existing order doesn't
  newly expose PO where it wasn't intended."*
- **UI labels are runtime config** (`useUILabels`, `useFieldConfig`) — label
  changes are a data edit on the backend's `uilabels` app, not a deploy.
- **The 160-line header is clean**: `SalesRow`, `createEmptyRow`,
  `applyFocPricingToRow`, `computeLandingPrice`, `stripCardCode`,
  `formatDateInput`, `getDefaultDeliveryDate`. Pure, typed, and extractable
  today with no behaviour change.

---

## 7. Refactor sequence

Ordered so each step ships independently. This file should be **the last page
decomposed, not the first** — every phase below is cheaper once the shared
primitives exist.

| # | change | prerequisite |
|---|---|---|
| 1 | Characterisation tests: create, edit, duplicate, FOC, draft-save, scheme proposal accept | Phase 0 |
| 2 | Extract lines 1–160 into `Add_Sales/types.ts` + `utils.ts` | 1 |
| 3 | Replace the 6 dropdowns with shadcn `Select` / `Combobox` — removes ~69 refs and 12 state vars | Phase 2 |
| 4 | Replace the item modal and confirm dialogs with `Dialog` / `AlertDialog` | Phase 2 |
| 5 | Move the 8 server-data states to TanStack Query — removes the 5-fetch `useEffect` and its error handling | Phase 3 |
| 6 | Generate API types; delete the 6 `any` | Backend 0.6 |
| 7 | `useAddSales.ts` hook — state + effects out of the view, following `SalesInvoice/` | 2–6 |
| 8 | Split the 5 modes: `AddSalesCreate` (wizard) / `AddSalesEdit` (form), sharing the hook | 7 |
| 9 | Add `useMemo` / `useCallback` to the surviving derived values | 7 |
| 10 | Delete `Add_Sales.css` as Tailwind replaces it (2,636 lines) | Phase 2 |

**Steps 3–5 remove roughly half the state without touching business logic** —
they are deletions of infrastructure this file should never have contained.
Only after that does splitting the modes (step 8) become a small change rather
than a rewrite.

### Why not decompose first

Splitting the five modes now means copying six hand-rolled dropdowns, the
bespoke modal and the five ad-hoc fetches into each half — moving that code
once to split it, and again to delete it. The backend has the same rule for
`orders/views.py`: fix status identity before splitting the file.

---

## 8. Coverage note

Read in full: lines 1–300 (types, helpers, all state, the mount effect) and the
declaration index for the whole file. Sampled: `fetchProducts` (472–742),
`fetchSchemesForRow` (742–905), `submitOrder` (905–1055), and the JSX entry
points at 2561 / 3263 / 3364.

Not read line by line: the ~1,046-line JSX return (3364–4410) and the row-
editing handlers (1461–1720). Those hold layout and field-mapping detail rather
than new architectural facts, but they are where the mode-conditional branching
concentrates — expect surprises there during step 8, and write the
characterisation tests in step 1 against the rendered output, not the internals.
