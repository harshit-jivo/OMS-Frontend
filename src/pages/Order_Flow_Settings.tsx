import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiCheck,
  HiCheckCircle,
  HiChevronDown,
  HiCog6Tooth,
  HiExclamationCircle,
  HiSquares2X2,
} from "react-icons/hi2";
import {
  ordersService,
  type OrderFlowConditionOption,
  type OrderFlowConfig,
  type OrderFlowTypeOption,
} from "../services/ordersService";
import "../styles/Order_Flow_Settings.css";

const DEFAULT_CONDITIONS: OrderFlowConditionOption[] = [
  { code: "BASIC_GT_MARKET", label: "Basic Price > Market Price" },
  { code: "BASIC_LT_MARKET", label: "Basic Price < Market Price" },
  { code: "BASIC_EQ_MARKET", label: "Basic Price = Market Price" },
  { code: "BASIC_MARKET_ZERO", label: "Basic Price and Market Price = 0" },
  { code: "BASIC_ZERO_MARKET_GT_ZERO", label: "Basic Price = 0 and Market Price > 0" },
];

const DEFAULT_FLOW_OPTIONS: OrderFlowTypeOption[] = [
  { code: "ASM", label: "ASM Order Flow" },
  { code: "BILLING", label: "Billing Orders Flow" },
];

const DEFAULT_CONFIG: OrderFlowConfig = {
  flow_type: "ASM",
  flow_label: "ASM Order Flow",
  flow_options: DEFAULT_FLOW_OPTIONS,
  rate_approval_enabled: true,
  billing_enabled: true,
  auditor_enabled: true,
  rate_conditions: ["BASIC_GT_MARKET"],
  condition_options: DEFAULT_CONDITIONS,
};

type ToggleRowProps = {
  title: string;
  subtitle?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
};

function ToggleRow({ title, subtitle, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      className={`ofs-toggle-row${checked ? " is-checked" : ""}${disabled ? " is-disabled" : ""}`}
      onClick={onChange}
      disabled={disabled}
    >
      <span className="ofs-checkbox" aria-hidden="true">
        {checked ? <HiCheck /> : null}
      </span>
      <span className="ofs-toggle-text">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </button>
  );
}

export default function Order_Flow_Settings() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<OrderFlowConfig>(DEFAULT_CONFIG);
  const [selectedFlowType, setSelectedFlowType] = useState("ASM");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flowMenuOpen, setFlowMenuOpen] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [error, setError] = useState("");

  const conditionOptions = config.condition_options?.length
    ? config.condition_options
    : DEFAULT_CONDITIONS;
  const flowOptions = config.flow_options?.length ? config.flow_options : DEFAULT_FLOW_OPTIONS;
  const selectedFlowLabel =
    flowOptions.find((option) => option.code === selectedFlowType)?.label ||
    config.flow_label ||
    "ASM Order Flow";

  const loadConfig = useCallback(async (flowType = selectedFlowType) => {
    setLoading(true);
    setError("");
    try {
      const data = await ordersService.getOrderFlowConfig(flowType);
      setConfig({
        ...DEFAULT_CONFIG,
        ...data,
        flow_type: data.flow_type || flowType,
        flow_options: data.flow_options?.length ? data.flow_options : DEFAULT_FLOW_OPTIONS,
        condition_options: data.condition_options?.length
          ? data.condition_options
          : DEFAULT_CONDITIONS,
        rate_conditions: Array.isArray(data.rate_conditions)
          ? data.rate_conditions
          : DEFAULT_CONFIG.rate_conditions,
      });
      setSelectedFlowType(data.flow_type || flowType);
    } catch (err) {
      console.error("Failed to load order flow settings:", err);
      setError("Failed to load order flow settings.");
    } finally {
      setLoading(false);
    }
  }, [selectedFlowType]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const flowPreview = useMemo(() => {
    const stages = ["Order Created"];
    if (config.rate_approval_enabled) stages.push("Rate Approval");
    if (config.billing_enabled) stages.push("Billing");
    if (config.auditor_enabled) stages.push("Auditor");
    stages.push("Completed");
    return stages;
  }, [config]);

  const toggleStage = (key: "rate_approval_enabled" | "billing_enabled" | "auditor_enabled") => {
    setConfig((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleCondition = (code: string) => {
    setConfig((current) => {
      const selected = new Set(current.rate_conditions || []);
      if (selected.has(code)) selected.delete(code);
      else selected.add(code);
      return { ...current, rate_conditions: Array.from(selected) };
    });
  };

  const handleFlowSelect = (flowType: string) => {
    setSelectedFlowType(flowType);
    setFlowMenuOpen(false);
    void loadConfig(flowType);
  };

  const handleSave = async () => {
    setError("");
    if (config.rate_approval_enabled && !config.rate_conditions.length) {
      setError("Select at least one Rate Approval condition or turn Rate Approval off.");
      return;
    }

    setSaving(true);
    try {
      const response = await ordersService.updateOrderFlowConfig({
        ...config,
        flow_type: selectedFlowType,
        rate_conditions: config.rate_conditions || [],
      });

      if ("success" in response && response.success === false) {
        setError(response.message || "Failed to save order flow.");
        return;
      }

      const savedConfig = "data" in response && response.data ? response.data : response as OrderFlowConfig;
      setConfig({
        ...DEFAULT_CONFIG,
        ...savedConfig,
        flow_type: savedConfig.flow_type || selectedFlowType,
        flow_options: savedConfig.flow_options?.length ? savedConfig.flow_options : flowOptions,
        condition_options: savedConfig.condition_options?.length
          ? savedConfig.condition_options
          : conditionOptions,
      });
      setSuccessVisible(true);
    } catch (err: any) {
      console.error("Failed to save order flow settings:", err);
      setError(err?.response?.data?.message || "Failed to save order flow settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ofs-page">
        <div className="ofs-loading">
          <span className="ofs-spinner" />
          <span>Loading order flow...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ofs-page">
      <div className="ofs-header">
        <div>
          <span className="ofs-kicker">Administration</span>
          <h1>Order Flow Settings</h1>
          <p>Control the approval stages and price conditions used when orders are created.</p>
        </div>
        <button type="button" className="ofs-refresh" onClick={() => loadConfig(selectedFlowType)}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="ofs-alert">
          <HiExclamationCircle />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="ofs-grid">
        <section className="ofs-card">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>Flow Type</h2>
          </div>

          <div className="ofs-flow-select">
            <button type="button" className="ofs-flow-trigger" onClick={() => setFlowMenuOpen((open) => !open)}>
              <span>
                <small>Selected Flow</small>
                <strong>{selectedFlowLabel}</strong>
              </span>
              <HiChevronDown className={flowMenuOpen ? "is-open" : ""} />
            </button>
            {flowMenuOpen ? (
              <div className="ofs-flow-menu">
                {flowOptions.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    className={`ofs-flow-option${option.code === selectedFlowType ? " is-selected" : ""}`}
                    onClick={() => handleFlowSelect(option.code)}
                  >
                    <span>{option.label}</span>
                    {option.code === selectedFlowType ? <HiCheckCircle /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="ofs-card">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>Order Flow</h2>
          </div>

          <div className="ofs-list">
            <ToggleRow
              title="Rate Approval"
              subtitle="Use Rate Approval only for selected price conditions."
              checked={config.rate_approval_enabled}
              onChange={() => toggleStage("rate_approval_enabled")}
            />
            <ToggleRow
              title="Billing"
              subtitle="Send accepted orders to Billing."
              checked={config.billing_enabled}
              onChange={() => toggleStage("billing_enabled")}
            />
            <ToggleRow
              title="Auditor"
              subtitle="Send accepted orders to Auditor Approval."
              checked={config.auditor_enabled}
              onChange={() => toggleStage("auditor_enabled")}
            />
          </div>
        </section>

        <section className="ofs-card ofs-card--wide">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>Rate Conditions</h2>
          </div>

          <div className="ofs-condition-grid">
            {conditionOptions.map((condition) => (
              <ToggleRow
                key={condition.code}
                title={condition.label}
                checked={(config.rate_conditions || []).includes(condition.code)}
                disabled={!config.rate_approval_enabled}
                onChange={() => toggleCondition(condition.code)}
              />
            ))}
          </div>
        </section>

        <section className="ofs-preview">
          <div className="ofs-preview-head">
            <HiCog6Tooth />
            <div>
              <h2>Flow Preview</h2>
              <p>
                {config.rate_approval_enabled
                  ? "Rate Approval is used only when selected price conditions match."
                  : "Orders will move without Rate Approval."}
              </p>
            </div>
          </div>
          <div className="ofs-steps">
            {flowPreview.map((stage, index) => (
              <span key={`${stage}-${index}`} className="ofs-step">
                {stage}
              </span>
            ))}
          </div>
        </section>
      </div>

      <div className="ofs-actions">
        <button type="button" className="ofs-save" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Flow"}
        </button>
      </div>

      {successVisible ? (
        <div className="ofs-modal-backdrop" onClick={() => setSuccessVisible(false)}>
          <div className="ofs-modal" onClick={(event) => event.stopPropagation()}>
            <div className="ofs-success-icon">
              <HiCheck />
            </div>
            <h2>Flow Saved</h2>
            <p>Order flow settings saved successfully.</p>
            <div className="ofs-modal-actions">
              <button type="button" className="ofs-secondary" onClick={() => setSuccessVisible(false)}>
                Change Flow
              </button>
              <button type="button" className="ofs-primary" onClick={() => navigate("/Dashboard")}>
                <HiSquares2X2 />
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
