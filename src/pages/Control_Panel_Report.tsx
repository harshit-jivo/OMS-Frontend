/**
 * Control Panel — one of C_Panel's report pages (Compare Sales, Claims,
 * Customer Aging, ...), embedded (see EmbeddedControlPanel). One component for
 * all twenty: the route says which report (config/controlPanelAccess.ts).
 */
import { useLocation } from "react-router-dom";

import { controlPanelReportAt } from "../config/controlPanelAccess";
import { EmbeddedControlPanel } from "./controlPanel/EmbeddedControlPanel";

export default function Control_Panel_Report() {
  const { pathname } = useLocation();
  const report = controlPanelReportAt(pathname);
  if (!report) return null;
  // Keyed by page: moving between two reports remounts the frame.
  return <EmbeddedControlPanel key={report.page} page={report.page} title={report.label} />;
}
