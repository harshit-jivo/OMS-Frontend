/**
 * A card that opens on a click: the route and the log are there when the
 * reader wants them, without pushing the request itself down the page.
 * A native `<details>`, as elsewhere in the app — keyboard and screen readers
 * get the disclosure for free.
 */
import type { ReactNode } from "react";
import { HiChevronRight } from "react-icons/hi2";

import { cn } from "@/lib/utils";

import { Card } from "../../components/ui/page";

export function CollapsibleCard({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-0">
      <details className="group">
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center gap-2 px-4 py-3 md:px-5 [&::-webkit-details-marker]:hidden",
            "rounded-card hover:bg-surface",
          )}
        >
          <HiChevronRight
            className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          <h2 className="m-0 text-[14px] font-semibold text-ink">{title}</h2>
          {summary ? <span className="truncate text-[12.5px] text-subtle">{summary}</span> : null}
        </summary>
        <div className="border-t border-line px-4 pb-4 pt-4 md:px-5 md:pb-5">{children}</div>
      </details>
    </Card>
  );
}
