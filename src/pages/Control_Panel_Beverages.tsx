/** Control Panel — Beverages Sale. Production C_Panel's `/realise/beverages/`, embedded (see EmbeddedControlPanel). */
import { EmbeddedControlPanel } from "./controlPanel/EmbeddedControlPanel";

export default function Control_Panel_Beverages() {
  return (
    <EmbeddedControlPanel
      page="beverages-sale"
      title="Beverages Sale"
      description="Beverages sales by channel and state — target, done, open orders and balance, from SAP."
    />
  );
}
