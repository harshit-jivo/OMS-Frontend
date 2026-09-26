/**
 * Reading a chosen PO's / bill's SAP attachment, and summing up what it says.
 *
 * One React Query per attachment, shared by the row's status chip and its
 * detail table, so ticking a document reads it once. The server caches the
 * OCR too, so un-ticking and ticking again is instant.
 */
import { useQueries, useQuery } from "@tanstack/react-query";

import {
  advancePaymentError,
  advancePaymentService,
  type AttachmentCheck,
  type AttachmentReading,
} from "../../services/advancePaymentService";

import type { DocumentAttachment, OpenDocument } from "./constants";

function readingQuery(attachment: DocumentAttachment | undefined) {
  return {
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
  };
}

export function useAttachmentReading(attachment: DocumentAttachment | undefined, enabled = true) {
  const query = readingQuery(attachment);
  return useQuery({ ...query, enabled: query.enabled && enabled });
}

/**
 * Read every chosen document's SAP attachment IN THE BACKGROUND, while the
 * requester fills the rest of the form. Nothing is shown to them; the page
 * only waits for it at Submit, so each document is saved with its reading.
 *
 * A document that already carries a reading (a request being edited) is not
 * read again. A reading that fails is kept as its error, so a file that
 * cannot be read never holds the request up.
 */
export function useBackgroundReadings(documents: OpenDocument[]): {
  pending: boolean;
  readings: Map<string, AttachmentCheck>;
} {
  const toRead = documents.filter((doc) => doc.attachment && !doc.reading);
  const results = useQueries({ queries: toRead.map((doc) => readingQuery(doc.attachment)) });
  const readings = new Map<string, AttachmentCheck>();
  results.forEach((result, index) => {
    const id = toRead[index].id;
    if (result.data) readings.set(id, result.data);
    else if (result.isError) readings.set(id, { error: advancePaymentError(result.error) });
  });
  return { pending: results.some((result) => result.isPending), readings };
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
