/**
 * Combo Mapping — which product a "A + B" combo pack gives away.
 *
 * A combo is named "A + B" and carries B free of cost. Mapping it to the paid
 * product and the free product is what lets Add Sales split it into a priced
 * line and a zero-priced one with the same number of pieces.
 *
 * The editor is inline under the row, not a dialog: the suggestion list is
 * scored against the combo's NAME (the half after the "+" for the free item,
 * before it for the paid one), and seeing the name it is matching against is
 * the whole point of picking from a list rather than typing a code.
 */
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlinePuzzlePiece } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FilterBar,
  FilterCheckbox,
  FilterCount,
  FilterSearch,
  FilterSpacer,
} from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/form";
import { Card, EmptyState, Notice, Page, PageHeader } from "@/components/ui/page";
import { SegmentedControl } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { cn } from "@/lib/utils";

import { useSapProducts } from "../lib/sapQueries";
import { userService } from "../services/userService";
import type { ComboMapping } from "../services/userService";

type CatalogueProduct = {
  item_code: string;
  item_name: string;
  category: string;
  sal_factor2?: string | number | null;
};

const asText = (value: unknown) => String(value ?? "").trim();
const comboKey = (combo: Pick<ComboMapping, "item_code" | "category">) =>
  `${combo.item_code}||${combo.category}`;

/** The half of a combo name that names the free product: everything after "+". */
const freeHalfOf = (itemName: string) => asText(itemName.split("+").slice(1).join("+"));

/** The half that names the paid product: everything before the first "+". */
const parentHalfOf = (itemName: string) => asText(itemName.split("+")[0] || "");

/** Which half of the combo the product list is currently choosing for. */
type PickerTarget = "parent" | "free";

const TARGETS = [
  { value: "parent", label: "Parent (paid)" },
  { value: "free", label: "Free" },
] as const;

/** Stable empty, so `visibleCombos` settles. */
const NO_COMBOS: ComboMapping[] = [];

const COL_LABEL = "mb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle";
const COL_NAME = "text-[13.5px] font-semibold text-ink";
const COL_SUB = "mt-0.5 text-[12px] text-subtle";

export default function Combo_Mapping() {
  const queryClient = useQueryClient();
  const {
    data: combos = NO_COMBOS,
    isPending: isLoading,
    isError: combosFailed,
  } = useQuery({
    queryKey: ["combo-mappings"],
    queryFn: () => userService.getComboMappings(),
  });
  const loadError = combosFailed
    ? "Could not load combo packs. Check that you are signed in and try again."
    : "";

  /* Shared ["sap","products"] key. The filter is this page's own business: a
     combo can never be its own free half, so combos stay out of the picker. */
  const { items: allProducts } = useSapProducts();
  const products = useMemo(
    () =>
      (allProducts as unknown as CatalogueProduct[]).filter(
        (p) => !asText(p.item_name).includes("+"),
      ),
    [allProducts],
  );
  const [search, setSearch] = useState("");
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false);

  // Editor state for the one combo currently open.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftParentItem, setDraftParentItem] = useState("");
  const [draftFreeItem, setDraftFreeItem] = useState("");
  // One product list serves both halves; this says which one a click fills.
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>("parent");
  const [draftQty, setDraftQty] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<ComboMapping | null>(null);
  const pickerInputRef = useRef<HTMLInputElement>(null);

  const loadCombos = () => queryClient.invalidateQueries({ queryKey: ["combo-mappings"] });

  const visibleCombos = useMemo(() => {
    const term = search.trim().toLowerCase();
    return combos.filter((combo) => {
      if (showUnmappedOnly && combo.parent_item_code && combo.free_item_code) return false;
      if (!term) return true;
      return (
        combo.item_name?.toLowerCase().includes(term) ||
        combo.item_code.toLowerCase().includes(term) ||
        combo.category.toLowerCase().includes(term) ||
        (combo.free_item?.item_name || "").toLowerCase().includes(term) ||
        (combo.free_item_code || "").toLowerCase().includes(term) ||
        (combo.parent_item?.item_name || "").toLowerCase().includes(term) ||
        (combo.parent_item_code || "").toLowerCase().includes(term)
      );
    });
  }, [combos, search, showUnmappedOnly]);

  const mappedCount = combos.filter(
    (combo) => combo.parent_item_code && combo.free_item_code,
  ).length;

  // Products whose name shares words with the combo's post-"+" half float to the
  // top, so the likely free item is the first thing in the list.
  const pickerResults = useMemo(() => {
    const combo = combos.find((c) => comboKey(c) === editingKey);
    const term = pickerSearch.trim().toLowerCase();

    const matches = term
      ? products.filter(
          (p) =>
            p.item_name?.toLowerCase().includes(term) || p.item_code?.toLowerCase().includes(term),
        )
      : products;

    if (term || !combo) return matches.slice(0, 60);

    const hintWords = (
      pickerTarget === "parent"
        ? parentHalfOf(combo.item_name || "")
        : freeHalfOf(combo.item_name || "")
    )
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2 && !/^\d+$/.test(word));

    const score = (product: CatalogueProduct) => {
      const name = (product.item_name || "").toLowerCase();
      return hintWords.reduce((sum, word) => sum + (name.includes(word) ? 1 : 0), 0);
    };

    return [...matches]
      .map((product) => ({ product, score: score(product) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map((entry) => entry.product);
  }, [combos, editingKey, pickerSearch, pickerTarget, products]);

  const openEditor = (combo: ComboMapping) => {
    setEditingKey(comboKey(combo));
    setDraftParentItem(combo.parent_item_code || "");
    setDraftFreeItem(combo.free_item_code || "");
    setPickerTarget("parent");
    setDraftQty(combo.free_qty_per_unit != null ? String(combo.free_qty_per_unit) : "");
    setPickerSearch("");
    window.setTimeout(() => pickerInputRef.current?.focus(), 0);
  };

  const closeEditor = () => {
    setEditingKey(null);
    setDraftParentItem("");
    setDraftFreeItem("");
    setPickerTarget("parent");
    setDraftQty("");
    setPickerSearch("");
  };

  const save = async (combo: ComboMapping, parentItemCode: string, freeItemCode: string) => {
    const key = comboKey(combo);
    setSavingKey(key);
    try {
      const response = await userService.saveComboMapping({
        item_code: combo.item_code,
        category: combo.category,
        parent_item_code: parentItemCode,
        free_item_code: freeItemCode,
        free_qty_per_unit: draftQty.trim() ? Number(draftQty) : null,
      });
      showToast({ title: response?.message || "Mapping saved", message: combo.item_name });
      closeEditor();
      await loadCombos();
    } catch (error) {
      console.error("Error saving combo mapping:", error);
      showToast({
        title: "Could not save the mapping",
        message: messageFrom(error, "The server refused the request."),
      });
    } finally {
      setSavingKey(null);
    }
  };

  const clearMapping = async (combo: ComboMapping) => {
    const key = comboKey(combo);
    setSavingKey(key);
    try {
      const response = await userService.saveComboMapping({
        item_code: combo.item_code,
        category: combo.category,
        parent_item_code: "",
        free_item_code: "",
        free_qty_per_unit: null,
      });
      showToast({ title: response?.message || "Mapping cleared", message: combo.item_name });
      setConfirmClear(null);
      closeEditor();
      await loadCombos();
    } catch (error) {
      console.error("Error clearing combo mapping:", error);
      showToast({
        title: "Could not clear the mapping",
        message: messageFrom(error, "The server refused the request."),
      });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Schemes" }, { label: "Combo Mapping" }]} />

      <PageHeader
        title="Combo Mapping"
        description='A combo pack is named "A + B" and carries B free of cost. Map each combo to the product it gives away — adding the combo to a sales order then adds a zero-priced line for that product with the same number of pieces.'
      />

      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Combo, paid item or free item"
          fieldClassName="min-w-[260px]"
        />
        <FilterCheckbox
          label="Unmapped only"
          checked={showUnmappedOnly}
          onChange={(event) => setShowUnmappedOnly(event.target.checked)}
        />
        <FilterSpacer />
        {!isLoading && !loadError ? (
          <FilterCount>
            {mappedCount} of {combos.length} mapped
          </FilterCount>
        ) : null}
      </FilterBar>

      {isLoading ? (
        <Card className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </Card>
      ) : loadError ? (
        <Card>
          <EmptyState icon={HiOutlinePuzzlePiece} title="Could not load combo packs" hint={loadError} />
        </Card>
      ) : visibleCombos.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlinePuzzlePiece}
            title={combos.length === 0 ? "No combo packs yet" : "No combo packs match this filter"}
            hint={
              combos.length === 0
                ? "A combo appears here once it is assigned to at least one party."
                : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {visibleCombos.map((combo, index) => {
            const key = comboKey(combo);
            const isEditing = editingKey === key;
            const isSaving = savingKey === key;
            // Both halves or neither -- the API refuses a half-filled mapping
            // because ordering needs a parent to price and a free item to give.
            const bothHalvesChosen = Boolean(draftParentItem && draftFreeItem);
            const mapped = Boolean(combo.parent_item_code && combo.free_item_code);

            return (
              <div
                key={key}
                className={cn(index > 0 && "border-t border-line", isEditing && "bg-brand-soft/30")}
              >
                <div className="grid gap-4 px-4 py-3.5 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-start">
                  <div className="min-w-0">
                    <div className={COL_LABEL}>Combo</div>
                    <div className={COL_NAME}>{combo.item_name}</div>
                    <div className={COL_SUB}>
                      {combo.item_code} · {combo.category} · {combo.party_count}{" "}
                      {combo.party_count === 1 ? "party" : "parties"}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className={COL_LABEL}>Parent (paid) item</div>
                    {combo.parent_item_code ? (
                      <>
                        <div className={cn(COL_NAME, "text-[13px]")}>
                          {combo.parent_item?.item_name ||
                            `${combo.parent_item_code} (not in SAP)`}
                        </div>
                        <div className={COL_SUB}>{combo.parent_item_code} · priced line</div>
                      </>
                    ) : (
                      <Badge tone="hold">Not mapped</Badge>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className={COL_LABEL}>Free item</div>
                    {combo.free_item_code ? (
                      <>
                        <div className={cn(COL_NAME, "text-[13px] text-ok")}>
                          {combo.free_item?.item_name || `${combo.free_item_code} (not in SAP)`}
                        </div>
                        <div className={COL_SUB}>
                          {combo.free_item_code} ·{" "}
                          {combo.free_qty_per_unit
                            ? `${combo.free_qty_per_unit} free per piece`
                            : "same pieces as the combo"}
                        </div>
                      </>
                    ) : (
                      <Badge tone="hold">Not mapped</Badge>
                    )}
                    {combo.is_partially_mapped && (
                      <p className="m-0 mt-1.5 text-[11.5px] text-hold">
                        Only {combo.mapped_party_count} of {combo.party_count} parties carry this
                        mapping. Saving applies it to all of them.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-1.5 md:justify-end">
                    <Button
                      size="sm"
                      variant={mapped && !isEditing ? "ghost" : "secondary"}
                      onClick={() => (isEditing ? closeEditor() : openEditor(combo))}
                      disabled={isSaving}
                    >
                      {isEditing ? "Cancel" : mapped ? "Change" : "Map"}
                    </Button>
                    {combo.free_item_code && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setConfirmClear(combo)}
                        disabled={isSaving}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="space-y-3 border-t border-line bg-surface px-4 py-4">
                    {/* Two halves, picked one at a time from the list below.
                        Nothing is pre-selected: the names are inconsistent
                        enough that a guess is wrong often enough to matter. */}
                    <div className="flex flex-wrap items-center gap-3">
                      <SegmentedControl
                        aria-label="Which half to pick"
                        value={pickerTarget}
                        onChange={(target) => {
                          setPickerTarget(target);
                          setPickerSearch("");
                          window.setTimeout(() => pickerInputRef.current?.focus(), 0);
                        }}
                        options={TARGETS}
                      />
                      <span className="text-[12.5px] text-subtle">
                        Paid:{" "}
                        <strong className="font-semibold text-ink">
                          {draftParentItem || "not selected"}
                        </strong>
                        {" · "}Free:{" "}
                        <strong className="font-semibold text-ink">
                          {draftFreeItem || "not selected"}
                        </strong>
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Input
                        ref={pickerInputRef}
                        type="search"
                        value={pickerSearch}
                        onChange={(event) => setPickerSearch(event.target.value)}
                        aria-label="Search products"
                        placeholder={`Search the ${
                          pickerTarget === "parent" ? "paid (parent)" : "free"
                        } product — suggestions match "${
                          (pickerTarget === "parent"
                            ? parentHalfOf(combo.item_name || "")
                            : freeHalfOf(combo.item_name || "")) || combo.item_name
                        }"`}
                        className="min-w-[260px] flex-1"
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draftQty}
                        onChange={(event) => setDraftQty(event.target.value)}
                        aria-label="Free per piece"
                        placeholder="Free per piece (blank = 1)"
                        className="w-56"
                      />
                    </div>

                    <div
                      role="listbox"
                      aria-label="Products"
                      className="max-h-72 overflow-y-auto rounded-sm border border-line bg-card"
                    >
                      {pickerResults.length === 0 ? (
                        <p className="m-0 px-3 py-4 text-center text-[12.5px] text-subtle">
                          No suggestions. Type a product name or item code to search.
                        </p>
                      ) : (
                        pickerResults.map((product) => {
                          const activeValue =
                            pickerTarget === "parent" ? draftParentItem : draftFreeItem;
                          const isChosen = activeValue === product.item_code;
                          return (
                            <button
                              key={`${product.item_code}-${product.category}`}
                              type="button"
                              role="option"
                              aria-selected={isChosen}
                              onClick={() =>
                                pickerTarget === "parent"
                                  ? setDraftParentItem(product.item_code)
                                  : setDraftFreeItem(product.item_code)
                              }
                              className={cn(
                                "appearance-none border-0 bg-transparent [font-family:inherit] cursor-pointer",
                                "flex w-full flex-wrap items-baseline gap-x-2 border-b border-line px-3 py-2 text-left text-[13px] last:border-b-0",
                                "hover:bg-surface focus-visible:outline-none focus-visible:shadow-focus",
                                isChosen ? "bg-brand-soft font-semibold text-brand" : "text-body",
                              )}
                            >
                              <span>{product.item_name}</span>
                              <span className="text-[11.5px] text-subtle">
                                {product.item_code} · {product.category}
                                {product.sal_factor2
                                  ? ` · ${Number(product.sal_factor2)} per box`
                                  : ""}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="primary"
                        onClick={() => save(combo, draftParentItem, draftFreeItem)}
                        disabled={!bothHalvesChosen || isSaving}
                      >
                        {isSaving ? "Saving…" : "Save mapping"}
                      </Button>
                      <span className="text-[12.5px] text-subtle">
                        {bothHalvesChosen
                          ? `Splits into ${draftParentItem} + ${draftFreeItem} for all ${
                              combo.party_count
                            } ${combo.party_count === 1 ? "party" : "parties"}`
                          : !draftParentItem && !draftFreeItem
                            ? "Pick the paid product, then the one it gives away"
                            : !draftParentItem
                              ? "Still needs the paid (parent) product"
                              : "Still needs the free product"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <Dialog
        open={confirmClear !== null}
        onOpenChange={(next) => {
          if (!next && savingKey === null) setConfirmClear(null);
        }}
      >
        {confirmClear ? (
          <DialogContent title="Clear mapping" size="sm">
            <DialogHeader>
              <DialogTitle>Clear {confirmClear.item_name}?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Notice tone="hold">
                The parent and free item are removed for all {confirmClear.party_count}{" "}
                {confirmClear.party_count === 1 ? "party" : "parties"}. Adding this combo to an
                order will no longer add a free line until it is mapped again.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirmClear(null)} disabled={savingKey !== null}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void clearMapping(confirmClear)}
                disabled={savingKey !== null}
              >
                {savingKey !== null ? "Working…" : "Clear mapping"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </Page>
  );
}
