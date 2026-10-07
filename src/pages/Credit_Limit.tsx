/**
 * Credit Limit — ask for a customer's SAP credit limit to be changed.
 *
 * The requester picks a company, then a party from that company's synced SAP
 * party table; the customer is then read LIVE from SAP (name, main group,
 * balance and current limit) — the synced table can be stale — and the
 * requester asks for a new limit valid until a date, with a supporting file.
 * The request then goes through whatever approval chain the Workflow Engine
 * selects; on the final approval the new limit is written to SAP.
 *
 * Route access comes from the `Credit_Limit` key via `ProtectedPage` — this
 * page carries no gate of its own. Structure follows BackDate: a list tab and
 * a create tab, one detail dialog shared with the approval desk.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HiArrowPath,
  HiOutlineCreditCard,
  HiOutlineUsers,
  HiPlus,
} from "react-icons/hi2";

import { Button } from "../components/ui/button";
import { DetailField, DetailGrid } from "../components/ui/detail";
import { Field, FormGrid, Input, Select, Textarea } from "../components/ui/form";
import { Card, Notice, Page, PageHeader } from "../components/ui/page";
import { Tab, TabList } from "../components/ui/tabs";
import {
  CREDIT_LIMIT_COMPANIES,
  creditLimitError,
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
import { PartyPickerDialog } from "./creditLimit/PartyPickerDialog";

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
 * New request
 * ================================================================== */

type FormState = {
  company: CreditLimitCompany;
  new_credit_limit: string;
  valid_till: string;
  remarks: string;
};

const EMPTY_FORM: FormState = {
  company: "OIL",
  new_credit_limit: "",
  valid_till: "",
  remarks: "",
};

function NewRequestForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (message: string) => void;
}) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** The row picked from the synced party table — it supplies the card code. */
  const [party, setParty] = useState<Party | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  /** The same customer read LIVE from SAP, which is what the form shows. */
  const [customer, setCustomer] = useState<CreditLimitCustomer | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  /** Drops a look-up answer that arrives after the company or party changed. */
  const lookupSeq = useRef(0);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const lookUp = async (company: CreditLimitCompany, cardCode: string) => {
    const seq = ++lookupSeq.current;
    setLookingUp(true);
    setLookupError("");
    setCustomer(null);
    try {
      const live = await creditLimitService.customer(company, cardCode);
      if (seq === lookupSeq.current) setCustomer(live);
    } catch (e) {
      if (seq === lookupSeq.current) setLookupError(creditLimitError(e));
    } finally {
      if (seq === lookupSeq.current) setLookingUp(false);
    }
  };

  /** Parties belong to a company: a different company forgets the last one. */
  const changeCompany = (company: CreditLimitCompany) => {
    lookupSeq.current += 1;
    setForm((f) => ({ ...f, company }));
    setParty(null);
    setCustomer(null);
    setLookingUp(false);
    setLookupError("");
  };

  const pickParty = (picked: Party) => {
    setPickerOpen(false);
    setParty(picked);
    setFormError("");
    void lookUp(form.company, picked.card_code);
  };

  const save = async () => {
    if (!party || !customer) {
      setFormError("Select a party and wait for its SAP details before submitting.");
      return;
    }
    const amount = Number(form.new_credit_limit);
    if (!form.new_credit_limit || Number.isNaN(amount) || amount < 1) {
      setFormError("Enter the new credit limit (at least 1).");
      return;
    }
    if (!form.valid_till) {
      setFormError("Choose the date the new limit is valid till.");
      return;
    }
    if (form.valid_till < todayIso()) {
      setFormError("Valid till cannot be in the past.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const created = await creditLimitService.createRequest({
        company: form.company,
        card_code: party.card_code,
        new_credit_limit: form.new_credit_limit,
        valid_till: form.valid_till,
        remarks: form.remarks,
        attachment: file,
      });
      setForm({ ...EMPTY_FORM });
      setFile(null);
      setParty(null);
      setCustomer(null);
      if (fileRef.current) fileRef.current.value = "";
      onCreated(
        created?.id
          ? `Credit limit request #${created.id} submitted.`
          : "Credit limit request submitted.",
      );
    } catch (e) {
      setFormError(creditLimitError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 md:p-5">
      <div className="mb-4">
        <h2 className="m-0 text-[15px] font-semibold text-ink">New Credit Limit Request</h2>
        <p className="m-0 mt-0.5 text-[13px] text-subtle">
          Pick the party, then check its balance and current limit — those are
          read live from SAP, not from this form.
        </p>
      </div>

      <div className="space-y-4">
        {formError && (
          <Notice tone="bad">
            <span className="whitespace-pre-wrap">{formError}</span>
          </Notice>
        )}

        <FormGrid>
          <Field label="Company" required>
            {(c) => (
              <Select
                {...c}
                value={form.company}
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

          <Field label="Party" required error={lookupError || undefined}>
            {(c) => (
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  id={c.id}
                  aria-describedby={c["aria-describedby"]}
                  // The field's <label> would otherwise name this "Party";
                  // the verb is what a screen reader user needs to hear.
                  aria-label={party ? "Change party" : "Select party"}
                  variant="secondary"
                  onClick={() => setPickerOpen(true)}
                >
                  <HiOutlineUsers aria-hidden />
                  {party ? "Change party" : "Select party"}
                </Button>
                {party && (
                  <span className="min-w-0 truncate text-[13px]">
                    <span className="font-mono font-semibold text-ink">{party.card_code}</span>
                    <span className="text-subtle"> · {party.card_name}</span>
                  </span>
                )}
                {party && lookupError && !lookingUp && (
                  <Button
                    variant="link"
                    size="inline"
                    onClick={() => void lookUp(form.company, party.card_code)}
                  >
                    Retry
                  </Button>
                )}
              </div>
            )}
          </Field>
        </FormGrid>

        {lookingUp && (
          <p role="status" className="m-0 text-[12.5px] text-subtle">
            Reading the customer from SAP…
          </p>
        )}

        {customer && (
          <div aria-label="Customer from SAP" role="group" className="py-1">
            <DetailGrid>
              <DetailField label="Customer" value={customer.card_name} />
              <DetailField label="Main group" value={customer.main_group} />
              <DetailField label="Balance" value={formatAmount(customer.balance)} />
              <DetailField
                label="Current limit"
                value={formatAmount(customer.credit_limit)}
                strong
              />
            </DetailGrid>
          </div>
        )}

        <FormGrid>
          <Field label="New credit limit" required>
            {(c) => (
              <Input
                {...c}
                type="number"
                inputMode="decimal"
                min={1}
                step="0.01"
                value={form.new_credit_limit}
                onChange={(e) => setForm({ ...form, new_credit_limit: e.target.value })}
              />
            )}
          </Field>
          <Field label="Valid till" required>
            {(c) => (
              <Input
                {...c}
                type="date"
                min={todayIso()}
                value={form.valid_till}
                onChange={(e) => setForm({ ...form, valid_till: e.target.value })}
              />
            )}
          </Field>
          <Field label="Attachment" hint="Optional supporting document for the approver.">
            {(c) => (
              <Input
                {...c}
                ref={fileRef}
                type="file"
                className="py-1.5"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            )}
          </Field>
        </FormGrid>

        <Field label="Remarks">
          {(c) => (
            <Textarea
              {...c}
              rows={3}
              value={form.remarks}
              placeholder="Why the limit should change"
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          )}
        </Field>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving || !customer}>
            {saving ? "Submitting…" : "Submit Request"}
          </Button>
        </div>
      </div>

      <PartyPickerDialog
        open={pickerOpen}
        company={form.company}
        onClose={() => setPickerOpen(false)}
        onSelect={pickParty}
      />
    </Card>
  );
}
