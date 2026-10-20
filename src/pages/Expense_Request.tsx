/**
 * Expenses — the requester's page for Expense requests (user, 2026-10-20):
 * paid straight to expense G/L accounts, moved here from the Payments page.
 * The same page as Payments (`RequestsPage`), showing and raising Expenses only.
 */
import { RequestsPage } from "./Advance_Payment_Request";

export default function Expense_Request() {
  return <RequestsPage section="expenses" />;
}
