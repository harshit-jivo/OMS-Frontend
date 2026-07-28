import { useMemo, useState } from "react";
import {
  HiBuildingOffice2,
  HiUserGroup,
  HiUser,
  HiBanknotes,
  HiChevronDown,
  HiCheckCircle,
} from "react-icons/hi2";

import "../../styles/Payments.css";

/**
 * Make Payment — UI ONLY (no backend / no API / no validation yet).
 *
 * All options are dummy data. This screen only demonstrates the layout and
 * interactions (the Party dropdown reacts to the Pay-To selection). Wiring to
 * a real payments API is a later task.
 */

// ── Dummy data ──────────────────────────────────────────────────────────────
const COMPANY_OPTIONS = ["JIVO Oil", "JIVO Beverages", "JIVO Mart"];

const PAY_TO_OPTIONS = ["Party", "Others"];

const PARTY_OPTIONS = [
  "ABC Traders",
  "XYZ Enterprises",
  "Mahesh Agency",
  "Krishna Foods",
  "Om Distributors",
];

const OTHERS_OPTIONS = ["Navdeep Sir"];

const PAYMENT_METHOD_OPTIONS = ["Cash", "UPI", "Bank Account", "Cheque", "NEFT"];

// A labelled select with a leading icon and a custom chevron. Labels sit above
// each field per the design.
function IconSelect({
  id,
  label,
  icon,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div className="pay-field">
      <label className="pay-label" htmlFor={id}>
        {label}
      </label>
      <div className="pay-select-wrap">
        <span className="pay-select-icon" aria-hidden="true">
          {icon}
        </span>
        <select
          id={id}
          className="pay-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <span className="pay-select-chevron" aria-hidden="true">
          <HiChevronDown />
        </span>
      </div>
    </div>
  );
}

export default function MakePayment() {
  // Company is pre-selected by default.
  const [company, setCompany] = useState<string>(COMPANY_OPTIONS[0]);
  const [payTo, setPayTo] = useState<string>(PAY_TO_OPTIONS[0]);
  const [party, setParty] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>(
    PAYMENT_METHOD_OPTIONS[0],
  );
  const [remarks, setRemarks] = useState<string>("");

  // The Party dropdown's options depend on Pay To.
  const partyOptions = useMemo(
    () => (payTo === "Others" ? OTHERS_OPTIONS : PARTY_OPTIONS),
    [payTo],
  );

  const handlePayToChange = (value: string) => {
    setPayTo(value);
    setParty(""); // reset the dependent selection when the source list changes
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // UI only — no API. Log the current selection for now.
    // eslint-disable-next-line no-console
    console.log("Make Payment (UI only):", {
      company,
      payTo,
      party,
      paymentMethod,
      remarks,
    });
  };

  return (
    <div className="pay-page app-page">
      {/* ── PAGE HEADER ── */}
      <div className="pay-header">
        <h1 className="pay-title">Make Payment</h1>
        <p className="pay-subtitle">
          Record a payment to a party or other recipient.
        </p>
      </div>

      {/* ── FORM CARD ── */}
      <form className="pay-card" onSubmit={handleSubmit}>
        {/* Row 1 — all fields in one row (wraps on small screens). */}
        <div className="pay-row pay-row-grid">
          <IconSelect
            id="pay-company"
            label="Company"
            icon={<HiBuildingOffice2 />}
            value={company}
            onChange={setCompany}
            options={COMPANY_OPTIONS}
          />

          <IconSelect
            id="pay-payto"
            label="Pay To"
            icon={<HiUserGroup />}
            value={payTo}
            onChange={handlePayToChange}
            options={PAY_TO_OPTIONS}
          />

          <IconSelect
            id="pay-party"
            label={payTo === "Others" ? "Recipient" : "Party"}
            icon={<HiUser />}
            value={party}
            onChange={setParty}
            options={partyOptions}
            placeholder={
              payTo === "Others" ? "Select recipient" : "Select party"
            }
          />

          <IconSelect
            id="pay-method"
            label="Payment Method"
            icon={<HiBanknotes />}
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={PAYMENT_METHOD_OPTIONS}
          />
        </div>

        {/* Row 2 — remarks (full width). */}
        <div className="pay-row">
          <div className="pay-field pay-field-full">
            <label className="pay-label" htmlFor="pay-remarks">
              Remarks
            </label>
            <textarea
              id="pay-remarks"
              className="pay-textarea"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Enter remarks (optional)..."
              rows={4}
            />
          </div>
        </div>

        {/* Row 3 — submit (left aligned). */}
        <div className="pay-row pay-actions">
          <button type="submit" className="pay-submit">
            <HiCheckCircle size={18} />
            Submit Payment
          </button>
        </div>
      </form>
    </div>
  );
}
