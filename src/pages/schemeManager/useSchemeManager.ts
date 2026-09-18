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
import { useMemo, useState } from "react";
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
import { showToast } from "@/lib/toastStore";

import { productOptions } from "./components/productOptions";
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
  /*
   * Feedback splits by what happens to the row.
   *
   * A failure is a toast: it used to be a banner on the PAGE, which the
   * editor's scrim was covering at exactly the moment a save failed — the
   * modal stayed open, the reason sat behind it. A success after deleting or
   * turning off stays a banner (`Notice` tone `ok`): the scheme it is about
   * has just left the list, so the banner is the only confirmation left.
   */
  const [notice, setNotice] = useState<string | null>(null);
  const fail = (title: string, error: unknown) => {
    console.error(title, error);
    showToast({ title, message: apiErrorText(error, "The server refused the request.") });
  };

  /*
   * The two destructive actions ask first. They used `window.confirm`, which
   * the design system retired: the page renders a Dialog from `pending` and
   * calls `confirmPending`.
   */
  const [pending, setPending] = useState<{ kind: "deactivate" | "delete"; scheme: Scheme } | null>(
    null,
  );
  const [isConfirming, setIsConfirming] = useState(false);

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

  // The same catalogue as picker rows, built once rather than per render of
  // a modal with five pickers in it.
  const allItemOptions = useMemo(() => productOptions(products), [products]);

  // Item codes are what the engine matches on, but nobody reads them — every
  // list on this page shows the product name instead.
  const itemNameOf = useMemo(() => {
    const byCode = new Map(products.map((p) => [p.item_code, p.item_name]));
    return (itemCode: string) => byCode.get(itemCode) || itemCode;
  }, [products]);

  // Editor — `null` means closed, `0` means "new scheme".
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<SchemeWritePayload>(emptyScheme());

  /*
   * The picker list, narrowed to the scheme's own category.
   *
   * A scheme is written for ONE category, and the editor asks for it in step
   * 1 — but every product picker after that offered the whole catalogue, so
   * setting up a MART offer meant scrolling past OIL and BEVERAGES products
   * that the engine would refuse to match anyway. Worse, nothing stopped you
   * picking one: `resolve_schemes` walls schemes off by category, so a
   * cross-category trigger produced a scheme that silently never fired.
   *
   * "Every category" (a blank draft.category) keeps the full list, which is
   * what that option means.
   */
  const itemOptions = useMemo(() => {
    const wanted = (draft.category || "").trim().toUpperCase();
    if (!wanted) return allItemOptions;
    const inCategory = new Set(
      products
        .filter((p) => (p.category || "").trim().toUpperCase() === wanted)
        .map((p) => p.item_code),
    );
    // Fall back to the whole catalogue rather than showing an empty picker:
    // a category with no products mapped is a data gap, and hiding every
    // option would look like the page is broken.
    if (inCategory.size === 0) return allItemOptions;
    return allItemOptions.filter((option) => inCategory.has(option.value));
  }, [allItemOptions, products, draft.category]);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // The editor is a wizard: one question per screen, so a half-built offer never
  // looks finished. Step 4 reads the whole thing back before it is saved.
  const [editorStep, setEditorStep] = useState(1);

  // One row expanded at a time keeps the list scannable.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);

  // Escape used to be a document listener here. Both modals are `ui/dialog`
  // now, which handles Escape (and the focus trap, and the scroll lock) itself.

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
        showToast({ title: "Saved", message: draft.name });
      } else {
        const created = await schemeService.create(draft);
        showToast({
          title: `${created.code} created`,
          message: draft.assignments.length
            ? "It is live."
            : "It reaches nobody until you say who gets it.",

        });
      }
      closeEditor();
      await loadSchemes();
    } catch (error) {
      fail("Could not save the scheme", error);
    } finally {
      setIsSaving(false);
    }
  };

  const deactivate = (scheme: Scheme) => setPending({ kind: "deactivate", scheme });

  /**
   * Hard delete, straight from the row. The API refuses it when an order line
   * already references the scheme — what was given away has to stay on record —
   * so a refusal is reported as-is and turning it off remains the way out.
   */
  const deleteScheme = (scheme: Scheme) => setPending({ kind: "delete", scheme });

  const confirmPending = async () => {
    if (!pending) return;
    const { kind, scheme } = pending;
    setIsConfirming(true);
    setNotice(null);
    try {
      if (kind === "deactivate") {
        const response = await schemeService.remove(scheme.id);
        setNotice(response.message || `${scheme.name} is off.`);
      } else {
        const response = await schemeService.remove(scheme.id, true);
        if (response.success === false) {
          showToast({
            title: "Cannot delete",
            message:
              response.message ||
              `${response.used_by_order_lines ?? "Some"} order line(s) use this. Turn it off instead.`,

          });
          return;
        }
        if (expandedId === scheme.id) setExpandedId(null);
        setNotice(response.message || `Deleted ${scheme.code}`);
      }
      setPending(null);
      await loadSchemes();
    } catch (error) {
      fail(
        kind === "deactivate" ? "Could not turn the scheme off" : "Could not delete the scheme",
        error,
      );
    } finally {
      setIsConfirming(false);
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
    itemOptions,
    itemNameOf,
    targetOptions,

    // list interaction
    expandedId,
    setExpandedId,
    deactivate,
    deleteScheme,
    pending,
    setPending,
    confirmPending,
    isConfirming,

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
