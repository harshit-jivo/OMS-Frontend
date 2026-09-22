/** A file added to a request or a payout, held in memory only — nothing is uploaded. */
export interface MockAttachment {
  id: string;
  name: string;
  size: number;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
