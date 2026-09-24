/**
 * Dropdown pickers — the two the native `<select>` cannot be.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THESE REPLACE
 * ─────────────────────────────────────────────────────────────────────────
 * The manager reports hand-rolled both of these, three times each:
 *
 *   * `.dr-dropdown`      a trigger over a list of checkboxes — Main Group;
 *   * `.sl-party-dropdown` a trigger over a search box and a list — User,
 *                          Party, Variety;
 *   * `.invt-whs-picker`   the checkbox one again, on Inventory Report.
 *
 * Every copy carried its own `useRef` + `document.addEventListener("mousedown")`
 * for the outside click, none handled Escape, one was a `div role="button"`
 * with a keydown handler standing in for a button, and the trigger's chevron
 * was an inline `<svg>` with a hardcoded `#64748b`.
 *
 * A native `<select>` covers the plain single choice (Category, FOC, Status)
 * and `ui/filter-bar` already wraps it. These two exist for the cases it
 * cannot do: choosing SEVERAL, and choosing one from a list long enough to
 * need typing into.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SEMANTICS
 * ─────────────────────────────────────────────────────────────────────────
 * `MultiSelect` is a `group` of real checkboxes: label click toggles, Space
 * toggles, screen readers count them. `SearchSelect` is a `listbox` of
 * `option`s with `aria-selected`, reached from a `combobox`-flavoured trigger.
 * Both close on Escape (returning focus to the trigger) and on an outside
 * pointer-down. Both are uncontrolled about being OPEN and controlled about
 * their VALUE — the page never has to hold an `isOpen`, which was the state
 * every copy was leaking into its component alongside three refs.
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { HiOutlineChevronDown, HiOutlineMagnifyingGlass } from "react-icons/hi2";

import { cn } from "@/lib/utils";
import { rankOptions } from "@/lib/optionSearch";
import { useAnchoredPanel } from "./anchoredPanel";

/* ── Shared plumbing ─────────────────────────────────────────────────────── */

type Size = "xs" | "md";

/**
 * The trigger, sized like the control beside it. Mirrors `ui/form` Select.
 *
 * It takes NO `className`. A call site's width belongs on the ROOT — see
 * `rootClass` — because the panel is positioned and sized against the root,
 * not against the trigger.
 */
function triggerClass(size: Size, open: boolean) {
  return cn(
    "appearance-none [font-family:inherit] cursor-pointer text-left",
    "flex w-full min-w-0 items-center justify-between gap-2 rounded-sm border",
    "border-line bg-surface text-ink transition-colors hover:border-line-strong",
    "focus-visible:outline-none focus-visible:border-brand focus-visible:bg-card focus-visible:shadow-focus",
    "disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-subtle",
    size === "xs" ? "h-control-xs px-2.5 text-[12.5px]" : "h-control px-3 text-[13px]",
    open && "border-brand bg-card",
  );
}

/**
 * The positioned wrapper — and where a call site's `className` goes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE WIDTH LIVES HERE AND NOT ON THE TRIGGER
 * ─────────────────────────────────────────────────────────────────────────
 * `className` used to be merged into `triggerClass`. The trigger is
 * `w-full` inside this div, so a `max-w-[420px]` there shrank the BUTTON and
 * left this div at its parent's full width — and the panel below is
 * `absolute` with `min-w-full`, which resolves against its containing block,
 * i.e. THIS div. So a 420px trigger opened a panel as wide as the card, left-
 * aligned to the card rather than to the control it belongs to.
 *
 * Putting the width on the root fixes both ends at once: the trigger is
 * `w-full` of it, and the panel is `min-w-full` of it, so the two can no
 * longer disagree.
 */
function rootClass(className?: string) {
  return cn("relative min-w-0", className);
}

/**
 * The panel's own look. Quieter than it was: a hairline instead of a full
 * border, a smaller radius, and no internal dividers — the rows are separated
 * by space, not by rules. The old panel wore the same `rounded-card` and solid
 * `border-line` as a Card, so a list of four options read as a second card
 * landing on the page rather than as a menu belonging to the control.
 *
 * Position, width and height come from `useAnchoredPanel` as inline styles.
 */
const panelClass =
  // `tw-page` for the same reason `DialogContent` carries it: this panel is
  // portalled OUT of the page, and `index.css`'s unlayered
  // `input, select, button { font: inherit }` then reaches its search box and
  // renders it at the 18px root size. Measured at exactly that in a browser
  // before this was added — the panel's geometry was always right, the type
  // inside it was not, which is what made it look broken.
  "tw-page z-[1100] overflow-hidden rounded-md border border-line/60 bg-card shadow-lg ring-1 ring-black/[0.03]";

/**
 * Open/close, with the two ways out. One hook for both pickers, so they
 * cannot disagree about what "outside" means.
 *
 * `panelRef` is not optional decoration: the panel is portalled out of the
 * root now, so `root.contains(target)` is false for a click on an option and
 * the picker would close before the click registered.
 */
function useOpenState(
  rootRef: React.RefObject<HTMLDivElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const inside = (target: Node) =>
      Boolean(rootRef.current?.contains(target) || panelRef.current?.contains(target));

    const onPointerDown = (event: MouseEvent) => {
      if (!inside(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // CAPTURE phase, stopped here: an open picker inside a dialog used to
      // close the DIALOG on Escape, losing whatever was half-filled in behind
      // it. Escape now dismisses one layer — the innermost — as it should.
      event.stopPropagation();
      setOpen(false);
      // Back to the trigger, so the keyboard user is not dropped at the body.
      rootRef.current?.querySelector<HTMLElement>("[data-dropdown-trigger]")?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, rootRef, panelRef]);

  return [open, setOpen] as const;
}

/* ── MultiSelect ─────────────────────────────────────────────────────────── */

export interface MultiSelectOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  /** A figure beside the label — a warehouse's stock, say. */
  meta?: React.ReactNode;
  /**
   * A second, quieter detail under the label — a user's username, a party's
   * card code. Also matched when `searchable` is on, which is the point: a
   * party is looked up by code at least as often as by name.
   *
   * A string rather than a node, because it has to be searchable.
   */
  hint?: string;
  /** Matched when searching, but never rendered. A role, a state, a category. */
  keywords?: string;
}

export function MultiSelect<T extends string | number>({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  selectAll = true,
  searchable = false,
  searchPlaceholder = "Search…",
  emptyText = "Nothing to choose",
  maxShown,
  disabled = false,
  size = "md",
  className,
}: {
  id?: string;
  value: T[];
  onChange: (next: T[]) => void;
  options: ReadonlyArray<MultiSelectOption<T>>;
  placeholder?: string;
  /** Offer a "Select all" row above the options. */
  selectAll?: boolean;
  /**
   * Put a search box above the list, focused on open.
   *
   * For the lists long enough to need typing into — every user in the company,
   * every party in SAP. Both of those were hand-rolled pickers before, each
   * with its own ref and `document.addEventListener("mousedown")`.
   */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Rows rendered at once — see `SearchSelect`'s. Omit for lists that fit. */
  maxShown?: number;
  disabled?: boolean;
  size?: Size;
  className?: string;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = useOpenState(rootRef, panelRef);
  const { host, style } = useAnchoredPanel(rootRef, open);
  const [query, setQuery] = React.useState("");

  // Same rule as SearchSelect: if there is a search box, it takes focus as the
  // panel opens, and the term is dropped when the panel closes.
  React.useEffect(() => {
    if (!searchable) return;
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open, searchable]);

  const term = searchable ? query.trim().toLowerCase() : "";
  // Every token, anywhere across the fields, best match first — see
  // `lib/optionSearch`. This was one contiguous `includes` against a single
  // field, so "canola 1" could not find "JIVO CANOLA OIL 1 LTR".
  const matched = rankOptions(options, term, (option) => [
    typeof option.label === "string" ? option.label : "",
    option.hint,
    option.keywords,
  ]);
  const shown = maxShown !== undefined ? matched.slice(0, maxShown) : matched;
  const hidden = matched.length - shown.length;

  /*
   * "Select all" applies to what the search has NARROWED TO, not to every
   * option — and the label says which, because the difference is the whole
   * point. Filtering to one party and pressing a control that silently
   * selected all four thousand would be the worst button in the app.
   */
  const allMatchedChosen =
    matched.length > 0 && matched.every((option) => value.includes(option.value));
  const toggleAllMatched = () => {
    const matchedValues = matched.map((option) => option.value);
    onChange(
      allMatchedChosen
        ? value.filter((v) => !matchedValues.includes(v))
        : [...value, ...matchedValues.filter((v) => !value.includes(v))],
    );
  };

  const allChosen = options.length > 0 && value.length === options.length;
  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? options.find((option) => option.value === value[0])?.label ?? "1 selected"
        : allChosen
          ? `All (${value.length})`
          : `${value.length} selected`;

  const toggle = (option: T) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);

  return (
    <div ref={rootRef} data-dropdown-root className={rootClass(className)}>
      <button
        id={id}
        type="button"
        data-dropdown-trigger
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={triggerClass(size, open)}
      >
        <span className={cn("truncate", value.length === 0 && "text-subtle")}>{summary}</span>
        <HiOutlineChevronDown
          aria-hidden="true"
          className={cn("size-3.5 shrink-0 text-subtle transition-transform", open && "rotate-180")}
        />
      </button>

      {open && host
        ? ReactDOM.createPortal(
            <div
              ref={panelRef}
              data-slot="dropdown-panel"
              className={cn(panelClass, "flex flex-col")}
              style={style}
            >
              {searchable ? (
                <div className="relative shrink-0 p-1.5">
                  <HiOutlineMagnifyingGlass
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
                  />
                  {/* Borderless on a tinted ground: one box inside another box
                      was most of what made this panel look heavy. */}
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    className="h-control-xs w-full rounded-sm border-0 bg-surface pl-8 pr-2.5 text-[12.5px] text-ink [font-family:inherit] placeholder:text-subtle focus-visible:bg-surface-strong focus-visible:outline-none"
                  />
                </div>
              ) : null}
              <div role="group" className="min-h-0 flex-1 overflow-y-auto p-1">
                {selectAll && matched.length > 1 ? (
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-surface">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-brand"
                      checked={allMatchedChosen}
                      onChange={toggleAllMatched}
                    />
                    {term ? `Select all ${matched.length} matches` : "Select all"}
                  </label>
                ) : null}
                {shown.length === 0 ? (
                  <p className="m-0 px-2.5 py-3 text-center text-[12px] text-subtle">
                    {term ? "No matches" : emptyText}
                  </p>
                ) : (
                  shown.map((option) => (
                    <label
                      key={String(option.value)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[12.5px] text-body hover:bg-surface"
                    >
                      <input
                        type="checkbox"
                        className="size-3.5 shrink-0 accent-brand"
                        checked={value.includes(option.value)}
                        onChange={() => toggle(option.value)}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{option.label}</span>
                        {option.hint ? (
                          <span className="truncate text-[11px] text-subtle">
                            {option.hint}
                          </span>
                        ) : null}
                      </span>
                      {option.meta !== undefined ? (
                        <span className="shrink-0 text-[11.5px] tabular-nums text-subtle">
                          {option.meta}
                        </span>
                      ) : null}
                    </label>
                  ))
                )}
                {hidden > 0 ? (
                  <p className="m-0 px-2.5 py-2 text-center text-[11.5px] text-subtle">
                    {hidden} more — type to narrow the list
                  </p>
                ) : null}
              </div>
            </div>,
            host,
          )
        : null}
    </div>
  );
}

/* ── SearchSelect ────────────────────────────────────────────────────────── */

export interface SearchSelectOption<T extends string | number> {
  value: T;
  label: string;
  /** A second line — a party's card code. Also matched when searching. */
  hint?: string;
}

export function SearchSelect<T extends string | number>({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  clearLabel,
  emptyText = "No matches",
  maxShown,
  disabled = false,
  size = "md",
  className,
}: {
  id?: string;
  /** `""` is "nothing chosen". */
  value: T | "";
  onChange: (next: T | "") => void;
  options: ReadonlyArray<SearchSelectOption<T>>;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Offers a row that clears the choice — "All users". Omit to disallow. */
  clearLabel?: string;
  emptyText?: string;
  /**
   * Rows rendered at once. The SAP item catalogue runs to thousands of
   * products, and mounting all of them made the Scheme Manager's picker
   * unusable — it capped at 80 and said so. Omit for lists that fit.
   */
  maxShown?: number;
  disabled?: boolean;
  size?: Size;
  className?: string;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = useOpenState(rootRef, panelRef);
  const { host, style } = useAnchoredPanel(rootRef, open);
  const [query, setQuery] = React.useState("");
  const listId = React.useId();

  // The search box takes focus as the panel opens: the whole reason this is
  // not a native select is that the list needs typing into.
  React.useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open]);

  const chosen = options.find((option) => option.value === value);
  const term = query.trim().toLowerCase();
  // Same matcher as MultiSelect, so the two pickers cannot disagree about what
  // a search means. See `lib/optionSearch`.
  const matched = rankOptions(options, term, (option) => [option.label, option.hint]);
  const shown = maxShown !== undefined ? matched.slice(0, maxShown) : matched;
  const hidden = matched.length - shown.length;

  const choose = (next: T | "") => {
    onChange(next);
    setOpen(false);
    rootRef.current?.querySelector<HTMLElement>("[data-dropdown-trigger]")?.focus();
  };

  return (
    <div ref={rootRef} data-dropdown-root className={rootClass(className)}>
      <button
        id={id}
        type="button"
        data-dropdown-trigger
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={triggerClass(size, open)}
      >
        {chosen ? (
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate">{chosen.label}</span>
            {chosen.hint ? (
              <span className="shrink-0 text-[11px] text-subtle">{chosen.hint}</span>
            ) : null}
          </span>
        ) : value !== "" ? (
          // A value the list does not know — a product code no longer in the
          // catalogue. Showing the code is more useful than pretending nothing
          // was chosen, which is what the trigger did before.
          <span className="truncate">{String(value)}</span>
        ) : (
          <span className="truncate text-subtle">{placeholder}</span>
        )}
        <HiOutlineChevronDown
          aria-hidden="true"
          className={cn("size-3.5 shrink-0 text-subtle transition-transform", open && "rotate-180")}
        />
      </button>

      {open && host ? (
        ReactDOM.createPortal(
        <div
              ref={panelRef}
              data-slot="dropdown-panel"
              className={cn(panelClass, "flex flex-col")}
              style={style}
            >
          <div className="relative shrink-0 p-1.5">
            <HiOutlineMagnifyingGlass
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-control-xs w-full rounded-sm border-0 bg-surface pl-8 pr-2.5 text-[12.5px] text-ink [font-family:inherit] placeholder:text-subtle focus-visible:bg-surface-strong focus-visible:outline-none"
            />
          </div>
          <div id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1">
            {clearLabel ? (
              <button
                type="button"
                role="option"
                aria-selected={value === ""}
                onClick={() => choose("")}
                className={cn(
                  "flex w-full appearance-none items-center rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] [font-family:inherit] cursor-pointer hover:bg-surface",
                  value === "" ? "font-semibold text-brand" : "text-subtle",
                )}
              >
                {clearLabel}
              </button>
            ) : null}
            {shown.length === 0 ? (
              <p className="m-0 px-2.5 py-3 text-center text-[12px] text-subtle">{emptyText}</p>
            ) : (
              shown.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => choose(option.value)}
                    className={cn(
                      "flex w-full appearance-none items-baseline justify-between gap-2 rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] [font-family:inherit] cursor-pointer hover:bg-surface",
                      selected ? "font-semibold text-brand" : "text-body",
                    )}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="shrink-0 text-[11px] text-subtle">{option.hint}</span>
                    ) : null}
                  </button>
                );
              })
            )}
            {hidden > 0 ? (
              <p className="m-0 px-2.5 py-2 text-center text-[11.5px] text-subtle">
                {hidden} more — type to narrow the list
              </p>
            ) : null}
          </div>
        </div>,
        host,
        )
      ) : null}
    </div>
  );
}
