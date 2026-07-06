import { memo, type ReactNode } from "react";

type MetricProps = {
  icon: ReactNode;
  label: string;
  value: ReactNode;
};

/** A single quantitative stat box (icon + uppercase label + bold value). */
function Metric({ icon, label, value }: MetricProps) {
  return (
    <div className="isec-metric">
      <span className="isec-metric__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="isec-metric__label">{label}</span>
      <span className="isec-metric__value">{value}</span>
    </div>
  );
}

export default memo(Metric);
