/**
 * Searchable product picker.
 *
 * Schemes are set up by people who know products by name, not by FG code, so
 * every item field on this page is one of these. The stored value is still the
 * item_code — that is what the engine matches on — but it is never typed.
 *
 * Split out of `Scheme_Manager.tsx` (Phase 4) verbatim, plus a hygiene fix:
 * the trigger button now advertises itself as a listbox-style popup button
 * (`aria-haspopup` / `aria-expanded`) the way the accordion rows and stepper
 * already did, and the dropdown's scrollable option list carries `role="listbox"`
 * / `role="option"` so its existing selected/hover styling reads as one to
 * assistive tech, not a plain unordered pile of buttons.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { CatalogueItem } from "../types";

export default function ItemPicker({
  value,
  products,
  onChange,
  placeholder = "search item...",
  allowClear = false,
  clearLabel = "— none —",
}: {
  value: string;
  products: CatalogueItem[];
  onChange: (itemCode: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const selected = products.find((p) => p.item_code === value);
  const label = value ? selected?.item_name || value : allowClear ? clearLabel : placeholder;

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    // Capped: the catalogue runs to thousands of rows and rendering them all
    // makes the dropdown unusable. Typing narrows it.
    if (!term) return products.slice(0, 80);
    return products
      .filter(
        (p) =>
          p.item_name?.toLowerCase().includes(term) ||
          p.item_code?.toLowerCase().includes(term),
      )
      .slice(0, 80);
  }, [products, search]);

  return (
    <div ref={boxRef} className="sch-picker">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`sch-picker-trigger${value ? "" : " is-empty"}`}
        title={selected ? `${selected.item_name} (${selected.item_code})` : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}
      </button>

      {open && (
        <div className="sch-picker-menu">
          <div className="sch-picker-search">
            <input
              ref={searchRef}
              className="sch-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
            />
          </div>
          <div className="sch-picker-scroll" role="listbox">
            {allowClear && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setSearch("");
                }}
                className={`sch-picker-opt is-clear${!value ? " is-selected" : ""}`}
                role="option"
                aria-selected={!value}
              >
                {clearLabel}
              </button>
            )}
            {results.length === 0 ? (
              <div className="sch-picker-empty">No item matches “{search}”.</div>
            ) : (
              results.map((product) => (
                <button
                  type="button"
                  key={`${product.item_code}-${product.category ?? ""}`}
                  onClick={() => {
                    onChange(product.item_code);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`sch-picker-opt${product.item_code === value ? " is-selected" : ""}`}
                  role="option"
                  aria-selected={product.item_code === value}
                >
                  {product.item_name}
                  <span className="muted">
                    {"  "}
                    {product.item_code}
                    {product.category ? ` · ${product.category}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
