/**
 * Matching and ranking for every picker's search box.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG
 * ─────────────────────────────────────────────────────────────────────────
 * `ui/dropdown` matched the WHOLE query as one contiguous substring, against
 * one field at a time:
 *
 *     [label, hint, keywords].some((f) => f.toLowerCase().includes(term))
 *
 * So for `JIVO CANOLA OIL 1 LTR · FG0000032 · Edible Oil`:
 *
 *     "canola"        ✓  substring of the label
 *     "canola 1"      ✗  not contiguous — "OIL " sits between them
 *     "1 ltr canola"  ✗  wrong order
 *     "canola fg32"   ✗  spans two fields, and no single field holds both
 *
 * Which is why finding one product meant typing its name in full, in order,
 * exactly as stored. The item modal in `OrderForm` had already solved this
 * for itself (`matchesItemSearch`); everything built on `ui/dropdown` had not.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES INSTEAD
 * ─────────────────────────────────────────────────────────────────────────
 * Every whitespace-separated token must appear SOMEWHERE in the option's
 * fields joined together. Order stops mattering, gaps stop mattering, and a
 * token may come from the name while the next comes from the code.
 *
 * That is strictly more permissive, so it can only ever return more rows than
 * before — which is the second half of the problem. `rankOptions` therefore
 * orders them, because a search that returns the right row 40th is not much
 * better than one that returns nothing.
 */

/** The query, split into the tokens every match must satisfy. */
export const searchTokens = (query: string): string[] =>
  query.trim().toLowerCase().split(/\s+/).filter(Boolean);

/** Everything searchable about a row, as one lower-case string to look in. */
export const haystackOf = (fields: (string | undefined | null)[]): string =>
  fields.filter(Boolean).join(" ").toLowerCase();

/**
 * Does this haystack answer the query?
 *
 * The one definition of "matches" in the app. `rankOptions` uses it to decide
 * which options survive, and the Invoice Review filter bar uses it to decide
 * which rows do — a table that disagreed with the pickers about what a search
 * means would be its own small bug.
 *
 * Empty query matches everything, so a caller can run it unconditionally.
 */
export const matchesTokens = (haystack: string, tokens: string[]): boolean =>
  tokens.every((token) => haystack.includes(token));

/**
 * How well `label` answers the query, lowest first. The haystack carries the
 * secondary fields, so an option matched only by its code still ranks — just
 * below the ones matched by name.
 *
 *   0  the label starts with the whole query      "jivo canola" → JIVO CANOLA…
 *   1  a word in the label starts with a token    "canola"      → JIVO CANOLA…
 *   2  the label contains every token somewhere
 *   3  matched, but only via code / keywords
 *
 * Ties keep their original order, which is usually the caller's own sort.
 */
export function scoreOption(label: string, haystack: string, tokens: string[]): number {
  const name = label.toLowerCase();
  const query = tokens.join(" ");
  if (name.startsWith(query)) return 0;
  // `\b` is no good here: item codes and sizes ("1 LTR", "FG0000032") put word
  // boundaries in places a reader does not think of as word starts.
  if (tokens.every((t) => name.split(/[\s/,()-]+/).some((w) => w.startsWith(t)))) return 1;
  if (tokens.every((t) => name.includes(t))) return 2;
  return haystack.includes(query) ? 2 : 3;
}

/**
 * Filter to the options every token matches, best first.
 *
 * `fieldsOf` returns everything searchable about an option; the first entry is
 * treated as its label for ranking. Returns the input untouched for an empty
 * query, so a closed-over `useMemo` can call this unconditionally.
 */
export function rankOptions<T>(
  options: readonly T[],
  query: string,
  fieldsOf: (option: T) => (string | undefined | null)[],
): T[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return options as T[];

  const scored: { option: T; score: number; at: number }[] = [];
  options.forEach((option, at) => {
    const fields = fieldsOf(option).filter(Boolean) as string[];
    const haystack = haystackOf(fields);
    if (!matchesTokens(haystack, tokens)) return;
    scored.push({ option, score: scoreOption(fields[0] ?? "", haystack, tokens), at });
  });

  // Stable: equal scores keep the order the caller gave them.
  scored.sort((a, b) => a.score - b.score || a.at - b.at);
  return scored.map((entry) => entry.option);
}
