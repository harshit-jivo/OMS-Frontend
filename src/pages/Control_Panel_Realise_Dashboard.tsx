/** Control Panel — Realise Dashboard. Production C_Panel's `/realise/realise-dashboard/`, embedded (see EmbeddedControlPanel). */
import { EmbeddedControlPanel } from "./controlPanel/EmbeddedControlPanel";

export default function Control_Panel_Realise_Dashboard() {
  return (
    <EmbeddedControlPanel
      page="realise-dashboard"
      title="Realise Dashboard"
      description="Product-level realisation against target, from SAP."
    />
  );
}
