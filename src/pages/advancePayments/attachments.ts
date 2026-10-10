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
  /** Where it stands on its way to SAP; absent until the server has tried. */
  sap?: "IN_SAP" | "ON_SHARE" | "NOT_SHARED";
  /** Why it is not on the SAP share. */
  sapError?: string;
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

/**
 * Open a file our API sends as a blob in a new tab.
 *
 * The API needs the login, so a plain link cannot fetch it: the blob is fetched
 * here and the tab pointed at it. The tab is opened SYNCHRONOUSLY, before the
 * request, because a browser only allows `window.open` while it can still tie
 * it to the click; if it is blocked anyway, the file is downloaded instead.
 * Throws what `load` throws, having closed the empty tab.
 */
export async function openBlobInTab(load: () => Promise<Blob>, fileName: string): Promise<void> {
  const tab = window.open("", "_blank");
  let blob: Blob;
  try {
    blob = await load();
  } catch (error) {
    tab?.close();
    throw error;
  }
  const url = URL.createObjectURL(blob);
  if (tab && !tab.closed) {
    // Not revoked: the tab is still reading from it. The browser reclaims it
    // when this page goes away.
    tab.location.href = url;
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
