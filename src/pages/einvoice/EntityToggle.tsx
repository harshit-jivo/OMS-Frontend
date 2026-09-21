import { Select } from "@/components/ui/form";
import { Tab, TabList } from "@/components/ui/tabs";
import { useNicEntities } from "./useNicEntity";

/**
 * Which NIC identity a screen is acting as.
 *
 * Two levels, because NIC has two:
 *
 *   entity (PAN)   Jivo Wellness AACCJ4223F · Jivo Mart AAFCJ4102J — separate
 *                  legal entities, separate NIC credentials entirely.
 *   GSTIN (state)  one per state within a PAN, EACH WITH ITS OWN API USER.
 *
 * Cancel, lookup and the GSTIN master all authenticate as a seller GSTIN, so
 * without this the screens silently used the default identity — Wellness, in
 * its default state — and could neither see nor act on anything else.
 *
 * `gstin` is optional: leave it on "Any" and the caller searches the entity's
 * GSTINs (lookup) or lets the stored record decide (cancel). Pin one when the
 * question is specifically about that state's credentials — the rejected-IRN
 * list and the token/health checks are per GSTIN, not per PAN.
 *
 * Deliberately separate from the Generate/Invoices company picker: that one
 * chooses which SAP database an invoice is read from, this one chooses whose
 * credentials talk to NIC. They usually agree, but they are not the same axis.
 */
export default function EntityToggle({
  value,
  onChange,
  gstin,
  onGstinChange,
  hint,
}: {
  value: string;
  onChange: (key: string) => void;
  /** Omit both `gstin` props to hide the state selector. */
  gstin?: string;
  onGstinChange?: (gstin: string) => void;
  hint?: string;
}) {
  const entities = useNicEntities();
  const selected = entities.find((e) => e.key === value);
  const showGstin = Boolean(onGstinChange) && (selected?.gstins.length ?? 0) > 1;

  // One identity and nothing to pin — a control that cannot move is noise.
  if (entities.length < 2 && !showGstin) return null;

  return (
    <div className="mb-3">
      {entities.length > 1 ? (
        <TabList label="Act as which NIC entity">
          {entities.map((e) => (
            <Tab
              key={e.key}
              selected={value === e.key}
              onClick={() => {
                onChange(e.key);
                onGstinChange?.("");   // a pinned state cannot survive a PAN change
              }}
            >
              {e.label}
            </Tab>
          ))}
        </TabList>
      ) : null}

      {showGstin ? (
        <div className="mt-2 flex items-center gap-2">
          <label className="text-[12px] text-subtle" htmlFor="nic-gstin">
            GSTIN
          </label>
          <Select
            id="nic-gstin"
            className="max-w-[260px] font-mono text-[12px]"
            value={gstin ?? ""}
            onChange={(e) => onGstinChange?.(e.target.value)}
          >
            <option value="">Any / all states</option>
            {selected?.gstins.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <p className="mt-1.5 text-[12px] leading-relaxed text-subtle">
        {hint ?? "NIC credentials used for this request."}
        {selected ? (
          <>
            {" "}PAN <code className="font-mono">{selected.pan}</code>
            {selected.gstins.length
              ? ` · ${selected.gstins.length} GSTIN${selected.gstins.length > 1 ? "s" : ""}, each with its own API user`
              : null}
          </>
        ) : null}
      </p>
    </div>
  );
}
