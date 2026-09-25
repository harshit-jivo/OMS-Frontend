/**
 * A file on a request or a payout: one just chosen (`file`, not yet sent) or
 * one the server already holds (`serverId`). The lists show both alike; saving
 * sends the new ones and removes the saved ones that were taken off.
 */
export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  /** Chosen in this browser, to be uploaded on save. */
  file?: File;
  /** Held by the server: `advance_payment_request_file.id`. */
  serverId?: number;
}

/** A newly chosen file, as the lists hold it. */
export function attachFile(file: File): FileAttachment {
  return {
    id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
    name: file.name,
    size: file.size,
    file,
  };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
