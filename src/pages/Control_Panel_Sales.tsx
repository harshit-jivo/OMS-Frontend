/** Control Panel — Sales. Production C_Panel's `/sales/`, embedded (see EmbeddedControlPanel). */
import { EmbeddedControlPanel } from "./controlPanel/EmbeddedControlPanel";

export default function Control_Panel_Sales() {
  return (
    <EmbeddedControlPanel
      page="sales"
      title="Sales"
      description="Sales volume and revenue by product, from SAP."
    />
  );
}
