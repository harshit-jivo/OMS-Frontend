/**
 * Read-only popup showing ALL data for a device (no history timeline) — the
 * row-click view of the register.
 */
import { HiOutlineClipboardDocumentList, HiOutlinePencilSquare, HiOutlineUserPlus } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailFields } from "@/components/ui/detail";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionHeading } from "@/components/ui/page";
import { configSummary, holderLabel, type Asset } from "../../services/haisService";

import AssetQr from "./AssetQr";
import { MONO, assetStatusTone } from "./assetTone";

type Row = [string, unknown];

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
  if (shown.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <SectionHeading>{title}</SectionHeading>
      <DetailFields items={shown.map(([k, v]) => [k, String(v)])} />
    </section>
  );
}

type Props = {
  asset: Asset;
  onClose: () => void;
  onEdit?: (assetId: string) => void;
  onHandover?: (asset: Asset) => void;
  onHistory?: (asset: Asset) => void;
};

export default function AssetDetails({ asset, onClose, onEdit, onHandover, onHistory }: Props) {
  const status = (asset.working_status as string) || "—";
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent title={`${asset.asset_id} — ${asset.asset_type || "Asset"}`} size="lg">
        <DialogHeader className="items-start">
          <div className="min-w-0">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className={`${MONO} text-[16px]`}>{asset.asset_id}</span>
              <Badge tone={assetStatusTone(asset.working_status as string)} dot>
                {status}
              </Badge>
            </DialogTitle>
            <DialogDescription>{asset.asset_type || "Asset"}</DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-6">
          <div className="flex flex-wrap items-start gap-6">
            <div className="min-w-0 flex-1">
              <Section
                title="Identification"
                rows={[
                  ["Asset ID", asset.asset_id],
                  ["Category", asset.asset_type],
                  ["Company", asset.company],
                  ["Model No.", asset.model_num],
                  ["Serial No.", asset.serial_num],
                  ["Warranty ends", asset.warranty_ends],
                ]}
              />
            </div>
            <AssetQr asset={asset} />
          </div>

          <Section
            title="Configuration"
            rows={[
              ["Processor", asset.processor],
              ["Memory (RAM)", asset.memory],
              ["Operating system", asset.operating_system],
              ["Storage type", asset.storage_type],
              ["Storage", asset.storage],
              ["Summary", configSummary(asset)],
            ]}
          />

          <Section
            title="Assignment & tracking"
            rows={[
              ["Current user", holderLabel(asset)],
              ["Current user ID", asset.current_user_id],
              ["Previous user", asset.prev_user_name || asset.prev_user_id],
              ["Department", asset.department],
              ["Email ID", asset.email_id],
              ["Current location", asset.current_location],
              ["Handover date", asset.handover_date],
            ]}
          />

          <Section
            title="Purchase"
            rows={[
              ["Invoice No.", asset.purchase_invoice_no],
              ["Invoice date", asset.purchase_invoice_date],
              ["Vendor", asset.vendor],
              ["Amount", asset.amount != null && asset.amount !== "" ? `₹ ${asset.amount}` : ""],
            ]}
          />

          <Section
            title="Maintenance"
            rows={[
              ["Date of last service", asset.date_of_last_service],
              ["Working status", asset.working_status],
              ["Remarks", asset.remarks],
            ]}
          />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onHistory?.(asset)}>
            <HiOutlineClipboardDocumentList aria-hidden="true" /> History
          </Button>
          <Button variant="ghost" onClick={() => onEdit?.(asset.asset_id)}>
            <HiOutlinePencilSquare aria-hidden="true" /> Edit / update config
          </Button>
          <Button variant="primary" onClick={() => onHandover?.(asset)}>
            <HiOutlineUserPlus aria-hidden="true" /> Handover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
