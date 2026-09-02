/**
 * The Add Sales page: a title, a loading state, and the choice between two
 * forms.
 *
 * Everything else moved out in plan step 3.4/1 — the state into
 * `useSalesOrderForm`, the two mutually exclusive forms into `OrderWizard` and
 * `LegacyOrderForm`. What is left here is the part that belongs to neither: the
 * heading, the edit-load spinner, and the two dialogs that follow a save.
 */
import { Dialog, DialogContent } from "@/components/ui/dialog";

import LegacyOrderForm from "./salesOrder/LegacyOrderForm";
import OrderWizard from "./salesOrder/OrderWizard";
import { useSalesOrderForm, type AddSalesProps } from "./salesOrder/useSalesOrderForm";
import "../styles/Add_Sales.css";

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

  return (
    <div className="sl-page app-page">
      <div className="bo-page-head">
        <span className="bo-page-accent" aria-hidden="true" />
        <div>
          <h1 className="bo-page-title">
            {" "}
            {isEditMode
              ? isFocOrder
                ? "Edit FOC Order"
                : "Edit Sales Order"
              : isDuplicateMode
                ? isFocOrder
                  ? "Duplicate FOC Order"
                  : "Duplicate Sales Order"
                : isFocMode
                  ? "FOC Order"
                  : "Add Sales Order"}
          </h1>
          <p className="bo-page-subtitle">Add / Edit Sales Orders.</p>
        </div>
      </div>
      {/* <div className="sl-header app-page-head">
          <div>
            <h1 className="sl-title app-page-title">
              {isEditMode
                ? isFocOrder
                  ? "Edit FOC Order"
                  : "Edit Sales Order"
                : isDuplicateMode
                  ? isFocOrder
                    ? "Duplicate FOC Order"
                    : "Duplicate Sales Order"
                  : isFocMode
                    ? "FOC Order"
                    : "Add Sales Order"}
            </h1>
          </div>
        </div> */}

      {isEditMode && isLoadingEditOrder ? (
        <div className="sl-loading-overlay" role="status" aria-live="polite">
          <div className="sl-spinner" aria-hidden="true" />
          <span className="sl-loading-text">Loading order details…</span>
        </div>
      ) : useWizard ? (
        <OrderWizard form={form} />
      ) : (
        <LegacyOrderForm form={form} />
      )}

      <Dialog
        open={Boolean(showSaveConfirm)}
        onOpenChange={(next) => {
          if (!next) setShowSaveConfirm(false);
        }}
      >
        {showSaveConfirm && (
          <DialogContent
            title="Confirm save"
            variant="bare"
            size="auto"
            showClose={false}
            className="sl-modal"
          >
            <div id="sl-save-confirm-title" className="sl-modal-title">
              {isEditMode
                ? "Confirm Update"
                : isDuplicateMode
                  ? "Confirm New Order"
                  : isFocMode
                    ? "Confirm FOC Order"
                    : "Confirm Save"}
            </div>
            <p className="sl-modal-text">
              {isEditMode
                ? "Are you sure you want to update this order?"
                : isDuplicateMode
                  ? "Are you sure you want to create a new order based on this one?"
                  : isFocMode
                    ? "Are you sure you want to create this FOC order?"
                    : "Are you sure you want to save this order?"}
            </p>
            <div className="sl-modal-actions">
              <button
                type="button"
                className="sl-modal-btn sl-modal-btn-secondary"
                onClick={() => setShowSaveConfirm(false)}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sl-modal-btn sl-modal-btn-primary"
                onClick={submitOrder}
                disabled={isSaving}
              >
                {isSaving
                  ? isEditMode
                    ? "Updating..."
                    : "Creating..."
                  : isEditMode
                    ? "Yes, Update"
                    : isFocMode
                      ? "Yes, Create FOC"
                      : "Yes, Create New"}
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(saveSuccess)}
        onOpenChange={(next) => {
          if (!next) setSaveSuccess(null);
        }}
      >
        {saveSuccess && (
          <DialogContent
            title="Saved"
            variant="bare"
            size="auto"
            showClose={false}
            className="sl-modal sl-success-modal"
          >
            <div className="sl-success-mark" aria-hidden="true" />
            <div className="sl-modal-title">{saveSuccess.message}</div>
            <div className="sl-success-details">
              <div className="sl-success-row">
                <span>Order ID</span>
                <strong>{saveSuccess.orderId}</strong>
              </div>
              <div className="sl-success-row">
                <span>Received Next By</span>
                <strong>{saveSuccess.nextStage}</strong>
              </div>
            </div>
            <div className="sl-modal-actions">
              <button type="button" className="sl-modal-btn" onClick={handleSuccessClose}>
                OK
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
