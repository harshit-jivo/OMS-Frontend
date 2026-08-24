import { useEffect, useMemo, useRef, useState } from "react";
import { schemeService } from "../services/schemeService";
import type {
  AppliesTo,
  ApplicableScheme,
  MatchType,
  Scheme,
  SchemeAssignment,
  SchemeBenefit,
  SchemeProposal,
  SchemeTrigger,
  SchemeWritePayload,
  ScopeType,
  Uom,
} from "../services/schemeService";
import {
  APPLIES_TO_OPTIONS,
  MATCH_TYPE_OPTIONS,
  SCOPE_TYPE_OPTIONS,
  UOM_OPTIONS,
  describeBenefit,
  describeScope,
  describeTrigger,
  emptyAssignment,
  emptyBenefit,
  emptyScheme,
  emptyTrigger,
} from "../services/schemeService";
import { userService } from "../services/userService";
import { sapService } from "../services/sapService";
import "../styles/Scheme_Manager.css";

type StateOption = { id: number; name: string; code: string };
type PartyOption = { card_code: string; card_name: string };
type MainGroupOption = { id: number; name: string };
type CatalogueItem = { item_code: string; item_name: string; category?: string };

/** SAP item codes are prefixed by kind: FG finished goods, PM packing material,
 *  RM raw material, plus CG and SC. Only FG is sellable, so only FG can appear
 *  in a scheme. */
const isFinishedGood = (itemCode: string | undefined | null) =>
  !!itemCode && itemCode.trim().toUpperCase().startsWith("FG");

const CATEGORIES = ["OIL", "BEVERAGES", "MART"];

/** Pull the API's message / errors out of an axios rejection without `any`. */
const apiErrorText = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string; errors?: unknown } } })?.response
    ?.data;
  if (data?.errors) return `${fallback}: ${JSON.stringify(data.errors)}`;
  return data?.message || fallback;
};

// ---------------------------------------------------------------------------
// icons
// ---------------------------------------------------------------------------

const CaretIcon = () => (
  <svg className="sch-caret" width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PencilIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4.5A1.5 1.5 0 019.5 3h5A1.5 1.5 0 0116 4.5V6" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 13a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6M14 11v6" />
  </svg>
);

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="4.6" stroke="#94a3b8" strokeWidth="1.5" />
    <path d="M10.5 10.5L14 14" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ---------------------------------------------------------------------------

/**
 * Searchable product picker.
 *
 * Schemes are set up by people who know products by name, not by FG code, so
 * every item field on this page is one of these. The stored value is still the
 * item_code — that is what the engine matches on — but it is never typed.
 */
function ItemPicker({
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
            />
          </div>
          <div className="sch-picker-scroll">
            {allowClear && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setSearch("");
                }}
                className={`sch-picker-opt is-clear${!value ? " is-selected" : ""}`}
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

// ---------------------------------------------------------------------------

export default function Scheme_Manager() {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Reference data for the "who gets it" pickers.
  const [states, setStates] = useState<StateOption[]>([]);
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [mainGroups, setMainGroups] = useState<MainGroupOption[]>([]);
  const [products, setProducts] = useState<CatalogueItem[]>([]);

  // Item codes are what the engine matches on, but nobody reads them — every
  // list on this page shows the product name instead.
  const itemNameOf = useMemo(() => {
    const byCode = new Map(products.map((p) => [p.item_code, p.item_name]));
    return (itemCode: string) => byCode.get(itemCode) || itemCode;
  }, [products]);

  // Editor — `null` means closed, `0` means "new scheme".
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<SchemeWritePayload>(emptyScheme());
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // The editor is a wizard: one question per screen, so a half-built offer never
  // looks finished. Step 4 reads the whole thing back before it is saved.
  const [editorStep, setEditorStep] = useState(1);

  // One row expanded at a time keeps the list scannable.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);

  const loadSchemes = async (
    overrides: { search?: string; includeInactive?: boolean; category?: string } = {},
  ) => {
    setIsLoading(true);
    setLoadError("");
    try {
      setSchemes(
        await schemeService.list({
          search: overrides.search ?? search,
          category: overrides.category ?? categoryFilter,
          include_inactive: overrides.includeInactive ?? includeInactive,
        }),
      );
    } catch (error) {
      console.error("Error loading schemes:", error);
      setLoadError("Could not load schemes. Check that you are signed in and try again.");
      setSchemes([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSchemes();

    void (async () => {
      try {
        const data = await userService.getState();
        setStates(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error loading states:", error);
      }
    })();

    void (async () => {
      try {
        const data = await sapService.getParties();
        const list = Array.isArray(data) ? data : data?.results || data?.data || [];
        setParties(list);
      } catch (error) {
        console.error("Error loading parties:", error);
      }
    })();

    void (async () => {
      try {
        const data = await userService.getMainGroup();
        setMainGroups(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error loading main groups:", error);
      }
    })();

    void (async () => {
      try {
        const data = await sapService.getProducts();
        const list: CatalogueItem[] = Array.isArray(data) ? data : data?.results || data?.data || [];
        // Finished goods only. The catalogue also carries PM (packing material),
        // RM (raw material), CG and SC — about two thirds of it — and none of
        // those can be sold, so none can trigger a scheme or be given away.
        // Also de-duplicated: the same item_code exists once per category, and a
        // scheme matches on the code alone.
        const seen = new Set<string>();
        setProducts(
          list.filter((p) => {
            if (!isFinishedGood(p.item_code) || seen.has(p.item_code)) return false;
            seen.add(p.item_code);
            return true;
          }),
        );
      } catch (error) {
        console.error("Error loading products:", error);
      }
    })();
    // Mount-only. `loadSchemes` closes over `search` / `includeInactive` and is
    // recreated every render, so listing it here would refetch on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes whichever modal is open — both cover the page.
  useEffect(() => {
    if (editingId === null && !checkOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (editingId !== null) closeEditor();
      else setCheckOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editingId, checkOpen]);

  // -- editor -------------------------------------------------------------

  const openNew = () => {
    setEditingId(0);
    setDraft(emptyScheme());
    setShowAdvanced(false);
    setEditorStep(1);
    setNotice(null);
  };

  const openEdit = (scheme: Scheme) => {
    setEditingId(scheme.id);
    setDraft({
      code: scheme.code,
      name: scheme.name,
      description: scheme.description || "",
      category: scheme.category || "",
      valid_from: scheme.valid_from,
      valid_to: scheme.valid_to,
      is_active: scheme.is_active,
      priority: scheme.priority,
      stackable: scheme.stackable,
      benefits: scheme.benefits.length ? scheme.benefits : [emptyBenefit()],
      triggers: scheme.triggers.length ? scheme.triggers : [emptyTrigger()],
      assignments: scheme.assignments,
    });
    setShowAdvanced(false);
    setEditorStep(1);
    setNotice(null);
  };

  const closeEditor = () => {
    setEditingId(null);
    setDraft(emptyScheme());
  };

  const patchDraft = (patch: Partial<SchemeWritePayload>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const patchTrigger = (index: number, patch: Partial<SchemeTrigger>) =>
    setDraft((prev) => ({
      ...prev,
      triggers: prev.triggers.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));

  const patchBenefit = (index: number, patch: Partial<SchemeBenefit>) =>
    setDraft((prev) => ({
      ...prev,
      benefits: prev.benefits.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));

  const patchAssignment = (index: number, patch: Partial<SchemeAssignment>) =>
    setDraft((prev) => ({
      ...prev,
      assignments: prev.assignments.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));

  const EDITOR_STEPS = [
    { n: 1, label: "Name" },
    { n: 2, label: "Offer" },
    { n: 3, label: "Who" },
    { n: 4, label: "Review" },
  ];

  /** What each step is still missing, in plain words. Keyed by step so the
   *  wizard can block Next on the screen that owns the gap rather than only
   *  complaining at the end. */
  const gapsByStep = useMemo<Record<number, string[]>>(() => {
    const step1: string[] = [];
    if (!draft.name.trim()) step1.push("a name");
    if (!draft.code.trim()) step1.push("a short code");

    const step2: string[] = [];
    if (draft.triggers.some((t) => t.match_type !== "ALL" && !t.match_value.trim()))
      step2.push("what earns it");

    const step3: string[] = [];
    if (draft.assignments.some((a) => a.scope_type !== "ALL" && !a.scope_value.trim()))
      step3.push("who each rule sends it to");

    return { 1: step1, 2: step2, 3: step3, 4: [] };
  }, [draft]);

  /** Everything still missing anywhere — what the Save button waits on. */
  const missing = useMemo(
    () => Object.values(gapsByStep).flat(),
    [gapsByStep],
  );

  const canSave = missing.length === 0;
  const currentStepGaps = gapsByStep[editorStep] ?? [];
  const canLeaveStep = currentStepGaps.length === 0;

  /** The first step that still has a gap — where "fix it" should land you. */
  const firstIncompleteStep =
    EDITOR_STEPS.find((step) => (gapsByStep[step.n] ?? []).length > 0)?.n ?? 4;

  const goToStep = (step: number) => {
    // Jumping backwards is always allowed; forwards only as far as the first
    // unfinished step, so Review can never show a half-built offer.
    if (step <= editorStep || step <= firstIncompleteStep) setEditorStep(step);
  };

  const saveScheme = async () => {
    setIsSaving(true);
    setNotice(null);
    try {
      if (editingId) {
        await schemeService.update(editingId, draft);
        setNotice({ tone: "ok", text: "Saved" });
      } else {
        const created = await schemeService.create(draft);
        setNotice({
          tone: "ok",
          text: draft.assignments.length
            ? `${created.code} created and live.`
            : `${created.code} created — it reaches nobody until you say who gets it.`,
        });
      }
      closeEditor();
      await loadSchemes();
    } catch (error) {
      console.error("Error saving scheme:", error);
      setNotice({ tone: "error", text: apiErrorText(error, "Could not save the scheme") });
    } finally {
      setIsSaving(false);
    }
  };

  const deactivate = async (scheme: Scheme) => {
    if (!window.confirm(`Turn "${scheme.name}" off? It stops applying everywhere, reversibly.`))
      return;
    setNotice(null);
    try {
      const response = await schemeService.remove(scheme.id);
      setNotice({ tone: "ok", text: response.message });
      await loadSchemes();
    } catch (error) {
      console.error("Error deactivating scheme:", error);
      setNotice({ tone: "error", text: apiErrorText(error, "Could not turn the scheme off") });
    }
  };

  /**
   * Hard delete, straight from the row. The API refuses it when an order line
   * already references the scheme — what was given away has to stay on record —
   * so a refusal is reported as-is and turning it off remains the way out.
   */
  const deleteScheme = async (scheme: Scheme) => {
    if (
      !window.confirm(
        `Delete "${scheme.name}" permanently? This cannot be undone. If any order has already used it, turn it off instead.`,
      )
    )
      return;
    setNotice(null);
    try {
      const response = await schemeService.remove(scheme.id, true);
      if (response.success === false) {
        setNotice({
          tone: "error",
          text:
            response.message ||
            `Cannot delete — ${response.used_by_order_lines ?? "some"} order line(s) use this. Turn it off instead.`,
        });
        return;
      }
      if (expandedId === scheme.id) setExpandedId(null);
      setNotice({ tone: "ok", text: response.message || `Deleted ${scheme.code}` });
      await loadSchemes();
    } catch (error) {
      console.error("Error deleting scheme:", error);
      setNotice({ tone: "error", text: apiErrorText(error, "Could not delete the scheme") });
    }
  };

  /** Options for one rule's target picker, by the kind of target chosen. */
  const targetOptions = (scopeType: ScopeType) => {
    switch (scopeType) {
      case "STATE":
        return states.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }));
      case "PARTY":
        return parties.map((p) => ({ value: p.card_code, label: `${p.card_name} (${p.card_code})` }));
      case "MAIN_GROUP":
        return mainGroups.map((g) => ({ value: g.name, label: g.name }));
      case "CATEGORY":
        return CATEGORIES.map((c) => ({ value: c, label: c }));
      default:
        return [];
    }
  };

  const editingScheme = editingId ? schemes.find((s) => s.id === editingId) : null;

  return (
    <div className="sch-page app-page">
      {/* ---- header -------------------------------------------------- */}
      <header className="sch-head">
        <h1>Schemes</h1>
        <div className="sch-head-actions">
          <button type="button" className="sch-btn" onClick={() => setCheckOpen(true)}>
            Check a vendor
          </button>
          <button type="button" className="sch-btn-primary" onClick={openNew}>
            + New scheme
          </button>
        </div>
      </header>

      {notice && (
        <div className={`sch-notice ${notice.tone}`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {/* ---- toolbar ------------------------------------------------- */}
      <div className="sch-toolbar">
        <div className="sch-search">
          <SearchIcon />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && loadSchemes()}
            onBlur={() => loadSchemes()}
            placeholder="Search schemes..."
          />
        </div>
        <select
          className="sch-select sch-toolbar-select"
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value);
            void loadSchemes({ category: event.target.value });
          }}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="sch-check">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => {
              setIncludeInactive(event.target.checked);
              void loadSchemes({ includeInactive: event.target.checked });
            }}
          />
          Show turned-off
        </label>
      </div>

      {/* ---- list ---------------------------------------------------- */}
      <div className="sch-list">
        {isLoading ? (
          <div style={{ padding: "8px 0" }}>
            <div className="sch-skeleton" />
            <div className="sch-skeleton" />
            <div className="sch-skeleton" />
          </div>
        ) : loadError ? (
          <div className="sch-state error">
            <h3>Could not load schemes</h3>
            <p>{loadError}</p>
            <button type="button" className="sch-btn" onClick={() => loadSchemes()}>
              Try again
            </button>
          </div>
        ) : schemes.length === 0 ? (
          <div className="sch-state">
            <h3>No schemes yet</h3>
            <p>A scheme is an offer: what a vendor has to buy, and what they get free.</p>
            <button type="button" className="sch-btn-primary" onClick={openNew}>
              + New scheme
            </button>
          </div>
        ) : (
          schemes.map((scheme) => {
            const isOpen = expandedId === scheme.id;
            const grants = scheme.assignments.filter((a) => !a.is_exclusion);
            const exclusions = scheme.assignments.filter((a) => a.is_exclusion);
            const buy = scheme.triggers[0]
              ? describeTrigger(scheme.triggers[0], itemNameOf)
              : "no rule set";
            const get = scheme.benefits[0]
              ? describeBenefit(scheme.benefits[0], itemNameOf)
              : "nothing set";
            const extras =
              scheme.triggers.length + scheme.benefits.length - 2;

            return (
              <div
                key={scheme.id}
                className={[
                  "sch-item",
                  isOpen ? "is-open" : "",
                  scheme.is_active ? "" : "is-inactive",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="sch-row">
                  <button
                    type="button"
                    className="sch-row-open"
                    onClick={() => setExpandedId(isOpen ? null : scheme.id)}
                    aria-expanded={isOpen}
                  >
                    <CaretIcon />
                    <div className="sch-row-main">
                      <div className="sch-row-title">
                        <span className="sch-row-name">{scheme.name}</span>
                        {!scheme.is_active && <span className="sch-chip red">Off</span>}
                      </div>
                      {/* The whole offer as one sentence — this line is what the
                          list is for. */}
                      <div className="sch-row-sum">
                        {buy} → <strong>{get}</strong>
                        {extras > 0 ? ` · +${extras} more` : ""}
                      </div>
                    </div>
                    <div className="sch-row-side">
                      {scheme.category && <span className="sch-chip green">{scheme.category}</span>}
                      {grants.length === 0 ? (
                        <span className="sch-chip amber">Nobody yet</span>
                      ) : (
                        <span className="sch-reach">
                          {describeScope(grants[0])}
                          {grants.length > 1 ? ` +${grants.length - 1}` : ""}
                          {exclusions.length ? " *" : ""}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="sch-row-tools">
                    <button
                      type="button"
                      className="sch-icon-btn"
                      onClick={() => openEdit(scheme)}
                      title="Edit"
                      aria-label={`Edit ${scheme.code}`}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className="sch-icon-btn is-danger"
                      onClick={() => deleteScheme(scheme)}
                      title="Delete"
                      aria-label={`Delete ${scheme.code}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="sch-detail">
                    <div className="sch-detail-grid">
                      <div className="sch-block">
                        <div className="sch-block-title">To earn it</div>
                        <ul>
                          {scheme.triggers.map((trigger, i) => (
                            <li key={i}>{describeTrigger(trigger, itemNameOf)}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="sch-block">
                        <div className="sch-block-title">They get</div>
                        <ul>
                          {scheme.benefits.map((benefit, i) => (
                            <li key={i} className="give">
                              {describeBenefit(benefit, itemNameOf)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="sch-block">
                        <div className="sch-block-title">Sent to</div>
                        <div className="sch-tags">
                          {grants.length === 0 && exclusions.length === 0 ? (
                            <span className="sch-chip amber">Nobody yet</span>
                          ) : (
                            <>
                              {grants.map((assignment, i) => (
                                <span key={assignment.id ?? `g${i}`} className="sch-chip blue">
                                  {describeScope(assignment)}
                                </span>
                              ))}
                              {exclusions.map((assignment, i) => (
                                <span key={assignment.id ?? `e${i}`} className="sch-chip red">
                                  not {describeScope(assignment)}
                                </span>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="sch-block">
                        <div className="sch-block-title">Runs</div>
                        <ul>
                          <li>
                            {scheme.valid_from || scheme.valid_to
                              ? `${scheme.valid_from || "any time"} to ${scheme.valid_to || "no end"}`
                              : "Always"}
                          </li>
                          <li className="muted">
                            {scheme.code}
                            {scheme.category ? ` · ${scheme.category}` : " · all categories"}
                            {scheme.stackable ? " · combines with others" : ""}
                          </li>
                          {scheme.description && <li className="muted">{scheme.description}</li>}
                        </ul>
                      </div>
                    </div>

                    <div className="sch-actions">
                      <button
                        type="button"
                        className="sch-btn sch-btn-sm"
                        onClick={() => openEdit(scheme)}
                      >
                        Edit
                      </button>
                      {scheme.is_active && (
                        <button
                          type="button"
                          className="sch-btn sch-btn-sm"
                          onClick={() => deactivate(scheme)}
                        >
                          Turn off
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ---- editor modal -------------------------------------------- */}
      {editingId !== null && (
        <>
          <div className="sch-scrim" onClick={closeEditor} />
          <div className="sch-modal" role="dialog" aria-modal="true">
            <div className="sch-modal-head">
              <div>
                <h2>{editingId ? editingScheme?.name || "Edit scheme" : "New scheme"}</h2>
                <p>An offer, what earns it, and who gets it.</p>
              </div>
              <button type="button" className="sch-x" onClick={closeEditor} aria-label="Close">
                ×
              </button>
            </div>

            <ol className="sch-stepper">
              {EDITOR_STEPS.map((step) => {
                const done = step.n < editorStep && (gapsByStep[step.n] ?? []).length === 0;
                const reachable = step.n <= editorStep || step.n <= firstIncompleteStep;
                return (
                  <li
                    key={step.n}
                    className={`sch-stepper-item${step.n === editorStep ? " is-current" : ""}${
                      done ? " is-done" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => goToStep(step.n)}
                      disabled={!reachable}
                      aria-current={step.n === editorStep ? "step" : undefined}
                    >
                      <span className="sch-stepper-n">{done ? "✓" : step.n}</span>
                      <span className="sch-stepper-label">{step.label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="sch-modal-body">
              {/* 1 — the offer -------------------------------------- */}
              <section className="sch-section" hidden={editorStep !== 1}>
                <div className="sch-step">
                  <span className="sch-step-n">1</span>
                  <div>
                    <h3>Name it</h3>
                    <p>What you will recognise it by later.</p>
                  </div>
                </div>

                <div className="sch-grid">
                  <div className="sch-span-2">
                    <label className="sch-label">Name</label>
                    <input
                      className="sch-input"
                      value={draft.name}
                      onChange={(e) => patchDraft({ name: e.target.value })}
                      placeholder="1 free piece on 10 boxes"
                    />
                  </div>
                  <div>
                    <label className="sch-label">Short code</label>
                    <input
                      className="sch-input"
                      value={draft.code}
                      onChange={(e) => patchDraft({ code: e.target.value })}
                      placeholder="PB-CP1L-Q4"
                    />
                  </div>
                  <div>
                    <label className="sch-label">Applies to</label>
                    <select
                      className="sch-select"
                      value={draft.category}
                      onChange={(e) => patchDraft({ category: e.target.value })}
                    >
                      <option value="">Every category</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c} only
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="sch-label">Starts</label>
                    <input
                      type="date"
                      className="sch-input"
                      value={draft.valid_from || ""}
                      onChange={(e) => patchDraft({ valid_from: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label className="sch-label">Ends</label>
                    <input
                      type="date"
                      className="sch-input"
                      value={draft.valid_to || ""}
                      onChange={(e) => patchDraft({ valid_to: e.target.value || null })}
                    />
                  </div>
                </div>
              </section>

              {/* 2 — the rule --------------------------------------- */}
              <section className="sch-section" hidden={editorStep !== 2}>
                <div className="sch-step">
                  <span className="sch-step-n">2</span>
                  <div>
                    <h3>Write the offer</h3>
                    <p>Buy this much, get that free.</p>
                  </div>
                </div>

                <div className="sch-block-title">To earn it, the vendor must buy</div>
                {draft.triggers.map((trigger, index) => (
                  <div key={index} className="sch-sentence">
                    <span className="sch-word">at least</span>
                    <input
                      type="number"
                      min="0"
                      className="sch-input sch-w-qty"
                      value={trigger.min_qty}
                      onChange={(e) => patchTrigger(index, { min_qty: e.target.value })}
                      placeholder="0"
                    />
                    <select
                      className="sch-select sch-w-uom"
                      value={trigger.min_uom}
                      onChange={(e) => patchTrigger(index, { min_uom: e.target.value as Uom })}
                    >
                      {UOM_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <span className="sch-word">of</span>
                    <select
                      className="sch-select sch-w-match"
                      value={trigger.match_type}
                      onChange={(e) => patchTrigger(index, { match_type: e.target.value as MatchType })}
                    >
                      {MATCH_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {trigger.match_type !== "ALL" && (
                      <span className="sch-w-value">
                        {trigger.match_type === "ITEM" ? (
                          <ItemPicker
                            value={trigger.match_value}
                            products={products}
                            onChange={(itemCode) => patchTrigger(index, { match_value: itemCode })}
                            placeholder="search the product..."
                          />
                        ) : (
                          <input
                            className="sch-input"
                            value={trigger.match_value}
                            onChange={(e) => patchTrigger(index, { match_value: e.target.value })}
                            placeholder="OLIVE"
                          />
                        )}
                      </span>
                    )}
                    {draft.triggers.length > 1 && (
                      <button
                        type="button"
                        className="sch-x sch-x-sm"
                        title="Remove"
                        onClick={() =>
                          patchDraft({ triggers: draft.triggers.filter((_, i) => i !== index) })
                        }
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="sch-add"
                  onClick={() => patchDraft({ triggers: [...draft.triggers, emptyTrigger()] })}
                >
                  + another way to earn it
                </button>

                <div className="sch-block-title sch-mt">And they get</div>
                {draft.benefits.map((benefit, index) => (
                  <div key={index} className="sch-sentence">
                    <input
                      type="number"
                      min="0"
                      className="sch-input sch-w-qty"
                      value={benefit.free_qty}
                      onChange={(e) => patchBenefit(index, { free_qty: e.target.value })}
                      placeholder="1"
                    />
                    <select
                      className="sch-select sch-w-uom"
                      value={benefit.free_uom}
                      onChange={(e) => patchBenefit(index, { free_uom: e.target.value as Uom })}
                    >
                      {UOM_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <span className="sch-word">of</span>
                    <span className="sch-w-value">
                      <ItemPicker
                        value={benefit.free_item_code ?? ""}
                        products={products}
                        onChange={(itemCode) => patchBenefit(index, { free_item_code: itemCode })}
                        placeholder="search the free product..."
                        allowClear
                        clearLabel="the same item they bought"
                      />
                    </span>
                    <span className="sch-word">free, for every</span>
                    <input
                      type="number"
                      min="0"
                      className="sch-input sch-w-qty"
                      value={benefit.per_qty}
                      onChange={(e) => patchBenefit(index, { per_qty: e.target.value })}
                      placeholder="10"
                    />
                    <span className="sch-word">bought</span>
                    {draft.benefits.length > 1 && (
                      <button
                        type="button"
                        className="sch-x sch-x-sm"
                        title="Remove"
                        onClick={() =>
                          patchDraft({ benefits: draft.benefits.filter((_, i) => i !== index) })
                        }
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="sch-add"
                  onClick={() => patchDraft({ benefits: [...draft.benefits, emptyBenefit()] })}
                >
                  + another free item
                </button>

                <div className="sch-readback">
                  {draft.triggers.map((t) => describeTrigger(t, itemNameOf)).join(", or ")} →{" "}
                  <strong>
                    {draft.benefits.map((b) => describeBenefit(b, itemNameOf)).join(" and ")}
                  </strong>
                </div>
              </section>

              {/* 3 — who gets it ------------------------------------ */}
              <section className="sch-section" hidden={editorStep !== 3}>
                <div className="sch-step">
                  <span className="sch-step-n">3</span>
                  <div>
                    <h3>Say who gets it</h3>
                    <p>Until there is a line here, the offer reaches nobody.</p>
                  </div>
                </div>

                {draft.assignments.length === 0 && (
                  <div className="sch-empty-inline">No one yet.</div>
                )}

                {draft.assignments.map((assignment, index) => (
                  <div key={assignment.id ?? `new-${index}`} className="sch-sentence">
                    <select
                      className="sch-select sch-w-mode"
                      value={assignment.is_exclusion ? "EXCLUDE" : "SEND"}
                      onChange={(e) =>
                        patchAssignment(index, { is_exclusion: e.target.value === "EXCLUDE" })
                      }
                    >
                      <option value="SEND">Send to</option>
                      <option value="EXCLUDE">Except</option>
                    </select>
                    <select
                      className="sch-select sch-w-match"
                      value={assignment.scope_type}
                      onChange={(e) =>
                        patchAssignment(index, {
                          scope_type: e.target.value as ScopeType,
                          scope_value: "",
                        })
                      }
                    >
                      {SCOPE_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {assignment.scope_type !== "ALL" && (
                      <span className="sch-w-value">
                        <input
                          className="sch-input"
                          list={`targets-${assignment.scope_type}`}
                          value={assignment.scope_value}
                          onChange={(e) => patchAssignment(index, { scope_value: e.target.value })}
                          placeholder="type to search..."
                        />
                        <datalist id={`targets-${assignment.scope_type}`}>
                          {targetOptions(assignment.scope_type).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </datalist>
                      </span>
                    )}
                    <button
                      type="button"
                      className="sch-x sch-x-sm"
                      title="Remove"
                      onClick={() =>
                        patchDraft({
                          assignments: draft.assignments.filter((_, i) => i !== index),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="sch-add"
                  onClick={() =>
                    patchDraft({ assignments: [...draft.assignments, emptyAssignment()] })
                  }
                >
                  + who gets it
                </button>
                {draft.assignments.some((a) => a.is_exclusion) && (
                  <div className="sch-hint">
                    An “Except” line always wins — use one to carve a vendor out of a state-wide
                    offer.
                  </div>
                )}
              </section>

              {/* 4 — read it back ----------------------------------- */}
              <section className="sch-section" hidden={editorStep !== 4}>
                <div className="sch-step">
                  <span className="sch-step-n">4</span>
                  <div>
                    <h3>Check it over</h3>
                    <p>This is the whole offer. Nothing is saved until you press Create.</p>
                  </div>
                </div>

                <dl className="sch-review">
                  <div>
                    <dt>Offer</dt>
                    <dd>
                      <strong>{draft.name || "—"}</strong>
                      {draft.code ? ` · ${draft.code}` : ""}
                      {draft.category ? ` · ${draft.category} only` : " · every category"}
                    </dd>
                  </div>
                  <div>
                    <dt>Runs</dt>
                    <dd>
                      {draft.valid_from || draft.valid_to
                        ? `${draft.valid_from || "any time"} to ${draft.valid_to || "no end"}`
                        : "No date limit"}
                    </dd>
                  </div>
                  <div>
                    <dt>Earns it</dt>
                    <dd>{draft.triggers.map((t) => describeTrigger(t, itemNameOf)).join(", or ")}</dd>
                  </div>
                  <div>
                    <dt>Gives</dt>
                    <dd className="sch-review-gives">
                      {draft.benefits.map((b) => describeBenefit(b, itemNameOf)).join(" and ")}
                    </dd>
                  </div>
                  <div>
                    <dt>Goes to</dt>
                    <dd>
                      {draft.assignments.length === 0 ? (
                        <span className="sch-review-warn">
                          Nobody yet — it will exist but never apply.
                        </span>
                      ) : (
                        draft.assignments
                          .map(
                            (a) =>
                              `${a.is_exclusion ? "except " : ""}${describeScope(a)}`,
                          )
                          .join(", ")
                      )}
                    </dd>
                  </div>
                  {!draft.is_active && (
                    <div>
                      <dt>Status</dt>
                      <dd className="sch-review-warn">Off — it will not apply until switched on.</dd>
                    </div>
                  )}
                </dl>

              {/* everything most people never touch ------------------ */}
              <details
                className="sch-learn"
                open={showAdvanced}
                onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
              >
                <summary>Rare settings</summary>
                <div className="sch-learn-body">
                  <div className="sch-grid">
                    <div className="sch-span-2">
                      <label className="sch-label">Note</label>
                      <input
                        className="sch-input"
                        value={draft.description}
                        onChange={(e) => patchDraft({ description: e.target.value })}
                        placeholder="For whoever reads this later"
                      />
                    </div>
                    <div>
                      <label className="sch-label">Wins over offers below</label>
                      <input
                        type="number"
                        className="sch-input"
                        value={draft.priority}
                        onChange={(e) => patchDraft({ priority: Number(e.target.value) })}
                      />
                      <div className="sch-hint">Higher number wins a clash on the same free item.</div>
                    </div>
                    <div>
                      <label className="sch-label">Count towards the offer</label>
                      <select
                        className="sch-select"
                        value={draft.triggers[0]?.applies_to ?? "PAID_LINE"}
                        onChange={(e) =>
                          patchDraft({
                            triggers: draft.triggers.map((t) => ({
                              ...t,
                              applies_to: e.target.value as AppliesTo,
                            })),
                          })
                        }
                      >
                        {APPLIES_TO_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <div className="sch-hint">
                        {
                          APPLIES_TO_OPTIONS.find(
                            (o) => o.value === (draft.triggers[0]?.applies_to ?? "PAID_LINE"),
                          )?.hint
                        }
                      </div>
                    </div>
                    <div className="sch-span-2">
                      <div className="sch-toggles">
                        <label className="sch-check">
                          <input
                            type="checkbox"
                            checked={draft.is_active}
                            onChange={(e) => patchDraft({ is_active: e.target.checked })}
                          />
                          On
                        </label>
                        <label className="sch-check">
                          <input
                            type="checkbox"
                            checked={draft.stackable}
                            onChange={(e) => patchDraft({ stackable: e.target.checked })}
                          />
                          Can combine with other offers
                        </label>
                      </div>
                    </div>
                    <div className="sch-span-2">
                      <label className="sch-label">Most free items per order line</label>
                      <input
                        type="number"
                        min="0"
                        className="sch-input"
                        value={draft.benefits[0]?.max_free_qty ?? ""}
                        onChange={(e) => patchBenefit(0, { max_free_qty: e.target.value })}
                        placeholder="no limit"
                      />
                    </div>
                  </div>
                </div>
              </details>
              </section>
            </div>

            <div className="sch-modal-foot">
              {editorStep > 1 && (
                <button
                  type="button"
                  className="sch-btn"
                  onClick={() => setEditorStep(editorStep - 1)}
                >
                  Back
                </button>
              )}

              {editorStep < 4 ? (
                <button
                  type="button"
                  className="sch-btn-primary"
                  disabled={!canLeaveStep}
                  onClick={() => setEditorStep(editorStep + 1)}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  className="sch-btn-primary"
                  disabled={!canSave || isSaving}
                  onClick={saveScheme}
                >
                  {isSaving ? "Saving..." : editingId ? "Save" : "Create scheme"}
                </button>
              )}

              <button type="button" className="sch-btn" onClick={closeEditor}>
                Cancel
              </button>

              {!canLeaveStep ? (
                <span className="sch-missing">Still needs {currentStepGaps.join(", ")}.</span>
              ) : (
                editorStep === 4 &&
                !canSave && (
                  <span className="sch-missing">
                    Still needs {missing.join(", ")} —{" "}
                    <button
                      type="button"
                      className="sch-linkish"
                      onClick={() => setEditorStep(firstIncompleteStep)}
                    >
                      go fix it
                    </button>
                    .
                  </span>
                )
              )}
            </div>
          </div>
        </>
      )}

      {/* ---- vendor check modal -------------------------------------- */}
      {checkOpen && (
        <>
          <div className="sch-scrim" onClick={() => setCheckOpen(false)} />
          <div className="sch-modal" role="dialog" aria-modal="true">
            <div className="sch-modal-head">
              <div>
                <h2>Check a vendor</h2>
                <p>What reaches them, and what a line would actually give. Nothing is saved.</p>
              </div>
              <button
                type="button"
                className="sch-x"
                onClick={() => setCheckOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="sch-modal-body">
              <VendorCheck products={products} itemNameOf={itemNameOf} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * "What does this vendor get, and why?" — the first question anyone asks about
 * an unexpected giveaway. Also dry-runs the engine over a draft line so a scheme
 * can be verified before it goes near a real order.
 */
function VendorCheck({
  products,
  itemNameOf,
}: {
  products: CatalogueItem[];
  itemNameOf: (itemCode: string) => string;
}) {
  const [cardCode, setCardCode] = useState("");
  const [category, setCategory] = useState("");
  const [applicable, setApplicable] = useState<ApplicableScheme[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState("");

  // A single draft line, enough to exercise the ratio and the combo path.
  const [itemCode, setItemCode] = useState("");
  const [qty, setQty] = useState("");
  const [comboFreeItem, setComboFreeItem] = useState("");
  const [comboFreeQty, setComboFreeQty] = useState("");
  const [proposals, setProposals] = useState<SchemeProposal[] | null>(null);

  // The dry-run half is a second, optional step — it stays folded away until
  // someone actually wants to test a line.
  const [showDryRun, setShowDryRun] = useState(false);

  const check = async () => {
    if (!cardCode.trim()) return;
    setIsChecking(true);
    setError("");
    setProposals(null);
    try {
      setApplicable(await schemeService.applicable(cardCode.trim(), category));
    } catch (err) {
      console.error("Error checking vendor:", err);
      setError(apiErrorText(err, "Could not check this vendor"));
      setApplicable(null);
    } finally {
      setIsChecking(false);
    }
  };

  const runPreview = async () => {
    if (!cardCode.trim() || !itemCode.trim()) return;
    setIsChecking(true);
    setError("");
    try {
      const lines = [
        { item_code: itemCode.trim(), category, qty: Number(qty) || 0 },
        // The zero-priced companion a 1+1 auto-adds. Present only when filled in,
        // so a plain single-FG check stays a single line.
        ...(comboFreeItem.trim()
          ? [
              {
                item_code: comboFreeItem.trim(),
                category,
                qty: Number(comboFreeQty) || 0,
                is_auto_free: true,
                combo_source_code: itemCode.trim(),
              },
            ]
          : []),
      ];
      const response = await schemeService.preview(cardCode.trim(), category, lines);
      setProposals(response.proposals);
    } catch (err) {
      console.error("Error running preview:", err);
      setError(apiErrorText(err, "Could not run the preview"));
      setProposals(null);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <>
      <section className="sch-section">
        <div className="sch-grid">
          <div>
            <label className="sch-label">Vendor card code</label>
            <input
              className="sch-input"
              value={cardCode}
              onChange={(e) => setCardCode(e.target.value)}
              placeholder="CUSTA000123"
            />
          </div>
          <div>
            <label className="sch-label">Category</label>
            <select
              className="sch-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="sch-btn-primary"
            disabled={!cardCode.trim() || isChecking}
            onClick={check}
          >
            {isChecking ? "Checking..." : "What do they get?"}
          </button>
          <button type="button" className="sch-btn" onClick={() => setShowDryRun((p) => !p)}>
            {showDryRun ? "Hide line test" : "Test a line"}
          </button>
        </div>

        {error && (
          <div className="sch-notice error" style={{ marginTop: "14px", marginBottom: 0 }}>
            <span>{error}</span>
          </div>
        )}

        {applicable && (
          <div style={{ marginTop: "18px" }}>
            {applicable.length === 0 ? (
              <div className="sch-hint">No scheme reaches this vendor.</div>
            ) : (
              <>
                <div className="sch-hint" style={{ marginBottom: "10px" }}>
                  Treated as state <strong>{applicable[0].context.state_code || "—"}</strong>, main
                  group <strong>{applicable[0].context.main_group || "—"}</strong>.
                </div>
                {applicable.map((scheme) => (
                  <div key={scheme.scheme_id} className="sch-result">
                    <div className="sch-result-title">
                      {scheme.name}
                      {scheme.category && <span className="sch-chip green">{scheme.category}</span>}
                      <span className="sch-chip blue">
                        because of {describeScope({
                          scope_type: scheme.granted_by.scope_type,
                          scope_value: scheme.granted_by.scope_value,
                          category: "",
                        })}
                      </span>
                    </div>
                    <div className="sch-result-line">
                      {scheme.triggers.map((t) => describeTrigger(t, itemNameOf)).join(" · ")}
                    </div>
                    <div className="sch-result-line give">
                      {scheme.benefits.map((b) => describeBenefit(b, itemNameOf)).join(" · ")}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </section>

      {showDryRun && (
        <section className="sch-section">
          <div className="sch-block-title">Test one order line</div>
          <div className="sch-grid">
            <div>
              <label className="sch-label">Product ordered</label>
              <ItemPicker
                value={itemCode}
                products={products}
                onChange={setItemCode}
                placeholder="search the product..."
              />
            </div>
            <div>
              <label className="sch-label">How many</label>
              <input
                type="number"
                min="0"
                className="sch-input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="10"
              />
            </div>
            <div>
              <label className="sch-label">Combo free item</label>
              <ItemPicker
                value={comboFreeItem}
                products={products}
                onChange={setComboFreeItem}
                placeholder="1+1 only..."
                allowClear
                clearLabel="not a combo"
              />
            </div>
            <div>
              <label className="sch-label">Combo free qty</label>
              <input
                type="number"
                min="0"
                className="sch-input"
                value={comboFreeQty}
                onChange={(e) => setComboFreeQty(e.target.value)}
                placeholder="1+1 only"
              />
            </div>
          </div>

          <div style={{ marginTop: "14px" }}>
            <button
              type="button"
              className="sch-btn-primary"
              disabled={!cardCode.trim() || !itemCode.trim() || isChecking}
              onClick={runPreview}
            >
              {isChecking ? "Running..." : "Run the test"}
            </button>
            {!cardCode.trim() && (
              <span className="sch-hint" style={{ marginLeft: "10px" }}>
                Enter a card code above first.
              </span>
            )}
          </div>

          {proposals && (
            <div style={{ marginTop: "18px" }}>
              {proposals.length === 0 ? (
                <div className="sch-hint">Nothing fires on this line.</div>
              ) : (
                proposals.map((proposal, index) => (
                  <div key={index} className="sch-result">
                    <div className="sch-result-title">{proposal.scheme_name}</div>
                    <div className="sch-result-line">
                      {proposal.qty_is_user_supplied ? (
                        <>
                          Applies, but has no rule — <strong>the quantity is typed by hand</strong>.
                        </>
                      ) : (
                        <>
                          On {proposal.qualifying_qty} ordered →{" "}
                          <strong>
                            {proposal.qty} {proposal.free_uom.toLowerCase()} of{" "}
                            {itemNameOf(proposal.benefit_item_code)}
                          </strong>{" "}
                          free
                        </>
                      )}
                    </div>
                    <div className="sch-result-meta">
                      because of{" "}
                      {describeScope({
                        scope_type: proposal.scope_type,
                        scope_value: proposal.scope_value,
                        category: "",
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
