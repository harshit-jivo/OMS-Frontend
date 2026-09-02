/**
 * Everything the Scheme Manager page KNOWS, with nothing it draws.
 *
 * Split out of `Scheme_Manager.tsx` (Phase 4), the same way `useSalesOrderForm`
 * was split out of `Add_Sales.tsx` — a MOVE, not a rewrite: the state, effects,
 * derivations and handlers below are the same code in the same order, lifted
 * out whole. Anything that returns JSX stayed behind, in `Scheme_Manager.tsx`
 * and the sibling `components/`.
 *
 * Already used `useQuery` for the scheme list before this split (Phase 3.1) —
 * that query, and its `applied`-filters-as-key mechanism, is preserved exactly.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { schemeService } from "@/services/schemeService";
import type {
  Scheme,
  SchemeAssignment,
  SchemeBenefit,
  SchemeTrigger,
  SchemeWritePayload,
  ScopeType,
} from "@/services/schemeService";
import { emptyBenefit, emptyScheme, emptyTrigger } from "@/services/schemeService";
import { useMainGroups, useStates } from "@/lib/authQueries";
import { useSapParties, useSapProducts } from "@/lib/sapQueries";

import { CATEGORIES, apiErrorText, isFinishedGood } from "./schemeManagerHelpers";
import type { CatalogueItem, PartyOption } from "./types";

/** Stable empty, so the list memos settle. */
const NO_SCHEMES: Scheme[] = [];

export function useSchemeManager() {
  const queryClient = useQueryClient();
  /*
   * The COMMITTED filters. Search is applied on Enter/blur, not per keystroke —
   * which is exactly why `loadSchemes` needed its `overrides` parameter: the
   * state setters had not flushed when it was called from the same onChange.
   * With the committed filters as the key, that mechanism disappears.
   */
  const [applied, setApplied] = useState({ search: "", category: "", includeInactive: false });
  const {
    data: schemes = NO_SCHEMES,
    isPending: isLoading,
    isError: schemesFailed,
  } = useQuery({
    queryKey: ["schemes", "list", applied],
    queryFn: () =>
      schemeService.list({
        search: applied.search,
        category: applied.category,
        include_inactive: applied.includeInactive,
      }),
  });
  const loadError = schemesFailed
    ? "Could not load schemes. Check that you are signed in and try again."
    : "";
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Reference data for the "who gets it" pickers.

  /** Apply filters and re-read. `overrides` kept for the existing call sites. */
  const loadSchemes = async (
    overrides: { search?: string; includeInactive?: boolean; category?: string } = {},
  ) => {
    setApplied({
      search: overrides.search ?? search,
      category: overrides.category ?? categoryFilter,
      includeInactive: overrides.includeInactive ?? includeInactive,
    });
    await queryClient.invalidateQueries({ queryKey: ["schemes", "list"] });
  };

  /* The four reference lookups, all shared keys. Each was its own mount IIFE
     with a `console.error`-only catch, and `sapService.getProducts` was
     unwrapped three different ways across this page, Combo_Mapping and Status —
     `asList` in sapQueries settles that in one place now. */
  const { states } = useStates();
  const { items: mainGroups } = useMainGroups();
  const { items: rawParties } = useSapParties();
  const parties = rawParties as unknown as PartyOption[];

  const { items: rawProducts } = useSapProducts();
  const products = useMemo(() => {
    // Finished goods only. The catalogue also carries PM (packing material),
    // RM (raw material), CG and SC — about two thirds of it — and none of those
    // can be sold, so none can trigger a scheme or be given away. Also
    // de-duplicated: the same item_code exists once per category, and a scheme
    // matches on the code alone.
    const seen = new Set<string>();
    return (rawProducts as unknown as CatalogueItem[]).filter((p) => {
      if (!isFinishedGood(p.item_code) || seen.has(p.item_code)) return false;
      seen.add(p.item_code);
      return true;
    });
  }, [rawProducts]);

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

  return {
    // list + filters
    schemes,
    isLoading,
    loadError,
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    includeInactive,
    setIncludeInactive,
    loadSchemes,
    notice,
    setNotice,

    // reference data
    states,
    mainGroups,
    parties,
    products,
    itemNameOf,
    targetOptions,

    // list interaction
    expandedId,
    setExpandedId,
    deactivate,
    deleteScheme,

    // vendor-check modal
    checkOpen,
    setCheckOpen,

    // editor
    editingId,
    editingScheme,
    draft,
    isSaving,
    showAdvanced,
    setShowAdvanced,
    editorStep,
    setEditorStep,
    openNew,
    openEdit,
    closeEditor,
    patchDraft,
    patchTrigger,
    patchBenefit,
    patchAssignment,
    EDITOR_STEPS,
    gapsByStep,
    missing,
    canSave,
    currentStepGaps,
    canLeaveStep,
    firstIncompleteStep,
    goToStep,
    saveScheme,
  };
}

export type SchemeManagerState = ReturnType<typeof useSchemeManager>;
