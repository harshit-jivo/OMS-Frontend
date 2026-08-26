# Branch integration into `test` — 2026-08-26

Complete record of merging **`rathod-updates`, `kamal`, `harshit` and `Mukesh`**
into `test` on `OMS-Frontend`: what was done, what conflicted, how each conflict
was resolved and why, the line-ending repair, and what is deliberately left open.

Written so the decisions can be audited or reversed by someone who was not there.

Companion to [`OMS-Backend/docs/BRANCH_MERGE_2026-08-26.md`](../../OMS-Backend/docs/BRANCH_MERGE_2026-08-26.md),
which covers the same four branches on the backend and the migration-graph repair.
The two were done on the same day against the same set of branch names, but they
are independent repositories with independent histories — nothing here depends on
that document except where a decision is settled by backend code, which is called
out explicitly (§2.3).

---

## 0. Summary

| | |
|---|---|
| Repository | `OMS-Frontend` |
| Target branch | `test` |
| Starting commit | `4a47995` |
| Final commit | `179a38b` |
| Backup | branch `test-backup-20260826` + tag `pre-merge-20260826`, both at `4a47995` |
| Merges | 4 |
| Conflicted files resolved | 5 |
| Merge-caused defects found and fixed | 1 |
| Files renormalised LF | 5 |
| Production build | **passes, 0 TypeScript errors** |
| Pushed | **no** |

Full revert: `git reset --hard pre-merge-20260826`

```
179a38b  chore: add .gitattributes and normalise the five CRLF blobs to LF
becc232  Merge branch 'Mukesh' into test
62921ef  Merge branch 'harshit' into test
8c66d69  Merge branch 'kamal' into test
1be19fc  Merge branch 'rathod-updates' into test
4a47995  (pre-merge-20260826, test-backup-20260826)
```

---

## 1. Approach

Same method as the backend. Four branches merged **one at a time**, not as a
single 4-way merge, so that any breakage is attributable to one merge rather
than to the pile.

Order was chosen by ascending risk, cheapest first:

```
rathod-updates  ->  kamal  ->  harshit  ->  Mukesh
```

Safety measures taken before the first merge:

1. **Backup branch and tag** at the starting commit, so the whole exercise is one
   `git reset --hard` away from being undone.
2. **`git config rerere.enabled true`** — git memorises each conflict resolution
   and replays it if the same conflict recurs. This paid off: the `harshit` merge
   had to be aborted and redone, and nothing had to be resolved twice.
3. **Dry-run every merge first** with `git merge-tree --write-tree --name-only`,
   which simulates the merge without touching refs, the index or the working tree.
4. **`--no-ff` on every merge**, so each is a distinct commit that can be undone
   with `git revert -m 1` even after pushing.
5. **A differential build gate.** `npx tsc -b --force` was run on `test` *before*
   any merge to establish a baseline, so that new errors could be told apart from
   pre-existing ones. This is what caught the one real defect (§4).

### Divergence at the start

| branch | ahead of `test` | behind `test` | base date |
|---|---|---|---|
| `rathod-updates` | 2 | 0 | 2026-08-21 |
| `kamal` | 16 | 17 | 2026-08-21 |
| `harshit` | 2 | 23 | 2026-08-11 |
| `Mukesh` | 12 | **39** | **2026-07-25** |

As on the backend, `Mukesh` had been diverged for a month, forking before several
features existed. That is the root cause of the one genuinely contested conflict
(§2.3): the page in question was rewritten independently on both sides.

> **Not merged:** `production`, `live`, `live-backup`, `live-mart-integration`
> and `payments-feature` were all out of scope for this exercise.

---

## 2. Conflicts, and how each was resolved

### 2.1 Prediction vs reality

| branch | predicted by dry-run | actually conflicted |
|---|---|---|
| `rathod-updates` | none | none |
| `kamal` | none | none |
| `harshit` | `Add_Sales.tsx`, `ordersService.ts` | same 2 — but see §3, they were not real conflicts |
| `Mukesh` | `App.tsx`, `Invoice_Report.tsx`, `Invoice_Report.css`, `Tracker_Queue.tsx`, `einvoiceService.ts`, `trackerService.ts` | only the first 3 |

The dry-runs for `kamal`, `harshit` and `Mukesh` were all taken against the
*original* `test`, so they over-predict: three files predicted to conflict on
`Mukesh` (`Tracker_Queue.tsx`, `einvoiceService.ts`, `trackerService.ts`)
resolved themselves once `kamal` landed, because `kamal` had already brought in
the changes that would have clashed. Re-running the dry-run against the current
`HEAD` immediately before each merge is what makes it useful.

### 2.2 `src/App.tsx` — union

Two hunks, both purely additive on both sides: an import block and a route block.
Kept everything from both.

- from `test`: `HAIS`, `AssetPublicView`, `Inventory_Report`, `SO_Invoice_Report`,
  `Distributor`, `Distributor_Order_Tracking`, `MartApproval`, the
  `/Payments_Dashboard` route and the `/Approval_Management` → `/Payments_Dashboard`
  redirect that keeps old bookmarks working.
- from `Mukesh`: `Ap_Invoice_Entry` and its `/Ap_Invoice_Entry` route — the
  headline feature of his branch.

`Mukesh`'s route is not wrapped in `RequirePermission`, unlike the routes around
it. That is how he wrote it and it was left as-is rather than silently changed
during a merge; see §6.

### 2.3 `src/pages/Invoice_Report.tsx` + `src/styles/Invoice_Report.css` — took `test`'s side

The only genuinely contested conflict. Nine hunks in the `.tsx` and one in the
`.css`, and every one of them is the same disagreement: the two branches hold
**competing implementations of the same page**, not complementary changes.

| | `test` (harshit + kamal) | `Mukesh` |
|---|---|---|
| user enters | `DocNum` | `DocEntry` |
| companies | `BRANCHES` = OIL / BEVERAGE / MART | `COMPANIES` = oil / bev / mart |
| PDF source | `${API_BASE_URL}/invoice/crystal/?docNum=…&branch=…` | `http://138.252.101.118:8008/api/billprint/{company}/{docEntry}` |
| goes through | our own backend | the Crystal service directly |
| viewer badge | `.invr-viewer-branch` | `.invr-viewer-schema` |

Both descend from harshit's `268869d` (2026-07-15) and then diverge:

```
268869d  2026-07-15  harshit   Invoice Report page added
   |
   +-- test:    6be4667 2026-07-27 harshit  DocNum terminology
   |            c88c799 2026-08-03 harshit  branch selection
   |
   +-- Mukesh:  1865dc0 2026-08-12 mukesh   multi-company + schema badge
                e48742a 2026-08-22 mukesh   fix BILLPRINT_BASE URL
```

`Mukesh`'s commits are the *later* ones by date, so the decision was not made on
recency. It was settled by reading the backend, where `invoice/views.GetPrintReport`
turns out to be a strict **superset** of what `Mukesh`'s page does directly:

- its `_CRYSTAL_PATHS` maps `OIL`/`BEVERAGE`/`MART` onto `api/billprint`,
  `api/billprint/bev` and `api/billprint/mart` — the exact same service routes
  `Mukesh`'s page calls;
- it accepts a `docEntry` query parameter as well as `docNum`, skipping the
  `OINV` lookup when the caller already holds the key — so his DocEntry-first
  workflow is available through the proxy;
- it adds a real `'<DocNum> <Party Name>.pdf'` download filename, sanitised.

So taking `test`'s side loses no capability. It also keeps auth and CORS intact
rather than pinning a bare IP into the shipped bundle. `.invr-viewer-schema` was
dropped with the rest: `test` already renders the same information through
`.invr-viewer-branch`, so keeping it would have left dead CSS.

**This is the one place where something from `Mukesh` was deliberately discarded**,
and it is confirmed by the audit in §5. If the direct-to-service page is wanted
after all, it is `git checkout origin/Mukesh -- src/pages/Invoice_Report.tsx
src/styles/Invoice_Report.css` — but the backend endpoint should then be retired
too, rather than leaving two paths to the same PDF.

---

## 3. The line-ending trap

`harshit`'s merge appeared to conflict over the entire contents of both files:

```
src/pages/Add_Sales.tsx        <<<<<<< at line 1, ======= at 4391, >>>>>>> at 8682
src/services/ordersService.ts  <<<<<<< at line 1, ======= at 900,  >>>>>>> at 1604
```

A single conflict hunk spanning the whole file means git matched *no* lines at
all between the two sides. The cause is that `harshit` committed these files with
**CRLF baked into the blobs** while `test`'s are LF. Git compares blobs byte for
byte, so every line differs.

The real changes were tiny:

```
$ git diff --numstat <base> origin/harshit -- src/services/ordersService.ts
703  699                        <- what a plain diff reports
$ git diff --numstat --ignore-cr-at-eol <base> origin/harshit -- src/services/ordersService.ts
4    0                          <- the REAL change

$ git diff --numstat --ignore-cr-at-eol <base> origin/harshit -- src/pages/Add_Sales.tsx
29   9                          <- 4,290 lines of conflict for this
```

Fix: abort and re-merge with renormalisation, which does a virtual check-in of
all three merge stages so they are compared in normalised form.

```
git merge --abort
git merge --no-ff -Xrenormalize origin/harshit
```

Both files then merged with no conflict at all.

### Two false negatives that cost real time

Worth recording, because both look like proof that line endings are *not* the
problem:

1. **`git ls-files --eol` lies here.** It reports index and working-tree state,
   and cheerfully shows `i/lf` for a file whose committed blob is CRLF.
2. **mingw `awk` and `grep` strip `\r` before matching.** A `/\r$/` test therefore
   reports zero CRLF lines on a file that is entirely CRLF. This produced a
   confident, completely wrong "no CRLF anywhere" reading mid-diagnosis. On this
   machine `grep -P` is not available either — it fails with
   `-P supports only unibyte and UTF-8 locales`.

What actually works:

```bash
git show <ref>:<path> | tr -cd '\r' | wc -c          # non-zero => CRLF blob
git diff --numstat --ignore-cr-at-eol A B -- <path>  # the real change size
```

### Renormalising only fixes what conflicts

`-Xrenormalize` rescued the two files that *conflicted*. Files taken wholesale
from a CRLF side merge without complaint and carry their CRLF straight into the
result. Five files arrived in `test` that way:

| file | from |
|---|---|
| `src/pages/Scheme_Manager.tsx` | `harshit` |
| `src/services/schemeService.ts` | `harshit` |
| `src/styles/Scheme_Manager.css` | `harshit` |
| `src/pages/SalesInvoice/ContentsTab.tsx` | `kamal` |
| `src/styles/SO_Invoice_Report.css` | `kamal` |

Commit `179a38b` adds `.gitattributes` with `* text=auto` (plus explicit
per-extension rules) and runs `git add --renormalize .`, converting all five to
LF. Windows working copies are unaffected — `core.autocrlf=true` still checks
files out with CRLF locally.

That commit changes **no content**: `git diff --cached --numstat --ignore-cr-at-eol`
reported zero changed lines for all five files, the only additions being
`.gitattributes` itself. Verified afterwards that no CRLF blob remains anywhere
in the repository.

---

## 4. The defect the merge caused

One, and it would have shipped silently.

### `formData.warehouse` deleted by the `harshit` merge

`src/pages/Add_Sales.tsx` declares the sales form's state as one `useState`
object literal. **Both sides declared a `warehouse` key** — but in different
positions with different defaults:

```jsonc
// test                                    // harshit
  company: "",                               company: "",
  comment: "",                               warehouse: "",      <- before comment
  // Company-3 (Mart) orders pick a          comment: "",
  // dispatch warehouse. Display-only
  // for now — not sent to the backend.
  // Defaults to GP-FGM.
  warehouse: "GP-FGM",   <- after comment
```

`ort` read this as the line being moved on both sides and resolved it as a delete
on both, producing a merge result that **kept the explanatory comment and removed
the field it describes**:

```jsonc
  comment: "",
  // Company-3 (Mart) orders pick a dispatch warehouse. Display-only for now —
  // not sent to the backend. Defaults to GP-FGM.
});                        // <- warehouse gone
```

No conflict was raised. It surfaced only because of the baseline build gate —
five new `tsc` errors at `Add_Sales.tsx` lines 695, 834, 936, 1095 and 2208,
all variants of *"Property 'warehouse' does not exist"*.

Restored with `test`'s `"GP-FGM"` default, which is what every surviving reader
expects — lines 695 and 834 both fall back to exactly that string. Its comment
was also corrected while restoring: it claimed the field was display-only and not
sent to the backend, but lines 936 and 1095 now submit it as `warehouse_code`.

Note the fix lands in `becc232` (the `Mukesh` merge) although the loss was
introduced one commit earlier in `62921ef` (the `harshit` merge) — it was not
detected until the build gate was next run.

> This is the same failure mode as the backend's `InvocieHistory.device_id`
> loss, and the same lesson: **a clean merge is not a correct merge.** Nothing in
> git's output flagged either one.

---

## 5. Lost-symbol audit

To check that nothing else disappeared quietly, every top-level declaration each
branch introduced was compared against the merged tree — exported and
non-exported functions, consts, classes, interfaces, types and enums for
`.ts`/`.tsx`, and class selectors for `.css`.

| branch | symbols missing from the merge |
|---|---|
| `rathod-updates` | none |
| `kamal` | none |
| `harshit` | none |
| `Mukesh` | `BILLPRINT_BASE`, `COMPANIES`, `.invr-viewer-schema` |

The three hits on `Mukesh` are exactly the deliberate decision in §2.3 and
nothing else. No unintended loss anywhere.

### The audit was wrong the first time

Worth recording. The first run compared each branch against
`merge-base(HEAD, branch)`. Once a branch is merged, that merge base **is the
branch's own tip** — so every branch was diffed against itself, touched no files,
and passed vacuously with `TOTAL missing symbols: 0`.

It was caught only because that clean result contradicted a known fact: three
symbols had just been discarded on purpose in §2.3, so "nothing missing" could
not be true. The fix is to measure divergence from the **pre-merge** ref:

```python
base = git("merge-base", "test-backup-20260826", branch)   # not HEAD
```

which is another reason the backup ref earns its keep beyond disaster recovery.
A validator that cannot fail is not a validator; if it reports all-clear, confirm
it can still report something else.

Script: `fe_lost_symbols.py` (scratchpad, not committed). It deliberately
over-reports — a symbol renamed or removed on purpose shows up too — so each hit
needs reading rather than trusting the count.

---

## 6. Open items

Deliberately not done, each with the reason.

1. **Not pushed.** Everything is local. `test` is 5 commits ahead of
   `origin/test`.
2. **`/Ap_Invoice_Entry` has no `RequirePermission` wrapper**, unlike the routes
   around it. That is how `Mukesh` wrote it. Adding page-permission gating is a
   product decision, not a merge resolution, and silently changing access control
   inside a merge commit would be the wrong place for it.
3. **Two paths to the same Crystal PDF now exist** — the backend proxy that the
   merged frontend uses, and the direct service route that `Mukesh`'s page used.
   The direct route is no longer called from `test`, but nothing stops it being
   called. Retiring one is worth a decision (§2.3).
4. **`origin/production` and `origin/live` are not merged** and remain diverged.
5. **Bundle size.** `dist/assets/index-*.js` is 2.71 MB (729 KB gzipped) and the
   build warns about it. Pre-existing, made no worse by the merge, but the merged
   `test` now carries noticeably more pages than any single branch did.
6. **`npm audit` reports 16 vulnerabilities** (12 high). Pre-existing and
   untouched — dependency bumps do not belong in a merge commit.

---

## 7. Verification

The merged tree was checked by a full production build, not just a typecheck.

```bash
npm ci          # lockfile untouched; confirmed with git status
npm run build   # tsc -b && vite build
```

Result: **0 TypeScript errors**, 855 modules transformed, build succeeded.

A note on the baseline: before `npm ci`, `tsc` reported 4 errors on `test` in
`src/pages/HAIS/AssetQr.tsx` and `QrScanner.tsx`. These were **not** code
problems — `qrcode.react` and `html5-qrcode` are listed in `package.json` but
were absent from a stale `node_modules`. They were carried as a known baseline
during the merges and disappeared once dependencies were installed properly. The
differential gate still did its job: the 5 `warehouse` errors in §4 stood out
against those 4 precisely because the baseline was known.

---

## 8. Reproducing the checks

```bash
# predict a merge without touching anything
git merge-tree --write-tree --name-only HEAD origin/<branch>

# is a whole-file conflict really a line-ending problem?
git show <ref>:<path> | tr -cd '\r' | wc -c
git diff --numstat --ignore-cr-at-eol <base> origin/<branch> -- <path>

# any CRLF blobs left in the repo?
for f in $(git ls-files); do
  cr=$(git show HEAD:"$f" 2>/dev/null | tr -cd '\r' | wc -c)
  [ "$cr" -gt 0 ] && echo "$f ($cr)"
done

# does the merged tree actually build?
npm ci && npm run build

# undo everything
git reset --hard pre-merge-20260826
```
