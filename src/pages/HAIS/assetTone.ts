/**
 * One answer to "what colour is this working status", for the four places
 * that draw it (register, lookup, details, public view). Each carried its own
 * `statusTone` before, and each mapped to `StatusBadge`'s private
 * ok/err/warn/muted vocabulary; this returns the design system's `BadgeTone`
 * directly so the badge and the history dot cannot disagree.
 */
import type { BadgeTone } from "@/components/ui/badge";

export function assetStatusTone(status?: string): BadgeTone {
  switch ((status || "").toLowerCase()) {
    case "working":
      return "ok";
    case "under repair":
      return "hold";
    case "not working":
    case "scrapped":
      return "bad";
    default:
      return "neutral";
  }
}

/** Tone of a history entry, by the kind of movement. */
export function historyTone(action?: string): BadgeTone {
  switch ((action || "").toLowerCase()) {
    case "assigned":
    case "reassigned":
    case "handover":
      return "info"; // handover
    case "config updated":
    case "sent for service":
    case "service":
      return "hold"; // maintenance
    case "scrapped":
    case "not working":
      return "bad"; // end of life
    default:
      return "neutral"; // returned to store, and anything else
  }
}

/** The small caption under a section title, and the muted note style. */
export const NOTE = "m-0 text-[12.5px] leading-snug text-subtle";
export const MONO = "font-mono text-[12px]";
