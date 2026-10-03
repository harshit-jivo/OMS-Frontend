/** Control Panel — Oils Sale. Production C_Panel's `/realise/`, embedded (see EmbeddedControlPanel). */
import { EmbeddedControlPanel } from "./controlPanel/EmbeddedControlPanel";
import { OILS_SALE_TABS } from "./controlPanel/tabs";

export default function Control_Panel_Realise() {
  return (
    <EmbeddedControlPanel
      tabs={OILS_SALE_TABS}
      page="oils-sale"
      title="Oils Sale"
      description="Oils sales by channel and state — target, done, open orders and balance, from SAP."
    />
  );
}
