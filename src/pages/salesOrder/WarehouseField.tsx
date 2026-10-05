/**
 * The warehouse the whole order ships from.
 *
 * Every order picks one now, not only Mart. The options are the warehouses
 * HANA lists for the order's category, and the field starts on the default
 * the server reads from its environment — the same one the SAP push would
 * apply if the order carried none, so what is on screen is what ships.
 *
 * If the list has not arrived (or HANA is down) the current value is still
 * offered, so the form never shows a blank where a choice was made.
 */
import { Field, Select } from "@/components/ui/form";

import type { SalesOrderForm } from "./useSalesOrderForm";

export default function WarehouseField({ form }: { form: SalesOrderForm }) {
  const { formData, handleChange, warehouses } = form;
  const options =
    formData.warehouse && !warehouses.some((w) => w.code === formData.warehouse)
      ? [{ code: formData.warehouse, name: formData.warehouse }, ...warehouses]
      : warehouses;

  return (
    <Field label="Warehouse" hint="">
      {(control) => (
        <Select {...control} name="warehouse" value={formData.warehouse} onChange={handleChange}>
          {options.length === 0 ? <option value="">Loading warehouses…</option> : null}
          {options.map((warehouse) => (
            <option key={warehouse.code} value={warehouse.code}>
              {warehouse.name && warehouse.name !== warehouse.code
                ? `${warehouse.code} — ${warehouse.name}`
                : warehouse.code}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
