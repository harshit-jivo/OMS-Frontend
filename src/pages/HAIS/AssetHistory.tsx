import { configSummary, type AssetHistoryEntry } from "../../services/haisService";

/** Accent colour for the timeline dot, by the kind of movement. */
function dotColor(action?: string): string {
  switch ((action || "").toLowerCase()) {
    case "assigned":
    case "reassigned":
    case "handover":
      return "#2563eb"; // blue — handover
    case "config updated":
    case "sent for service":
    case "service":
      return "#f59e0b"; // amber — maintenance
    case "scrapped":
    case "not working":
      return "#ef4444"; // red — end of life
    case "returned":
      return "#94a3b8"; // slate — back to store
    default:
      return "#94a3b8";
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
        <div style={{ marginTop: 8 }}>
          {entries.map((h, i) => {
            const last = i === entries.length - 1;
            const metaLine = meta(h);
            return (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
                {/* marker column: dot + connecting line */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 12 }}>
                  <span
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: "50%",
                      background: dotColor(h.action),
                      marginTop: 5,
                      flexShrink: 0,
                    }}
                  />
                  {!last && <span style={{ flex: 1, width: 2, background: "#e2e8f0", marginTop: 4 }} />}
                </div>

                {/* content column */}
                <div style={{ paddingBottom: last ? 0 : 22, flex: 1 }}>
                  <div
                    className="nic-note"
                    style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}
                  >
                    {h.date || "—"}
                  </div>
                  <div style={{ fontWeight: 600 }}>{title(h)}</div>
                  {metaLine && <div className="nic-note" style={{ marginTop: 2 }}>{metaLine}</div>}
                  {h.reason && <div className="nic-note" style={{ marginTop: 2, fontStyle: "italic" }}>{h.reason}</div>}
                  {h.config_change && (
                    <div className="nic-note" style={{ marginTop: 2 }}>Change: {h.config_change}</div>
                  )}
                  {h.config && configSummary(h.config) && (
                    <div className="nic-note" style={{ marginTop: 2 }}>Config: {configSummary(h.config)}</div>
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
