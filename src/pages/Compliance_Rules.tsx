import { useEffect, useMemo, useState } from "react";
import {
  HiOutlineExclamationCircle,
  HiOutlinePlus,
  HiOutlineShieldCheck,
  HiOutlineTrash,
} from "react-icons/hi2";
import {
  legalService,
  ruleErrorMessage,
  type ComplianceRule,
} from "../services/legalService";
import { showToast } from "@/lib/toastStore";
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
import {
  Checkbox,
  Field,
  FieldGroup,
  FormActions,
  FormGrid,
  Input,
  Textarea,
} from "@/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Stat,
  StatRow,
} from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  const [saving, setSaving] = useState(false);

  /** The row being edited: an id, or "new" for an unsaved rule. */
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  // Deleting is offered, but deactivating is nearly always what is wanted:
  // reports already issued cite the code, and a deleted rule makes them
  // unexplainable. The dialog says that rather than asking "are you sure?".
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  }

  function startNew() {
    setSelectedId("new");
    // Land after the last rule, so a new one does not silently jump the queue.
    const last = rules.reduce((max, rule) => Math.max(max, rule.sort_order), 0);
    setDraft({ ...BLANK, sort_order: last + 10 });
    setTokenText("");
    setError("");
  }

  function cancel() {
    setSelectedId(null);
    setDraft(BLANK);
    setTokenText("");
  }

  const patch = (fields: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...fields }));
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
          showToast({
          title: "Rule created",
          message: `${created.name} is now checked on every label.`,
        });
      } else if (selected) {
        // `code` is omitted: the server freezes it, because issued reports
        // cite it as rule_id.
        const { code: _code, ...changes } = payload;
        const updated = await legalService.updateRule(selected.id, changes);
        setRules((prev) =>
          prev.map((rule) => (rule.id === updated.id ? updated : rule)).sort(bySortOrder),
        );
        setDraft(toDraft(updated));
        showToast({
          title: "Rule saved",
          message: "The next label check uses this wording.",
        });
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
    setConfirmDelete(false);
    setError("");
    try {
      await legalService.deleteRule(selected.id);
      setRules((prev) => prev.filter((rule) => rule.id !== selected.id));
      cancel();
      showToast({ title: "Rule deleted", message: `${selected.name} is no longer checked.` });
    } catch (e) {
      setError(ruleErrorMessage(e, "Could not delete the rule."));
    }
  }

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Legal" }, { label: "Compliance Rules" }]} />

      <PageHeader
        title="Compliance Rules"
        description="What the Label Checker judges a label against. Every active rule is sent to the AI on each check, in this order — edit the wording and the next check follows it."
        actions={
          <Button variant="primary" onClick={startNew}>
            <HiOutlinePlus aria-hidden="true" /> New rule
          </Button>
        }
      />

      <StatRow>
        <Stat
          icon={HiOutlineShieldCheck}
          tone="brand"
          label="Active rules"
          value={activeCount}
          hint="checked on every label"
          loading={loading}
        />
        <Stat
          icon={HiOutlineExclamationCircle}
          tone="neutral"
          label="Total rules"
          value={rules.length}
          hint={`${rules.length - activeCount} switched off`}
          loading={loading}
        />
      </StatRow>

      {error ? (
        <Notice tone="bad" title="Something went wrong">
          {error}
        </Notice>
      ) : null}

      {/* Master on the left, one rule on the right — the same shape as Role
          Permissions, and for the same reason: you are nearly always comparing
          the rule you are editing against its neighbours. Below `lg` they
          stack, list first. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr] lg:items-start">
        {/* The list SCROLLS; the page does not grow with it.
            Twenty-one rules made this card twice the height of the editor
            beside it, so the page scrolled past the form you were filling in
            to show rows you were not looking at. Capped to the viewport and
            stuck under the navbar, so the list and the editor stay side by
            side however many rules there are.

            `min-h-0` on the scroller is load-bearing: a flex child defaults to
            `min-height: auto`, which means "as tall as my content" — so
            without it the `overflow-y-auto` never engages and the card grows
            exactly as before. */}
        <Card className="flex flex-col p-0 lg:sticky lg:top-[74px] lg:max-h-[calc(100svh-104px)]">
          <CardHeader className="shrink-0 px-4 pt-4">
            <CardTitle>Rules</CardTitle>
            <Badge tone="neutral">{rules.length}</Badge>
          </CardHeader>

          {loading ? (
            <div className="space-y-2 p-4" role="status" aria-live="polite">
              <span className="sr-only">Loading compliance rules</span>
              {[0, 1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-12 w-full" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <EmptyState
              icon={HiOutlineShieldCheck}
              title="No rules yet"
              hint="A label check refuses until at least one exists."
              action={
                <Button variant="primary" onClick={startNew}>
                  <HiOutlinePlus aria-hidden="true" /> Add the first rule
                </Button>
              }
            />
          ) : (
            <ul className="m-0 min-h-0 flex-1 list-none divide-y divide-line overflow-y-auto border-t border-line p-0">
              {rules.map((rule) => {
                const isSelected = rule.id === selectedId;
                return (
                  <li
                    key={rule.id}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 transition-colors",
                      isSelected && "bg-brand-soft/50",
                      !rule.is_active && "opacity-60",
                    )}
                  >
                    {/* The whole row opens the rule. `h-auto` and a column
                        layout, because `ui/button` is a control by default and
                        this one is a list row that happens to be pressable. */}
                    <Button
                      variant="ghost"
                      onClick={() => edit(rule)}
                      aria-current={isSelected ? "true" : undefined}
                      className="h-auto min-w-0 flex-1 flex-col items-start gap-0.5 px-2 py-1.5 text-left"
                    >
                      <span className="flex w-full min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-ink">
                          {rule.name}
                        </span>
                        {rule.is_critical ? <Badge tone="hold">critical</Badge> : null}
                      </span>
                      <span className="truncate text-[11.5px] font-normal text-subtle">
                        <code className="font-mono">{rule.code}</code> · position{" "}
                        {rule.sort_order}
                      </span>
                    </Button>

                    {/* On/Off is the action people take most, so it stays on
                        the row rather than living only in the form. */}
                    <Button
                      size="sm"
                      variant={rule.is_active ? "success" : "secondary"}
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
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {isNew ? "New rule" : selected ? `Edit — ${selected.name}` : "Select a rule"}
            </CardTitle>
          </CardHeader>

          {!selected && !isNew ? (
            <EmptyState
              icon={HiOutlineShieldCheck}
              title="Nothing selected"
              hint="Pick a rule on the left to edit it, or add one with New rule."
            />
          ) : (
            <div className="space-y-4">
              <FormGrid>
                <Field
                  label="Code"
                  required={isNew}
                  hint={
                    isNew
                      ? "Permanent. Reports cite it as the rule id, so it cannot be changed later."
                      : "Permanent — reports already issued cite this code."
                  }
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={draft.code}
                      disabled={!isNew}
                      maxLength={50}
                      placeholder="FSSAI_LICENCE"
                      onChange={(e) => patch({ code: normaliseCode(e.target.value) })}
                    />
                  )}
                </Field>

                <Field
                  label="Name"
                  required
                  hint="The heading shown against this rule in the report."
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={draft.name}
                      maxLength={150}
                      placeholder="FSSAI logo and licence number"
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  )}
                </Field>
              </FormGrid>

              {/* `rule_text` is the real configuration: it reaches the model
                  verbatim, so the wording IS the behaviour. Full width, and the
                  hint says so rather than calling it a description. */}
              <Field
                label="Rule"
                required
                hint="Sent to the AI word for word, so the wording is the setting. Say what counts as a failure, and ask for the label wording to be quoted back in the remarks."
              >
                {(control) => (
                  <Textarea
                    {...control}
                    rows={6}
                    value={draft.rule_text}
                    placeholder="The FSSAI logo must appear with the licence number beneath it, and the number must be exactly 14 digits."
                    onChange={(e) => patch({ rule_text: e.target.value })}
                  />
                )}
              </Field>

              <FormGrid>
                <Field label="Position" hint="Lower numbers are checked and listed first.">
                  {(control) => (
                    <Input
                      {...control}
                      type="number"
                      min={0}
                      value={draft.sort_order}
                      onChange={(e) => patch({ sort_order: Number(e.target.value) || 0 })}
                    />
                  )}
                </Field>

                <div className="flex items-end pb-2">
                  <Checkbox
                    label="Active"
                    hint="Inactive rules are not sent to the AI at all."
                    checked={draft.is_active}
                    onChange={(e) => patch({ is_active: e.target.checked })}
                  />
                </div>
              </FormGrid>

              <FieldGroup
                legend="OCR cross-check — optional"
                hint="Most rules should leave this empty. It is for rules that hinge on exact wording, where the text read off the label can confirm the AI answer."
              >
                <div className="space-y-4">
                  <Field
                    label="Required wording"
                    hint="Comma-separated. Matching ignores case, punctuation and ordinary OCR misreadings."
                  >
                    {(control) => (
                      <Input
                        {...control}
                        value={tokenText}
                        placeholder="Best Before, Use By"
                        onChange={(e) => {
                          setTokenText(e.target.value);
                          patch({ critical_tokens: textToTokens(e.target.value) });
                        }}
                      />
                    )}
                  </Field>

                  <Checkbox
                    label="Critical"
                    hint="Only critical rules can have a PASS overturned to FAIL when the wording above is missing from the label text. Leave it off unless a wrong PASS is unacceptable — OCR misses small print, and a false failure costs a reviewer more than an unverified pass."
                    checked={draft.is_critical}
                    onChange={(e) => patch({ is_critical: e.target.checked })}
                  />
                </div>
              </FieldGroup>

              <FormActions>
                {/* Delete sits apart from the pair on the right: it is not the
                    other half of "save or cancel", and a destructive action
                    beside a confirming one is a mis-click waiting to happen. */}
                {selected ? (
                  <Button
                    variant="danger"
                    className="mr-auto"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <HiOutlineTrash aria-hidden="true" /> Delete
                  </Button>
                ) : null}
                <Button onClick={cancel}>{dirty ? "Discard" : "Close"}</Button>
                <Button
                  variant="primary"
                  disabled={saving || !dirty}
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : isNew ? "Create rule" : "Save changes"}
                </Button>
              </FormActions>
            </div>
          )}
        </Card>
      </div>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        {selected ? (
          <DialogContent title="Delete rule" size="sm">
            <DialogHeader>
              <DialogTitle>Delete {selected.name} permanently?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Notice tone="hold">
                Reports already issued cite{" "}
                <strong className="font-semibold">{selected.code}</strong> and will no longer be
                explainable. Turning the rule off instead stops the check and keeps that history.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => void remove()}>
                Delete rule
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </Page>
  );
}
