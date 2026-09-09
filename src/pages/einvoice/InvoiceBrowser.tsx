import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiMagnifyingGlass, HiBolt } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import type { InvoiceListItem } from "../../services/einvoiceService";
import { NicField, StatusBadge, ErrorAlert, SuccessAlert, CompanyDbSelect } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import QrViewer from "../../components/QrViewer";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Notice } from "@/components/ui/page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/*
 * The module-level `cache` object that used to live here is gone — it held the
 * rows AND the filters, was written from an effect, and `cache.loaded` was only
 * set on SUCCESS, so a failed first load re-fired `load()` on every keystroke
 * in the Search box until one succeeded.
 *
 * The rows are now the query cache, keyed on the APPLIED filters. Behaviour
 * change to know about: the filter VALUES no longer survive a tab switch
 * (Einvoice.tsx mounts each tab conditionally). The data still does — returning
 * with the default filters is a cache hit and paints instantly, which is what
 * the module cache actually bought.
 */
const DEFAULTS = { companyDb: "JIVO_OIL_HANADB", search: "", limit: "25" };
const NO_ROWS: InvoiceListItem[] = [];

export default function InvoiceBrowser() {
  const [companyDb, setCompanyDb] = useState(DEFAULTS.companyDb);
  const [search, setSearch] = useState(DEFAULTS.search);
  const [limit, setLimit] = useState(DEFAULTS.limit);
  /* The COMMITTED filters — "Load Invoices" applies them. Keying on the raw
     inputs would fire a request per keystroke. */
  const [applied, setApplied] = useState(DEFAULTS);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [busyDoc, setBusyDoc] = useState<number | null>(null);
  const [qrIrn, setQrIrn] = useState<string | null>(null);

  const {
    data: rows = NO_ROWS,
    isFetching: loading,
    error: loadError,
  } = useQuery({
    queryKey: ["einvoice", "invoices", applied],
    queryFn: async () =>
      (
        await einvoiceService.listInvoices({
          companyDb: applied.companyDb.trim() || undefined,
          search: applied.search.trim() || undefined,
          limit: Number(applied.limit) || 25,
        })
      ).results,
  });

  const load = async () => {
    setApplied({ companyDb, search, limit });
    await queryClient.invalidateQueries({ queryKey: ["einvoice", "invoices"] });
  };

  const generate = async (docentry: number) => {
    setBusyDoc(docentry);
    setError("");
    setNotice("");
    setWarning("");
    try {
      const resp = await einvoiceService.generateFromInvoice(docentry, { companyDb: companyDb.trim() || undefined });
      if (resp.result?.Irn) setNotice(`IRN generated for DocEntry ${docentry}.`);
      else if (resp.error) setError(`DocEntry ${docentry}: ${resp.error}`);
      if (resp.test_warning) setWarning(resp.test_warning);
      await load();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(`DocEntry ${docentry}: ${e.response?.data?.error || messageFrom(err, "Request failed")}`);
    } finally {
      setBusyDoc(null);
    }
  };

  const sourceLabel = (s: InvoiceListItem["irn_source"]) =>
    s === "@UTL_MDEXTH" ? "SAP" : s === "OMS_IRN_LOG" ? "OMS log" : s === "OMS" ? "OMS" : "";

  const statusBadge = (r: InvoiceListItem) => {
    if (r.irn_status === "GENERATED") {
      const src = sourceLabel(r.irn_source);
      return (
        <StatusBadge tone="ok" title={src ? `IRN found in ${r.irn_source}` : undefined}>
          {src ? `IRN done (${src})` : "IRN done"}
        </StatusBadge>
      );
    }
    if (r.irn_status === "FAILED") return <StatusBadge tone="err">Failed</StatusBadge>;
    if (r.irn_status === "SKIPPED") return <StatusBadge tone="muted">Skipped</StatusBadge>;
    return <StatusBadge tone="warn">No IRN</StatusBadge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices — Generate IRN</CardTitle>
      </CardHeader>
      <p className="text-[12.5px] leading-relaxed text-subtle">
        Shows only invoices that don't yet have an IRN (checked in SAP <code>@UTL_MDEXTH</code>,
        <code> OMS_IRN_LOG</code>, and OMS) — the ones you still need to generate. Invoices that
        already have an IRN are hidden.
      </p>

      <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))] mt-3">
        <NicField label="Company DB">
          <CompanyDbSelect value={companyDb} onChange={setCompanyDb} />
        </NicField>
        <NicField label="Search" hint="DocNum or customer name">
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()} placeholder="626070166 or SAKSHI" />
        </NicField>
        <NicField label="Rows">
          <Select value={limit} onChange={(e) => setLimit(e.target.value)}>
            {["25", "50", "100"].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </NicField>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button variant="primary" onClick={() => void load()} disabled={loading}>
          <HiMagnifyingGlass aria-hidden="true" />
          {loading ? "Loading…" : "Load Invoices"}
        </Button>
      </div>

      {/* The load failure is rendered BEFORE the empty state below. It used to
          fall through to "No pending invoices — every recent invoice already
          has an IRN", which is the worst possible wrong message here. */}
      <ErrorAlert>{error || (loadError ? messageFrom(loadError, "Request failed") : "")}</ErrorAlert>
      <SuccessAlert>{notice}</SuccessAlert>
      {warning ? (
        <Notice tone="bad" className="mt-2.5 font-semibold">
          {warning}
        </Notice>
      ) : null}

      {qrIrn ? (
        <div className="mt-5 space-y-4">
          <QrViewer src={einvoiceService.qrImageUrl(qrIrn)} irn={qrIrn}
            caption={`Signed QR for IRN ${qrIrn.slice(0, 12)}…`} />
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Button onClick={() => setQrIrn(null)}>Close QR</Button>
          </div>
        </div>
      ) : null}

      {rows.length ? (
        <div className="overflow-x-auto rounded-card border border-line">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>DocEntry</TableHead><TableHead>Doc No</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead>
                <TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.docentry}>
                  <TableCell>{r.docentry}</TableCell>
                  <TableCell className="font-mono text-[12px]">{r.docnum}</TableCell>
                  <TableCell>{r.cardname}</TableCell>
                  <TableCell className="whitespace-nowrap">{(r.docdate || "").slice(0, 10)}</TableCell>
                  <TableCell className="text-right">{Number(r.doctotal).toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    {statusBadge(r)}
                    {r.last_error ? <div className="text-[12.5px] leading-relaxed text-subtle mt-1">{r.last_error}</div> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.irn && r.irn_source === "OMS" ? (
                      // QR is renderable only for OMS-generated IRNs (signed QR stored in OMS DB)
                      <Button size="sm"
                        onClick={() => setQrIrn(r.irn!)}>
                        View QR
                      </Button>
                    ) : r.irn ? (
                      // Already has an IRN in SAP (@UTL_MDEXTH) / OMS_IRN_LOG — nothing to generate.
                      <span className="text-[12.5px] leading-relaxed text-subtle" title={r.irn}>Generated in {sourceLabel(r.irn_source)}</span>
                    ) : (
                      <Button size="sm" variant="primary"
                        onClick={() => void generate(r.docentry)} disabled={busyDoc === r.docentry}>
                        <HiBolt aria-hidden="true" />
                        {busyDoc === r.docentry ? "Generating…" : "Generate IRN"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : !loading ? (
        <p className="text-[12.5px] leading-relaxed text-subtle">
          {loadError
            ? "Could not load invoices."
            : "No pending invoices — every recent invoice already has an IRN. Use Search to find a specific one."}
        </p>
      ) : null}
    </Card>
  );
}
