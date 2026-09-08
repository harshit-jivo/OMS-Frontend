import { useEffect, useState } from "react";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineComputerDesktop,
  HiOutlineExclamationTriangle,
  HiOutlineShieldCheck,
  HiOutlineUserGroup,
  HiOutlineUserMinus,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { FilterBar, FilterSearch, FilterSpacer } from "@/components/ui/filter-bar";
import { Card, CardHeader, CardTitle, EmptyState, Stat, StatRow } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tab, TabList } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { cn } from "@/lib/utils";
import { haisService, holderLabel, type Asset } from "../../services/haisService";
import { startExcelExport, exportDateStamp, type ExcelRow } from "../../utils/excelExport";

import { MONO } from "./assetTone";

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
      .catch((e) => alive && setError(messageFrom(e, "Request failed")))
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
      .catch((e) => setError(messageFrom(e, "Request failed")))
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
      showToast({ title: "Nothing to export", message: "This report has no rows." });
      return;
    }
    startExcelExport(data, {
      fileName: `HAIS_${name}_${exportDateStamp()}`,
      sheetName: name.slice(0, 31),
    });
  };

  const activeLabel = REPORTS.find((r) => r.key === report)?.label ?? "";

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterBar>
        <FilterSearch
          label="Search by serial No. (or Asset ID / user)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. DL5440X92KK"
          className={MONO}
          fieldClassName="min-w-[280px] max-w-[520px]"
        />
        <FilterSpacer />
        <Button variant="ghost" onClick={reload} disabled={busy}>
          <HiOutlineArrowPath aria-hidden="true" /> {busy ? "Loading…" : "Refresh"}
        </Button>
        <Button onClick={exportExcel} disabled={busy}>
          <HiOutlineArrowDownTray aria-hidden="true" /> Export Excel
        </Button>
      </FilterBar>

      {error ? (
        <Card>
          <EmptyState icon={HiOutlineComputerDesktop} title="Could not load devices" hint={error} />
        </Card>
      ) : (
        <>
          <StatRow>
            <Stat label="Total devices" value={visible.length} icon={HiOutlineComputerDesktop} loading={busy} />
            <Stat label="Assigned" value={assigned.length} icon={HiOutlineUserGroup} tone="ok" loading={busy} />
            <Stat label="Unassigned" value={unassigned.length} icon={HiOutlineUserMinus} loading={busy} />
            <Stat
              label="Needs attention"
              value={attention.length}
              icon={HiOutlineExclamationTriangle}
              tone={attention.length ? "bad" : "neutral"}
              loading={busy}
            />
            <Stat
              label={`Warranty ≤${WARRANTY_SOON_DAYS}d`}
              hint="Expiring or expired"
              value={warranty.length}
              icon={HiOutlineShieldCheck}
              tone={warranty.length ? "hold" : "neutral"}
              loading={busy}
            />
          </StatRow>

          <TabList label="Reports">
            {REPORTS.map((r) => (
              <Tab key={r.key} selected={report === r.key} onClick={() => setReport(r.key)}>
                {r.label}
              </Tab>
            ))}
          </TabList>

          <Card className="overflow-hidden p-0" role="tabpanel">
            <CardHeader className="mb-0 border-b border-line px-4 py-3">
              <CardTitle>{activeLabel}</CardTitle>
            </CardHeader>
            {busy ? (
              <TableSkeleton rows={5} columns={5} />
            ) : (
              <div className="overflow-x-auto">
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
                  <Table density="compact">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Asset ID</TableHead>
                        <TableHead>Serial No.</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Warranty ends</TableHead>
                        <TableHead>Days left</TableHead>
                        <TableHead>Current user</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warranty.length === 0 ? (
                        <TableEmpty colSpan={6}>
                          No warranties expiring in {WARRANTY_SOON_DAYS} days.
                        </TableEmpty>
                      ) : (
                        warranty.map(({ a, days }) => (
                          <TableRow key={a.asset_id}>
                            <TableCell className={`${MONO} text-ink`}>{a.asset_id}</TableCell>
                            <TableCell className={MONO}>{a.serial_num}</TableCell>
                            <TableCell>{a.asset_type as string}</TableCell>
                            <TableCell className="whitespace-nowrap">{a.warranty_ends}</TableCell>
                            <TableCell
                              className={cn(
                                "whitespace-nowrap font-semibold",
                                days < 0 ? "text-bad" : days <= 30 ? "text-hold" : "text-body",
                              )}
                            >
                              {warrantyDaysLabel(days)}
                            </TableCell>
                            <TableCell>{holderLabel(a)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}

                {report === "byDept" && <CountTable title="Department" data={byDept} />}
                {report === "byCategory" && <CountTable title="Category" data={byCategory} />}
                {report === "byStatus" && <CountTable title="Working status" data={byStatus} />}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function DeviceTable({ rows, columns, empty }: { rows: Asset[]; columns: Column[]; empty: string }) {
  return (
    <Table density="compact">
      <TableHeader>
        <TableRow>
          {columns.map(([h]) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={columns.length}>{empty}</TableEmpty>
        ) : (
          rows.map((a) => (
            <TableRow key={a.asset_id}>
              {columns.map(([h, get], i) => (
                <TableCell key={h} className={i <= 1 ? cn(MONO, i === 0 && "text-ink") : undefined}>
                  {String(get(a) ?? "") || "—"}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function CountTable({ title, data }: { title: string; data: [string, number][] }) {
  const total = data.reduce((s, [, n]) => s + n, 0);
  return (
    <Table density="compact">
      <TableHeader>
        <TableRow>
          <TableHead>{title}</TableHead>
          <TableHead className="w-32 text-right">Devices</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableEmpty colSpan={2}>No data.</TableEmpty>
        ) : (
          <>
            {data.map(([name, count]) => (
              <TableRow key={name}>
                <TableCell>{name}</TableCell>
                <TableCell className="text-right tabular-nums">{count}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-surface font-semibold text-ink hover:bg-surface">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{total}</TableCell>
            </TableRow>
          </>
        )}
      </TableBody>
    </Table>
  );
}
