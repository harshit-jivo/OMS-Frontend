/**
 * A dropdown you can also TYPE into — "pick one of these, or say what it is".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * Payment Against, Advance Against and Return Method each ended in an "Other"
 * option, and "Other" on its own says nothing: an approver reading a request
 * against "Other" has to go and find out what. So "Other" is no longer a
 * choice at all. The listed answers are offered as before; anything else is
 * simply typed into the same box, and that text IS the answer.
 *
 * Underneath, a typed answer is stored as the field's "other" value (OTHER /
 * CUSTOM) plus the text — so the rules, which branch on that value, are
 * unchanged, and the text travels with it.
 *
 * How a typed entry is read, when the box is left or Enter is pressed:
 *   * it matches a listed answer (any case)  → that answer;
 *   * it is anything else                     → "other", with that text;
 *   * it is empty                             → nothing chosen.
 *
 * Styled to match `ui/dropdown` — same trigger, same panel — so it reads as
 * one of the app's pickers rather than a new kind of control. It lives with
 * this module rather than in `ui/` until a second screen needs it.
 */
import * as React from "react";
import { HiOutlineChevronDown } from "react-icons/hi2";

import { cn } from "@/lib/utils";

export interface ChoiceOrTextProps<T extends string> {
  id?: string;
  /** The listed answers — NOT including the "other" one. */
  options: ReadonlyArray<{ value: T; label: string }>;
  /** The value a typed answer is stored under (`"OTHER"`, `"CUSTOM"`). */
  otherValue: T;
  value: T | "";
  /** The typed answer, when `value` is `otherValue`. */
  text: string;
  onChange: (value: T | "", text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  required?: boolean;
}

export function ChoiceOrText<T extends string>({
  id,
  options,
  otherValue,
  value,
  text,
  onChange,
  placeholder = "Select or type your own",
  disabled = false,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  required,
}: ChoiceOrTextProps<T>) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();
  const [open, setOpen] = React.useState(false);
  // What is in the box while it is being edited; null when showing the answer.
  const [draft, setDraft] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(-1);

  const shown =
    value === otherValue ? text : (options.find((option) => option.value === value)?.label ?? "");
  const query = draft ?? shown;
  const term = draft !== null ? draft.trim().toLowerCase() : "";

  // While editing, narrow the list to what is typed; otherwise show it all.
  const matches = term
    ? options.filter((option) => option.label.toLowerCase().includes(term))
    : options;
  const exact = options.find((option) => option.label.toLowerCase() === term);
  const offerTyped = term !== "" && !exact;

  type Item = { key: string; label: React.ReactNode; pick: () => void };
  const items: Item[] = [
    ...matches.map((option) => ({
      key: option.value,
      label: option.label,
      pick: () => finish(option.value, ""),
    })),
    ...(offerTyped
      ? [
          {
            key: "__typed",
            // One plain string: an inner <span> for the bold part split the
            // accessible name into "Use “ Rent ”" for assistive tech.
            label: <span className="font-medium text-ink">{`Use “${draft!.trim()}”`}</span>,
            pick: () => finish(otherValue, draft!.trim()),
          },
        ]
      : []),
  ];

  function finish(next: T | "", nextText: string) {
    onChange(next, nextText);
    setDraft(null);
    setOpen(false);
    setActive(-1);
  }

  /** Read whatever is in the box, by the rules in the header. */
  function commit(raw: string) {
    const typed = raw.trim();
    if (typed === "") return finish("", "");
    const match = options.find((option) => option.label.toLowerCase() === typed.toLowerCase());
    if (match) return finish(match.value, "");
    return finish(otherValue, typed);
  }

  // Leaving the control commits what was typed; an unedited box just closes.
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (rootRef.current?.contains(event.relatedTarget as Node | null)) return;
    if (draft !== null) commit(draft);
    else setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (items.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + items.length) % items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open && active >= 0 && items[active]) items[active].pick();
      else commit(query);
    } else if (event.key === "Escape") {
      if (!open && draft === null) return;
      event.preventDefault();
      setDraft(null);
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0" onBlur={onBlur}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-required={required}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setDraft(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          // The same chrome as `ui/form`'s controls and `ui/dropdown`'s trigger.
          "h-control w-full min-w-0 rounded-sm border border-line bg-surface pl-3 pr-9",
          "[font-family:inherit] text-[13px] text-ink placeholder:text-subtle",
          "transition-colors hover:border-line-strong",
          "focus-visible:border-brand focus-visible:bg-card focus-visible:shadow-focus focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-subtle",
          "aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft/40",
          open && "border-brand bg-card",
        )}
      />
      <HiOutlineChevronDown
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle transition-transform",
          open && "rotate-180",
        )}
      />

      {open && !disabled ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-full min-w-full overflow-hidden rounded-card border border-line bg-card shadow-panel">
          <div id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {items.length === 0 ? (
              <p className="m-0 px-2.5 py-3 text-center text-[12px] text-subtle">No matches</p>
            ) : (
              items.map((item, index) => {
                const selected =
                  item.key === "__typed" ? false : item.key === value && value !== otherValue;
                return (
                  <button
                    key={item.key}
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    // Keep focus in the box, so clicking an option is not read
                    // as leaving the control and committing the draft first.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={item.pick}
                    className={cn(
                      "flex w-full appearance-none items-center rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] [font-family:inherit] cursor-pointer hover:bg-surface",
                      selected ? "bg-brand-soft font-semibold text-brand" : "text-body",
                      index === active && "bg-surface",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })
            )}
          </div>
          <p className="m-0 border-t border-line px-2.5 py-1.5 text-[11px] text-subtle">
            Not listed? Type it, then press Enter.
          </p>
        </div>
      ) : null}
    </div>
  );
}
