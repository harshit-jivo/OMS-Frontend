import { useState } from "react";
import type * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlineCheckCircle } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormActions, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Notice, SectionHeading } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import DateInput from "../../components/DateInput";
import {
  haisService,
  WORKING_STATUSES,
  type Asset,
} from "../../services/haisService";

import ErrorPopup from "./ErrorPopup";
import { MONO, NOTE } from "./assetTone";
import { useHaisOptions } from "./useHaisOptions";

/** Employee IDs are always prefixed with the company code. */
const EMP_ID_PREFIX = "JWPL";

/** Basic email shape check (case-insensitive). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True only for a real dd/mm/yyyy calendar date (rejects 31/02, 99/99/9999…). */
function isValidDdMmYyyy(s: string): boolean {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const day = +m[1], month = +m[2], year = +m[3];
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2200) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

/* An empty record — every field is present so nothing is missed. */
const EMPTY: Asset = {
  asset_id: "",
  asset_type: "",
  company: "",
  model_num: "",
  serial_num: "",
  warranty_ends: "",
  processor: "",
  memory: "",
  operating_system: "",
  storage_type: "",
  storage_types: [],
  storage: "",
  current_user_id: "",
  current_user_name: "",
  prev_user_id: "",
  prev_user_name: "",
  department: "",
  email_id: "",
  current_location: "",
  handover_date: "",
  purchase_invoice_no: "",
  purchase_invoice_date: "",
  amount: "",
  vendor: "",
  date_of_last_service: "",
  working_status: "Working",
  remarks: "",
};

type Props = {
  /** When set, the form loads that asset and switches to edit mode. */
  editId?: string | null;
  /** Called after a successful save so the parent can refresh / switch tabs. */
  onSaved?: (asset: Asset) => void;
};

export default function AssetForm({ editId, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Asset>(EMPTY);
  const [busy, setBusy] = useState(false);
  /** Save failures. The LOAD failure is the query's. */
  const [saveError, setSaveError] = useState("");
  const [changeReason, setChangeReason] = useState("");
  // Device is in stock / not issued to anyone yet — no current holder.
  const [unassigned, setUnassigned] = useState(false);
  // Dropdown values, loaded from the DB masters.
  const { assetTypes, departments, storageTypes } = useHaisOptions();

  /*
   * Load the record when editing.
   *
   * The old version of this was one effect that mixed synchronous setState
   * (`setChangeReason("")`, and the whole `if (!editId)` branch) with an
   * unanalysable promise chain — four `set-state-in-effect` violations kept
   * quiet by the promise chain sitting alongside them.
   *
   * `original` IS the query data now; it existed only to diff `form` against.
   * `form` is seeded from it during render, which is legal where an effect is
   * not, and the seed is guarded on the data's identity so a refetch that
   * returns the same record does not stamp over what the user has typed.
   */
  const { data: original = null, isPending, error: loadError } = useQuery({
    queryKey: ["hais", "asset", editId],
    enabled: Boolean(editId),
    queryFn: () => haisService.get(editId!),
  });
  const loading = Boolean(editId) && isPending;
  const error = saveError || (loadError ? messageFrom(loadError, "Request failed") : "");

  const [seededFrom, setSeededFrom] = useState<Asset | null>(null);
  if (original && original !== seededFrom) {
    setSeededFrom(original);
    setForm({ ...EMPTY, ...original });
    setChangeReason("");
    // No holder recorded → treat the loaded device as unassigned.
    setUnassigned(
      !(original.current_user_id ?? "").trim() && !(original.current_user_name ?? "").trim(),
    );
  }

  const isEdit = !!editId;
  const userChanged =
    isEdit && (form.current_user_id ?? "").trim() !== (original?.current_user_id ?? "").trim();
  const CONFIG_KEYS: (keyof Asset)[] = ["processor", "memory", "operating_system", "storage"];
  const configChanged =
    isEdit && !!original &&
    (CONFIG_KEYS.some((k) => (form[k] ?? "") !== (original[k] ?? "")) ||
      (form.storage_types ?? []).join("|") !== (original.storage_types ?? []).join("|"));

  const set = (key: keyof Asset) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Text fields are stored in CAPITAL letters.
  const setUpper = (key: keyof Asset) => (value: string) => set(key)(value.toUpperCase());

  // Emp ID is auto-prefixed with the company code (JWPL); the user just adds
  // their own code after it. Kept as a single clean prefix, uppercased.
  const setEmpId = (raw: string) => {
    const code = raw.toUpperCase().replace(/\s+/g, "").replace(/^(JWPL)+/, "");
    set("current_user_id")(code ? `${EMP_ID_PREFIX}${code}` : "");
  };

  // Toggle one storage type in the multi-select.
  const toggleStorageType = (name: string) =>
    setForm((f) => {
      const cur = f.storage_types ?? [];
      return {
        ...f,
        storage_types: cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name],
      };
    });

  // Toggling Unassigned clears the holder fields so no stale user is saved.
  const toggleUnassigned = (next: boolean) => {
    setUnassigned(next);
    if (next) setForm((f) => ({ ...f, current_user_id: "", current_user_name: "" }));
  };

  // Returns the first problem found, or "" when the form is valid.
  const validate = (): string => {
    if (!(form.serial_num ?? "").trim()) {
      return "Serial Number is required — the device QR is generated from it.";
    }
    if (!unassigned && !(form.current_user_name ?? "").trim()) {
      return "Current User Name is required — or mark the device as Unassigned.";
    }
    if (!unassigned && (form.current_user_id ?? "") === EMP_ID_PREFIX) {
      return `Enter the employee code after ${EMP_ID_PREFIX} (e.g. ${EMP_ID_PREFIX}0001).`;
    }
    const email = (form.email_id ?? "").trim();
    if (email && !EMAIL_RE.test(email)) {
      return "Enter a valid Email ID (e.g. name@company.com).";
    }
    const dateFields: [string, string][] = [
      [form.warranty_ends ?? "", "Warranty Ends"],
      [form.handover_date ?? "", "Handover Date"],
      [form.purchase_invoice_date ?? "", "Purchase Invoice Date"],
      [form.date_of_last_service ?? "", "Date of Last Service"],
    ];
    for (const [value, label] of dateFields) {
      if (value.trim() && !isValidDdMmYyyy(value)) {
        return `${label} must be a valid date (dd/mm/yyyy).`;
      }
    }
    if (form.amount !== "" && form.amount != null) {
      const n = Number(form.amount);
      if (Number.isNaN(n) || n < 0) return "Amount must be a valid, non-negative number.";
    }
    return "";
  };

  const save = async () => {
    setSaveError("");
    const problem = validate();
    if (problem) {
      setSaveError(problem);
      return;
    }
    setBusy(true);
    try {
      const payload: Asset = {
        ...form,
        asset_id: form.asset_id.trim(),
        amount: form.amount === "" ? undefined : Number(form.amount),
      };
      const saved = isEdit
        ? await haisService.update(editId!, payload, changeReason)
        : await haisService.create(payload);
      showToast({
        title: isEdit ? "Asset updated" : "Asset created",
        message: isEdit
          ? form.asset_id
          : `System-generated Asset ID: ${saved?.asset_id ?? ""}.`,
      });
      if (!isEdit) setForm(EMPTY);
      // The register is cached now, so a save that does not invalidate it means
      // a new asset never appears and an edited one keeps its old row.
      await queryClient.invalidateQueries({ queryKey: ["hais"] });
      onSaved?.(saved ?? payload);
    } catch (err) {
      setSaveError(messageFrom(err, "Request failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? `Edit asset — ${editId}` : "Add new asset"}</CardTitle>
      </CardHeader>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : (
        <div className="space-y-6">
          {isEdit && (
            <Notice tone="info">
              Editing a device changes only its <strong>Configuration</strong> and{" "}
              <strong>Maintenance</strong>. To change the holder, use <strong>Handover</strong>.
            </Notice>
          )}

          <FormSection title="Identification">
            {/* Asset ID is generated by the system on Add. It is not shown on
                the Add form; when editing it appears read-only for reference. */}
            {isEdit && (
              <Field label="Asset ID" hint="System-generated — cannot be changed">
                {(c) => <Input {...c} className={MONO} value={form.asset_id} disabled />}
              </Field>
            )}
            <Field label="Asset type / category">
              {(c) => (
                <Select
                  {...c}
                  value={form.asset_type as string}
                  onChange={(e) => set("asset_type")(e.target.value)}
                  disabled={isEdit}
                >
                  <option value="">— Select —</option>
                  {assetTypes.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Company" hint="Manufacturer / brand">
              {(c) => (
                <Input {...c} value={form.company ?? ""} onChange={(e) => setUpper("company")(e.target.value)} disabled={isEdit} placeholder="e.g. DELL, HP, LOGITECH" />
              )}
            </Field>
            <Field label="Model number">
              {(c) => (
                <Input {...c} value={form.model_num ?? ""} onChange={(e) => setUpper("model_num")(e.target.value)} disabled={isEdit} placeholder="e.g. LATITUDE 5440" />
              )}
            </Field>
            <Field label="Serial number" required hint="Unique — the device QR is generated from this">
              {(c) => (
                <Input {...c} className={MONO} value={form.serial_num ?? ""} onChange={(e) => setUpper("serial_num")(e.target.value)} disabled={isEdit} placeholder="e.g. DL5440X92KK" />
              )}
            </Field>
            <Field label="Warranty ends">
              {() => <DateInput value={form.warranty_ends ?? ""} onChange={set("warranty_ends")} withPicker disabled={isEdit} />}
            </Field>
          </FormSection>

          <FormSection
            title="Configuration"
            note="For computing devices only — leave blank for peripherals like a keyboard or mouse."
          >
            <Field label="Processor">
              {(c) => (
                <Input {...c} value={form.processor ?? ""} onChange={(e) => setUpper("processor")(e.target.value)} placeholder="e.g. INTEL CORE I5 12TH GEN" />
              )}
            </Field>
            <Field label="Memory (RAM)">
              {(c) => (
                <Input {...c} value={form.memory ?? ""} onChange={(e) => setUpper("memory")(e.target.value)} placeholder="e.g. 16 GB" />
              )}
            </Field>
            <Field label="Operating system">
              {(c) => (
                <Input {...c} value={form.operating_system ?? ""} onChange={(e) => setUpper("operating_system")(e.target.value)} placeholder="e.g. WINDOWS 11 PRO" />
              )}
            </Field>
            <Field label="Storage type" hint="Select one or more">
              {() => (
                <div className="flex min-h-control flex-wrap items-center gap-x-5 gap-y-2">
                  {storageTypes.length === 0 ? (
                    <span className={NOTE}>
                      No storage types yet — add them in the Storage Type tab.
                    </span>
                  ) : (
                    storageTypes.map((s) => (
                      <Checkbox
                        key={s.id}
                        label={s.name}
                        checked={(form.storage_types ?? []).includes(s.name)}
                        onChange={() => toggleStorageType(s.name)}
                      />
                    ))
                  )}
                </div>
              )}
            </Field>
            <Field label="Storage">
              {(c) => (
                <Input {...c} value={form.storage ?? ""} onChange={(e) => setUpper("storage")(e.target.value)} placeholder="e.g. 512 GB" />
              )}
            </Field>
          </FormSection>

          <FormSection title="Assignment & tracking">
            <div className="col-span-full">
              <Checkbox
                label="Unassigned"
                hint="The device is in stock / not issued to anyone yet."
                checked={unassigned}
                onChange={(e) => toggleUnassigned(e.target.checked)}
                disabled={isEdit}
              />
            </div>
            <Field label="Current user name" required={!unassigned}>
              {(c) => (
                <Input
                  {...c}
                  value={form.current_user_name ?? ""}
                  onChange={(e) => setUpper("current_user_name")(e.target.value)}
                  disabled={unassigned || isEdit}
                  placeholder={unassigned ? "— Unassigned —" : "e.g. RAHUL SHARMA"}
                />
              )}
            </Field>
            <Field label="Current user ID (Emp ID)" hint={`Auto-prefixed with ${EMP_ID_PREFIX}`}>
              {(c) => (
                <Input
                  {...c}
                  className={MONO}
                  value={form.current_user_id ?? ""}
                  onChange={(e) => setEmpId(e.target.value)}
                  disabled={unassigned || isEdit}
                  placeholder={`${EMP_ID_PREFIX}0001`}
                />
              )}
            </Field>
            <Field label="Department">
              {(c) => (
                <Select {...c} value={form.department ?? ""} onChange={(e) => set("department")(e.target.value)} disabled={isEdit}>
                  <option value="">— Select —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Email ID">
              {(c) => (
                <Input
                  {...c}
                  type="email"
                  value={form.email_id ?? ""}
                  onChange={(e) => set("email_id")(e.target.value.toLowerCase())}
                  disabled={isEdit}
                  placeholder="e.g. name@company.com"
                />
              )}
            </Field>
            <Field label="Current location">
              {(c) => (
                <Input {...c} value={form.current_location ?? ""} onChange={(e) => setUpper("current_location")(e.target.value)} disabled={isEdit} />
              )}
            </Field>
            <Field label="Handover date">
              {() => <DateInput value={form.handover_date ?? ""} onChange={set("handover_date")} withPicker disabled={isEdit} />}
            </Field>

            {/* When the holder or the configuration changes while editing,
                capture WHY — it is recorded in the device's history trail. */}
            {(userChanged || configChanged) && (
              <Field
                label={userChanged ? "Reason for handover" : "Reason for configuration change"}
                hint="Saved in the device history so the change is never lost."
                span="full"
              >
                {(c) => (
                  <Input
                    {...c}
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value.toUpperCase())}
                    placeholder={
                      userChanged
                        ? "e.g. PREVIOUS USER LEFT / ROLE CHANGE / LAPTOP UPGRADE"
                        : "e.g. RAM UPGRADED 8 GB → 16 GB ON USER REQUEST"
                    }
                  />
                )}
              </Field>
            )}
          </FormSection>

          <FormSection title="Purchase">
            <Field label="Purchase invoice No.">
              {(c) => (
                <Input {...c} value={form.purchase_invoice_no ?? ""} onChange={(e) => setUpper("purchase_invoice_no")(e.target.value)} disabled={isEdit} placeholder="e.g. INV-2025-8841" />
              )}
            </Field>
            <Field label="Purchase invoice date">
              {() => <DateInput value={form.purchase_invoice_date ?? ""} onChange={set("purchase_invoice_date")} withPicker disabled={isEdit} />}
            </Field>
            <Field label="Vendor" hint="Supplier the device was bought from">
              {(c) => (
                <Input {...c} value={form.vendor ?? ""} onChange={(e) => setUpper("vendor")(e.target.value)} disabled={isEdit} placeholder="e.g. COMPUTECH SOLUTIONS" />
              )}
            </Field>
            <Field label="Amount (₹)">
              {(c) => (
                <Input
                  {...c}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount as string}
                  onChange={(e) => set("amount")(e.target.value)}
                  disabled={isEdit}
                />
              )}
            </Field>
          </FormSection>

          <FormSection title="Maintenance">
            <Field label="Date of last service">
              {() => <DateInput value={form.date_of_last_service ?? ""} onChange={set("date_of_last_service")} withPicker />}
            </Field>
            <Field label="Working status">
              {(c) => (
                <Select
                  {...c}
                  value={form.working_status as string}
                  onChange={(e) => set("working_status")(e.target.value)}
                >
                  {WORKING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Remarks" span="full">
              {(c) => (
                <Textarea
                  {...c}
                  rows={2}
                  value={form.remarks ?? ""}
                  onChange={(e) => setUpper("remarks")(e.target.value)}
                />
              )}
            </Field>
          </FormSection>

          <FormActions>
            <Button variant="primary" onClick={() => void save()} disabled={busy}>
              <HiOutlineCheckCircle aria-hidden="true" />
              {busy ? "Saving…" : isEdit ? "Update asset" : "Save asset"}
            </Button>
          </FormActions>
        </div>
      )}

      {/* Any problem is surfaced in a popup. */}
      <ErrorPopup message={error} onClose={() => setSaveError("")} />
    </Card>
  );
}

/** A section of the form: a heading, an optional caption, and its grid. */
function FormSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <SectionHeading>{title}</SectionHeading>
        {note ? <p className={`${NOTE} mt-1`}>{note}</p> : null}
      </div>
      <FormGrid>{children}</FormGrid>
    </section>
  );
}
