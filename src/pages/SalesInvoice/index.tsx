import DraftStep from "./DraftStep";
import LinesStep from "./LinesStep";
import OrdersStep from "./OrdersStep";
import PartyStep from "./PartyStep";
import { useSalesInvoice } from "./useSalesInvoice";
import "../../styles/Sales_Invoice.css";

const steps = [
  { id: 1, label: "Party" },
  { id: 2, label: "Orders" },
  { id: 3, label: "Lines" },
  { id: 4, label: "Draft" },
] as const;

export default function SalesInvoiceWizard() {
  const state = useSalesInvoice();

  const canOpenStep = (stepId: 1 | 2 | 3 | 4) => {
    if (stepId === 1) return true;
    if (stepId === 2) return Boolean(state.selectedParty);
    if (stepId === 3) return state.selectedLineList.length > 0;
    return Boolean(state.customerDetails) || state.step === 4;
  };

  return (
    <div className="si-page">
      <header className="si-page-head">
        <div>
          <span className="si-eyebrow">SAP Billing</span>
          <h1>Sales Invoice</h1>
          <p>Create A/R invoice drafts from open SAP sales orders.</p>
        </div>
        {/* {state.selectedParty && state.step > 1 && (
          <div className="si-selected-party">
            <strong>{state.selectedParty.CardName} · {state.selectedParty.CardCode}</strong>
            <button type="button" onClick={state.changeParty}>Change party</button>
          </div>
        )} */}
      </header>

      <nav className="si-stepper" aria-label="Sales invoice steps">
        {steps.map((item) => {
          const stepId = item.id;
          const isActive = state.step === stepId;
          const isComplete = state.step > stepId;
          const available = canOpenStep(stepId);

          return (
            <button
              className={`${isActive ? "is-active" : ""} ${isComplete ? "is-complete" : ""}`}
              key={stepId}
              type="button"
              disabled={!available || (!isComplete && !isActive)}
              onClick={() => available && state.setStep(stepId)}
            >
              <span>{stepId}</span>
              <strong>{item.label}</strong>
            </button>
          );
        })}
      </nav>

      {state.step === 1 && <PartyStep state={state} />}
      {state.step === 2 && <OrdersStep state={state} />}
      {state.step === 3 && <LinesStep state={state} />}
      {state.step === 4 && <DraftStep state={state} />}
    </div>
  );
}
