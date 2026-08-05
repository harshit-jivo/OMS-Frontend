import { useEffect, useState } from "react";
import { HiCheckCircle } from "react-icons/hi2";
import DateInput from "../../components/DateInput";
import { NicField, SuccessAlert, apiErrorMessage } from "../../components/NicUI";
import {
  haisService,
  WORKING_STATUSES,
  type Asset,
} from "../../services/haisService";
import { useHaisOptions } from "./useHaisOptions";
import ErrorPopup from "./ErrorPopup";

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
  const [form, setForm] = useState<Asset>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // The record as loaded — lets us detect what changed (user / config) and ask why.
  const [original, setOriginal] = useState<Asset | null>(null);
  const [changeReason, setChangeReason] = useState("");
  // Device is in stock / not issued to anyone yet — no current holder.
  const [unassigned, setUnassigned] = useState(false);
  // Dropdown values, loaded from the DB masters.
  const { assetTypes, departments, storageTypes } = useHaisOptions();

  const isEdit = !!editId;
  const userChanged =
    isEdit && (form.current_user_id ?? "").trim() !== (original?.current_user_id ?? "").trim();
  const CONFIG_KEYS: (keyof Asset)[] = ["processor", "memory", "operating_system", "storage"];
  const configChanged =
    isEdit && !!original &&
    (CONFIG_KEYS.some((k) => (form[k] ?? "") !== (original[k] ?? "")) ||
      (form.storage_types ?? []).join("|") !== (original.storage_types ?? []).join("|"));

  /* Load the record when editing. */
  useEffect(() => {
    setChangeReason("");
    if (!editId) {
      setForm(EMPTY);
      setOriginal(null);
      setUnassigned(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    haisService
      .get(editId)
      .then((data) => {
        if (!alive) return;
        setForm({ ...EMPTY, ...data });
        setOriginal(data);
        // No holder recorded → treat the loaded device as unassigned.
        setUnassigned(!(data.current_user_id ?? "").trim() && !(data.current_user_name ?? "").trim());
      })
      .catch((err) => {
        if (alive) setError(apiErrorMessage(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [editId]);

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
    setError("");
    setSuccess("");
    const problem = validate();
    if (problem) {
      setError(problem);
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
      setSuccess(
        isEdit
          ? "Asset updated successfully."
          : `Asset created successfully. System-generated Asset ID: ${saved?.asset_id ?? ""}.`,
      );
      if (!isEdit) setForm(EMPTY);
      onSaved?.(saved ?? payload);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head">
        <span className="ofs-card-mark" />
        <h2>{isEdit ? `Edit Asset — ${editId}` : "Add New Asset"}</h2>
      </div>

      {loading ? (
        <p className="nic-note">Loading asset…</p>
      ) : (
        <>
          {isEdit && (
            <p className="nic-note" style={{ marginTop: -4 }}>
              Editing a device changes only its <strong>Configuration</strong> and{" "}
              <strong>Maintenance</strong>. To change the holder, use <strong>Handover</strong>.
            </p>
          )}

          {/* ── Identification ── */}
          <h4 className="nic-subsection-title">Identification</h4>
          <div className="nic-form-grid">
            {/* Asset ID is generated by the system on Add. It is not shown on
                the Add form; when editing it appears read-only for reference. */}
            {isEdit && (
              <NicField label="Asset ID" hint="System-generated — cannot be changed">
                <input className="nic-input nic-mono" value={form.asset_id} disabled />
              </NicField>
            )}

            <NicField label="Asset Type / Category">
              <select
                className="nic-select"
                value={form.asset_type as string}
                onChange={(e) => set("asset_type")(e.target.value)}
                disabled={isEdit}
              >
                <option value="">— Select —</option>
                {assetTypes.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </NicField>

            <NicField label="Company" hint="Manufacturer / brand">
              <input className="nic-input" value={form.company ?? ""} onChange={(e) => setUpper("company")(e.target.value)} disabled={isEdit} placeholder="e.g. DELL, HP, LOGITECH" />
            </NicField>

            <NicField label="Model Number">
              <input className="nic-input" value={form.model_num ?? ""} onChange={(e) => setUpper("model_num")(e.target.value)} disabled={isEdit} placeholder="e.g. LATITUDE 5440" />
            </NicField>

            <NicField label="Serial Number *" hint="Required &amp; unique — the device QR is generated from this">
              <input className="nic-input nic-mono" value={form.serial_num ?? ""} onChange={(e) => setUpper("serial_num")(e.target.value)} disabled={isEdit} placeholder="e.g. DL5440X92KK" />
            </NicField>

            <NicField label="Warranty Ends">
              <DateInput value={form.warranty_ends ?? ""} onChange={set("warranty_ends")} withPicker disabled={isEdit} />
            </NicField>
          </div>

          {/* ── Configuration ── */}
          <h4 className="nic-subsection-title">Configuration</h4>
          <p className="nic-note" style={{ marginTop: -6 }}>
            For computing devices only — leave blank for peripherals like a keyboard or mouse.
          </p>
          <div className="nic-form-grid">
            <NicField label="Processor">
              <input className="nic-input" value={form.processor ?? ""} onChange={(e) => setUpper("processor")(e.target.value)} placeholder="e.g. INTEL CORE I5 12TH GEN" />
            </NicField>

            <NicField label="Memory (RAM)">
              <input className="nic-input" value={form.memory ?? ""} onChange={(e) => setUpper("memory")(e.target.value)} placeholder="e.g. 16 GB" />
            </NicField>

            <NicField label="Operating System">
              <input className="nic-input" value={form.operating_system ?? ""} onChange={(e) => setUpper("operating_system")(e.target.value)} placeholder="e.g. WINDOWS 11 PRO" />
            </NicField>

            <NicField label="Storage Type" hint="Select one or more">
              <div className="hais-multi">
                {storageTypes.length === 0 ? (
                  <span className="nic-note">No storage types yet — add them in the Storage Type tab.</span>
                ) : (
                  storageTypes.map((s) => (
                    <label key={s.id}>
                      <input
                        type="checkbox"
                        checked={(form.storage_types ?? []).includes(s.name)}
                        onChange={() => toggleStorageType(s.name)}
                      />
                      {s.name}
                    </label>
                  ))
                )}
              </div>
            </NicField>

            <NicField label="Storage">
              <input className="nic-input" value={form.storage ?? ""} onChange={(e) => setUpper("storage")(e.target.value)} placeholder="e.g. 512 GB" />
            </NicField>
          </div>

          {/* ── Assignment & Tracking ── */}
          <h4 className="nic-subsection-title">Assignment &amp; Tracking</h4>
          <div className="nic-form-grid">
            <NicField label="Assignment" full>
              <label className="hais-check">
                <input
                  type="checkbox"
                  checked={unassigned}
                  onChange={(e) => toggleUnassigned(e.target.checked)}
                  disabled={isEdit}
                />
                <span>Unassigned — device is in stock / not issued to anyone yet</span>
              </label>
            </NicField>

            <NicField label={unassigned ? "Current User Name" : "Current User Name *"}>
              <input
                className="nic-input"
                value={form.current_user_name ?? ""}
                onChange={(e) => setUpper("current_user_name")(e.target.value)}
                disabled={unassigned || isEdit}
                placeholder={unassigned ? "— Unassigned —" : "e.g. RAHUL SHARMA"}
              />
            </NicField>

            <NicField label="Current User ID (Emp ID)" hint={`Auto-prefixed with ${EMP_ID_PREFIX}`}>
              <input
                className="nic-input nic-mono"
                value={form.current_user_id ?? ""}
                onChange={(e) => setEmpId(e.target.value)}
                disabled={unassigned || isEdit}
                placeholder={`${EMP_ID_PREFIX}0001`}
              />
            </NicField>

            <NicField label="Department">
              <select className="nic-select" value={form.department ?? ""} onChange={(e) => set("department")(e.target.value)} disabled={isEdit}>
                <option value="">— Select —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </NicField>

            <NicField label="Email ID">
              <input
                className="nic-input"
                type="email"
                value={form.email_id ?? ""}
                onChange={(e) => set("email_id")(e.target.value.toLowerCase())}
                disabled={isEdit}
                placeholder="e.g. name@company.com"
              />
            </NicField>

            <NicField label="Current Location">
              <input className="nic-input" value={form.current_location ?? ""} onChange={(e) => setUpper("current_location")(e.target.value)} disabled={isEdit} />
            </NicField>

            <NicField label="Handover Date">
              <DateInput value={form.handover_date ?? ""} onChange={set("handover_date")} withPicker disabled={isEdit} />
            </NicField>

            {/* When the holder or the configuration changes while editing,
                capture WHY — it is recorded in the device's history trail. */}
            {(userChanged || configChanged) && (
              <NicField
                label={userChanged ? "Reason for handover" : "Reason for configuration change"}
                hint="Saved in the device history so the change is never lost."
                full
              >
                <input
                  className="nic-input"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value.toUpperCase())}
                  placeholder={
                    userChanged
                      ? "e.g. PREVIOUS USER LEFT / ROLE CHANGE / LAPTOP UPGRADE"
                      : "e.g. RAM UPGRADED 8 GB → 16 GB ON USER REQUEST"
                  }
                />
              </NicField>
            )}
          </div>

          {/* ── Purchase ── */}
          <h4 className="nic-subsection-title">Purchase</h4>
          <div className="nic-form-grid">
            <NicField label="Purchase Invoice No.">
              <input className="nic-input" value={form.purchase_invoice_no ?? ""} onChange={(e) => setUpper("purchase_invoice_no")(e.target.value)} disabled={isEdit} placeholder="e.g. INV-2025-8841" />
            </NicField>

            <NicField label="Purchase Invoice Date">
              <DateInput value={form.purchase_invoice_date ?? ""} onChange={set("purchase_invoice_date")} withPicker disabled={isEdit} />
            </NicField>

            <NicField label="Vendor" hint="Supplier the device was bought from">
              <input className="nic-input" value={form.vendor ?? ""} onChange={(e) => setUpper("vendor")(e.target.value)} disabled={isEdit} placeholder="e.g. COMPUTECH SOLUTIONS" />
            </NicField>

            <NicField label="Amount (₹)">
              <input
                className="nic-input"
                type="number"
                min="0"
                step="0.01"
                value={form.amount as string}
                onChange={(e) => set("amount")(e.target.value)}
                disabled={isEdit}
              />
            </NicField>
          </div>

          {/* ── Maintenance ── */}
          <h4 className="nic-subsection-title">Maintenance</h4>
          <div className="nic-form-grid">
            <NicField label="Date of Last Service">
              <DateInput value={form.date_of_last_service ?? ""} onChange={set("date_of_last_service")} withPicker />
            </NicField>

            <NicField label="Working Status">
              <select
                className="nic-select"
                value={form.working_status as string}
                onChange={(e) => set("working_status")(e.target.value)}
              >
                {WORKING_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </NicField>

            <NicField label="Remarks" full>
              <textarea
                className="nic-input"
                rows={2}
                value={form.remarks ?? ""}
                onChange={(e) => setUpper("remarks")(e.target.value)}
              />
            </NicField>
          </div>

          <div className="nic-actions-row">
            <button className="ofs-primary" onClick={() => void save()} disabled={busy}>
              <HiCheckCircle style={{ verticalAlign: "-3px", marginRight: 6 }} />
              {busy ? "Saving…" : isEdit ? "Update Asset" : "Save Asset"}
            </button>
          </div>

          <SuccessAlert>{success}</SuccessAlert>
        </>
      )}

      {/* Any problem is surfaced in a popup. */}
      <ErrorPopup message={error} onClose={() => setError("")} />
    </section>
  );
}
