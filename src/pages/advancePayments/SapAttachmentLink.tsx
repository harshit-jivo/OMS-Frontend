/**
 * Open SAP attachments in a new tab: a document's latest one, or every one
 * related to it.
 *
 * The file comes through our API (`/advance-payments/document-attachment/`),
 * which needs the login, so a plain link cannot fetch it: the blob is fetched
 * here and the tab pointed at it. The tab is opened SYNCHRONOUSLY, before the
 * request, because a browser only allows `window.open` while it can still tie
 * it to the click; if it is blocked anyway, the file is downloaded instead.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { HiOutlinePaperClip } from "react-icons/hi2";

import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapAttachmentListKind,
  type SapAttachmentSource,
  type SapRelatedAttachment,
} from "../../services/advancePaymentService";

import { openBlobInTab } from "./attachments";
import type { DocumentAttachment } from "./constants";
import { formatDate } from "./rules";

/** What it takes to fetch one file: the document it sits on, and its line (the latest without). */
interface AttachmentTarget {
  company: AdvancePaymentCompany;
  kind: SapAttachmentSource;
  docEntry: number;
  line?: number;
  fileName: string;
}

/** The server's message out of a blob error body, else a plain one. */
async function attachmentError(error: unknown): Promise<string> {
  const data = (error as { response?: { data?: unknown; status?: number } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      // Not JSON: fall through to the generic message.
    }
  }
  return "Could not open the SAP attachment.";
}

async function openSapAttachment(target: AttachmentTarget): Promise<string> {
  try {
    await openBlobInTab(
      () =>
        advancePaymentService.documentAttachment(target.company, target.kind, target.docEntry, target.line),
      target.fileName,
    );
    return "";
  } catch (error) {
    return attachmentError(error);
  }
}

/** A button that opens one file, with its error under it. */
function OpenFileButton({ target, label }: { target: AttachmentTarget; label: string }) {
  const [opening, setOpening] = React.useState(false);
  const [error, setError] = React.useState("");

  const open = async () => {
    setOpening(true);
    setError("");
    const message = await openSapAttachment(target);
    setOpening(false);
    setError(message);
  };

  return (
    <span className="inline-flex min-w-0 max-w-full flex-col gap-0.5">
      <button
        type="button"
        onClick={() => void open()}
        disabled={opening}
        title={target.fileName}
        aria-label={`Open SAP attachment ${target.fileName}`}
        className="inline-flex max-w-full items-center gap-1 text-left font-medium text-brand hover:underline disabled:opacity-60"
      >
        <HiOutlinePaperClip className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{opening ? "Opening…" : label}</span>
      </button>
      {error ? (
        <span role="alert" className="text-[12px] text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** The document's LATEST SAP attachment. */
export function SapAttachmentLink({
  attachment,
  compact = false,
}: {
  attachment: DocumentAttachment;
  /** Just "Attachment", for a table cell; the full file name otherwise. */
  compact?: boolean;
}) {
  const more = attachment.count > 1 ? ` (latest of ${attachment.count})` : "";
  return (
    <OpenFileButton
      target={attachment}
      label={compact ? `Attachment${more}` : `${attachment.fileName}${more}`}
    />
  );
}

/** Groups the list by the document each file sits on, in the server's order. */
function bySource(rows: SapRelatedAttachment[]) {
  const groups: Array<{ key: string; title: string; rows: SapRelatedAttachment[] }> = [];
  for (const row of rows) {
    const key = `${row.kind}-${row.doc_entry}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, title: `${row.kind_label} ${row.doc_num ?? row.doc_entry}`, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

/**
 * EVERY SAP attachment related to a document: a bill's own, its GRPOs' and
 * the POs behind them; a PO's own. Read from SAP when shown.
 */
export function SapAttachmentList({
  company,
  kind,
  docEntry,
}: {
  company: AdvancePaymentCompany;
  kind: SapAttachmentListKind;
  docEntry: number;
}) {
  const query = useQuery({
    queryKey: ["advance-payments", "document-attachments", company, kind, docEntry],
    queryFn: () => advancePaymentService.documentAttachments(company, kind, docEntry),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  if (query.isPending) {
    return <span className="text-[12px] text-subtle">Reading the attachments from SAP…</span>;
  }
  if (query.isError) {
    return (
      <span role="alert" className="text-[12px] text-danger">
        {advancePaymentError(query.error)}
      </span>
    );
  }
  if (query.data.length === 0) return <span className="text-subtle">None in SAP</span>;

  return (
    <div className="flex flex-col gap-2" aria-label="SAP attachments">
      {bySource(query.data).map((group) => (
        <div key={group.key} className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle">
            {group.title} ({group.rows.length})
          </span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {group.rows.map((row) => (
              <li key={row.line} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <OpenFileButton
                  target={{
                    company,
                    kind: row.kind,
                    docEntry: row.doc_entry,
                    line: row.line,
                    fileName: row.file_name,
                  }}
                  label={row.file_name}
                />
                {row.date ? <span className="text-[11px] text-subtle">{formatDate(row.date)}</span> : null}
                {row.note ? <span className="text-[11px] text-subtle">· {row.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
