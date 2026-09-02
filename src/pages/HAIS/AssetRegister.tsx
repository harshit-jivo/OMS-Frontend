import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiArrowPath,
  HiUserPlus,
  HiClipboardDocumentList,
  HiMagnifyingGlass,
  HiPencil,
  HiPlusCircle,
  HiQrCode,
} from "react-icons/hi2";
import { StatusBadge, ErrorAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import { haisService, WORKING_STATUSES, holderLabel, type Asset } from "../../services/haisService";
import AssetHistory from "./AssetHistory";
import AssetActionModal from "./AssetActionModal";
import AssetDetails from "./AssetDetails";
import "../../styles/HAIS/HAIS.css";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type Props = {
  /** Parent hook to jump into the edit form for a given asset. */
  onEdit?: (assetId: string) => void;
  /** Open the Add-asset form. */
  onAdd?: () => void;
  /** Open the Lookup page. */
  onLookup?: () => void;
};

function statusTone(status?: string): "ok" | "err" | "warn" | "muted" {
  switch ((status || "").toLowerCase()) {
    case "working":
      return "ok";
    case "under repair":
      return "warn";
    case "not working":
    case "scrapped":
      return "err";
    default:
      return "muted";
  }
}

/** Stable empty, so the table does not see a new array each render. */
const NO_ASSETS: Asset[] = [];

export default function AssetRegister({ onEdit, onAdd, onLookup }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  /* The COMMITTED filters. Search is applied by the button / Enter / Reset, not
     on every keystroke — the old Reset was the bug this fixes: it cleared the
     inputs and then called a `load` still bound to the PREVIOUS filters, so the
     boxes emptied and the table did not. */
  const [applied, setApplied] = useState({ search: "", status: "" });
  // Asset whose history is shown in the modal (null = closed).
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);
  // Asset + action for the Handover / Update-Config modal (null = closed).
  const [actionState, setActionState] = useState<{
    asset: Asset;
    mode: "handover" | "config";
  } | null>(null);
  // Asset shown in the full-details popup on row click (null = closed).
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);

  const {
    data: rows = NO_ASSETS,
    isFetching: busy,
    error: loadError,
  } = useQuery({
    queryKey: ["hais", "assets", applied],
    queryFn: async () =>
      (
        await haisService.list({
          search: applied.search.trim() || undefined,
          working_status: applied.status || undefined,
        })
      ).results ?? NO_ASSETS,
  });
  const error = loadError ? messageFrom(loadError, "Request failed") : "";

  /** Apply the current inputs. Called by Search, Enter and Reset. */
  const load = async (next?: { search: string; status: string }) => {
    setApplied(next ?? { search, status: statusFilter });
    await queryClient.invalidateQueries({ queryKey: ["hais", "assets"] });
  };

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head nic-head--split">
        <div className="nic-head-title">
          <span className="ofs-card-mark" />
          <h2>Asset Register</h2>
        </div>
        <div className="nic-actions-inline">
          <button className="ofs-primary" onClick={() => onAdd?.()}>
            <HiPlusCircle className="nic-icon-lead" />
            Add Asset
          </button>
          <button className="nic-tab" onClick={() => onLookup?.()}>
            <HiQrCode className="nic-icon-lead" />
            Lookup
          </button>
        </div>
      </div>

      {/* Filters — search, status and both buttons on one row. */}
      <div className="nic-filter-row--wide">
        <label className="nic-field nic-field--grow-260">
          <span className="nic-label">Search</span>
          <input
            className="nic-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
            placeholder="Asset ID, category, user, serial, company, model…"
          />
        </label>

        <label className="nic-field nic-field--fixed-180">
          <span className="nic-label">Status</span>
          <select
            className="nic-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {WORKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <button className="ofs-primary" onClick={() => void load()} disabled={busy}>
          <HiMagnifyingGlass className="nic-icon-lead" />
          {busy ? "Loading…" : "Search"}
        </button>
        <button
          className="nic-tab"
          onClick={() => {
            setSearch("");
            setStatusFilter("");
            void load({ search: "", status: "" });
          }}
        >
          <HiArrowPath className="nic-icon-lead" />
          Reset
        </button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      <div className="nic-table-wrap nic-table-wrap--offset">
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Asset ID</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Current User</TableHead>
              <TableHead>Handover</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Model No.</TableHead>
              <TableHead>Last Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="nic-num">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="nic-note nic-cell-empty"
                >
                  {busy ? "Loading…" : "No assets found."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((a) => (
                <TableRow key={a.asset_id} className="hais-row" onClick={() => setDetailAsset(a)}>
                  <TableCell className="nic-mono">{a.asset_id}</TableCell>
                  <TableCell>{a.asset_type || "—"}</TableCell>
                  <TableCell>{holderLabel(a)}</TableCell>
                  <TableCell>{a.handover_date || "—"}</TableCell>
                  <TableCell>{a.company || "—"}</TableCell>
                  <TableCell>{a.model_num || "—"}</TableCell>
                  <TableCell>{a.date_of_last_service || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(a.working_status as string)}>
                      {(a.working_status as string) || "—"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="hais-actions">
                      <button
                        className="hais-icon-btn hais-icon-btn--handover"
                        title="Handover to another user"
                        onClick={() => setActionState({ asset: a, mode: "handover" })}
                      >
                        <HiUserPlus />
                      </button>
                      <button
                        className="hais-icon-btn hais-icon-btn--history"
                        title="View device history"
                        onClick={() => setHistoryAsset(a)}
                      >
                        <HiClipboardDocumentList />
                      </button>
                      <button
                        className="hais-icon-btn hais-icon-btn--edit"
                        title="Edit / update configuration"
                        onClick={() => onEdit?.(a.asset_id)}
                      >
                        <HiPencil />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Device history modal */}
      <Dialog
        open={Boolean(historyAsset)}
        onOpenChange={(next) => {
          if (!next) setHistoryAsset(null);
        }}
      >
        {historyAsset && (
          <DialogContent
            title="Device history"
            variant="bare"
            size="auto"
            showClose={false}
            className="sb-modal"
          >
            <div className="nic-modal-head">
              <h3 className="nic-modal-title">
                History — <span className="nic-mono">{historyAsset.asset_id}</span>
                {historyAsset.asset_type ? ` (${historyAsset.asset_type})` : ""}
              </h3>
              <button
                onClick={() => setHistoryAsset(null)}
                className="nic-modal-close"
              >
                &times;
              </button>
            </div>
            <AssetHistory history={historyAsset.history} />
          </DialogContent>
        )}
      </Dialog>

      {/* Handover / Update-Config modal */}
      {actionState && (
        <AssetActionModal
          asset={actionState.asset}
          mode={actionState.mode}
          onClose={() => setActionState(null)}
          onDone={() => {
            setActionState(null);
            void load();
          }}
        />
      )}

      {/* Full-details popup (row click) — all data, no history */}
      {detailAsset && (
        <AssetDetails
          asset={detailAsset}
          onClose={() => setDetailAsset(null)}
          onEdit={(id) => {
            setDetailAsset(null);
            onEdit?.(id);
          }}
          onHandover={(a) => {
            setDetailAsset(null);
            setActionState({ asset: a, mode: "handover" });
          }}
          onHistory={(a) => {
            setDetailAsset(null);
            setHistoryAsset(a);
          }}
        />
      )}
    </section>
  );
}
