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
};

/** `"/Credit_Limit?request=12"`, `"/Credit_Limit_Approval"`, or null. */
export function routeForNotification(data: RoutableNotification | null | undefined) {
  const path = data?.event_type ? ROUTES[data.event_type] : undefined;
  if (!path) return null;
  const id = data?.entity_id;
  return id != null && id !== "" ? `${path}?request=${encodeURIComponent(String(id))}` : path;
}
