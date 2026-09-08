/**
 * Full movement trail of a single device — every handover, in order, showing
 * WHEN it moved, TO/FROM whom, and WHY. Newest entry first, on `ui/timeline`.
 */
import { SectionHeading } from "@/components/ui/page";
import { Timeline, TimelineHead, TimelineItem, TimelineNote } from "@/components/ui/timeline";
import { configSummary, type AssetHistoryEntry } from "../../services/haisService";

import { NOTE, historyTone } from "./assetTone";

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

export default function AssetHistory({
  history,
  heading = true,
}: {
  history?: AssetHistoryEntry[];
  /** Off when the dialog around it already names the section. */
  heading?: boolean;
}) {
  const entries = [...(history ?? [])].reverse();

  return (
    <div className="space-y-3">
      {heading ? <SectionHeading>History</SectionHeading> : null}
      {entries.length === 0 ? (
        <p className={NOTE}>No history recorded yet.</p>
      ) : (
        // `ml-1.5` so the dot sits inside the card, not on its edge.
        <Timeline className="ml-1.5">
          {entries.map((h, i) => {
            const metaLine = meta(h);
            return (
              <TimelineItem key={i} tone={historyTone(h.action)} last={i === entries.length - 1}>
                <TimelineHead>
                  {title(h)}
                  <time>{h.date || "—"}</time>
                </TimelineHead>
                {metaLine && <TimelineNote>{metaLine}</TimelineNote>}
                {h.reason && <TimelineNote className="text-body">{h.reason}</TimelineNote>}
                {h.config_change && <TimelineNote>Change: {h.config_change}</TimelineNote>}
                {h.config && configSummary(h.config) && (
                  <TimelineNote>Config: {configSummary(h.config)}</TimelineNote>
                )}
              </TimelineItem>
            );
          })}
        </Timeline>
      )}
    </div>
  );
}
