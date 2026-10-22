/**
 * The payment slot sheet (user, 2026-10-22): the Final desk downloads, as
 * Excel, what SAP has been paid — today's entries or all of them — in the
 * accounts team's layout (`services/slot_sheet.py`). Shown only to a login the
 * server says may have it.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../../components/ui/button";
import { showToast } from "../../lib/toastStore";
import { advancePaymentService } from "../../services/advancePaymentService";

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function SlotSheetButtons() {
  const allowed = useQuery({
    queryKey: ["advance-payments", "slot-sheet", "allowed"],
    queryFn: () => advancePaymentService.slotSheetAllowed(),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const [busy, setBusy] = useState<"today" | "all" | null>(null);
  if (!allowed.data) return null;

  const download = async (scope: "today" | "all") => {
    setBusy(scope);
    try {
      const blob = await advancePaymentService.slotSheet(scope);
      save(blob, `Payment_Slot_${scope === "all" ? "all" : today()}.xlsx`);
    } catch {
      showToast({ title: "Could not download the slot sheet", message: "Try again in a moment.", tone: "bad" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="xs" onClick={() => download("today")} disabled={busy !== null}>
        {busy === "today" ? "Preparing…" : "Today's slot sheet"}
      </Button>
      <Button variant="secondary" size="xs" onClick={() => download("all")} disabled={busy !== null}>
        {busy === "all" ? "Preparing…" : "All entries"}
      </Button>
    </div>
  );
}
