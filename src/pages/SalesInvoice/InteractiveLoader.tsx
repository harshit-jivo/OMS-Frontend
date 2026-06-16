import { useEffect, useState } from "react";
import { HiCheckCircle, HiCube, HiShoppingCart, HiTruck, HiHome } from "react-icons/hi2";
import "../../styles/InteractiveLoader.css";

const STEPS = [
  { label: "Collecting inventory", icon: HiCube },
  { label: "Adding them to cart", icon: HiShoppingCart },
  { label: "Docking on the station", icon: HiHome },
  { label: "Loading dispatch", icon: HiTruck },
];

export default function InteractiveLoader() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < STEPS.length - 1) return prev + 1;
        return prev;
      });
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="si-modal-backdrop si-loader-backdrop" role="presentation">
      <section className="si-loader-modal" role="alert" aria-busy="true">
        <div className="si-loader-animation">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            let statusClass = "is-pending";
            if (index < currentStep) statusClass = "is-complete";
            else if (index === currentStep) statusClass = "is-active";

            return (
              <div key={step.label} className={`si-loader-step ${statusClass}`}>
                <span className="si-loader-step-icon">
                  {index < currentStep ? <HiCheckCircle /> : <Icon />}
                </span>
                <span className="si-loader-step-label">{step.label}</span>
              </div>
            );
          })}
        </div>
        <div className="si-loader-footer">
          <div className="si-loader-progress-bar">
            <div 
              className="si-loader-progress-fill" 
              style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }} 
            />
          </div>
          <p className="si-loader-message">Processing your draft...</p>
        </div>
      </section>
    </div>
  );
}
