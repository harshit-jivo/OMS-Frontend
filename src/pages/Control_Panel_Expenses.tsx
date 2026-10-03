/** Control Panel — Expenses. Production C_Panel's `/expenses/`, embedded (see EmbeddedControlPanel). */
import { EmbeddedControlPanel } from "./controlPanel/EmbeddedControlPanel";

export default function Control_Panel_Expenses() {
  return (
    <EmbeddedControlPanel
      page="expenses"
      title="Expenses"
      description="Operating expenses by budget head, against budget."
    />
  );
}
