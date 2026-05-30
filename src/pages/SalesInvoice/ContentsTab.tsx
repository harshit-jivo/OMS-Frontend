import { useEffect, useState } from "react";
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
  selectedBatchNumber?: string;
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

function BatchPickerModal({
  context,
  onClose,
  onSelect,
}: {
  context: BatchPickerContext;
  onClose: () => void;
  onSelect: (batch: BatchDetail, whsCode: string) => void;
}) {
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [selectedWhsCode, setSelectedWhsCode] = useState(context.whsCode);
  const [batches, setBatches] = useState<BatchDetail[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [error, setError] = useState("");

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
        setSelectedWhsCode((current) =>
          current && nextWarehouses.some((warehouse) => warehouse.WhsCode === current)
            ? current
            : nextWarehouses[0]?.WhsCode || "",
        );
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
  }, [context.itemCode]);

  useEffect(() => {
    if (!selectedWhsCode) {
      setBatches([]);
      return;
    }

    let active = true;

    const loadBatches = async () => {
      setLoadingBatches(true);
      setError("");
      try {
        const data = await apiFetch<BatchDetail[]>(
          `/api/hana/batch-details/?item_code=${encodeURIComponent(context.itemCode)}&whs_code=${encodeURIComponent(selectedWhsCode)}`,
        );
        if (active) setBatches(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        if (active) {
          setBatches([]);
          setError("Unable to load batches for this warehouse.");
        }
      } finally {
        if (active) setLoadingBatches(false);
      }
    };

    loadBatches();
    return () => {
      active = false;
    };
  }, [context.itemCode, selectedWhsCode]);

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
              <span>Warehouse Stock</span>
              <strong>{loadingWarehouses ? "Loading..." : `${warehouses.length} warehouses`}</strong>
            </div>
            {loadingWarehouses ? (
              <div className="si-loader">Loading warehouse quantities...</div>
            ) : warehouses.length === 0 ? (
              <div className="si-empty">No warehouse stock found.</div>
            ) : (
              <div className="si-batch-warehouse-list">
                {warehouses.map((warehouse) => {
                  const quantity = Number(warehouse["SUM(Quantity)"] || 0);
                  return (
                    <button
                      className={`si-warehouse-option${selectedWhsCode === warehouse.WhsCode ? " is-active" : ""}`}
                      type="button"
                      key={warehouse.WhsCode}
                      onClick={() => setSelectedWhsCode(warehouse.WhsCode)}
                    >
                      <span>{warehouse.WhsCode}</span>
                      <strong>{quantity.toLocaleString("en-IN")}</strong>
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
            {error && <div className="si-inline-error">{error}</div>}
            {!selectedWhsCode ? (
              <div className="si-empty">Select a warehouse to view batches.</div>
            ) : loadingBatches ? (
              <div className="si-loader">Loading batches...</div>
            ) : batches.length === 0 ? (
              <div className="si-empty">No batches found for this warehouse.</div>
            ) : (
              <div className="si-table-wrap">
                <table className="si-lines-table si-batch-table">
                  <thead>
                    <tr>
                      <th aria-label="Select batch" />
                      <th>Batch No.</th>
                      <th>Batch Qty</th>
                      <th>Production</th>
                      <th>Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => (
                      <tr key={`${batch.BatchNum}-${batch.WhsCode}-${batch.InDate || ""}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={context.selectedBatchNumber === batch.BatchNum && selectedWhsCode === batch.WhsCode}
                            onChange={() => onSelect(batch, selectedWhsCode)}
                            aria-label={`Select batch ${batch.BatchNum}`}
                          />
                        </td>
                        <td>{batch.BatchNum}</td>
                        <td>{Number(batch.Quantity || 0).toLocaleString("en-IN")}</td>
                        <td>{formatBatchDate(batch.PrdDate)}</td>
                        <td>{formatBatchDate(batch.ExpDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

export default function ContentsTab({ state }: Props) {
  const [batchPickerContext, setBatchPickerContext] = useState<BatchPickerContext | null>(null);

  return (
    <div className="si-tab-grid">
      <div className="si-invoice-line-grid" aria-label="Sales invoice lines">
        {state.selectedLineList.map((line) => {
          const key = lineKey(line.DocEntry, line.LineNum);
          const selectedBatch = line.BatchNumbers?.[0];

          return (
            <article className="si-invoice-line-card" key={key}>
              <button
                className="si-invoice-line-remove"
                type="button"
                onClick={() => state.removeLine(key)}
                aria-label={`Remove ${line.Dscription || line.ItemCode || "item"}`}
              >
                x
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
                    <dt>Qty</dt>
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
                  className="si-batch-select-btn"
                  type="button"
                  onClick={() =>
                    setBatchPickerContext({
                      key,
                      itemCode: line.ItemCode,
                      itemName: line.Dscription,
                      whsCode: line.WhsCode,
                      quantity: toNumber(line.invoiceQty),
                      selectedBatchNumber: selectedBatch?.BatchNumber,
                    })
                  }
                >
                  {selectedBatch ? `${selectedBatch.BatchNumber} / ${line.WhsCode || "-"}` : "Choose Batch"}
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
          onSelect={(batch, whsCode) => {
            const systemSerialNumber = getSystemSerialNumber(batch);
            state.updateLine(batchPickerContext.key, {
              WhsCode: batch.WhsCode || whsCode,
              BatchNumbers: [
                {
                  BatchNumber: batch.BatchNum,
                  ...(systemSerialNumber !== undefined ? { SystemSerialNumber: systemSerialNumber } : {}),
                  Quantity: batchPickerContext.quantity,
                },
              ],
            });
            setBatchPickerContext(null);
          }}
        />
      )}
    </div>
  );
}
