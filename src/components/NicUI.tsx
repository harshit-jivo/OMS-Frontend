import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { HiCheckCircle, HiExclamationCircle, HiChevronDown } from "react-icons/hi2";
import { einvoiceService } from "../services/einvoiceService";
import type { CompanyChoice, ValidationError } from "../services/einvoiceService";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
/* Was a module-level `companyCache` plus a mount effect. The cache is now the
   query cache under ["einvoice","companies"], which every instance of this
   select shares — and, unlike the module variable, it is invalidatable and does
   not survive a logout. */
const NO_COMPANIES: CompanyChoice[] = [];

export function CompanyDbSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useQuery({
    queryKey: ["einvoice", "companies"],
    // A failure keeps whatever is selected; the field stays usable.
    queryFn: () => einvoiceService.listCompanies().catch(() => null),
  });
  const companies = data?.results ?? NO_COMPANIES;

  /*
   * Adopting the server default stays in an effect. It calls the PARENT's
   * `onChange`, and setting another component's state during render is illegal
   * — doing it there renders the error boundary, which is exactly what happened
   * when this was tried. The `adopted` guard keeps it to one call per result.
   */
  const [adopted, setAdopted] = useState<CompanyChoice[] | null>(null);
  useEffect(() => {
    if (!data || !companies.length || companies === adopted) return;
    if (companies.some((c) => c.company_db === value)) return;
    setAdopted(companies);
    onChange(data.default || companies[0].company_db);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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

/**
 * NIC tone names -> the app's shared badge tones.
 *
 * The four names here (`ok` / `err` / `warn` / `muted`) are kept as this
 * component's public prop, unchanged, because seven e-invoice and e-way-bill
 * screens pass them. Only the COLOUR is shared now — Phase 2.2. That split is
 * the point: what counts as an error on a NIC response is NIC's vocabulary and
 * belongs here, but what colour an error is belongs to the app.
 */
const NIC_TONES: Record<"ok" | "err" | "warn" | "muted", BadgeTone> = {
  ok: "ok",
  err: "bad",
  warn: "hold",
  muted: "neutral",
};

/**
 * NOTE — there are two components called `StatusBadge` in this codebase: this
 * one, and `components/StatusBadge.tsx` for device status. They are namespaced
 * by import path and neither is wrong, but the collision is worth knowing
 * before adding a third.
 */
export function StatusBadge({ tone, children, title }: { tone: "ok" | "err" | "warn" | "muted"; children: ReactNode; title?: string }) {
  return <Badge tone={NIC_TONES[tone]} outlined title={title}>{children}</Badge>;
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
          <Table density="compact">
            <TableHeader>
              <TableRow>{cols.map((c) => <TableHead key={c}>{humanizeKey(c)}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i}>
                  {cols.map((c) => <TableCell key={c}>{renderScalar(c, (row as Record<string, unknown>)[c])}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

/*
 * Replaced by `messageFrom` in src/lib/apiError.ts, which its 17 callers now
 * import directly.
 *
 * This was the narrower, older version of the same idea — three response keys
 * against that file's five, no distinction between an HTTP failure and a
 * TypeError thrown by our own mapping code, and no separate wording for a
 * request that never completed. `apiError.ts` was written to be the single
 * place this happens; leaving a second one in a module of UI components also
 * meant Fast Refresh could not hot-update NicUI at all.
 *
 * Kept, commented, so the old key order stays readable next to the new one.

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
*/
