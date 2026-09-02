import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  HiCheck,
  HiCheckCircle,
  HiChevronDown,
  HiCog6Tooth,
  HiExclamationCircle,
  HiMagnifyingGlass,
  HiSquares2X2,
  HiTrash,
  HiXMark,
} from "react-icons/hi2";
import {
  ordersService,
  type OrderFlowConditionOption,
  type OrderFlowConfig,
  type OrderFlowTypeOption,
  type PartyFlowConfig,
} from "../services/ordersService";
import { sapService } from "../services/sapService";
import type { Party } from "../services/sapService";
import "../styles/Order_Flow_Settings.css";
import "../styles/Order_Flow_Settings_Parties.css";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { messageFrom } from "@/lib/apiError";

const DEFAULT_CONDITIONS: OrderFlowConditionOption[] = [
  { code: "BASIC_GT_MARKET", label: "Price List (Basic) > Basic Price and Basic Price != 0" },
  { code: "BASIC_LT_MARKET", label: "Price List (Basic) < Basic Price" },
  { code: "BASIC_EQ_MARKET", label: "Price List (Basic) = Basic Price" },
  { code: "BASIC_MARKET_ZERO", label: "Price List (Basic) and Basic Price = 0" },
  { code: "BASIC_ZERO_MARKET_GT_ZERO", label: "Price List (Basic) = 0 and Basic Price > 0" },
];

const DEFAULT_FLOW_OPTIONS: OrderFlowTypeOption[] = [
  { code: "ASM", label: "ASM Order Flow" },
  { code: "BILLING", label: "Billing Orders Flow" },
];

/** Stable empties, so the party filter memos settle. */
const NO_PARTIES: Party[] = [];
const NO_PARTY_CONFIGS: PartyFlowConfig[] = [];

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

const PARTY_DEFAULT_CONFIG: OrderFlowConfig = {
  ...DEFAULT_CONFIG,
  rate_approval_enabled: true,
  billing_enabled: true,
  auditor_enabled: true,
  rate_conditions: ["BASIC_GT_MARKET"],
};

type ApplyMode = "global" | "parties";

const getPartyCode = (party: Party) => String(party.card_code || "").trim();
const getPartyName = (party: Party) => String(party.card_name || "").trim();
const getPartyCat = (party: Party) =>
  String(party.category || "")
    .trim()
    .toUpperCase();

const normalizeParties = (data: unknown): Party[] => {
  if (Array.isArray(data)) return data as Party[];
  if (data && typeof data === "object") {
    const response = data as { data?: unknown; results?: unknown; parties?: unknown };
    if (Array.isArray(response.data)) return response.data as Party[];
    if (Array.isArray(response.results)) return response.results as Party[];
    if (Array.isArray(response.parties)) return response.parties as Party[];
  }
  return [];
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
      role="checkbox"
      aria-checked={checked}
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
  const queryClient = useQueryClient();
  /** Save/delete failures. The LOAD failure is the query's, below. */
  const [saveError, setSaveError] = useState("");
  const [config, setConfig] = useState<OrderFlowConfig>(DEFAULT_CONFIG);
  const [selectedFlowType, setSelectedFlowType] = useState("ASM");
  const [saving, setSaving] = useState(false);
  const [flowMenuOpen, setFlowMenuOpen] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  // Party-specific flow state
  const [applyMode, setApplyMode] = useState<ApplyMode>("global");
  const [selectedTargets, setSelectedTargets] = useState<
    { card_code: string; category: string; card_name: string }[]
  >([]);
  const [partyMenuOpen, setPartyMenuOpen] = useState(false);
  const [partySearch, setPartySearch] = useState("");
  const partyDropdownRef = useRef<HTMLDivElement>(null);

  const conditionOptions = config.condition_options?.length
    ? config.condition_options
    : DEFAULT_CONDITIONS;
  const flowOptions = config.flow_options?.length ? config.flow_options : DEFAULT_FLOW_OPTIONS;
  const selectedFlowLabel =
    flowOptions.find((option) => option.code === selectedFlowType)?.label ||
    config.flow_label ||
    "ASM Order Flow";
  const isPartyMode = applyMode === "parties";

  /*
   * `selectedFlowType` is the key. The old `loadConfig` was a `useCallback`
   * depending on `selectedFlowType` that ALSO called
   * `setSelectedFlowType(data.flow_type || flowType)` — so a successful load
   * changed the callback's identity and re-fired the effect that had just run.
   */
  const { data: configData, isPending: loading, isError: configFailed } = useQuery({
    queryKey: ["order-flow", "config", selectedFlowType],
    queryFn: async () => {
      const data = await ordersService.getOrderFlowConfig(selectedFlowType);
      return {
        ...DEFAULT_CONFIG,
        ...data,
        flow_type: data.flow_type || selectedFlowType,
        flow_options: data.flow_options?.length ? data.flow_options : DEFAULT_FLOW_OPTIONS,
        condition_options: data.condition_options?.length
          ? data.condition_options
          : DEFAULT_CONDITIONS,
        rate_conditions: Array.isArray(data.rate_conditions)
          ? data.rate_conditions
          : DEFAULT_CONFIG.rate_conditions,
      };
    },
  });

  /*
   * `config` is server-seeded and then user-edited (every toggle below writes
   * to it), so it stays state. Re-seeding during render rather than in an
   * effect: an effect would be a `set-state-in-effect` violation and would also
   * land a render late. The `seededFrom` identity guard is what stops the
   * `flow_type` adoption from looping.
   */
  const [seededFrom, setSeededFrom] = useState<typeof configData>(undefined);
  if (configData && configData !== seededFrom) {
    setSeededFrom(configData);
    setConfig(configData);
    if (configData.flow_type && configData.flow_type !== selectedFlowType) {
      setSelectedFlowType(configData.flow_type);
    }
  }

  const error = saveError || (configFailed ? "Failed to load order flow settings." : "");

  const loadConfig = (flowType?: string) => {
    if (flowType && flowType !== selectedFlowType) setSelectedFlowType(flowType);
    return queryClient.invalidateQueries({ queryKey: ["order-flow", "config"] });
  };

  /* Parties and their per-party flow overrides, read together so the list and
     the overrides describe the same moment. */
  const { data: partyData } = useQuery({
    queryKey: ["order-flow", "parties"],
    queryFn: async () => {
      const [rawParties, configs] = await Promise.all([
        sapService.getParties(),
        ordersService.getPartyFlowConfigs(),
      ]);
      // The parties endpoint repeats rows; keep one entry per party + category
      // so the category variants stay visible, but drop exact duplicates (which
      // would create duplicate React keys and break list filtering).
      const seen = new Set<string>();
      const uniqueParties = normalizeParties(rawParties).filter((party) => {
        const code = getPartyCode(party);
        if (!code) return false;
        const key = `${code}||${String(party.category || "").trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return {
        parties: uniqueParties,
        partyConfigs: Array.isArray(configs?.data) ? configs.data : NO_PARTY_CONFIGS,
      };
    },
  });
  const parties = partyData?.parties ?? NO_PARTIES;
  const partyConfigs = partyData?.partyConfigs ?? NO_PARTY_CONFIGS;

  const loadParties = () => queryClient.invalidateQueries({ queryKey: ["order-flow", "parties"] });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) {
        setPartyMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const partyConfigByKey = useMemo(() => {
    return partyConfigs.reduce<Record<string, PartyFlowConfig>>((current, item) => {
      current[`${item.card_code}||${item.category}||${item.flow_type}`] = item;
      return current;
    }, {});
  }, [partyConfigs]);

  const isTargetSelected = (code: string, category: string) =>
    selectedTargets.some((target) => target.card_code === code && target.category === category);

  const filteredParties = useMemo(() => {
    const term = partySearch.trim().toLowerCase();
    const base = term
      ? parties.filter((party) =>
          [getPartyName(party), getPartyCode(party), party.category, party.state].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(term),
          ),
        )
      : parties;
    return [...base].sort((a, b) => {
      const aSel = isTargetSelected(getPartyCode(a), getPartyCat(a)) ? 0 : 1;
      const bSel = isTargetSelected(getPartyCode(b), getPartyCat(b)) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return getPartyName(a).localeCompare(getPartyName(b));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parties, partySearch, selectedTargets]);

  // Keyed by code||category — the same card_code can belong to different
  // parties across categories (e.g. OIL vs BEVERAGES), so code alone is ambiguous.
  const partyNameByKey = useMemo(() => {
    return parties.reduce<Record<string, string>>((current, party) => {
      current[`${getPartyCode(party)}||${getPartyCat(party)}`] = getPartyName(party);
      return current;
    }, {});
  }, [parties]);

  const lookupPartyName = (code: string, category?: string | null) =>
    partyNameByKey[
      `${String(code || "").trim()}||${String(category || "")
        .trim()
        .toUpperCase()}`
    ] || "";

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

  const applyPartySettings = (settings: PartyFlowConfig) => {
    setConfig((current) => ({
      ...current,
      rate_approval_enabled: settings.rate_approval_enabled,
      billing_enabled: settings.billing_enabled,
      auditor_enabled: settings.auditor_enabled,
      rate_conditions: Array.isArray(settings.rate_conditions) ? settings.rate_conditions : [],
    }));
  };

  // When exactly one party+category is selected, load its saved flow (for the role); else defaults.
  const loadSelectionSettings = (targets: typeof selectedTargets, flowType: string) => {
    const single =
      targets.length === 1
        ? partyConfigByKey[`${targets[0].card_code}||${targets[0].category}||${flowType}`]
        : undefined;
    if (single) applyPartySettings(single);
    else setConfig((current) => ({ ...current, ...PARTY_DEFAULT_CONFIG }));
  };

  const handleFlowSelect = (flowType: string) => {
    setSelectedFlowType(flowType);
    setFlowMenuOpen(false);
    if (isPartyMode) {
      loadSelectionSettings(selectedTargets, flowType);
    } else {
      void loadConfig(flowType);
    }
  };

  const switchMode = (mode: ApplyMode) => {
    setApplyMode(mode);
    setSaveError("");
    if (mode === "parties") {
      loadSelectionSettings(selectedTargets, selectedFlowType);
    } else {
      void loadConfig(selectedFlowType);
    }
  };

  const togglePartySelect = (party: Party) => {
    const code = getPartyCode(party);
    if (!code) return;
    const category = getPartyCat(party);
    setSelectedTargets((current) => {
      const exists = current.some((t) => t.card_code === code && t.category === category);
      const next = exists
        ? current.filter((t) => !(t.card_code === code && t.category === category))
        : [...current, { card_code: code, category, card_name: getPartyName(party) || code }];
      loadSelectionSettings(next, selectedFlowType);
      return next;
    });
  };

  const removeSelectedTarget = (code: string, category: string) => {
    setSelectedTargets((current) =>
      current.filter((t) => !(t.card_code === code && t.category === category)),
    );
  };

  const editConfiguredParty = (cfg: PartyFlowConfig) => {
    setApplyMode("parties");
    setSelectedFlowType(cfg.flow_type);
    setSelectedTargets([
      {
        card_code: cfg.card_code,
        category: cfg.category || "",
        card_name: lookupPartyName(cfg.card_code, cfg.category) || cfg.card_name || cfg.card_code,
      },
    ]);
    applyPartySettings(cfg);
  };

  const removeConfiguredParty = async (cfg: PartyFlowConfig) => {
    try {
      await ordersService.deletePartyFlowConfig(
        [{ card_code: cfg.card_code, category: cfg.category || "" }],
        cfg.flow_type,
      );
      queryClient.setQueryData<{ parties: Party[]; partyConfigs: PartyFlowConfig[] }>(
        ["order-flow", "parties"],
        (cached) =>
          cached && {
            ...cached,
            partyConfigs: cached.partyConfigs.filter(
              (item) =>
                !(
                  item.card_code === cfg.card_code &&
                  item.category === cfg.category &&
                  item.flow_type === cfg.flow_type
                ),
            ),
          },
      );
    } catch (err) {
      console.error("Failed to remove party flow:", err);
      setSaveError("Failed to remove custom flow for this party.");
    }
  };

  const handleSave = async () => {
    setSaveError("");
    if (config.rate_approval_enabled && !config.rate_conditions.length) {
      setSaveError("Select at least one Rate Approval condition or turn Rate Approval off.");
      return;
    }

    if (isPartyMode) {
      if (selectedTargets.length === 0) {
        setSaveError("Select at least one party to apply this flow to.");
        return;
      }
      setSaving(true);
      try {
        await ordersService.savePartyFlowConfig(
          selectedTargets.map((t) => ({ card_code: t.card_code, category: t.category })),
          selectedFlowType,
          {
            rate_approval_enabled: config.rate_approval_enabled,
            billing_enabled: config.billing_enabled,
            auditor_enabled: config.auditor_enabled,
            rate_conditions: config.rate_conditions || [],
          },
        );
        await loadParties();
        setSuccessVisible(true);
      } catch (err) {
        console.error("Failed to save party flow settings:", err);
        setSaveError(messageFrom(err, "Failed to save party flow settings."));
      } finally {
        setSaving(false);
      }
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
        setSaveError(response.message || "Failed to save order flow.");
        return;
      }

      const savedConfig =
        "data" in response && response.data ? response.data : (response as OrderFlowConfig);
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
    } catch (err) {
      console.error("Failed to save order flow settings:", err);
      setSaveError(messageFrom(err, "Failed to save order flow settings."));
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

  const partyFilterLabel =
    selectedTargets.length === 0
      ? "Select parties"
      : selectedTargets.length === 1
        ? `${selectedTargets[0].card_name}${selectedTargets[0].category ? ` (${selectedTargets[0].category})` : ""}`
        : `${selectedTargets.length} selected`;

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
            <h2>Apply To</h2>
          </div>

          <div className="ofp-mode-switch" role="tablist" aria-label="Apply flow to">
            <button
              type="button"
              className={`ofp-mode-btn${!isPartyMode ? " is-active" : ""}`}
              onClick={() => switchMode("global")}
            >
              All Orders (Global)
            </button>
            <button
              type="button"
              className={`ofp-mode-btn${isPartyMode ? " is-active" : ""}`}
              onClick={() => switchMode("parties")}
            >
              Specific Parties
            </button>
          </div>

          <div className="ofs-flow-select">
            <button
              type="button"
              className="ofs-flow-trigger"
              aria-haspopup="listbox"
              aria-expanded={flowMenuOpen}
              onClick={() => setFlowMenuOpen((open) => !open)}
            >
              <span>
                <small>{isPartyMode ? "Flow Role" : "Selected Flow"}</small>
                <strong>{selectedFlowLabel}</strong>
              </span>
              <HiChevronDown className={flowMenuOpen ? "is-open" : ""} />
            </button>
            {flowMenuOpen ? (
              <div className="ofs-flow-menu" role="listbox">
                {flowOptions.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    role="option"
                    aria-selected={option.code === selectedFlowType}
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

          {isPartyMode ? (
            <div className="ofs-flow-select ofp-party-select" ref={partyDropdownRef}>
              <button
                type="button"
                className="ofs-flow-trigger"
                aria-haspopup="listbox"
                aria-expanded={partyMenuOpen}
                onClick={() => setPartyMenuOpen((open) => !open)}
              >
                <span>
                  <small>Selected Parties</small>
                  <strong>{partyFilterLabel}</strong>
                </span>
                <HiChevronDown className={partyMenuOpen ? "is-open" : ""} />
              </button>
              {partyMenuOpen ? (
                <div className="ofs-flow-menu ofp-party-menu">
                  <label className="ofp-party-search">
                    <HiMagnifyingGlass aria-hidden="true" />
                    <input
                      type="text"
                      value={partySearch}
                      onChange={(event) => setPartySearch(event.target.value)}
                      placeholder="Search party by name or code"
                      aria-label="Search party by name or code"
                      autoFocus
                    />
                  </label>
                  <div className="ofp-party-options" role="listbox" aria-multiselectable="true">
                    {filteredParties.length === 0 ? (
                      <div className="ofp-party-empty">No party found</div>
                    ) : (
                      filteredParties.map((party) => {
                        const code = getPartyCode(party);
                        const category = getPartyCat(party);
                        const selected = isTargetSelected(code, category);
                        const hasConfig = Boolean(
                          partyConfigByKey[`${code}||${category}||${selectedFlowType}`],
                        );
                        return (
                          <button
                            key={`${code}||${category}`}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`ofp-party-option${selected ? " is-selected" : ""}`}
                            onClick={() => togglePartySelect(party)}
                          >
                            <span className={`ofp-party-check${selected ? " is-selected" : ""}`}>
                              {selected ? <HiCheck /> : null}
                            </span>
                            <span className="ofp-party-text">
                              <span>
                                <span className="ofp-party-name">
                                  {getPartyName(party) || code}
                                </span>
                                {category ? (
                                  <span className="ofp-party-cat">{category}</span>
                                ) : null}
                              </span>
                              <small>
                                {code}
                                {hasConfig ? ` · ${selectedFlowLabel}` : ""}
                              </small>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}

              {selectedTargets.length > 0 ? (
                <div className="ofp-party-chips">
                  {selectedTargets.map((target) => (
                    <span
                      className="ofp-party-chip"
                      key={`${target.card_code}||${target.category}`}
                    >
                      {target.card_name}
                      {target.category ? (
                        <span className="ofp-chip-cat">{target.category}</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeSelectedTarget(target.card_code, target.category)}
                        aria-label="Remove party"
                      >
                        <HiXMark />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="ofp-hint">
                The <strong>{selectedFlowLabel}</strong> stages below replace the global flow for
                every selected party's {selectedFlowType === "BILLING" ? "billing-created" : "ASM"}{" "}
                orders.
              </p>
            </div>
          ) : null}
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

        {isPartyMode && partyConfigs.length > 0 ? (
          <section className="ofs-card ofs-card--wide">
            <div className="ofs-card-head">
              <span className="ofs-card-mark" />
              <h2>Parties With Custom Flow</h2>
            </div>
            <div className="ofp-configured-list">
              {partyConfigs.map((cfg) => (
                <div
                  className="ofp-configured-row"
                  key={`${cfg.card_code}||${cfg.category}||${cfg.flow_type}`}
                >
                  <div className="ofp-configured-main">
                    <strong>
                      {lookupPartyName(cfg.card_code, cfg.category) ||
                        cfg.card_name ||
                        cfg.card_code}
                    </strong>
                    <small>
                      {cfg.card_code}
                      {cfg.category ? ` · ${cfg.category}` : ""} · {cfg.flow_label || cfg.flow_type}
                    </small>
                  </div>
                  <div className="ofp-configured-stages">
                    {cfg.rate_approval_enabled ? <span>Rate Approval</span> : null}
                    {cfg.billing_enabled ? <span>Billing</span> : null}
                    {cfg.auditor_enabled ? <span>Auditor</span> : null}
                  </div>
                  <div className="ofp-configured-actions">
                    <button
                      type="button"
                      className="ofs-secondary"
                      onClick={() => editConfiguredParty(cfg)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ofp-remove-btn"
                      onClick={() => void removeConfiguredParty(cfg)}
                      aria-label="Remove custom flow"
                    >
                      <HiTrash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="ofs-preview">
            <div className="ofs-preview-head">
              <HiCog6Tooth />
              <div>
                <h2>Flow Preview</h2>
                <p>
                  {isPartyMode
                    ? selectedTargets.length > 0
                      ? `Applies to ${selectedTargets.length} selected part${selectedTargets.length === 1 ? "y" : "ies"}.`
                      : "Select parties to apply this flow."
                    : config.rate_approval_enabled
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
        )}
      </div>

      <div className="ofs-actions">
        <button type="button" className="ofs-save" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : isPartyMode ? "Save Party Flow" : "Save Flow"}
        </button>
      </div>

      <Dialog
        open={Boolean(successVisible)}
        onOpenChange={(next) => {
          if (!next) (() => setSuccessVisible(false))();
        }}
      >
        {successVisible && (
          <DialogContent
            title="Flow settings"
            variant="bare"
            size="auto"
            showClose={false}
            className="ofs-modal"
          >
            <div className="ofs-success-icon">
              <HiCheck />
            </div>
            <h2>{isPartyMode ? "Party Flow Saved" : "Flow Saved"}</h2>
            <p>
              {isPartyMode
                ? "The selected parties now use this custom order flow."
                : "Order flow settings saved successfully."}
            </p>
            <div className="ofs-modal-actions">
              <button
                type="button"
                className="ofs-secondary"
                onClick={() => setSuccessVisible(false)}
              >
                Keep Editing
              </button>
              <button type="button" className="ofs-primary" onClick={() => navigate("/Dashboard")}>
                <HiSquares2X2 />
                Go to Dashboard
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
