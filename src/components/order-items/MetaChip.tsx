import { memo, type ReactNode } from "react";
import type { VarietyTone } from "./helpers";

type MetaChipProps = {
  label: ReactNode;
  icon?: ReactNode;
  tone?: VarietyTone;
};

/** Small muted pill used for item metadata (variety, brand, type…). */
function MetaChip({ label, icon, tone = "default" }: MetaChipProps) {
  if (label == null || label === "") return null;

  return (
    <span className={`isec-chip isec-chip--${tone}`}>
      {icon ? (
        <span className="isec-chip__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="isec-chip__label">{label}</span>
    </span>
  );
}

export default memo(MetaChip);
