/**
 * Reading a chosen PO's / bill's SAP attachment, and summing up what it says.
 *
 * One React Query per attachment, shared by the row's status chip and its
 * detail table, so ticking a document reads it once. The server caches the
 * OCR too, so un-ticking and ticking again is instant.
 */
import { useQuery } from "@tanstack/react-query";

import { advancePaymentService, type AttachmentReading } from "../../services/advancePaymentService";

import type { DocumentAttachment } from "./constants";

export function useAttachmentReading(attachment: DocumentAttachment | undefined) {
  return useQuery({
    queryKey: [
      "advance-payments",
      "attachment-read",
      attachment?.company,
      attachment?.kind,
      attachment?.docEntry,
      attachment?.fileName,
    ],
    queryFn: () =>
      advancePaymentService.readDocumentAttachment(
        attachment!.company,
        attachment!.kind,
        attachment!.docEntry,
      ),
    enabled: Boolean(attachment),
    // An attachment does not change under a request being filled in.
    staleTime: Infinity,
    retry: false,
  });
}

export type ReadingSummary =
  | { tone: "ok"; text: string }
  | { tone: "bad"; text: string }
  | { tone: "note"; text: string };

/** One line for the row: all agree, how many differ, or nothing to compare. */
export function summarise(reading: AttachmentReading): ReadingSummary {
  const fields = Object.values(reading.fields);
  const differ = fields.filter((f) => f.match === false).length;
  const agree = fields.filter((f) => f.match === true).length;
  if (differ) return { tone: "bad", text: `${differ} ${differ === 1 ? "differs" : "differ"} from SAP` };
  if (agree) return { tone: "ok", text: agree === fields.length ? "Matches SAP" : `${agree} match SAP` };
  return { tone: "note", text: "Read: nothing to compare" };
}
