/**
 * Budget Settings — is the feed alive, and the auto-approval rule.
 *
 * FEED: when each company last synced from SAP, what is pending, and how many
 * decisions SAP has not taken. JSAP's production feed died for seven weeks
 * while its job reported success every minute; this card is the answer to
 * "is it working?" without opening the server.
 *
 * AUTO-APPROVAL: an item waiting longer than the set hours is approved on the
 * stage's behalf — only within SAP's monthly budget for the head, never when a
 * month has no budget in SAP, and never for the users listed as exempt
 * (JSAP hard-coded three ids instead). Off until someone turns it on.
 *
 * `Budget_Settings` opens the page (routeAccess.ts) and saves; the server
 * checks the same key.
 */
import { useEffect, useMemo, useState } from "react";
import { HiExclamationCircle } from "react-icons/hi2";

import { showToast } from "@/lib/toastStore";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
import { Button } from "../components/ui/button";
import { MultiSelect } from "../components/ui/dropdown";
import { Checkbox, Field, FormActions, FormGrid, Input } from "../components/ui/form";
import { Card, CardHeader, CardTitle, Page, PageHeader } from "../components/ui/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import {
  budgetError,
  budgetService,
  type BudgetHealth,
  type BudgetUser,
} from "../services/budgetService";

function when(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Older than this, a company's last sync is shown as a problem: the job runs every 5 minutes. */
const STALE_MINUTES = 30;

export default function BudgetSettings() {
  const [health, setHealth] = useState<BudgetHealth[]>([]);
  const [users, setUsers] = useState<BudgetUser[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState("48");
  const [exempt, setExempt] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([budgetService.settings(), budgetService.health(), budgetService.users()])
      .then(([settings, feed, people]) => {
        setEnabled(settings.auto_approve_enabled);
        setHours(String(settings.auto_approve_hours));
        setExempt(settings.exempt_users.map((u) => u.id));
        setHealth(feed);
        setUsers(people);
      })
      .catch((err) => setError(budgetError(err)))
      .finally(() => setLoading(false));
  }, []);

  const options = useMemo(
    () => users.map((u) => ({ value: u.id, label: `${u.name} (${u.username})` })),
    [users],
  );

  const hoursValue = Number(hours);
  const hoursError = !Number.isInteger(hoursValue) || hoursValue < 1 || hoursValue > 720
    ? "A whole number of hours, 1 to 720."
    : "";

  const save = async () => {
    if (hoursError) return;
    setSaving(true);
    setError("");
    try {
      const saved = await budgetService.saveSettings({
        auto_approve_enabled: enabled,
        auto_approve_hours: hoursValue,
        exempt_user_ids: exempt,
      });
      setExempt(saved.exempt_users.map((u) => u.id));
      showToast({ title: "Saved", message: "Budget auto-approval settings saved.", tone: "ok" });
    } catch (err) {
      setError(budgetError(err));
    } finally {
      setSaving(false);
    }
  };

  const stale = (iso: string | null) =>
    !iso || Date.now() - new Date(iso).getTime() > STALE_MINUTES * 60_000;

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Budget" }, { label: "Budget Settings" }]} />
      <PageHeader
        title="Budget Settings"
        description="Whether the SAP feed is alive, and when budget approvals may be approved automatically."
      />

      {error && (
        <Card className="border-bad/40 bg-bad/5">
          <div className="flex items-start gap-2 p-3 text-[13px] text-bad" role="alert">
            <HiExclamationCircle className="mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        </Card>
      )}

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>SAP feed</CardTitle>
        </CardHeader>
        {loading ? (
          <p className="m-0 text-[13px] text-subtle">Loading…</p>
        ) : health.length === 0 ? (
          <p className="m-0 text-[13px] text-subtle">
            Budget approval is not switched on for any company on this server (BUDGET_SAP_SCHEMAS).
          </p>
        ) : (
          <Table density="compact" aria-label="SAP feed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Company</TableHead>
                <TableHead>Last synced</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">SAP writes failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.map((row) => (
                <TableRow key={row.company}>
                  <TableCell className="font-medium">{row.company}</TableCell>
                  <TableCell className={stale(row.last_synced_at) ? "text-bad" : undefined}>
                    {when(row.last_synced_at)}
                    {stale(row.last_synced_at) ? (
                      <span className="block text-[11px]">Not in the last {STALE_MINUTES} minutes</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.pending}</TableCell>
                  <TableCell className={`text-right tabular-nums ${row.sap_write_failed ? "text-bad" : ""}`}>
                    {row.sap_write_failed}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>Auto-approval</CardTitle>
        </CardHeader>
        <p className="m-0 mb-3 text-[12.5px] text-subtle">
          An item waiting longer than the hours below is approved on its stage's behalf — only while the head's
          posted spend for the month plus the item stays within SAP's monthly budget. A month with no budget in
          SAP is never auto-approved. Approvers are never shown the budget.
        </p>
        <FormGrid className="md:grid-cols-3">
          <Checkbox
            label="Auto-approve"
            hint="Off until someone turns it on."
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={loading}
          />
          <Field label="After (hours)" required error={hoursError || undefined}>
            {(control) => (
              <Input
                {...control}
                type="number"
                min={1}
                max={720}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                disabled={loading}
              />
            )}
          </Field>
          <Field label="Never auto-approve for" hint="Their items always wait for them (or their stand-in).">
            {(control) => (
              <MultiSelect<number>
                id={control.id}
                value={exempt}
                onChange={setExempt}
                options={options}
                placeholder="Nobody"
                searchable
                searchPlaceholder="Search user…"
                emptyText="No user matches"
              />
            )}
          </Field>
        </FormGrid>
        <FormActions>
          <Button onClick={() => void save()} disabled={loading || saving || Boolean(hoursError)}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </FormActions>
      </Card>
    </Page>
  );
}
