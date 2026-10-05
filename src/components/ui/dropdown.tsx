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
import { createPortal } from "react-dom";
import { HiOutlineChevronDown, HiOutlineMagnifyingGlass } from "react-icons/hi2";

import { cn } from "@/lib/utils";

/* ── Shared plumbing ─────────────────────────────────────────────────────── */

type Size = "xs" | "md";

/**
 * The trigger, sized like the control beside it. Mirrors `ui/form` Select.
 *
 * It takes NO `className`. A call site's width belongs on the ROOT — see
 * `rootClass` — because the panel is positioned and sized against the root,
 * not against the trigger.
 */
function triggerClass(size: Size, open: boolean, multiline = false) {
  return cn(
    "appearance-none [font-family:inherit] cursor-pointer text-left",
    "flex w-full min-w-0 justify-between gap-2 rounded-sm border",
    "border-line bg-surface text-ink transition-colors hover:border-line-strong",
    "focus-visible:outline-none focus-visible:border-brand focus-visible:bg-card focus-visible:shadow-focus",
    "disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-subtle",
    // Multiline grows with its content (a long address wraps instead of
    // truncating); the fixed-height forms stay single-line.
    multiline
      ? "min-h-control items-start px-3 py-2 text-[13px]"
      : cn(
          "items-center",
          size === "xs" ? "h-control-xs px-2.5 text-[12.5px]" : "h-control px-3 text-[13px]",
        ),
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
 * `w-full`, not just `min-w-full`. With min-width alone an absolutely
 * positioned box is shrink-to-fit, so a long option label could push the
 * panel wider than the control it hangs from.
 */
const panelClass =
  "absolute left-0 top-[calc(100%+4px)] z-30 w-full min-w-full overflow-hidden rounded-card border border-line bg-card shadow-panel";

/**
 * The same panel, for the portaled variant: it lives on <body> and is
 * positioned `fixed` from JS (left/top/width come from the trigger's rect), so
 * it carries no absolute-position or width utilities — only the surface. A high
 * z-index so it clears sticky table headers and other in-page stacking; still
 * below the toast region (z-[2000]).
 *
 * The explicit `text-[12.5px]` matters: the panel is portaled to <body>, and
 * the unlayered `button,input { font: inherit }` reset (src/index.css) makes
 * every option button inherit its font size from an ANCESTOR rather than obey a
 * utility class on itself. On <body> that ancestor is :root (~18px), so without
 * a size on this container the options render oversized. Setting it here — on a
 * <div>, which the reset does not touch — gives the buttons something correct
 * to inherit. A call site's `textClassName` is merged after and can override.
 */
const portalPanelClass =
  "z-[1000] overflow-hidden rounded-card border border-line bg-card text-[12.5px] shadow-panel";

/**
 * Open/close, with the two ways out. One hook for both pickers, so they
 * cannot disagree about what "outside" means.
 */
function useOpenState(
  rootRef: React.RefObject<HTMLDivElement | null>,
  // A second element that also counts as "inside" — used when the panel is
  // portaled to <body> and so is NOT a DOM descendant of the root. Without it,
  // a pointer-down on a portaled option reads as "outside" and closes the panel
  // before the option's click fires, so nothing can be selected.
  extraRef?: React.RefObject<HTMLElement | null>,
) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (extraRef?.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Back to the trigger, so the keyboard user is not dropped at the body.
      rootRef.current?.querySelector<HTMLElement>("[data-dropdown-trigger]")?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, rootRef, extraRef]);

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
  /**
   * Name the chosen options in the closed trigger while there are at most
   * this many. Above it, and by default, the trigger says "N selected" — so
   * no existing caller changes.
   */
  namedUpTo = 1,
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
  /**
   * Name the chosen options in the closed trigger while there are at most
   * this many; above it the trigger says "N selected".
   *
   * Defaults to 1, which is today's behaviour for every caller. Raise it for
   * a genuinely short list — three company codes read better than
   * "2 selected", four thousand party names would not.
   */
  namedUpTo?: number;
  /** Rows rendered at once — see `SearchSelect`'s. Omit for lists that fit. */
  maxShown?: number;
  disabled?: boolean;
  size?: Size;
  className?: string;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = useOpenState(rootRef);
  const [query, setQuery] = React.useState("");

  // Same rule as SearchSelect: if there is a search box, it takes focus as the
  // panel opens, and the term is dropped when the panel closes.
  React.useEffect(() => {
    if (!searchable) return;
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open, searchable]);

  const term = searchable ? query.trim().toLowerCase() : "";
  const matched = term
    ? options.filter((option) =>
        [
          typeof option.label === "string" ? option.label : "",
          option.hint ?? "",
          option.keywords ?? "",
        ].some((field) => field.toLowerCase().includes(term)),
      )
    : options;
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
  /*
   * "N selected" is right for a long list — naming four thousand parties in a
   * trigger is not a summary. A SHORT list is better read back: three company
   * codes fit, and "OIL, MART" answers what was chosen without reopening the
   * panel. `namedUpTo` is how a caller says its list is short enough.
   *
   * Every chosen value's label, or undefined where the option is not in the
   * list — which happens while a searched list has moved on. One missing label
   * drops the summary to the count rather than naming only some of them.
   */
  const names = value.map(
    (chosen) => options.find((option) => option.value === chosen)?.label,
  );
  const summary =
    value.length === 0
      ? placeholder
      : value.length <= namedUpTo && names.every(Boolean)
        ? names.join(", ")
        : value.length === 1
          ? "1 selected"
          : allChosen
            ? `All (${value.length})`
            : `${value.length} selected`;

  const toggle = (option: T) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);

  return (
    <div ref={rootRef} className={rootClass(className)}>
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

      {open ? (
        <div className={panelClass}>
          {searchable ? (
            <div className="relative border-b border-line p-1.5">
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
                className="h-control-xs w-full rounded-sm border border-line bg-surface pl-8 pr-2.5 text-[12.5px] text-ink [font-family:inherit] placeholder:text-subtle focus-visible:border-brand focus-visible:bg-card focus-visible:outline-none focus-visible:shadow-focus"
              />
            </div>
          ) : null}
          <div role="group" className="max-h-64 overflow-y-auto p-1">
            {selectAll && matched.length > 1 ? (
              <label className="flex cursor-pointer items-center gap-2.5 rounded-sm border-b border-line px-2.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-surface">
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
                      <span className="truncate text-[11px] text-subtle">{option.hint}</span>
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
              <p className="m-0 border-t border-line px-2.5 py-2 text-center text-[11.5px] text-subtle">
                {hidden} more — type to narrow the list
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
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
  portal = false,
  multiline = false,
  textClassName,
  onQueryChange,
  loading = false,
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
   * Let the trigger WRAP its chosen label over multiple lines instead of
   * truncating it — for values too long to read at the control's width, e.g. a
   * full postal address. The trigger grows to fit.
   */
  multiline?: boolean;
  /**
   * Font-size (or any text utility) for the search box and the option rows.
   * A caller can enlarge or shrink the list without touching this component's
   * defaults; `tailwind-merge` lets the passed class win over them.
   */
  textClassName?: string;
  /**
   * Rows rendered at once. The SAP item catalogue runs to thousands of
   * products, and mounting all of them made the Scheme Manager's picker
   * unusable — it capped at 80 and said so. Omit for lists that fit.
   */
  maxShown?: number;
  disabled?: boolean;
  size?: Size;
  className?: string;
  /**
   * Render the panel in a portal on <body>, positioned `fixed` against the
   * trigger. For call sites inside a scroll container (an overflow-y table),
   * where the normal absolutely-positioned panel would be clipped by the
   * container. Off by default — it costs a getBoundingClientRect on open and a
   * scroll/resize listener while open, which a panel that fits in-flow does not
   * need.
   */
  portal?: boolean;
  /**
   * Told what is typed into the search box, for a list searched on the SERVER.
   *
   * For lists too long to ship whole — SAP's business partners run to
   * thousands and the API caps a page — the caller fetches matches for the
   * term and passes them back as `options`. The local filter still runs over
   * what comes back, so a caller that ignores this prop changes nothing.
   */
  onQueryChange?: (query: string) => void;
  /** Rows are being fetched: say so instead of "No matches". */
  loading?: boolean;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = useOpenState(rootRef, panelRef);
  const [query, setQuery] = React.useState("");
  const listId = React.useId();

  // Through a ref, so a caller passing a fresh arrow each render does not
  // re-fire this for a query that has not changed. Refreshed in an effect —
  // declared first, so it runs before the one below reads it.
  const onQueryChangeRef = React.useRef(onQueryChange);
  React.useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  });
  React.useEffect(() => {
    onQueryChangeRef.current?.(query);
  }, [query]);

  // Fixed-position box for the portaled panel, tracked against the trigger.
  const [panelBox, setPanelBox] = React.useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

  React.useLayoutEffect(() => {
    if (!open || !portal) return;
    const update = () => {
      const trigger = rootRef.current?.querySelector<HTMLElement>(
        "[data-dropdown-trigger]",
      );
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      setPanelBox({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    update();
    // `true` = capture, so a scroll on ANY ancestor (the table's own scroll
    // container included) keeps the panel pinned to the trigger.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, portal]);

  // The search box takes focus as the panel opens: the whole reason this is
  // not a native select is that the list needs typing into.
  React.useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open]);

  const chosen = options.find((option) => option.value === value);
  const term = query.trim().toLowerCase();
  const matched = term
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(term) ||
          (option.hint ?? "").toLowerCase().includes(term),
      )
    : options;
  const shown = maxShown !== undefined ? matched.slice(0, maxShown) : matched;
  const hidden = matched.length - shown.length;

  const choose = (next: T | "") => {
    onChange(next);
    setOpen(false);
    rootRef.current?.querySelector<HTMLElement>("[data-dropdown-trigger]")?.focus();
  };

  return (
    <div ref={rootRef} className={rootClass(className)}>
      <button
        id={id}
        type="button"
        data-dropdown-trigger
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={triggerClass(size, open, multiline)}
      >
        {chosen ? (
          multiline ? (
            // Stacked and wrapping — the whole value stays readable.
            <span className="flex min-w-0 flex-col gap-0.5 whitespace-normal break-words">
              <span className="font-medium">{chosen.label}</span>
              {chosen.hint ? (
                <span className="text-[11.5px] text-subtle">{chosen.hint}</span>
              ) : null}
            </span>
          ) : (
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate">{chosen.label}</span>
              {chosen.hint ? (
                <span className="shrink-0 text-[11px] text-subtle">{chosen.hint}</span>
              ) : null}
            </span>
          )
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
          className={cn(
            "size-3.5 shrink-0 text-subtle transition-transform",
            multiline && "mt-0.5",
            open && "rotate-180",
          )}
        />
      </button>

      {open
        ? (() => {
            const node = (
        <div
          ref={panelRef}
          // `textClassName` goes on the CONTAINER, not the option buttons: the
          // unlayered `button { font: inherit }` reset overrides a utility class
          // on a button, so the size has to be inherited from this div.
          className={cn(portal ? portalPanelClass : panelClass, textClassName)}
          // Portaled panels are `fixed` and sized to the trigger; in-flow
          // panels keep their CSS-driven position (see panelClass).
          style={
            portal && panelBox
              ? {
                  position: "fixed",
                  left: panelBox.left,
                  top: panelBox.top,
                  width: panelBox.width,
                }
              : undefined
          }
        >
          <div className="relative border-b border-line p-1.5">
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
              className={cn(
                "h-control-xs w-full rounded-sm border border-line bg-surface pl-8 pr-2.5 text-[12.5px] text-ink [font-family:inherit] placeholder:text-subtle focus-visible:border-brand focus-visible:bg-card focus-visible:outline-none focus-visible:shadow-focus",
                textClassName,
              )}
            />
          </div>
          <div id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
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
              <p className="m-0 px-2.5 py-3 text-center text-[12px] text-subtle">
                {loading ? "Loading…" : emptyText}
              </p>
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
                      "flex w-full appearance-none rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] [font-family:inherit] cursor-pointer hover:bg-surface",
                      // Multiline stacks label over hint and wraps both, so a
                      // long value (a full address) reads as a paragraph and the
                      // next option starts on its own line — no sideways scroll.
                      multiline
                        ? "flex-col gap-0.5 items-start"
                        : "items-baseline justify-between gap-2",
                      selected ? "bg-brand-soft font-semibold text-brand" : "text-body",
                      textClassName,
                    )}
                  >
                    {multiline ? (
                      <>
                        <span className="whitespace-normal break-words font-medium">
                          {option.label}
                        </span>
                        {option.hint ? (
                          <span className="whitespace-normal break-words text-[11.5px] text-subtle">
                            {option.hint}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 truncate">{option.label}</span>
                        {option.hint ? (
                          <span className="shrink-0 text-[11px] text-subtle">{option.hint}</span>
                        ) : null}
                      </>
                    )}
                  </button>
                );
              })
            )}
            {hidden > 0 ? (
              <p className="m-0 border-t border-line px-2.5 py-2 text-center text-[11.5px] text-subtle">
                {hidden} more — type to narrow the list
              </p>
            ) : null}
          </div>
        </div>
            );
            // Portaled to <body> so a scroll container the trigger sits in
            // cannot clip it; otherwise rendered in place.
            return portal ? createPortal(node, document.body) : node;
          })()
        : null}
    </div>
  );
}
