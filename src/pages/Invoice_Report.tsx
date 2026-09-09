import { useState } from "react";
import type { FormEvent } from "react";
import {
  HiOutlineArrowTopRightOnSquare,
  HiOutlineDocumentText,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
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
import { SegmentedControl } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useBillPrint, openBillPrint } from "../hooks/useBillPrint";

// Oil, beverage and mart are separate SAP company databases with separate
// Crystal reports, and the same DocNum exists in all three meaning a DIFFERENT
// invoice — so the branch travels with the request and decides which one is
// resolved and rendered. Getting it wrong prints someone else's invoice, not an
// error.
const BRANCHES = [
  { value: "OIL", label: "Oil" },
  { value: "BEVERAGE", label: "Beverage" },
  { value: "MART", label: "Mart" },
] as const;

type Branch = (typeof BRANCHES)[number]["value"];

const branchLabel = (value: Branch) =>
  BRANCHES.find((b) => b.value === value)?.label ?? value;

// Bill prints are proxied through our own backend (it resolves DocNum ->
// DocEntry against the branch's OINV, then streams the Crystal PDF back).
//
// The URL used to be put straight into the <iframe> and the "open in new tab"
// link. That could not work: those are browser navigations, so no
// Authorization header is attached, and this project authenticates with JWT
// alone — no session cookie to fall back on. The request arrived anonymous at
// a view inheriting IsAuthenticated.
//
// It now goes through axios (services/invoicePrint.ts), which attaches the
// token, refreshes and retries on a 401, and turns a failure into a message
// instead of a blank rectangle.

export default function Invoice_Report() {

  const [docNum, setDocNum] = useState("");
  const [branch, setBranch] = useState<Branch>("OIL");
  // The branch the currently previewed PDF was fetched with — switching the
  // selector must not silently repoint the open preview.
  const [activeBranch, setActiveBranch] = useState<Branch>("OIL");
  const [activeDocNum, setActiveDocNum] = useState("");
  const [error, setError] = useState("");

  // Holds the PDF as an object URL and revokes the previous one on every
  // replacement — a preview per invoice, over a long session, otherwise pins
  // every PDF in memory for the life of the tab.
  const preview = useBillPrint();

  // ── Route access: now decided once, in components/ProtectedPage.tsx ───────
  // The guard that used to sit here is commented out below rather than removed.
  //
  // It was not merely redundant, it was WRONG, and in the direction that hurts:
  // `role !== "billing"` bounced an administrator off a page the sidebar showed
  // them and the API served them, because it compared the primary role string
  // alone — no `extra_roles`, no `is_superuser`, no `is_staff`. Two guards that
  // disagree are worse than one, and this was the one that was mistaken.
  //
  //   const role = (localStorage.getItem("role") || "").toLowerCase();
  //   if (role !== "billing") return <Navigate to="/Home" replace />;
  //
  // `auth/routeAccess.ts` carries the same rule (`roles: ["billing"]`) with the
  // admin bypass every other route gets.

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = docNum.trim();
    if (!/^\d+$/.test(trimmed)) {
      setError("Enter a valid numeric Doc Number.");
      return;
    }
    setError("");
    setActiveBranch(branch);
    setActiveDocNum(trimmed);
    // No clear-then-reset dance any more. That existed because the iframe only
    // reloaded when its `src` changed, so re-submitting the same Doc Number
    // did nothing; fetching explicitly re-runs whether or not anything changed.
    preview.load({ docNum: trimmed, branch });
  };

  const handleClear = () => {
    setDocNum("");
    setActiveDocNum("");
    setError("");
    preview.load(null);
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Invoices" }, { label: "Invoice Report" }]} />

      <PageHeader
        title="Invoice Report"
        description="Pick a company and enter a Doc Number to fetch and preview the invoice bill print."
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id="invr-branch-label" className="text-[12px] font-medium text-body">
              Company
            </span>
            {/* Was a local `BranchPicker`, on the grounds that it was the only
                segmented control in the app. It was the only CONVERTED one —
                Inventory Report and Open SO had their own — so it is
                `ui/segmented` now. */}
            <SegmentedControl
              aria-labelledby="invr-branch-label"
              value={branch}
              onChange={setBranch}
              options={BRANCHES}
            />
          </div>

          {/* The error belongs to this field, not to the page: it is "that is
              not a Doc Number", said where the Doc Number is typed. */}
          <Field
            label="Doc Number"
            error={error || undefined}
            className="min-w-[200px] flex-1 basis-[200px]"
          >
            {(control) => (
              <Input
                {...control}
                type="text"
                inputMode="numeric"
                placeholder="e.g. 626070545"
                value={docNum}
                onChange={(e) => setDocNum(e.target.value)}
                autoComplete="off"
              />
            )}
          </Field>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button type="submit" variant="primary">
              <HiOutlineMagnifyingGlass aria-hidden="true" /> Get Invoice
            </Button>
            {activeDocNum ? (
              <Button type="button" onClick={handleClear}>
                <HiOutlineXMark aria-hidden="true" /> Clear
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      {activeDocNum ? (
        <Card className="p-0">
          <CardHeader className="mb-0 border-b border-line px-4 py-3">
            <CardTitle className="flex items-center gap-2">
              <HiOutlineDocumentText
                aria-hidden="true"
                className="size-4 text-subtle [stroke-width:1.5]"
              />
              Bill_{activeDocNum}.pdf
              {/* The branch of the PDF ON SCREEN, which is not necessarily the
                  one in the picker — the same DocNum is a different invoice in
                  each company, so this has to say which one you are looking
                  at. */}
              <Badge tone="neutral">{branchLabel(activeBranch)}</Badge>
            </CardTitle>
            {/* A button, not a link: the PDF has to be FETCHED with the access
                token before there is anything to open, and an <a href> to the
                endpoint sends no token at all. `openBillPrint` opens the tab
                synchronously and points it at the blob afterwards, so the
                popup blocker still attributes it to this click. */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={preview.loading}
              onClick={() => {
                void openBillPrint({ docNum: activeDocNum, branch: activeBranch })
                  .then((message) => setError(message));
              }}
            >
              <HiOutlineArrowTopRightOnSquare aria-hidden="true" /> Open in new tab
            </Button>
          </CardHeader>

          <div className="p-4">
            {preview.loading ? (
              <Skeleton className="h-[70vh] min-h-[420px] w-full" />
            ) : null}
            {preview.error ? <Notice tone="bad">{preview.error}</Notice> : null}
            {/* An <iframe> handed an error response renders a blank rectangle or
                raw JSON, so it is only mounted once there is a real PDF. */}
            {preview.url ? (
              <iframe
                className="h-[70vh] min-h-[420px] w-full rounded-sm border border-line bg-surface"
                title={`Invoice ${activeDocNum}`}
                src={preview.url}
              />
            ) : null}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={HiOutlineDocumentText}
            title="No invoice loaded yet"
            hint="Enter a Doc Number above to fetch its bill print and preview the PDF here."
          />
        </Card>
      )}
    </Page>
  );
}
