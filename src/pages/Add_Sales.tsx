/**
 * The Add Sales page: a title, a loading state, and the choice between two
 * forms.
 *
 * Everything else moved out in plan step 3.4/1 — the state into
 * `useSalesOrderForm`, the two mutually exclusive forms into `OrderWizard` and
 * `LegacyOrderForm`. What is left here is the part that belongs to neither: the
 * heading, the edit-load spinner, and the two dialogs that follow a save.
 *
 * `FOC.tsx` is `<Add_Sales focMode />` and nothing else, so this file is both
 * order-entry screens.
 *
 * `Add_Sales.css` is gone. Both forms are on the design system now — see the
 * conversion notes at the top of `OrderWizard` and `LegacyOrderForm` for what
 * changed in each and, more importantly, for what deliberately did not.
 */
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { DetailFields } from "@/components/ui/detail";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { HiOutlineCheckCircle } from "react-icons/hi2";

import LegacyOrderForm from "./salesOrder/LegacyOrderForm";
import OrderWizard from "./salesOrder/OrderWizard";
import { useSalesOrderForm, type AddSalesProps } from "./salesOrder/useSalesOrderForm";

export default function Add_Sales({ focMode = false }: AddSalesProps) {
  const form = useSalesOrderForm({ focMode });
  const {
    isEditMode,
    isDuplicateMode,
    isFocMode,
    showSaveConfirm,
    setShowSaveConfirm,
    saveSuccess,
    setSaveSuccess,
    isSaving,
    isLoadingEditOrder,
    isFocOrder,
    useWizard,
    submitOrder,
    handleSuccessClose,
  } = form;

  /** One screen, five titles — edit / duplicate / new, each FOC or not. */
  const title = isEditMode
    ? isFocOrder
      ? "Edit FOC Order"
      : "Edit Sales Order"
    : isDuplicateMode
      ? isFocOrder
        ? "Duplicate FOC Order"
        : "Duplicate Sales Order"
      : isFocMode
        ? "FOC Order"
        : "Add Sales Order";

  const description = isEditMode
    ? "Change the lines and resubmit. The order re-enters approval from the start."
    : isDuplicateMode
      ? "A new order, prefilled from an existing one. Nothing is changed on the original."
      : isFocMode
        ? "A free-of-charge order. It goes through the same approvals as a sale."
        : "Pick a party, add the lines, and send it for approval.";

  return (
    <Page>
      <Breadcrumbs
        items={[{ label: "Orders" }, { label: isFocMode ? "FOC" : "Add Sales" }]}
      />

      <PageHeader title={title} description={description} />

      {isEditMode && isLoadingEditOrder ? (
        <Card className="space-y-3" role="status" aria-live="polite">
          <span className="sr-only">Loading order details</span>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-control w-full" />
          <Skeleton className="h-control w-full" />
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : useWizard ? (
        <OrderWizard form={form} />
      ) : (
        <LegacyOrderForm form={form} />
      )}

      {/* ── Confirm ── */}
      <Dialog
        open={Boolean(showSaveConfirm)}
        onOpenChange={(next) => {
          if (!next && !isSaving) setShowSaveConfirm(false);
        }}
      >
        {showSaveConfirm ? (
          <DialogContent
            title={isEditMode ? "Confirm update" : "Confirm save"}
            size="sm"
            className="max-w-[440px]"
          >
            <DialogBody className="text-center">
              <h3 className="text-[16px] font-bold text-ink">
                {isEditMode
                  ? "Update this order?"
                  : isDuplicateMode
                    ? "Create a new order from this one?"
                    : isFocMode
                      ? "Create this FOC order?"
                      : "Save this order?"}
              </h3>
              <p className="mt-1.5 text-[13px] text-subtle">
                {isEditMode
                  ? "It re-enters approval from the start."
                  : "It will be sent for approval straight away."}
              </p>
            </DialogBody>
            <DialogFooter className="justify-center">
              <Button onClick={() => setShowSaveConfirm(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submitOrder} disabled={isSaving}>
                {isSaving
                  ? isEditMode
                    ? "Updating…"
                    : "Creating…"
                  : isEditMode
                    ? "Yes, update"
                    : isFocMode
                      ? "Yes, create FOC"
                      : "Yes, create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* ── Saved ── */}
      <Dialog
        open={Boolean(saveSuccess)}
        onOpenChange={(next) => {
          if (!next) setSaveSuccess(null);
        }}
      >
        {saveSuccess ? (
          <DialogContent title="Order saved" size="sm" className="max-w-[440px]">
            <DialogHeader className="justify-center">
              <DialogTitle className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex size-7 items-center justify-center rounded-full bg-ok-soft text-ok"
                >
                  <HiOutlineCheckCircle className="size-4" />
                </span>
                {saveSuccess.message}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              {/* Which desk it landed on matters more than the fact it saved:
                  it is the answer to "who do I chase". */}
              <DetailFields
                items={[
                  ["Order ID", saveSuccess.orderId],
                  ["Received next by", saveSuccess.nextStage],
                ]}
              />
            </DialogBody>
            <DialogFooter className="justify-center">
              <Button variant="primary" onClick={handleSuccessClose}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </Page>
  );
}
