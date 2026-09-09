/**
 * The logistics half of the invoice header — where it ships and how.
 */
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/page";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

export default function LogisticsTab({ state }: Props) {
  return (
    <Card>
      <FormGrid>
        <Field label="Ship to">
          {(control) => (
            <Input
              {...control}
              value={state.form.shipTo}
              onChange={(event) => state.updateForm({ shipTo: event.target.value })}
            />
          )}
        </Field>

        <Field label="Pay to">
          {(control) => (
            <Input
              {...control}
              value={state.form.payTo}
              onChange={(event) => state.updateForm({ payTo: event.target.value })}
            />
          )}
        </Field>

        <Field label="Shipping type">
          {(control) => (
            <Select
              {...control}
              value={state.form.shippingType}
              onChange={(event) => state.updateForm({ shippingType: event.target.value })}
            >
              <option>Road</option>
              <option>Air</option>
              <option>Sea</option>
              <option>Rail</option>
            </Select>
          )}
        </Field>

        <Field label="E-Way Bill no.">
          {(control) => (
            <Input
              {...control}
              value={state.form.ewayBillNo}
              onChange={(event) => state.updateForm({ ewayBillNo: event.target.value })}
            />
          )}
        </Field>

        <Field label="LR / GR number">
          {(control) => (
            <Input
              {...control}
              value={state.form.lrGrNumber}
              onChange={(event) => state.updateForm({ lrGrNumber: event.target.value })}
            />
          )}
        </Field>

        <Field label="Shipping priority">
          {(control) => (
            <Select
              {...control}
              value={state.form.shippingPriority}
              onChange={(event) => state.updateForm({ shippingPriority: event.target.value })}
            >
              <option>Normal</option>
              <option>Express</option>
            </Select>
          )}
        </Field>
      </FormGrid>
    </Card>
  );
}
