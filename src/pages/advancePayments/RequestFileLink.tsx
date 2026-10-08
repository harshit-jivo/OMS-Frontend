/**
 * A request's saved file, by name, that opens in a new tab.
 *
 * Files sit in three lists — the requester's attachments, the Payment stage's
 * bank details, each payout line's proof — and the payout ones are drawn deep
 * inside `PayoutDetailsForm`. Rather than thread the request id through every
 * one, the page that shows a request provides it once (`RequestFilesProvider`)
 * and each name reads it here. Outside a provider, or for a file not yet
 * uploaded, the name is plain text: there is nothing on the server to open.
 *
 * Who may open which file is the server's (`/requests/<id>/files/<f>/`): a
 * bank or payment proof only for the Payment, Audit and Final stages.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

import { advancePaymentService } from "../../services/advancePaymentService";

import { openBlobInTab, type FileAttachment } from "./attachments";

const RequestIdContext = React.createContext<number | null>(null);

/** Makes every saved file below it openable, as a file of request `value`. */
export function RequestFilesProvider({ value, children }: { value: number; children: React.ReactNode }) {
  return <RequestIdContext.Provider value={value}>{children}</RequestIdContext.Provider>;
}

async function errorMessage(error: unknown): Promise<string> {
  const response = (error as { response?: { data?: unknown; status?: number } })?.response;
  if (response?.data instanceof Blob) {
    try {
      const parsed = JSON.parse(await response.data.text()) as { message?: string; detail?: string };
      if (parsed.message || parsed.detail) return (parsed.message || parsed.detail) as string;
    } catch {
      // Not JSON: fall through to the generic message.
    }
  }
  if (response?.status === 404) return "This file is not available to you.";
  return "Could not open the file.";
}

export function RequestFileName({ file, className }: { file: FileAttachment; className?: string }) {
  const requestId = React.useContext(RequestIdContext);
  const [opening, setOpening] = React.useState(false);
  const [error, setError] = React.useState("");

  if (requestId === null || file.serverId === undefined) {
    return <span className={className}>{file.name}</span>;
  }
  const fileId = file.serverId;

  const open = async () => {
    setOpening(true);
    setError("");
    try {
      await openBlobInTab(() => advancePaymentService.requestFile(requestId, fileId), file.name);
    } catch (err) {
      setError(await errorMessage(err));
    } finally {
      setOpening(false);
    }
  };

  // A link, not a <button>: the payout form is a `<fieldset disabled>` when
  // read only, which disables every button inside it — and reading only is
  // exactly when a later stage opens these files.
  return (
    <span className={className}>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          if (!opening) void open();
        }}
        aria-disabled={opening || undefined}
        title={`Open ${file.name}`}
        className={cn(
          "max-w-full truncate text-left font-medium text-brand hover:underline",
          opening && "opacity-60",
        )}
      >
        {opening ? "Opening…" : file.name}
      </a>
      {error ? (
        <span role="alert" className="block text-[11.5px] text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
