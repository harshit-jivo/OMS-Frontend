/**
 * What SAP already took off a request's bills (or its POs' bills): the TDS it
 * withheld and the debit notes against them. Shown to the Payment desk and
 * the stages after it (user, 2026-10-16), bill-wise in the documents table and
 * in total under Payment & Bank Details, so no one deducts either again.
 */
import { useQuery } from "@tanstack/react-query";

import {
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapDocumentDeduction,
} from "../../services/advancePaymentService";

import type { OpenDocument } from "./constants";
import { sapAmount } from "./sapMapping";

export interface Deduction {
  /** TDS SAP withheld: on the bill, or on a PO's bills. */
  tds: number;
  /** A PO: how many bills the TDS is on; null for a bill. */
  bills: number | null;
  debit: number;
  notes: number[];
}

export interface Deductions {
  /** By the document's id (`PCH-12`, `POR-7`). */
  byId: Map<string, Deduction>;
  tds: number;
  debit: number;
}

export interface DeductionTarget {
  kind: "bill" | "po";
  /** SAP DocEntries. */
  entries: number[];
}

/** The request's bills, else its POs: what SAP is asked about. */
export function deductionTargets(selected: OpenDocument[]): DeductionTarget | null {
  const bills = selected.filter((d) => d.id.startsWith("PCH-")).map((d) => Number(d.id.slice(4)));
  if (bills.length) return { kind: "bill", entries: bills };
  const pos = selected.filter((d) => d.id.startsWith("POR-")).map((d) => Number(d.id.slice(4)));
  return pos.length ? { kind: "po", entries: pos } : null;
}

export function deductionsOf(kind: "bill" | "po", rows: SapDocumentDeduction[]): Deductions {
  const prefix = kind === "bill" ? "PCH-" : "POR-";
  const byId = new Map<string, Deduction>();
  let tds = 0;
  let debit = 0;
  for (const row of rows) {
    const one: Deduction = {
      tds: sapAmount(row.tds),
      bills: row.bills,
      debit: row.debits ? sapAmount(row.debits.amount) : 0,
      notes: row.debits?.notes ?? [],
    };
    byId.set(`${prefix}${row.doc_entry}`, one);
    tds += one.tds;
    debit += one.debit;
  }
  return { byId, tds: Math.round(tds * 100) / 100, debit: Math.round(debit * 100) / 100 };
}

/**
 * The SAP deductions on those bills or POs; nothing until `enabled`, nor with
 * no target. The documents table and the TDS section share one lookup.
 */
export function useDeductions(
  company: AdvancePaymentCompany | "" | null | undefined,
  target: DeductionTarget | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["advance-payments", "document-deductions", company, target?.kind, target?.entries.join(",")],
    queryFn: async () =>
      deductionsOf(target!.kind, await advancePaymentService.documentDeductions(company as AdvancePaymentCompany, target!.kind, target!.entries)),
    enabled: enabled && !!company && target !== null,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}
