/** Control Panel — Salaries. Production C_Panel's `/salaries/`, embedded (see EmbeddedControlPanel). */
import { EmbeddedControlPanel } from "./controlPanel/EmbeddedControlPanel";

export default function Control_Panel_Salaries() {
  return (
    <EmbeddedControlPanel
      page="salaries"
      title="Salaries"
      description="Salary expenditure by account."
    />
  );
}
