/**
 * Everything still wrong with the order, in one block.
 *
 * The per-field messages are the primary answer; this exists because the Save
 * button is not on the same screen as most of the fields. On the wizard's
 * review step the header fields are two steps back, and on the legacy form the
 * item table can be a long scroll away — a message the user has to go and find
 * is only half an answer.
 *
 * Renders nothing when the order is fine, so it can sit unconditionally above
 * whatever the save control is.
 *
 * IT IS A BACKSTOP, not the primary answer, and that is worth being honest
 * about: the two item problems already disable the Save button, and every
 * header field with a live native `required` blocks the submit before
 * `validateBeforeSave` runs. What reaches this is the case no click can
 * produce — an order LOADED with a hole in it, which is exactly what the
 * legacy edit path does with `bill_to_id: null`, and which had no check at all
 * before plan step 5.
 */
import { hasProblems, type OrderProblems } from "./orderProblems";

export default function ProblemSummary({ problems }: { problems: OrderProblems }) {
  if (!hasProblems(problems)) return null;

  const messages = [
    ...(problems.items ? [problems.items] : []),
    ...Object.values(problems.rows),
    ...Object.values(problems.header),
  ];

  return (
    <div className="sl-problem-summary" role="alert">
      <div className="sl-problem-summary-title">
        {messages.length === 1 ? "One thing to fix before saving:" : "Fix these before saving:"}
      </div>
      <ul>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
