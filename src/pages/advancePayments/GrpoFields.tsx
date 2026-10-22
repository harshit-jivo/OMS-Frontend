/**
 * An Item bill's GRPO user fields — bilty number and date, transporter,
 * vehicle, LR / bill of entry, litres… (user, 2026-10-22). Everything the GRPO
 * carries is shown; what a bill may differ in is editable at the Accounts desk
 * (`grpo_fields.HEADER_EDITABLE` / `LINE_EDITABLE`), the rest read only. The A/P
 * invoice is sent the GRPO's values with the desk's changes laid over them.
 */
import { useQuery } from "@tanstack/react-query";

import { DetailField, DetailGrid } from "../../components/ui/detail";
import { Field, FormGrid, Input } from "../../components/ui/form";
import { Notice } from "../../components/ui/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type GrpoField,
  type GrpoFieldChanges,
} from "../../services/advancePaymentService";

import { formatDate } from "./rules";


function shown(field: GrpoField, value: string) {
  if (!value) return "—";
  if (field.kind === "date") return formatDate(value);
  return value;
}

/** The change set without the values that are the GRPO's own again. */
function tidy(changes: GrpoFieldChanges): GrpoFieldChanges {
  const lines = Object.fromEntries(Object.entries(changes.lines).filter(([, v]) => Object.keys(v).length));
  return { header: changes.header, lines };
}

export function GrpoFields({
  company,
  docEntry,
  changes,
  onChange,
}: {
  company: AdvancePaymentCompany | null;
  docEntry: string;
  changes: GrpoFieldChanges;
  /** Absent: read only, as every desk but Accounts sees it. */
  onChange?: (next: GrpoFieldChanges) => void;
}) {
  const query = useQuery({
    queryKey: ["advance-payments", "grpo-fields", company, docEntry],
    queryFn: () => advancePaymentService.grpoFields(company!, Number(docEntry)),
    enabled: Boolean(company && docEntry),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  if (!company || !docEntry) return null;
  if (query.isError) {
    return (
      <Notice tone="bad" title="Could not read the GRPO's fields from SAP">
        {advancePaymentError(query.error)}
      </Notice>
    );
  }
  const data = query.data;
  if (!data) return <p className="m-0 text-[12.5px] text-subtle">Reading the GRPO's fields in SAP…</p>;

  const editing = Boolean(onChange);
  const headValue = (f: GrpoField) => changes.header[f.field] ?? f.value;
  const lineValue = (line: number, f: GrpoField) => changes.lines[String(line)]?.[f.field] ?? f.value;

  const setHead = (f: GrpoField, value: string) => {
    const header = { ...changes.header };
    if (value === f.value) delete header[f.field];
    else header[f.field] = value;
    onChange?.(tidy({ ...changes, header }));
  };
  const setLine = (line: number, f: GrpoField, value: string) => {
    const key = String(line);
    const mine = { ...(changes.lines[key] ?? {}) };
    if (value === f.value) delete mine[f.field];
    else mine[f.field] = value;
    onChange?.(tidy({ ...changes, lines: { ...changes.lines, [key]: mine } }));
  };

  const editableHead = data.header.filter((f) => f.editable);
  const fixedHead = data.header.filter((f) => !f.editable && f.value);
  // The line columns: every field any line shows, editable ones first.
  const columns: GrpoField[] = [];
  for (const ln of data.lines) {
    for (const f of ln.fields) if (!columns.some((c) => c.field === f.field)) columns.push(f);
  }
  columns.sort((a, b) => Number(b.editable) - Number(a.editable));

  const input = (f: GrpoField, value: string, onValue: (v: string) => void, label: string) => (
    <Input
      aria-label={label}
      type={f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text"}
      inputMode={f.kind === "number" ? "decimal" : undefined}
      min={f.kind === "number" ? 0 : undefined}
      step={f.kind === "number" ? "any" : undefined}
      value={value}
      onChange={(e) => onValue(e.target.value)}
    />
  );

  return (
    <div className="space-y-3" data-slot="grpo-fields">
      {editing && editableHead.length ? (
        <FormGrid className="md:grid-cols-3">
          {editableHead.map((f) => (
            <Field
              key={f.field}
              label={f.label}
              hint={headValue(f) !== f.value ? `GRPO: ${shown(f, f.value)}` : undefined}
            >
              {() => input(f, headValue(f), (v) => setHead(f, v), f.label)}
            </Field>
          ))}
        </FormGrid>
      ) : null}
      {(!editing && data.header.some((f) => headValue(f))) || fixedHead.length ? (
        <DetailGrid>
          {(editing ? fixedHead : data.header.filter((f) => headValue(f))).map((f) => (
            <DetailField
              key={f.field}
              label={f.label}
              value={shown(f, headValue(f))}
              hint={
                f.editable
                  ? headValue(f) !== f.value
                    ? `Edited at Accounts · GRPO: ${shown(f, f.value)}`
                    : undefined
                  : "From the GRPO · not edited"
              }
            />
          ))}
        </DetailGrid>
      ) : null}
      {data.lines.length && columns.length ? (
        <Table density="compact" aria-label="GRPO line fields">
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              {columns.map((c) => (
                <TableHead key={c.field} className={c.kind === "number" ? "text-right" : undefined}>
                  {c.label}
                  {c.editable ? null : <span className="sr-only"> (read only)</span>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.lines.map((ln) => (
              <TableRow key={ln.line_num}>
                <TableCell>
                  <span className="block font-medium text-ink">{ln.item_code || "—"}</span>
                  <span className="block text-[11.5px] text-subtle">{ln.description}</span>
                </TableCell>
                {columns.map((c) => {
                  const f = ln.fields.find((x) => x.field === c.field);
                  if (!f) return <TableCell key={c.field}>—</TableCell>;
                  const value = lineValue(ln.line_num, f);
                  return (
                    <TableCell key={c.field} className={f.kind === "number" ? "text-right tabular-nums" : undefined}>
                      {editing && f.editable ? (
                        <div className="min-w-[7rem]">
                          {input(f, value, (v) => setLine(ln.line_num, f, v), `${f.label}, line ${ln.line_num}`)}
                        </div>
                      ) : (
                        <span className={f.editable ? "text-ink" : "text-subtle"}>{shown(f, value)}</span>
                      )}
                      {value !== f.value ? (
                        <span className="block text-[11px] text-hold">GRPO: {shown(f, f.value)}</span>
                      ) : null}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {editing ? (
        <p className="m-0 text-[12px] text-subtle">
          Greyed fields are the GRPO's and go to the A/P invoice as they are. The rest may be corrected for this bill.
        </p>
      ) : null}
    </div>
  );
}
