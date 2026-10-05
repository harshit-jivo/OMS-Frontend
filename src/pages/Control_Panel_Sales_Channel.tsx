/**
 * Control Panel — Sales Channel. Production C_Panel's old-look sales
 * page (`/realise/sales-channel/`: channel cards GT / ROI / MT / E-Commerce …,
 * target vs done vs order-in-hand per state), embedded (see EmbeddedControlPanel).
 */
import { EmbeddedControlPanel } from "./controlPanel/EmbeddedControlPanel";

export default function Control_Panel_Sales_Channel() {
  return (
    <EmbeddedControlPanel
      page="sales-channel"
      title="Sales Channel"
      description="Sales by channel and state — target, done, order in hand and balance, from SAP."
    />
  );
}
