/**
 * The Asset Register — every device, filterable, with the three row actions
 * (handover, history, edit) and a row click that opens the full record.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineArrowPath,
  HiOutlineClipboardDocumentList,
  HiOutlineComputerDesktop,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineQrCode,
  HiOutlineUserPlus,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FilterActions,
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSelect,
  FilterSpacer,
} from "@/components/ui/filter-bar";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { messageFrom } from "@/lib/apiError";
import { haisService, WORKING_STATUSES, holderLabel, type Asset } from "../../services/haisService";

import AssetActionModal from "./AssetActionModal";
import AssetDetails from "./AssetDetails";
import AssetHistory from "./AssetHistory";
import { MONO, assetStatusTone } from "./assetTone";

type Props = {
  /** Parent hook to jump into the edit form for a given asset. */
  onEdit?: (assetId: string) => void;
  /** Open the Add-asset form. */
  onAdd?: () => void;
  /** Open the Lookup page. */
  onLookup?: () => void;
};

/** Stable empty, so the table does not see a new array each render. */
const NO_ASSETS: Asset[] = [];

const COLUMNS = 9;

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
    isPending,
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
    <div className="space-y-4 sm:space-y-6">
      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void load()}
          placeholder="Asset ID, category, user, serial, company, model…"
          fieldClassName="min-w-[260px]"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          fieldClassName="max-w-[180px]"
        >
          <option value="">All</option>
          {WORKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FilterSelect>
        <FilterActions>
          <Button variant="primary" onClick={() => void load()} disabled={busy}>
            <HiOutlineMagnifyingGlass aria-hidden="true" /> {busy ? "Loading…" : "Search"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              void load({ search: "", status: "" });
            }}
          >
            <HiOutlineArrowPath aria-hidden="true" /> Reset
          </Button>
        </FilterActions>
        <FilterSpacer />
        {!isPending && !error ? (
          <FilterCount>
            {rows.length} {rows.length === 1 ? "device" : "devices"}
          </FilterCount>
        ) : null}
      </FilterBar>

      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 border-b border-line px-4 py-3">
          <CardTitle>Asset Register</CardTitle>
          <div className="flex gap-1.5">
            <Button size="xs" variant="ghost" onClick={() => onLookup?.()}>
              <HiOutlineQrCode aria-hidden="true" /> Lookup
            </Button>
            <Button size="xs" onClick={() => onAdd?.()}>
              <HiOutlinePlus aria-hidden="true" /> Add asset
            </Button>
          </div>
        </CardHeader>

        {isPending ? (
          <TableSkeleton rows={6} columns={COLUMNS} />
        ) : error ? (
          <EmptyState icon={HiOutlineComputerDesktop} title="Could not load assets" hint={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={HiOutlineComputerDesktop}
            title="No assets found"
            hint={
              applied.search || applied.status
                ? "Nothing matches these filters."
                : "Add the first device with the button above."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Asset ID</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Current user</TableHead>
                  <TableHead>Handover</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Model No.</TableHead>
                  <TableHead>Last service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow
                    key={a.asset_id}
                    className="cursor-pointer"
                    onClick={() => setDetailAsset(a)}
                  >
                    <TableCell className={`${MONO} whitespace-nowrap text-ink`}>
                      {a.asset_id}
                    </TableCell>
                    <TableCell>{a.asset_type || "—"}</TableCell>
                    <TableCell>{holderLabel(a)}</TableCell>
                    <TableCell className="whitespace-nowrap">{a.handover_date || "—"}</TableCell>
                    <TableCell>{a.company || "—"}</TableCell>
                    <TableCell>{a.model_num || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {a.date_of_last_service || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge tone={assetStatusTone(a.working_status as string)} dot>
                        {(a.working_status as string) || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-px" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-nowrap justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Handover to another user"
                          aria-label={`Handover ${a.asset_id}`}
                          onClick={() => setActionState({ asset: a, mode: "handover" })}
                        >
                          <HiOutlineUserPlus aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View device history"
                          aria-label={`History of ${a.asset_id}`}
                          onClick={() => setHistoryAsset(a)}
                        >
                          <HiOutlineClipboardDocumentList aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit / update configuration"
                          aria-label={`Edit ${a.asset_id}`}
                          onClick={() => onEdit?.(a.asset_id)}
                        >
                          <HiOutlinePencilSquare aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Device history modal */}
      <Dialog
        open={Boolean(historyAsset)}
        onOpenChange={(next) => {
          if (!next) setHistoryAsset(null);
        }}
      >
        {historyAsset && (
          <DialogContent title={`History — ${historyAsset.asset_id}`}>
            <DialogHeader className="items-start">
              <div className="min-w-0">
                <DialogTitle>
                  History — <span className={MONO}>{historyAsset.asset_id}</span>
                </DialogTitle>
                {historyAsset.asset_type ? (
                  <DialogDescription>{historyAsset.asset_type}</DialogDescription>
                ) : null}
              </div>
            </DialogHeader>
            <DialogBody>
              <AssetHistory history={historyAsset.history} heading={false} />
            </DialogBody>
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
    </div>
  );
}
