/**
 * The one field both forms draw.
 *
 * A Mart order (company 3) also picks a dispatch warehouse. It is display-only
 * today — the value is not persisted — and it is the ONLY piece of markup the
 * wizard and the legacy form genuinely share, which is why the rest of the
 * split could be a clean cut rather than a shared-components layer.
 */
import { Field, Select } from "@/components/ui/form";

import type { SalesOrderForm } from "./useSalesOrderForm";

const WAREHOUSE_OPTIONS = ["DL-MP", "GP-FGM"];

export default function WarehouseField({ form }: { form: SalesOrderForm }) {
  const { formData, handleChange } = form;

  return (
    <Field label="Warehouse">
      {(control) => (
        <Select {...control} name="warehouse" value={formData.warehouse} onChange={handleChange}>
          {WAREHOUSE_OPTIONS.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
