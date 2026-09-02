/**
 * "What does this vendor get, and why?" — the first question anyone asks about
 * an unexpected giveaway. Also dry-runs the engine over a draft line so a scheme
 * can be verified before it goes near a real order.
 *
 * Split out of `Scheme_Manager.tsx` (Phase 4) verbatim — it was already fully
 * self-contained (its own local state, no page-level props beyond the
 * catalogue and the name resolver).
 */
import { useState } from "react";

import { schemeService } from "@/services/schemeService";
import type { ApplicableScheme, SchemeProposal } from "@/services/schemeService";
import { describeBenefit, describeScope, describeTrigger } from "@/services/schemeService";

import { apiErrorText, CATEGORIES } from "../schemeManagerHelpers";
import type { CatalogueItem } from "../types";
import ItemPicker from "./ItemPicker";

export default function VendorCheck({
  products,
  itemNameOf,
}: {
  products: CatalogueItem[];
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
    <>
      <section className="sch-section">
        <div className="sch-grid">
          <div>
            <label className="sch-label">Vendor card code</label>
            <input
              className="sch-input"
              value={cardCode}
              onChange={(e) => setCardCode(e.target.value)}
              placeholder="CUSTA000123"
            />
          </div>
          <div>
            <label className="sch-label">Category</label>
            <select
              className="sch-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="sch-check-actions">
          <button
            type="button"
            className="sch-btn-primary"
            disabled={!cardCode.trim() || isChecking}
            onClick={check}
          >
            {isChecking ? "Checking..." : "What do they get?"}
          </button>
          <button type="button" className="sch-btn" onClick={() => setShowDryRun((p) => !p)}>
            {showDryRun ? "Hide line test" : "Test a line"}
          </button>
        </div>

        {error && (
          <div className="sch-notice error sch-notice--tight">
            <span>{error}</span>
          </div>
        )}

        {applicable && (
          <div className="sch-check-results">
            {applicable.length === 0 ? (
              <div className="sch-hint">No scheme reaches this vendor.</div>
            ) : (
              <>
                <div className="sch-hint sch-hint--mb10">
                  Treated as state <strong>{applicable[0].context.state_code || "—"}</strong>, main
                  group <strong>{applicable[0].context.main_group || "—"}</strong>.
                </div>
                {applicable.map((scheme) => (
                  <div key={scheme.scheme_id} className="sch-result">
                    <div className="sch-result-title">
                      {scheme.name}
                      {scheme.category && <span className="sch-chip green">{scheme.category}</span>}
                      <span className="sch-chip blue">
                        because of {describeScope({
                          scope_type: scheme.granted_by.scope_type,
                          scope_value: scheme.granted_by.scope_value,
                          category: "",
                        })}
                      </span>
                    </div>
                    <div className="sch-result-line">
                      {scheme.triggers.map((t) => describeTrigger(t, itemNameOf)).join(" · ")}
                    </div>
                    <div className="sch-result-line give">
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
        <section className="sch-section">
          <div className="sch-block-title">Test one order line</div>
          <div className="sch-grid">
            <div>
              <label className="sch-label">Product ordered</label>
              <ItemPicker
                value={itemCode}
                products={products}
                onChange={setItemCode}
                placeholder="search the product..."
              />
            </div>
            <div>
              <label className="sch-label">How many</label>
              <input
                type="number"
                min="0"
                className="sch-input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="10"
              />
            </div>
            <div>
              <label className="sch-label">Combo free item</label>
              <ItemPicker
                value={comboFreeItem}
                products={products}
                onChange={setComboFreeItem}
                placeholder="1+1 only..."
                allowClear
                clearLabel="not a combo"
              />
            </div>
            <div>
              <label className="sch-label">Combo free qty</label>
              <input
                type="number"
                min="0"
                className="sch-input"
                value={comboFreeQty}
                onChange={(e) => setComboFreeQty(e.target.value)}
                placeholder="1+1 only"
              />
            </div>
          </div>

          <div className="sch-run-row">
            <button
              type="button"
              className="sch-btn-primary"
              disabled={!cardCode.trim() || !itemCode.trim() || isChecking}
              onClick={runPreview}
            >
              {isChecking ? "Running..." : "Run the test"}
            </button>
            {!cardCode.trim() && (
              <span className="sch-hint sch-hint--ml10">
                Enter a card code above first.
              </span>
            )}
          </div>

          {proposals && (
            <div className="sch-check-results">
              {proposals.length === 0 ? (
                <div className="sch-hint">Nothing fires on this line.</div>
              ) : (
                proposals.map((proposal, index) => (
                  <div key={index} className="sch-result">
                    <div className="sch-result-title">{proposal.scheme_name}</div>
                    <div className="sch-result-line">
                      {proposal.qty_is_user_supplied ? (
                        <>
                          Applies, but has no rule — <strong>the quantity is typed by hand</strong>.
                        </>
                      ) : (
                        <>
                          On {proposal.qualifying_qty} ordered →{" "}
                          <strong>
                            {proposal.qty} {proposal.free_uom.toLowerCase()} of{" "}
                            {itemNameOf(proposal.benefit_item_code)}
                          </strong>{" "}
                          free
                        </>
                      )}
                    </div>
                    <div className="sch-result-meta">
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
    </>
  );
}
