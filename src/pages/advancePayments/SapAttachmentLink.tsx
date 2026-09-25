/**
 * Open a document's latest SAP attachment in a new tab.
 *
 * The file comes through our API (`/advance-payments/document-attachment/`),
 * which needs the login, so a plain link cannot fetch it: the blob is fetched
 * here and the tab pointed at it. The tab is opened SYNCHRONOUSLY, before the
 * request, because a browser only allows `window.open` while it can still tie
 * it to the click; if it is blocked anyway, the file is downloaded instead.
 */
import * as React from "react";
import { HiOutlinePaperClip } from "react-icons/hi2";

import { advancePaymentService } from "../../services/advancePaymentService";

import type { DocumentAttachment } from "./constants";

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

async function openSapAttachment(attachment: DocumentAttachment): Promise<string> {
  const tab = window.open("", "_blank");
  let blob: Blob;
  try {
    blob = await advancePaymentService.documentAttachment(
      attachment.company,
      attachment.kind,
      attachment.docEntry,
    );
  } catch (error) {
    tab?.close();
    return attachmentError(error);
  }
  const url = URL.createObjectURL(blob);
  if (tab && !tab.closed) {
    // Not revoked: the tab is still reading from it. The browser reclaims it
    // when this page goes away.
    tab.location.href = url;
    return "";
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return "";
}

export function SapAttachmentLink({
  attachment,
  compact = false,
}: {
  attachment: DocumentAttachment;
  /** Just "Attachment", for a table cell; the full file name otherwise. */
  compact?: boolean;
}) {
  const [opening, setOpening] = React.useState(false);
  const [error, setError] = React.useState("");

  const open = async () => {
    setOpening(true);
    setError("");
    const message = await openSapAttachment(attachment);
    setOpening(false);
    setError(message);
  };

  const more = attachment.count > 1 ? ` (latest of ${attachment.count})` : "";
  return (
    <span className="inline-flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => void open()}
        disabled={opening}
        title={attachment.fileName}
        aria-label={`Open SAP attachment ${attachment.fileName}`}
        className="inline-flex max-w-full items-center gap-1 text-left font-medium text-brand hover:underline disabled:opacity-60"
      >
        <HiOutlinePaperClip className="size-4 shrink-0" aria-hidden />
        <span className="truncate">
          {opening ? "Opening…" : compact ? `Attachment${more}` : `${attachment.fileName}${more}`}
        </span>
      </button>
      {error ? (
        <span role="alert" className="text-[12px] text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
