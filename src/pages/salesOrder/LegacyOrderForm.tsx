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
 */
import { Fragment } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import FieldError from "./FieldError";
import ProblemSummary from "./ProblemSummary";
import WarehouseField from "./WarehouseField";
import { type RowDropdownOption, type SalesOrderForm } from "./useSalesOrderForm";
import { type SalesRow } from "../salesOrderRow";

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
      <div className={`sl-row-dropdown${isOpen ? " open" : ""}`}>
        <button
          type="button"
          className="sl-row-dropdown-trigger"
          disabled={disabled}
          onClick={() =>
            setOpenRowDropdown((current) => (current === dropdownId ? null : dropdownId))
          }
        >
          <span>{selected?.label || "--select--"}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="#64748b"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {isOpen && (
          <div className="sl-row-dropdown-menu">
            <button
              type="button"
              className={`sl-row-dropdown-option${!value ? " is-selected" : ""}`}
              onClick={() => handleRowSelect(rowIndex, String(name), "")}
            >
              --select--
            </button>
            {options
              .filter((option) => option.value !== "")
              .map((option) => (
                <button
                  type="button"
                  key={`${dropdownId}-${option.value}`}
                  className={`sl-row-dropdown-option${option.value === value ? " is-selected" : ""}`}
                  onClick={() => handleRowSelect(rowIndex, String(name), option.value)}
                >
                  {option.label}
                </button>
              ))}
          </div>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Wizard (standard create flow only) — reuses every handler above.
  // ---------------------------------------------------------------------------
  return (
    <form className="sl-form" onSubmit={handleSubmit}>
      {/* Party Name */}
      <div className="sl-section-label">Order Details</div>
      <div className="sl-grid sl-order-grid">
        <div className="sl-field">
          <label className="sl-label">Party Name</label>
          <div
            className={`sl-party-dropdown${partyDropdownOpen ? " open" : ""}`}
            ref={partyDropdownRef}
          >
            <button
              type="button"
              className="sl-party-trigger"
              onClick={() => setPartyDropdownOpen((prev) => !prev)}
            >
              <span>{selectedPartyLabel || "--select--"}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="#64748b"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {partyDropdownOpen && (
              <div className="sl-party-menu">
                <div className="sl-party-search-wrap">
                  <input
                    type="text"
                    className="sl-party-search"
                    placeholder="Search party..." aria-label="Search party"
                    value={partySearch}
                    onChange={(e) => setPartySearch(e.target.value)}
                  />
                </div>
                <div className="sl-party-options">
                  {filteredParties.length > 0 ? (
                    filteredParties.map((party) => (
                      <button
                        type="button"
                        key={`${party.value}-${party.category || ""}`}
                        className={`sl-party-option${
                          party.value === formData.parties &&
                          String(party.category || "").toUpperCase() ===
                            selectedPartyCategory.toUpperCase()
                            ? " is-selected"
                            : ""
                        }`}
                        onClick={() => handlePartySelect(party.value, party.category || "")}
                      >
                        <span className="sl-party-option-label">{party.label}</span>
                        <span className="sl-party-option-code">
                          {[party.value, party.category].filter(Boolean).join(" | ")}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="sl-party-empty">No parties found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dispatch */}
        <div className="sl-field">
          <label className="sl-label">Dispatch From</label>
          <div
            className={`sl-party-dropdown${dispatchDropdownOpen ? " open" : ""}`}
            ref={dispatchDropdownRef}
          >
            <button
              type="button"
              className="sl-party-trigger"
              onClick={() => setDispatchDropdownOpen((prev) => !prev)}
            >
              <span>{selectedDispatchLabel || "--select--"}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="#64748b"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {dispatchDropdownOpen && (
              <div className="sl-party-menu">
                <div className="sl-party-options">
                  <button
                    type="button"
                    className={`sl-party-option${!formData.dispatch ? " is-selected" : ""}`}
                    onClick={() => handleDispatchSelect("")}
                  >
                    <span className="sl-party-option-label">--select--</span>
                  </button>
                  {branch.length > 0 ? (
                    branch.map((d) => (
                      <button
                        type="button"
                        key={d.bpl_id}
                        className={`sl-party-option${
                          String(d.bpl_id) === formData.dispatch ? " is-selected" : ""
                        }`}
                        onClick={() => handleDispatchSelect(String(d.bpl_id))}
                      >
                        <span className="sl-party-option-label">{d.bpl_name}</span>
                      </button>
                    ))
                  ) : (
                    <div className="sl-party-empty">No dispatch locations found</div>
                  )}
                </div>
              </div>
            )}
            <input type="hidden" name="dispatch" value={formData.dispatch} required />
          </div>
        </div>

        {/* Date */}
        <div className="sl-field">
          <label className="sl-label">Date</label>
          <div className="sl-input-wrap">
            <input type="date" name="date" value={formData.date} readOnly />
            <div className="sl-focus-line" />
          </div>
        </div>

        {/* Bill To */}
        <div className="sl-field">
          <label className="sl-label">Bill To Address</label>
          <div
            className={`sl-party-dropdown${billDropdownOpen ? " open" : ""}`}
            ref={billDropdownRef}
          >
            <button
              type="button"
              className="sl-party-trigger"
              onClick={() => setBillDropdownOpen((prev) => !prev)}
            >
              <span>{selectedBillAddressLabel || "--select--"}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="#64748b"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {billDropdownOpen && (
              <div className="sl-party-menu">
                <div className="sl-party-search-wrap">
                  <input
                    type="text"
                    className="sl-party-search"
                    placeholder="Search bill to..." aria-label="Search bill to"
                    value={billSearch}
                    onChange={(e) => setBillSearch(e.target.value)}
                  />
                </div>
                <div className="sl-party-options">
                  {filteredBillAddresses.length > 0 ? (
                    filteredBillAddresses.map((b) => (
                      <button
                        type="button"
                        key={b.id}
                        className={`sl-party-option${
                          String(b.id) === formData.billAddress ? " is-selected" : ""
                        }`}
                        onClick={() => handleBillAddressSelect(String(b.id))}
                      >
                        <span className="sl-party-option-label">
                          {b.address_name || b.full_address || b.address_id}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="sl-party-empty">No addresses found</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <input type="hidden" name="billAddress" value={formData.billAddress} required />
        </div>

        {/* Ship To */}
        <div className="sl-field">
          <label className="sl-label">Ship To Address</label>
          <div
            className={`sl-party-dropdown${shipDropdownOpen ? " open" : ""}`}
            ref={shipDropdownRef}
          >
            <button
              type="button"
              className="sl-party-trigger"
              onClick={() => setShipDropdownOpen((prev) => !prev)}
            >
              <span>{selectedShipAddressLabel || "--select--"}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="#64748b"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {shipDropdownOpen && (
              <div className="sl-party-menu">
                <div className="sl-party-search-wrap">
                  <input
                    type="text"
                    className="sl-party-search"
                    placeholder="Search ship to..." aria-label="Search ship to"
                    value={shipSearch}
                    onChange={(e) => setShipSearch(e.target.value)}
                  />
                </div>
                <div className="sl-party-options">
                  {filteredShipAddresses.length > 0 ? (
                    filteredShipAddresses.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        className={`sl-party-option${
                          String(s.id) === formData.shipAddress ? " is-selected" : ""
                        }`}
                        onClick={() => handleShipAddressSelect(String(s.id))}
                      >
                        <span className="sl-party-option-label">
                          {s.address_name || s.full_address || s.address_id}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="sl-party-empty">No addresses found</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <input type="hidden" name="shipAddress" value={formData.shipAddress} required />
        </div>

        {/* Delivery Date */}
        <div className="sl-field">
          <label className="sl-label" htmlFor="Deliverydate">
            Delivery Date
          </label>
          <div className="sl-input-wrap">
            <input
              type="date"
              name="Deliverydate"
              value={formData.Deliverydate}
              onChange={handleChange}
              required
            />
            <div className="sl-focus-line" />
          </div>
        </div>
      </div>

      <div className="sl-table-wrap">
        <Table density="compact">
          <colgroup>
            <col className="sl-col-category" />
            <col className="sl-col-brand" />
            <col className="sl-col-variety" />
            <col className="sl-col-type" />
            <col className="sl-col-item" />
            <col className="sl-col-pcs" />
            <col className="sl-col-boxes" />
            <col className="sl-col-qty" />
            <col className="sl-col-ltrs" />
            <col className="sl-col-price-list-basic" />
            <col className="sl-col-basic-price" />
            <col className="sl-col-tax" />
            <col className="sl-col-amount" />
            <col className="sl-col-actions" />
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

                  <TableCell className="sl-pcs-cell">
                    <input
                      className="sl-compact-number-input"
                      type="number"
                      value={row.pcs ? Number(row.pcs).toFixed(1) : ""}
                      readOnly
                    />
                  </TableCell>

                  <TableCell className="sl-boxes-cell">
                    <input
                      type="number"
                      name="boxes"
                      className="sl-size-input"
                      value={row.boxes}
                      onChange={(e) => handleRowChange(index, e)}
                      disabled={row.confirmed && !isEditMode}
                      required
                    />
                  </TableCell>

                  <TableCell className="sl-qty-cell">
                    <input
                      type="number"
                      name="qty"
                      className="sl-size-input"
                      value={row.qty}
                      onChange={(e) => handleRowChange(index, e)}
                      disabled={row.confirmed && !isEditMode}
                      required
                    />
                  </TableCell>

                  <TableCell className="sl-ltrs-cell">
                    <input
                      className="sl-compact-number-input"
                      type="number"
                      value={row.ltrs}
                      readOnly
                    />
                  </TableCell>

                  <TableCell className="sl-price-list-basic-cell">
                    <input
                      className="sl-compact-number-input"
                      type="number"
                      value={row.priceListBasic}
                      readOnly
                    />
                  </TableCell>

                  <TableCell>
                    <input
                      type="number"
                      name="basicPrice"
                      value={row.basicPrice}
                      onChange={(e) => handleRowChange(index, e)}
                      disabled={row.confirmed && !isEditMode}
                    />
                  </TableCell>

                  <TableCell>
                    <input type="text" value={Number(row.tax).toFixed(2)} readOnly />
                  </TableCell>

                  <TableCell>
                    <input type="number" value={row.amount} readOnly />
                  </TableCell>

                  <TableCell className="sl-row-actions">
                    {!row.confirmed ? (
                      <>
                        <button
                          type="button"
                          className="sl-confirm-item-btn"
                          onClick={() => handleConfirmRow(index)}
                        >
                          Confirm
                        </button>
                        {/* Why this row would not confirm, in the row. */}
                        <FieldError message={confirmProblems[row.uid]} />
                      </>
                    ) : (
                      <>
                        <span className="sl-row-confirmed-badge">Confirmed</span>
                        <button
                          type="button"
                          className="sl-edit-item-btn"
                          onClick={() => handleEditRow(index)}
                        >
                          Edit
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="sl-delete-btn"
                      onClick={() => handleDeleteRow(index)}
                      aria-label={`Delete item ${index + 1}`}
                      title="Delete item"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8 6V4.5A1.5 1.5 0 019.5 3h5A1.5 1.5 0 0116 4.5V6"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 6l-1 13a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
                        />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </TableCell>
                </TableRow>

                {row.item && !isFocOrder && !isSchemePanelHidden(row) && (
                  <TableRow key={`scheme-${index}`} className="sl-scheme-row-wrap">
                    <TableCell colSpan={14}>
                      <div className={`sl-scheme-panel${row.isScheme ? " is-active" : ""}`}>
                        <div className="sl-scheme-panel-head">
                          <div>
                            <div className="sl-scheme-eyebrow">Optional promotion</div>
                            <div className="sl-scheme-title">Add scheme to this item</div>
                          </div>
                          <div className="sl-scheme-toggle-compact">
                            <span className="sl-scheme-toggle-label">
                              {row.isScheme ? "Enabled" : "Disabled"}
                            </span>
                            <label className="sl-switch">
                              <input
                                type="checkbox"
                                checked={row.isScheme}
                                onChange={(e) => handleRowSchemeToggle(index, e.target.checked)}
                                disabled={row.confirmed && !isEditMode}
                              />
                              <span className="sl-switch-slider" />
                            </label>
                          </div>
                        </div>

                        {row.isScheme && (
                          <div className="sl-scheme-panel-body">
                            <div className="sl-scheme-dropdown-field">
                              <div className="sl-scheme-table-head">
                                <span>Scheme</span>
                                <span>Qty</span>
                                <span>Action</span>
                              </div>
                              {(row.schemes.length
                                ? row.schemes
                                : [{ scheme: "", schemeQty: "" }]
                              ).map((schemeRow, schemeIndex) => (
                                <div
                                  className="sl-scheme-table-row"
                                  key={`${index}-${schemeIndex}`}
                                >
                                  <select
                                    value={schemeRow.scheme}
                                    onChange={(e) =>
                                      handleSchemeChange(
                                        index,
                                        schemeIndex,
                                        "scheme",
                                        e.target.value,
                                      )
                                    }
                                    disabled={
                                      (row.confirmed && !isEditMode) ||
                                      !(schemeOptions[row.uid] || []).length
                                    }
                                  >
                                    <option value="">Select Scheme...</option>
                                    {(schemeOptions[row.uid] || []).map((scheme) => (
                                      <option key={scheme.scheme_id} value={scheme.scheme_id}>
                                        {scheme.scheme_name}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    value={schemeRow.schemeQty}
                                    placeholder="0"
                                    onChange={(e) =>
                                      handleSchemeChange(
                                        index,
                                        schemeIndex,
                                        "schemeQty",
                                        e.target.value,
                                      )
                                    }
                                    disabled={row.confirmed && !isEditMode}
                                  />
                                  <button
                                    type="button"
                                    className="sl-remove-scheme-btn"
                                    onClick={() => handleRemoveScheme(index, schemeIndex)}
                                    disabled={row.confirmed && !isEditMode}
                                    aria-label="Remove scheme"
                                    title="Remove scheme"
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <path strokeLinecap="round" d="M5 12h14" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                className="sl-add-scheme-btn"
                                onClick={() => handleAddScheme(index)}
                                disabled={row.confirmed && !isEditMode}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                                </svg>
                                Add Scheme
                              </button>
                            </div>

                            <div className="sl-scheme-total-card">
                              <span className="sl-scheme-field-label">Total Ltrs</span>
                              <input
                                type="text"
                                name="totalLtrs"
                                value={
                                  row.schemes.length
                                    ? (
                                        Number(row.ltrs) +
                                        row.schemes.reduce(
                                          (sum, scheme) => sum + Number(scheme.schemeQty || 0),
                                          0,
                                        )
                                      ).toFixed(2)
                                    : Number(row.ltrs).toFixed(2)
                                }
                                readOnly
                              />
                              <small>Base ltrs plus selected scheme quantity</small>
                            </div>
                          </div>
                        )}

                        {/* <div className="sl-scheme-qty-field">
                            <label className="sl-scheme-field-label">Scheme Ltrs</label>
                            <input
                              type="text"
                              name="schemeLtrs"
                              value={row.isScheme && row.schemeLtrs ? Number(row.schemeLtrs).toFixed(2) : ""}
                              readOnly
                            />
                          </div> */}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      {canAddMoreItems && (
        <button type="button" className="sl-add-row" onClick={handleAddRow}>
          <span>+ Add Item</span>
        </button>
      )}

      <div className="sl-section-label">Summary</div>
      <div className="sl-grid sl-summary-grid">
        {canEditPoNumber && (
          <div className="sl-field">
            <label className="sl-label" htmlFor="poNumber">
              {poField.label}
              {poField.required && <span className="sl-req-mark"> *</span>}
            </label>
            <div className="sl-input-wrap">
              <input
                type="text"
                id="poNumber"
                name="poNumber"
                value={formData.poNumber}
                onChange={handleChange}
                placeholder="Enter PO number"
                // Live on this path: the legacy branch is inside the <form>.
                required={poField.required}
              />
              <div className="sl-focus-line" />
            </div>
          </div>
        )}

        {isMartOrder && <WarehouseField form={form} />}

        <div className="sl-field">
          <label className="sl-label">Company</label>
          <div
            className={`sl-party-dropdown${companyDropdownOpen ? " open" : ""}`}
            ref={companyDropdownRef}
          >
            <button
              type="button"
              className="sl-party-trigger"
              onClick={() => setCompanyDropdownOpen((prev) => !prev)}
            >
              <span>{selectedCompanyLabel || "Select Company"}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="#64748b"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {companyDropdownOpen && (
              <div className="sl-party-menu">
                <div className="sl-party-options">
                  <button
                    type="button"
                    className={`sl-party-option${!formData.company ? " is-selected" : ""}`}
                    onClick={() => handleCompanySelect("")}
                  >
                    <span className="sl-party-option-label">Select Company</span>
                  </button>
                  {company.length > 0 ? (
                    company.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`sl-party-option${
                          String(item.id) === formData.company ? " is-selected" : ""
                        }`}
                        onClick={() => handleCompanySelect(String(item.id))}
                      >
                        <span className="sl-party-option-label">{item.name}</span>
                      </button>
                    ))
                  ) : (
                    <div className="sl-party-empty">No companies found</div>
                  )}
                </div>
              </div>
            )}
            <input type="hidden" name="company" value={formData.company} required />
          </div>
        </div>

        <div className="sl-field">
          <label className="sl-label">Total</label>
          <div className="sl-input-wrap">
            <input type="text" value={totalAmount.toFixed(2)} readOnly />
            <div className="sl-focus-line" />
          </div>
        </div>
        <div className="sl-field">
          <label className="sl-label">Tax</label>
          <div className="sl-input-wrap">
            <input type="text" value={taxAmount} readOnly />
            <div className="sl-focus-line" />
          </div>
        </div>

        <div className="sl-field">
          <label className="sl-label">Grand Total</label>
          <div className="sl-input-wrap">
            <input type="text" name="gtotal" value={grandTotal.toFixed(1)} readOnly />
            <div className="sl-focus-line" />
          </div>
        </div>

        <div className="sl-field sl-full">
          <label className="sl-label" htmlFor="comment">
            Comment
          </label>
          <div className="sl-input-wrap sl-input-wrap-textarea">
            <textarea
              id="comment"
              name="comment"
              rows={2}
              placeholder="Add a note..."
              value={formData.comment}
              onChange={(e) => setFormData((prev) => ({ ...prev, comment: e.target.value }))}
            />
            <div className="sl-focus-line" />
          </div>
        </div>
      </div>

      {/* This form has no step gates at all, so before step 7 its only answer
          to a bad order was a modal dialog. */}
      <ProblemSummary problems={problems} />

      <div className="sl-actions">
        <button
          type="submit"
          className="sl-btn-save"
          disabled={
            isSaving || confirmedRows.length === 0 || rows.some((row) => !row.confirmed && row.item)
          }
        >
          <span>
            {isEditMode
              ? "Update Order"
              : isDuplicateMode
                ? "Create as New"
                : isFocMode
                  ? "Create FOC Order"
                  : "Save Order"}
          </span>
        </button>
        {(!isEditMode || editOrderIsDraft) && (
          <button
            type="button"
            className="sl-btn-draft"
            onClick={handleSaveDraft}
            disabled={isSaving || isSavingDraft}
          >
            <span>{isSavingDraft ? "Saving Draft..." : "Save as Draft"}</span>
          </button>
        )}
        <button type="button" className="sl-btn-clear" onClick={handleClearForm}>
          <span>{isLoadingFromOrder ? "Cancel" : "Clear"}</span>
        </button>
      </div>
    </form>
  );
}
