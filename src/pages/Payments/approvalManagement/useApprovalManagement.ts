/**
 * State behind the Payments console's top-level shell.
 *
 * All that is left is the tab selector and the admin gate. The console used to
 * own a `workflows` list as well, shared by the Workflows, Levels and
 * Approvers tabs — those tabs configured the OLD per-module approval engine,
 * whose tables have been removed, and they went with it. Payments approvals
 * are the generic Workflow Engine's now and are configured at /Workflows.
 *
 * The two surviving tabs need nothing from here: Analytics fetches its own
 * figures, and Masters owns collection people and payment-method mappings,
 * which are payments' master data and never belonged to the approval engine.
 */
import { useState } from "react";

import { useIsApprovalAdmin, useToast } from "../useApprovalAdmin";
import type { Tab } from "./types";

export function useApprovalManagement() {
  const [tab, setTab] = useState<Tab>("analytics");
  const { toast, flash } = useToast();
  const isAdmin = useIsApprovalAdmin();

  return { tab, setTab, toast, flash, isAdmin };
}
