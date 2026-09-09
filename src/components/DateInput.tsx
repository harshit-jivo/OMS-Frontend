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
import { HiOutlineCalendarDays } from "react-icons/hi2";

import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Extra classes on the text input. The control chrome comes from `Input`. */
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
  className,
  withPicker = false,
  disabled = false,
}: DateInputProps) {
  const nativeRef = useRef<HTMLInputElement>(null);

  const textInput = (
    /*
     * `Input`, not a bare `<input className="nic-input">`.
     *
     * `nic-input` is defined in `styles/Einvoice.css`, which only three pages
     * ever imported — so this control was correctly styled on the e-invoice
     * screens and UNSTYLED (raw UA border, UA font) on `Staff` and
     * `StateWise_Report`, which use it and do not load that sheet. Taking the
     * chrome from the shared primitive is what makes it look the same
     * everywhere, including on the pages that have not been converted yet.
     */
    <Input
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

  /*
   * `nic-date-wrap`, `nic-date-btn` and `nic-date-native` were defined in NO
   * stylesheet in the repository. So the calendar button rendered as a bare UA
   * button, and — the visible half of the bug — the "hidden" native date input
   * was never hidden at all: every `withPicker` field on the HAIS asset form
   * showed a second, empty dd/mm/yyyy control beside the real one.
   *
   * The native input still has to be in the layout tree (not `display: none`)
   * for `showPicker()` to work in Chrome, hence `size-0 opacity-0` with
   * `absolute` rather than a `hidden` attribute.
   */
  return (
    <div className={cn("relative flex items-center", className)}>
      {textInput}
      <button
        type="button"
        // The form-control reset — Preflight is not imported. See `ui/button`.
        className="absolute right-1 appearance-none rounded-sm border-0 bg-transparent p-1.5 text-subtle [font-family:inherit] cursor-pointer hover:text-brand focus-visible:outline-none focus-visible:shadow-focus"
        onClick={openPicker}
        aria-label="Open calendar"
        title="Open calendar"
      >
        <HiOutlineCalendarDays aria-hidden="true" className="size-4" />
      </button>
      <input
        ref={nativeRef}
        type="date"
        className="pointer-events-none absolute bottom-0 right-2 size-0 opacity-0"
        value={toIso(value)}
        onChange={(e) => onChange(fromIso(e.target.value))}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
