/**
 * The single-page order form — edit, duplicate and FOC.
 *
 * `useWizard` (in `useSalesOrderForm`) picks this over `OrderWizard` whenever
 * `mode` is not "create", which only ever arrives on `location.state`. That is
 * why no test could reach this branch until `interactions.visual.spec.ts`
 * learned to click Edit on Order_Tracking, and why ~850 lines of it had never
 * been rendered by anything but a browser.
 *
 * Unlike the wizard, this IS a real `<form>`, so its `required` attributes
 * participate in constraint validation — four of them on `type="hidden"`
 * inputs, where the HTML spec bars them from doing anything at all.
 * `validateBeforeSave` is what actually guards those fields.
 *
 * ── On the conversion ─────────────────────────────────────────────────────
 * Same rule as the wizard: a restyle, not a redesign. Every field, every
 * column and every gate is where it was.
 *
 * Two things did change, and both were bugs:
 *
 * · THE TABLE'S INPUTS HAD NO STYLING AT ALL. `.sl-table td input`,
 *   `.sl-size-input` and `.sl-compact-number-input` are all COMMENTED OUT in
 *   `Add_Sales.css` — so every quantity and price cell in this table was
 *   rendering at the browser default, in a form where nothing else was.
 *   They are `Input` now, which is also how they pick up the readonly
 *   treatment that tells a derived cell apart from one you can type in.
 * · THE ACTION ROW WAS THREE FILLED BUTTONS — blue Save, orange Draft, RED
 *   Clear, all solid, all the same weight. A destructive Clear shouting as
 *   loudly as Save is how an order gets cleared by someone aiming for the
 *   button beside it. Save is `primary`, Draft is `secondary`, Clear is
 *   `danger` — which is an outline until you hover it. See the note on the
 *   `danger` variant in `ui/button`.
 *
 * What did NOT change: the party / bill / ship / dispatch / company dropdowns
 * still carry their own state and refs from `useSalesOrderForm`, which is
 * shared with `OrderWizard` — see the note there.
 */
import { Fragment } from "react";
import { HiChevronDown, HiMinus, HiOutlineTrash, HiPlus } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import FieldError from "./FieldError";
import ProblemSummary from "./ProblemSummary";
import WarehouseField from "./WarehouseField";
import { type RowDropdownOption, type SalesOrderForm } from "./useSalesOrderForm";
import { type SalesRow } from "../salesOrderRow";

/** The white card the two field grids sit on. */
const PANEL = "rounded-md border border-line bg-card p-4.5 shadow-card";

/** A dropdown panel, shared by the five header pickers. */
const MENU =
  "absolute left-0 right-0 top-[calc(100%+6px)] z-[1301] overflow-hidden rounded-md border border-brand-line bg-card shadow-panel";

/** One option inside that panel. */
const OPTION =
  "flex w-full cursor-pointer appearance-none flex-col items-start gap-0.5 rounded-lg border-0 bg-transparent px-2.5 py-2.5 text-left [font-family:inherit] transition-colors hover:bg-surface";

/** The trigger button the five header pickers share. */
const TRIGGER = cn(
  "flex h-control w-full cursor-pointer appearance-none items-center justify-between gap-2",
  "rounded-sm border border-line-strong bg-card px-3 text-[13px] text-ink",
  "[font-family:inherit] shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
  "transition-colors hover:border-brand hover:shadow-focus",
  "focus-visible:border-brand focus-visible:outline-none focus-visible:shadow-focus",
);

/** The blue pill over each half of the form. */
const SECTION =
  "mb-3.5 inline-flex rounded-md bg-brand-soft px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-brand";

export default function LegacyOrderForm({ form }: { form: SalesOrderForm }) {
  const {
    t,
    isEditMode,
    isDuplicateMode,
    isLoadingFromOrder,
    isFocMode,
    selectedPartyCategory,
    partySearch,
    setPartySearch,
    partyDropdownOpen,
    setPartyDropdownOpen,
    dispatchDropdownOpen,
    setDispatchDropdownOpen,
    billSearch,
    setBillSearch,
    billDropdownOpen,
    setBillDropdownOpen,
    shipSearch,
    setShipSearch,
    shipDropdownOpen,
    setShipDropdownOpen,
    companyDropdownOpen,
    setCompanyDropdownOpen,
    openRowDropdown,
    setOpenRowDropdown,
    branch,
    category,
    company,
    partyProducts,
    schemeOptions,
    isSaving,
    isSavingDraft,
    editOrderIsDraft,
    partyDropdownRef,
    dispatchDropdownRef,
    billDropdownRef,
    shipDropdownRef,
    companyDropdownRef,
    formData,
    setFormData,
    rows,
    isFocOrder,
    poField,
    canEditPoNumber,
    getProductType,
    handleSubmit,
    handleSaveDraft,
    handleClearForm,
    handleAddRow,
    handleRowSchemeToggle,
    handleAddScheme,
    handleSchemeChange,
    handleRemoveScheme,
    handleRowChange,
    handleRowSelect,
    handleDeleteRow,
    handlePartySelect,
    handleChange,
    handleBillAddressSelect,
    handleShipAddressSelect,
    handleDispatchSelect,
    handleCompanySelect,
    handleConfirmRow,
    handleEditRow,
    confirmedRows,
    canAddMoreItems,
    totalAmount,
    taxAmount,
    grandTotal,
    filteredParties,
    filteredBillAddresses,
    filteredShipAddresses,
    selectedPartyLabel,
    isMartOrder,
    isSchemePanelHidden,
    problems,
    confirmProblems,
    selectedBillAddressLabel,
    selectedShipAddressLabel,
    selectedDispatchLabel,
    selectedCompanyLabel,
  } = form;

  /**
   * The props every option in every picker carries.
   *
   * `role="option"` + `aria-selected`, not just a class: these were anonymous
   * `<button>`s, so a screen reader heard "button" with no sense of belonging
   * to a set, and a test had nothing to hold but a class name.
   */
  const optionProps = (selected: boolean) => ({
    role: "option" as const,
    "aria-selected": selected,
    className: cn(
      OPTION,
      selected && "bg-surface shadow-[inset_3px_0_0_var(--color-line-strong)]",
    ),
  });

  const emptyOption = (text: string) => (
    <div className="px-3 py-3.5 text-[13px] text-subtle">{text}</div>
  );

  /**
   * One of the five header pickers: a trigger, then a panel that optionally
   * opens with a search box in it.
   */
  const renderPicker = (config: {
    refEl: React.RefObject<HTMLDivElement | null>;
    open: boolean;
    toggle: () => void;
    label: string;
    selectedLabel: string;
    placeholder: string;
    controlId?: string;
    search?: { value: string; onChange: (value: string) => void; placeholder: string };
    children: React.ReactNode;
    /** A hidden mirror the <form> submits; four of these carry `required`. */
    hidden?: React.ReactNode;
  }) => (
    <div className={cn("relative", config.open ? "z-[1300]" : "z-[1]")} ref={config.refEl}>
      <button
        type="button"
        id={config.controlId}
        className={TRIGGER}
        aria-haspopup="listbox"
        aria-expanded={config.open}
        aria-label={config.label}
        onClick={config.toggle}
      >
        <span className="min-w-0 truncate text-left">
          {config.selectedLabel || config.placeholder}
        </span>
        <HiChevronDown aria-hidden="true" className="flex-none text-subtle" />
      </button>
      {config.open && (
        <div className={MENU}>
          {config.search && (
            <div className="border-b border-line p-2.5">
              <Input
                type="text"
                placeholder={config.search.placeholder}
                aria-label={config.search.placeholder.replace(/\.\.\.$/, "")}
                value={config.search.value}
                onChange={(e) => config.search!.onChange(e.target.value)}
              />
            </div>
          )}
          <div
            role="listbox"
            aria-label={config.label}
            className="max-h-60 overflow-y-auto p-1.5"
          >
            {config.children}
          </div>
        </div>
      )}
      {config.hidden}
    </div>
  );

  const renderRowDropdown = (
    rowIndex: number,
    name: keyof SalesRow,
    value: string,
    options: RowDropdownOption[],
    disabled: boolean,
  ) => {
    const dropdownId = `${rowIndex}-${String(name)}`;
    // Only resolve a selected option when something is actually chosen. Some
    // products have an empty brand/variety, which produces an option with
    // value "" (labelled "Unknown"); without this guard an unselected field
    // would match that option and wrongly show "Unknown" instead of the
    // "--select--" placeholder.
    const selected = value ? options.find((option) => option.value === value) : undefined;
    const isOpen = openRowDropdown === dropdownId;

    return (
      <div className={cn("relative", isOpen ? "z-[2500]" : "z-[1]")}>
        <button
          type="button"
          className={cn(
            "flex min-h-control-sm w-full cursor-pointer appearance-none items-center justify-between gap-1.5",
            "rounded-sm border border-line-strong bg-card px-2 py-1.5 text-[13px] text-ink",
            "[font-family:inherit] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors",
            "hover:border-brand hover:shadow-focus",
            "focus-visible:border-brand focus-visible:outline-none focus-visible:shadow-focus",
            "disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-strong",
            "disabled:text-subtle disabled:shadow-none",
          )}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={String(name)}
          onClick={() =>
            setOpenRowDropdown((current) => (current === dropdownId ? null : dropdownId))
          }
        >
          <span className="min-w-0 truncate text-left">{selected?.label || "--select--"}</span>
          <HiChevronDown aria-hidden="true" className="flex-none text-subtle" />
        </button>
        {isOpen && (
          <div className="absolute left-0 top-[calc(100%+5px)] z-[2501] max-h-[250px] w-[max(100%,220px)] overflow-auto rounded-md border border-brand-line bg-card p-1.5 shadow-panel">
            {[{ value: "", label: "--select--" }, ...options.filter((o) => o.value !== "")].map(
              (option) => (
                <button
                  type="button"
                  key={`${dropdownId}-${option.value}`}
                  className={cn(
                    "flex min-h-[34px] w-full cursor-pointer appearance-none items-center justify-start",
                    "break-words rounded-lg border-0 bg-transparent px-2.5 py-2 text-left",
                    "text-[12px] font-bold leading-tight text-ink [font-family:inherit]",
                    "transition-colors hover:bg-surface",
                    option.value === value &&
                      "bg-surface shadow-[inset_3px_0_0_var(--color-line-strong)]",
                  )}
                  onClick={() => handleRowSelect(rowIndex, String(name), option.value)}
                >
                  {option.label}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    );
  };

  /** The scheme panel, spanning the whole table under the row it belongs to. */
  const renderSchemePanel = (row: SalesRow, index: number) => {
    // On this form a confirmed row can still be edited in edit mode, which is
    // the one place its disabled rule differs from the wizard's.
    const locked = row.confirmed && !isEditMode;
    return (
      <div
        className={cn(
          "overflow-hidden rounded-sm border bg-card shadow-card",
          row.isScheme ? "border-line-strong" : "border-line",
        )}
      >
        <div className="flex flex-col items-stretch justify-between gap-3.5 border-b border-line bg-surface p-3.5 sm:flex-row sm:items-center">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-subtle">
              Optional promotion
            </div>
            <div className="mt-0.5 text-[13px] font-bold text-ink">Add scheme to this item</div>
          </div>
          {/* A real checkbox in a label — the switch had no accessible name. */}
          <label className="flex h-[34px] min-w-[132px] cursor-pointer items-center justify-between gap-2 rounded-full border border-line-strong bg-card px-2.5">
            <span className="text-[11px] font-extrabold text-ink-soft">
              {row.isScheme ? "Enabled" : "Disabled"}
            </span>
            <span className="relative inline-block h-5 w-9 shrink-0">
              <input
                type="checkbox"
                className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                checked={row.isScheme}
                onChange={(e) => handleRowSchemeToggle(index, e.target.checked)}
                disabled={locked}
                aria-label="Add scheme to this item"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-line-strong transition-colors peer-checked:bg-[#0f766e] peer-focus-visible:shadow-focus"
              />
              <span
                aria-hidden="true"
                className="absolute left-[3px] top-[3px] size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.2)] transition-transform peer-checked:translate-x-[18px]"
              />
            </span>
          </label>
        </div>

        {row.isScheme && (
          <div className="grid items-start gap-3 p-3.5 lg:grid-cols-[minmax(0,560px)_160px]">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="grid grid-cols-[1fr_80px_48px] items-center gap-2 px-0.5 text-[11px] font-extrabold uppercase tracking-[0.04em] text-subtle sm:grid-cols-[minmax(220px,360px)_90px_56px]">
                <span>Scheme</span>
                <span>Qty</span>
                <span>Action</span>
              </div>
              {(row.schemes.length ? row.schemes : [{ scheme: "", schemeQty: "" }]).map(
                (schemeRow, schemeIndex) => (
                  <div
                    className="grid grid-cols-[1fr_80px_48px] items-center gap-2 rounded-sm border border-line bg-surface p-2 sm:grid-cols-[minmax(220px,360px)_90px_56px]"
                    key={`${index}-${schemeIndex}`}
                  >
                    <Select
                      aria-label="Scheme"
                      value={schemeRow.scheme}
                      onChange={(e) =>
                        handleSchemeChange(index, schemeIndex, "scheme", e.target.value)
                      }
                      disabled={locked || !(schemeOptions[row.uid] || []).length}
                    >
                      <option value="">Select Scheme...</option>
                      {(schemeOptions[row.uid] || []).map((scheme) => (
                        <option key={scheme.scheme_id} value={scheme.scheme_id}>
                          {scheme.scheme_name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="text"
                      aria-label="Scheme quantity"
                      value={schemeRow.schemeQty}
                      placeholder="0"
                      onChange={(e) =>
                        handleSchemeChange(index, schemeIndex, "schemeQty", e.target.value)
                      }
                      disabled={locked}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveScheme(index, schemeIndex)}
                      disabled={locked}
                      aria-label="Remove scheme"
                      title="Remove scheme"
                    >
                      <HiMinus aria-hidden="true" />
                    </Button>
                  </div>
                ),
              )}
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => handleAddScheme(index)}
                disabled={locked}
              >
                <HiPlus aria-hidden="true" /> Add Scheme
              </Button>
            </div>

            <div className="flex flex-col gap-1.5 rounded-sm border border-line bg-surface p-3">
              <span className="text-[11px] font-extrabold text-ink-soft">Total Ltrs</span>
              <Input
                type="text"
                name="totalLtrs"
                aria-label="Total Ltrs"
                className="bg-white font-extrabold text-ink"
                value={
                  row.schemes.length
                    ? (
                        Number(row.ltrs) +
                        row.schemes.reduce((sum, scheme) => sum + Number(scheme.schemeQty || 0), 0)
                      ).toFixed(2)
                    : Number(row.ltrs).toFixed(2)
                }
                readOnly
              />
              <small className="text-[11px] leading-snug text-subtle">
                Base ltrs plus selected scheme quantity
              </small>
            </div>
          </div>
        )}
      </div>
    );
  };

  /** A number cell in the items table. `readOnly` marks a derived value. */
  const cellInput = (props: React.ComponentProps<typeof Input>) => (
    <Input
      {...props}
      className={cn("h-control-sm px-2 text-center text-[13px]", props.className)}
    />
  );

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className={SECTION}>Order Details</div>
      {/* `z-20` over the summary grid's `z-1`: an open party menu has to paint
          over the table below it, and the table establishes its own context. */}
      <div className={cn(PANEL, "relative z-20 mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3")}>
        <Field label="Party Name">
          {(control) =>
            renderPicker({
              refEl: partyDropdownRef,
              open: partyDropdownOpen,
              toggle: () => setPartyDropdownOpen((prev) => !prev),
              label: "Party Name",
              selectedLabel: selectedPartyLabel,
              placeholder: "--select--",
              controlId: control.id,
              search: {
                value: partySearch,
                onChange: setPartySearch,
                placeholder: "Search party...",
              },
              children:
                filteredParties.length > 0 ? (
                  filteredParties.map((party) => (
                    <button
                      type="button"
                      key={`${party.value}-${party.category || ""}`}
                      {...optionProps(
                        party.value === formData.parties &&
                          String(party.category || "").toUpperCase() ===
                            selectedPartyCategory.toUpperCase(),
                      )}
                      onClick={() => handlePartySelect(party.value, party.category || "")}
                    >
                      <span className="text-[13px] font-medium text-ink">{party.label}</span>
                      <span className="text-[11px] text-subtle">
                        {[party.value, party.category].filter(Boolean).join(" | ")}
                      </span>
                    </button>
                  ))
                ) : (
                  emptyOption("No parties found")
                ),
            })
          }
        </Field>

        <Field label="Dispatch From">
          {(control) =>
            renderPicker({
              refEl: dispatchDropdownRef,
              open: dispatchDropdownOpen,
              toggle: () => setDispatchDropdownOpen((prev) => !prev),
              label: "Dispatch From",
              selectedLabel: selectedDispatchLabel,
              placeholder: "--select--",
              controlId: control.id,
              hidden: (
                <input type="hidden" name="dispatch" value={formData.dispatch} required />
              ),
              children: (
                <>
                  <button
                    type="button"
                    {...optionProps(!formData.dispatch)}
                    onClick={() => handleDispatchSelect("")}
                  >
                    <span className="text-[13px] font-medium text-ink">--select--</span>
                  </button>
                  {branch.length > 0
                    ? branch.map((d) => (
                        <button
                          type="button"
                          key={d.bpl_id}
                          {...optionProps(String(d.bpl_id) === formData.dispatch)}
                          onClick={() => handleDispatchSelect(String(d.bpl_id))}
                        >
                          <span className="text-[13px] font-medium text-ink">{d.bpl_name}</span>
                        </button>
                      ))
                    : emptyOption("No dispatch locations found")}
                </>
              ),
            })
          }
        </Field>

        <Field label="Date">
          {(control) => (
            <Input {...control} type="date" name="date" value={formData.date} readOnly />
          )}
        </Field>

        <Field label="Bill To Address">
          {(control) => (
            <>
              {renderPicker({
                refEl: billDropdownRef,
                open: billDropdownOpen,
                toggle: () => setBillDropdownOpen((prev) => !prev),
                label: "Bill To Address",
                selectedLabel: selectedBillAddressLabel,
                placeholder: "--select--",
                controlId: control.id,
                search: {
                  value: billSearch,
                  onChange: setBillSearch,
                  placeholder: "Search bill to...",
                },
                children:
                  filteredBillAddresses.length > 0 ? (
                    filteredBillAddresses.map((b) => (
                      <button
                        type="button"
                        key={b.id}
                        {...optionProps(String(b.id) === formData.billAddress)}
                        onClick={() => handleBillAddressSelect(String(b.id))}
                      >
                        <span className="text-[13px] font-medium text-ink">
                          {b.address_name || b.full_address || b.address_id}
                        </span>
                      </button>
                    ))
                  ) : (
                    emptyOption("No addresses found")
                  ),
              })}
              <input type="hidden" name="billAddress" value={formData.billAddress} required />
            </>
          )}
        </Field>

        <Field label="Ship To Address">
          {(control) => (
            <>
              {renderPicker({
                refEl: shipDropdownRef,
                open: shipDropdownOpen,
                toggle: () => setShipDropdownOpen((prev) => !prev),
                label: "Ship To Address",
                selectedLabel: selectedShipAddressLabel,
                placeholder: "--select--",
                controlId: control.id,
                search: {
                  value: shipSearch,
                  onChange: setShipSearch,
                  placeholder: "Search ship to...",
                },
                children:
                  filteredShipAddresses.length > 0 ? (
                    filteredShipAddresses.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        {...optionProps(String(s.id) === formData.shipAddress)}
                        onClick={() => handleShipAddressSelect(String(s.id))}
                      >
                        <span className="text-[13px] font-medium text-ink">
                          {s.address_name || s.full_address || s.address_id}
                        </span>
                      </button>
                    ))
                  ) : (
                    emptyOption("No addresses found")
                  ),
              })}
              <input type="hidden" name="shipAddress" value={formData.shipAddress} required />
            </>
          )}
        </Field>

        <Field label="Delivery Date">
          {(control) => (
            <Input
              {...control}
              type="date"
              name="Deliverydate"
              value={formData.Deliverydate}
              onChange={handleChange}
              required
            />
          )}
        </Field>
      </div>

      <div className="relative z-[1] mt-2.5 overflow-x-auto rounded-md border border-line bg-card shadow-card">
        <Table density="compact">
          <colgroup>
            <col className="w-[90px]" />
            <col className="w-[90px]" />
            <col className="w-[104px]" />
            <col className="w-[76px]" />
            <col className="w-[160px]" />
            <col className="w-[64px]" />
            <col className="w-[88px]" />
            <col className="w-[88px]" />
            <col className="w-[96px]" />
            <col className="w-[104px]" />
            <col className="w-[104px]" />
            <col className="w-[62px]" />
            <col className="w-[104px]" />
            <col className="w-[130px]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Sub Group</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Pcs</TableHead>
              <TableHead>Boxes</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Ltrs</TableHead>
              <TableHead>{t("price_list", "Price List (Basic)")}</TableHead>
              <TableHead>Basic Price</TableHead>
              <TableHead>Tax %</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>X</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row, index) => (
              <Fragment key={index}>
                <TableRow key={`main-${index}`}>
                  <TableCell>
                    {renderRowDropdown(
                      index,
                      "category",
                      row.category,
                      category.map((c) => ({ value: c, label: c })),
                      row.confirmed && !isEditMode,
                    )}
                  </TableCell>

                  <TableCell>
                    {renderRowDropdown(
                      index,
                      "brand",
                      row.brand,
                      [
                        ...new Set(
                          partyProducts
                            .filter((p) => p.category === row.category)
                            .map((p) => p.brand),
                        ),
                      ].map((b) => ({ value: b ?? "", label: b || "Unknown" })),
                      row.confirmed && !isEditMode,
                    )}
                  </TableCell>

                  <TableCell>
                    {renderRowDropdown(
                      index,
                      "variety",
                      row.variety,
                      [
                        ...new Set(
                          partyProducts
                            .filter(
                              (p) =>
                                p.category === row.category &&
                                (p.brand || "") === (row.brand || ""),
                            )
                            .map((p) => p.variety),
                        ),
                      ].map((v) => ({ value: v ?? "", label: v || "Unknown" })),
                      row.confirmed && !isEditMode,
                    )}
                  </TableCell>

                  <TableCell>
                    {renderRowDropdown(
                      index,
                      "type",
                      row.type,
                      [
                        ...new Set(
                          partyProducts
                            .filter(
                              (p) =>
                                p.category === row.category &&
                                (p.brand || "") === (row.brand || "") &&
                                (p.variety || "") === (row.variety || ""),
                            )
                            .map((p) => {
                              const match = p.item_name.match(
                                /(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i,
                              );
                              return match ? `${match[1]} ${match[2].toUpperCase()}` : "Others";
                            }),
                        ),
                      ]
                        .sort((a, b) => {
                          if (a === "Others") return 1;
                          if (b === "Others") return -1;
                          return parseFloat(a) - parseFloat(b);
                        })
                        .map((t) => ({ value: t, label: t })),
                      row.confirmed && !isEditMode,
                    )}
                  </TableCell>

                  <TableCell>
                    {renderRowDropdown(
                      index,
                      "item",
                      row.item,
                      partyProducts
                        .filter(
                          (p) =>
                            p.category === row.category &&
                            (p.brand || "") === (row.brand || "") &&
                            (p.variety || "") === (row.variety || "") &&
                            (row.type ? getProductType(p.item_name) === row.type : true),
                        )
                        .map((p) => ({ value: p.item_name, label: p.item_name })),
                      row.confirmed && !isEditMode,
                    )}
                  </TableCell>

                  <TableCell>
                    {cellInput({
                      type: "number",
                      "aria-label": "Pcs",
                      value: row.pcs ? Number(row.pcs).toFixed(1) : "",
                      readOnly: true,
                    })}
                  </TableCell>

                  <TableCell>
                    {cellInput({
                      type: "number",
                      name: "boxes",
                      "aria-label": "Boxes",
                      value: row.boxes,
                      onChange: (e) => handleRowChange(index, e),
                      disabled: row.confirmed && !isEditMode,
                      required: true,
                    })}
                  </TableCell>

                  <TableCell>
                    {cellInput({
                      type: "number",
                      name: "qty",
                      "aria-label": "Qty",
                      value: row.qty,
                      onChange: (e) => handleRowChange(index, e),
                      disabled: row.confirmed && !isEditMode,
                      required: true,
                    })}
                  </TableCell>

                  <TableCell>
                    {cellInput({
                      type: "number",
                      "aria-label": "Ltrs",
                      value: row.ltrs,
                      readOnly: true,
                    })}
                  </TableCell>

                  <TableCell>
                    {cellInput({
                      type: "number",
                      "aria-label": "Price List",
                      value: row.priceListBasic,
                      readOnly: true,
                    })}
                  </TableCell>

                  <TableCell>
                    {cellInput({
                      type: "number",
                      name: "basicPrice",
                      "aria-label": "Basic Price",
                      value: row.basicPrice,
                      onChange: (e) => handleRowChange(index, e),
                      disabled: row.confirmed && !isEditMode,
                    })}
                  </TableCell>

                  <TableCell>
                    {cellInput({
                      type: "text",
                      "aria-label": "Tax %",
                      value: Number(row.tax).toFixed(2),
                      readOnly: true,
                    })}
                  </TableCell>

                  <TableCell>
                    {cellInput({
                      type: "number",
                      "aria-label": "Amount",
                      value: row.amount,
                      readOnly: true,
                    })}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      {!row.confirmed ? (
                        <div className="min-w-0">
                          <Button variant="success" size="sm" onClick={() => handleConfirmRow(index)}>
                            Confirm
                          </Button>
                          {/* Why this row would not confirm, in the row. */}
                          <FieldError message={confirmProblems[row.uid]} />
                        </div>
                      ) : (
                        <>
                          <Badge tone="ok">Confirmed</Badge>
                          <Button size="sm" onClick={() => handleEditRow(index)}>
                            Edit
                          </Button>
                        </>
                      )}
                      <Button
                        variant="danger"
                        size="icon"
                        onClick={() => handleDeleteRow(index)}
                        aria-label={`Delete item ${index + 1}`}
                        title="Delete item"
                      >
                        <HiOutlineTrash aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>

                {row.item && !isFocOrder && !isSchemePanelHidden(row) && (
                  <TableRow key={`scheme-${index}`}>
                    <TableCell colSpan={14} className="bg-surface p-3">
                      {renderSchemePanel(row, index)}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      {canAddMoreItems && (
        <Button variant="primary" className="mb-5 mt-2.5" onClick={handleAddRow}>
          + Add Item
        </Button>
      )}

      <div className={SECTION}>Summary</div>
      <div className={cn(PANEL, "relative z-[1] mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3")}>
        {canEditPoNumber && (
          <Field label={poField.label} required={poField.required}>
            {(control) => (
              <Input
                {...control}
                type="text"
                name="poNumber"
                value={formData.poNumber}
                onChange={handleChange}
                placeholder="Enter PO number"
                // Live on this path: the legacy branch is inside the <form>.
                required={poField.required}
              />
            )}
          </Field>
        )}

        {isMartOrder && <WarehouseField form={form} />}

        <Field label="Company">
          {(control) =>
            renderPicker({
              refEl: companyDropdownRef,
              open: companyDropdownOpen,
              toggle: () => setCompanyDropdownOpen((prev) => !prev),
              label: "Company",
              selectedLabel: selectedCompanyLabel,
              placeholder: "Select Company",
              controlId: control.id,
              hidden: <input type="hidden" name="company" value={formData.company} required />,
              children: (
                <>
                  <button
                    type="button"
                    {...optionProps(!formData.company)}
                    onClick={() => handleCompanySelect("")}
                  >
                    <span className="text-[13px] font-medium text-ink">Select Company</span>
                  </button>
                  {company.length > 0
                    ? company.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          {...optionProps(String(item.id) === formData.company)}
                          onClick={() => handleCompanySelect(String(item.id))}
                        >
                          <span className="text-[13px] font-medium text-ink">{item.name}</span>
                        </button>
                      ))
                    : emptyOption("No companies found")}
                </>
              ),
            })
          }
        </Field>

        <Field label="Total">
          {(control) => <Input {...control} type="text" value={totalAmount.toFixed(2)} readOnly />}
        </Field>
        <Field label="Tax">
          {(control) => <Input {...control} type="text" value={taxAmount} readOnly />}
        </Field>
        <Field label="Grand Total">
          {(control) => (
            <Input {...control} type="text" name="gtotal" value={grandTotal.toFixed(1)} readOnly />
          )}
        </Field>

        <Field label="Comment" span="full">
          {(control) => (
            <Textarea
              {...control}
              name="comment"
              rows={2}
              placeholder="Add a note..."
              value={formData.comment}
              onChange={(e) => setFormData((prev) => ({ ...prev, comment: e.target.value }))}
            />
          )}
        </Field>
      </div>

      {/* This form has no step gates at all, so before step 7 its only answer
          to a bad order was a modal dialog. */}
      <ProblemSummary problems={problems} />

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Button
          type="submit"
          variant="primary"
          disabled={
            isSaving || confirmedRows.length === 0 || rows.some((row) => !row.confirmed && row.item)
          }
        >
          {isEditMode
            ? "Update Order"
            : isDuplicateMode
              ? "Create as New"
              : isFocMode
                ? "Create FOC Order"
                : "Save Order"}
        </Button>
        {(!isEditMode || editOrderIsDraft) && (
          <Button onClick={handleSaveDraft} disabled={isSaving || isSavingDraft}>
            {isSavingDraft ? "Saving Draft..." : "Save as Draft"}
          </Button>
        )}
        <Button variant="danger" onClick={handleClearForm}>
          {isLoadingFromOrder ? "Cancel" : "Clear"}
        </Button>
      </div>
    </form>
  );
}
