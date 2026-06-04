import { useEffect, useMemo, useRef, useState } from "react";
import { HiTrash, HiXMark } from "react-icons/hi2";
import { formatMoney, lineKey, toNumber, type SelectedLine } from "./salesInvoice.utils";
import { apiFetch, type SalesInvoiceState } from "./useSalesInvoice";

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

type BatchDetail = {
  BatchNum?: string;
  BatchNumber?: string;
  DistNumber?: string;
  BatchNo?: string;
  BatchCode?: string;
  BatchID?: string;
  BatchId?: string;
  Batch?: string;
  LotNumber?: string;
  MnfSerial?: string;
  InternalSerialNumber?: string;
  SerialNumber?: string;
  WhsCode: string;
  Quantity: number;
  PrdDate?: string | null;
  ExpDate?: string | null;
  InDate?: string | null;
  SystemSerialNumber?: number;
  SysNumber?: number;
  AbsEntry?: number;
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

type BatchAllocation = {
  batch: BatchDetail;
  quantity: number;
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

const skuImageBaseUrl = String(
  import.meta.env.VITE_BASE_URL
    || import.meta.env.VITE_BACKEND_BASE_URL
    || import.meta.env.VITE_API_BASE_URL
    || "",
)
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

const getSkuImageUrl = (imagePath?: string | null) => {
  const path = String(imagePath || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return skuImageBaseUrl ? `${skuImageBaseUrl}${normalizedPath}` : normalizedPath;
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

const getSystemSerialNumber = (batch: BatchDetail) => {
  const value = batch.SystemSerialNumber ?? batch.SysNumber ?? batch.AbsEntry;
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
};

const getBatchDateTokens = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return new Set<string>();

  const tokens = new Set([text.toLowerCase().replace(/[^a-z0-9]/g, "")]);
  const dateOnly = text.split("T")[0]?.split(" ")[0] || text;
  const parts = dateOnly.split(/[/-]/).map((part) => part.trim()).filter(Boolean);

  if (parts.length === 3) {
    const [first, second, third] = parts;
    const year = first.length === 4 ? first : third;
    const month = second.padStart(2, "0");
    const day = first.length === 4 ? third.padStart(2, "0") : first.padStart(2, "0");

    if (year.length === 4) {
      tokens.add(`${year}${month}${day}`);
      tokens.add(`${day}${month}${year}`);
    }
  }

  return tokens;
};

const isBatchDateValue = (value: string, batch: BatchDetail) => {
  const candidateTokens = getBatchDateTokens(value);
  const dateTokens = [batch.ExpDate, batch.PrdDate, batch.InDate].reduce<Set<string>>((tokens, dateValue) => {
    getBatchDateTokens(dateValue).forEach((token) => tokens.add(token));
    return tokens;
  }, new Set());

  return [...candidateTokens].some((token) => token && dateTokens.has(token));
};

const getBatchNumber = (batch: BatchDetail) => {
  const source = batch as Record<string, unknown>;
  const candidateKeys = [
    "BatchNumber",
    "DistNumber",
    "BatchNo",
    "BatchCode",
    "BatchID",
    "BatchId",
    "Batch",
    "LotNumber",
    "BatchNum",
    "MnfSerial",
    "InternalSerialNumber",
    "SerialNumber",
  ];

  for (const key of candidateKeys) {
    const value = String(source[key] ?? "").trim();
    if (value && !isBatchDateValue(value, batch)) return value;
  }

  return "";
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

const toSapBatchNumbers = (allocations: BatchAllocation[]) =>
  allocations
    .map(({ batch, quantity }) => {
    const systemSerialNumber = getSystemSerialNumber(batch);
    const batchNumber = getBatchNumber(batch);
    return {
      ...(batchNumber ? { BatchNumber: batchNumber } : {}),
      ...(systemSerialNumber !== undefined ? { SystemSerialNumber: systemSerialNumber } : {}),
      Quantity: quantity,
    };
  })
    .filter((batch) => (batch.BatchNumber || batch.SystemSerialNumber !== undefined) && batch.Quantity > 0);

const getBatchSortTime = (batch: BatchDetail) => {
  const expTime = batch.ExpDate ? new Date(batch.ExpDate).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isFinite(expTime)) return expTime;
  const inTime = batch.InDate ? new Date(batch.InDate).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(inTime) ? inTime : Number.POSITIVE_INFINITY;
};

const allocateNearestExpiryBatches = (batches: BatchDetail[], requiredQty: number): BatchAllocation[] => {
  let remainingQty = toNumber(requiredQty);
  const allocations: BatchAllocation[] = [];

  [...batches]
    .filter((batch) => toNumber(batch.Quantity) > 0)
    .sort((a, b) => getBatchSortTime(a) - getBatchSortTime(b))
    .some((batch) => {
      const allocatedQty = Math.min(remainingQty, toNumber(batch.Quantity));
      if (allocatedQty > 0) {
        allocations.push({ batch, quantity: allocatedQty });
        remainingQty -= allocatedQty;
      }
      return remainingQty <= 0;
    });

  return allocations;
};

const getAllocationQuantity = (allocations: BatchAllocation[]) =>
  allocations.reduce((sum, allocation) => sum + toNumber(allocation.quantity), 0);

const hasEnoughAllocation = (allocations: BatchAllocation[], requiredQty: number) =>
  getAllocationQuantity(allocations) + 0.0001 >= toNumber(requiredQty);

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
          `/api/hana/inventory-details/?item_code=${encodeURIComponent(context.itemCode)}`,
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
                `/api/hana/batch-details/?item_code=${encodeURIComponent(context.itemCode)}&whs_code=${encodeURIComponent(whsCode)}`,
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
  const allocations = allocateNearestExpiryBatches(selectedBatches, context.quantity);
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
    <div className="si-modal-backdrop" role="presentation">
      <section className="si-so-modal si-batch-modal" role="dialog" aria-modal="true" aria-label="Choose item batch">
        <header className="si-so-modal-head">
          <div>
            <span className="si-eyebrow">Batch Selection</span>
            <h2>{context.itemCode}</h2>
            <p>{context.itemName}</p>
          </div>
          <div className="si-modal-head-actions">
            <button
              className="si-modal-icon-btn si-modal-icon-close"
              type="button"
              aria-label="Close"
              title="Close"
              onClick={onClose}
            >
              <HiXMark aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="si-batch-picker-body">
          <aside className="si-batch-warehouse-panel">
            <div className="si-batch-panel-title">
              <span>Warehouse</span>
              <strong>{context.quantity.toLocaleString("en-IN")} required</strong>
            </div>
            {error && <div className="si-inline-error">{error}</div>}
            {loadingWarehouses ? (
              <div className="si-loader">Loading warehouse quantities...</div>
            ) : warehouseOptions.length === 0 ? (
              <div className="si-empty">No warehouse stock found.</div>
            ) : (
              <div className="si-batch-warehouse-cards" aria-label="Choose warehouse">
                {warehouseOptions.map(({ code: whsCode, warehouse }) => {
                  const whsBatches = warehouseBatches[whsCode] || [];
                  const quantity = warehouse ? getWarehouseQuantity(warehouse) : 0;
                  return (
                    <button
                      className={`si-batch-warehouse-card${selectedWhsCode === whsCode ? " is-active" : ""}`}
                      type="button"
                      key={whsCode}
                      onClick={() => {
                        shouldApplyWarehouseToAllRef.current = true;
                        if (selectedWhsCode === whsCode && !loadingBatches) {
                          void onAutoSelectRef.current(allocations, whsCode, true, selectedBatches.length > 0);
                          return;
                        }
                        setSelectedWhsCode(whsCode);
                      }}
                    >
                      <strong>{whsCode}</strong>
                      <span>{loadingBatches ? "..." : whsBatches.length} batches</span>
                      <em>Qty {quantity.toLocaleString("en-IN")}</em>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <section className="si-batch-list-panel">
            <div className="si-batch-panel-title">
              <span>Batches</span>
              <strong>{selectedWhsCode || "Select warehouse"}</strong>
            </div>
            <label className="si-batch-quantity-field">
              <span>Invoice Quantity</span>
              <input
                type="number"
                min="1"
                max={context.maxQuantity}
                value={context.quantity}
                onChange={(event) => onQuantityChange(toNumber(event.target.value))}
              />
            </label>
            {!loadingWarehouses && (
              selectedWhsCode && loadingBatches ? (
                <div className="si-loader">Loading batch availability...</div>
              ) : selectedWhsCode && selectedBatches.length === 0 ? (
                <div className="si-empty">No batches found for this warehouse.</div>
              ) : selectedWhsCode ? (
                <>
                  <div className={`si-batch-match-status${quantityMatches ? " is-match" : " has-error"}`}>
                    <span>
                      Invoice Qty: {context.quantity.toLocaleString("en-IN")} | Batch Qty:{" "}
                      {allocatedQty.toLocaleString("en-IN")}
                    </span>
                    <strong>{quantityMatches ? "Quantity matched" : "Quantity mismatch"}</strong>
                  </div>
                  {allocations.length > 0 && (
                    <div className="si-batch-auto-list">
                    {allocations.map(({ batch, quantity }) => (
                      <div className="si-batch-auto-row" key={`${getBatchNumber(batch)}-${batch.WhsCode}-${batch.InDate || ""}`}>
                        <strong>Exp {formatBatchDate(batch.ExpDate)}</strong>
                        <em>{quantity.toLocaleString("en-IN")}</em>
                      </div>
                    ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="si-empty">Select a warehouse.</div>
              )
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

export default function ContentsTab({ state }: Props) {
  const [batchPickerContext, setBatchPickerContext] = useState<BatchPickerContext | null>(null);
  const [globalWhsCode, setGlobalWhsCode] = useState("");
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
                `/api/hana/inventory-details/?item_code=${encodeURIComponent(itemCode)}`,
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

  const loadAllocationsForWarehouse = async (
    line: SelectedLine,
    whsCode: string,
  ): Promise<{ allocations: BatchAllocation[]; failureReason: BatchAllocationFailure["reason"] | null }> => {
    try {
      const data = await apiFetch<BatchDetail[]>(
        `/api/hana/batch-details/?item_code=${encodeURIComponent(line.ItemCode)}&whs_code=${encodeURIComponent(whsCode)}`,
      );
      const batches = Array.isArray(data) ? data : [];
      const allocations = allocateNearestExpiryBatches(batches, toNumber(line.invoiceQty));
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
      const results = await Promise.all(
        otherLines.map(async (line) => {
          const result = await loadAllocationsForWarehouse(line, whsCode);
          return { line, ...result };
        }),
      );

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
    <div className="si-tab-grid">
      {batchApplyError && <div className="si-inline-error">{batchApplyError}</div>}
      <div className="si-invoice-line-grid" aria-label="Sales invoice lines">
        {state.selectedLineList.map((line) => {
          const key = lineKey(line.DocEntry, line.LineNum);
          const selectedBatchQty = line.BatchNumbers?.reduce((sum, batch) => sum + toNumber(batch.Quantity), 0) || 0;
          const invoiceQty = toNumber(line.invoiceQty);
          const batchQtyMismatch = Math.abs(selectedBatchQty - invoiceQty) >= 0.0001;
          const batchWarehouse = line.WhsCode || line.SalesOrderWhsCode || "-";
          const warehouseQty = warehouseQtyByItemAndWhs[`${getSkuCodeKey(line.ItemCode)}|${getSkuCodeKey(batchWarehouse)}`];
          const availableQtyText = warehouseQty === undefined ? "-" : warehouseQty.toLocaleString("en-IN");
          const skuImageUrl = skuImageByCode[getSkuCodeKey(line.ItemCode)] || "";

          return (
            <article className="si-invoice-line-card" key={key}>
              <div className={`si-invoice-item-visual${skuImageUrl ? " has-image" : ""}`}>
                {skuImageUrl ? (
                  <img src={skuImageUrl} alt="" loading="lazy" />
                ) : (
                  <span />
                )}
                <button
                  className="si-invoice-line-remove"
                  type="button"
                  onClick={() => state.removeLine(key)}
                  aria-label={`Remove ${line.Dscription || line.ItemCode || "item"}`}
                >
                  <HiTrash aria-hidden="true" />
                </button>
              </div>
              <div className="si-invoice-item-copy">
                <strong>{line.Dscription || "Unnamed SAP line"}</strong>
                <dl>
                  <div>
                    <dt>Unit Price</dt>
                    <dd>{formatMoney(line.Price)}</dd>
                  </div>
                  <div>
                    <dt>Quantity</dt>
                    <dd>
                      <input
                        type="number"
                        min="1"
                        max={line.OpenQty}
                        value={line.invoiceQty}
                        onChange={(event) => state.updateLine(key, { invoiceQty: toNumber(event.target.value) })}
                        aria-label={`Invoice quantity for ${line.Dscription || line.ItemCode || "item"}`}
                      />
                    </dd>
                  </div>
                </dl>
                <button
                  className={`si-batch-select-btn${batchQtyMismatch ? " has-error" : ""}`}
                  type="button"
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
                  <span>
                    Warehouse: {batchWarehouse} | Available Qty: {availableQtyText}
                  </span>
                  {batchQtyMismatch && (
                    <strong className="si-batch-select-warning">
                      Batch quantity does not match invoice quantity.
                    </strong>
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {batchPickerContext && (
        <BatchPickerModal
          context={batchPickerContext}
          onClose={() => setBatchPickerContext(null)}
          onAutoSelect={(allocations, whsCode, applyToAll, hasBatches) => {
            void applyBatchSelection(allocations, whsCode, applyToAll, hasBatches);
          }}
          onQuantityChange={(quantity) => {
            const nextQuantity = Math.min(Math.max(toNumber(quantity), 1), batchPickerContext.maxQuantity);
            setBatchPickerContext((current) => current ? { ...current, quantity: nextQuantity } : current);
            setBatchApplyError("");
            state.updateLine(batchPickerContext.key, { invoiceQty: nextQuantity, BatchNumbers: [] });
          }}
        />
      )}
    </div>
  );
}
