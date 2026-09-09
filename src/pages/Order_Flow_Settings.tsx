/**
 * Order Flow Settings — which approval stages an order passes through.
 *
 * Two scopes, chosen by the "Apply to" control: the GLOBAL flow for a role
 * (ASM or Billing), or an override for named parties. The party override
 * replaces the global flow entirely for those parties, which is why the
 * preview and the party list are shown side by side rather than on two tabs —
 * the thing worth seeing is what a change replaces.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlineCog6Tooth, HiOutlineTrash, HiOutlineXMark } from "react-icons/hi2";

import { PermissionGrid, PermissionToggle } from "@/components/admin/PermissionToggle";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/dropdown";
import { Field } from "@/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  Notice,
  Page,
  PageHeader,
  SectionHeading,
} from "@/components/ui/page";
import { SegmentedControl } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import {
  ordersService,
  type OrderFlowConditionOption,
  type OrderFlowConfig,
  type OrderFlowTypeOption,
  type PartyFlowConfig,
} from "../services/ordersService";
import { sapService } from "../services/sapService";
import type { Party } from "../services/sapService";

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

/** `code||CATEGORY` — the same card_code belongs to different parties across
 *  categories (OIL vs BEVERAGES), so code alone is ambiguous. */
const targetKey = (code: string, category: string) => code + "||" + category;

export default function Order_Flow_Settings() {
  const queryClient = useQueryClient();
  /** Save/delete failures. The LOAD failure is the query's, below. */
  const [saveError, setSaveError] = useState("");
  const [config, setConfig] = useState<OrderFlowConfig>(DEFAULT_CONFIG);
  const [selectedFlowType, setSelectedFlowType] = useState("ASM");
  const [saving, setSaving] = useState(false);

  // Party-specific flow state
  const [applyMode, setApplyMode] = useState<ApplyMode>("global");
  const [selectedTargets, setSelectedTargets] = useState<
    { card_code: string; category: string; card_name: string }[]
  >([]);
  /** The party override a delete has been asked about. */
  const [confirmRemove, setConfirmRemove] = useState<PartyFlowConfig | null>(null);

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
  const {
    data: configData,
    isPending: loading,
    isError: configFailed,
  } = useQuery({
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
        const key = code + "||" + String(party.category || "").trim();
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

  const partyConfigByKey = useMemo(() => {
    return partyConfigs.reduce<Record<string, PartyFlowConfig>>((current, item) => {
      current[item.card_code + "||" + item.category + "||" + item.flow_type] = item;
      return current;
    }, {});
  }, [partyConfigs]);

  /*
   * The party picker was a hand-rolled trigger + menu + search + `partyDropdownRef`
   * + `document.addEventListener("mousedown")`, holding `partyMenuOpen` and
   * `partySearch` in the page. `ui/dropdown`'s MultiSelect is all of that minus
   * the state — DESIGN_SYSTEM §5a.
   */
  const partyOptions = useMemo<MultiSelectOption<string>[]>(
    () =>
      parties.map((party) => {
        const code = getPartyCode(party);
        const category = getPartyCat(party);
        const hasConfig = Boolean(
          partyConfigByKey[code + "||" + category + "||" + selectedFlowType],
        );
        return {
          value: targetKey(code, category),
          label: getPartyName(party) || code,
          hint: code + (category ? " · " + category : "") + (hasConfig ? " · has override" : ""),
          keywords: String(party.state || ""),
        };
      }),
    [parties, partyConfigByKey, selectedFlowType],
  );

  // Keyed by code||category, as above.
  const partyNameByKey = useMemo(() => {
    return parties.reduce<Record<string, string>>((current, party) => {
      current[targetKey(getPartyCode(party), getPartyCat(party))] = getPartyName(party);
      return current;
    }, {});
  }, [parties]);

  const lookupPartyName = (code: string, category?: string | null) =>
    partyNameByKey[
      targetKey(
        String(code || "").trim(),
        String(category || "")
          .trim()
          .toUpperCase(),
      )
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

  // When exactly one party+category is selected, load its saved flow (for the
  // role); otherwise fall back to the defaults.
  const loadSelectionSettings = (targets: typeof selectedTargets, flowType: string) => {
    const single =
      targets.length === 1
        ? partyConfigByKey[targets[0].card_code + "||" + targets[0].category + "||" + flowType]
        : undefined;
    if (single) applyPartySettings(single);
    else setConfig((current) => ({ ...current, ...PARTY_DEFAULT_CONFIG }));
  };

  const handleFlowSelect = (flowType: string) => {
    setSelectedFlowType(flowType);
    if (isPartyMode) loadSelectionSettings(selectedTargets, flowType);
    else void loadConfig(flowType);
  };

  const switchMode = (mode: ApplyMode) => {
    setApplyMode(mode);
    setSaveError("");
    if (mode === "parties") loadSelectionSettings(selectedTargets, selectedFlowType);
    else void loadConfig(selectedFlowType);
  };

  /** The picker hands back `code||CATEGORY` keys; rebuild the target records. */
  const selectTargets = (keys: string[]) => {
    const next = keys.map((key) => {
      const [card_code, category = ""] = key.split("||");
      return {
        card_code,
        category,
        card_name: partyNameByKey[key] || card_code,
      };
    });
    setSelectedTargets(next);
    loadSelectionSettings(next, selectedFlowType);
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

  const removeConfiguredParty = async () => {
    const cfg = confirmRemove;
    if (!cfg) return;
    setConfirmRemove(null);
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
      showToast({
        title: "Override removed",
        message:
          (lookupPartyName(cfg.card_code, cfg.category) || cfg.card_code) +
          " follows the global flow again.",
      });
    } catch (err) {
      console.error("Failed to remove party flow:", err);
      setSaveError("Failed to remove custom flow for this party.");
    }
  };

  const handleSave = async () => {
    setSaveError("");
    if (config.rate_approval_enabled && !config.rate_conditions.length) {
      setSaveError("Select at least one Rate Approval condition, or turn Rate Approval off.");
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
        showToast({
          title: "Party flow saved",
          message:
            selectedTargets.length +
            " part" +
            (selectedTargets.length === 1 ? "y" : "ies") +
            " now use this flow instead of the global one.",
        });
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
      showToast({
        title: "Flow saved",
        message: selectedFlowLabel + " now runs through " + flowPreview.length + " stages.",
      });
    } catch (err) {
      console.error("Failed to save order flow settings:", err);
      setSaveError(messageFrom(err, "Failed to save order flow settings."));
    } finally {
      setSaving(false);
    }
  };

  const selectedKeys = selectedTargets.map((t) => targetKey(t.card_code, t.category));

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Order Config" }, { label: "Order Flow Settings" }]} />

      <PageHeader
        eyebrow="Order Config"
        title="Order Flow Settings"
        description="Control the approval stages and price conditions used when orders are created."
        actions={
          <Button variant="ghost" onClick={() => void loadConfig(selectedFlowType)}>
            Refresh
          </Button>
        }
      />

      {error && <Notice tone="bad">{error}</Notice>}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Apply to</CardTitle>
          </CardHeader>

          <div className="space-y-3">
            <Field
              label="Scope"
              hint={
                isPartyMode
                  ? "A party override replaces the global flow entirely for those parties."
                  : "The flow every order of this role follows, unless a party overrides it."
              }
            >
              {() => (
                <SegmentedControl<ApplyMode>
                  value={applyMode}
                  onChange={switchMode}
                  options={[
                    { value: "global", label: "All orders (global)" },
                    { value: "parties", label: "Specific parties" },
                  ]}
                />
              )}
            </Field>

            <Field label={isPartyMode ? "Flow role" : "Selected flow"}>
              {() => (
                <SegmentedControl
                  value={selectedFlowType}
                  onChange={handleFlowSelect}
                  options={flowOptions.map((option) => ({
                    value: option.code,
                    label: option.label,
                  }))}
                />
              )}
            </Field>

            {isPartyMode && (
              <>
                <Field label="Parties" hint="Search by name, code or state.">
                  {(control) => (
                    <MultiSelect
                      {...control}
                      value={selectedKeys}
                      onChange={selectTargets}
                      options={partyOptions}
                      searchable
                      searchPlaceholder="Party name, code or state…"
                      placeholder="Select parties"
                      // SAP's party list runs to thousands of rows.
                      maxShown={60}
                      emptyText="No parties loaded"
                      // "Select all" here would apply an override to every
                      // party in SAP. Narrowing first is the point.
                      selectAll={false}
                    />
                  )}
                </Field>

                {selectedTargets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTargets.map((target) => (
                      <span
                        key={targetKey(target.card_code, target.category)}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-strong py-0.5 pl-2.5 pr-1 text-[12px] text-ink"
                      >
                        {target.card_name}
                        {target.category && (
                          <span className="text-[11px] text-subtle">{target.category}</span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5 rounded-full"
                          onClick={() =>
                            selectTargets(
                              selectedKeys.filter(
                                (key) => key !== targetKey(target.card_code, target.category),
                              ),
                            )
                          }
                          aria-label={"Remove " + target.card_name}
                        >
                          <HiOutlineXMark />
                        </Button>
                      </span>
                    ))}
                  </div>
                )}

                <p className="m-0 text-[12px] text-subtle">
                  The <strong className="font-semibold text-body">{selectedFlowLabel}</strong>{" "}
                  stages below replace the global flow for every selected party&rsquo;s{" "}
                  {selectedFlowType === "BILLING" ? "billing-created" : "ASM"} orders.
                </p>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order flow</CardTitle>
          </CardHeader>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : (
            <div className="space-y-2">
              <PermissionToggle
                title="Rate Approval"
                subtitle="Use Rate Approval only for selected price conditions."
                checked={config.rate_approval_enabled}
                onChange={() => toggleStage("rate_approval_enabled")}
              />
              <PermissionToggle
                title="Billing"
                subtitle="Send accepted orders to Billing."
                checked={config.billing_enabled}
                onChange={() => toggleStage("billing_enabled")}
              />
              <PermissionToggle
                title="Auditor"
                subtitle="Send accepted orders to Auditor Approval."
                checked={config.auditor_enabled}
                onChange={() => toggleStage("auditor_enabled")}
              />
            </div>
          )}
        </Card>
      </div>

      <section className="space-y-3">
        <SectionHeading>Rate conditions</SectionHeading>
        <Card>
          {!config.rate_approval_enabled && (
            <p className="m-0 mb-3 text-[12px] text-subtle">
              Rate Approval is off, so none of these apply. Turn it on to choose which price
              conditions send an order for approval.
            </p>
          )}
          <PermissionGrid>
            {conditionOptions.map((condition) => (
              <PermissionToggle
                key={condition.code}
                title={condition.label}
                checked={(config.rate_conditions || []).includes(condition.code)}
                disabled={!config.rate_approval_enabled}
                onChange={() => toggleCondition(condition.code)}
              />
            ))}
          </PermissionGrid>
        </Card>
      </section>

      {/* The preview and the override list answer the same question — what
          does an order actually go through — so they share this slot. */}
      {isPartyMode && partyConfigs.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading>Parties with a custom flow</SectionHeading>
          <Card className="p-0">
            <ul className="m-0 list-none divide-y divide-line p-0">
              {partyConfigs.map((cfg) => (
                <li
                  key={cfg.card_code + "||" + cfg.category + "||" + cfg.flow_type}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-[180px] flex-1">
                    <strong className="block text-[13px] font-semibold text-ink">
                      {lookupPartyName(cfg.card_code, cfg.category) ||
                        cfg.card_name ||
                        cfg.card_code}
                    </strong>
                    <span className="text-[11.5px] text-subtle">
                      {cfg.card_code}
                      {cfg.category ? " · " + cfg.category : ""} ·{" "}
                      {cfg.flow_label || cfg.flow_type}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cfg.rate_approval_enabled && <Badge tone="info">Rate Approval</Badge>}
                    {cfg.billing_enabled && <Badge tone="info">Billing</Badge>}
                    {cfg.auditor_enabled && <Badge tone="info">Auditor</Badge>}
                    {!cfg.rate_approval_enabled &&
                      !cfg.billing_enabled &&
                      !cfg.auditor_enabled && <Badge tone="neutral">No approval stages</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => editConfiguredParty(cfg)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmRemove(cfg)}
                      aria-label={
                        "Remove the custom flow for " + (cfg.card_name || cfg.card_code)
                      }
                    >
                      <HiOutlineTrash />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : (
        <section className="space-y-3">
          <SectionHeading>Flow preview</SectionHeading>
          <Card>
            <div className="mb-3 flex items-start gap-2.5">
              <HiOutlineCog6Tooth className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
              <p className="m-0 text-[12px] text-subtle">
                {isPartyMode
                  ? selectedTargets.length > 0
                    ? "Applies to " +
                      selectedTargets.length +
                      " selected part" +
                      (selectedTargets.length === 1 ? "y" : "ies") +
                      "."
                    : "Select parties to apply this flow."
                  : config.rate_approval_enabled
                    ? "Rate Approval is used only when a selected price condition matches."
                    : "Orders will move without Rate Approval."}
              </p>
            </div>
            <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
              {flowPreview.map((stage, index) => (
                <li key={stage + "-" + index} className="flex items-center gap-1.5">
                  {index > 0 && (
                    <span className="text-subtle" aria-hidden="true">
                      →
                    </span>
                  )}
                  <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink">
                    {stage}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      )}

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving…" : isPartyMode ? "Save party flow" : "Save flow"}
        </Button>
      </div>

      <Dialog
        open={Boolean(confirmRemove)}
        onOpenChange={(next) => {
          if (!next) setConfirmRemove(null);
        }}
      >
        {confirmRemove && (
          <DialogContent title="Remove custom flow" size="sm">
            <DialogHeader>
              <DialogTitle>
                Remove the custom flow for{" "}
                {lookupPartyName(confirmRemove.card_code, confirmRemove.category) ||
                  confirmRemove.card_name ||
                  confirmRemove.card_code}
                ?
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Notice tone="hold">
                Their {confirmRemove.flow_label || confirmRemove.flow_type} orders go back to the
                global flow from the next order onwards. Orders already in progress keep the stages
                they started with.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirmRemove(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => void removeConfiguredParty()}>
                Remove override
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
