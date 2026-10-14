/**
 * The customer PO attached on Add Sales, shown beside an order under review so
 * the desk can compare it with the order's lines.
 *
 * Files come through the permission-checked download endpoint as blobs and
 * are shown inline — an image as an image, a PDF in the browser's viewer —
 * because that endpoint itself always answers as a download.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, Notice } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ordersService, type OrderAttachment } from "@/services/ordersService";

function useObjectUrl(attachment: OrderAttachment | undefined) {
  const file = useQuery({
    queryKey: ["order-attachment-file", attachment?.id],
    queryFn: () => ordersService.fetchOrderAttachmentFile(attachment as OrderAttachment),
    enabled: Boolean(attachment),
    staleTime: Infinity,
  });
  const url = useMemo(() => (file.data ? URL.createObjectURL(file.data) : null), [file.data]);
  // Release the blob when it is replaced or the card unmounts.
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  return { url, isLoading: file.isLoading, isError: file.isError };
}

/** Viewer height on a wide screen: the window less the page chrome, so the
 *  PO fills the column while it stays pinned. Divided by --app-zoom because
 *  the body is zoomed on big monitors and 100vh is not (see index.css). */
const PINNED_HEIGHT = "xl:h-[calc(100vh/var(--app-zoom,1)-2rem)]";

function PoViewer({ orderId, attachments }: { orderId: number; attachments: OrderAttachment[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = attachments.find((a) => a.id === selectedId) ?? attachments[0];
  const preview = useObjectUrl(selected);
  const isPdf = selected?.file_type === "pdf";

  return (
    <Card className={cn("flex flex-col", PINNED_HEIGHT)}>
      <CardHeader>
        <CardTitle>Customer PO</CardTitle>
        <Badge tone="neutral">{attachments.length}</Badge>
        {preview.url && (
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto"
            onClick={() => window.open(preview.url as string, "_blank", "noopener")}
          >
            <HiOutlineArrowTopRightOnSquare aria-hidden="true" /> Open
          </Button>
        )}
      </CardHeader>

      {attachments.length > 1 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5" role="tablist" aria-label="PO files">
          {attachments.map((attachment, index) => (
            <button
              key={attachment.id}
              type="button"
              role="tab"
              aria-selected={attachment.id === selected?.id}
              onClick={() => setSelectedId(attachment.id)}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-1 text-[12px] [font-family:inherit]",
                attachment.id === selected?.id
                  ? "bg-brand-soft font-semibold text-brand"
                  : "bg-transparent text-subtle hover:text-ink",
              )}
            >
              PO {index + 1} · {attachment.file_type.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {preview.isError ? (
        <Notice tone="bad">This PO file could not be loaded.</Notice>
      ) : !preview.url ? (
        <Skeleton className="h-[480px] w-full xl:h-auto xl:flex-1" aria-label="Loading PO" />
      ) : isPdf ? (
        <iframe
          src={preview.url}
          title={`Customer PO for order ${orderId}`}
          className="h-[560px] w-full rounded-sm border border-line xl:h-auto xl:min-h-0 xl:flex-1"
        />
      ) : (
        <div className="min-h-0 overflow-auto xl:flex-1">
          <img
            src={preview.url}
            alt={`Customer PO for order ${orderId}`}
            className="w-full rounded-sm"
          />
        </div>
      )}
    </Card>
  );
}

/**
 * The order's details beside its customer PO, for comparing the two.
 *
 * `children` are the order's detail cards. With a PO attached they take the
 * left column and the PO the right, pinned while the lines scroll; on a
 * narrower screen the PO follows below them. With no PO, `children` render
 * exactly as they would without this wrapper.
 */
export function OrderWithPo({ orderId, children }: { orderId: number; children: ReactNode }) {
  const list = useQuery({
    queryKey: ["order-attachments", orderId],
    queryFn: () => ordersService.getOrderAttachments(orderId),
  });
  const attachments = list.data ?? [];

  if (attachments.length === 0) {
    return <div className="space-y-4 sm:space-y-6">{children}</div>;
  }

  return (
    <div className="grid items-start gap-4 sm:gap-6 xl:grid-cols-2">
      <div className="min-w-0 space-y-4 sm:space-y-6">{children}</div>
      <div className="min-w-0 xl:sticky xl:top-4">
        <PoViewer orderId={orderId} attachments={attachments} />
      </div>
    </div>
  );
}
