/**
 * The physical facts the artwork cannot supply.
 *
 * Everything the label checker knew until now came off the uploaded file. The
 * dimensional rules cannot: a die-line does not say whether the pack is a
 * bottle or a carton, which panel is the largest, how it was moulded, or how
 * big the veg mark measures on the finished print. So it is asked for here,
 * and the answers drive `legal/dimensions.py`.
 *
 * Optional, and visibly so
 * ------------------------
 * An untouched panel sends NOTHING (see `appendPackageForm`), and the backend
 * then skips the measurement rules with that reason on the report rather than
 * failing them. A reviewer who only wants the twenty-one AI checks keeps
 * exactly the workflow they had, which is the only way to add five rules to a
 * screen people already use without making it worse for them.
 *
 * Why the fields appear and disappear
 * -----------------------------------
 * A cylindrical pack has no "largest panel" and a rectangular one has no
 * circumference. Showing all of them at once and letting the backend ignore
 * the irrelevant ones would mean a form where most boxes are wrong to fill
 * in, and no way to tell which. So the shape chooses the questions.
 */
import {
  Checkbox,
  Field,
  FormGrid,
  Input,
  Select,
} from "@/components/ui/form";

/**
 * The form's values, as strings.
 *
 * Strings rather than numbers all the way to the request: an `<input
 * type="number">` is empty, mid-typed ("4.") or invalid as often as it holds
 * a number, and coercing early turns every one of those into `NaN` or a
 * silent 0. `metrology.PackageSpec.from_request` is built to take the strings
 * and decide — one place that knows what "not supplied" means, instead of two
 * that disagree.
 */
export type PackageForm = {
  package_shape: string;
  container_type: string;
  regulation: string;
  panel_height_mm: string;
  panel_width_mm: string;
  height_mm: string;
  circumference_mm: string;
  surface_area_cm2: string;
  capacity_cm3: string;
  veg_mark: string;
  veg_mark_shape: string;
  veg_mark_mm: string;
  fortified: boolean;
  fort_a_mm: string;
  fort_b_mm: string;
};

export const EMPTY_PACKAGE_FORM: PackageForm = {
  package_shape: "",
  container_type: "NORMAL",
  regulation: "FSSAI",
  panel_height_mm: "",
  panel_width_mm: "",
  height_mm: "",
  circumference_mm: "",
  surface_area_cm2: "",
  capacity_cm3: "",
  veg_mark: "NONE",
  veg_mark_shape: "CIRCLE",
  veg_mark_mm: "",
  fortified: false,
  fort_a_mm: "",
  fort_b_mm: "",
};

/**
 * Add the panel's answers to an upload, if there are any.
 *
 * Returns early on an unchosen shape so an untouched panel is indistinguishable
 * from the requests this endpoint received before it existed — which is what
 * makes the measurement rules opt-in rather than a new way to fail.
 */
export const appendPackageForm = (body: FormData, form: PackageForm): void => {
  if (!form.package_shape) return;
  Object.entries(form).forEach(([key, value]) => {
    if (typeof value === "boolean") {
      if (value) body.append(key, "true");
      return;
    }
    if (value.trim()) body.append(key, value.trim());
  });
};

/** True when the reviewer has engaged with the panel at all. */
export const isPackageFormActive = (form: PackageForm): boolean =>
  Boolean(form.package_shape);

type Props = {
  value: PackageForm;
  onChange: (next: PackageForm) => void;
  disabled?: boolean;
};

export default function PackageDimensions({ value, onChange, disabled }: Props) {
  const set = <K extends keyof PackageForm>(key: K, next: PackageForm[K]) =>
    onChange({ ...value, [key]: next });

  const shape = value.package_shape;

  return (
    <div className="space-y-4">
      <FormGrid>
        <Field
          label="Package shape"
          hint="Chooses how the Principal Display Panel is calculated. Leave unset to skip the dimensional checks."
        >
          {(control) => (
            <Select
              {...control}
              value={shape}
              disabled={disabled}
              onChange={(event) => set("package_shape", event.target.value)}
            >
              <option value="">Not specified — skip these checks</option>
              <option value="RECTANGULAR">Rectangular</option>
              <option value="CYLINDRICAL">
                Cylindrical, round or oval
              </option>
              <option value="OTHER">Any other shape</option>
              <option value="SMALL">10 cm³ or less</option>
            </Select>
          )}
        </Field>

        {shape && shape !== "SMALL" ? (
          <Field
            label="Container type"
            hint="Blown, formed, moulded and perforated containers take the larger minimum letter height."
          >
            {(control) => (
              <Select
                {...control}
                value={value.container_type}
                disabled={disabled}
                onChange={(event) => set("container_type", event.target.value)}
              >
                <option value="NORMAL">Normal</option>
                <option value="BLOWN">
                  Blown, formed, moulded or perforated
                </option>
              </Select>
            )}
          </Field>
        ) : null}

        {/* Rectangular: the largest panel. Left blank, the backend reads the
            artwork's own FOR INTERNAL USE block ("Size(cm): 2.6 x 8") and
            says on the report that it did. The PDF's PAGE size is not used
            and must not be — the page is a sheet, not a trim, and one of this
            project's own artworks is a full A4. */}
        {shape === "RECTANGULAR" ? (
          <>
            <Field
              label="Largest panel width (mm)"
              hint={'Leave blank to use the "Size" line in the artwork\'s FOR INTERNAL USE block.'}
            >
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={value.panel_width_mm}
                  disabled={disabled}
                  onChange={(event) =>
                    set("panel_width_mm", event.target.value)
                  }
                />
              )}
            </Field>
            <Field label="Largest panel height (mm)">
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={value.panel_height_mm}
                  disabled={disabled}
                  onChange={(event) =>
                    set("panel_height_mm", event.target.value)
                  }
                />
              )}
            </Field>
          </>
        ) : null}

        {shape === "CYLINDRICAL" ? (
          <>
            <Field label="Height (mm)">
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={value.height_mm}
                  disabled={disabled}
                  onChange={(event) => set("height_mm", event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Average circumference (mm)"
              hint="The panel is 40% of height × average circumference."
            >
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={value.circumference_mm}
                  disabled={disabled}
                  onChange={(event) =>
                    set("circumference_mm", event.target.value)
                  }
                />
              )}
            </Field>
          </>
        ) : null}

        {/* The one place the two extracts disagree, surfaced rather than
            decided: FSSAI says 20% of total surface area for an irregular
            pack and Legal Metrology says 40%. Which applies depends on the
            declaration being checked. */}
        {shape === "OTHER" ? (
          <>
            <Field label="Total surface area (cm²)">
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={value.surface_area_cm2}
                  disabled={disabled}
                  onChange={(event) =>
                    set("surface_area_cm2", event.target.value)
                  }
                />
              )}
            </Field>
            <Field
              label="Regulation to apply"
              hint="The two extracts differ for irregular packs: FSSAI takes 20% of total surface area, Legal Metrology 40%."
            >
              {(control) => (
                <Select
                  {...control}
                  value={value.regulation}
                  disabled={disabled}
                  onChange={(event) => set("regulation", event.target.value)}
                >
                  <option value="FSSAI">FSSAI — 20% of surface area</option>
                  <option value="LEGAL_METROLOGY">
                    Legal Metrology — 40% of surface area
                  </option>
                </Select>
              )}
            </Field>
          </>
        ) : null}

        {shape && shape !== "SMALL" ? (
          <Field
            label="Capacity (cm³)"
            hint="Optional. At 10 cm³ or less the panel may be a card or tape affixed to the pack."
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                value={value.capacity_cm3}
                disabled={disabled}
                onChange={(event) => set("capacity_cm3", event.target.value)}
              />
            )}
          </Field>
        ) : null}
      </FormGrid>

      {shape ? (
        <FormGrid>
          <Field
            label="Veg / non-veg mark"
            hint="The minimum size depends on the panel area."
          >
            {(control) => (
              <Select
                {...control}
                value={value.veg_mark}
                disabled={disabled}
                onChange={(event) => set("veg_mark", event.target.value)}
              >
                <option value="NONE">Not declared — skip this check</option>
                <option value="VEG">Vegetarian</option>
                <option value="NON_VEG">Non-vegetarian</option>
              </Select>
            )}
          </Field>

          {value.veg_mark !== "NONE" ? (
            <>
              <Field label="Mark shape">
                {(control) => (
                  <Select
                    {...control}
                    value={value.veg_mark_shape}
                    disabled={disabled}
                    onChange={(event) =>
                      set("veg_mark_shape", event.target.value)
                    }
                  >
                    <option value="CIRCLE">Circle — diameter</option>
                    <option value="TRIANGLE">Triangle — side</option>
                    <option value="SQUARE">Square — side</option>
                  </Select>
                )}
              </Field>
              <Field
                label="Measured size (mm)"
                hint="Diameter for a circle, side length for a triangle or square."
              >
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={value.veg_mark_mm}
                    disabled={disabled}
                    onChange={(event) => set("veg_mark_mm", event.target.value)}
                  />
                )}
              </Field>
            </>
          ) : null}
        </FormGrid>
      ) : null}

      {shape ? (
        <div className="space-y-4">
          <Checkbox
            label="This product is fortified"
            hint="Checks the fortification logo's dimensions and its specified colours."
            checked={value.fortified}
            disabled={disabled}
            onChange={(event) => set("fortified", event.target.checked)}
          />

          {value.fortified ? (
            <FormGrid>
              <Field
                label="Logo width A (mm)"
                hint="Prescribed sizes are 20, 40, 80, 160 and 320 mm."
              >
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={value.fort_a_mm}
                    disabled={disabled}
                    onChange={(event) => set("fort_a_mm", event.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Logo height B (mm)"
                hint="The prescribed artwork is square: B should equal A."
              >
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={value.fort_b_mm}
                    disabled={disabled}
                    onChange={(event) => set("fort_b_mm", event.target.value)}
                  />
                )}
              </Field>
            </FormGrid>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
