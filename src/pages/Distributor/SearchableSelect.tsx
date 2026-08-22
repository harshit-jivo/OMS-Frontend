import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A minimal searchable ("omni-search") dropdown — a text box that filters its
 * options as you type, with click + keyboard (↑ ↓ Enter Esc) selection. Built
 * in-house to avoid pulling in a select library for one field.
 */
export type Option = { value: string; label: string };

type Props = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Search…",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? "";

  // Filter by a case-insensitive substring match on the label.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close when clicking outside the widget.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setHighlight(0);
  };

  const choose = (opt: Option) => {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      openList();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) choose(filtered[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div className="distributor-combo" ref={wrapRef}>
      <input
        type="text"
        className="distributor-combo-input"
        value={open ? query : selectedLabel}
        placeholder={selectedLabel || placeholder}
        disabled={disabled}
        onFocus={openList}
        onClick={openList}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="distributor-combo-list">
          {filtered.length === 0 ? (
            <li className="distributor-combo-empty">No matches</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.value}
                className={
                  "distributor-combo-option" +
                  (i === highlight ? " is-highlighted" : "") +
                  (o.value === value ? " is-selected" : "")
                }
                onMouseEnter={() => setHighlight(i)}
                // onMouseDown (not onClick) so it fires before the input blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default SearchableSelect;
