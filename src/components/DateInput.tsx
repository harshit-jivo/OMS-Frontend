/**
 * Text input that auto-formats a date as dd/mm/yyyy while typing — the user
 * types digits only and the slashes appear automatically. Backspace works
 * naturally (a trailing slash is dropped as digits fall below the threshold).
 *
 * `value`/`onChange` speak the formatted string (e.g. "02/07/2026").
 */
type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function formatDdMmYyyy(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 8); // dd mm yyyy = 8 digits
  if (d.length >= 5) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length >= 3) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

export default function DateInput({ value, onChange, placeholder = "dd/mm/yyyy", className = "nic-input" }: DateInputProps) {
  return (
    <input
      className={className}
      value={value}
      inputMode="numeric"
      maxLength={10}
      placeholder={placeholder}
      onChange={(e) => onChange(formatDdMmYyyy(e.target.value))}
    />
  );
}
