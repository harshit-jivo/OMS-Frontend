/**
 * controlPanelService — the link that opens a Control Panel page.
 *
 * The Control Panel pages are C_Panel's production pages, part of the OMS
 * backend (`OMS-Backend/cpanel/`): server-rendered there, with their own
 * scripts calling their own APIs on a cookie session. This app holds a JWT,
 * not that session, so it asks for a single-use ticket link
 * (`OMS-Backend/control_panel/sso.py`) and opens it in the page frame
 * (pages/controlPanel/EmbeddedControlPanel.tsx), which signs the same user in.
 *
 * A link is good for 60 seconds and one use, so it is requested every time a
 * page opens or reloads — never cached, never stored.
 */
import api from "./api";
import { messageFrom } from "../lib/apiError";
import type { ControlPanelReport } from "../config/controlPanelAccess";

/** The page ids the backend knows (`control_panel/permissions.py` PAGES). */
export type ControlPanelPageId =
  | "oils-sale"
  | "sales-channel"
  | "beverages-sale"
  | "realise-dashboard"
  | "targets"
  | "sales"
  | "inventory"
  | "expenses"
  | "salaries"
  | ControlPanelReport["page"];

export interface SsoLink {
  /** Absolute URL of the page's ticket link on the OMS backend. */
  url: string;
}

export async function getSsoLink(page: ControlPanelPageId): Promise<SsoLink> {
  const res = await api.post("/control-panel/sso/", { page });
  const { path } = (res.data?.data ?? res.data) as { path: string };
  // Always the APP's own origin: nginx (production) and the Vite dev proxy
  // (vite.config.ts) send these paths to the backend. Same origin is what lets
  // the frame keep its session cookie.
  return { url: `${window.location.origin}${path}` };
}

/** A sentence for a failed link: no access (403), or anything else. */
export function controlPanelError(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    return "You do not have access to this Control Panel page. Ask an administrator for the permission.";
  }
  return messageFrom(err, "Could not open the Control Panel.");
}
