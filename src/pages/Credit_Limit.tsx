/**
 * Credit Limit — ask for a customer's SAP credit limit to be changed.
 *
 * The requester picks a company, then one or more parties from that company's
 * synced SAP party table; each is read LIVE from SAP (name, main group,
 * balance and current limit) — the synced table can be stale — and gets its
 * own new limit and valid-till date. Every party becomes its own request on
 * its own approval chain, written to SAP on its final approval. Remarks and
 * the supporting document are shared by the submission; the document is
 * required only when a single party is raised.
 *
 * Route access comes from the `Credit_Limit` key via `ProtectedPage` — this
 * page carries no gate of its own. Structure follows BackDate: a list tab and
 * a create tab, one detail dialog shared with the approval desk.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiArrowPath,
  HiOutlineCreditCard,
  HiOutlineUsers,
  HiPlus,
  HiXMark,
} from "react-icons/hi2";

import { Button } from "../components/ui/button";
import { Field, FormGrid, Input, Select, Textarea } from "../components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Card, Notice, Page, PageHeader } from "../components/ui/page";
import { Tab, TabList } from "../components/ui/tabs";
import {
  CREDIT_LIMIT_COMPANIES,
  attachmentRequired,
  creditLimitError,
  creditLimitLineErrors,
  creditLimitService,
  type CreditLimitCompany,
  type CreditLimitCustomer,
  type CreditLimitRequest,
} from "../services/creditLimitService";
import type { Party } from "../services/sapService";
import { formatAmount, todayIso } from "./creditLimit/format";
import {
  CompanyFilterControl,
  RequestDetailDialog,
  RequestTable,
  StateBlock,
  StatusFilterControl,
  type CompanyFilter,
  type StatusFilter,
} from "./creditLimit/shared";
import { AttachmentPicker } from "./creditLimit/AttachmentPicker";
import { PartyPickerDialog } from "./creditLimit/PartyPickerDialog";
import { useLinkedRequest } from "./creditLimit/useLinkedRequest";

export default function CreditLimit() {
  const [rows, setRows] = useState<CreditLimitRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"entries" | "create">("entries");
  const [detail, setDetail] = useState<CreditLimitRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(
        await creditLimitService.listRequests({
          ...(companyFilter ? { company: companyFilter } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
        }),
      );
    } catch (e) {
      setError(creditLimitError(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, companyFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // A notification links here with `?request=<id>`.
  useLinkedRequest((request) => {
    setTab("entries");
    setDetail(request);
  }, setError);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 6000);
  };

  return (
    <Page>
      <PageHeader
        title="Credit Limit"
        description="Request a change to a customer's credit limit in SAP"
        eyebrow={<HiOutlineCreditCard aria-hidden />}
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <HiArrowPath aria-hidden /> Refresh
          </Button>
        }
      />

      {notice && (
        <Notice tone="ok" className="mb-4">
          {notice}
        </Notice>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <TabList label="Credit Limit">
          <Tab selected={tab === "entries"} onClick={() => setTab("entries")}>
            My Requests
          </Tab>
          <Tab selected={tab === "create"} onClick={() => setTab("create")}>
            <HiPlus aria-hidden /> New Request
          </Tab>
        </TabList>

        {tab === "entries" && (
          <div className="flex flex-wrap items-center gap-2">
            <CompanyFilterControl value={companyFilter} onChange={setCompanyFilter} />
            <StatusFilterControl value={statusFilter} onChange={setStatusFilter} />
          </div>
        )}
      </div>

      {tab === "create" ? (
        <NewRequestForm
          onCancel={() => setTab("entries")}
          onCreated={(message) => {
            flash(message);
            setTab("entries");
            void load();
          }}
        />
      ) : (
        <Card className="p-4 md:p-5">
          <StateBlock
            loading={loading}
            error={error}
            empty={rows.length === 0}
            emptyText={
              statusFilter || companyFilter
                ? `No ${statusFilter ? statusFilter.toLowerCase() + " " : ""}` +
                  `credit limit requests${companyFilter ? ` for ${companyFilter}` : ""}.`
                : "You have not raised any credit limit requests yet."
            }
          />
          {!loading && !error && rows.length > 0 && (
            <RequestTable rows={rows} onOpen={setDetail} />
          )}
        </Card>
      )}

      <RequestDetailDialog request={detail} onClose={() => setDetail(null)} />
    </Page>
  );
}

/* ================================================================== *
 * New request — one or more parties
 * ================================================================== */

/** One party on the form: what was picked, what SAP says about it now, and
 *  what the requester is asking for. */
type Line = {
  party: Party;
  customer: CreditLimitCustomer | null;
  lookingUp: boolean;
  lookupError: string;
  new_credit_limit: string;
  valid_till: string;
  /** Why this line was refused on the last submit attempt. */
  serverError: string;
};

function NewRequestForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (message: string) => void;
}) {
  const [company, setCompany] = useState<CreditLimitCompany>("OIL");
  const [lines, setLines] = useState<Line[]>([]);
  const [remarks, setRemarks] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  /** Bumped when the company changes, so a look-up answer for the previous
   *  company's parties is dropped rather than written onto the new list. */
  const generation = useRef(0);

  const needsFile = attachmentRequired(lines.length);
  const added = useMemo(() => new Set(lines.map((l) => l.party.card_code)), [lines]);

  const patch = (cardCode: string, change: Partial<Line>) =>
    setLines((current) =>
      current.map((l) => (l.party.card_code === cardCode ? { ...l, ...change } : l)),
    );

  const lookUp = async (cardCode: string) => {
    const gen = generation.current;
    patch(cardCode, { lookingUp: true, lookupError: "", customer: null });
    try {
      const live = await creditLimitService.customer(company, cardCode);
      if (gen === generation.current) patch(cardCode, { customer: live, lookingUp: false });
    } catch (e) {
      if (gen === generation.current) {
        patch(cardCode, { lookupError: creditLimitError(e), lookingUp: false });
      }
    }
  };

  /** Parties belong to a company: a different company starts the list over. */
  const changeCompany = (next: CreditLimitCompany) => {
    generation.current += 1;
    setCompany(next);
    setLines([]);
    setFormError("");
  };

  const addParties = (parties: Party[]) => {
    setPickerOpen(false);
    setFormError("");
    // A new row starts with the date already used above it — a batch is
    // usually raised for one period.
    const validTill = lines[lines.length - 1]?.valid_till ?? "";
    const fresh = parties.filter((p) => !added.has(p.card_code));
    setLines((current) => [
      ...current,
      ...fresh.map((party) => ({
        party,
        customer: null,
        lookingUp: true,
        lookupError: "",
        new_credit_limit: "",
        valid_till: validTill,
        serverError: "",
      })),
    ]);
    for (const party of fresh) void lookUp(party.card_code);
  };

  const remove = (cardCode: string) =>
    setLines((current) => current.filter((l) => l.party.card_code !== cardCode));

  /** The first problem with a line, or "" — checked before anything is sent. */
  const lineProblem = (l: Line) => {
    if (l.lookingUp) return "Still reading this customer from SAP.";
    if (!l.customer) return "This customer could not be read from SAP.";
    const amount = Number(l.new_credit_limit);
    if (!l.new_credit_limit || Number.isNaN(amount) || amount < 1) {
      return "Enter the new credit limit (at least 1).";
    }
    if (!l.valid_till) return "Choose the date the new limit is valid till.";
    if (l.valid_till < todayIso()) return "Valid till cannot be in the past.";
    return "";
  };

  const save = async () => {
    if (lines.length === 0) {
      setFormError("Add at least one party.");
      return;
    }
    const problems = lines.map(lineProblem);
    if (problems.some(Boolean)) {
      setLines((current) => current.map((l, i) => ({ ...l, serverError: problems[i] })));
      setFormError("Some parties need attention — see the rows marked below.");
      return;
    }
    if (needsFile && files.length === 0) {
      setFormError("A supporting document is required for a single-party request.");
      return;
    }
    setSaving(true);
    setFormError("");
    setLines((current) => current.map((l) => ({ ...l, serverError: "" })));
    try {
      const created = await creditLimitService.createRequest({
        company,
        lines: lines.map((l) => ({
          card_code: l.party.card_code,
          new_credit_limit: l.new_credit_limit,
          valid_till: l.valid_till,
        })),
        remarks,
        attachments: files,
      });
      setLines([]);
      setRemarks("");
      setFiles([]);
      onCreated(
        created.length > 1
          ? `${created.length} credit limit requests submitted (#${created
              .map((r) => r.id)
              .join(", #")}).`
          : created[0]?.id
            ? `Credit limit request #${created[0].id} submitted.`
            : "Credit limit request submitted.",
      );
    } catch (e) {
      const byLine = creditLimitLineErrors(e);
      setLines((current) => current.map((l, i) => ({ ...l, serverError: byLine[i] ?? "" })));
      setFormError(creditLimitError(e));
    } finally {
      setSaving(false);
    }
  };

  const ready = lines.length > 0 && lines.every((l) => l.customer && !l.lookingUp);

  return (
    <Card className="p-4 md:p-5">
      <div className="mb-4">
        <h2 className="m-0 text-[15px] font-semibold text-ink">New Credit Limit Request</h2>
        <p className="m-0 mt-0.5 text-[13px] text-subtle">
          Add one or more parties. Each becomes its own request and is approved on its
          own; balances and current limits are read live from SAP.
        </p>
      </div>

      <div className="space-y-4">
        {formError && (
          <Notice tone="bad">
            <span className="whitespace-pre-wrap">{formError}</span>
          </Notice>
        )}

        <FormGrid>
          <Field
            label="Company"
            required
            hint={lines.length ? "Changing the company clears the parties below." : undefined}
          >
            {(c) => (
              <Select
                {...c}
                value={company}
                onChange={(e) => changeCompany(e.target.value as CreditLimitCompany)}
              >
                {CREDIT_LIMIT_COMPANIES.map((co) => (
                  <option key={co} value={co}>
                    {co}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FormGrid>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-[13px] font-semibold text-ink">
              Parties{lines.length ? ` (${lines.length})` : ""}
            </h3>
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              <HiOutlineUsers aria-hidden />{" "}
              {lines.length ? "Add more parties" : "Select parties"}
            </Button>
          </div>

          {lines.length === 0 ? (
            <p className="m-0 py-3 text-[13px] text-subtle">
              No parties yet — select one or more from the {company} party list.
            </p>
          ) : (
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Party</TableHead>
                  <TableHead>Main group</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Current limit</TableHead>
                  <TableHead className="min-w-[140px]">New limit</TableHead>
                  <TableHead className="min-w-[150px]">Valid till</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Remove</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  const code = l.party.card_code;
                  const name = l.customer?.card_name || l.party.card_name;
                  const problem = l.serverError || l.lookupError;
                  const pending = l.lookingUp ? "…" : "—";
                  return (
                    <Fragment key={code}>
                      <TableRow data-invalid={problem ? "true" : undefined}>
                        <TableCell className="min-w-[180px]">
                          <span className="font-mono text-[12.5px] font-semibold text-ink">
                            {code}
                          </span>
                          <span className="block truncate text-[12.5px] text-subtle">{name}</span>
                        </TableCell>
                        <TableCell className="text-subtle">
                          {l.customer?.main_group || pending}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.customer ? formatAmount(l.customer.balance) : pending}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {l.customer ? formatAmount(l.customer.credit_limit) : pending}
                        </TableCell>
                        <TableCell>
                          <Input
                            aria-label={`New credit limit for ${code}`}
                            type="number"
                            inputMode="decimal"
                            min={1}
                            step="0.01"
                            value={l.new_credit_limit}
                            onChange={(e) =>
                              patch(code, { new_credit_limit: e.target.value, serverError: "" })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            aria-label={`Valid till for ${code}`}
                            type="date"
                            min={todayIso()}
                            value={l.valid_till}
                            onChange={(e) =>
                              patch(code, { valid_till: e.target.value, serverError: "" })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove ${code}`}
                            onClick={() => remove(code)}
                          >
                            <HiXMark aria-hidden />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {problem && (
                        <TableRow>
                          <TableCell colSpan={7} className="pt-0 text-[12.5px] text-bad">
                            {problem}
                            {l.lookupError && !l.lookingUp && (
                              <Button
                                variant="link"
                                size="inline"
                                className="ml-2"
                                onClick={() => void lookUp(code)}
                              >
                                Retry
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <FormGrid>
          <AttachmentPicker
            files={files}
            onChange={setFiles}
            required={needsFile}
            hint={
              needsFile
                ? "At least one is required for a single-party request. Add as many as needed."
                : lines.length > 1
                  ? "Optional when several parties are raised together; shared by all of them."
                  : "Required for one party, optional for several."
            }
          />
        </FormGrid>

        <Field
          label="Remarks"
          hint={lines.length > 1 ? "Shared by every request in this submission." : undefined}
        >
          {(c) => (
            <Textarea
              {...c}
              rows={3}
              value={remarks}
              placeholder="Why the limit should change"
              onChange={(e) => setRemarks(e.target.value)}
            />
          )}
        </Field>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving || !ready}>
            {saving
              ? "Submitting…"
              : lines.length > 1
                ? `Submit ${lines.length} Requests`
                : "Submit Request"}
          </Button>
        </div>
      </div>

      <PartyPickerDialog
        open={pickerOpen}
        company={company}
        added={added}
        onClose={() => setPickerOpen(false)}
        onAdd={addParties}
      />
    </Card>
  );
}
