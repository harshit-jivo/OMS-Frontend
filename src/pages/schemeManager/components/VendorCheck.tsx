/**
 * "What does this vendor get, and why?" — the first question anyone asks about
 * an unexpected giveaway. Also dry-runs the engine over a draft line so a scheme
 * can be verified before it goes near a real order.
 *
 * Fully self-contained: its own local state, no page-level props beyond the
 * catalogue and the name resolver.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SearchSelectOption } from "@/components/ui/dropdown";
import { SearchSelect } from "@/components/ui/dropdown";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/page";
import { schemeService } from "@/services/schemeService";
import type { ApplicableScheme, SchemeProposal } from "@/services/schemeService";
import { describeBenefit, describeScope, describeTrigger } from "@/services/schemeService";

import { apiErrorText, CATEGORIES } from "../schemeManagerHelpers";
import { PRODUCT_PICKER_LIMIT } from "./productOptions";

const RESULT = "rounded-sm border border-line bg-surface px-3.5 py-3";
const RESULT_TITLE = "flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink";
const RESULT_LINE = "mt-1 text-[12.5px] text-body";

export default function VendorCheck({
  itemOptions,
  itemNameOf,
}: {
  itemOptions: SearchSelectOption<string>[];
  itemNameOf: (itemCode: string) => string;
}) {
  const [cardCode, setCardCode] = useState("");
  const [category, setCategory] = useState("");
  const [applicable, setApplicable] = useState<ApplicableScheme[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState("");

  // A single draft line, enough to exercise the ratio and the combo path.
  const [itemCode, setItemCode] = useState("");
  const [qty, setQty] = useState("");
  const [comboFreeItem, setComboFreeItem] = useState("");
  const [comboFreeQty, setComboFreeQty] = useState("");
  const [proposals, setProposals] = useState<SchemeProposal[] | null>(null);

  // The dry-run half is a second, optional step — it stays folded away until
  // someone actually wants to test a line.
  const [showDryRun, setShowDryRun] = useState(false);

  const check = async () => {
    if (!cardCode.trim()) return;
    setIsChecking(true);
    setError("");
    setProposals(null);
    try {
      setApplicable(await schemeService.applicable(cardCode.trim(), category));
    } catch (err) {
      console.error("Error checking vendor:", err);
      setError(apiErrorText(err, "Could not check this vendor"));
      setApplicable(null);
    } finally {
      setIsChecking(false);
    }
  };

  const runPreview = async () => {
    if (!cardCode.trim() || !itemCode.trim()) return;
    setIsChecking(true);
    setError("");
    try {
      const lines = [
        { item_code: itemCode.trim(), category, qty: Number(qty) || 0 },
        // The zero-priced companion a 1+1 auto-adds. Present only when filled in,
        // so a plain single-FG check stays a single line.
        ...(comboFreeItem.trim()
          ? [
              {
                item_code: comboFreeItem.trim(),
                category,
                qty: Number(comboFreeQty) || 0,
                is_auto_free: true,
                combo_source_code: itemCode.trim(),
              },
            ]
          : []),
      ];
      const response = await schemeService.preview(cardCode.trim(), category, lines);
      setProposals(response.proposals);
    } catch (err) {
      console.error("Error running preview:", err);
      setError(apiErrorText(err, "Could not run the preview"));
      setProposals(null);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <FormGrid>
          <Field label="Vendor card code">
            {(control) => (
              <Input
                {...control}
                value={cardCode}
                onChange={(e) => setCardCode(e.target.value)}
                placeholder="CUSTA000123"
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Category">
            {(control) => (
              <Select {...control} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FormGrid>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!cardCode.trim() || isChecking} onClick={check}>
            {isChecking ? "Checking…" : "What do they get?"}
          </Button>
          <Button onClick={() => setShowDryRun((p) => !p)}>
            {showDryRun ? "Hide line test" : "Test a line"}
          </Button>
        </div>

        {error && <Notice tone="bad">{error}</Notice>}

        {applicable && (
          <div className="space-y-2">
            {applicable.length === 0 ? (
              <p className="m-0 text-[13px] text-subtle">No scheme reaches this vendor.</p>
            ) : (
              <>
                <p className="m-0 text-[12.5px] text-subtle">
                  Treated as state{" "}
                  <strong className="font-semibold text-ink">
                    {applicable[0].context.state_code || "—"}
                  </strong>
                  , main group{" "}
                  <strong className="font-semibold text-ink">
                    {applicable[0].context.main_group || "—"}
                  </strong>
                  .
                </p>
                {applicable.map((scheme) => (
                  <div key={scheme.scheme_id} className={RESULT}>
                    <div className={RESULT_TITLE}>
                      {scheme.name}
                      {scheme.category && <Badge tone="ok">{scheme.category}</Badge>}
                      <Badge tone="info">
                        because of{" "}
                        {describeScope({
                          scope_type: scheme.granted_by.scope_type,
                          scope_value: scheme.granted_by.scope_value,
                          category: "",
                        })}
                      </Badge>
                    </div>
                    <div className={RESULT_LINE}>
                      {scheme.triggers.map((t) => describeTrigger(t, itemNameOf)).join(" · ")}
                    </div>
                    <div className={`${RESULT_LINE} font-semibold text-ok`}>
                      {scheme.benefits.map((b) => describeBenefit(b, itemNameOf)).join(" · ")}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </section>

      {showDryRun && (
        <section className="space-y-4 border-t border-line pt-5">
          <h4 className="m-0 text-[11px] font-semibold uppercase tracking-wider text-subtle">
            Test one order line
          </h4>
          <FormGrid>
            <Field label="Product ordered">
              {(control) => (
                <SearchSelect
                  id={control.id}
                  value={itemCode}
                  onChange={setItemCode}
                  options={itemOptions}
                  placeholder="search the product…"
                  searchPlaceholder="Product name or code"
                  maxShown={PRODUCT_PICKER_LIMIT}
                />
              )}
            </Field>
            <Field label="How many">
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min="0"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="10"
                />
              )}
            </Field>
            <Field label="Combo free item" hint="1+1 packs only.">
              {(control) => (
                <SearchSelect
                  id={control.id}
                  value={comboFreeItem}
                  onChange={setComboFreeItem}
                  options={itemOptions}
                  placeholder="not a combo"
                  searchPlaceholder="Product name or code"
                  clearLabel="not a combo"
                  maxShown={PRODUCT_PICKER_LIMIT}
                />
              )}
            </Field>
            <Field label="Combo free qty">
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min="0"
                  value={comboFreeQty}
                  onChange={(e) => setComboFreeQty(e.target.value)}
                  placeholder="1+1 only"
                />
              )}
            </Field>
          </FormGrid>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={!cardCode.trim() || !itemCode.trim() || isChecking}
              onClick={runPreview}
            >
              {isChecking ? "Running…" : "Run the test"}
            </Button>
            {!cardCode.trim() && (
              <span className="text-[12.5px] text-subtle">Enter a card code above first.</span>
            )}
          </div>

          {proposals && (
            <div className="space-y-2">
              {proposals.length === 0 ? (
                <p className="m-0 text-[13px] text-subtle">Nothing fires on this line.</p>
              ) : (
                proposals.map((proposal, index) => (
                  <div key={index} className={RESULT}>
                    <div className={RESULT_TITLE}>{proposal.scheme_name}</div>
                    <div className={RESULT_LINE}>
                      {proposal.qty_is_user_supplied ? (
                        <>
                          Applies, but has no rule —{" "}
                          <strong className="font-semibold text-ink">
                            the quantity is typed by hand
                          </strong>
                          .
                        </>
                      ) : (
                        <>
                          On {proposal.qualifying_qty} ordered →{" "}
                          <strong className="font-semibold text-ok">
                            {proposal.qty} {proposal.free_uom.toLowerCase()} of{" "}
                            {itemNameOf(proposal.benefit_item_code)}
                          </strong>{" "}
                          free
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-[12px] text-subtle">
                      because of{" "}
                      {describeScope({
                        scope_type: proposal.scope_type,
                        scope_value: proposal.scope_value,
                        category: "",
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
