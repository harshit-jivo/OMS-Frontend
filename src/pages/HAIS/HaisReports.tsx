import { useEffect, useState } from "react";
import { HiArrowPath, HiArrowDownTray, HiMagnifyingGlass } from "react-icons/hi2";
import { ErrorAlert, apiErrorMessage } from "../../components/NicUI";
import { haisService, holderLabel, type Asset } from "../../services/haisService";
import { startExcelExport, exportDateStamp, type ExcelRow } from "../../utils/excelExport";

type ReportKey =
  | "unassigned"
  | "assigned"
  | "attention"
  | "warranty"
  | "byDept"
  | "byCategory"
  | "byStatus";

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: "unassigned", label: "Unassigned Devices" },
  { key: "assigned", label: "Assigned Devices" },
  { key: "attention", label: "Needs Attention" },
  { key: "warranty", label: "Warranty Expiring / Expired" },
  { key: "byDept", label: "By Department" },
  { key: "byCategory", label: "By Category" },
  { key: "byStatus", label: "By Status" },
];

// Warranty is considered "expiring" within this many days.
const WARRANTY_SOON_DAYS = 60;

type Column = [string, (a: Asset) => unknown];

// Column sets — serial number is included first-class since devices are mostly
// checked by serial. Used for BOTH the on-screen table and the Excel export.
const UNASSIGNED_COLS: Column[] = [
  ["Asset ID", (a) => a.asset_id],
  ["Serial No.", (a) => a.serial_num],
  ["Category", (a) => a.asset_type],
  ["Location", (a) => a.current_location],
  ["Status", (a) => a.working_status],
];
const ASSIGNED_COLS: Column[] = [
  ["Asset ID", (a) => a.asset_id],
  ["Serial No.", (a) => a.serial_num],
  ["Category", (a) => a.asset_type],
  ["Current User", (a) => holderLabel(a)],
  ["Emp ID", (a) => a.current_user_id],
  ["Department", (a) => a.department],
];
const ATTENTION_COLS: Column[] = [
  ["Asset ID", (a) => a.asset_id],
  ["Serial No.", (a) => a.serial_num],
  ["Category", (a) => a.asset_type],
  ["Status", (a) => a.working_status],
  ["Current User", (a) => holderLabel(a)],
  ["Location", (a) => a.current_location],
  ["Last Service", (a) => a.date_of_last_service],
];

function parseDdMmYyyy(s?: string): Date | null {
  const m = (s ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isUnassigned(a: Asset): boolean {
  return !(a.current_user_name || a.current_user_id || "").trim();
}

function statusIs(a: Asset, ...values: string[]): boolean {
  return values.includes((a.working_status || "").toLowerCase());
}

function groupCount(items: Asset[], keyOf: (a: Asset) => string): [string, number][] {
  const m = new Map<string, number>();
  items.forEach((a) => {
    const k = (keyOf(a) || "—").trim() || "—";
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return [...m.entries()].sort((p, q) => q[1] - p[1]);
}

function toRows(list: Asset[], cols: Column[]): ExcelRow[] {
  return list.map((a) => Object.fromEntries(cols.map(([h, get]) => [h, get(a) ?? ""])));
}

const warrantyDaysLabel = (days: number) => (days < 0 ? `Expired ${-days}d ago` : `${days}d`);

export default function HaisReports() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReportKey>("unassigned");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    haisService
      .list({})
      .then((d) => alive && setRows(d.results ?? []))
      .catch((e) => alive && setError(apiErrorMessage(e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, []);

  const reload = () => {
    setBusy(true);
    setError("");
    haisService
      .list({})
      .then((d) => setRows(d.results ?? []))
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setBusy(false));
  };

  // Search — primarily by serial number, but also Asset ID / user for convenience.
  const q = search.trim().toLowerCase();
  const visible = q
    ? rows.filter((a) =>
        [a.serial_num, a.asset_id, a.current_user_name, a.current_user_id]
          .some((v) => String(v ?? "").toLowerCase().includes(q)),
      )
    : rows;

  // --- derived sets (respect the search) ---
  const unassigned = visible.filter(isUnassigned);
  const assigned = visible.filter((a) => !isUnassigned(a));
  const attention = visible.filter((a) => statusIs(a, "under repair", "not working"));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const warranty = visible
    .map((a) => ({ a, date: parseDdMmYyyy(a.warranty_ends) }))
    .filter((x): x is { a: Asset; date: Date } => x.date !== null)
    .map((x) => ({ a: x.a, days: Math.round((x.date.getTime() - today.getTime()) / 86400000) }))
    .filter((x) => x.days <= WARRANTY_SOON_DAYS)
    .sort((p, q2) => p.days - q2.days);

  const byDept = groupCount(visible, (a) => (a.department as string) || "");
  const byCategory = groupCount(visible, (a) => (a.asset_type as string) || "");
  const byStatus = groupCount(visible, (a) => (a.working_status as string) || "");

  const cards = [
    { label: "Total Devices", value: visible.length },
    { label: "Assigned", value: assigned.length },
    { label: "Unassigned", value: unassigned.length },
    { label: "Needs Attention", value: attention.length },
    { label: "Warranty ≤60d / Expired", value: warranty.length },
  ];

  // --- Excel export of the active report ---
  const exportExcel = () => {
    let data: ExcelRow[] = [];
    let name = "";
    switch (report) {
      case "unassigned": data = toRows(unassigned, UNASSIGNED_COLS); name = "Unassigned"; break;
      case "assigned": data = toRows(assigned, ASSIGNED_COLS); name = "Assigned"; break;
      case "attention": data = toRows(attention, ATTENTION_COLS); name = "Needs_Attention"; break;
      case "warranty":
        data = warranty.map(({ a, days }) => ({
          "Asset ID": a.asset_id,
          "Serial No.": a.serial_num ?? "",
          Category: a.asset_type ?? "",
          "Warranty Ends": a.warranty_ends ?? "",
          "Days Left": warrantyDaysLabel(days),
          "Current User": holderLabel(a),
        }));
        name = "Warranty";
        break;
      case "byDept": data = byDept.map(([n, c]) => ({ Department: n, Devices: c })); name = "By_Department"; break;
      case "byCategory": data = byCategory.map(([n, c]) => ({ Category: n, Devices: c })); name = "By_Category"; break;
      case "byStatus": data = byStatus.map(([n, c]) => ({ Status: n, Devices: c })); name = "By_Status"; break;
    }
    if (data.length === 0) {
      window.alert("Nothing to export for this report.");
      return;
    }
    startExcelExport(data, {
      fileName: `HAIS_${name}_${exportDateStamp()}`,
      sheetName: name.slice(0, 31),
    });
  };

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="ofs-card-mark" />
          <h2>Reports</h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ofs-primary" onClick={exportExcel}>
            <HiArrowDownTray style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Export Excel
          </button>
          <button className="nic-tab" onClick={reload} disabled={busy}>
            <HiArrowPath style={{ verticalAlign: "-3px", marginRight: 6 }} />
            {busy ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Search — mostly by serial number */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="nic-field" style={{ flex: "1 1 320px", marginBottom: 0 }}>
          <span className="nic-label">Search by Serial No. (or Asset ID / user)</span>
          <div style={{ position: "relative" }}>
            <HiMagnifyingGlass style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
            <input
              className="nic-input nic-mono"
              style={{ paddingLeft: 32 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. DL5440X92KK"
            />
          </div>
        </label>
        {q && (
          <button className="nic-tab" onClick={() => setSearch("")}>Clear</button>
        )}
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      {/* Summary cards */}
      <div className="hais-report-cards">
        {cards.map((c) => (
          <div className="hais-report-card" key={c.label}>
            <div className="hais-report-card-value">{c.value}</div>
            <div className="hais-report-card-label">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Report picker */}
      <div className="nic-tabs" style={{ margin: "14px 0" }}>
        {REPORTS.map((r) => (
          <button
            key={r.key}
            className={`nic-tab ${report === r.key ? "nic-tab-active" : ""}`}
            onClick={() => setReport(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Report body */}
      <div className="nic-table-wrap">
        {report === "unassigned" && (
          <DeviceTable rows={unassigned} columns={UNASSIGNED_COLS} empty="No unassigned devices — everything is issued." />
        )}
        {report === "assigned" && (
          <DeviceTable rows={assigned} columns={ASSIGNED_COLS} empty="No assigned devices." />
        )}
        {report === "attention" && (
          <DeviceTable rows={attention} columns={ATTENTION_COLS} empty="No devices under repair or not working." />
        )}

        {report === "warranty" && (
          <table className="nic-table">
            <thead>
              <tr>
                <th>Asset ID</th>
                <th>Serial No.</th>
                <th>Category</th>
                <th>Warranty Ends</th>
                <th>Days Left</th>
                <th>Current User</th>
              </tr>
            </thead>
            <tbody>
              {warranty.length === 0 ? (
                <tr><td colSpan={6} className="nic-note">No warranties expiring in {WARRANTY_SOON_DAYS} days.</td></tr>
              ) : (
                warranty.map(({ a, days }) => (
                  <tr key={a.asset_id}>
                    <td className="nic-mono">{a.asset_id}</td>
                    <td className="nic-mono">{a.serial_num}</td>
                    <td>{a.asset_type as string}</td>
                    <td>{a.warranty_ends}</td>
                    <td style={{ color: days < 0 ? "#ef4444" : days <= 30 ? "#f59e0b" : "inherit", fontWeight: 600 }}>
                      {warrantyDaysLabel(days)}
                    </td>
                    <td>{holderLabel(a)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {report === "byDept" && <CountTable title="Department" data={byDept} />}
        {report === "byCategory" && <CountTable title="Category" data={byCategory} />}
        {report === "byStatus" && <CountTable title="Working Status" data={byStatus} />}
      </div>
    </section>
  );
}

function DeviceTable({ rows, columns, empty }: { rows: Asset[]; columns: Column[]; empty: string }) {
  return (
    <table className="nic-table">
      <thead>
        <tr>{columns.map(([h]) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={columns.length} className="nic-note">{empty}</td></tr>
        ) : (
          rows.map((a) => (
            <tr key={a.asset_id}>
              {columns.map(([h, get], i) => (
                <td key={h} className={i <= 1 ? "nic-mono" : undefined}>{String(get(a) ?? "") || "—"}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function CountTable({ title, data }: { title: string; data: [string, number][] }) {
  const total = data.reduce((s, [, n]) => s + n, 0);
  return (
    <table className="nic-table">
      <thead>
        <tr><th>{title}</th><th style={{ width: 120 }}>Devices</th></tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr><td colSpan={2} className="nic-note">No data.</td></tr>
        ) : (
          <>
            {data.map(([name, count]) => (
              <tr key={name}><td>{name}</td><td>{count}</td></tr>
            ))}
            <tr style={{ fontWeight: 700 }}><td>Total</td><td>{total}</td></tr>
          </>
        )}
      </tbody>
    </table>
  );
}
