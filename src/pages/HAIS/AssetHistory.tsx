import { configSummary, type AssetHistoryEntry } from "../../services/haisService";

/** Accent colour (as a `.hais-history-dot--*` modifier) for the timeline dot,
 *  by the kind of movement. */
function dotTone(action?: string): "handover" | "maintenance" | "eol" | "default" {
  switch ((action || "").toLowerCase()) {
    case "assigned":
    case "reassigned":
    case "handover":
      return "handover"; // blue — handover
    case "config updated":
    case "sent for service":
    case "service":
      return "maintenance"; // amber — maintenance
    case "scrapped":
    case "not working":
      return "eol"; // red — end of life
    case "returned":
      return "default"; // slate — back to store
    default:
      return "default";
  }
}

/** Headline for an entry, e.g. "Handed over to Priya Nair". */
function title(h: AssetHistoryEntry): string {
  const to = h.to_user_name || h.to_user_id || "";
  const from = h.from_user_name || h.from_user_id || "";
  switch ((h.action || "").toLowerCase()) {
    case "assigned":
      return to ? `Assigned to ${to}` : "Assigned";
    case "handover":
    case "reassigned":
      return to ? `Handed over to ${to}` : "Handed over";
    case "config updated":
      return "Configuration updated";
    case "returned":
      return from ? `Returned by ${from}` : "Returned to store";
    case "sent for service":
    case "service":
      return "Sent for service";
    case "scrapped":
      return "Scrapped";
    default:
      return h.action || "Update";
  }
}

/** Secondary line, e.g. "EMP2210 · Accounts · 2nd floor". */
function meta(h: AssetHistoryEntry): string {
  const emp = h.to_user_id || h.from_user_id || "";
  return [emp, h.department, h.location].filter(Boolean).join(" · ");
}

/**
 * Full movement trail of a single device — every handover, in order, showing
 * WHEN it moved, TO/FROM whom, and WHY. Newest entry first, timeline style.
 */
export default function AssetHistory({ history }: { history?: AssetHistoryEntry[] }) {
  const entries = [...(history ?? [])].reverse();

  return (
    <div className="nic-subsection">
      <h4 className="nic-subsection-title">History</h4>
      {entries.length === 0 ? (
        <p className="nic-note">No history recorded yet.</p>
      ) : (
        <div className="hais-history-list">
          {entries.map((h, i) => {
            const last = i === entries.length - 1;
            const metaLine = meta(h);
            return (
              <div key={i} className="hais-history-row">
                {/* marker column: dot + connecting line */}
                <div className="hais-history-marker">
                  <span className={`hais-history-dot hais-history-dot--${dotTone(h.action)}`} />
                  {!last && <span className="hais-history-connector" />}
                </div>

                {/* content column */}
                <div className={`hais-history-content${last ? " hais-history-content--last" : ""}`}>
                  <div className="nic-note hais-history-date">
                    {h.date || "—"}
                  </div>
                  <div className="hais-history-title">{title(h)}</div>
                  {metaLine && <div className="nic-note hais-history-sub">{metaLine}</div>}
                  {h.reason && <div className="nic-note hais-history-reason">{h.reason}</div>}
                  {h.config_change && (
                    <div className="nic-note hais-history-sub">Change: {h.config_change}</div>
                  )}
                  {h.config && configSummary(h.config) && (
                    <div className="nic-note hais-history-sub">Config: {configSummary(h.config)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
