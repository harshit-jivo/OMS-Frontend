import { memo, useEffect, useState, type ReactNode } from "react";
import { LuInfo, LuX } from "react-icons/lu";
import type { Order } from "../../services/ordersService";
import "./party-header.css";
import { Badge } from "@/components/ui/badge";
import { toneForStatus } from "@/components/ui/statusTone";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/*
 * Was: turn a status into a CSS class suffix (`vo-badge-pending-approval`).
 * Phase 2.2 replaced that with `toneForStatus`, which normalises the same
 * spellings but returns a COLOUR rather than a class name — so the status is
 * only slugified once, in one file, instead of at every call site.
 *
 * Commented out rather than deleted, per the standing instruction.
 */
/* const statusSlug = (value?: string) =>
     String(value || "").toLowerCase().trim().replace(/\s+/g, "-"); */

type PartyHeaderProps = {
  order: Order;
  /** Extra node rendered next to the status badge (e.g. "rejected by …"). */
  statusExtra?: ReactNode;
};

/**
 * Compact party header for the order-details page: party name + status,
 * state, card code and order number. The "i" button opens a modal with the
 * full party / order metadata (bill-to, ship-to, dates, created by, …).
 */
function PartyHeader({ order, statusExtra }: PartyHeaderProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const details: { label: string; value?: string | null }[] = [
    { label: "Card Code", value: order.card_code },
    { label: "Party State", value: order.party_state },
    { label: "Bill To", value: order.bill_to_address },
    { label: "Ship To", value: order.ship_to_address },
    { label: "Delivery Date", value: order.delivery_date },
    { label: "Created At", value: formatDateTime(order.created_at) },
    { label: "Created By", value: order.created_by_name },
    { label: "PO Number", value: order.po_number },
    { label: "Dispatch From", value: order.dispatch_from_name },
    { label: "Quotation No", value: order.sap_doc_number },
    { label: "Remark", value: order.remarks?.trim() ? order.remarks : "" },
  ].filter((field) => field.value != null && String(field.value).trim() !== "");

  return (
    <div className="ph-card">
      <div className="ph-main">
        <div className="ph-title-row">
          <h2 className="ph-name">{order.card_name}</h2>
          {order.status_display ? (
            <Badge tone={toneForStatus(order.status_display)}>{order.status_display}</Badge>
          ) : null}
          {order.is_foc ? <span className="ph-foc">FOC</span> : null}
          {statusExtra}
        </div>
        {order.party_state ? <span className="ph-sub">{order.party_state}</span> : null}
        {order.card_code ? <span className="ph-sub">{order.card_code}</span> : null}
        <span className="ph-ordnum">{order.order_number}</span>
      </div>

      <button
        type="button"
        className="ph-info"
        onClick={() => setOpen(true)}
        aria-label="View party details"
        aria-haspopup="dialog"
      >
        <LuInfo />
      </button>

      <Dialog
        open={Boolean(open)}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      >
        {open && (
          <DialogContent
            title="Party details"
            variant="bare"
            size="auto"
            showClose={false}
            className="ph-modal"
          >
            <div className="ph-modal-head">
              <div className="ph-modal-heading">
                <h3 className="ph-modal-title">{order.card_name}</h3>
                <div className="ph-modal-meta">
                  <span className="ph-modal-ordnum">{order.order_number}</span>
                  {order.status_display ? (
                    <Badge tone={toneForStatus(order.status_display)}>{order.status_display}</Badge>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="ph-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <LuX />
              </button>
            </div>

            <div className="ph-modal-grid">
              {details.map((field) => (
                <div className="ph-field" key={field.label}>
                  <span className="ph-field-label">{field.label}</span>
                  <span className="ph-field-value">{field.value}</span>
                </div>
              ))}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

export default memo(PartyHeader);
