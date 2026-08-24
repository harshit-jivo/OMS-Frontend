/**
 * Text input that auto-formats a date as dd/mm/yyyy while typing — the user
 * types digits only and the slashes appear automatically. Backspace works
 * naturally (a trailing slash is dropped as digits fall below the threshold).
 *
 * `value`/`onChange` speak the formatted string (e.g. "02/07/2026").
 *
 * Pass `withPicker` to add a calendar button that opens the native date picker;
 * default off, so every existing usage renders exactly as before.
 */
import { useRef } from "react";
import { HiCalendarDays } from "react-icons/hi2";

type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  withPicker?: boolean;
  disabled?: boolean;
};

function formatDdMmYyyy(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 8); // dd mm yyyy = 8 digits
  if (d.length >= 5) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length >= 3) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

/** dd/mm/yyyy -> yyyy-mm-dd (native date input format); "" if incomplete. */
function toIso(ddmmyyyy: string): string {
  const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** yyyy-mm-dd -> dd/mm/yyyy; "" if invalid. */
function fromIso(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export default function DateInput({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  className = "nic-input",
  withPicker = false,
  disabled = false,
}: DateInputProps) {
  const nativeRef = useRef<HTMLInputElement>(null);

  const textInput = (
    <input
      className={className}
      value={value}
      inputMode="numeric"
      maxLength={10}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(formatDdMmYyyy(e.target.value))}
    />
  );

  // No calendar button when disabled (and plain input when the picker is off).
  if (!withPicker || disabled) return textInput;

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    // showPicker() is the modern API; fall back to focus+click for older engines.
    if (typeof el.showPicker === "function") el.showPicker();
    else el.click();
  };

  return (
    <div className="nic-date-wrap">
      {textInput}
      <button
        type="button"
        className="nic-date-btn"
        onClick={openPicker}
        aria-label="Open calendar"
        title="Open calendar"
      >
        <HiCalendarDays />
      </button>
      {/* Native date input drives the calendar; kept visually hidden but present
          in the DOM (not display:none) so showPicker() works. */}
      <input
        ref={nativeRef}
        type="date"
        className="nic-date-native"
        value={toIso(value)}
        onChange={(e) => onChange(fromIso(e.target.value))}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
