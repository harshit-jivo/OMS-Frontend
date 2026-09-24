import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineTrash } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { Card, EmptyState, Notice, SectionHeading } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { API_ORIGIN } from "../../services/api";
import { formatMoney, lineKey, toNumber, type SelectedLine } from "./salesInvoice.utils";
import { apiFetch, hanaUrl, type SalesInvoiceState } from "./useSalesInvoice";
import {
  allocateNearestExpiryBatches,
  availableBatchQty,
  getAllocationQuantity,
  getBatchNumber,
  hasEnoughAllocation,
  holdBatches,
  toSapBatchNumbers,
  type BatchAllocation,
  type BatchDetail,
} from "./batchAllocation";

type Props = {
  state: SalesInvoiceState;
};

type InventoryWarehouse = {
  WhsCode?: string;
  WarehouseCode?: string;
  whs_code?: string;
  "SUM(Quantity)"?: number | string | null;
  Quantity?: number | string | null;
  OnHand?: number | string | null;
  AvailableQty?: number | string | null;
  AvailableQuantity?: number | string | null;
  TotalQty?: number | string | null;
  [key: string]: unknown;
};

type BatchPickerContext = {
  key: string;
  itemCode: string;
  itemName: string;
  whsCode: string;
  quantity: number;
  maxQuantity: number;
};

type BatchAllocationFailure = {
  itemCode: string;
  itemName: string;
  reason: "missing" | "insufficient" | "error";
};

type SkuImageRecord = {
  item_code: string;
  item_image?: string | null;
};

type SkuImageApiResponse = SkuImageRecord[] | { data?: SkuImageRecord[]; results?: SkuImageRecord[] };

const getSkuImageUrl = (imagePath?: string | null) => {
  const path = String(imagePath || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_ORIGIN}${normalizedPath}`;
};

const getSkuCodeKey = (itemCode?: string | null) => String(itemCode || "").trim().toUpperCase();

const unwrapSkuImages = (data: SkuImageApiResponse) => {
  if (Array.isArray(data)) return data;
  return data.data || data.results || [];
};

const formatBatchDate = (value?: string | null) => {
  if (!value) return "-";
  const dateOnly = value.split("T")[0]?.split(" ")[0] || value;
  const [year, month, day] = dateOnly.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
};

const getWarehouseCode = (warehouse: InventoryWarehouse) =>
  String(warehouse.WhsCode ?? warehouse.WarehouseCode ?? warehouse.whs_code ?? "").trim();

const getWarehouseQuantity = (warehouse: InventoryWarehouse) =>
  toNumber(
    warehouse["SUM(Quantity)"]
      ?? warehouse.Quantity
      ?? warehouse.OnHand
      ?? warehouse.AvailableQty
      ?? warehouse.AvailableQuantity
      ?? warehouse.TotalQty,
  );

const getLineDisplayName = (line: Pick<SelectedLine, "ItemCode" | "Dscription">) =>
  line.Dscription || line.ItemCode || "selected item";

const formatFailureNames = (failures: BatchAllocationFailure[]) =>
  failures.map((failure) => failure.itemName || failure.itemCode).join(", ");

const buildBatchApplyError = (whsCode: string, failures: BatchAllocationFailure[]) => {
  const missing = failures.filter((failure) => failure.reason === "missing");
  const insufficient = failures.filter((failure) => failure.reason === "insufficient");
  const errored = failures.filter((failure) => failure.reason === "error");
  const messages: string[] = [];

  if (missing.length > 0) messages.push(`No batches found in ${whsCode} for ${formatFailureNames(missing)}.`);
  if (insufficient.length > 0) messages.push(`Not enough batch quantity in ${whsCode} for ${formatFailureNames(insufficient)}.`);
  if (errored.length > 0) messages.push(`Unable to load batches in ${whsCode} for ${formatFailureNames(errored)}.`);

  return messages.join(" ");
};

function BatchPickerModal({
  context,
  onClose,
  onAutoSelect,
  onQuantityChange,
  reservedBatchQty,
}: {
  context: BatchPickerContext;
  onClose: () => void;
  onAutoSelect: (
    allocations: BatchAllocation[],
    whsCode: string,
    applyToAll?: boolean,
    hasBatches?: boolean,
  ) => void | Promise<void>;
  onQuantityChange: (quantity: number) => void;
  /** Held quantity per batch, keyed by item|warehouse|batch: other in-flight
   * logs plus this invoice's other lines. */
  reservedBatchQty: Map<string, number>;
}) {
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [selectedWhsCode, setSelectedWhsCode] = useState(context.whsCode);
  const [warehouseBatches, setWarehouseBatches] = useState<Record<string, BatchDetail[]>>({});
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [error, setError] = useState("");
  const lastAppliedSignature = useRef("");
  const onAutoSelectRef = useRef(onAutoSelect);
  const shouldApplyWarehouseToAllRef = useRef(false);

  useEffect(() => {
    onAutoSelectRef.current = onAutoSelect;
  }, [onAutoSelect]);

  useEffect(() => {
    lastAppliedSignature.current = "";
    shouldApplyWarehouseToAllRef.current = false;
  }, [context.key, context.itemCode, context.quantity]);

  useEffect(() => {
    let active = true;

    const loadWarehouses = async () => {
      setLoadingWarehouses(true);
      setError("");
      try {
        const data = await apiFetch<InventoryWarehouse[]>(
          hanaUrl(`/api/hana/inventory-details/?item_code=${encodeURIComponent(context.itemCode)}`),
        );
        const nextWarehouses = Array.isArray(data) ? data : [];
        if (!active) return;
        setWarehouses(nextWarehouses);
        setWarehouseBatches({});
        setSelectedWhsCode((current) => {
          const contextWhsCode = String(context.whsCode || "").trim();
          const hasCurrentWarehouse = nextWarehouses.some((warehouse) => getWarehouseCode(warehouse) === current);

          if (contextWhsCode) return contextWhsCode;
          if (current && hasCurrentWarehouse) return current;
          return getWarehouseCode(nextWarehouses[0] || {});
        });
      } catch (err) {
        console.error(err);
        if (active) {
          setWarehouses([]);
          setError("Unable to load warehouse quantities.");
        }
      } finally {
        if (active) setLoadingWarehouses(false);
      }
    };

    loadWarehouses();
    return () => {
      active = false;
    };
  }, [context.itemCode, context.whsCode]);

  const warehouseOptions = useMemo(() => {
    const options = warehouses
      .map((warehouse) => ({ code: getWarehouseCode(warehouse), warehouse }))
      .filter((option) => option.code);
    const contextWhsCode = String(context.whsCode || "").trim();

    if (contextWhsCode && !options.some((option) => option.code === contextWhsCode)) {
      return [{ code: contextWhsCode, warehouse: null }, ...options];
    }

    return options;
  }, [context.whsCode, warehouses]);

  useEffect(() => {
    if (warehouseOptions.length === 0) {
      setWarehouseBatches({});
      return;
    }

    let active = true;

    const loadBatches = async () => {
      setLoadingBatches(true);
      try {
        const entries = await Promise.all(
          warehouseOptions.map(async ({ code: whsCode }) => {
            try {
              const data = await apiFetch<BatchDetail[]>(
                hanaUrl(`/api/hana/batch-details/?item_code=${encodeURIComponent(context.itemCode)}&whs_code=${encodeURIComponent(whsCode)}`),
              );
              return [whsCode, Array.isArray(data) ? data : []] as const;
            } catch (err) {
              console.error(err);
              return [whsCode, []] as const;
            }
          }),
        );
        if (active) setWarehouseBatches(Object.fromEntries(entries));
      } catch (err) {
        console.error(err);
        if (active) setError("Unable to load batch quantities.");
      } finally {
        if (active) setLoadingBatches(false);
      }
    };

    loadBatches();
    return () => {
      active = false;
    };
  }, [context.itemCode, warehouseOptions]);

  const selectedBatches = warehouseBatches[selectedWhsCode] || [];
  const allocations = allocateNearestExpiryBatches(selectedBatches, context.quantity, {
    itemCode: context.itemCode,
    whsCode: selectedWhsCode,
    reserved: reservedBatchQty,
  });
  // What other drafts hold in this warehouse, so a short allocation explains
  // itself instead of just showing a mismatch. Quantity, not a batch count:
  // part of a batch being held no longer takes the whole batch out.
  const held = selectedBatches.reduce(
    (totals, batch) => {
      const stock = toNumber(batch.Quantity);
      if (stock <= 0) return totals;
      const free = availableBatchQty(batch, {
        itemCode: context.itemCode,
        whsCode: selectedWhsCode,
        reserved: reservedBatchQty,
      });
      if (free >= stock) return totals;
      return {
        qty: totals.qty + (stock - free),
        batches: totals.batches + 1,
        exhausted: totals.exhausted + (free <= 0 ? 1 : 0),
      };
    },
    { qty: 0, batches: 0, exhausted: 0 },
  );
  const allocatedQty = getAllocationQuantity(allocations);
  const quantityMatches = Math.abs(allocatedQty - context.quantity) < 0.0001;
  const allocationSignature = `${context.quantity}|${selectedWhsCode}|${allocations
    .map(({ batch, quantity }) => `${getBatchNumber(batch)}:${quantity}`)
    .join("|")}`;

  useEffect(() => {
    if (!selectedWhsCode || loadingBatches) return;
    if (lastAppliedSignature.current === allocationSignature) return;
    lastAppliedSignature.current = allocationSignature;
    const applyToAll = shouldApplyWarehouseToAllRef.current;
    shouldApplyWarehouseToAllRef.current = false;
    void onAutoSelectRef.current(allocations, selectedWhsCode, applyToAll, selectedBatches.length > 0);
  }, [allocationSignature, allocations, loadingBatches, selectedWhsCode]);

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent title="Batch selection" size="lg">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-col">
              <span className="font-mono text-[12px] font-normal text-subtle">
                {context.itemCode}
              </span>
              {context.itemName}
            </span>
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="grid gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
          {/* -- Which warehouse -- */}
          <aside className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <SectionHeading>Warehouse</SectionHeading>
              <span className="text-[11.5px] tabular-nums text-subtle">
                {context.quantity.toLocaleString("en-IN")} required
              </span>
            </div>

            {error && <Notice tone="bad">{error}</Notice>}

            {loadingWarehouses ? (
              <div className="space-y-1.5">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : warehouseOptions.length === 0 ? (
              <p className="m-0 rounded-sm border border-line bg-surface px-3 py-4 text-center text-[12px] text-subtle">
                No warehouse stock found.
              </p>
            ) : (
              <ul className="m-0 max-h-[300px] list-none space-y-1.5 overflow-y-auto p-0">
                {warehouseOptions.map(({ code: whsCode, warehouse }) => {
                  const whsBatches = warehouseBatches[whsCode] || [];
                  const quantity = warehouse ? getWarehouseQuantity(warehouse) : 0;
                  const active = selectedWhsCode === whsCode;
                  return (
                    <li key={whsCode}>
                      <button
                        type="button"
                        /* A selectable card, so the DESIGN_SYSTEM 1.1 reset
                           applies rather than `ui/button`. */
                        className={cn(
                          "flex w-full cursor-pointer appearance-none flex-col gap-0.5 rounded-sm border p-2.5 text-left [font-family:inherit] text-[13px] transition-colors",
                          active
                            ? "border-brand-line bg-brand-soft"
                            : "border-line bg-card hover:bg-surface",
                        )}
                        aria-current={active ? "true" : undefined}
                        onClick={() => {
                          shouldApplyWarehouseToAllRef.current = true;
                          if (selectedWhsCode === whsCode && !loadingBatches) {
                            void onAutoSelectRef.current(
                              allocations,
                              whsCode,
                              true,
                              selectedBatches.length > 0,
                            );
                            return;
                          }
                          setSelectedWhsCode(whsCode);
                        }}
                      >
                        <strong className="font-semibold text-ink">{whsCode}</strong>
                        <span className="text-[11.5px] text-subtle">
                          {loadingBatches ? "..." : whsBatches.length} batches - Qty{" "}
                          {quantity.toLocaleString("en-IN")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* -- What it allocated -- */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <SectionHeading>Batches</SectionHeading>
              <span className="text-[11.5px] text-subtle">
                {selectedWhsCode || "Select a warehouse"}
              </span>
            </div>

            <Field label="Invoice quantity" hint={"At most " + context.maxQuantity + "."}>
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min="1"
                  max={context.maxQuantity}
                  value={context.quantity}
                  className="max-w-[160px] text-right tabular-nums"
                  onChange={(event) => onQuantityChange(toNumber(event.target.value))}
                />
              )}
            </Field>

            {!loadingWarehouses &&
              (selectedWhsCode && loadingBatches ? (
                <Skeleton className="h-20 w-full" aria-label="Loading batch availability" />
              ) : selectedWhsCode && selectedBatches.length === 0 ? (
                <p className="m-0 rounded-sm border border-line bg-surface px-3 py-4 text-center text-[12px] text-subtle">
                  No batches found for this warehouse.
                </p>
              ) : selectedWhsCode ? (
                <>
                  {/*
                    The one thing that must be right before posting: batch
                    quantity has to equal invoice quantity, or SAP rejects the
                    document. Stated as an outcome, not only as a colour.
                  */}
                  <Notice tone={quantityMatches ? "ok" : "bad"}>
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="tabular-nums">
                        Invoice qty {context.quantity.toLocaleString("en-IN")} - batch qty{" "}
                        {allocatedQty.toLocaleString("en-IN")}
                      </span>
                      <strong className="font-semibold">
                        {quantityMatches ? "Quantity matched" : "Quantity mismatch"}
                      </strong>
                    </span>
                  </Notice>

                  {held.qty > 0 && (
                    <p className="m-0 text-[11.5px] text-subtle">
                      {held.qty.toLocaleString("en-IN")} held by invoices awaiting review, across{" "}
                      {held.batches} batch{held.batches === 1 ? "" : "es"}
                      {held.exhausted > 0
                        ? " (" + held.exhausted + " fully taken)"
                        : " - the rest of those batches is still available"}
                      .
                    </p>
                  )}

                  {allocations.length > 0 && (
                    <ul className="m-0 max-h-[220px] list-none space-y-1 overflow-y-auto p-0">
                      {allocations.map(({ batch, quantity }) => (
                        <li
                          className="flex items-center justify-between gap-2 rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12.5px]"
                          key={
                            getBatchNumber(batch) +
                            "-" +
                            batch.WhsCode +
                            "-" +
                            (batch.InDate || "")
                          }
                        >
                          <strong className="font-semibold text-ink">
                            Exp {formatBatchDate(batch.ExpDate)}
                          </strong>
                          <span className="tabular-nums text-body">
                            {quantity.toLocaleString("en-IN")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="m-0 rounded-sm border border-line bg-surface px-3 py-4 text-center text-[12px] text-subtle">
                  Select a warehouse.
                </p>
              ))}
          </section>
        </DialogBody>

        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ContentsTab({ state }: Props) {
  const [batchPickerContext, setBatchPickerContext] = useState<BatchPickerContext | null>(null);
  const [globalWhsCode, setGlobalWhsCode] = useState("");
  const autoAllocatedRef = useRef<Set<string>>(new Set());
  const [skuImageByCode, setSkuImageByCode] = useState<Record<string, string>>({});
  const [warehouseQtyByItemAndWhs, setWarehouseQtyByItemAndWhs] = useState<Record<string, number>>({});
  const [batchApplyError, setBatchApplyError] = useState("");
  const inventoryItemCodesKey = useMemo(() => {
    const itemCodes = state.selectedLineList
      .map((line) => getSkuCodeKey(line.ItemCode))
      .filter(Boolean);
    return [...new Set(itemCodes)].sort().join("|");
  }, [state.selectedLineList]);

  useEffect(() => {
    let active = true;

    const loadSkuImages = async () => {
      try {
        const data = await apiFetch<SkuImageApiResponse>("/api/sku/all/");
        if (!active) return;
        const nextImages = unwrapSkuImages(data).reduce<Record<string, string>>((images, sku) => {
          const key = getSkuCodeKey(sku.item_code);
          const imageUrl = getSkuImageUrl(sku.item_image);
          if (key && imageUrl) images[key] = imageUrl;
          return images;
        }, {});
        setSkuImageByCode(nextImages);
      } catch (err) {
        console.error("Unable to load SKU images for invoice lines:", err);
      }
    };

    loadSkuImages();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const itemCodes = inventoryItemCodesKey.split("|").filter(Boolean);

    if (itemCodes.length === 0) {
      setWarehouseQtyByItemAndWhs({});
      return () => {
        active = false;
      };
    }

    const loadWarehouseQuantities = async () => {
      try {
        const entries = await Promise.all(
          itemCodes.map(async (itemCode) => {
            try {
              const data = await apiFetch<InventoryWarehouse[]>(
                hanaUrl(`/api/hana/inventory-details/?item_code=${encodeURIComponent(itemCode)}`),
              );
              return [itemCode, Array.isArray(data) ? data : []] as const;
            } catch (err) {
              console.error(`Unable to load warehouse quantity for ${itemCode}:`, err);
              return [itemCode, []] as const;
            }
          }),
        );

        if (!active) return;
        const nextWarehouseQty = entries.reduce<Record<string, number>>((lookup, [itemCode, warehouses]) => {
          warehouses.forEach((warehouse) => {
            const whsCode = getWarehouseCode(warehouse);
            if (whsCode) lookup[`${getSkuCodeKey(itemCode)}|${getSkuCodeKey(whsCode)}`] = getWarehouseQuantity(warehouse);
          });
          return lookup;
        }, {});
        setWarehouseQtyByItemAndWhs(nextWarehouseQty);
      } catch (err) {
        console.error("Unable to load warehouse quantities for invoice lines:", err);
      }
    };

    loadWarehouseQuantities();
    return () => {
      active = false;
    };
  }, [inventoryItemCodesKey]);

  /** Other drafts' holds plus what `lines` of this invoice already take. */
  const reservedWith = (lines: SelectedLine[], base = state.reservedBatchQty) =>
    holdBatches(
      base,
      lines.map((line) => ({
        itemCode: line.ItemCode,
        whsCode: line.WhsCode || line.SalesOrderWhsCode,
        batches: line.BatchNumbers,
      })),
    );

  const loadAllocationsForWarehouse = async (
    line: SelectedLine,
    whsCode: string,
    reserved: Map<string, number>,
  ): Promise<{ allocations: BatchAllocation[]; failureReason: BatchAllocationFailure["reason"] | null }> => {
    try {
      const data = await apiFetch<BatchDetail[]>(
        hanaUrl(`/api/hana/batch-details/?item_code=${encodeURIComponent(line.ItemCode)}&whs_code=${encodeURIComponent(whsCode)}`),
      );
      const batches = Array.isArray(data) ? data : [];
      const allocations = allocateNearestExpiryBatches(batches, toNumber(line.invoiceQty), {
        itemCode: line.ItemCode,
        whsCode,
        reserved,
      });
      const failureReason = batches.length === 0
        ? "missing"
        : hasEnoughAllocation(allocations, toNumber(line.invoiceQty))
          ? null
          : "insufficient";

      return { allocations, failureReason } as const;
    } catch (err) {
      console.error(`Unable to load batches for ${line.ItemCode} in ${whsCode}:`, err);
      return { allocations: [], failureReason: "error" } as const;
    }
  };

  // Auto-allocate batches for every line from its sales-order warehouse when the
  // draft loads, so the user doesn't have to open the picker for each line. Lines
  // the user has already filled (BatchNumbers present) are left untouched.
  //
  // The dependency is a stable primitive signature (not the selectedLineList array,
  // which gets a new identity on every line update) so the effect only re-runs when
  // a line's warehouse/quantity/batch-state actually changes. The ref tracks lines
  // already attempted so missing/failed allocations aren't retried in a loop.
  const autoAllocationSignature = state.selectedLineList
    .map((line) => {
      const whsCode = line.WhsCode || line.SalesOrderWhsCode || "";
      const hasBatches = (line.BatchNumbers?.length || 0) > 0 ? 1 : 0;
      return `${lineKey(line.DocEntry, line.LineNum)}:${whsCode}:${toNumber(line.invoiceQty)}:${hasBatches}`;
    })
    .join("|");

  useEffect(() => {
    const pending = state.selectedLineList.filter((line) => {
      const whsCode = line.WhsCode || line.SalesOrderWhsCode || "";
      if (!whsCode) return false;
      if ((line.BatchNumbers?.length || 0) > 0) return false;
      const signature = `${lineKey(line.DocEntry, line.LineNum)}|${whsCode}|${toNumber(line.invoiceQty)}`;
      return !autoAllocatedRef.current.has(signature);
    });

    if (pending.length === 0) return;

    // Mark before awaiting so a missing/failed allocation isn't retried in a loop.
    const pendingKeys = new Set<string>();
    pending.forEach((line) => {
      const whsCode = line.WhsCode || line.SalesOrderWhsCode || "";
      const key = lineKey(line.DocEntry, line.LineNum);
      pendingKeys.add(key);
      autoAllocatedRef.current.add(`${key}|${whsCode}|${toNumber(line.invoiceQty)}`);
    });

    // One line at a time, each seeing what the lines before it took: two lines
    // of the same item otherwise both land on the same nearest-expiry batch.
    void (async () => {
      let reserved = reservedWith(
        state.selectedLineList.filter((line) => !pendingKeys.has(lineKey(line.DocEntry, line.LineNum))),
      );
      for (const line of pending) {
        const whsCode = line.WhsCode || line.SalesOrderWhsCode || "";
        const { allocations } = await loadAllocationsForWarehouse(line, whsCode, reserved);
        if (allocations.length === 0) continue;
        const batchNumbers = toSapBatchNumbers(allocations);
        reserved = reservedWith([{ ...line, WhsCode: whsCode, BatchNumbers: batchNumbers }], reserved);
        state.updateLine(lineKey(line.DocEntry, line.LineNum), {
          WhsCode: whsCode,
          BatchNumbers: batchNumbers,
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAllocationSignature]);

  const applyBatchSelection = async (
    allocations: BatchAllocation[],
    whsCode: string,
    applyToAll = false,
    currentLineHasBatches = true,
  ) => {
    if (!batchPickerContext) return;
    const currentLine = state.selectedLineList.find((line) => lineKey(line.DocEntry, line.LineNum) === batchPickerContext.key);
    const failures: BatchAllocationFailure[] = [];

    if (applyToAll) setGlobalWhsCode(whsCode);

    state.updateLine(batchPickerContext.key, {
      WhsCode: whsCode,
      BatchNumbers: toSapBatchNumbers(allocations),
    });

    if (currentLine && !hasEnoughAllocation(allocations, batchPickerContext.quantity)) {
      failures.push({
        itemCode: currentLine.ItemCode,
        itemName: getLineDisplayName(currentLine),
        reason: currentLineHasBatches ? "insufficient" : "missing",
      });
    }

    if (applyToAll) {
      const otherLines = state.selectedLineList.filter((line) => lineKey(line.DocEntry, line.LineNum) !== batchPickerContext.key);
      // Sequential, each line holding what it took, so lines of the same item
      // do not all draw on the same batch.
      let reserved = holdBatches(state.reservedBatchQty, [
        { itemCode: currentLine?.ItemCode, whsCode, batches: toSapBatchNumbers(allocations) },
      ]);
      const results = [];
      for (const line of otherLines) {
        const result = await loadAllocationsForWarehouse(line, whsCode, reserved);
        reserved = holdBatches(reserved, [
          { itemCode: line.ItemCode, whsCode, batches: toSapBatchNumbers(result.allocations) },
        ]);
        results.push({ line, ...result });
      }

      results.forEach(({ line, allocations: lineAllocations, failureReason }) => {
        state.updateLine(lineKey(line.DocEntry, line.LineNum), {
          WhsCode: whsCode,
          BatchNumbers: toSapBatchNumbers(lineAllocations),
        });

        if (failureReason) {
          failures.push({
            itemCode: line.ItemCode,
            itemName: getLineDisplayName(line),
            reason: failureReason,
          });
        }
      });
    }

    setBatchApplyError(failures.length > 0 ? buildBatchApplyError(whsCode, failures) : "");
  };

  return (
    <div className="space-y-4">
      {batchApplyError && <Notice tone="bad">{batchApplyError}</Notice>}

      {state.selectedLineList.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineTrash}
            title="No lines on this invoice"
            hint="Go back and add at least one sales order line."
          />
        </Card>
      ) : (
        <ul
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 p-0"
          aria-label="Sales invoice lines"
        >
          {state.selectedLineList.map((line) => {
            const key = lineKey(line.DocEntry, line.LineNum);
            const selectedBatchQty =
              line.BatchNumbers?.reduce((sum, batch) => sum + toNumber(batch.Quantity), 0) || 0;
            const invoiceQty = toNumber(line.invoiceQty);
            const batchQtyMismatch = Math.abs(selectedBatchQty - invoiceQty) >= 0.0001;
            const batchWarehouse = line.WhsCode || line.SalesOrderWhsCode || "-";
            const warehouseQty =
              warehouseQtyByItemAndWhs[
                getSkuCodeKey(line.ItemCode) + "|" + getSkuCodeKey(batchWarehouse)
              ];
            const availableQtyText =
              warehouseQty === undefined ? "-" : warehouseQty.toLocaleString("en-IN");
            const skuImageUrl = skuImageByCode[getSkuCodeKey(line.ItemCode)] || "";

            return (
              <li
                className={cn(
                  "flex flex-col gap-2 rounded-card border bg-card p-3",
                  batchQtyMismatch ? "border-bad/40" : "border-line",
                )}
                key={key}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-sm border border-line bg-surface">
                    {skuImageUrl ? (
                      <img
                        src={skuImageUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-contain"
                      />
                    ) : (
                      <span className="font-mono text-[10px] text-subtle">no image</span>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <strong className="block text-[13px] font-semibold text-ink">
                      {line.Dscription || "Unnamed SAP line"}
                    </strong>
                    <span className="block font-mono text-[11px] text-subtle">
                      {line.ItemCode || "-"}
                    </span>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => state.removeLine(key)}
                    aria-label={"Remove " + (line.Dscription || line.ItemCode || "item")}
                  >
                    <HiOutlineTrash />
                  </Button>
                </div>

                <dl className="m-0 flex items-end justify-between gap-3">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-subtle">Unit price</dt>
                    <dd className="m-0 text-[13px] tabular-nums text-ink">
                      {formatMoney(line.Price)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-subtle">Quantity</dt>
                    <dd className="m-0">
                      <Input
                        type="number"
                        min="1"
                        max={line.OpenQty}
                        value={line.invoiceQty}
                        onChange={(event) =>
                          state.updateLine(key, { invoiceQty: toNumber(event.target.value) })
                        }
                        aria-label={
                          "Invoice quantity for " + (line.Dscription || line.ItemCode || "item")
                        }
                        className="h-control-sm w-24 text-right tabular-nums"
                      />
                    </dd>
                  </div>
                </dl>

                {/*
                  Opens the batch picker. It carries the warehouse, the stock
                  there, and — when they disagree — the reason this line cannot
                  post: SAP rejects a batch-managed item whose batch quantity
                  does not equal its invoice quantity.
                */}
                <button
                  type="button"
                  className={cn(
                    "w-full cursor-pointer appearance-none rounded-sm border px-2.5 py-2 text-left [font-family:inherit] text-[12px] transition-colors",
                    batchQtyMismatch
                      ? "border-bad/40 bg-bad-soft text-bad"
                      : "border-line bg-surface text-body hover:border-line-strong",
                  )}
                  onClick={() => {
                    setBatchApplyError("");
                    setBatchPickerContext({
                      key,
                      itemCode: line.ItemCode,
                      itemName: line.Dscription,
                      whsCode: globalWhsCode || line.WhsCode || line.SalesOrderWhsCode || "",
                      quantity: toNumber(line.invoiceQty),
                      maxQuantity: toNumber(line.OpenQty),
                    });
                  }}
                >
                  <span className="block">
                    Warehouse {batchWarehouse} - available {availableQtyText}
                  </span>
                  {batchQtyMismatch && (
                    <strong className="mt-0.5 block font-semibold">
                      Batch quantity does not match invoice quantity.
                    </strong>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {batchPickerContext && (
        <BatchPickerModal
          reservedBatchQty={reservedWith(
            state.selectedLineList.filter(
              (line) => lineKey(line.DocEntry, line.LineNum) !== batchPickerContext.key,
            ),
          )}
          context={batchPickerContext}
          onClose={() => setBatchPickerContext(null)}
          onAutoSelect={(allocations, whsCode, applyToAll, hasBatches) => {
            void applyBatchSelection(allocations, whsCode, applyToAll, hasBatches);
          }}
          onQuantityChange={(quantity) => {
            const nextQuantity = Math.min(
              Math.max(toNumber(quantity), 1),
              batchPickerContext.maxQuantity,
            );
            setBatchPickerContext((current) =>
              current ? { ...current, quantity: nextQuantity } : current,
            );
            setBatchApplyError("");
            state.updateLine(batchPickerContext.key, {
              invoiceQty: nextQuantity,
              BatchNumbers: [],
            });
          }}
        />
      )}
    </div>
  );
}
