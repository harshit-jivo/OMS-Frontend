import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

export default function LogisticsTab({ state }: Props) {
  return (
    <div className="si-card si-logistics-tab">
      <div className="si-form-grid">
        <label>
          Ship To
          <input value={state.form.shipTo} onChange={(event) => state.updateForm({ shipTo: event.target.value })} />
        </label>
        <label>
          Pay To
          <input value={state.form.payTo} onChange={(event) => state.updateForm({ payTo: event.target.value })} />
        </label>
        <label>
          Shipping Type
          <select value={state.form.shippingType} onChange={(event) => state.updateForm({ shippingType: event.target.value })}>
            <option>Road</option>
            <option>Air</option>
            <option>Sea</option>
            <option>Rail</option>
          </select>
        </label>
        <label>
          E-Way Bill No.
          <input value={state.form.ewayBillNo} onChange={(event) => state.updateForm({ ewayBillNo: event.target.value })} />
        </label>
        <label>
          LR / GR Number
          <input value={state.form.lrGrNumber} onChange={(event) => state.updateForm({ lrGrNumber: event.target.value })} />
        </label>
        <label>
          Shipping Priority
          <select
            value={state.form.shippingPriority}
            onChange={(event) => state.updateForm({ shippingPriority: event.target.value })}
          >
            <option>Normal</option>
            <option>Express</option>
          </select>
        </label>
      </div>
    </div>
  );
}
