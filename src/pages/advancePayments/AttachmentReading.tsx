/**
 * What a chosen PO's / bill's SAP attachment says, next to what SAP says.
 *
 * `AttachmentReadingStatus`: a one-line chip for the document's row.
 * `AttachmentReadingTable`: the fields, attachment against SAP, for the
 * row's detail. Both read the same query (`readingQuery.ts`).
 */
import { HiOutlineCheckCircle, HiOutlineXCircle } from "react-icons/hi2";

import { Badge } from "../../components/ui/badge";
import { advancePaymentError, type AttachmentReading, type ReadField } from "../../services/advancePaymentService";

import { useAttachmentReading, summarise } from "./readingQuery";
import type { DocumentAttachment } from "./constants";
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

export function AttachmentReadingStatus({ attachment }: { attachment: DocumentAttachment | undefined }) {
  const reading = useAttachmentReading(attachment);
  if (!attachment) return null;
  if (reading.isPending) {
    return (
      <Badge tone="neutral" data-slot="attachment-status">
        Reading attachment…
      </Badge>
    );
  }
  if (reading.isError) {
    return (
      <Badge tone="hold" data-slot="attachment-status">
        Attachment not read
      </Badge>
    );
  }
  const summary = summarise(reading.data);
  return (
    <Badge tone={summary.tone} data-slot="attachment-status">
      {summary.text}
    </Badge>
  );
}

export function AttachmentReadingTable({ attachment }: { attachment: DocumentAttachment }) {
  const reading = useAttachmentReading(attachment);
  if (reading.isPending) {
    return (
      <p className="text-[12px] text-subtle">
        Reading the attachment… a scan or photo takes about ten seconds a page.
      </p>
    );
  }
  if (reading.isError) {
    return (
      <p role="alert" className="text-[12px] text-hold">
        Could not read the attachment: {advancePaymentError(reading.error)}
      </p>
    );
  }
  const data = reading.data;
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
