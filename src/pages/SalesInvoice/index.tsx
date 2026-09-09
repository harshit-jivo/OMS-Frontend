import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiOutlineArchiveBox,
  HiOutlineArrowPath,
  HiOutlineArrowRight,
  HiOutlineBeaker,
  HiOutlineDocumentText,
  HiOutlinePhoto,
  HiOutlinePlus,
  HiOutlineSparkles,
  HiOutlineTrash,
  HiOutlineUsers,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { Field, Input } from "@/components/ui/form";
import {
  Card,
  EmptyState,
  Notice,
  Page,
  PageHeader,
  SectionHeading,
} from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import DraftStep, { BranchBadge } from "./DraftStep";
import OrdersStep from "./OrdersStep";
import { apiFetch, hanaUrl, useSalesInvoice, type SalesInvoiceState } from "./useSalesInvoice";
import { formatMoney, type SelectedLine } from "./salesInvoice.utils";

type PartyPickerModalProps = {
  state: SalesInvoiceState;
  onClose: () => void;
  onSelect: () => void;
};

type InvoiceSourceMode = "sales-order" | "items";
type ItemFilterModal = "brand" | "subGroup" | "variety" | "packSize";

type FinishedGoodItem = {
  ItemCode: string;
  ItemName: string;
  U_Brand?: string | null;
  U_Variety?: string | null;
  U_Sub_Group?: string | null;
  U_SKU?: string | null;
  Quantity?: number | string | null;
  OnHand?: number | string | null;
  InStock?: number | string | null;
  AvailableQty?: number | string | null;
  AvailableQuantity?: number | string | null;
  TotalQty?: number | string | null;
  "SUM(Quantity)"?: number | string | null;
  Price?: number | string | null;
  UnitPrice?: number | string | null;
  PriceBefDi?: number | string | null;
  TaxCode?: string | null;
  VatGroup?: string | null;
  VatPrcnt?: number | string | null;
  DiscPrcnt?: number | string | null;
};

type ItemPriceRecord = {
  Price?: number | string | null;
  UnitPrice?: number | string | null;
  PriceBefDi?: number | string | null;
  PriceBeforeDiscount?: number | string | null;
  TaxCode?: string | null;
  VatGroup?: string | null;
  VatPrcnt?: number | string | null;
  TaxPercent?: number | string | null;
  DiscPrcnt?: number | string | null;
  DiscountPercent?: number | string | null;
  [key: string]: unknown;
};

type ItemPriceApiResponse =
  | ItemPriceRecord
  | ItemPriceRecord[]
  | { data?: ItemPriceRecord[] | ItemPriceRecord; results?: ItemPriceRecord[] | ItemPriceRecord };

type InventoryWarehouse = {
  WhsCode: string;
  "SUM(Quantity)"?: number;
};

type BatchDetail = {
  SysNumber?: number;
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
  ItemCode: string;
  ItemName: string;
  WhsCode: string;
  PrdDate?: string | null;
  ExpDate?: string | null;
  InDate?: string | null;
  Quantity: number;
  BaseType?: number;
  BaseNum?: number;
  BaseEntry?: number;
  SystemSerialNumber?: number;
  AbsEntry?: number;
  [key: string]: unknown;
};

type SelectedBatch = {
  warehouseCode: string;
  warehouseQuantity: number;
  batches: Array<{
    batch: BatchDetail;
    quantity: number;
  }>;
};

type ItemInvoiceRow = {
  id: number;
  type: "Item";
  item: FinishedGoodItem | null;
  invoiceQty: number;
  batch: SelectedBatch | null;
};

const stateNameByCode: Record<string, string> = {
  AD: "Andhra Pradesh",
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AS: "Assam",
  AUS: "Australia",
  AZ: "Arizona",
  BH: "Bihar",
  CA: "California",
  CH: "Chandigarh",
  CT: "Chhattisgarh",
  DB: "Dadra and Nagar Haveli and Daman and Diu",
  DL: "Delhi",
  DN: "Dadra and Nagar Haveli and Daman and Diu",
  GJ: "Gujarat",
  GL: "Goa",
  GO: "Goa",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu and Kashmir",
  KR: "Kerala",
  KT: "Karnataka",
  MH: "Maharashtra",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NG: "Nagaland",
  NSW: "New South Wales",
  OD: "Odisha",
  PB: "Punjab",
  RJ: "Rajasthan",
  TE: "Telangana",
  TN: "Tamil Nadu",
  TO: "Tripura",
  UK: "Uttarakhand",
  UP: "Uttar Pradesh",
  WA: "Western Australia",
  WB: "West Bengal",
};

const formatStateName = (stateCode?: string | null) => {
  const code = String(stateCode || "").trim();
  return code ? stateNameByCode[code] || code : "";
};

const nullChainValue = "__NO_CHAIN__";

const getChainValue = (chain?: string | null) => {
  const text = String(chain || "").trim();
  return text || nullChainValue;
};

const formatChainName = (chainValue: string) =>
  chainValue === nullChainValue ? "No Chain" : chainValue;

const getPartyOpenOrders = (party: { OpenOrders?: number; Num_of_Open_SalesOrder?: number }) =>
  Number(party.OpenOrders ?? party.Num_of_Open_SalesOrder ?? 0);

const getItemTotalQty = (item: FinishedGoodItem) => {
  const qty = Number(
    item.TotalQty ??
      item.AvailableQty ??
      item.AvailableQuantity ??
      item.Quantity ??
      item.OnHand ??
      item.InStock ??
      0,
  );
  return Number.isFinite(qty) ? qty : 0;
};

const stateFilterOrder = [
  "PB",
  "HR",
  "DL",
  "UP",
  "AP",
  "GJ",
  "MH",
  "WB",
  "JK",
  "TE",
  "KT",
  "RJ",
  "GO",
  "AS",
  "HP",
  "UK",
  "BH",
  "MP",
  "TN",
  "CT",
  "DB",
  "MN",
];

const chainFilterOrder = [
  "DISTRIBUTOR",
  "D MART",
  "SUPER STOCKIST",
  "RETAILER",
  nullChainValue,
  "WALMART",
  "INDIVIDUALS",
  "BIG BASKET",
  "GT",
  "SINGLE SHOPS",
  "RELIANCE FRESH",
  "ARY SHOPS",
  "GURUDWARA",
  "METRO CASH & CARRY",
  "ABRL",
  "RAJ MANDIR",
  "AMAZON",
  "BULK",
  "STAFF",
];

const mainGroupFilterOrder = [
  "GT",
  "MT",
  "ROI",
  "E-COMMERCE",
  "BRANCH",
  "CSD",
  "CORPORATE",
  "HORECA",
  "STAFF",
  "REFERENCE",
  "SANGAT",
  "CALL CENTER",
  "BULK OIL",
  "EXPORT",
  "EVENTS & EXHIBITIONS",
  "PURCHASE OIL",
];

const sortByFilterOrder = (order: string[]) => (optionA: string, optionB: string) => {
  const indexA = order.indexOf(optionA);
  const indexB = order.indexOf(optionB);
  if (indexA !== -1 || indexB !== -1) {
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  }
  return optionA.localeCompare(optionB);
};

function PartyPickerModal({ state, onClose, onSelect }: PartyPickerModalProps) {
  const [selectedState, setSelectedState] = useState("");
  // The raw chip choices. What the rest of the component reads is the DERIVED
  // `selectedMainGroup` / `selectedChain` below, which drop a choice that is no
  // longer among its options — the job the two clamp effects used to do a
  // render late.
  const [mainGroupChoice, setMainGroupChoice] = useState("");
  const [chainChoice, setChainChoice] = useState("");
  const [partyQuery, setPartyQuery] = useState("");
  const [filterModal, setFilterModal] = useState<"state" | "mainGroup" | "chain" | null>(null);
  const stateOptions = useMemo(() => {
    return [
      ...new Set(state.parties.map((party) => String(party.State1 || "").trim()).filter(Boolean)),
    ].sort(sortByFilterOrder(stateFilterOrder));
  }, [state.parties]);
  const mainGroupOptions = useMemo(() => {
    const groups = state.parties
      .filter((party) => !selectedState || party.State1 === selectedState)
      .map((party) => String(party.U_Main_Group || "").trim())
      .filter(Boolean);
    return [...new Set(groups)].sort(sortByFilterOrder(mainGroupFilterOrder));
  }, [selectedState, state.parties]);
  const selectedMainGroup = mainGroupOptions.includes(mainGroupChoice) ? mainGroupChoice : "";
  const chainOptions = useMemo(() => {
    const chains = state.parties
      .filter((party) => !selectedState || party.State1 === selectedState)
      .filter((party) => !selectedMainGroup || party.U_Main_Group === selectedMainGroup)
      .map((party) => getChainValue(party.U_Chain));
    const uniqueChains = [...new Set(chains)].sort((chainA, chainB) =>
      formatChainName(chainA).localeCompare(formatChainName(chainB)),
    );
    return uniqueChains.sort(sortByFilterOrder(chainFilterOrder));
  }, [selectedMainGroup, selectedState, state.parties]);
  const selectedChain = chainOptions.includes(chainChoice) ? chainChoice : "";
  const filteredParties = useMemo(() => {
    const normalizedQuery = partyQuery.trim().toLowerCase();
    return state.parties.filter((party) => {
      const stateMatches = !selectedState || party.State1 === selectedState;
      const mainGroupMatches = !selectedMainGroup || party.U_Main_Group === selectedMainGroup;
      const chainMatches = !selectedChain || getChainValue(party.U_Chain) === selectedChain;
      const queryMatches =
        !normalizedQuery ||
        [
          party.CardName,
          party.CardCode,
          formatStateName(party.State1),
          party.U_Main_Group,
          party.U_Chain,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));
      return stateMatches && mainGroupMatches && chainMatches && queryMatches;
    });
  }, [partyQuery, selectedChain, selectedMainGroup, selectedState, state.parties]);

  /* Replaced by the two derived consts above. These cleared a filter one render
     AFTER its option list stopped containing it, so the list below rendered once
     against a filter that no longer applied.

  useEffect(() => {
    setMainGroupChoice((current) =>
      current && !mainGroupOptions.includes(current) ? "" : current,
    );
  }, [mainGroupOptions]);

  useEffect(() => {
    setChainChoice((current) => (current && !chainOptions.includes(current) ? "" : current));
  }, [chainOptions]);
  */

  const visibleStates = useMemo(() => {
    const selectedFirstStates = selectedState
      ? [selectedState, ...stateOptions.filter((stateCode) => stateCode !== selectedState)]
      : stateOptions;
    return selectedFirstStates.slice(0, Math.max(4, selectedState ? 5 : 4));
  }, [selectedState, stateOptions]);
  const hiddenStateCount = Math.max(stateOptions.length - visibleStates.length, 0);
  const visibleMainGroups = useMemo(() => {
    const selectedFirstGroups = selectedMainGroup
      ? [selectedMainGroup, ...mainGroupOptions.filter((group) => group !== selectedMainGroup)]
      : mainGroupOptions;
    return selectedFirstGroups.slice(0, 6);
  }, [mainGroupOptions, selectedMainGroup]);
  const hiddenMainGroupCount = Math.max(mainGroupOptions.length - visibleMainGroups.length, 0);
  const visibleChains = useMemo(() => {
    const selectedFirstChains = selectedChain
      ? [selectedChain, ...chainOptions.filter((chain) => chain !== selectedChain)]
      : chainOptions;
    return selectedFirstChains.slice(0, 6);
  }, [chainOptions, selectedChain]);
  const hiddenChainCount = Math.max(chainOptions.length - visibleChains.length, 0);
  const clearPartyFilters = () => {
    setSelectedState("");
    setMainGroupChoice("");
    setChainChoice("");
  };
  const modalOptions =
    filterModal === "state"
      ? stateOptions
      : filterModal === "mainGroup"
        ? mainGroupOptions
        : chainOptions;
  const modalTitle =
    filterModal === "state"
      ? "Select State"
      : filterModal === "mainGroup"
        ? "Select Main Group"
        : "Select Chain";
  const modalAllLabel =
    filterModal === "state"
      ? "All states"
      : filterModal === "mainGroup"
        ? "All main groups"
        : "All chains";
  const isModalAllActive =
    filterModal === "state"
      ? !selectedState
      : filterModal === "mainGroup"
        ? !selectedMainGroup
        : !selectedChain;
  const isModalOptionActive = (option: string) =>
    filterModal === "state"
      ? selectedState === option
      : filterModal === "mainGroup"
        ? selectedMainGroup === option
        : selectedChain === option;
  const selectModalOption = (option: string) => {
    if (filterModal === "state") setSelectedState(option);
    else if (filterModal === "mainGroup") setMainGroupChoice(option);
    else setChainChoice(option);
    setFilterModal(null);
  };
  const clearModalOption = () => {
    if (filterModal === "state") setSelectedState("");
    else if (filterModal === "mainGroup") setMainGroupChoice("");
    else setChainChoice("");
    setFilterModal(null);
  };
  const formatModalOption = (option: string) =>
    filterModal === "state"
      ? formatStateName(option)
      : filterModal === "mainGroup"
        ? option
        : formatChainName(option);

  /**
   * One filter chip. Three groups use it (state, main group, chain), so it is
   * declared once here rather than repeated with a template-string class.
   */
  const chip = (active: boolean) =>
    cn(
      "cursor-pointer appearance-none rounded-full border px-2.5 py-1 text-[12px] [font-family:inherit] transition-colors",
      active
        ? "border-brand-line bg-brand text-white"
        : "border-line bg-card text-body hover:border-line-strong hover:bg-surface",
    );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent title="Select party" size="xl">
        <DialogHeader>
          <DialogTitle>Select party</DialogTitle>
        </DialogHeader>

        <DialogBody className="grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          {/* -- Filters -- */}
          <aside className="space-y-3">
            <div className="space-y-1.5">
              <SectionHeading>State</SectionHeading>
              <div className="flex flex-wrap gap-1.5" aria-label="State filters">
                <button
                  type="button"
                  className={chip(!selectedState)}
                  onClick={() => setSelectedState("")}
                >
                  All states
                </button>
                {visibleStates.map((vendorState) => (
                  <button
                    type="button"
                    key={vendorState}
                    className={chip(selectedState === vendorState)}
                    onClick={() => setSelectedState(vendorState)}
                  >
                    {formatStateName(vendorState)}
                  </button>
                ))}
                {hiddenStateCount > 0 && (
                  <button
                    type="button"
                    className={chip(false)}
                    onClick={() => setFilterModal("state")}
                  >
                    More +{hiddenStateCount}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <SectionHeading>Main group</SectionHeading>
              <div className="flex flex-wrap gap-1.5" aria-label="Main group filters">
                <button
                  type="button"
                  className={chip(!selectedMainGroup)}
                  onClick={() => setMainGroupChoice("")}
                >
                  All main groups
                </button>
                {visibleMainGroups.map((mainGroup) => (
                  <button
                    type="button"
                    key={mainGroup}
                    className={chip(selectedMainGroup === mainGroup)}
                    onClick={() => setMainGroupChoice(mainGroup)}
                  >
                    {mainGroup}
                  </button>
                ))}
                {hiddenMainGroupCount > 0 && (
                  <button
                    type="button"
                    className={chip(false)}
                    onClick={() => setFilterModal("mainGroup")}
                  >
                    More +{hiddenMainGroupCount}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <SectionHeading>Chain</SectionHeading>
              <div className="flex flex-wrap gap-1.5" aria-label="Chain filters">
                <button
                  type="button"
                  className={chip(!selectedChain)}
                  onClick={() => setChainChoice("")}
                >
                  All chains
                </button>
                {visibleChains.map((chain) => (
                  <button
                    type="button"
                    key={chain}
                    className={chip(selectedChain === chain)}
                    onClick={() => setChainChoice(chain)}
                  >
                    {formatChainName(chain)}
                  </button>
                ))}
                {hiddenChainCount > 0 && (
                  <button
                    type="button"
                    className={chip(false)}
                    onClick={() => setFilterModal("chain")}
                  >
                    More +{hiddenChainCount}
                  </button>
                )}
              </div>
            </div>

            {(selectedState || selectedMainGroup || selectedChain) && (
              <Button size="sm" onClick={clearPartyFilters}>
                Clear filters
              </Button>
            )}
          </aside>

          {/* -- Results -- */}
          <section className="space-y-2">
            <FilterBar className="border-0 bg-transparent p-0">
              <FilterSearch
                value={partyQuery}
                onChange={(event) => setPartyQuery(event.target.value)}
                placeholder="Party, code, state, main group or chain..."
                fieldClassName="min-w-[240px]"
                autoFocus
              />
              <FilterCount>
                {filteredParties.length} part{filteredParties.length === 1 ? "y" : "ies"}
              </FilterCount>
            </FilterBar>

            {state.partyError && <Notice tone="bad">{state.partyError}</Notice>}

            {state.loadingParties ? (
              <div className="space-y-1.5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredParties.length === 0 ? (
              <EmptyState
                icon={HiOutlineUsers}
                title="No customers match"
                hint="Clear a filter, or search the card code on its own."
              />
            ) : (
              <ul className="m-0 max-h-[420px] list-none divide-y divide-line overflow-y-auto rounded-sm border border-line p-0">
                {filteredParties.map((party) => (
                  <li
                    key={
                      party.CardCode +
                      "-" +
                      (party.State1 || "") +
                      "-" +
                      (party.U_Main_Group || "") +
                      "-" +
                      (party.U_Chain || "")
                    }
                  >
                    <button
                      type="button"
                      className="flex w-full cursor-pointer appearance-none items-center justify-between gap-3 border-0 bg-transparent px-3 py-2 text-left [font-family:inherit] text-[13px] transition-colors hover:bg-surface"
                      onClick={() => {
                        state.selectParty(party);
                        onSelect();
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                        {party.CardName}
                      </span>
                      <Badge tone="info">
                        {getPartyOpenOrders(party).toLocaleString("en-IN")} open SO
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </DialogBody>
      </DialogContent>

      {/*
        The "More +N" overflow, as a SECOND dialog rather than a nested
        backdrop inside the first. Radix stacks them and keeps focus in the
        topmost, which the hand-rolled version could not do -- it relied on
        stopPropagation to stop the outer modal closing behind it.
      */}
      <Dialog
        open={Boolean(filterModal)}
        onOpenChange={(next) => {
          if (!next) setFilterModal(null);
        }}
      >
        {filterModal && (
          <DialogContent title={modalTitle} size="md">
            <DialogHeader>
              <DialogTitle>{modalTitle}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={chip(isModalAllActive)}
                  onClick={clearModalOption}
                >
                  {modalAllLabel}
                </button>
                {modalOptions.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={chip(isModalOptionActive(option))}
                    onClick={() => selectModalOption(option)}
                  >
                    {formatModalOption(option)}
                  </button>
                ))}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => setFilterModal(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Dialog>
  );
}

type SkeletonInvoiceProps = {
  state: SalesInvoiceState;
  onOpenParty: () => void;
  onOpenOrders: () => void;
  sourceMode: InvoiceSourceMode | null;
  onOpenItems: () => void;
  itemRows: ItemInvoiceRow[];
  onOpenItemPicker: (rowId: number) => void;
  onOpenBatchPicker: (rowId: number) => void;
  onAddItemRow: () => void;
  onRemoveItemRow: (rowId: number) => void;
  itemDraftError: string;
  onReset: () => void;
  onChangeBranch?: () => void;
};

function InvoiceSourceChoice({
  openSalesOrderCount,
  loadingOrders,
  ordersError,
  onChooseSalesOrder,
  onChooseItems,
}: {
  openSalesOrderCount: number;
  loadingOrders: boolean;
  ordersError: string;
  onChooseSalesOrder: () => void;
  onChooseItems: () => void;
}) {
  const salesOrderMeta = loadingOrders
    ? "Loading open sales orders..."
    : ordersError ||
      `${openSalesOrderCount} open sales ${openSalesOrderCount === 1 ? "order" : "orders"}`;

  return (
    <section aria-label="Invoice source" className="grid gap-4 sm:grid-cols-2">
      {[
        {
          icon: HiOutlineArchiveBox,
          title: "Individual items",
          meta: null as string | null,
          copy: "Pick finished goods directly for this party.",
          onClick: onChooseItems,
        },
        {
          icon: HiOutlineDocumentText,
          title: "Sales order",
          meta: salesOrderMeta,
          copy: "Invoice against this party's open sales orders.",
          onClick: onChooseSalesOrder,
        },
      ].map(({ icon: Icon, title, meta, copy, onClick }) => (
        <button
          key={title}
          type="button"
          /* A big choice card, so it carries the DESIGN_SYSTEM 1.1 reset
             rather than being a `ui/button`. */
          className="group flex cursor-pointer appearance-none flex-col items-start gap-2 rounded-card border border-line bg-card p-5 text-left [font-family:inherit] shadow-card transition-colors hover:border-brand-line hover:bg-brand-soft"
          onClick={onClick}
        >
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-[20px] text-brand"
          >
            <Icon />
          </span>
          <strong className="text-[15px] font-semibold text-ink">{title}</strong>
          {meta && <span className="text-[12px] text-subtle">{meta}</span>}
          <span className="text-[13px] text-body">{copy}</span>
          <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-brand">
            Continue
            <HiOutlineArrowRight aria-hidden="true" />
          </span>
        </button>
      ))}
    </section>
  );
}

function ItemInvoiceLines({
  rows,
  onOpenItemPicker,
  onOpenBatchPicker,
  onAddRow,
  onRemoveRow,
  draftError,
}: {
  rows: ItemInvoiceRow[];
  onOpenItemPicker: (rowId: number) => void;
  onOpenBatchPicker: (rowId: number) => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: number) => void;
  draftError: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionHeading>Individual items</SectionHeading>
          <p className="m-0 mt-0.5 text-[12px] text-subtle">
            Select finished goods directly for this invoice.
          </p>
        </div>
        <Button onClick={onAddRow}>
          <HiOutlinePlus aria-hidden="true" />
          Add item
        </Button>
      </div>

      {draftError && <Notice tone="bad">{draftError}</Notice>}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineArchiveBox}
            title="No items yet"
            hint="Add a row, then choose the finished good it invoices."
            action={
              <Button variant="primary" onClick={onAddRow}>
                <HiOutlinePlus aria-hidden="true" />
                Add item
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 p-0">
          {rows.map((row) => {
            const batchQty =
              row.batch?.batches.reduce((sum, batch) => sum + batch.quantity, 0) || 0;
            const invoiceQty = toFiniteQuantity(row.invoiceQty);
            const batchWarehouse = row.batch?.warehouseCode || "-";
            const availableQty = row.batch
              ? row.batch.warehouseQuantity
              : row.item
                ? getItemTotalQty(row.item)
                : 0;
            const batchQtyMismatch =
              Boolean(row.item) && Math.abs(batchQty - invoiceQty) >= 0.0001;

            return (
              <li
                className={cn(
                  "flex flex-col gap-2 rounded-card border bg-card p-3",
                  batchQtyMismatch ? "border-bad/40" : "border-line",
                )}
                key={row.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-[13px] font-semibold text-ink">
                    {row.item?.ItemName || "Select an item"}
                  </strong>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveRow(row.id)}
                    aria-label={"Remove " + (row.item?.ItemName || "item row")}
                  >
                    <HiOutlineTrash />
                  </Button>
                </div>

                <Button size="sm" className="justify-start" onClick={() => onOpenItemPicker(row.id)}>
                  {row.item?.ItemCode || "Choose an item"}
                </Button>

                <dl className="m-0 flex items-end justify-between gap-3">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-subtle">Quantity</dt>
                    <dd className="m-0 text-[13px] tabular-nums text-ink">
                      {row.item ? row.invoiceQty : "-"}
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-[11px] uppercase tracking-wide text-subtle">Unit price</dt>
                    <dd className="m-0 text-[13px] tabular-nums text-ink">
                      {row.item
                        ? formatMoney(
                            pickItemNumber(row.item, ["Price", "UnitPrice", "PriceBefDi"], 0),
                          )
                        : "-"}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  disabled={!row.item}
                  className={cn(
                    "w-full cursor-pointer appearance-none rounded-sm border px-2.5 py-2 text-left [font-family:inherit] text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    batchQtyMismatch
                      ? "border-bad/40 bg-bad-soft text-bad"
                      : "border-line bg-surface text-body hover:border-line-strong",
                  )}
                  onClick={() => onOpenBatchPicker(row.id)}
                >
                  <span className="block">
                    {row.item
                      ? "Warehouse " +
                        batchWarehouse +
                        " - available " +
                        availableQty.toLocaleString("en-IN")
                      : "Select an item first"}
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
    </div>
  );
}

/**
 * The page chrome.
 *
 * The wizard below it is converted too now — branch gate, party picker, source
 * choice, item lines, open-orders list, both batch pickers and the draft. The
 * step ORDER and every interaction are unchanged: this was a restyle, not a
 * redesign, because people have muscle memory for this form.
 */
function InvoicePageHeader({
  onOpenSkuGallery,
  onReload,
}: {
  onOpenSkuGallery: () => void;
  onReload: () => void;
}) {
  return (
    <PageHeader
      eyebrow="SAP Billing"
      title="Sales Invoice"
      description="Pick a branch and a customer, then build the invoice from open sales orders or from individual items."
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reload"
            title="Reload"
            onClick={onReload}
          >
            <HiOutlineArrowPath aria-hidden="true" />
          </Button>
          <Button onClick={onOpenSkuGallery}>
            <HiOutlinePhoto aria-hidden="true" /> SKU Gallery
          </Button>
        </>
      }
    />
  );
}

function InvoiceDocumentStrip({ state }: { state: SalesInvoiceState }) {
  const [postingDateEditable, setPostingDateEditable] = useState(false);
  const updatePostingDate = (postingDate: string) => {
    state.updateForm({
      postingDate,
      dueDate: postingDate,
      documentDate: postingDate,
    });
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-body">
        Posting date
        <span className="ml-1.5 text-[11px] font-normal text-subtle">
          {postingDateEditable ? "editing" : "double-click to edit"}
        </span>
      </span>
      <Input
        type="date"
        value={state.form.postingDate}
        readOnly={!postingDateEditable}
        className={cn(
          "max-w-[190px]",
          !postingDateEditable && "cursor-default bg-surface-strong",
        )}
        onDoubleClick={(event) => {
          // Captured now: React nulls `currentTarget` once the handler returns.
          const input = event.currentTarget;
          setPostingDateEditable(true);
          window.requestAnimationFrame(() => {
            input.focus();
            try {
              input.showPicker?.();
            } catch {
              /* needs a mutable input + user gesture; ignore if it cannot open */
            }
          });
        }}
        onBlur={() => setPostingDateEditable(false)}
        onChange={(event) => updatePostingDate(event.target.value)}
      />
    </label>
  );
}

function ItemPickerModal({
  onClose,
  onBack,
  onSelect,
  selectingItemCode,
}: {
  onClose: () => void;
  onBack: () => void;
  onSelect: (item: FinishedGoodItem) => void | Promise<void>;
  selectingItemCode: string;
}) {
  const [items, setItems] = useState<FinishedGoodItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedSubGroup, setSelectedSubGroup] = useState("");
  const [selectedVariety, setSelectedVariety] = useState("");
  const [selectedPackSize, setSelectedPackSize] = useState("");
  const [filterModal, setFilterModal] = useState<ItemFilterModal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadItems = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<
          FinishedGoodItem[] | { data?: FinishedGoodItem[]; results?: FinishedGoodItem[] }
        >(hanaUrl("/api/hana/fg-items/"));
        const nextItems = Array.isArray(data) ? data : data.data || data.results || [];
        if (active) setItems(nextItems);
      } catch (err) {
        console.error(err);
        if (active) setError("Unable to load finished goods.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadItems();
    return () => {
      active = false;
    };
  }, []);

  const getFilterOptions = (
    field: keyof FinishedGoodItem,
    filters: Partial<Record<keyof FinishedGoodItem, string>>,
  ) =>
    Object.entries(
      items
        .filter((item) =>
          Object.entries(filters).every(
            ([key, value]) => !value || String(item[key as keyof FinishedGoodItem] || "") === value,
          ),
        )
        .reduce<Record<string, number>>((counts, item) => {
          const value = String(item[field] || "").trim();
          if (!value) return counts;
          counts[value] = (counts[value] || 0) + 1;
          return counts;
        }, {}),
    )
      .sort(
        ([optionA, countA], [optionB, countB]) => countB - countA || optionA.localeCompare(optionB),
      )
      .map(([option]) => option);

  const brandOptions = getFilterOptions("U_Brand", {
    U_Sub_Group: selectedSubGroup,
    U_Variety: selectedVariety,
    U_SKU: selectedPackSize,
  });
  const subGroupOptions = getFilterOptions("U_Sub_Group", {
    U_Brand: selectedBrand,
    U_Variety: selectedVariety,
    U_SKU: selectedPackSize,
  });
  const varietyOptions = getFilterOptions("U_Variety", {
    U_Brand: selectedBrand,
    U_Sub_Group: selectedSubGroup,
    U_SKU: selectedPackSize,
  });
  const packSizeOptions = getFilterOptions("U_SKU", {
    U_Brand: selectedBrand,
    U_Sub_Group: selectedSubGroup,
    U_Variety: selectedVariety,
  });

  useEffect(() => {
    if (selectedBrand && !brandOptions.includes(selectedBrand)) setSelectedBrand("");
    if (selectedSubGroup && !subGroupOptions.includes(selectedSubGroup)) setSelectedSubGroup("");
    if (selectedVariety && !varietyOptions.includes(selectedVariety)) setSelectedVariety("");
    if (selectedPackSize && !packSizeOptions.includes(selectedPackSize)) setSelectedPackSize("");
  }, [
    brandOptions,
    packSizeOptions,
    selectedBrand,
    selectedPackSize,
    selectedSubGroup,
    selectedVariety,
    subGroupOptions,
    varietyOptions,
  ]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    const filterMatches =
      (!selectedBrand || item.U_Brand === selectedBrand) &&
      (!selectedSubGroup || item.U_Sub_Group === selectedSubGroup) &&
      (!selectedVariety || item.U_Variety === selectedVariety) &&
      (!selectedPackSize || item.U_SKU === selectedPackSize);
    const queryMatches =
      !normalizedQuery ||
      [item.ItemCode, item.ItemName, item.U_Brand, item.U_Variety, item.U_Sub_Group, item.U_SKU]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    return filterMatches && queryMatches;
  });

  const clearItemFilters = () => {
    setSelectedBrand("");
    setSelectedSubGroup("");
    setSelectedVariety("");
    setSelectedPackSize("");
  };

  const itemFilterConfig: Record<
    ItemFilterModal,
    {
      allLabel: string;
      options: string[];
      selectedValue: string;
      setSelectedValue: (value: string) => void;
      title: string;
    }
  > = {
    brand: {
      allLabel: "All brands",
      options: brandOptions,
      selectedValue: selectedBrand,
      setSelectedValue: setSelectedBrand,
      title: "Select Brand",
    },
    subGroup: {
      allLabel: "All sub groups",
      options: subGroupOptions,
      selectedValue: selectedSubGroup,
      setSelectedValue: setSelectedSubGroup,
      title: "Select Sub Group",
    },
    variety: {
      allLabel: "All varieties",
      options: varietyOptions,
      selectedValue: selectedVariety,
      setSelectedValue: setSelectedVariety,
      title: "Select Variety",
    },
    packSize: {
      allLabel: "All pack sizes",
      options: packSizeOptions,
      selectedValue: selectedPackSize,
      setSelectedValue: setSelectedPackSize,
      title: "Select Pack Size",
    },
  };
  const activeFilterConfig = filterModal ? itemFilterConfig[filterModal] : null;
  const selectItemFilterModalOption = (option: string) => {
    activeFilterConfig?.setSelectedValue(option);
    setFilterModal(null);
  };
  const clearItemFilterModalOption = () => {
    activeFilterConfig?.setSelectedValue("");
    setFilterModal(null);
  };

  /** One filter chip, shared by the four groups and the overflow dialog. */
  const chip = (active: boolean) =>
    cn(
      "cursor-pointer appearance-none rounded-full border px-2.5 py-1 text-[12px] [font-family:inherit] transition-colors",
      active
        ? "border-brand-line bg-brand text-white"
        : "border-line bg-card text-body hover:border-line-strong hover:bg-surface",
    );

  const renderFilterChips = (
    filterKey: ItemFilterModal,
    label: string,
    allLabel: string,
    options: string[],
    selectedValue: string,
    setSelectedValue: (value: string) => void,
  ) => {
    const visibleOptions = options.slice(0, 6);
    const hiddenCount = Math.max(options.length - visibleOptions.length, 0);

    return (
      <div className="space-y-1.5" aria-label={label + " filters"}>
        <SectionHeading>{label}</SectionHeading>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={chip(!selectedValue)}
            onClick={() => setSelectedValue("")}
          >
            {allLabel}
          </button>
          {visibleOptions.map((option) => (
            <button
              type="button"
              key={option}
              className={chip(selectedValue === option)}
              onClick={() => setSelectedValue(option)}
            >
              {option}
            </button>
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              className={chip(false)}
              onClick={() => setFilterModal(filterKey)}
            >
              More +{hiddenCount}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent title="Finished goods" size="xl">
        <DialogHeader>
          <DialogTitle>Finished goods</DialogTitle>
        </DialogHeader>

        <DialogBody className="grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <aside className="space-y-3">
            {renderFilterChips(
              "brand",
              "Brand",
              "All brands",
              brandOptions,
              selectedBrand,
              setSelectedBrand,
            )}
            {renderFilterChips(
              "subGroup",
              "Sub group",
              "All sub groups",
              subGroupOptions,
              selectedSubGroup,
              setSelectedSubGroup,
            )}
            {renderFilterChips(
              "variety",
              "Variety",
              "All varieties",
              varietyOptions,
              selectedVariety,
              setSelectedVariety,
            )}
            {renderFilterChips(
              "packSize",
              "Pack size",
              "All pack sizes",
              packSizeOptions,
              selectedPackSize,
              setSelectedPackSize,
            )}
            {(selectedBrand || selectedSubGroup || selectedVariety || selectedPackSize) && (
              <Button size="sm" onClick={clearItemFilters}>
                Clear filters
              </Button>
            )}
          </aside>

          <section className="space-y-2">
            <FilterBar className="border-0 bg-transparent p-0">
              <FilterSearch
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Item name, code, brand, variety, group or SKU..."
                fieldClassName="min-w-[240px]"
                autoFocus
              />
              <FilterCount>
                {filteredItems.length} item{filteredItems.length === 1 ? "" : "s"}
              </FilterCount>
            </FilterBar>

            {error && <Notice tone="bad">{error}</Notice>}

            {loading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon={HiOutlineArchiveBox}
                title="No items match"
                hint="Clear a filter, or search the item code on its own."
              />
            ) : (
              <ul className="m-0 max-h-[420px] list-none divide-y divide-line overflow-y-auto rounded-sm border border-line p-0">
                {filteredItems.map((item) => (
                  <li key={item.ItemCode}>
                    <button
                      type="button"
                      disabled={selectingItemCode === item.ItemCode}
                      className="flex w-full cursor-pointer appearance-none items-center justify-between gap-3 border-0 bg-transparent px-3 py-2 text-left [font-family:inherit] text-[13px] transition-colors hover:bg-surface disabled:cursor-wait disabled:opacity-60"
                      onClick={() => onSelect(item)}
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                        {item.ItemName}
                      </span>
                      <span className="shrink-0 text-[11.5px] tabular-nums text-subtle">
                        {selectingItemCode === item.ItemCode
                          ? "Fetching price..."
                          : "Qty " + getItemTotalQty(item).toLocaleString("en-IN")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onBack}>Back</Button>
        </DialogFooter>
      </DialogContent>

      {/* The "More +N" overflow, stacked as a second dialog. */}
      <Dialog
        open={Boolean(activeFilterConfig)}
        onOpenChange={(next) => {
          if (!next) setFilterModal(null);
        }}
      >
        {activeFilterConfig && (
          <DialogContent title={activeFilterConfig.title} size="md">
            <DialogHeader>
              <DialogTitle>{activeFilterConfig.title}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={chip(!activeFilterConfig.selectedValue)}
                  onClick={clearItemFilterModalOption}
                >
                  {activeFilterConfig.allLabel}
                </button>
                {activeFilterConfig.options.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={chip(activeFilterConfig.selectedValue === option)}
                    onClick={() => selectItemFilterModalOption(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => setFilterModal(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Dialog>
  );
}

const formatBatchDate = (value?: string | null) => {
  if (!value) return "-";
  const dateOnly = value.split("T")[0]?.split(" ")[0] || value;
  const [year, month, day] = dateOnly.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
};

const toFiniteQuantity = (value: unknown, fallback = 1) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getBatchSortTime = (batch: BatchDetail) => {
  const expTime = batch.ExpDate ? new Date(batch.ExpDate).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isFinite(expTime)) return expTime;
  const inTime = batch.InDate ? new Date(batch.InDate).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(inTime) ? inTime : Number.POSITIVE_INFINITY;
};

const allocateFefoBatches = (batches: BatchDetail[], requiredQty: number) => {
  let remainingQty = toFiniteQuantity(requiredQty);
  const allocations: SelectedBatch["batches"] = [];

  [...batches]
    .filter((batch) => Number(batch.Quantity || 0) > 0)
    .sort((batchA, batchB) => getBatchSortTime(batchA) - getBatchSortTime(batchB))
    .some((batch) => {
      const quantity = Math.min(remainingQty, Number(batch.Quantity || 0));
      if (quantity > 0) {
        allocations.push({ batch, quantity });
        remainingQty -= quantity;
      }
      return remainingQty <= 0;
    });

  return allocations;
};

const pickItemNumber = (item: FinishedGoodItem, keys: string[], fallback = 0) => {
  const source = item as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const pickRecordNumber = (
  source: Record<string, unknown>,
  keys: string[],
  fallback: number | null = null,
) => {
  for (const key of keys) {
    const parsed = Number(source[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const pickRecordText = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
};

const unwrapItemPriceRecord = (data: ItemPriceApiResponse): ItemPriceRecord | null => {
  if (Array.isArray(data)) return data[0] || null;
  const wrappedData = data.data;
  if (Array.isArray(wrappedData)) return wrappedData[0] || null;
  if (wrappedData && typeof wrappedData === "object") return wrappedData as ItemPriceRecord;
  const wrappedResults = data.results;
  if (Array.isArray(wrappedResults)) return wrappedResults[0] || null;
  if (wrappedResults && typeof wrappedResults === "object")
    return wrappedResults as ItemPriceRecord;
  return data as ItemPriceRecord;
};

const mergeItemPrice = (item: FinishedGoodItem, priceRecord: ItemPriceRecord | null) => {
  if (!priceRecord) return item;
  const source = priceRecord as Record<string, unknown>;
  const price = pickRecordNumber(source, ["Price", "UnitPrice", "Unit_Price", "price", "Rate"]);
  const priceBeforeDiscount = pickRecordNumber(
    source,
    ["PriceBefDi", "PriceBeforeDiscount", "Price_Bef_Di", "Price", "UnitPrice", "price"],
    price,
  );
  const taxCode = pickRecordText(source, ["TaxCode", "VatGroup", "Tax_Code"]);
  const taxPercent = pickRecordNumber(source, ["VatPrcnt", "TaxPercent", "Tax_Percent"]);
  const discountPercent = pickRecordNumber(source, [
    "DiscPrcnt",
    "DiscountPercent",
    "Discount_Percent",
  ]);

  return {
    ...item,
    ...(price !== null ? { Price: price, UnitPrice: price } : {}),
    ...(priceBeforeDiscount !== null ? { PriceBefDi: priceBeforeDiscount } : {}),
    ...(taxCode ? { TaxCode: taxCode, VatGroup: taxCode } : {}),
    ...(taxPercent !== null ? { VatPrcnt: taxPercent } : {}),
    ...(discountPercent !== null ? { DiscPrcnt: discountPercent } : {}),
  };
};

const pickItemText = (item: FinishedGoodItem, keys: string[]) => {
  const source = item as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
};

const getBatchDateTokens = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return new Set<string>();

  const tokens = new Set([text.toLowerCase().replace(/[^a-z0-9]/g, "")]);
  const dateOnly = text.split("T")[0]?.split(" ")[0] || text;
  const parts = dateOnly
    .split(/[/-]/)
    .map((part) => part.trim())
    .filter(Boolean);

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
  const dateTokens = [batch.ExpDate, batch.PrdDate, batch.InDate].reduce<Set<string>>(
    (tokens, dateValue) => {
      getBatchDateTokens(dateValue).forEach((token) => tokens.add(token));
      return tokens;
    },
    new Set(),
  );

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

  let dateLikeFallback = "";
  for (const key of candidateKeys) {
    const value = String(source[key] ?? "").trim();
    if (!value) continue;
    if (!isBatchDateValue(value, batch)) return value;
    if (!dateLikeFallback) dateLikeFallback = value;
  }

  // Some batches are legitimately named after a date (e.g. "06/06/2026").
  // Prefer a non-date identifier, but never drop the batch number entirely.
  return dateLikeFallback;
};

const getBatchSystemSerialNumber = (batch: BatchDetail) => {
  const value = batch.SystemSerialNumber ?? batch.SysNumber ?? batch.AbsEntry;
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
};

const getItemRowsValidationError = (rows: ItemInvoiceRow[]) => {
  const selectedRows = rows.filter((row) => row.item);
  if (selectedRows.length === 0) return "Select at least one item.";

  const rowWithoutBatch = selectedRows.find(
    (row) => !row.batch?.warehouseCode || row.batch.batches.length === 0,
  );
  if (rowWithoutBatch)
    return `Choose batches for ${rowWithoutBatch.item?.ItemName || "every selected item"}.`;

  const mismatchedRow = selectedRows.find((row) => {
    const invoiceQty = toFiniteQuantity(row.invoiceQty);
    const batchQty =
      row.batch?.batches.reduce((sum, allocation) => sum + allocation.quantity, 0) || 0;
    const displayedBatchQty = row.batch?.warehouseQuantity || batchQty;
    return displayedBatchQty + 0.0001 < invoiceQty || batchQty + 0.0001 < invoiceQty;
  });
  if (mismatchedRow)
    return `Batch quantity must be at least invoice quantity for ${mismatchedRow.item?.ItemName || "each item"}.`;

  return "";
};

const itemRowsToSelectedLines = (rows: ItemInvoiceRow[]): SelectedLine[] =>
  rows
    .filter((row): row is ItemInvoiceRow & { item: FinishedGoodItem; batch: SelectedBatch } =>
      Boolean(row.item && row.batch),
    )
    .map((row) => {
      const invoiceQty = toFiniteQuantity(row.invoiceQty);
      const price = pickItemNumber(row.item, ["Price", "UnitPrice", "U_Price", "PriceBefDi"], 0);
      const priceBeforeDiscount = pickItemNumber(
        row.item,
        ["PriceBefDi", "PriceBeforeDiscount", "Price"],
        price,
      );
      const taxCode = pickItemText(row.item, ["TaxCode", "VatGroup", "Tax_Code"]);
      const openQty = Math.max(row.batch.warehouseQuantity || invoiceQty, invoiceQty);

      return {
        SourceType: "items",
        DocEntry: -1,
        DocNum: 0,
        LineNum: row.id,
        ItemCode: row.item.ItemCode,
        Dscription: row.item.ItemName,
        OpenQty: openQty,
        Price: price,
        PriceBefDi: priceBeforeDiscount,
        DiscPrcnt: pickItemNumber(row.item, ["DiscPrcnt", "DiscountPercent"], 0),
        VatPrcnt: pickItemNumber(row.item, ["VatPrcnt", "TaxPercent"], 0),
        TaxCode: taxCode,
        WhsCode: row.batch.warehouseCode,
        invoiceQty,
        BatchNumbers: row.batch.batches
          .map(({ batch, quantity }) => {
            const systemSerialNumber = getBatchSystemSerialNumber(batch);
            const batchNumber = getBatchNumber(batch);
            return {
              ...(batchNumber ? { BatchNumber: batchNumber } : {}),
              ...(systemSerialNumber !== undefined
                ? { SystemSerialNumber: systemSerialNumber }
                : {}),
              Quantity: quantity,
            };
          })
          .filter(
            (batch) =>
              (batch.BatchNumber || batch.SystemSerialNumber !== undefined) && batch.Quantity > 0,
          ),
      };
    });

function BatchPickerModal({
  item,
  invoiceQty,
  selectedBatch,
  onBack,
  onClose,
  onSelect,
  onQuantityChange,
  onCreateDraft,
  canCreateDraft,
  creatingDraft,
  draftError,
}: {
  item: FinishedGoodItem;
  invoiceQty: number;
  selectedBatch: SelectedBatch | null;
  onBack: () => void;
  onClose: () => void;
  onSelect: (batch: SelectedBatch) => void;
  onQuantityChange: (quantity: number) => void;
  onCreateDraft: () => void;
  canCreateDraft: boolean;
  creatingDraft: boolean;
  draftError: string;
}) {
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [selectedWhsCode, setSelectedWhsCode] = useState(selectedBatch?.warehouseCode || "");
  const [batches, setBatches] = useState<BatchDetail[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [error, setError] = useState("");
  const lastAppliedBatchSignature = useRef("");

  useEffect(() => {
    let active = true;

    const loadWarehouses = async () => {
      setLoadingWarehouses(true);
      setError("");
      try {
        const data = await apiFetch<InventoryWarehouse[]>(
          hanaUrl(`/api/hana/inventory-details/?item_code=${encodeURIComponent(item.ItemCode)}`),
        );
        const nextWarehouses = Array.isArray(data) ? data : [];
        if (!active) return;
        setWarehouses(nextWarehouses);
        setSelectedWhsCode((current) =>
          current && nextWarehouses.some((warehouse) => warehouse.WhsCode === current)
            ? current
            : "",
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
  }, [item.ItemCode]);

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
          hanaUrl(
            `/api/hana/batch-details/?item_code=${encodeURIComponent(item.ItemCode)}&whs_code=${encodeURIComponent(selectedWhsCode)}`,
          ),
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
  }, [item.ItemCode, selectedWhsCode]);

  const selectedWarehouse =
    warehouses.find((warehouse) => warehouse.WhsCode === selectedWhsCode) || null;
  const selectedWarehouseQuantity = Number(selectedWarehouse?.["SUM(Quantity)"] || 0);
  const unitPrice = pickItemNumber(item, ["Price", "UnitPrice", "PriceBefDi"], 0);
  const allocations = allocateFefoBatches(batches, invoiceQty);
  const allocatedQty = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
  const displayedBatchQty = selectedWarehouseQuantity || allocatedQty;
  const batchAllocationMatches = allocatedQty + 0.0001 >= invoiceQty;
  const quantityMatches =
    selectedWarehouseQuantity > 0 &&
    selectedWarehouseQuantity + 0.0001 >= invoiceQty &&
    batchAllocationMatches;
  const cannotCreateDraft =
    !quantityMatches || !canCreateDraft || creatingDraft || loadingBatches || loadingWarehouses;
  const batchSignature = `${selectedWhsCode}|${invoiceQty}|${allocations
    .map((allocation) => `${allocation.batch.BatchNum}:${allocation.quantity}`)
    .join("|")}`;

  useEffect(() => {
    if (!selectedWhsCode || loadingBatches || batches.length === 0) return;
    if (lastAppliedBatchSignature.current === batchSignature) return;
    lastAppliedBatchSignature.current = batchSignature;
    onSelect({
      warehouseCode: selectedWhsCode,
      warehouseQuantity: selectedWarehouseQuantity,
      batches: allocations,
    });
  }, [batchSignature, batches.length, loadingBatches, selectedWarehouseQuantity, selectedWhsCode]);

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
                {item.ItemCode}
              </span>
              {item.ItemName}
            </span>
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="grid gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
          <aside className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <SectionHeading>Warehouse stock</SectionHeading>
              <span className="text-[11.5px] text-subtle">
                {loadingWarehouses ? "..." : warehouses.length + " warehouses"}
              </span>
            </div>

            {loadingWarehouses ? (
              <div className="space-y-1.5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : warehouses.length === 0 ? (
              <p className="m-0 rounded-sm border border-line bg-surface px-3 py-4 text-center text-[12px] text-subtle">
                No warehouse stock found.
              </p>
            ) : (
              <ul className="m-0 max-h-[300px] list-none space-y-1.5 overflow-y-auto p-0">
                {warehouses.map((warehouse) => {
                  const quantity = Number(warehouse["SUM(Quantity)"] || 0);
                  const active = selectedWhsCode === warehouse.WhsCode;
                  return (
                    <li key={warehouse.WhsCode}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full cursor-pointer appearance-none items-center justify-between gap-2 rounded-sm border p-2.5 text-left [font-family:inherit] text-[13px] transition-colors",
                          active
                            ? "border-brand-line bg-brand-soft"
                            : "border-line bg-card hover:bg-surface",
                        )}
                        aria-current={active ? "true" : undefined}
                        onClick={() => setSelectedWhsCode(warehouse.WhsCode)}
                      >
                        <span className="font-semibold text-ink">{warehouse.WhsCode}</span>
                        <span className="tabular-nums text-body">
                          {quantity.toLocaleString("en-IN")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <SectionHeading>Batches</SectionHeading>
              <span className="text-[11.5px] text-subtle">
                {selectedWhsCode || "Select a warehouse"}
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <Field label="Invoice quantity">
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    min="1"
                    value={invoiceQty}
                    className="w-32 text-right tabular-nums"
                    onChange={(event) => onQuantityChange(toFiniteQuantity(event.target.value))}
                  />
                )}
              </Field>
              <span>
                <span className="block text-[11px] uppercase tracking-wide text-subtle">
                  Unit price
                </span>
                <strong className="text-[15px] font-bold tabular-nums text-ink">
                  {formatMoney(unitPrice)}
                </strong>
              </span>
            </div>

            {/* SAP rejects a batch-managed line whose batch quantity does not
                equal its invoice quantity, so this is the gate on Create Draft. */}
            <Notice tone={quantityMatches ? "ok" : "bad"}>
              <span className="tabular-nums">
                Invoice qty {invoiceQty.toLocaleString("en-IN")} - batch qty{" "}
                {displayedBatchQty.toLocaleString("en-IN")}
              </span>
            </Notice>

            {error && <Notice tone="bad">{error}</Notice>}
            {draftError && <Notice tone="bad">{draftError}</Notice>}

            {!selectedWhsCode ? (
              <p className="m-0 rounded-sm border border-line bg-surface px-3 py-4 text-center text-[12px] text-subtle">
                Select a warehouse to view batches.
              </p>
            ) : loadingBatches ? (
              <Skeleton className="h-24 w-full" aria-label="Loading batches" />
            ) : batches.length === 0 ? (
              <p className="m-0 rounded-sm border border-line bg-surface px-3 py-4 text-center text-[12px] text-subtle">
                No batches found for this warehouse.
              </p>
            ) : (
              <div className="max-h-[240px] overflow-auto rounded-sm border border-line">
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Expiration date</TableHead>
                      <TableHead className="text-right">Batch qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((batch) => (
                      <TableRow
                        key={
                          batch.BatchNum +
                          "-" +
                          (batch.BaseEntry || "") +
                          "-" +
                          (batch.InDate || "")
                        }
                      >
                        <TableCell>{formatBatchDate(batch.ExpDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(batch.Quantity || 0).toLocaleString("en-IN")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </DialogBody>

        <DialogFooter>
          <Button className="mr-auto" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="primary"
            disabled={cannotCreateDraft}
            title={quantityMatches ? undefined : "Batch quantity must match the invoice quantity."}
            onClick={onCreateDraft}
          >
            {creatingDraft ? "Creating..." : "Create draft"}
            <HiOutlineArrowRight aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SkeletonInvoice({
  state,
  onOpenParty,
  onOpenOrders,
  sourceMode,
  onOpenItems,
  itemRows,
  onOpenItemPicker,
  onOpenBatchPicker,
  onAddItemRow,
  onRemoveItemRow,
  itemDraftError,
  onReset,
  onChangeBranch,
}: SkeletonInvoiceProps) {
  const partyLabel = state.selectedParty ? state.selectedParty.CardName : "Select Party";

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <BranchBadge branch={state.branch} onChange={onChangeBranch} />
          <p className="m-0 mt-1.5 text-[11px] uppercase tracking-wide text-subtle">Party</p>
          {state.selectedParty ? (
            <strong className="block text-[16px] font-semibold text-ink">{partyLabel}</strong>
          ) : (
            <Button variant="primary" className="mt-1" onClick={onOpenParty}>
              {partyLabel}
            </Button>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {state.selectedParty && sourceMode === "sales-order" && (
              <Button size="xs" variant="primary" onClick={onOpenOrders}>
                Select open SO ({state.salesOrders.length})
              </Button>
            )}
            {state.selectedParty && sourceMode === "items" && (
              <Button size="xs" variant="primary" onClick={onOpenItems}>
                Add items
              </Button>
            )}
            {state.selectedParty && (
              <Button size="xs" onClick={onReset}>
                Change party
              </Button>
            )}
          </div>
        </div>
        <InvoiceDocumentStrip state={state} />
      </Card>

      {sourceMode === "items" && state.selectedParty ? (
        <ItemInvoiceLines
          rows={itemRows}
          onOpenItemPicker={onOpenItemPicker}
          onOpenBatchPicker={onOpenBatchPicker}
          onAddRow={onAddItemRow}
          onRemoveRow={onRemoveItemRow}
          draftError={itemDraftError}
        />
      ) : (
        <Card>
          <EmptyState
            icon={HiOutlineDocumentText}
            title={
              !state.selectedParty
                ? "Select a party to begin"
                : !sourceMode
                  ? "Choose what to invoice against"
                  : "No lines yet"
            }
            hint={
              !state.selectedParty
                ? "Everything below loads for the customer you pick."
                : !sourceMode
                  ? "Invoice against open sales orders, or against individual items."
                  : "Pick open sales orders to fill the invoice lines."
            }
          />
        </Card>
      )}
    </div>
  );
}

export default function SalesInvoiceWizard() {
  const state = useSalesInvoice();
  const navigate = useNavigate();
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [itemPickerRowId, setItemPickerRowId] = useState<number | null>(null);
  const [batchPickerRowId, setBatchPickerRowId] = useState<number | null>(null);
  const [sourceMode, setSourceMode] = useState<InvoiceSourceMode | null>(null);
  const [itemRows, setItemRows] = useState<ItemInvoiceRow[]>([
    { id: 1, type: "Item", item: null, invoiceQty: 1, batch: null },
  ]);
  const [itemDraftError, setItemDraftError] = useState("");
  const [confirmChangeBranch, setConfirmChangeBranch] = useState(false);
  const [creatingItemDraft, setCreatingItemDraft] = useState(false);
  const [pricingItemCode, setPricingItemCode] = useState("");

  useEffect(() => {
    if (
      sourceMode === "sales-order" &&
      state.selectedParty &&
      state.step === 2 &&
      !state.customerDetails
    ) {
      setOrdersModalOpen(true);
    }
  }, [sourceMode, state.customerDetails, state.selectedParty, state.step]);

  const openOrdersModal = () => {
    if (!state.selectedParty) return;
    setSourceMode("sales-order");
    setItemDraftError("");
    setSourceModalOpen(false);
    setItemPickerRowId(null);
    setBatchPickerRowId(null);
    setOrdersModalOpen(true);
  };

  const getNextAddItemRowId = () => {
    const emptyRow = itemRows.find((row) => !row.item);
    return emptyRow?.id || Math.max(0, ...itemRows.map((row) => row.id)) + 1;
  };

  const chooseItems = () => {
    if (!state.selectedParty) return;
    closeOrdersModal();
    setSourceMode("items");
    setItemDraftError("");
    setSourceModalOpen(false);
    state.loadPartyAddresses();
    setItemPickerRowId(getNextAddItemRowId());
  };

  const openItemsModal = () => {
    if (!state.selectedParty) return;
    setSourceMode("items");
    setItemDraftError("");
    setItemPickerRowId(getNextAddItemRowId());
  };

  const closeOrdersModal = () => {
    setOrdersModalOpen(false);
  };

  const closeSourceModal = () => {
    setSourceModalOpen(false);
  };

  const closeItemPicker = () => {
    setItemPickerRowId(null);
  };

  const closeBatchPicker = () => {
    setBatchPickerRowId(null);
  };

  const openPartyModal = () => {
    setPartyModalOpen(true);
  };

  const closePartyModal = () => {
    setPartyModalOpen(false);
  };

  const resetInvoiceFlow = (openParty = true) => {
    closePartyModal();
    closeOrdersModal();
    closeSourceModal();
    closeItemPicker();
    closeBatchPicker();
    setSourceMode(null);
    setItemRows([{ id: 1, type: "Item", item: null, invoiceQty: 1, batch: null }]);
    setItemDraftError("");
    setCreatingItemDraft(false);
    setPricingItemCode("");
    state.changeParty();
    if (openParty) setPartyModalOpen(true);
  };

  /*
   * Return to the branch gate — clears the current invoice first.
   *
   * Offered only when the user's categories permit more than one branch;
   * otherwise the gate would immediately re-answer itself and the Change
   * control would look broken.
   */
  const handleChangeBranch = state.canChangeBranch
    ? () => setConfirmChangeBranch(true)
    : undefined;

  const confirmBranchChange = () => {
    setConfirmChangeBranch(false);
    resetInvoiceFlow(false);
    state.changeBranch();
  };

  /*
   * The gate's options, narrowed to what this user's categories permit.
   *
   * No usable category (none assigned, or only MART) leaves the list at both,
   * which is the original behaviour and the only safe answer when we cannot
   * narrow it. Exactly one never reaches here — the hook pre-selects it and
   * the gate does not render.
   */
  const branchOptions = [
    { key: "OIL" as const, label: "Oil", icon: HiOutlineBeaker },
    { key: "BEVERAGE" as const, label: "Beverage", icon: HiOutlineSparkles },
  ].filter(
    ({ key }) =>
      state.allowedBranches.length === 0 || state.allowedBranches.includes(key),
  );

  const createDraftFromSelectedOrders = async () => {
    const ok = await state.proceedToDraft();
    if (ok) closeOrdersModal();
  };

  const backToPartyModal = () => {
    closeOrdersModal();
    closeSourceModal();
    closeItemPicker();
    closeBatchPicker();
    setSourceMode(null);
    setPartyModalOpen(true);
  };

  const addItemRow = () => {
    setItemDraftError("");
    setItemPickerRowId(getNextAddItemRowId());
  };

  const removeItemRow = (rowId: number) => {
    setItemDraftError("");
    setItemRows((current) => {
      const nextRows = current.filter((row) => row.id !== rowId);
      return nextRows.length > 0
        ? nextRows
        : [{ id: 1, type: "Item", item: null, invoiceQty: 1, batch: null }];
    });
    setItemPickerRowId((current) => (current === rowId ? null : current));
    setBatchPickerRowId((current) => (current === rowId ? null : current));
  };

  const openBatchPicker = (rowId: number) => {
    const row = itemRows.find((itemRow) => itemRow.id === rowId);
    if (!row?.item) return;
    setBatchPickerRowId(rowId);
  };

  const fetchItemWithCustomerPrice = async (item: FinishedGoodItem) => {
    const priceList = toFiniteQuantity(state.selectedParty?.ListNum, 1);
    const data = await apiFetch<ItemPriceApiResponse>(
      hanaUrl(
        `/api/hana/item-price/?item_code=${encodeURIComponent(item.ItemCode)}&price_list=${encodeURIComponent(String(priceList))}`,
      ),
    );
    return mergeItemPrice(item, unwrapItemPriceRecord(data));
  };

  const selectItemForRow = async (item: FinishedGoodItem) => {
    if (itemPickerRowId === null || pricingItemCode) return;
    const rowId = itemPickerRowId;
    setItemDraftError("");
    setPricingItemCode(item.ItemCode);

    let pricedItem: FinishedGoodItem;
    try {
      pricedItem = await fetchItemWithCustomerPrice(item);
    } catch (err) {
      console.error(err);
      setItemDraftError(`Unable to load item price for ${item.ItemCode}.`);
      setPricingItemCode("");
      return;
    }

    setItemRows((current) => {
      const existingRow = current.find((row) => row.id === rowId);
      if (!existingRow)
        return [
          ...current,
          { id: rowId, type: "Item", item: pricedItem, invoiceQty: 1, batch: null },
        ];
      return current.map((row) =>
        row.id === rowId
          ? { ...row, item: pricedItem, invoiceQty: row.invoiceQty || 1, batch: null }
          : row,
      );
    });
    setPricingItemCode("");
    closeItemPicker();
    setBatchPickerRowId(rowId);
  };

  const selectBatchForRow = (batch: SelectedBatch) => {
    if (batchPickerRowId === null) return;
    setItemDraftError("");
    setItemRows((current) =>
      current.map((row) => (row.id === batchPickerRowId ? { ...row, batch } : row)),
    );
  };

  const itemRowsValidationError = getItemRowsValidationError(itemRows);
  const createDraftFromItems = async () => {
    const validationError = getItemRowsValidationError(itemRows);
    if (validationError) {
      setItemDraftError(validationError);
      return;
    }

    setCreatingItemDraft(true);
    setItemDraftError("");
    try {
      const ok = await state.proceedToDraftFromItems(itemRowsToSelectedLines(itemRows));
      if (ok) {
        closeItemPicker();
        closeBatchPicker();
      } else {
        setItemDraftError("Unable to create draft from selected items.");
      }
    } finally {
      setCreatingItemDraft(false);
    }
  };

  const showOrdersModal = Boolean(state.selectedParty) && ordersModalOpen;
  const showSourceModal = Boolean(state.selectedParty) && sourceModalOpen;
  const showItemPickerModal = Boolean(state.selectedParty) && itemPickerRowId !== null;
  const batchPickerRow = itemRows.find((row) => row.id === batchPickerRowId) || null;
  const showBatchPickerModal = Boolean(state.selectedParty && batchPickerRow?.item);
  const showDraft = Boolean(state.selectedParty && state.step === 4);
  const openSalesOrderCount = state.salesOrders.length;

  return (
    /*
     * The whole wizard is on the design system now — the branch gate, the
     * party picker, the source choice, the item lines, the open-orders list,
     * the batch pickers and the draft. `Sales_Invoice.css` has no importer
     * left.
     */
    <Page>
      <Breadcrumbs items={[{ label: "Invoices" }, { label: "Sales Invoice" }]} />

      <InvoicePageHeader
        onReload={() => window.location.reload()}
        onOpenSkuGallery={() => navigate("/Sales_Invoice/SKU_Images")}
      />

      {/* Branch gate — everything downstream (customers, orders, prices,
          stock) is branch-specific, so nothing loads until one is chosen. */}
      {/* Branch gate - everything downstream (customers, orders, prices,
          stock) is branch-specific, so nothing loads until one is chosen.
          Not dismissible: there is no usable state behind it. */}
      <Dialog open={!state.branch}>
        {!state.branch && (
          <DialogContent
            title="Select a branch"
            size="sm"
            showClose={false}
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader className="items-start">
              <div className="min-w-0">
                <DialogTitle>Select a branch</DialogTitle>
                <DialogDescription>
                  Customers, orders, prices and stock all load for the branch you pick.
                </DialogDescription>
              </div>
            </DialogHeader>
            <DialogBody>
              <div className="grid grid-cols-2 gap-3">
                {branchOptions.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    className="flex cursor-pointer appearance-none flex-col items-center gap-2 rounded-card border border-line bg-card p-5 [font-family:inherit] transition-colors hover:border-brand-line hover:bg-brand-soft"
                    onClick={() => state.selectBranch(key)}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-[20px] text-brand"
                    >
                      <Icon />
                    </span>
                    <strong className="text-[14px] font-semibold text-ink">{label}</strong>
                  </button>
                ))}
              </div>
            </DialogBody>
          </DialogContent>
        )}
      </Dialog>

      {/* Switching branch throws away the invoice in progress, so it asks
          first. This was a window.confirm. */}
      <Dialog open={confirmChangeBranch} onOpenChange={setConfirmChangeBranch}>
        {confirmChangeBranch && (
          <DialogContent title="Change branch" size="sm">
            <DialogHeader className="items-start">
              <div className="min-w-0">
                <DialogTitle>Change branch?</DialogTitle>
                <DialogDescription>
                  The current invoice is cleared — the party, the selected orders and
                  any lines you have added.
                </DialogDescription>
              </div>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setConfirmChangeBranch(false)}>Keep working</Button>
              <Button variant="danger" onClick={confirmBranchChange}>
                Clear and change branch
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {!showDraft && (
        <SkeletonInvoice
          state={state}
          onOpenParty={openPartyModal}
          onOpenOrders={openOrdersModal}
          sourceMode={sourceMode}
          onOpenItems={openItemsModal}
          itemRows={itemRows}
          onOpenItemPicker={setItemPickerRowId}
          onOpenBatchPicker={openBatchPicker}
          onAddItemRow={addItemRow}
          onRemoveItemRow={removeItemRow}
          itemDraftError={itemDraftError || state.draftError}
          onReset={resetInvoiceFlow}
          onChangeBranch={handleChangeBranch}
        />
      )}

      {showDraft && (
        <DraftStep
          state={state}
          onReset={resetInvoiceFlow}
          onCreateNew={() => resetInvoiceFlow(false)}
          onAddItems={sourceMode === "items" ? openItemsModal : undefined}
          onChangeBranch={handleChangeBranch}
        />
      )}

      {partyModalOpen && (
        <PartyPickerModal
          state={state}
          onClose={closePartyModal}
          onSelect={() => {
            setSourceMode(null);
            closePartyModal();
            setSourceModalOpen(true);
          }}
        />
      )}

      <Dialog
        open={Boolean(showSourceModal)}
        onOpenChange={(next) => {
          if (!next) setSourceModalOpen(false);
        }}
      >
        {showSourceModal && (
          <DialogContent title="Invoice against" size="lg">
            <DialogHeader>
              <DialogTitle>
                <span className="flex flex-col">
                  <span className="text-[11px] font-normal uppercase tracking-wide text-subtle">
                    Invoice against
                  </span>
                  {state.selectedParty?.CardName}
                  <span className="font-mono text-[12px] font-normal text-subtle">
                    {state.selectedParty?.CardCode}
                  </span>
                </span>
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <InvoiceSourceChoice
                openSalesOrderCount={openSalesOrderCount}
                loadingOrders={state.loadingOrders}
                ordersError={state.ordersError}
                onChooseSalesOrder={openOrdersModal}
                onChooseItems={chooseItems}
              />
            </DialogBody>
            <DialogFooter>
              <Button onClick={backToPartyModal}>Back to parties</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(showOrdersModal)}
        onOpenChange={(next) => {
          if (!next) setOrdersModalOpen(false);
        }}
      >
        {showOrdersModal && (
          <DialogContent title="Open sales orders" size="xl">
            <DialogHeader>
              <DialogTitle>
                <span className="flex flex-col">
                  <span className="text-[11px] font-normal uppercase tracking-wide text-subtle">
                    Open sales orders
                  </span>
                  {state.selectedParty?.CardName}
                  <span className="font-mono text-[12px] font-normal text-subtle">
                    {state.selectedParty?.CardCode} - {openSalesOrderCount} open{" "}
                    {openSalesOrderCount === 1 ? "order" : "orders"}
                  </span>
                </span>
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <OrdersStep
                state={state}
                continueLabel="Create draft"
                continueLoadingLabel="Creating draft..."
                onContinue={createDraftFromSelectedOrders}
              />
            </DialogBody>
            <DialogFooter>
              <Button onClick={backToPartyModal}>Back to parties</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {showItemPickerModal && (
        <ItemPickerModal
          onBack={closeItemPicker}
          onClose={closeItemPicker}
          onSelect={selectItemForRow}
          selectingItemCode={pricingItemCode}
        />
      )}

      {showBatchPickerModal && batchPickerRow?.item && (
        <BatchPickerModal
          item={batchPickerRow.item}
          invoiceQty={batchPickerRow.invoiceQty}
          selectedBatch={batchPickerRow.batch}
          onBack={() => {
            closeBatchPicker();
            setItemPickerRowId(batchPickerRow.id);
          }}
          onClose={closeBatchPicker}
          onSelect={selectBatchForRow}
          onQuantityChange={(quantity) => {
            const nextQuantity = toFiniteQuantity(quantity);
            setItemDraftError("");
            setItemRows((current) =>
              current.map((row) =>
                row.id === batchPickerRow.id
                  ? { ...row, invoiceQty: nextQuantity, batch: null }
                  : row,
              ),
            );
          }}
          onCreateDraft={createDraftFromItems}
          canCreateDraft={!itemRowsValidationError}
          creatingDraft={creatingItemDraft}
          draftError={itemDraftError || state.draftError}
        />
      )}
    </Page>
  );
}
