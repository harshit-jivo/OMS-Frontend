/** Control Panel — Inventory. Production C_Panel's `/inventory/`, embedded (see EmbeddedControlPanel). */
import { EmbeddedControlPanel } from "./controlPanel/EmbeddedControlPanel";
import { INVENTORY_TABS } from "./controlPanel/tabs";

export default function Control_Panel_Inventory() {
  return (
    <EmbeddedControlPanel
      tabs={INVENTORY_TABS}
      page="inventory"
      title="Inventory"
      description="Stock, movement, ageing and traceability for Oils and Beverages."
    />
  );
}
