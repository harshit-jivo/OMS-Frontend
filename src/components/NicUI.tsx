import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { HiCheckCircle, HiExclamationCircle, HiChevronDown } from "react-icons/hi2";
import { einvoiceService } from "../services/einvoiceService";
import type { CompanyChoice, ValidationError } from "../services/einvoiceService";

/* ---- Field (label + control) ---- */
type FieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
};
export function NicField({ label, hint, children, full }: FieldProps) {
  return (
    <label className={`nic-field${full ? " nic-field--full" : ""}`}>
      <span className="nic-label">{label}</span>
      {children}
      {hint ? <small className="nic-hint">{hint}</small> : null}
    </label>
  );
}

/* ---- Company DB dropdown (shared across e-Invoice / e-Way Bill) ----
   The selected company DB decides BOTH which company's Service Layer the invoice
   is read from AND which schema's OMS_IRN_LOG the IRN is mirrored into, so the
   options come from the server (settings) rather than a hardcoded list. */
let companyCache: CompanyChoice[] | null = null;

export function CompanyDbSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [companies, setCompanies] = useState<CompanyChoice[]>(companyCache ?? []);

  useEffect(() => {
    if (companyCache) return;
    let alive = true;
    einvoiceService
      .listCompanies()
      .then((data) => {
        if (!alive) return;
        companyCache = data.results;
        setCompanies(data.results);
        // Adopt the server default when nothing valid is selected yet.
        if (data.results.length && !data.results.some((c) => c.company_db === value)) {
          onChange(data.default || data.results[0].company_db);
        }
      })
      .catch(() => {
        /* keep whatever is selected; the field stays usable */
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always include the current value so the select never shows a blank option.
  const options = companies.length
    ? companies
    : [{ label: "", company_db: value }].filter((c) => c.company_db);

  return (
    <select className="nic-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((c) => (
        <option key={c.company_db} value={c.company_db}>
          {c.label ? `${c.label} — ${c.company_db}` : c.company_db}
        </option>
      ))}
    </select>
  );
}

/* ---- Status badge ---- */
export function StatusBadge({ tone, children, title }: { tone: "ok" | "err" | "warn" | "muted"; children: ReactNode; title?: string }) {
  return <span className={`nic-badge nic-badge--${tone}`} title={title}>{children}</span>;
}

/* ---- Collapsible raw JSON ---- */
export function JsonView({ data, title = "Raw JSON", open = false }: { data: unknown; title?: string; open?: boolean }) {
  const [show, setShow] = useState(open);
  return (
    <div className="nic-json-wrap">
      <button type="button" className="nic-json-toggle" onClick={() => setShow((s) => !s)}>
        <HiChevronDown className={show ? "is-open" : ""} />
        {title}
      </button>
      {show ? <pre className="nic-json">{JSON.stringify(data, null, 2)}</pre> : null}
    </div>
  );
}

/* ---- Key/value summary grid ---- */
export function KeyValues({ items }: { items: Array<[string, ReactNode]> }) {
  const shown = items.filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (shown.length === 0) return null;
  return (
    <div className="nic-kv">
      {shown.map(([k, v]) => (
        <div key={k} className="nic-kv-row">
          <span className="nic-kv-key">{k}</span>
          <span className="nic-kv-val">{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ---- Human-readable details renderer (plain text + highlighted status) ---- */
function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function statusTone(value: string): "ok" | "err" | "warn" | "muted" {
  const v = value.trim().toUpperCase();
  if (["ACT", "ACTIVE", "GENERATED", "OK", "YES", "Y", "VALID", "1", "SUCCESS", "APPROVED"].includes(v)) return "ok";
  if (["CNL", "CANCELLED", "CANCELED", "REJECTED", "FAILED", "EXPIRED", "INACTIVE", "0", "NO", "N"].includes(v)) return "err";
  if (["PENDING", "PARTB PENDING", "PART-B PENDING", "WARN"].includes(v)) return "warn";
  return "muted";
}

const _isStatusKey = (k: string) => /(^|_)status$|status$/i.test(k) || /^ewbstatus$|^irpstatus$/i.test(k);
const _isMonoKey = (k: string) => /irn|ewbno|ewbnumber|ackno|gstin|signed/i.test(k.replace(/[_\s]/g, ""));

function renderScalar(key: string, value: unknown): ReactNode {
  const str = value === null || value === undefined ? "—" : String(value);
  if (_isStatusKey(key) && str !== "—") {
    return <StatusBadge tone={statusTone(str)}>{str}</StatusBadge>;
  }
  // Huge signed blobs (JWS) — don't dump inline.
  if (typeof value === "string" && value.length > 160) {
    return <span className="nic-note">({value.length.toLocaleString()} chars — see raw JSON)</span>;
  }
  if (typeof value === "boolean") {
    return <StatusBadge tone={value ? "ok" : "muted"}>{value ? "Yes" : "No"}</StatusBadge>;
  }
  return <span className={_isMonoKey(key) ? "nic-mono" : undefined}>{str}</span>;
}

export function DetailsView({ data }: { data: unknown }): ReactNode {
  if (data === null || data === undefined) return <p className="nic-note">No data.</p>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="nic-note">No records.</p>;
    if (typeof data[0] === "object" && data[0] !== null) {
      const cols = Array.from(new Set(data.flatMap((r) => Object.keys(r as object))));
      return (
        <div className="nic-table-wrap">
          <table className="nic-table">
            <thead>
              <tr>{cols.map((c) => <th key={c}>{humanizeKey(c)}</th>)}</tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => <td key={c}>{renderScalar(c, (row as Record<string, unknown>)[c])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <div className="nic-note">{data.join(", ")}</div>;
  }

  if (typeof data !== "object") return <span>{String(data)}</span>;

  const entries = Object.entries(data as Record<string, unknown>);
  const scalars = entries.filter(([, v]) => v === null || typeof v !== "object");
  const nested = entries.filter(([, v]) => v !== null && typeof v === "object");

  return (
    <>
      {scalars.length ? (
        <div className="nic-kv">
          {scalars.map(([k, v]) => (
            <div key={k} className="nic-kv-row">
              <span className="nic-kv-key">{humanizeKey(k)}</span>
              <span className="nic-kv-val">{renderScalar(k, v)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {nested.map(([k, v]) => (
        <div key={k} className="nic-subsection">
          <h4 className="nic-subsection-title">{humanizeKey(k)}</h4>
          <DetailsView data={v} />
        </div>
      ))}
    </>
  );
}

/* ---- Validation error list ---- */
export function ValidationList({ errors }: { errors: ValidationError[] }) {
  if (!errors?.length) return null;
  return (
    <div className="nic-vlist">
      <div className="nic-vlist-head">
        <HiExclamationCircle />
        {errors.length} validation issue{errors.length > 1 ? "s" : ""}
      </div>
      <ul>
        {errors.map((e, i) => (
          <li key={`${e.field}-${i}`}>
            <code>{e.code}</code> <strong>{e.field}</strong> — {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---- Inline alerts ---- */
export function ErrorAlert({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="nic-alert nic-alert--err">
      <HiExclamationCircle />
      <span>{children}</span>
    </div>
  );
}
export function SuccessAlert({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="nic-alert nic-alert--ok">
      <HiCheckCircle />
      <span>{children}</span>
    </div>
  );
}

/* ---- Pull a clean message out of an axios error ---- */
export function apiErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string; detail?: string } }; message?: string };
  return (
    e?.response?.data?.error ||
    e?.response?.data?.message ||
    e?.response?.data?.detail ||
    e?.message ||
    "Request failed"
  );
}
