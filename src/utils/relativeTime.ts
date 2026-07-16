/**
 * Human-readable "time ago" for activity timestamps.
 *
 * Display only — the authoritative activity status comes from the server (see
 * webDeviceService / the admin API's `status` field). A browser clock that runs
 * ahead of the server would otherwise produce a negative delta, so anything in
 * the future is clamped to "Just now" rather than rendering "in 3 minutes".
 */
export const relativeTime = (value?: string | null): string => {
  if (!value) return "-";

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "-";

  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 60) return "Just now"; // also covers a slightly-ahead clock
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
};

export default relativeTime;
