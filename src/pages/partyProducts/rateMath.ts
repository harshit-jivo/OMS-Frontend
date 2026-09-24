/**
 * The arithmetic of a rate revision, shared by every screen that offers one.
 *
 * `applyMode` mirrors `_revised_rate` in `users/views/bulk_assignments.py`:
 * the preview a user confirms is computed here, so the two must agree to the
 * last paisa or the dialog lies.
 */
/** `set` writes the figure; the other two move each party's OWN rate. */
export type RateMode = "set" | "percent" | "amount";

export const RATE_MODES: { value: RateMode; label: string }[] = [
  { value: "set", label: "Set rate" },
  { value: "percent", label: "Change by %" },
  { value: "amount", label: "Change by ₹" },
];

/**
 * What the typed figure means in each mode, and whether it is usable.
 *
 * A percentage or a rupee change may be negative — that is a price CUT, the
 * second most common revision there is. Only an absolute rate cannot be.
 */
export const parseValue = (raw: string, mode: RateMode) => {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false as const, value: NaN };
  const value = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(value)) return { ok: false as const, value: NaN };
  if (mode === "set" && value < 0) return { ok: false as const, value };
  return { ok: true as const, value };
};

/** The new rate a base rate lands on. Mirrors `_revised_rate` on the server. */
export const applyMode = (base: number, mode: RateMode, value: number) => {
  if (mode === "set") return value;
  if (mode === "percent") return base * (1 + value / 100);
  return base + value;
};
