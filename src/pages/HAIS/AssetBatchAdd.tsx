import { useState } from "react";
import type * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HiOutlineCheckCircle, HiOutlinePlus, HiOutlineTrash } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Notice, SectionHeading } from "@/components/ui/page";
import { errorBody, fieldError, messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import DateInput from "../../components/DateInput";
import { haisService, WORKING_STATUSES, type Asset } from "../../services/haisService";

import ErrorPopup from "./ErrorPopup";
import {
  ALL_ASSET_FIELD_KEYS,
  type AssetFieldKey,
  EMAIL_RE,
  EMP_ID_PREFIX,
  fieldVisible,
  isValidDdMmYyyy,
  normalizeEmpId,
} from "./assetShared";
import { MONO, NOTE } from "./assetTone";
import { useHaisOptions } from "./useHaisOptions";

/* ------------------------------------------------------------------ *
 * The holder — entered ONCE and shared by every device in the batch.
 * One person usually receives several devices at a time, so re-typing
 * the user for each is exactly the friction this screen removes.
 * ------------------------------------------------------------------ */
type Holder = {
  unassigned: boolean;
  current_user_name: string;
  current_user_id: string;
  department: string;
  email_id: string;
  current_location: string;
  handover_date: string;
};

const EMPTY_HOLDER: Holder = {
  unassigned: false,
  current_user_name: "",
  current_user_id: "",
  department: "",
  email_id: "",
  current_location: "",
  handover_date: "",
};

/* One device — the per-asset fields. Each card in the batch is one of these. */
type Device = {
  asset_type: string;
  company: string;
  model_num: string;
  serial_num: string;
  warranty_ends: string;
  processor: string;
  memory: string;
  operating_system: string;
  storage_types: string[];
  storage: string;
  purchase_invoice_no: string;
  purchase_invoice_date: string;
  vendor: string;
  amount: string;
  date_of_last_service: string;
  working_status: string;
  remarks: string;
};

const EMPTY_DEVICE: Device = {
  asset_type: "",
  company: "",
  model_num: "",
  serial_num: "",
  warranty_ends: "",
  processor: "",
  memory: "",
  operating_system: "",
  storage_types: [],
  storage: "",
  purchase_invoice_no: "",
  purchase_invoice_date: "",
  vendor: "",
  amount: "",
  date_of_last_service: "",
  working_status: "Working",
  remarks: "",
};

type Props = {
  /** Called after every device saves, so the parent can refresh / switch tabs. */
  onSaved?: () => void;
};

export default function AssetBatchAdd({ onSaved }: Props) {
  const queryClient = useQueryClient();
  const { assetTypes, departments, storageTypes } = useHaisOptions();

  const [holder, setHolder] = useState<Holder>(EMPTY_HOLDER);
  // Devices start empty; the user presses "Add asset" to reveal the first card.
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // --- holder edits ---
  const setHolderField = (key: keyof Holder) => (value: string) =>
    setHolder((h) => ({ ...h, [key]: value }));
  const setHolderUpper = (key: keyof Holder) => (value: string) =>
    setHolderField(key)(value.toUpperCase());
  const setEmpId = (raw: string) => setHolderField("current_user_id")(normalizeEmpId(raw));
  const toggleUnassigned = (next: boolean) =>
    setHolder((h) => ({
      ...h,
      unassigned: next,
      current_user_name: next ? "" : h.current_user_name,
      current_user_id: next ? "" : h.current_user_id,
    }));

  // --- device list edits ---
  const addDevice = () => setDevices((d) => [...d, { ...EMPTY_DEVICE }]);
  const removeDevice = (i: number) => setDevices((d) => d.filter((_, idx) => idx !== i));
  const patchDevice = (i: number, patch: Partial<Device>) =>
    setDevices((d) => d.map((dev, idx) => (idx === i ? { ...dev, ...patch } : dev)));
  // Switching a card's type clears any field that type hides, so a keyboard never
  // saves a stale processor/RAM/vendor left over from a computing type.
  const changeAssetType = (i: number, value: string) => {
    const next = assetTypes.find((t) => t.name === value);
    const cleared: Record<string, unknown> = {};
    for (const k of ALL_ASSET_FIELD_KEYS) {
      if (!fieldVisible(next?.field_config, k)) cleared[k] = k === "storage_types" ? [] : "";
    }
    patchDevice(i, { asset_type: value, ...cleared });
  };
  const toggleStorageType = (i: number, name: string) =>
    setDevices((d) =>
      d.map((dev, idx) => {
        if (idx !== i) return dev;
        const cur = dev.storage_types;
        return {
          ...dev,
          storage_types: cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name],
        };
      }),
    );

  // Returns the first problem found, or "" when the whole batch is valid.
  const validate = (): string => {
    if (!holder.unassigned && !holder.current_user_name.trim()) {
      return "Current User Name is required — or mark the batch as Unassigned.";
    }
    if (!holder.unassigned && holder.current_user_id === EMP_ID_PREFIX) {
      return `Enter the employee code after ${EMP_ID_PREFIX} (e.g. ${EMP_ID_PREFIX}0001).`;
    }
    const email = holder.email_id.trim();
    if (email && !EMAIL_RE.test(email)) {
      return "Enter a valid Email ID (e.g. name@company.com).";
    }
    if (holder.handover_date.trim() && !isValidDdMmYyyy(holder.handover_date)) {
      return "Handover Date must be a valid date (dd/mm/yyyy).";
    }
    if (devices.length === 0) {
      return "Add at least one asset before saving.";
    }
    const seen = new Set<string>();
    for (let i = 0; i < devices.length; i++) {
      const d = devices[i];
      const tag = `Asset ${i + 1}`;
      const serial = d.serial_num.trim();
      if (!serial) return `${tag}: Serial Number is required — the QR is generated from it.`;
      const key = serial.toUpperCase();
      if (seen.has(key)) return `${tag}: Serial Number "${serial}" is repeated in this batch.`;
      seen.add(key);
      const dates: [string, string][] = [
        [d.warranty_ends, "Warranty Ends"],
        [d.purchase_invoice_date, "Purchase Invoice Date"],
        [d.date_of_last_service, "Date of Last Service"],
      ];
      for (const [value, label] of dates) {
        if (value.trim() && !isValidDdMmYyyy(value)) {
          return `${tag}: ${label} must be a valid date (dd/mm/yyyy).`;
        }
      }
      if (d.amount !== "") {
        const n = Number(d.amount);
        if (Number.isNaN(n) || n < 0) return `${tag}: Amount must be a valid, non-negative number.`;
      }
    }
    return "";
  };

  const save = async () => {
    setError("");
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      // Create each device with the shared holder. Sequential so a duplicate
      // serial fails on its own card and we can report exactly which one.
      const created: string[] = [];
      for (let i = 0; i < devices.length; i++) {
        const d = devices[i];
        const payload: Asset = {
          asset_id: "",
          ...d,
          amount: d.amount === "" ? undefined : Number(d.amount),
          // shared holder
          current_user_id: holder.unassigned ? "" : holder.current_user_id,
          current_user_name: holder.unassigned ? "" : holder.current_user_name,
          department: holder.department,
          email_id: holder.email_id,
          current_location: holder.current_location,
          handover_date: holder.handover_date,
        };
        try {
          const saved = await haisService.create(payload);
          if (saved?.asset_id) created.push(saved.asset_id);
        } catch (err) {
          // Drop the cards that already saved; keep the rest so the user can fix
          // and retry without re-entering everything.
          setDevices((list) => list.slice(i));
          // A duplicate serial is rejected by the DB's unique constraint — say so
          // plainly instead of leaking DRF's "serial_num: …" field wording.
          const dup = fieldError(errorBody(err), "serial_num");
          const msg = dup
            ? `Serial "${d.serial_num.trim()}" already exists — duplicate assets are not allowed.`
            : messageFrom(err, "Request failed");
          const suffix = created.length ? ` (${created.length} already saved)` : "";
          setError(`Asset ${i + 1}: ${msg}${suffix}`);
          await queryClient.invalidateQueries({ queryKey: ["hais"] });
          return;
        }
      }
      showToast({
        title: created.length === 1 ? "Asset created" : `${created.length} assets created`,
        message: holder.unassigned
          ? `Added to store. IDs: ${created.join(", ")}`
          : `Assigned to ${holder.current_user_name}. IDs: ${created.join(", ")}`,
      });
      await queryClient.invalidateQueries({ queryKey: ["hais"] });
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ---- shared holder ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Add assets — assignment &amp; tracking</CardTitle>
        </CardHeader>
        <div className="space-y-6">
          <Notice tone="info">
            Enter the holder <strong>once</strong>. Then press <strong>Add asset</strong> for each
            device this person receives — every card below is a separate asset that shares this same
            holder.
          </Notice>

          <section className="space-y-3">
            <SectionHeading>Assignment &amp; tracking</SectionHeading>
            <FormGrid>
              <div className="col-span-full">
                <Checkbox
                  label="Unassigned"
                  hint="The devices are in stock / not issued to anyone yet."
                  checked={holder.unassigned}
                  onChange={(e) => toggleUnassigned(e.target.checked)}
                />
              </div>
              <Field label="Current user name" required={!holder.unassigned}>
                {(c) => (
                  <Input
                    {...c}
                    value={holder.current_user_name}
                    onChange={(e) => setHolderUpper("current_user_name")(e.target.value)}
                    disabled={holder.unassigned}
                    placeholder={holder.unassigned ? "— Unassigned —" : "e.g. RAHUL SHARMA"}
                  />
                )}
              </Field>
              <Field label="Current user ID (Emp ID)" hint={`Auto-prefixed with ${EMP_ID_PREFIX}`}>
                {(c) => (
                  <Input
                    {...c}
                    className={MONO}
                    value={holder.current_user_id}
                    onChange={(e) => setEmpId(e.target.value)}
                    disabled={holder.unassigned}
                    placeholder={`${EMP_ID_PREFIX}0001`}
                  />
                )}
              </Field>
              <Field label="Department">
                {(c) => (
                  <Select
                    {...c}
                    value={holder.department}
                    onChange={(e) => setHolderField("department")(e.target.value)}
                  >
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
                    value={holder.email_id}
                    onChange={(e) => setHolderField("email_id")(e.target.value.toLowerCase())}
                    placeholder="e.g. name@company.com"
                  />
                )}
              </Field>
              <Field label="Current location">
                {(c) => (
                  <Input
                    {...c}
                    value={holder.current_location}
                    onChange={(e) => setHolderUpper("current_location")(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Handover date">
                {() => (
                  <DateInput
                    value={holder.handover_date}
                    onChange={setHolderField("handover_date")}
                    withPicker
                  />
                )}
              </Field>
            </FormGrid>
          </section>

          {devices.length === 0 && (
            <p className={NOTE}>No assets added yet. Press “Add asset” to add the first device.</p>
          )}

          <div>
            <Button variant="secondary" onClick={addDevice}>
              <HiOutlinePlus className="text-brand" aria-hidden="true" />
              Add asset
            </Button>
          </div>
        </div>
      </Card>

      {/* ---- one card per device ---- */}
      {devices.map((device, i) => {
        const selType = assetTypes.find((t) => t.name === device.asset_type);
        const vis = (k: AssetFieldKey) => fieldVisible(selType?.field_config, k);
        const showConfig =
          vis("processor") || vis("memory") || vis("operating_system") || vis("storage_types") || vis("storage");
        const showPurchase =
          vis("purchase_invoice_no") || vis("purchase_invoice_date") || vis("vendor") || vis("amount");
        return (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                Asset {i + 1}
                {device.serial_num ? ` — ${device.serial_num}` : ""}
              </CardTitle>
              <Button variant="danger" onClick={() => removeDevice(i)} aria-label={`Remove asset ${i + 1}`}>
                <HiOutlineTrash aria-hidden="true" />
                Remove
              </Button>
            </div>
          </CardHeader>

          <div className="space-y-6">
            <DeviceSection title="Identification">
              <Field label="Asset type / category">
                {(c) => (
                  <Select
                    {...c}
                    value={device.asset_type}
                    onChange={(e) => changeAssetType(i, e.target.value)}
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
              {vis("company") && (
              <Field label="Company" hint="Manufacturer / brand">
                {(c) => (
                  <Input
                    {...c}
                    value={device.company}
                    onChange={(e) => patchDevice(i, { company: e.target.value.toUpperCase() })}
                    placeholder="e.g. DELL, HP, LOGITECH"
                  />
                )}
              </Field>
              )}
              {vis("model_num") && (
              <Field label="Model number">
                {(c) => (
                  <Input
                    {...c}
                    value={device.model_num}
                    onChange={(e) => patchDevice(i, { model_num: e.target.value.toUpperCase() })}
                    placeholder="e.g. LATITUDE 5440"
                  />
                )}
              </Field>
              )}
              <Field label="Serial number" required hint="Unique — the device QR is generated from this">
                {(c) => (
                  <Input
                    {...c}
                    className={MONO}
                    value={device.serial_num}
                    onChange={(e) => patchDevice(i, { serial_num: e.target.value.toUpperCase() })}
                    placeholder="e.g. DL5440X92KK"
                  />
                )}
              </Field>
              {vis("warranty_ends") && (
              <Field label="Warranty ends">
                {() => (
                  <DateInput
                    value={device.warranty_ends}
                    onChange={(v) => patchDevice(i, { warranty_ends: v })}
                    withPicker
                  />
                )}
              </Field>
              )}
            </DeviceSection>

            {showConfig && (
            <DeviceSection title="Configuration" note="The device's hardware specs.">
              {vis("processor") && (
              <Field label="Processor">
                {(c) => (
                  <Input
                    {...c}
                    value={device.processor}
                    onChange={(e) => patchDevice(i, { processor: e.target.value.toUpperCase() })}
                    placeholder="e.g. INTEL CORE I5 12TH GEN"
                  />
                )}
              </Field>
              )}
              {vis("memory") && (
              <Field label="Memory (RAM)">
                {(c) => (
                  <Input
                    {...c}
                    value={device.memory}
                    onChange={(e) => patchDevice(i, { memory: e.target.value.toUpperCase() })}
                    placeholder="e.g. 16 GB"
                  />
                )}
              </Field>
              )}
              {vis("operating_system") && (
              <Field label="Operating system">
                {(c) => (
                  <Input
                    {...c}
                    value={device.operating_system}
                    onChange={(e) => patchDevice(i, { operating_system: e.target.value.toUpperCase() })}
                    placeholder="e.g. WINDOWS 11 PRO"
                  />
                )}
              </Field>
              )}
              {vis("storage_types") && (
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
                          checked={device.storage_types.includes(s.name)}
                          onChange={() => toggleStorageType(i, s.name)}
                        />
                      ))
                    )}
                  </div>
                )}
              </Field>
              )}
              {vis("storage") && (
              <Field label="Storage">
                {(c) => (
                  <Input
                    {...c}
                    value={device.storage}
                    onChange={(e) => patchDevice(i, { storage: e.target.value.toUpperCase() })}
                    placeholder="e.g. 512 GB"
                  />
                )}
              </Field>
              )}
            </DeviceSection>
            )}

            {showPurchase && (
            <DeviceSection title="Purchase">
              {vis("purchase_invoice_no") && (
              <Field label="Purchase invoice No.">
                {(c) => (
                  <Input
                    {...c}
                    value={device.purchase_invoice_no}
                    onChange={(e) =>
                      patchDevice(i, { purchase_invoice_no: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. INV-2025-8841"
                  />
                )}
              </Field>
              )}
              {vis("purchase_invoice_date") && (
              <Field label="Purchase invoice date">
                {() => (
                  <DateInput
                    value={device.purchase_invoice_date}
                    onChange={(v) => patchDevice(i, { purchase_invoice_date: v })}
                    withPicker
                  />
                )}
              </Field>
              )}
              {vis("vendor") && (
              <Field label="Vendor" hint="Supplier the device was bought from">
                {(c) => (
                  <Input
                    {...c}
                    value={device.vendor}
                    onChange={(e) => patchDevice(i, { vendor: e.target.value.toUpperCase() })}
                    placeholder="e.g. COMPUTECH SOLUTIONS"
                  />
                )}
              </Field>
              )}
              {vis("amount") && (
              <Field label="Amount (₹)">
                {(c) => (
                  <Input
                    {...c}
                    type="number"
                    min="0"
                    step="0.01"
                    value={device.amount}
                    onChange={(e) => patchDevice(i, { amount: e.target.value })}
                  />
                )}
              </Field>
              )}
            </DeviceSection>
            )}

            <DeviceSection title="Maintenance">
              {vis("date_of_last_service") && (
              <Field label="Date of last service">
                {() => (
                  <DateInput
                    value={device.date_of_last_service}
                    onChange={(v) => patchDevice(i, { date_of_last_service: v })}
                    withPicker
                  />
                )}
              </Field>
              )}
              <Field label="Working status">
                {(c) => (
                  <Select
                    {...c}
                    value={device.working_status}
                    onChange={(e) => patchDevice(i, { working_status: e.target.value })}
                  >
                    {WORKING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {vis("remarks") && (
              <Field label="Remarks" span="full">
                {(c) => (
                  <Textarea
                    {...c}
                    rows={2}
                    value={device.remarks}
                    onChange={(e) => patchDevice(i, { remarks: e.target.value.toUpperCase() })}
                  />
                )}
              </Field>
              )}
            </DeviceSection>
          </div>
        </Card>
        );
      })}

      {/* ---- batch actions ---- */}
      {devices.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={addDevice} disabled={busy}>
            <HiOutlinePlus className="text-brand" aria-hidden="true" />
            Add another asset
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            <HiOutlineCheckCircle aria-hidden="true" />
            {busy
              ? "Saving…"
              : devices.length === 1
                ? "Save asset"
                : `Save ${devices.length} assets`}
          </Button>
        </div>
      )}

      <ErrorPopup message={error} onClose={() => setError("")} />
    </div>
  );
}

/** A section within a device card: heading, optional caption, and its grid. */
function DeviceSection({
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
