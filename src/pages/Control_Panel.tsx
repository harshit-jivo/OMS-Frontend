/**
 * Control Panel — the section's entry point.
 *
 * Production C_Panel has no overview page: its `/` sends each person to the
 * first page they can open. This does the same, through the same rule the
 * sidebar uses (`canOpen` over `SIDEBAR_SECTIONS`), so a bookmark or a Home
 * tile to /Control_Panel always lands somewhere the user may be.
 */
import { Navigate } from "react-router-dom";

import { useAuth } from "@/auth";
import { canOpen } from "@/auth/routeAccess";
import { SIDEBAR_SECTIONS } from "@/components/layout/navigation";
import { EmptyState, Page } from "@/components/ui/page";

export default function Control_Panel() {
  const { session } = useAuth();
  const first = (SIDEBAR_SECTIONS.find((s) => s.label === "Control Panel")?.links ?? []).find(
    (link) => link.to !== "/Control_Panel" && canOpen(session, link.gate ?? link.to),
  );
  if (first) {
    return (
      <>
        <Navigate to={first.to} replace />
        <p role="status" className="sr-only">
          Opening {first.label}…
        </p>
      </>
    );
  }
  return (
    <Page>
      <EmptyState
        title="No Control Panel pages yet"
        hint="Ask an administrator to grant you a Control Panel page on the Permissions page."
      />
    </Page>
  );
}
