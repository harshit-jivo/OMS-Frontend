/**
 * What a chosen PO's / bill's SAP attachment was read to say, next to SAP.
 *
 * Shows only a reading SAVED with the request. Nothing here reads a file:
 * the automatic OCR of attachments (in the background while raising, and on
 * the desk) was removed on 2026-10-07. Requests raised before then keep the
 * reading they were saved with; newer ones have none, and show nothing.
 */
import { HiOutlineCheckCircle, HiOutlineXCircle } from "react-icons/hi2";

import {
  type AttachmentCheck,
  type AttachmentReading,
  type ReadField,
} from "../../services/advancePaymentService";

import { formatDate, formatINR } from "./rules";

const SOURCE_LABEL: Record<string, string> = {
  "pdf-text": "read from the PDF's text",
  ocr: "read by OCR",
  "pdf-text+ocr": "read from the PDF, part by OCR",
  excel: "read from the Excel file",
  csv: "read from the CSV file",
};

type FieldKey = keyof AttachmentReading["fields"];

const ROWS: ReadonlyArray<{ key: FieldKey; label: string }> = [
  { key: "invoice_number", label: "Invoice No." },
  { key: "invoice_date", label: "Invoice Date" },
  { key: "amount", label: "Amount" },
  { key: "party_name", label: "Party Name" },
  { key: "account_number", label: "Account No." },
  { key: "ifsc", label: "IFSC" },
];

function show(key: FieldKey, value: ReadField<string | number>["value"] | string | null): string {
  if (value === null || value === "") return "—";
  if (key === "amount") return formatINR(Number(value));
  if (key === "invoice_date") return formatDate(String(value));
  return String(value);
}

/** The reading saved with the request, or nothing when it has none. */
export function AttachmentReadingTable({ stored }: { stored?: AttachmentCheck | null }) {
  if (!stored) return null;
  if ("error" in stored) {
    return (
      <p role="alert" className="text-[12px] text-hold">
        Could not read the attachment: {stored.error}
      </p>
    );
  }
  return <ReadingFields data={stored} />;
}

function ReadingFields({ data }: { data: AttachmentReading }) {
  return (
    <div className="space-y-1.5" data-slot="attachment-reading">
      <p className="text-[11.5px] text-subtle">
        {data.file_name}, {SOURCE_LABEL[data.source] ?? data.source}
        {data.pages > 1 ? `, ${data.pages} pages` : ""}.
      </p>
      <table className="w-full text-left text-[12.5px]">
        <thead>
          <tr className="text-[11px] text-subtle">
            <th className="py-1 pr-3 font-medium">Field</th>
            <th className="py-1 pr-3 font-medium">On the attachment</th>
            <th className="py-1 pr-3 font-medium">In SAP</th>
            <th className="py-1 font-medium">
              <span className="sr-only">Check</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ key, label }) => {
            const field = data.fields[key] as ReadField<string | number>;
            return (
              <tr key={key} className="border-t border-line/60">
                <td className="py-1 pr-3 text-subtle">{label}</td>
                <td className="py-1 pr-3 font-medium text-ink">{show(key, field.value)}</td>
                <td className="py-1 pr-3 text-subtle">{show(key, field.sap)}</td>
                <td className="py-1">
                  {field.match === true ? (
                    <HiOutlineCheckCircle className="size-4 text-ok" aria-label="Matches SAP" />
                  ) : field.match === false ? (
                    <HiOutlineXCircle className="size-4 text-bad" aria-label="Differs from SAP" />
                  ) : (
                    <span className="text-subtle" aria-label="Not compared">
                      –
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
