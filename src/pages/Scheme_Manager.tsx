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

const CATEGORIES = ["OIL", "BEVERAGES", "MART"];

/** Pull the API's message / errors out of an axios rejection without `any`. */
const apiErrorText = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string; errors?: unknown } } })?.response
    ?.data;
  if (data?.errors) return `${fallback}: ${JSON.stringify(data.errors)}`;
  return data?.message || fallback;
};

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

type CatalogueItem = { item_code: string; item_name: string; category?: string };

/**
 * Searchable product picker.
 *
 * Schemes are configured by people who know products by name, not by FG code, so
 * every item field on this page is one of these. The stored value is still the
 * item_code — that is what the engine matches on — but it is never typed.
 */
function ItemPicker({
  value,
  products,
  onChange,
  placeholder = "Search item...",
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
  const [includeInactive, setIncludeInactive] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"schemes" | "check">("schemes");

  // Reference data for the targeting pickers.
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

  // One row expanded at a time keeps the list scannable.
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Targeting panel, one scheme at a time.
  const [targetingId, setTargetingId] = useState<number | null>(null);
  const [assignmentDraft, setAssignmentDraft] = useState<SchemeAssignment>(emptyAssignment());

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
        // The same item_code exists once per category; the picker only needs it
        // once, since a scheme matches on the code alone.
        const seen = new Set<string>();
        setProducts(
          list.filter((p) => {
            if (!p.item_code || seen.has(p.item_code)) return false;
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

  // Close the drawer on Escape — it covers the page, so it needs a way out
  // that is not the mouse.
  useEffect(() => {
    if (editingId === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeEditor();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editingId]);

  // -- editor -------------------------------------------------------------

  const openNew = () => {
    setEditingId(0);
    setDraft(emptyScheme());
    setTargetingId(null);
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
    setTargetingId(null);
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

  const canSave =
    draft.code.trim().length > 0 &&
    draft.name.trim().length > 0 &&
    draft.triggers.length > 0 &&
    draft.benefits.length > 0 &&
    draft.triggers.every((t) => t.match_type === "ALL" || t.match_value.trim().length > 0);

  const saveScheme = async () => {
    setIsSaving(true);
    setNotice(null);
    try {
      if (editingId) {
        await schemeService.update(editingId, draft);
        setNotice({ tone: "ok", text: "Scheme updated" });
      } else {
        const created = await schemeService.create(draft);
        setNotice({
          tone: "ok",
          text: `Scheme created. It reaches nobody until you target it — use "Targeting" on ${created.code}.`,
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
    if (!window.confirm(`Deactivate "${scheme.name}"? It stops applying everywhere, reversibly.`))
      return;
    setNotice(null);
    try {
      const response = await schemeService.remove(scheme.id);
      setNotice({ tone: "ok", text: response.message });
      await loadSchemes();
    } catch (error) {
      console.error("Error deactivating scheme:", error);
      setNotice({ tone: "error", text: apiErrorText(error, "Could not deactivate the scheme") });
    }
  };

  /**
   * Hard delete, straight from the row. The API refuses it when an order line
   * already references the scheme — what was given away has to stay on record —
   * so a refusal is reported as-is and Deactivate remains the way out.
   */
  const deleteScheme = async (scheme: Scheme) => {
    if (
      !window.confirm(
        `Delete "${scheme.name}" permanently? This cannot be undone. If any order has already used it, deactivate it instead.`,
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
            `Cannot delete — ${response.used_by_order_lines ?? "some"} order line(s) use this scheme. Deactivate it instead.`,
        });
        return;
      }
      if (expandedId === scheme.id) setExpandedId(null);
      if (targetingId === scheme.id) setTargetingId(null);
      setNotice({ tone: "ok", text: response.message || `Deleted ${scheme.code}` });
      await loadSchemes();
    } catch (error) {
      console.error("Error deleting scheme:", error);
      setNotice({ tone: "error", text: apiErrorText(error, "Could not delete the scheme") });
    }
  };

  // -- targeting ----------------------------------------------------------

  const openTargeting = (scheme: Scheme) => {
    setTargetingId(targetingId === scheme.id ? null : scheme.id);
    setAssignmentDraft(emptyAssignment());
    setEditingId(null);
    setNotice(null);
  };

  const addAssignment = async (schemeId: number) => {
    if (assignmentDraft.scope_type !== "ALL" && !assignmentDraft.scope_value.trim()) {
      setNotice({ tone: "error", text: "Pick who this scheme should reach." });
      return;
    }
    setNotice(null);
    try {
      await schemeService.saveAssignments(schemeId, assignmentDraft);
      setAssignmentDraft(emptyAssignment());
      await loadSchemes();
      setNotice({ tone: "ok", text: "Targeting saved" });
    } catch (error) {
      console.error("Error saving assignment:", error);
      setNotice({ tone: "error", text: apiErrorText(error, "Could not save the targeting") });
    }
  };

  const removeAssignment = async (schemeId: number, assignment: SchemeAssignment) => {
    if (!assignment.id) return;
    if (!window.confirm(`Remove targeting "${describeScope(assignment)}"?`)) return;
    try {
      await schemeService.removeAssignment(schemeId, assignment.id);
      await loadSchemes();
      setNotice({ tone: "ok", text: "Targeting removed" });
    } catch (error) {
      console.error("Error removing assignment:", error);
      setNotice({ tone: "error", text: apiErrorText(error, "Could not remove the targeting") });
    }
  };

  /** Options for the scope_value picker, by scope type. */
  const scopeOptions = useMemo(() => {
    switch (assignmentDraft.scope_type) {
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
  }, [assignmentDraft.scope_type, states, parties, mainGroups]);

  const editingScheme = editingId ? schemes.find((s) => s.id === editingId) : null;

  const stats = useMemo(() => {
    const active = schemes.filter((s) => s.is_active).length;
    const untargeted = schemes.filter((s) => s.assignments.length === 0).length;
    return { total: schemes.length, active, untargeted };
  }, [schemes]);

  return (
    <div className="sch-page app-page">
      {/* ---- header -------------------------------------------------- */}
      <header className="sch-head">
        <div>
          <span className="app-chip">Offers</span>
          <h1>Schemes</h1>
          <p className="sch-sub">
            Set up an offer, then choose who it reaches. Everything else stays out of the way until
            you open it.
          </p>

          <details className="sch-learn">
            <summary>How a scheme works</summary>
            <div className="sch-learn-body">
              <p>
                A scheme is an offer, and it reaches vendors through <strong>targeting</strong> —
                one row for a single vendor, or one row for an entire state.
              </p>
              <p>
                <strong>Triggers</strong> say what earns it; <strong>benefits</strong> say what is
                given away. For a 1+1 combo, a trigger set to <em>Free (combo) line</em> sizes the
                giveaway off the pack's free half.
              </p>
            </div>
          </details>
        </div>

        <div className="sch-stats">
          <div className="sch-stat">
            <span className="sch-stat-n">{stats.total}</span>
            <span className="sch-stat-l">Listed</span>
          </div>
          <div className="sch-stat">
            <span className="sch-stat-n">{stats.active}</span>
            <span className="sch-stat-l">Active</span>
          </div>
          <div className={`sch-stat${stats.untargeted ? " is-warn" : ""}`}>
            <span className="sch-stat-n">{stats.untargeted}</span>
            <span className="sch-stat-l">Untargeted</span>
          </div>
        </div>
      </header>

      {/* ---- tabs ---------------------------------------------------- */}
      <div className="sch-tabs">
        <button
          type="button"
          className={`sch-tab${tab === "schemes" ? " is-active" : ""}`}
          onClick={() => setTab("schemes")}
        >
          Schemes
        </button>
        <button
          type="button"
          className={`sch-tab${tab === "check" ? " is-active" : ""}`}
          onClick={() => setTab("check")}
        >
          Check a vendor
        </button>
      </div>

      {notice && (
        <div className={`sch-notice ${notice.tone}`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {tab === "schemes" ? (
        <>
          {/* ---- toolbar --------------------------------------------- */}
          <div className="sch-toolbar">
            <div className="sch-search">
              <SearchIcon />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && loadSchemes()}
                placeholder="Search by code or name..."
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
            <button type="button" className="sch-btn" onClick={() => loadSchemes()}>
              Search
            </button>
            <label className="sch-check">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => {
                  setIncludeInactive(event.target.checked);
                  void loadSchemes({ includeInactive: event.target.checked });
                }}
              />
              Include inactive
            </label>
            <div className="sch-toolbar-spacer" />
            <button type="button" className="sch-btn-primary" onClick={openNew}>
              + New scheme
            </button>
          </div>

          {/* ---- list ------------------------------------------------ */}
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
                <p>Create one, then target it at a vendor or a state.</p>
                <button type="button" className="sch-btn-primary" onClick={openNew}>
                  + New scheme
                </button>
              </div>
            ) : (
              schemes.map((scheme) => {
                const grants = scheme.assignments.filter((a) => !a.is_exclusion);
                const exclusions = scheme.assignments.filter((a) => a.is_exclusion);
                const isTargeting = targetingId === scheme.id;
                const isOpen = expandedId === scheme.id;
                const headline = scheme.benefits[0]
                  ? describeBenefit(scheme.benefits[0], itemNameOf)
                  : "No benefit set";
                const earns = scheme.triggers[0]
                  ? describeTrigger(scheme.triggers[0], itemNameOf)
                  : "No trigger set";

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
                        onClick={() => {
                          setExpandedId(isOpen ? null : scheme.id);
                          if (isOpen) setTargetingId(null);
                        }}
                        aria-expanded={isOpen}
                      >
                      <CaretIcon />
                      <div className="sch-row-main">
                        <div className="sch-row-title">
                          <span className="sch-row-name">{scheme.name}</span>
                          <span className="sch-chip code">{scheme.code}</span>
                          {scheme.category ? (
                            <span className="sch-chip green">{scheme.category}</span>
                          ) : (
                            <span className="sch-chip">All categories</span>
                          )}
                          {!scheme.is_active && <span className="sch-chip red">Inactive</span>}
                          {scheme.stackable && <span className="sch-chip blue">Stackable</span>}
                        </div>
                        <div className="sch-row-sum">
                          {earns} → <strong>{headline}</strong>
                          {scheme.benefits.length + scheme.triggers.length > 2
                            ? `  · +${scheme.benefits.length + scheme.triggers.length - 2} more`
                            : ""}
                        </div>
                      </div>
                      <div className="sch-row-side">
                        {scheme.assignments.length === 0 ? (
                          <span className="sch-reach">
                            <i className="sch-dot warn" /> Not targeted
                          </span>
                        ) : (
                          <span className="sch-reach">
                            <i className={`sch-dot${scheme.is_active ? "" : " off"}`} />
                            {grants.length} reach
                            {exclusions.length ? ` · ${exclusions.length} excluded` : ""}
                          </span>
                        )}
                      </div>
                      </button>

                      <div className="sch-row-tools">
                        <button
                          type="button"
                          className="sch-icon-btn"
                          onClick={() => openEdit(scheme)}
                          title="Edit scheme"
                          aria-label={`Edit ${scheme.code}`}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="sch-icon-btn is-danger"
                          onClick={() => deleteScheme(scheme)}
                          title="Delete scheme"
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
                            <div className="sch-block-title">Earns it</div>
                            <ul>
                              {scheme.triggers.map((trigger, i) => (
                                <li key={i}>{describeTrigger(trigger, itemNameOf)}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="sch-block">
                            <div className="sch-block-title">Gives away</div>
                            <ul>
                              {scheme.benefits.map((benefit, i) => (
                                <li key={i} className="give">
                                  {describeBenefit(benefit, itemNameOf)}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="sch-block">
                            <div className="sch-block-title">Reaches</div>
                            <div className="sch-tags">
                              {grants.length === 0 && exclusions.length === 0 ? (
                                <span className="sch-chip amber">Nobody — not targeted yet</span>
                              ) : (
                                <>
                                  {grants.map((assignment) => (
                                    <span key={assignment.id} className="sch-chip blue">
                                      {describeScope(assignment)}
                                    </span>
                                  ))}
                                  {exclusions.map((assignment) => (
                                    <span key={assignment.id} className="sch-chip red">
                                      except {describeScope(assignment)}
                                    </span>
                                  ))}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="sch-block">
                            <div className="sch-block-title">Validity</div>
                            <ul>
                              <li>
                                {scheme.valid_from || scheme.valid_to
                                  ? `${scheme.valid_from || "—"} to ${scheme.valid_to || "—"}`
                                  : "No date limit"}
                              </li>
                              {scheme.priority !== 0 && <li>Priority {scheme.priority}</li>}
                              {scheme.description && <li>{scheme.description}</li>}
                            </ul>
                          </div>
                        </div>

                        <div className="sch-actions">
                          {/* Edit and Delete live on the row header itself. */}
                          <button
                            type="button"
                            className={isTargeting ? "sch-btn sch-btn-sm" : "sch-btn-primary sch-btn-sm"}
                            onClick={() => openTargeting(scheme)}
                          >
                            {isTargeting ? "Close targeting" : `Targeting (${scheme.assignments.length})`}
                          </button>
                          {scheme.is_active && (
                            <button
                              type="button"
                              className="sch-btn-danger sch-btn-sm"
                              onClick={() => deactivate(scheme)}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>

                        {isTargeting && (
                          <div className="sch-target">
                            <div className="sch-target-grid">
                              <div>
                                <label className="sch-label">Reach</label>
                                <select
                                  className="sch-select"
                                  value={assignmentDraft.scope_type}
                                  onChange={(e) =>
                                    setAssignmentDraft((prev) => ({
                                      ...prev,
                                      scope_type: e.target.value as ScopeType,
                                      scope_value: "",
                                    }))
                                  }
                                >
                                  {SCOPE_TYPE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="sch-label">Who</label>
                                {assignmentDraft.scope_type === "ALL" ? (
                                  <input className="sch-input" value="Everyone" disabled />
                                ) : (
                                  <>
                                    <input
                                      className="sch-input"
                                      list={`scope-options-${scheme.id}`}
                                      value={assignmentDraft.scope_value}
                                      onChange={(e) =>
                                        setAssignmentDraft((prev) => ({
                                          ...prev,
                                          scope_value: e.target.value,
                                        }))
                                      }
                                      placeholder="Type to search..."
                                    />
                                    <datalist id={`scope-options-${scheme.id}`}>
                                      {scopeOptions.map((o) => (
                                        <option key={o.value} value={o.value}>
                                          {o.label}
                                        </option>
                                      ))}
                                    </datalist>
                                  </>
                                )}
                              </div>
                              <div>
                                <label className="sch-label">Category (optional)</label>
                                <select
                                  className="sch-select"
                                  value={assignmentDraft.category}
                                  onChange={(e) =>
                                    setAssignmentDraft((prev) => ({ ...prev, category: e.target.value }))
                                  }
                                >
                                  <option value="">All categories</option>
                                  {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="sch-check">
                                  <input
                                    type="checkbox"
                                    checked={assignmentDraft.is_exclusion}
                                    onChange={(e) =>
                                      setAssignmentDraft((prev) => ({
                                        ...prev,
                                        is_exclusion: e.target.checked,
                                      }))
                                    }
                                  />
                                  Exclude instead
                                </label>
                              </div>
                            </div>

                            <div className="sch-hint">
                              {assignmentDraft.is_exclusion
                                ? "Exclusions win at every level — use one to carve a vendor out of a state-wide scheme."
                                : SCOPE_TYPE_OPTIONS.find((o) => o.value === assignmentDraft.scope_type)?.hint}
                            </div>

                            <div style={{ marginTop: "12px" }}>
                              <button
                                type="button"
                                className="sch-btn-primary sch-btn-sm"
                                onClick={() => addAssignment(scheme.id)}
                              >
                                Add targeting
                              </button>
                            </div>

                            {scheme.assignments.length > 0 && (
                              <div className="sch-target-list">
                                <div className="sch-block-title">Current targeting</div>
                                {scheme.assignments.map((assignment) => (
                                  <div key={assignment.id} className="sch-target-row">
                                    <span>
                                      {assignment.is_exclusion && (
                                        <span className="sch-chip red" style={{ marginRight: "8px" }}>
                                          Exclude
                                        </span>
                                      )}
                                      {describeScope(assignment)}
                                      {!assignment.is_active && (
                                        <span className="sch-chip" style={{ marginLeft: "8px" }}>
                                          Inactive
                                        </span>
                                      )}
                                    </span>
                                    <button
                                      type="button"
                                      className="sch-btn-danger sch-btn-sm"
                                      onClick={() => removeAssignment(scheme.id, assignment)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <VendorCheck products={products} itemNameOf={itemNameOf} />
      )}

      {/* ---- editor drawer ------------------------------------------- */}
      {editingId !== null && (
        <>
          <div className="sch-scrim" onClick={closeEditor} />
          <aside className="sch-drawer" role="dialog" aria-modal="true">
            <div className="sch-drawer-head">
              <div>
                <h2>{editingId ? `Edit ${editingScheme?.code ?? "scheme"}` : "New scheme"}</h2>
                <p>The offer first, then what earns it and what it gives away.</p>
              </div>
              <button type="button" className="sch-x" onClick={closeEditor} aria-label="Close">
                ×
              </button>
            </div>

            <div className="sch-drawer-body">
              {/* offer */}
              <section className="sch-section">
                <div className="sch-section-head">
                  <div>
                    <h3>The offer</h3>
                    <p>How this scheme is identified and when it runs.</p>
                  </div>
                </div>

                <div className="sch-grid">
                  <div>
                    <label className="sch-label">Code</label>
                    <input
                      className="sch-input"
                      value={draft.code}
                      onChange={(e) => patchDraft({ code: e.target.value })}
                      placeholder="PB-CP1L-Q4"
                    />
                  </div>
                  <div>
                    <label className="sch-label">Category</label>
                    <select
                      className="sch-select"
                      value={draft.category}
                      onChange={(e) => patchDraft({ category: e.target.value })}
                    >
                      <option value="">Every category</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <div className="sch-hint">
                      An OIL scheme never fires on a MART or BEVERAGES line, however it is
                      targeted.
                    </div>
                  </div>
                  <div>
                    <label className="sch-label">Name</label>
                    <input
                      className="sch-input"
                      value={draft.name}
                      onChange={(e) => patchDraft({ name: e.target.value })}
                      placeholder="1 free pcs on 10 boxes"
                    />
                  </div>
                  <div>
                    <label className="sch-label">Valid from</label>
                    <input
                      type="date"
                      className="sch-input"
                      value={draft.valid_from || ""}
                      onChange={(e) => patchDraft({ valid_from: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label className="sch-label">Valid to</label>
                    <input
                      type="date"
                      className="sch-input"
                      value={draft.valid_to || ""}
                      onChange={(e) => patchDraft({ valid_to: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label className="sch-label">Priority</label>
                    <input
                      type="number"
                      className="sch-input"
                      value={draft.priority}
                      onChange={(e) => patchDraft({ priority: Number(e.target.value) })}
                    />
                    <div className="sch-hint">Higher wins a clash on the same giveaway item.</div>
                  </div>
                  <div className="sch-span-2">
                    <label className="sch-label">Description</label>
                    <input
                      className="sch-input"
                      value={draft.description}
                      onChange={(e) => patchDraft({ description: e.target.value })}
                      placeholder="Optional note for whoever reads this later"
                    />
                  </div>
                  <div className="sch-span-2">
                    <div className="sch-toggles">
                      <label className="sch-check">
                        <input
                          type="checkbox"
                          checked={draft.is_active}
                          onChange={(e) => patchDraft({ is_active: e.target.checked })}
                        />
                        Active
                      </label>
                      <label className="sch-check">
                        <input
                          type="checkbox"
                          checked={draft.stackable}
                          onChange={(e) => patchDraft({ stackable: e.target.checked })}
                        />
                        Stackable (may combine with other schemes)
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              {/* triggers */}
              <section className="sch-section">
                <SectionHead
                  title="Triggers — what earns it"
                  hint="Any one matching trigger qualifies the line."
                  onAdd={() => patchDraft({ triggers: [...draft.triggers, emptyTrigger()] })}
                />
                {draft.triggers.map((trigger, index) => (
                  <div key={index} className="sch-rowbox">
                    <div className="sch-grid tight">
                      <div>
                        <label className="sch-label">Match on</label>
                        <select
                          className="sch-select"
                          value={trigger.match_type}
                          onChange={(e) =>
                            patchTrigger(index, { match_type: e.target.value as MatchType })
                          }
                        >
                          {MATCH_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="sch-label">Value</label>
                        {trigger.match_type === "ITEM" ? (
                          <ItemPicker
                            value={trigger.match_value}
                            products={products}
                            onChange={(itemCode) => patchTrigger(index, { match_value: itemCode })}
                            placeholder="Search the item that earns this..."
                          />
                        ) : (
                          <input
                            className="sch-input"
                            value={trigger.match_type === "ALL" ? "" : trigger.match_value}
                            disabled={trigger.match_type === "ALL"}
                            onChange={(e) => patchTrigger(index, { match_value: e.target.value })}
                            placeholder="OLIVE"
                          />
                        )}
                      </div>
                      <div>
                        <label className="sch-label">Minimum qty</label>
                        <div className="sch-inline">
                          <input
                            type="number"
                            min="0"
                            className="sch-input"
                            value={trigger.min_qty}
                            onChange={(e) => patchTrigger(index, { min_qty: e.target.value })}
                            placeholder="0"
                          />
                          <select
                            className="sch-select"
                            value={trigger.min_uom}
                            onChange={(e) => patchTrigger(index, { min_uom: e.target.value as Uom })}
                          >
                            {UOM_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="sch-label">Quantity counted</label>
                        <select
                          className="sch-select"
                          value={trigger.applies_to}
                          onChange={(e) =>
                            patchTrigger(index, { applies_to: e.target.value as AppliesTo })
                          }
                        >
                          {APPLIES_TO_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="sch-rowbox-foot">
                      <span>{APPLIES_TO_OPTIONS.find((o) => o.value === trigger.applies_to)?.hint}</span>
                      {draft.triggers.length > 1 && (
                        <button
                          type="button"
                          className="sch-btn-danger sch-btn-sm"
                          onClick={() =>
                            patchDraft({ triggers: draft.triggers.filter((_, i) => i !== index) })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </section>

              {/* benefits */}
              <section className="sch-section">
                <SectionHead
                  title="Benefits — what is given away"
                  hint="Leave the item blank to give away the ordered item itself."
                  onAdd={() => patchDraft({ benefits: [...draft.benefits, emptyBenefit()] })}
                />
                {draft.benefits.map((benefit, index) => (
                  <div key={index} className="sch-rowbox">
                    <div className="sch-grid tight">
                      <div>
                        <label className="sch-label">Free item</label>
                        <ItemPicker
                          value={benefit.free_item_code ?? ""}
                          products={products}
                          onChange={(itemCode) => patchBenefit(index, { free_item_code: itemCode })}
                          placeholder="Search the item to give away..."
                          allowClear
                          clearLabel="— same as the ordered item —"
                        />
                      </div>
                      <div>
                        <label className="sch-label">Buy (per)</label>
                        <input
                          type="number"
                          min="0"
                          className="sch-input"
                          value={benefit.per_qty}
                          onChange={(e) => patchBenefit(index, { per_qty: e.target.value })}
                          placeholder="10"
                        />
                      </div>
                      <div>
                        <label className="sch-label">Get free</label>
                        <input
                          type="number"
                          min="0"
                          className="sch-input"
                          value={benefit.free_qty}
                          onChange={(e) => patchBenefit(index, { free_qty: e.target.value })}
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <label className="sch-label">Free unit</label>
                        <select
                          className="sch-select"
                          value={benefit.free_uom}
                          onChange={(e) => patchBenefit(index, { free_uom: e.target.value as Uom })}
                        >
                          {UOM_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="sch-label">Cap (optional)</label>
                        <input
                          type="number"
                          min="0"
                          className="sch-input"
                          value={benefit.max_free_qty ?? ""}
                          onChange={(e) => patchBenefit(index, { max_free_qty: e.target.value })}
                          placeholder="no cap"
                        />
                      </div>
                    </div>
                    <div className="sch-rowbox-foot">
                      <span>{describeBenefit(benefit, itemNameOf)}</span>
                      {draft.benefits.length > 1 && (
                        <button
                          type="button"
                          className="sch-btn-danger sch-btn-sm"
                          onClick={() =>
                            patchDraft({ benefits: draft.benefits.filter((_, i) => i !== index) })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            </div>

            <div className="sch-drawer-foot">
              <button
                type="button"
                className="sch-btn-primary"
                disabled={!canSave || isSaving}
                onClick={saveScheme}
              >
                {isSaving ? "Saving..." : editingId ? "Save changes" : "Create scheme"}
              </button>
              <button type="button" className="sch-btn" onClick={closeEditor}>
                Cancel
              </button>
              {!canSave && (
                <span style={{ fontSize: "12.5px", color: "#b45309" }}>
                  Code, name, and a value for every non-"Any item" trigger are required.
                </span>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionHead({
  title,
  hint,
  onAdd,
}: {
  title: string;
  hint: string;
  onAdd: () => void;
}) {
  return (
    <div className="sch-section-head">
      <div>
        <h3>{title}</h3>
        <p>{hint}</p>
      </div>
      <button type="button" className="sch-btn sch-btn-sm" onClick={onAdd}>
        + Add
      </button>
    </div>
  );
}

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
      <div className="sch-panel">
        <div className="sch-panel-head">
          <h2>What reaches this vendor?</h2>
          <p>
            Every scheme that reaches a vendor, and which targeting rule let it in. Nothing is
            saved.
          </p>
        </div>

        <div className="sch-grid">
          <div>
            <label className="sch-label">Card code</label>
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
            {isChecking ? "Checking..." : "Check vendor"}
          </button>
          <button
            type="button"
            className="sch-btn"
            onClick={() => setShowDryRun((prev) => !prev)}
          >
            {showDryRun ? "Hide line dry-run" : "Dry-run a line"}
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
                  Resolved as state <strong>{applicable[0].context.state_code || "—"}</strong>, main
                  group <strong>{applicable[0].context.main_group || "—"}</strong>.
                </div>
                {applicable.map((scheme) => (
                  <div key={scheme.scheme_id} className="sch-result">
                    <div className="sch-result-title">
                      {scheme.name}
                      <span className="sch-chip code">{scheme.code}</span>
                      {scheme.category && <span className="sch-chip green">{scheme.category}</span>}
                      <span className="sch-chip blue">
                        via {scheme.granted_by.scope_type}
                        {scheme.granted_by.scope_value ? ` ${scheme.granted_by.scope_value}` : ""}
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
      </div>

      {showDryRun && (
        <div className="sch-panel">
          <div className="sch-panel-head">
            <h2>Dry-run a line</h2>
            <p>
              Test one order line against the engine to confirm the quantity before it goes near a
              real order. Uses the card code and category above.
            </p>
          </div>

          <div className="sch-grid">
            <div>
              <label className="sch-label">Item ordered</label>
              <ItemPicker
                value={itemCode}
                products={products}
                onChange={setItemCode}
                placeholder="Search the item to test..."
              />
            </div>
            <div>
              <label className="sch-label">Qty</label>
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
                placeholder="1+1 only — search..."
                allowClear
                clearLabel="— not a combo —"
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
              {isChecking ? "Running..." : "Run dry-run"}
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
                <div className="sch-hint">No scheme fires on this line.</div>
              ) : (
                proposals.map((proposal, index) => (
                  <div key={index} className="sch-result">
                    <div className="sch-result-title">
                      {proposal.scheme_name}
                      <span className="sch-chip code">{proposal.scheme_code}</span>
                    </div>
                    <div className="sch-result-line">
                      {proposal.qty_is_user_supplied ? (
                        <>
                          Applies, but carries no rule — <strong>the user types the quantity</strong>.
                        </>
                      ) : (
                        <>
                          Qualifying {proposal.qualifying_qty} →{" "}
                          <strong>
                            {proposal.qty} {proposal.free_uom} of{" "}
                            {itemNameOf(proposal.benefit_item_code)}
                          </strong>{" "}
                          free
                        </>
                      )}
                    </div>
                    <div className="sch-result-meta">
                      via {proposal.scope_type}
                      {proposal.scope_value ? ` ${proposal.scope_value}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
