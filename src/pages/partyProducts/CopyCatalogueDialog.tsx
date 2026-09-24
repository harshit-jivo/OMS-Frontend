/**
 * Give the selected parties the catalogue one party already has.
 *
 * The other bulk verbs read down a column — one product across many parties.
 * This one reads across a row: everything ONE party is assigned, copied onto the
 * others. It is how a new distributor in an existing territory gets set up, and
 * doing it by hand is the whole catalogue re-keyed per party.
 *
 * Which is why it is a dialog rather than another mode of the table above: its
 * input is a party, not a set of ticked products, so it would have had nothing
 * to do with the ticks.
 *
 * Nothing is written until the preview has run. The preview is the SAME server
 * call with `dry_run`, so what it reports and what Copy then does cannot differ
 * — a second, client-side estimate of the counts would be a second implementation
 * to keep in step.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchSelect } from "@/components/ui/dropdown";
import { Checkbox, Field } from "@/components/ui/form";
import { Notice } from "@/components/ui/page";
import { showToast } from "@/lib/toastStore";
import { useSapParties } from "@/lib/sapQueries";
import api from "../../services/api";

import type { PartySelection } from "./BulkRateEditor";

type CopyResult = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  parties: number;
  items: number;
  dry_run?: boolean;
  errors: string[];
};

export default function CopyCatalogueDialog({
  open,
  onOpenChange,
  selections,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  selections: PartySelection[];
}) {
  const queryClient = useQueryClient();
  const { items: parties } = useSapParties();

  const [source, setSource] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<CopyResult | null>(null);
  const [result, setResult] = useState<CopyResult | null>(null);

  /* The targets, so the source cannot also be one of them. The server skips it
     anyway; excluding it here means the count on the button is honest. */
  const targetKeys = useMemo(
    () => new Set(selections.map((selection) => selection.card_code)),
    [selections],
  );

  const sourceOptions = useMemo(
    () =>
      parties
        .filter((party) => !targetKeys.has(party.card_code))
        .map((party) => ({
          value: party.card_code + "||" + (party.category || ""),
          label: party.card_name,
          hint: [party.card_code, party.state, party.category].filter(Boolean).join(" · "),
        })),
    [parties, targetKeys],
  );

  const run = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const [card_code, category] = source.split("||");
      const response = await api.post("/auth/bulk-party/copy-catalogue/", {
        source: { card_code, category: category || null },
        party_selections: selections,
        overwrite_existing: overwrite,
        dry_run: dryRun,
      });
      return (response.data?.data || {}) as CopyResult;
    },
    onSuccess: (data) => {
      if (data.dry_run) {
        setPreview(data);
        return;
      }
      setResult(data);
      setPreview(null);
      void queryClient.invalidateQueries({ queryKey: ["party", "bulk-products"] });
      void queryClient.invalidateQueries({ queryKey: ["party", "products"] });
      showToast({
        title: "Catalogue copied",
        message:
          data.created +
          " assigned, " +
          data.updated +
          " re-priced across " +
          data.parties +
          " parties.",
      });
    },
    onError: (error) => {
      console.error("Error copying catalogue:", error);
      showToast({
        title: "Could not copy the catalogue",
        message: "Nothing was changed. Check your connection and try again.",
      });
    },
  });

  const close = () => {
    if (run.isPending) return;
    setSource("");
    setPreview(null);
    setResult(null);
    onOpenChange(false);
  };

  /* Changing either input invalidates the preview: a count computed for the old
     source must not still be on screen under a Copy button that would use the
     new one. */
  const changeSource = (next: string) => {
    setSource(next);
    setPreview(null);
  };
  const changeOverwrite = (next: boolean) => {
    setOverwrite(next);
    setPreview(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      {open && (
        <DialogContent title="Copy catalogue" size="md">
          <DialogHeader>
            <DialogTitle>
              {result
                ? "Catalogue copied"
                : "Copy a catalogue to " + selections.length + " parties"}
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-3">
            {result ? (
              <>
                <div className="flex flex-wrap gap-4">
                  <span className="text-[13px]">
                    <strong className="block text-[20px] font-bold text-ok">
                      {result.created}
                    </strong>
                    newly assigned
                  </span>
                  <span className="text-[13px]">
                    <strong className="block text-[20px] font-bold text-ink">
                      {result.updated}
                    </strong>
                    re-priced
                  </span>
                  <span className="text-[13px]">
                    <strong className="block text-[20px] font-bold text-ink">
                      {result.unchanged}
                    </strong>
                    already matched
                  </span>
                  <span className="text-[13px]">
                    <strong
                      className={
                        "block text-[20px] font-bold " +
                        (result.errors.length ? "text-bad" : "text-ink")
                      }
                    >
                      {result.errors.length}
                    </strong>
                    failed
                  </span>
                </div>
                {result.errors.length > 0 && (
                  <>
                    <Notice tone="bad">
                      These were not copied. Everything else was.
                    </Notice>
                    <ul className="m-0 max-h-64 list-none space-y-1 overflow-y-auto rounded-sm border border-line bg-surface p-2 text-[12px] text-body">
                      {result.errors.map((message, index) => (
                        <li key={index} className="border-b border-line/60 pb-1 last:border-0">
                          {message}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <>
                <Field label="Copy from" hint="The party whose products and rates are the source.">
                  {(control) => (
                    <SearchSelect
                      {...control}
                      value={source}
                      onChange={changeSource}
                      options={sourceOptions}
                      placeholder="Search a party…"
                      clearLabel="No party chosen"
                    />
                  )}
                </Field>

                <Checkbox
                  label="Also overwrite rates the target parties already have"
                  hint={
                    overwrite
                      ? "Every copied product is set to the source party's rate."
                      : "Products a target already sells keep the rate negotiated with them; only missing products are added."
                  }
                  checked={overwrite}
                  onChange={(event) => changeOverwrite(event.target.checked)}
                />

                {preview ? (
                  <Notice tone={preview.errors.length ? "hold" : "info"} title="What this will do">
                    {preview.created} product{preview.created === 1 ? "" : "s"} newly assigned,{" "}
                    {preview.updated} re-priced, {preview.unchanged} already matching, across{" "}
                    {preview.parties} parties.
                    {preview.errors.length
                      ? " " + preview.errors.length + " row(s) cannot be copied."
                      : ""}
                  </Notice>
                ) : (
                  <Notice tone="info">
                    Nothing is written until you have previewed it.
                  </Notice>
                )}
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button onClick={close} disabled={run.isPending}>
              {result ? "Done" : "Cancel"}
            </Button>
            {!result && (
              <>
                <Button
                  onClick={() => run.mutate(true)}
                  disabled={!source || run.isPending}
                  title={!source ? "Choose a party to copy from first." : undefined}
                >
                  {run.isPending && !preview ? "Checking…" : "Preview"}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => run.mutate(false)}
                  disabled={!source || !preview || run.isPending}
                  title={
                    !source
                      ? "Choose a party to copy from first."
                      : !preview
                        ? "Preview it first."
                        : undefined
                  }
                >
                  {run.isPending && preview ? "Copying…" : "Copy"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
