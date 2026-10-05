/** Control Panel — Targets. Production C_Panel's `/realise/targets/`, embedded (see EmbeddedControlPanel). */
import { EmbeddedControlPanel } from "./controlPanel/EmbeddedControlPanel";

export default function Control_Panel_Realise_Targets() {
  return (
    <EmbeddedControlPanel
      page="targets"
      title="Targets"
      description="Person mapping and the targets the sales pages measure against."
      // Its "Update Targets" button lives on Oils Sale — the way back.
      backTo={{ label: "Oils Sale", to: "/Control_Panel/Realise" }}
    />
  );
}
