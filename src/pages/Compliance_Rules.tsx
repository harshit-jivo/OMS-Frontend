import { useEffect, useMemo, useState } from "react";
import {
  HiCheckCircle,
  HiExclamationCircle,
  HiPlus,
  HiShieldCheck,
  HiTrash,
} from "react-icons/hi2";
import {
  legalService,
  ruleErrorMessage,
  type ComplianceRule,
} from "../services/legalService";
import "../styles/Order_Flow_Settings.css";
import "../styles/Compliance_Rules.css";

/**
 * Compliance Rules — the label checker's rule book, edited by the people who
 * own it.
 *
 * The checks a label is judged against used to be 19 parameters hard-coded in
 * a prompt string on the server, so "FSSAI numbers are now 14 digits" was a
 * code change, a review and a deploy. They are rows now, and this is the
 * screen that edits them. The Label Checker sends every ACTIVE rule, in this
 * order, to the model on each check.
 *
 * Master list on the left, one rule on the right — the same shape as Role
 * Permissions, and for the same reason: you are nearly always comparing the
 * rule you are editing against its neighbours.
 *
 * `rule_text` is the real configuration. It reaches the model verbatim, so
 * wording IS behaviour, and the form says so rather than presenting it as a
 * description field.
 */

/** A new rule's starting point. `sort_order` is set from the list on save. */
const BLANK: Omit<ComplianceRule, "id"> = {
  code: "",
  name: "",
  rule_text: "",
  critical_tokens: [],
  is_critical: false,
  is_active: true,
  sort_order: 100,
};

/** Codes are an identifier, not prose: upper snake case, like FSSAI_LICENCE. */
const normaliseCode = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+/, "").slice(0, 50);

/** Tokens are edited as one comma-separated line — they are rarely more. */
const tokensToText = (tokens: string[]): string => tokens.join(", ");
const textToTokens = (text: string): string[] =>
  text.split(",").map((token) => token.trim()).filter(Boolean);

type Draft = Omit<ComplianceRule, "id">;

const toDraft = (rule: ComplianceRule): Draft => ({
  code: rule.code,
  name: rule.name,
  rule_text: rule.rule_text,
  critical_tokens: [...(rule.critical_tokens ?? [])],
  is_critical: rule.is_critical,
  is_active: rule.is_active,
  sort_order: rule.sort_order,
});

const bySortOrder = (a: ComplianceRule, b: ComplianceRule): number =>
  a.sort_order - b.sort_order || a.code.localeCompare(b.code);

export default function ComplianceRules() {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [saving, setSaving] = useState(false);

  /** The row being edited: an id, or "new" for an unsaved rule. */
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [tokenText, setTokenText] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await legalService.listRules();
        if (!cancelled) setRules([...data].sort(bySortOrder));
      } catch (e) {
        if (!cancelled) {
          setError(
            ruleErrorMessage(
              e,
              "Could not load the compliance rules. If the server has not run " +
                "manage.py migrate legal yet, the rule table does not exist.",
            ),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () =>
      typeof selectedId === "number"
        ? (rules.find((rule) => rule.id === selectedId) ?? null)
        : null,
    [rules, selectedId],
  );
  const isNew = selectedId === "new";
  const activeCount = rules.filter((rule) => rule.is_active).length;

  const dirty = useMemo(() => {
    if (isNew) {
      return Boolean(draft.code.trim() || draft.name.trim() || draft.rule_text.trim());
    }
    if (!selected) return false;
    const current = toDraft(selected);
    return (
      current.name !== draft.name ||
      current.rule_text !== draft.rule_text ||
      current.is_critical !== draft.is_critical ||
      current.is_active !== draft.is_active ||
      current.sort_order !== draft.sort_order ||
      tokensToText(current.critical_tokens) !== tokensToText(draft.critical_tokens)
    );
  }, [isNew, selected, draft]);

  function edit(rule: ComplianceRule) {
    setSelectedId(rule.id);
    setDraft(toDraft(rule));
    setTokenText(tokensToText(rule.critical_tokens ?? []));
    setError("");
    setSavedMsg("");
  }

  function startNew() {
    setSelectedId("new");
    // Land after the last rule, so a new one does not silently jump the queue.
    const last = rules.reduce((max, rule) => Math.max(max, rule.sort_order), 0);
    setDraft({ ...BLANK, sort_order: last + 10 });
    setTokenText("");
    setError("");
    setSavedMsg("");
  }

  function cancel() {
    setSelectedId(null);
    setDraft(BLANK);
    setTokenText("");
    setSavedMsg("");
  }

  const patch = (fields: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...fields }));
    setSavedMsg("");
  };

  async function save() {
    if (saving) return;
    const payload: Draft = {
      ...draft,
      code: normaliseCode(draft.code),
      name: draft.name.trim(),
      rule_text: draft.rule_text.trim(),
      critical_tokens: textToTokens(tokenText),
    };
    if (!payload.name || !payload.rule_text || (isNew && !payload.code)) {
      setError("A rule needs a code, a name and the rule text.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (isNew) {
        const created = await legalService.createRule(payload);
        setRules((prev) => [...prev, created].sort(bySortOrder));
        setSelectedId(created.id);
        setDraft(toDraft(created));
        setSavedMsg(`Created — ${created.name} is now checked on every label.`);
      } else if (selected) {
        // `code` is omitted: the server freezes it, because issued reports
        // cite it as rule_id.
        const { code: _code, ...changes } = payload;
        const updated = await legalService.updateRule(selected.id, changes);
        setRules((prev) =>
          prev.map((rule) => (rule.id === updated.id ? updated : rule)).sort(bySortOrder),
        );
        setDraft(toDraft(updated));
        setSavedMsg("Saved — the next label check uses this wording.");
      }
    } catch (e) {
      setError(ruleErrorMessage(e, "Could not save the rule."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(rule: ComplianceRule) {
    setError("");
    try {
      const updated = await legalService.updateRule(rule.id, {
        is_active: !rule.is_active,
      });
      setRules((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row)).sort(bySortOrder),
      );
      if (selectedId === rule.id) setDraft(toDraft(updated));
    } catch (e) {
      setError(ruleErrorMessage(e, "Could not change the rule."));
    }
  }

  async function remove() {
    if (!selected) return;
    // Deleting is offered, but deactivating is nearly always what is wanted:
    // reports already issued cite the code, and a deleted rule makes them
    // unexplainable. The confirm says that rather than asking "are you sure?".
    const ok = window.confirm(
      `Delete "${selected.name}" permanently?\n\n` +
        `Reports already issued cite ${selected.code} and will no longer be ` +
        `explainable. Turning it off instead stops the check and keeps that history.`,
    );
    if (!ok) return;
    setError("");
    try {
      await legalService.deleteRule(selected.id);
      setRules((prev) => prev.filter((rule) => rule.id !== selected.id));
      cancel();
      setSavedMsg("Rule deleted.");
    } catch (e) {
      setError(ruleErrorMessage(e, "Could not delete the rule."));
    }
  }

  if (loading) {
    return (
      <div className="ofs-page">
        <div className="ofs-loading">
          <span className="ofs-spinner" />
          <span>Loading compliance rules...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ofs-page">
      <div className="ofs-header">
        <div>
          <span className="ofs-kicker">Legal</span>
          <h1>
            <HiShieldCheck aria-hidden="true" /> Compliance Rules
          </h1>
          <p>
            What the Label Checker judges a label against. Every active rule
            below is sent to the AI on each check, in this order — edit the
            wording and the next check follows it.
          </p>
        </div>
        <button type="button" className="ofs-refresh" onClick={startNew}>
          <HiPlus aria-hidden="true" /> New rule
        </button>
      </div>

      {error && (
        <div className="ofs-alert">
          <HiExclamationCircle aria-hidden="true" /> {error}
        </div>
      )}
      {savedMsg && (
        <div className="cr-saved" role="status">
          <HiCheckCircle aria-hidden="true" /> {savedMsg}
        </div>
      )}

      <div className="ofs-grid">
        <section className="ofs-card">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>
              Rules ({activeCount} active of {rules.length})
            </h2>
          </div>

          {rules.length === 0 ? (
            <p className="cr-hint">
              No rules yet. A label check refuses until at least one exists —
              add the first with New rule.
            </p>
          ) : (
            <div className="cr-list">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`cr-row${rule.id === selectedId ? " is-selected" : ""}${
                    rule.is_active ? "" : " is-inactive"
                  }`}
                >
                  <button type="button" className="cr-row-main" onClick={() => edit(rule)}>
                    <span className="cr-row-name">
                      {rule.name}
                      {rule.is_critical && <span className="cr-tag">critical</span>}
                    </span>
                    <span className="cr-row-meta">
                      <code>{rule.code}</code> · position {rule.sort_order}
                      {rule.is_active ? "" : " · inactive"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="cr-toggle"
                    aria-pressed={rule.is_active}
                    aria-label={`${rule.is_active ? "Deactivate" : "Activate"} ${rule.name}`}
                    title={
                      rule.is_active
                        ? "Active — checked on every label. Click to stop checking it."
                        : "Inactive — not checked. Click to start checking it."
                    }
                    onClick={() => void toggleActive(rule)}
                  >
                    {rule.is_active ? "On" : "Off"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ofs-card">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>
              {isNew ? "New rule" : selected ? `Edit — ${selected.name}` : "Select a rule"}
            </h2>
          </div>

          {!selected && !isNew && (
            <p className="cr-hint">
              Pick a rule on the left to edit it, or add one with New rule.
            </p>
          )}

          {(selected || isNew) && (
            <div className="cr-form">
              <label className="cr-field">
                <span className="cr-label">Code</span>
                <input
                  type="text"
                  value={draft.code}
                  disabled={!isNew}
                  maxLength={50}
                  placeholder="FSSAI_LICENCE"
                  onChange={(e) => patch({ code: normaliseCode(e.target.value) })}
                />
                <small>
                  {isNew
                    ? "Permanent. Reports cite it as the rule id, so it cannot be changed later."
                    : "Permanent — reports already issued cite this code."}
                </small>
              </label>

              <label className="cr-field">
                <span className="cr-label">Name</span>
                <input
                  type="text"
                  value={draft.name}
                  maxLength={150}
                  placeholder="FSSAI logo and licence number"
                  onChange={(e) => patch({ name: e.target.value })}
                />
                <small>The heading shown against this rule in the report.</small>
              </label>

              <label className="cr-field">
                <span className="cr-label">Rule</span>
                <textarea
                  rows={6}
                  value={draft.rule_text}
                  placeholder="The FSSAI logo must appear with the licence number beneath it, and the number must be exactly 14 digits."
                  onChange={(e) => patch({ rule_text: e.target.value })}
                />
                <small>
                  Sent to the AI word for word, so the wording is the setting.
                  Say what counts as a failure, and ask for the label wording to
                  be quoted back in the remarks.
                </small>
              </label>

              <div className="cr-two">
                <label className="cr-field">
                  <span className="cr-label">Position</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.sort_order}
                    onChange={(e) => patch({ sort_order: Number(e.target.value) || 0 })}
                  />
                  <small>Lower numbers are checked and listed first.</small>
                </label>

                <label className="cr-field cr-field-check">
                  <span className="cr-label">Active</span>
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    onChange={(e) => patch({ is_active: e.target.checked })}
                  />
                  <small>Inactive rules are not sent to the AI at all.</small>
                </label>
              </div>

              <fieldset className="cr-fieldset">
                <legend>OCR cross-check — optional</legend>
                <p className="cr-hint">
                  Most rules should leave this empty. It is for rules that hinge
                  on exact wording, where the text read off the label can confirm
                  the AI answer.
                </p>

                <label className="cr-field">
                  <span className="cr-label">Required wording</span>
                  <input
                    type="text"
                    value={tokenText}
                    placeholder="Best Before, Use By"
                    onChange={(e) => {
                      setTokenText(e.target.value);
                      patch({ critical_tokens: textToTokens(e.target.value) });
                    }}
                  />
                  <small>
                    Comma-separated. Matching ignores case, punctuation and
                    ordinary OCR misreadings.
                  </small>
                </label>

                <label className="cr-field cr-field-check">
                  <span className="cr-label">Critical</span>
                  <input
                    type="checkbox"
                    checked={draft.is_critical}
                    onChange={(e) => patch({ is_critical: e.target.checked })}
                  />
                  <small>
                    Only critical rules can have a PASS overturned to FAIL when
                    the wording above is missing from the label text. Leave it
                    off unless a wrong PASS is unacceptable — OCR misses small
                    print, and a false failure costs a reviewer more than an
                    unverified pass.
                  </small>
                </label>
              </fieldset>

              <div className="cr-actions">
                <button
                  type="button"
                  className="ofs-save"
                  disabled={saving || !dirty}
                  onClick={() => void save()}
                >
                  {saving ? "Saving..." : isNew ? "Create rule" : "Save changes"}
                </button>
                <button type="button" className="ofs-refresh" onClick={cancel}>
                  {dirty ? "Discard" : "Close"}
                </button>
                {selected && (
                  <button type="button" className="cr-delete" onClick={() => void remove()}>
                    <HiTrash aria-hidden="true" /> Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
