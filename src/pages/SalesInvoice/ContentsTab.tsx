import { useEffect, useRef, useState } from "react";
import { HiTrash } from "react-icons/hi2";
import { formatMoney, lineKey, toNumber } from "./salesInvoice.utils";
import { apiFetch, type SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

type InventoryWarehouse = {
  WhsCode: string;
  "SUM(Quantity)"?: number;
};

type BatchDetail = {
  BatchNum: string;
  BatchNumber?: string;
  WhsCode: string;
  Quantity: number;
  PrdDate?: string | null;
  ExpDate?: string | null;
  InDate?: string | null;
  SystemSerialNumber?: number;
  SysNumber?: number;
  AbsEntry?: number;
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

const getBatchNumber = (batch: BatchDetail) => batch.BatchNum || batch.BatchNumber || "";

const toSapBatchNumbers = (allocations: BatchAllocation[]) =>
  allocations.map(({ batch, quantity }) => {
    const systemSerialNumber = getSystemSerialNumber(batch);
    return {
      BatchNumber: getBatchNumber(batch),
      ...(systemSerialNumber !== undefined ? { SystemSerialNumber: systemSerialNumber } : {}),
      Quantity: quantity,
    };
  });

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

function BatchPickerModal({
  context,
  onClose,
  onAutoSelect,
  onQuantityChange,
}: {
  context: BatchPickerContext;
  onClose: () => void;
  onAutoSelect: (allocations: BatchAllocation[], whsCode: string) => void;
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

  useEffect(() => {
    onAutoSelectRef.current = onAutoSelect;
  }, [onAutoSelect]);

  useEffect(() => {
    lastAppliedSignature.current = "";
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
          const hasContextWarehouse = nextWarehouses.some((warehouse) => warehouse.WhsCode === contextWhsCode);
          const hasCurrentWarehouse = nextWarehouses.some((warehouse) => warehouse.WhsCode === current);

          if (contextWhsCode && hasContextWarehouse) return contextWhsCode;
          if (current && hasCurrentWarehouse) return current;
          return nextWarehouses[0]?.WhsCode || "";
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

  useEffect(() => {
    if (warehouses.length === 0) {
      setWarehouseBatches({});
      return;
    }

    let active = true;

    const loadBatches = async () => {
      setLoadingBatches(true);
      try {
        const entries = await Promise.all(
          warehouses.map(async (warehouse) => {
            try {
              const data = await apiFetch<BatchDetail[]>(
                `/api/hana/batch-details/?item_code=${encodeURIComponent(context.itemCode)}&whs_code=${encodeURIComponent(warehouse.WhsCode)}`,
              );
              return [warehouse.WhsCode, Array.isArray(data) ? data : []] as const;
            } catch (err) {
              console.error(err);
              return [warehouse.WhsCode, []] as const;
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
  }, [context.itemCode, warehouses]);

  const selectedBatches = warehouseBatches[selectedWhsCode] || [];
  const allocations = allocateNearestExpiryBatches(selectedBatches, context.quantity);
  const allocatedQty = allocations.reduce((sum, allocation) => sum + toNumber(allocation.quantity), 0);
  const quantityMatches = Math.abs(allocatedQty - context.quantity) < 0.0001;
  const allocationSignature = `${context.quantity}|${selectedWhsCode}|${allocations
    .map(({ batch, quantity }) => `${getBatchNumber(batch)}:${quantity}`)
    .join("|")}`;

  useEffect(() => {
    if (!selectedWhsCode || loadingBatches) return;
    if (lastAppliedSignature.current === allocationSignature) return;
    lastAppliedSignature.current = allocationSignature;
    onAutoSelectRef.current(allocations, selectedWhsCode);
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
          <button className="si-btn si-btn-outline" type="button" onClick={onClose}>
            Close
          </button>
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
            ) : warehouses.length === 0 ? (
              <div className="si-empty">No warehouse stock found.</div>
            ) : (
              <div className="si-batch-warehouse-cards" aria-label="Choose warehouse">
                {warehouses.map((warehouse) => {
                  const whsBatches = warehouseBatches[warehouse.WhsCode] || [];
                  const quantity = toNumber(warehouse["SUM(Quantity)"]);
                  return (
                    <button
                      className={`si-batch-warehouse-card${selectedWhsCode === warehouse.WhsCode ? " is-active" : ""}`}
                      type="button"
                      key={warehouse.WhsCode}
                      onClick={() => setSelectedWhsCode(warehouse.WhsCode)}
                    >
                      <strong>{warehouse.WhsCode}</strong>
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

            <div className="si-batch-modal-actions">
              <button className="si-btn si-btn-outline" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

export default function ContentsTab({ state }: Props) {
  const [batchPickerContext, setBatchPickerContext] = useState<BatchPickerContext | null>(null);
  const applyBatchSelection = (allocations: BatchAllocation[], whsCode: string) => {
    if (!batchPickerContext) return;
    state.updateLine(batchPickerContext.key, {
      WhsCode: whsCode,
      BatchNumbers: toSapBatchNumbers(allocations),
    });
  };

  return (
    <div className="si-tab-grid">
      <div className="si-invoice-line-grid" aria-label="Sales invoice lines">
        {state.selectedLineList.map((line) => {
          const key = lineKey(line.DocEntry, line.LineNum);
          const selectedBatchCount = line.BatchNumbers?.length || 0;
          const selectedBatchQty = line.BatchNumbers?.reduce((sum, batch) => sum + toNumber(batch.Quantity), 0) || 0;
          const invoiceQty = toNumber(line.invoiceQty);
          const batchQtyMismatch = Math.abs(selectedBatchQty - invoiceQty) >= 0.0001;
          const batchWarehouse = line.WhsCode || line.SalesOrderWhsCode || "-";

          return (
            <article className="si-invoice-line-card" key={key}>
              <button
                className="si-invoice-line-remove"
                type="button"
                onClick={() => state.removeLine(key)}
                aria-label={`Remove ${line.Dscription || line.ItemCode || "item"}`}
              >
                <HiTrash aria-hidden="true" />
              </button>
              <div className="si-invoice-item-visual" aria-hidden="true">
                <span />
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
                  onClick={() =>
                    setBatchPickerContext({
                      key,
                      itemCode: line.ItemCode,
                      itemName: line.Dscription,
                      whsCode: line.SalesOrderWhsCode || line.WhsCode,
                      quantity: toNumber(line.invoiceQty),
                      maxQuantity: toNumber(line.OpenQty),
                    })
                  }
                >
                  {selectedBatchCount ? (
                    <>
                      <span>Warehouse: {batchWarehouse}</span>
                      <em>
                        Batches: {selectedBatchCount} | Qty: {selectedBatchQty.toLocaleString("en-IN")}/
                        {invoiceQty.toLocaleString("en-IN")}
                      </em>
                    </>
                  ) : (
                    <>
                      <span>Warehouse: {batchWarehouse}</span>
                      <em>Batches: 0 | Qty: {invoiceQty.toLocaleString("en-IN")}</em>
                    </>
                  )}
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
          onAutoSelect={(allocations, whsCode) => {
            applyBatchSelection(allocations, whsCode);
          }}
          onQuantityChange={(quantity) => {
            const nextQuantity = Math.min(Math.max(toNumber(quantity), 1), batchPickerContext.maxQuantity);
            setBatchPickerContext((current) => current ? { ...current, quantity: nextQuantity } : current);
            state.updateLine(batchPickerContext.key, { invoiceQty: nextQuantity, BatchNumbers: [] });
          }}
        />
      )}
    </div>
  );
}
