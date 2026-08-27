# Encoded invariants, mined from the source

The frontend has **zero tests**. Every rule below is therefore enforced
by nothing at all -- not a test, not a type, not a lint rule. They hold
only because the last person to touch the file had read them.

These are the constraints a refactor breaks silently: nothing fails, the
behaviour just goes quietly wrong.

Extracted mechanically and **recall-oriented** -- some entries are
ordinary prose that matched. Read, do not trust blindly. Each carries
`file:line` so it can be checked.


## `src/components` — 21 statements


### `src/components/ErrorBoundary.tsx`

- `src/components/ErrorBoundary.tsx:13` — This catches such errors and shows a recoverable message instead, so one broken page never takes down the whole app.

### `src/components/MissionControlLoader.tsx`

- `src/components/MissionControlLoader.tsx:18` — The user never sees sessions, drafts, payloads, endpoints or JSON — only a reassuring "production line" while we work, a clear success, or a translated, actionable error.
- `src/components/MissionControlLoader.tsx:18` — ────────────────────────────────────────────────────────────────────────── Invoice processing modal A calm, human-friendly window over the (otherwise very technical) job of posting an invoice to SAP.
- `src/components/MissionControlLoader.tsx:28` — Reassurance copy for the processing state. These deliberately do NOT map to the real backend steps — they simply rotate to show that work is happening.
- `src/components/MissionControlLoader.tsx:79` — Move focus to the primary action when the run settles, and let Esc dismiss a settled modal (never while a live financial transaction is in flight).
- `src/components/MissionControlLoader.tsx:128` — RunningStage mounts fresh on every run, so its animation always starts from the beginning without resetting state inside an effect.

### `src/components/NicUI.tsx`

- `src/components/NicUI.tsx:54` — Always include the current value so the select never shows a blank option.

### `src/components/NotificationPermissionModal.tsx`

- `src/components/NotificationPermissionModal.tsx:1` — The OS prompt (`Notification.requestPermission()`) only fires from the "Allow Notifications" button — never automatically, never via alert/confirm.

### `src/components/RequirePermission.tsx`

- `src/components/RequirePermission.tsx:4` — The sidebar already hides links a user cannot use, but hiding a link is not access control — typing the URL would otherwise render the page.

### `src/components/Sidebar.tsx`

- `src/components/Sidebar.tsx:81` — Only camelCase was ever listened for, so those pages' refreshes were silently lost.
- `src/components/Sidebar.tsx:168` — Latest order-navigation fn, so long-lived bus handlers always route with the current role without needing to re-subscribe.
- `src/components/Sidebar.tsx:331` — An authenticated session is active on this page load (fresh login or a restored session). Register/refresh this browser in the background — a no-op if it already succeeded, so route changes don't re-POST.
- `src/components/Sidebar.tsx:381` — Both spellings are honoured deliberately. Order pages dispatch the hyphenated name (Auditor_Order, Billing_Order, Rate_Approver_Order) while ordersService dispatches the camelCase one; only the latter was listened for, so those pages' badge refreshes silently did nothing. Listening for both fixes them without editing every dispatcher, and keeps working if a future page picks either spelling.
- `src/components/Sidebar.tsx:396` — Already granted (incl. existing users): subscribe silently and record it so our modal is never shown.
- `src/components/Sidebar.tsx:441` — Show OUR modal as soon as the app is actually loaded — no arbitrary wait. Only when appropriate: never asked, or 7 days since last dismissal. Already-granted and denied users are skipped by shouldShowPrompt().
- `src/components/Sidebar.tsx:452` — Wait for "app is interactive", not a fixed timer: the role is resolved by now (this effect depends on it), so we only need to clear the first paint so the modal never lands on the splash screen. A double rAF fires right after the browser has committed that paint — typically a few ms, versus the 3s hardcoded delay this replaces.
- `src/components/Sidebar.tsx:467` — "Allow Notifications" → request the OS permission, then subscribe. Persists the outcome so we never prompt again once granted, and back off if denied.
- `src/components/Sidebar.tsx:527` — NOTE: `device_id` / `device_last_sync` are deliberately ABSENT from this list and must stay that way — one browser keeps ONE device id across logins. Clearing it would create a phantom device on every logout/login.
- `src/components/Sidebar.tsx:541` — Invalidate the refresh token server-side (blacklist) so it can't be reused after sign-out. Awaited with a short timeout so a slow/offline network never blocks logout, and before we navigate (which would cancel an in-flight request). Best-effort — failure must never block sign-out.
- `src/components/Sidebar.tsx:584` — Always mark read on open — regardless of role (fixes the bug where actionable roles left notifications unread).

### `src/components/StatusBadge.tsx`

- `src/components/StatusBadge.tsx:4` — Identity never rests on colour alone: every badge carries its text label, and the dot is a CSS shape — no emoji.

## `src/config` — 7 statements


### `src/config/adminPages.ts`

- `src/config/adminPages.ts:23` — Tracker pages are gated centrally by role (see config/pageAccess.ts), not by per-user extra_pages, so they are intentionally not listed here.
- `src/config/adminPages.ts:30` — System — one page carrying live device activity and version analytics. "Device_Activity" and "Version_Management" are deliberately no longer grantable: the pages they gated are gone, so offering those permissions would grant nothing. Any stored grant with those keys is simply ignored.
- `src/config/adminPages.ts:39` — The keys MUST match payments/permissions.py and the mobile app exactly.
- `src/config/adminPages.ts:58` — Unlike the four above, this one DOES open a page — the analytics dashboard on web and mobile. It is deliberately not implied by any of them: the people who record and approve payments are not automatically the people who should see company-wide collection totals.

### `src/config/pageAccess.ts`

- `src/config/pageAccess.ts:1` — Centralized Document-Tracker page access — MUST mirror the backend rule in OMS-Backend/tracker/permissions.py. Access is decided purely by the user's role; the sidebar, login-landing and (server-side) the APIs all read from this single source. To change who sees what, change a user's role — never page code.
- `src/config/pageAccess.ts:54` — Where a tracker user lands after login, by priority of what they can access. Ap_Invoice_Entry must be listed: it is the ONLY page a tracker_ap user can see, so leaving it out would land them on a page they have no access to.
- `src/config/pageAccess.ts:66` — The landing path for ANY role, after a fresh login or a restored session: • tracker sub-roles -> their highest-priority tracker page • legal reviewers -> their own workspace • HAIS role -> the Hardware Assets page • Distributor role -> the Distributor page • Mart Approval role -> the Mart Approval queue • everyone else -> the Dashboard Both entry points in `pages/Login.tsx` (the login submit and the already-authentic

## `src/pages` — 128 statements


### `src/pages/Add_Sales.tsx`

- `src/pages/Add_Sales.tsx:265` — The guided 4-step wizard is used for both the standard create flow and the FOC create flow, so Add Sales and Add FOC share the same UI. FOC-specific behaviour (price forced to 0, no scheme panel) is handled via `isFocOrder`. Edit and Duplicate modes keep the original single-page form.
- `src/pages/Add_Sales.tsx:531` — Combo companion lines are re-derived from their parent on every render, so loading them back as editable rows would both duplicate them in the list and send them twice on save.
- `src/pages/Add_Sales.tsx:578` — Landing is always basic + tax% (recomputed, not the stored value) so the edit side shows the same figure the create side does.
- `src/pages/Add_Sales.tsx:623` — Strip any codes a previous save may have baked into card_name so they don't accumulate on this (and every subsequent) edit.
- `src/pages/Add_Sales.tsx:768` — Only enforced where the field is actually shown — an edit that hides it must not be blocked by a PO it cannot type.
- `src/pages/Add_Sales.tsx:850` — Scheme giveaways are deliberately absent: they ride on the parent line's `schemes[]`, which sync_service already fans out into its own zero-priced SAP line.
- `src/pages/Add_Sales.tsx:917` — Save the clean party name (never the "Name (CODE)" label), stripped of any code so it cannot pile up across edits.
- `src/pages/Add_Sales.tsx:996` — Snapshot: SAP ships this exact item, so editing the scheme later cannot change what an already-approved order sends.
- `src/pages/Add_Sales.tsx:999` — A SAP DocumentLine quantity is always pieces, so a scheme written in cartons ships as qty x pack size. `benefit_uom`/`benefit_qty` keep the original wording for the UI and for audit.
- `src/pages/Add_Sales.tsx:1277` — --------------------------------------------------------------------- Free lines derived from a confirmed row. Two different things arrive here and they are NOT symmetric: * A combo pack ("A + B") ships B free. That is a real order line — the SAP push emits it as a zero-priced DocumentLine — so it goes into the payload as its own item carrying `is_auto_free` / `combo_source_code`. * A scheme giveaway is already carri
- `src/pages/Add_Sales.tsx:1350` — Scheme giveaways the v2 engine resolved for this row. These come from targeting (a vendor, or a whole state) rather than from the picker, so the salesperson never chooses them — they just appear.
- `src/pages/Add_Sales.tsx:1645` — Both maps are keyed by row index, so removing a row means shifting every key above it down by one — otherwise a later row inherits the deleted row's scheme options / engine proposals.
- `src/pages/Add_Sales.tsx:1736` — Brand and sub-group are metadata copied off the chosen product, and part of the catalogue legitimately leaves them blank — requiring them here made those products impossible to order. The item itself is what must be set.
- `src/pages/Add_Sales.tsx:1839` — Debounced: quantities are typed, and every keystroke would otherwise be a round trip.
- `src/pages/Add_Sales.tsx:1866` — A failed preview must never block order entry — the form simply shows no engine-resolved schemes.
- `src/pages/Add_Sales.tsx:1982` — Fall back to the Mart company name (or literally "Mart") for a Mart order whose company id isn't in the list, so the field never shows "Select Company".
- `src/pages/Add_Sales.tsx:2224` — The legacy "Optional promotion" picker reads `scheme_product`, which is NOT category-aware — it lists every scheme in the party's state regardless of business line. MART has no schemes, so the panel must be hidden for a MART line/party (as it already is for a company-3 Mart order); otherwise an OIL/BEVERAGES scheme from the same state would leak into a MART order. The category-gated auto-fetch (v2 engine) is unaffect
- `src/pages/Add_Sales.tsx:3383` — "Duplicate FOC Order" : "Duplicate Sales Order" : isFocMode ?

### `src/pages/Add_Scheme.tsx`

- `src/pages/Add_Scheme.tsx:16` — The API reports duplicate/validation problems per field; surface the first one rather than a generic "failed" alert.

### `src/pages/Ap_Invoice_Entry.tsx`

- `src/pages/Ap_Invoice_Entry.tsx:34` — Access is role-driven and centralized in config/pageAccess.ts (mirroring tracker/permissions.py): tracker_ap and tracker_admin only. The backend enforces the same rule via IsTrackerAP, so this guard is UX, not security.

### `src/pages/Combo_Mapping.tsx`

- `src/pages/Combo_Mapping.tsx:67` — A combo can never be its own free half, so keep them out of the picker.

### `src/pages/Dashboard.tsx`

- `src/pages/Dashboard.tsx:562` — Names of the rate approver(s) still holding an order (status PENDING). Only relevant while the order is actually at the rate-approval stage — once it moves on (e.g. to billing) it can keep stale PENDING rows, which we must not show as "with the rate approver".

### `src/pages/Device_Management.tsx`

- `src/pages/Device_Management.tsx:31` — Pagination, filtering, search and sorting are ALL server-side; this page never holds the full table in memory.
- `src/pages/Device_Management.tsx:31` — Status (online / idle / offline / inactive) is derived by the SERVER from last_active and returned per row, so the badge, the status cards and the ?status= filter can never disagree — and a skewed browser clock cannot change what a badge says.
- `src/pages/Device_Management.tsx:31` — The two device tables it implied are deliberately ONE table: both read the same endpoint, so a second copy would double the requests and split the search.
- `src/pages/Device_Management.tsx:49` — The app's established categorical chart palette (see Dashboard.tsx). Reused rather than redefined so every chart in the product reads as one system. Hues are assigned by fixed index and never cycled.
- `src/pages/Device_Management.tsx:55` — Activity status keeps the colours this page already uses for it: the table's Active/Inactive badges are green/red, so the chart must not invent a second visual language for the same fact. Identity is carried by the legend and the on-slice labels too — never by colour alone.
- `src/pages/Device_Management.tsx:87` — Collapse a long tail into "Other" so hues are never generated/cycled.
- `src/pages/Device_Management.tsx:158` — The radius also stays inside the box so the topmost label cannot clip against the chart's edge.
- `src/pages/Device_Management.tsx:200` — Pie with a legend — identity is never conveyed by colour alone.
- `src/pages/Device_Management.tsx:221` — Labelled directly so the value never depends on reading a hue.
- `src/pages/Device_Management.tsx:414` — The latest/old split. Shown even when there are no bars yet, so the footer always states the current picture ("0 devices"). "No policy" when the platform has no required build set — old/latest is undefined without one.
- `src/pages/Device_Management.tsx:535` — A failed background refresh must not blank a table someone is reading — keep the last good rows and surface a quiet message.
- `src/pages/Device_Management.tsx:550` — A ref holds the latest `load` so the interval never closes over stale filters/page/ordering, and the interval is created ONCE — so an auto refresh never resets what the admin has selected.
- `src/pages/Device_Management.tsx:567` — Don't burn requests refreshing a tab nobody is looking at.
- `src/pages/Device_Management.tsx:585` — The API has no single param that spans all three: its `search` matches the user's name and app_version (among other text fields) but never the numeric build_number, and combining `search` with `build_number` would AND them.
- `src/pages/Device_Management.tsx:738` — The web is never validated and is deliberately absent.
- `src/pages/Device_Management.tsx:816` — Status is derived from last_active rather than stored, so it is not one of them — it stays a plain header rather than offering a sort that would silently do nothing.

### `src/pages/Distributor/Order_Tracking.tsx`

- `src/pages/Distributor/Order_Tracking.tsx:728` — SAP details are for the Mart approver / admin only — distributors don't see them.

### `src/pages/Distributor/index.tsx`

- `src/pages/Distributor/index.tsx:74` — True when an ISO datetime falls in the current calendar month/year. A product whose party-product assignment wasn't updated this month cannot be ordered.
- `src/pages/Distributor/index.tsx:220` — Freshness gate: the product's party-product assignment must have been updated in the current month, otherwise it cannot be ordered.

### `src/pages/HAIS/AssetForm.tsx`

- `src/pages/HAIS/AssetForm.tsx:13` — Employee IDs are always prefixed with the company code.

### `src/pages/HAIS/AssetQr.tsx`

- `src/pages/HAIS/AssetQr.tsx:11` — So the QR always points at whatever server the env is configured for — no hardcoded URL.

### `src/pages/HAIS/QrScanner.tsx`

- `src/pages/HAIS/QrScanner.tsx:20` — Guard so we only report the first successful read and never double-stop.

### `src/pages/Inventory_Report.tsx`

- `src/pages/Inventory_Report.tsx:72` — Close the warehouse dropdown on an outside click, the way a native select would — otherwise it stays open over the table.
- `src/pages/Inventory_Report.tsx:217` — Pinned to decimal: "Grand Total" would otherwise be read as money and come out with a ₹ symbol against what is a carton/piece count.

### `src/pages/InvoiceReview.tsx`

- `src/pages/InvoiceReview.tsx:411` — Factory approvers only review (Pending/Approved/Rejected) and cannot post to SAP — that's the billing role's job.
- `src/pages/InvoiceReview.tsx:433` — Deleted rows are left out entirely: the endpoint hides them by default, and no tab lists them, so counting them would badge a tab with rows the reviewer cannot see.
- `src/pages/InvoiceReview.tsx:453` — Deleted rows never come back: the endpoint hides them unless include_deleted is set, which nothing here asks for.
- `src/pages/InvoiceReview.tsx:540` — Remove an entry from the review screen. Nothing is erased — the backend soft deletes, so the log and its history survive — but the row is gone from every tab here, which is why the confirmation says so plainly. One confirmation, no reason prompt: the reviewer deleting the row is already recorded against it, and the delete is reversible, so making them type a reason bought nothing.
- `src/pages/InvoiceReview.tsx:849` — The history endpoint is keyed by the invoice-log id. On a list row that is the record's invoice_log when present, otherwise its own id.
- `src/pages/InvoiceReview.tsx:1032` — A real anchor, not window.open: popup blockers can turn an opener into a same-tab navigation, and this must never take the reviewer off the list.
- `src/pages/InvoiceReview.tsx:1102` — Last, so it never sits where Approve/Post used to be and gets hit by muscle memory.

### `src/pages/Invoice_Report.tsx`

- `src/pages/Invoice_Report.tsx:41` — The branch the currently previewed PDF was fetched with — switching the selector must not silently repoint the open preview.

### `src/pages/Label_Checker.tsx`

- `src/pages/Label_Checker.tsx:117` — The backend now classifies each parameter with an explicit status. Fall back to the value (blank ⇒ missing) for older payloads that don't send one.
- `src/pages/Label_Checker.tsx:269` — Rows now compare the label's figures against a reference database. Show the comparison columns when DB figures are present; otherwise fall back to a plain label-only table for older payloads.

### `src/pages/Login.tsx`

- `src/pages/Login.tsx:93` — If a valid session already exists (or an expired access token can be silently refreshed), skip the Login screen and go straight into the app. We NEVER clear tokens here — opening Login must not affect any tab.
- `src/pages/Login.tsx:101` — Same landing rule as a fresh login (see handleLogin) — one shared helper, so a restored session can never land somewhere a new login wouldn't.
- `src/pages/Login.tsx:166` — Register this browser with the backend. Fire-and-forget: best-effort telemetry that must never block, delay or fail login. Retries by itself on the next authenticated session if it fails now.
- `src/pages/Login.tsx:171` — Fetch dynamic UI labels once for this session and cache them. Same fire-and-forget contract: never blocks login, and any screen falls back to hardcoded text until it resolves.

### `src/pages/Order_Flow_Settings.tsx`

- `src/pages/Order_Flow_Settings.tsx:169` — The parties endpoint repeats rows; keep one entry per party + category so the category variants stay visible, but drop exact duplicates (which would create duplicate React keys and break list filtering).

### `src/pages/Page_Permissions.tsx`

- `src/pages/Page_Permissions.tsx:117` — Action permissions live in the same list, so filter on the FULL key set — using the page-only list would silently drop them on save.

### `src/pages/Payments/AnalyticsTab.tsx`

- `src/pages/Payments/AnalyticsTab.tsx:118` — Cancelled on unmount and whenever a new target arrives mid-flight, so a fast filter change cannot leave two animations fighting over the value.
- `src/pages/Payments/AnalyticsTab.tsx:314` — Last 30 Days by default — a rolling window, so the page never opens nearly empty on the 1st of a month. Matches analytics.DEFAULT_PRESET so a request with no preset resolves to the same range.
- `src/pages/Payments/AnalyticsTab.tsx:321` — Table controls, kept apart from the filters above: changing a page or a sort must not re-run the KPI and chart aggregations, whose answers have not changed.
- `src/pages/Payments/AnalyticsTab.tsx:340` — Companies come from the same master the payment forms use, so the filter can never offer a category that has no SAP database behind it.
- `src/pages/Payments/AnalyticsTab.tsx:347` — A custom range only queries once both ends are set — otherwise every keystroke in the date input would fire a request for a half-built range.
- `src/pages/Payments/AnalyticsTab.tsx:351` — The window every request shares. Memoised so the person dialog's deps do not change identity on each render.
- `src/pages/Payments/AnalyticsTab.tsx:510` — Four cards, not five: "Total Payments" was removed because it summed the same posted receipts as Received Total and always showed an identical figure — two cards answering one question.
- `src/pages/Payments/AnalyticsTab.tsx:552` — --- KPI cards: raised but not settled -------------------------- Restricting the figures above to posted documents makes them trustworthy but would otherwise hide real work.

### `src/pages/Payments/ApprovalManagement.tsx`

- `src/pages/Payments/ApprovalManagement.tsx:51` — Endpoints that do not exist yet are typed in approvalService and render a real empty/error state rather than mock data.
- `src/pages/Payments/ApprovalManagement.tsx:71` — Analytics is first and default — the page is now a dashboard that also carries its configuration, rather than a configuration console. The former Overview and Requests tabs are gone: Overview counted workflows and pending requests, which the dashboard now reports in money terms, and Requests duplicated the approval queue the operators work from in the app. The four configuration tabs stay, because without them nobody
- `src/pages/Payments/ApprovalManagement.tsx:1020` — Delete removed deliberately — see the Workflows tab.
- `src/pages/Payments/ApprovalManagement.tsx:1103` — "Minimum approvals" is always 1 — one approver clears a stage — and "Escalate after" is gone entirely: nothing auto-approves on a timer, which is the behaviour that field implied.
- `src/pages/Payments/ApprovalManagement.tsx:1296` — Company is INHERITED from the workflow — the admin already chose it there, so asking again invites a mismatch where an approver is scoped to a company the workflow never routes to.
- `src/pages/Payments/ApprovalManagement.tsx:1884` — Cash cannot post without it, so an empty value is flagged rather than shown as a blank cell.

### `src/pages/Payments/ApprovalUI.tsx`

- `src/pages/Payments/ApprovalUI.tsx:159` — Single entry point for open/close so the search state always resets.

### `src/pages/Payments/CollectionTable.tsx`

- `src/pages/Payments/CollectionTable.tsx:9` — The point of the table is to show the whole team, and a cut-off silently hides the people whose figures most need looking at.

### `src/pages/Payments/ConfigTab.tsx`

- `src/pages/Payments/ConfigTab.tsx:15` — It stores only the business decision of which account a tender uses, because a single bank can expose several G/L accounts and OMS cannot guess which.
- `src/pages/Payments/ConfigTab.tsx:15` — NOT a bank master: SAP owns the accounts and this page never creates one.

### `src/pages/Payments/DonutChart.tsx`

- `src/pages/Payments/DonutChart.tsx:6` — Its own module so `AnalyticsTab` can `lazy()` it — recharts is the heaviest dependency on the page, and the KPI cards above the fold do not need it.
- `src/pages/Payments/DonutChart.tsx:45` — Zero-amount slices are dropped before drawing: recharts renders them as a hairline that still catches the mouse, producing a tooltip for a segment the user cannot see.
- `src/pages/Payments/DonutChart.tsx:89` — `pointer-events: none` in CSS so it never steals the hover from the arcs underneath.
- `src/pages/Payments/DonutChart.tsx:89` — `title` keeps the exact amount one hover away, and the legend beside the chart always shows it in full.

### `src/pages/Payments/PersonDetailDialog.tsx`

- `src/pages/Payments/PersonDetailDialog.tsx:15` — Scoped to the SAME company and date window as the dashboard behind it — otherwise a person's totals here would not reconcile with the row that was clicked, which is the first thing anyone checks.

### `src/pages/Payments/approvalFormat.ts`

- `src/pages/Payments/approvalFormat.ts:1` — Kept out of ApprovalUI.tsx so that file exports components only — mixing the two breaks React Fast Refresh.

### `src/pages/Payments/dashboardFormat.ts`

- `src/pages/Payments/dashboardFormat.ts:1` — Separate module so `AnalyticsTab` and the lazily-loaded `DonutChart` can both import them without either file exporting a non-component — which would break Fast Refresh for the whole module.
- `src/pages/Payments/dashboardFormat.ts:17` — The exact figure is never only here — the legend beside the chart carries it in full, so nothing is lost by abbreviating the centre.
- `src/pages/Payments/dashboardFormat.ts:67` — Indexed by position so a legend dot always matches its arc.

### `src/pages/Payments/useApprovalAdmin.ts`

- `src/pages/Payments/useApprovalAdmin.ts:34` — DRF field errors: {"code": ["This field must be unique."]}
- `src/pages/Payments/useApprovalAdmin.ts:84` — `loader` is intentionally excluded — callers pass an inline closure, so including it would refetch on every render. `deps` is the real trigger. eslint-disable-next-line react-hooks/exhaustive-deps

### `src/pages/Profile.tsx`

- `src/pages/Profile.tsx:4` — Every value comes from webDeviceService (the single source of truth); nothing here is editable and nothing is hardcoded.
- `src/pages/Profile.tsx:109` — Snapshot once per mount — these values don't change while the page is open.

### `src/pages/SO_Invoice_Report.tsx`

- `src/pages/SO_Invoice_Report.tsx:94` — Age is just the order date read backwards, so it sorts on the same field with the direction flipped — no second source of truth.
- `src/pages/SO_Invoice_Report.tsx:117` — Ties fall back to the SO number so the order never shuffles between renders on columns with lots of repeats (chain, location, dispatch from).
- `src/pages/SO_Invoice_Report.tsx:155` — `setMonth(-1)` alone rolls over on long months — on 31 March it lands on 3 March, since 31 February does not exist — which would silently shorten the default window to three days.
- `src/pages/SO_Invoice_Report.tsx:641` — The arrow is always in the DOM, faint until the column is hovered or active, so the header keeps one width and the row never shifts as you sort.
- `src/pages/SO_Invoice_Report.tsx:720` — The page behind must not scroll under the modal — restore whatever the page had rather than hard-coding "auto".

### `src/pages/SalesInvoice/ContentsTab.tsx`

- `src/pages/SalesInvoice/ContentsTab.tsx:160` — Some batches are legitimately named after a date (e.g. "06/06/2026"). Prefer a non-date identifier, but never drop the batch number entirely.
- `src/pages/SalesInvoice/ContentsTab.tsx:198` — A rejected log releases its share, so those never appear.
- `src/pages/SalesInvoice/ContentsTab.tsx:198` — SAP does not know a batch is spoken for until the invoice actually posts, which is why these holds are tracked here at all.
- `src/pages/SalesInvoice/ContentsTab.tsx:220` — Never negative: a hold bigger than the batch (stock moved in SAP since the other draft was built) means nothing is free, not that we owe stock.

### `src/pages/SalesInvoice/index.tsx`

- `src/pages/SalesInvoice/index.tsx:1258` — Some batches are legitimately named after a date (e.g. "06/06/2026"). Prefer a non-date identifier, but never drop the batch number entirely.

### `src/pages/SalesInvoice/sapErrorTranslator.ts`

- `src/pages/SalesInvoice/sapErrorTranslator.ts:350` — Recognised errors get curated copy (and any parsed facts); unrecognised ones still surface the real reason by promoting it to the headline — never a bare "SAP Error".

### `src/pages/SalesInvoice/useSalesInvoice.ts`

- `src/pages/SalesInvoice/useSalesInvoice.ts:124` — Best-effort stringify that never throws (circular refs fall back to String()).
- `src/pages/SalesInvoice/useSalesInvoice.ts:141` — Normalise an axios error into the same Error(message) contract the previous fetch()-based helpers threw (never logs tokens).
- `src/pages/SalesInvoice/useSalesInvoice.ts:173` — Signature/behaviour preserved: 204 → undefined, otherwise the parsed body; throws Error(message) on failure.
- `src/pages/SalesInvoice/useSalesInvoice.ts:265` — Batches are deliberately NOT restored — the draft step re-runs auto-allocation against current stock, which is the whole point of editing here.
- `src/pages/SalesInvoice/useSalesInvoice.ts:636` — It pins the customer (a replacement for invoice X must stay on X's customer — otherwise it is a different invoice wearing X's history) and carries the source log id, which postInvoice sends as `edited_from` so the backend retires the original.
- `src/pages/SalesInvoice/useSalesInvoice.ts:669` — A replacement invoice cannot change customer: picking a different one detaches from the rejected invoice instead of carrying its identity over.
- `src/pages/SalesInvoice/useSalesInvoice.ts:702` — Best effort: the SO list is still usable without the badges, so a failure here must not fail the step.
- `src/pages/SalesInvoice/useSalesInvoice.ts:1120` — Freight comes back as stored; batches deliberately do not — the draft step re-runs auto-allocation against current stock.
- `src/pages/SalesInvoice/useSalesInvoice.ts:1220` — Only claim to replace the rejected log when this really is its replacement — same customer, link never released. Otherwise the original stays REJECTED and this is simply a new invoice.
- `src/pages/SalesInvoice/useSalesInvoice.ts:1245` — The original has been retired by the backend; a further submit from this session must not try to retire anything again.

### `src/pages/Scheme_Manager.tsx`

- `src/pages/Scheme_Manager.tsx:88` — The stored value is still the item_code — that is what the engine matches on — but it is never typed.
- `src/pages/Scheme_Manager.tsx:240` — The editor is a wizard: one question per screen, so a half-built offer never looks finished. Step 4 reads the whole thing back before it is saved.
- `src/pages/Scheme_Manager.tsx:305` — Finished goods only. The catalogue also carries PM (packing material), RM (raw material), CG and SC — about two thirds of it — and none of those can be sold, so none can trigger a scheme or be given away. Also de-duplicated: the same item_code exists once per category, and a scheme matches on the code alone.
- `src/pages/Scheme_Manager.tsx:437` — Jumping backwards is always allowed; forwards only as far as the first unfinished step, so Review can never show a half-built offer.
- `src/pages/Scheme_Manager.tsx:1207` — everything most people never touch ------------------

### `src/pages/Status.tsx`

- `src/pages/Status.tsx:119` — The KPI row and the sync buttons are keyed off the same list, so a count and the button that refreshes it always describe the same module.

### `src/pages/Tracker_Entry.tsx`

- `src/pages/Tracker_Entry.tsx:205` — Surface DRF field errors (e.g. duplicate invoice number), not just detail.

### `src/pages/Tracker_Queue.tsx`

- `src/pages/Tracker_Queue.tsx:179` — Whether the user has manually typed a paid amount. Until then, the paid field auto-follows the net payable (so it always shows amount-after-deductions).
- `src/pages/Tracker_Queue.tsx:237` — Partially-paid invoices (terminal stage) get their own tab and are kept out of "Current" so the to-pay list and the part-paid list don't mix.
- `src/pages/Tracker_Queue.tsx:397` — Partial-hold amount may be waived for RM-PM; let the server decide, but nudge for a debit amount which is always required.
- `src/pages/Tracker_Queue.tsx:409` — Export exactly what the active tab is showing (search filter included), in the same register layout as the All-Invoices export — the server builds it from the same `exports.build_workbook`, so the two sheets match column for column. A decision log can list an invoice twice; the register is one row per invoice, so the ids are de-duplicated server-side.
- `src/pages/Tracker_Queue.tsx:616` — The status bar below still works, so a handler can also approve/reject by hand — for an invoice JSAP never received, or to override what it says.

### `src/pages/UI_Labels.tsx`

- `src/pages/UI_Labels.tsx:22` — `field_key` is set once on create and never editable afterwards: clients depend on it as the stable key.
- `src/pages/UI_Labels.tsx:120` — Reflect a saved row into the live caches so open screens update now. Labels: inactive → drop so the wording falls back to the hardcoded default. Fields: NEVER drop on inactive — an absent key would make the client fall back to its built-in default (enabled), re-showing a field the admin just turned off. Instead keep the key with the EFFECTIVE flags: inactive OR not enabled ⇒ enabled:false (and a hidden field can't be

## `src/root` — 1 statements


### `src/vite-env.d.ts`

- `src/vite-env.d.ts:3` — Injected at build time by Vite's `define` (see vite.config.ts). These are the ONLY source of the web app's version and build number. Do not hardcode a version anywhere else — read it from webDeviceService instead.

## `src/services` — 55 statements


### `src/services/api.ts`

- `src/services/api.ts:22` — Auth endpoints must never be auto-retried / refreshed (Task 10).
- `src/services/api.ts:27` — localStorage keys cleared on session end (mirror of what Login sets). NOTE: `device_id` (and `device_last_sync`) are deliberately ABSENT from this list and must stay that way. One browser must keep ONE device id across logins — clearing it would mint a brand-new "device" on every logout/login and fill the backend with phantom rows. See webDeviceService.
- `src/services/api.ts:48` — This file never imports webDeviceService — that would be a cycle (the service imports this module to POST) and would drag device concerns into the API layer.
- `src/services/api.ts:77` — Attach device/version metadata to every request from this one place. Applied BEFORE the token so a provider can never clobber Authorization, and guarded so metadata can never break a real request.
- `src/services/api.ts:102` — Outcome of a refresh attempt. `invalid` = the refresh token was rejected (401/400) → real session end. `network` = timeout/offline/DNS/5xx → the session MUST be kept (Task 4).
- `src/services/api.ts:133` — Call POST /auth/refresh/ with a BARE axios call so this request never re-enters the interceptors below (no recursion). Never logs tokens.
- `src/services/api.ts:149` — Successful (re)authentication — let device registration retry if an earlier attempt hadn't succeeded. Fire-and-forget; never affects refresh.
- `src/services/api.ts:154` — the device hook must never impact the auth path
- `src/services/api.ts:166` — another tab just refreshed), we reuse it instead of calling /refresh again, which is critical because rotation would otherwise blacklist a token mid-flight.
- `src/services/api.ts:200` — Resolves whether the app currently has a usable session, refreshing silently if the access token is expired: • access valid → "authenticated" • expired but refresh works → "authenticated" (rotated tokens stored) • expired + network failure → "authenticated" (tokens kept, retry later) • refresh rejected (401/400) → "unauthenticated" • no tokens at all → "unauthenticated" It NEVER clears tokens on a network failure.
- `src/services/api.ts:272` — Retry the ORIGINAL request; the request interceptor re-attaches the now-current token. The caller never notices.

### `src/services/approvalService.ts`

- `src/services/approvalService.ts:3` — Endpoints that do not exist on the backend yet are marked NOT IMPLEMENTED and documented with the URL they will call once built — they are typed exactly as the finished endpoint will respond, so wiring them up later is a no-op here.
- `src/services/approvalService.ts:27` — ORDER is deliberately absent: sales orders run through the separate legacy order-approval flow, so offering it here would let an admin build a workflow that never fires. The type keeps ORDER so existing rows still deserialize.
- `src/services/approvalService.ts:266` — Lives here, not in the payment-method mapping, because cash is the one tender that does NOT land in a bank: SAP publishes bank accounts as House Bank Accounts (DSC1) and a cash drawer has no such row, so there is nothing to pick from and the account must be named directly.
- `src/services/approvalService.ts:275` — A second field rather than a reuse of `cash_gl_account` because SAP validates the two roles differently: a receipt's CashAccount must be a cash-flow account (OACT.Finanse='Y'), while a deposit posts as a DocType 'A' transfer whose CardCode must NOT be one.

### `src/services/deviceAdminService.ts`

- `src/services/deviceAdminService.ts:1` — All list endpoints are server-paginated/filtered/searched: the device table grows one row per user per device, so the browser never receives all of it.
- `src/services/deviceAdminService.ts:11` — Computed by the SERVER from last_active — never stored, and never recomputed in the browser (a skewed client clock would disagree with the server-side ?status= filter).
- `src/services/deviceAdminService.ts:94` — Derived activity buckets; always sum to total_devices.
- `src/services/deviceAdminService.ts:150` — Drop empty values so we never send `?platform=` and filter on "".

### `src/services/haisService.ts`

- `src/services/haisService.ts:270` — Only fields present on the partial are sent, so a partial PATCH never blanks out untouched columns.

### `src/services/ordersService.ts`

- `src/services/ordersService.ts:172` — Scheme engine v2 (Backend/docs/scheme-architecture.md). `benefit_item_code` is the snapshot SAP actually ships, so editing a scheme later cannot change what an already-approved order sends.

### `src/services/paymentsDashboardService.ts`

- `src/services/paymentsDashboardService.ts:38` — `percent` is computed server-side so chart, legend and tooltip can never round the same number differently.
- `src/services/paymentsDashboardService.ts:52` — Every figure here is SAP-POSTED ONLY, except the `pending_*` / `blocked_*` group, which is deliberately the opposite: what was raised but has NOT settled in SAP.
- `src/services/paymentsDashboardService.ts:77` — The subset needing a human: SAP refused it, or never answered.
- `src/services/paymentsDashboardService.ts:192` — One place, so the three endpoints that take the same window can never disagree about how it is spelled.
- `src/services/paymentsDashboardService.ts:249` — Deliberately NOT `approvalService.listCompanyMappings()`, which is behind IsApprovalAdmin — a non-admin opening the dashboard would get a 403 and an empty dropdown.

### `src/services/schemeService.ts`

- `src/services/schemeService.ts:3` — Deliberately separate from `ordersService.getSchemeProducts` / `createScheme`, which still speak to the legacy flat `scheme_product` table feeding the current Add Sales picker.
- `src/services/schemeService.ts:160` — SAP DocumentLine quantities are always pieces, so this — not `qty` — is what an order line must carry.
- `src/services/schemeService.ts:291` — Sent with the scheme so an offer can be created already targeted. The API replaces the whole set, which is why the editor holds the full list. The dedupe guards the (scheme, scope_type, scope_value, category) unique key.
- `src/services/schemeService.ts:345` — Only ITEM matches on a product code; the other match types are free text (sub group, brand, ...) and must be shown verbatim.

### `src/services/trackerService.ts`

- `src/services/trackerService.ts:223` — `available: false` is a normal answer, not an error — `reason` says why the invoice could not be linked: not_in_jsap Mart, which JSAP does not budget-approve no_party_code no SAP vendor picked, so the document cannot be identified no_draft no SAP draft matches this invoice number + vendor not_submitted the draft exists but has not reached JSAP yet not_configured JSAP database not set up on the server rejection_pendin

### `src/services/uiConfig.ts`

- `src/services/uiConfig.ts:1` — The rules for this module: • Fetch the label map ONCE after login (see `loadUILabels`) — never per page.
- `src/services/uiConfig.ts:58` — Prefer `getLabel` for individual reads so a missing key always has a fallback.
- `src/services/uiConfig.ts:64` — `fallback` is the original hardcoded English so the UI is always correct even before labels load or if a key is absent/inactive.
- `src/services/uiConfig.ts:73` — Safe to call repeatedly — concurrent calls share one in-flight request, and it never throws (a failed fetch just keeps the last-known/empty map so the UI falls back to the hardcoded text).
- `src/services/uiConfig.ts:193` — `fallback` is the built-in default so a form is always correct before the config loads or if the key is absent — pass the hardcoded behaviour the code used before this feature.

### `src/services/userService.ts`

- `src/services/userService.ts:219` — The edit form has a single Category select, so `category` is the source of truth and `categories` is derived from it. Sending a bare `categories: []` (which is what happened while the form never filled `categories`) made the backend clear the m2m AND null the `category` FK on every save.

### `src/services/webDeviceService.ts`

- `src/services/webDeviceService.ts:1` — Future features (force update, version check, session tracking, analytics, browser tracking) hang off this service and must NOT require touching the auth flow again — see the "Future extension points" note at the bottom.
- `src/services/webDeviceService.ts:1` — Mirrors the React Native DeviceService so both clients report an identical contract; the detection heuristics below intentionally mirror the backend's own UA parser (devices/utils.py) so client- and server-derived values agree.
- `src/services/webDeviceService.ts:1` — Register this browser with the backend after authentication — best-effort, never blocking, self-retrying on the next auth event.
- `src/services/webDeviceService.ts:1` — Report the app version/build from the build-time constants (single source of truth: package.json -> vite `define` -> here).
- `src/services/webDeviceService.ts:25` — --------------------------------------------------------------------------- Constants — must match the backend's `platform` / `app_type` enums exactly. ---------------------------------------------------------------------------
- `src/services/webDeviceService.ts:95` — --------------------------------------------------------------------------- Device id — created once, then stable for the life of the browser profile. Deliberately NOT in the auth key lists that logout clears (see api.ts AUTH_STORAGE_KEYS and Sidebar clearSessionStorage), so logging out never mints a phantom device. ---------------------------------------------------------------------------
- `src/services/webDeviceService.ts:253` — Browser name/version are deliberately NOT sent: the backend derives them from the User-Agent header (which the browser always sends) so the value can't be spoofed by the client.
- `src/services/webDeviceService.ts:253` — screen/viewport/user_agent are collected for display and future analytics but have no backend column yet, so sending them would be silently dropped.
- `src/services/webDeviceService.ts:306` — --------------------------------------------------------------------------- Backend registration — best-effort, never throws, never blocks login. The endpoint is an idempotent upsert, so repeat calls are safe and cheap. ---------------------------------------------------------------------------
- `src/services/webDeviceService.ts:317` — Covers 401/403 (not yet authenticated), 4xx and network failures alike. We leave `registeredThisSession` false so the next successful authentication retries. Never rethrown — this is telemetry, not a feature the user is waiting on.
- `src/services/webDeviceService.ts:328` — • 'login' — always (re)assert; the signed-in user may have changed.
- `src/services/webDeviceService.ts:340` — Only an explicit login forces a re-assert. Otherwise one success per page load is enough — this keeps route changes (which remount the shell) from re-POSTing on every navigation.
- `src/services/webDeviceService.ts:390` — ---- Future extension points (intentionally not implemented in Phase 4) ---- These belong HERE so no future feature needs to touch the auth flow again: • trackSession() -> heartbeat / last-active pings • reportAnalytics() -> screen/viewport/UA are already collected above

### `src/services/webPushClient.ts`

- `src/services/webPushClient.ts:58` — When none was ever registered it does not reject -- it simply never settles, so a plain `await` hangs forever and no try/catch can see it.
- `src/services/webPushClient.ts:114` — Ask for notification permission (call only after the user opts in — never on first load).
- `src/services/webPushClient.ts:114` — Returns the resulting permission and persists it so we don't prompt repeatedly.
- `src/services/webPushClient.ts:149` — A PushSubscription is permanently bound to the application server key it was created with. If the server's VAPID pair was rotated, an existing subscription can never receive our pushes again — the push service rejects them with "403 ... VAPID credentials do not correspond to the credentials used to create the subscriptions". Detect that mismatch and re-subscribe with the current key instead of re-uploading a dead row
- `src/services/webPushClient.ts:204` — No worker was ever registered (push never enabled on this browser), so there is nothing to unsubscribe -- and waiting on it would hang sign-out.

## `src/utils` — 13 statements


### `src/utils/excelExport.ts`

- `src/utils/excelExport.ts:184` — NaN/Infinity count as blank: they come from arithmetic on missing fields, and treating them as values would poison an otherwise numeric column into text and emit a literal "NaN" cell.
- `src/utils/excelExport.ts:276` — Deliberately strict — `new Date(str)` is not used as a fallback because it happily parses things like "Approved" into garbage on some engines.
- `src/utils/excelExport.ts:404` — Such identifiers must stay text even though they parse as numbers.
- `src/utils/excelExport.ts:503` — Fall back to text rather than null: an unrecognised value would otherwise be silently dropped into an empty cell.
- `src/utils/excelExport.ts:518` — Never let Number() shave a leading zero off a code.
- `src/utils/excelExport.ts:738` — Body. addRows in one call is markedly faster than per-row addRow for large exports, and values are pre-coerced so ExcelJS never has to guess a type.
- `src/utils/excelExport.ts:776` — Nothing to total (e.g. an order with no line items, so the amount columns never appear) — skip the row rather than emit a blank shaded strip.

### `src/utils/notificationPermission.ts`

- `src/utils/notificationPermission.ts:1` — We NEVER call Notification.requestPermission() automatically — this state decides when to show OUR modal; the OS dialog only fires from the modal's "Allow Notifications" button.
- `src/utils/notificationPermission.ts:57` — - denied → never auto-show; the browser won't reopen its dialog, so the Settings section surfaces re-enable instructions instead (Task 4).
- `src/utils/notificationPermission.ts:57` — - granted / unsupported → never (Task 6/7).

### `src/utils/notificationSound.ts`

- `src/utils/notificationSound.ts:1` — - Debounced so a burst of rapid notifications never stacks overlapping sounds.
- `src/utils/notificationSound.ts:14` — Guard so the one-time unlock listeners are attached ONCE, not re-added on every Sidebar remount (each route wraps its own <Sidebar>, so navigation would otherwise leak 3 window listeners per page change).

### `src/utils/relativeTime.ts`

- `src/utils/relativeTime.ts:1` — A browser clock that runs ahead of the server would otherwise produce a negative delta, so anything in the future is clamped to "Just now" rather than rendering "in 3 minutes".

---

**225 statements across 6 areas.**
