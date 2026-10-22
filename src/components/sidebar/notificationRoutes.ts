/**
 * Where a notification from the shared notification framework should land.
 *
 * Orders notifications carry an `order_id` and route by role (see
 * `useNotifications`). Framework notifications carry an `event_type` and the
 * id of the entity they concern instead; this maps the ones the web app has a
 * screen for. Unknown events return null and keep today's behaviour.
 */
export type RoutableNotification = {
  event_type?: string | null;
  entity_id?: number | string | null;
};

const ROUTES: Record<string, string> = {
  CREDIT_LIMIT_AWAITING_APPROVAL: "/Credit_Limit_Approval",
  CREDIT_LIMIT_APPROVED: "/Credit_Limit",
  CREDIT_LIMIT_REJECTED: "/Credit_Limit",
  ADVANCE_PAYMENT_AWAITING_APPROVAL: "/Advance_Payment_Approval",
  ADVANCE_PAYMENT_COMPLETED: "/Advance_Payment_Request",
  ADVANCE_PAYMENT_REJECTED: "/Advance_Payment_Request",
  ADVANCE_PAYMENT_RETURNED: "/Advance_Payment_Request",
  ADVANCE_PAYMENT_ASSIGNED: "/Advance_Payment_Request",
  // Bills taken off a request at Payment or Audit (2026-10-22): the creator's request.
  ADVANCE_PAYMENT_DOCUMENTS_NOT_PAID: "/Advance_Payment_Request",
};

/** `"/Credit_Limit?request=12"`, `"/Credit_Limit_Approval"`, or null. */
export function routeForNotification(data: RoutableNotification | null | undefined) {
  const path = data?.event_type ? ROUTES[data.event_type] : undefined;
  if (!path) return null;
  const id = data?.entity_id;
  return id != null && id !== "" ? `${path}?request=${encodeURIComponent(String(id))}` : path;
}
