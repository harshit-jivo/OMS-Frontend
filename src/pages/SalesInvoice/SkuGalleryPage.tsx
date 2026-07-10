import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft, HiInformationCircle, HiPencilSquare, HiPhoto, HiPlus, HiTrash, HiXMark } from "react-icons/hi2";
import { apiDelete, apiFetch, apiUpload, resolveApiUrl } from "./useSalesInvoice";
import "../../styles/Sales_Invoice.css";

type SkuRecord = {
  id: number;
  item_code: string;
  item_name: string;
  item_image?: string | null;
  uploaded_at?: string;
  updated_at?: string;
};

type SkuApiResponse = SkuRecord[] | { data?: SkuRecord[]; results?: SkuRecord[] };

type FinishedGoodItem = {
  ItemCode: string;
  ItemName: string;
  U_Brand?: string | null;
  U_Sub_Group?: string | null;
  U_Variety?: string | null;
  U_SKU?: string | null;
  TotalQty?: number | string | null;
};

type PendingSkuItem = Partial<FinishedGoodItem> & {
  item_code?: string | null;
  item_name?: string | null;
  item_brand?: string | null;
  brand?: string | null;
  Brand?: string | null;
  total_qty?: number | string | null;
};

type PendingSkuApiResponse = PendingSkuItem[] | { data?: PendingSkuItem[]; results?: PendingSkuItem[] };

type SquareCropSettings = {
  zoom: number;
  x: number;
  y: number;
};

const unwrapSkuRecords = (data: SkuApiResponse) => {
  if (Array.isArray(data)) return data;
  return data.data || data.results || [];
};

const unwrapPendingSkuItems = (data: PendingSkuApiResponse) => {
  if (Array.isArray(data)) return data;
  return data.data || data.results || [];
};

const normalizePendingSkuItem = (item: PendingSkuItem): FinishedGoodItem | null => {
  const itemCode = String(item.ItemCode ?? item.item_code ?? "").trim();
  const itemName = String(item.ItemName ?? item.item_name ?? "").trim();
  if (!itemCode || !itemName) return null;

  return {
    ItemCode: itemCode,
    ItemName: itemName,
    U_Brand: item.U_Brand ?? item.item_brand ?? item.brand ?? item.Brand ?? null,
    U_Sub_Group: item.U_Sub_Group ?? null,
    U_Variety: item.U_Variety ?? null,
    U_SKU: item.U_SKU ?? null,
    TotalQty: item.TotalQty ?? item.total_qty ?? null,
  };
};

const skuImageBaseUrl = String(
  import.meta.env.VITE_BASE_URL
    || import.meta.env.VITE_BACKEND_BASE_URL
    || import.meta.env.VITE_API_BASE_URL
    || "",
)
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

const getSkuImageUrl = (imagePath?: string | null) => {
  const path = String(imagePath || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return skuImageBaseUrl ? `${skuImageBaseUrl}${normalizedPath}` : normalizedPath;
};

const SKU_UPLOAD_URL = resolveApiUrl("/api/sku/upload/");
const skuResourcePath = (itemCode: string) => resolveApiUrl(`/api/sku/${encodeURIComponent(itemCode)}/`);

const formatSkuDate = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const cropImageToSquare = async (
  imageFile: File,
  crop: SquareCropSettings = { zoom: 1, x: 0, y: 0 },
): Promise<File> => {
  const imageUrl = URL.createObjectURL(imageFile);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to read selected image."));
      img.src = imageUrl;
    });

    const zoom = clamp(Number(crop.zoom) || 1, 1, 3);
    const offsetX = clamp(Number(crop.x) || 0, -100, 100) / 100;
    const offsetY = clamp(Number(crop.y) || 0, -100, 100) / 100;
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const sourceX = Math.floor((image.naturalWidth - sourceSize) / 2 + ((image.naturalWidth - sourceSize) / 2) * offsetX);
    const sourceY = Math.floor((image.naturalHeight - sourceSize) / 2 + ((image.naturalHeight - sourceSize) / 2) * offsetY);
    const outputSize = Math.round(Math.min(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to crop selected image.");

    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);
    const outputType = imageFile.type === "image/png" || imageFile.type === "image/webp"
      ? imageFile.type
      : "image/jpeg";

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) => {
          if (nextBlob) resolve(nextBlob);
          else reject(new Error("Unable to crop selected image."));
        },
        outputType,
        0.92,
      );
    });

    return new File([blob], imageFile.name, {
      type: blob.type || imageFile.type || "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};

async function uploadSkuImage(itemCode: string, itemName: string, imageFile: File) {
  const formData = new FormData();
  formData.append("item_code", itemCode);
  formData.append("item_name", itemName);
  formData.append("item_image", imageFile);
  return apiUpload<any>(SKU_UPLOAD_URL, formData, "POST");
}

async function updateSkuImage(originalItemCode: string, itemCode: string, itemName: string, imageFile?: File | null) {
  const formData = new FormData();
  formData.append("item_code", itemCode);
  formData.append("item_name", itemName);
  if (imageFile) formData.append("item_image", imageFile);
  return apiUpload<any>(skuResourcePath(originalItemCode), formData, "PATCH");
}

async function deleteSkuImage(itemCode: string) {
  return apiDelete<any>(skuResourcePath(itemCode));
}

export default function SkuGalleryPage() {
  const navigate = useNavigate();
  const [skus, setSkus] = useState<SkuRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingSku, setEditingSku] = useState<SkuRecord | null>(null);
  const [fgItems, setFgItems] = useState<FinishedGoodItem[]>([]);
  const [fgLoading, setFgLoading] = useState(false);
  const [fgError, setFgError] = useState("");
  const [fgQuery, setFgQuery] = useState("");
  const [selectedItemCode, setSelectedItemCode] = useState("");
  const [itemImage, setItemImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropDrag, setCropDrag] = useState<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startCropX: number;
    startCropY: number;
  } | null>(null);
  const [imageCropping, setImageCropping] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailSku, setDetailSku] = useState<SkuRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SkuRecord | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const selectedItem = fgItems.find((item) => item.ItemCode === selectedItemCode);
  const selectedFormItem = selectedItem || (formMode === "edit" && editingSku
    ? { ItemCode: editingSku.item_code, ItemName: editingSku.item_name }
    : null);
  const selectedItemName = selectedFormItem?.ItemName || "";
  const existingEditImageUrl = formMode === "edit" ? getSkuImageUrl(editingSku?.item_image) : "";
  const filteredFgItems = useMemo(() => {
    const normalizedQuery = fgQuery.trim().toLowerCase();
    if (!normalizedQuery) return fgItems;
    return fgItems.filter((item) =>
      [item.ItemCode, item.ItemName, item.U_Brand, item.U_Sub_Group, item.U_Variety, item.U_SKU]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    );
  }, [fgItems, fgQuery]);

  const loadSkus = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<SkuApiResponse>("/api/sku/all/");
      setSkus(unwrapSkuRecords(data));
    } catch (err) {
      console.error(err);
      setError("Unable to load SKU images.");
    } finally {
      setLoading(false);
    }
  };

  const loadFinishedGoods = async () => {
    setFgLoading(true);
    setFgError("");
    try {
      const data = await apiFetch<PendingSkuApiResponse>("/api/sku/pending/");
      setFgItems(
        unwrapPendingSkuItems(data)
          .map(normalizePendingSkuItem)
          .filter((item): item is FinishedGoodItem => Boolean(item))
          .sort((a, b) => a.ItemName.localeCompare(b.ItemName)),
      );
    } catch (err) {
      console.error(err);
      setFgError("Unable to load pending SKU items.");
    } finally {
      setFgLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedItemCode("");
    setItemImage(null);
    setImagePreviewUrl("");
    setCropZoom(1);
    setCropX(0);
    setCropY(0);
    setCropDrag(null);
    setImageCropping(false);
    setEditingSku(null);
    setFormMode("add");
    setFgQuery("");
  };

  const openAddForm = () => {
    resetForm();
    setFormError("");
    setFgError("");
    setSuccess("");
    setFormOpen(true);
  };

  const openEditForm = (sku: SkuRecord) => {
    setFormMode("edit");
    setEditingSku(sku);
    setSelectedItemCode(sku.item_code);
    setItemImage(null);
    setImagePreviewUrl("");
    setCropZoom(1);
    setCropX(0);
    setCropY(0);
    setCropDrag(null);
    setImageCropping(false);
    setFormError("");
    setFgError("");
    setSuccess("");
    setFormOpen(true);
  };

  const closeSkuForm = () => {
    resetForm();
    setFormError("");
    setFormOpen(false);
  };

  useEffect(() => {
    let active = true;

    const loadInitialSkus = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<SkuApiResponse>("/api/sku/all/");
        if (active) setSkus(unwrapSkuRecords(data));
      } catch (err) {
        console.error(err);
        if (active) setError("Unable to load SKU images.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadInitialSkus();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (formOpen) loadFinishedGoods();
  }, [formOpen]);

  useEffect(() => {
    if (!imagePreviewUrl) return undefined;
    return () => {
      URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    setFormError("");

    if (!selectedFile) {
      setItemImage(null);
      setImagePreviewUrl("");
      return;
    }

    setItemImage(selectedFile);
    setImagePreviewUrl(URL.createObjectURL(selectedFile));
    setCropZoom(1);
    setCropX(0);
    setCropY(0);
    setCropDrag(null);
  };

  const startCropDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setCropDrag({
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCropX: cropX,
      startCropY: cropY,
    });
  };

  const moveCropDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropDrag || cropDrag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nextCropX = cropDrag.startCropX - ((event.clientX - cropDrag.startClientX) / Math.max(rect.width, 1)) * 200;
    const nextCropY = cropDrag.startCropY - ((event.clientY - cropDrag.startClientY) / Math.max(rect.height, 1)) * 200;
    setCropX(clamp(nextCropX, -100, 100));
    setCropY(clamp(nextCropY, -100, 100));
  };

  const endCropDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropDrag || cropDrag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setCropDrag(null);
  };

  const openSkuDetails = async (sku: SkuRecord) => {
    setDetailOpen(true);
    setDetailSku(null);
    setDetailError("");
    setDetailLoading(true);

    try {
      const data = await apiFetch<SkuRecord>(skuResourcePath(sku.item_code));
      setDetailSku(data);
    } catch (err) {
      console.error(err);
      setDetailError("Unable to load SKU details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeSkuDetails = () => {
    setDetailOpen(false);
    setDetailSku(null);
    setDetailError("");
  };

  const closeDeleteSku = () => {
    setDeleteError("");
    setDeleteTarget(null);
  };

  const confirmDeleteSku = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");

    try {
      await deleteSkuImage(deleteTarget.item_code);
      setSuccess("SKU image deleted successfully.");
      setDeleteTarget(null);
      await loadSkus();
    } catch (err) {
      console.error(err);
      setDeleteError(err instanceof Error ? err.message : "Unable to delete SKU image.");
    } finally {
      setDeleting(false);
    }
  };

  const saveSku = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setSuccess("");

    if (!selectedItemCode || !selectedItemName) {
      setFormError("Select an item.");
      return;
    }

    if (formMode === "add" && !itemImage) {
      setFormError("Select an item and upload an image.");
      return;
    }

    if (imageCropping) {
      setFormError("Please wait while the image is cropped.");
      return;
    }

    setSaving(true);
    try {
      setImageCropping(Boolean(itemImage));
      const croppedImage = itemImage
        ? await cropImageToSquare(itemImage, { zoom: cropZoom, x: cropX, y: cropY })
        : null;
      setImageCropping(false);
      if (formMode === "edit" && editingSku) {
        await updateSkuImage(editingSku.item_code, selectedItemCode, selectedItemName, croppedImage);
        setSuccess("SKU image updated successfully.");
      } else if (croppedImage) {
        await uploadSkuImage(selectedItemCode, selectedItemName, croppedImage);
        setSuccess("SKU image added successfully.");
      }
      resetForm();
      setFormOpen(false);
      await loadSkus();
    } catch (err) {
      console.error(err);
      setImageCropping(false);
      setFormError(err instanceof Error ? err.message : "Unable to add SKU image.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="si-page si-sku-page">
      <header className="si-page-head">
        <div>
          <span className="si-eyebrow">SKU Images</span>
          <h1>Item Image Gallery</h1>
          <p>{loading ? "Loading SKU cards..." : `${skus.length} SKU ${skus.length === 1 ? "card" : "cards"}`}</p>
        </div>
        <button className="si-header-action-btn" type="button" onClick={() => navigate("/Sales_Invoice")}>
          <HiArrowLeft aria-hidden="true" />
          Back to Invoice
        </button>
      </header>

      <section className="si-card si-sku-page-card">
        {error && <div className="si-inline-error">{error}</div>}
        {success && <div className="si-inline-success">{success}</div>}
        {loading ? (
          <div className="si-loader">Loading SKU images...</div>
        ) : (
          <div className="si-sku-card-grid" aria-label="SKU image cards">
            <button
              className="si-sku-add-card"
              type="button"
              onClick={openAddForm}
            >
              <span>
                <HiPlus aria-hidden="true" />
              </span>
              <strong>Add SKU Image</strong>
              <em>{skus.length === 0 ? "Add the first SKU image" : "Upload another SKU image"}</em>
            </button>
            {skus.map((sku) => {
              const imageUrl = getSkuImageUrl(sku.item_image);
              return (
                <article className="si-sku-card" key={sku.id || sku.item_code}>
                  <div className="si-sku-image-wrap">
                    {imageUrl ? (
                      <img src={imageUrl} alt={sku.item_name || sku.item_code} />
                    ) : (
                      <HiPhoto aria-hidden="true" />
                    )}
                  </div>
                  <div className="si-sku-card-copy">
                    <strong>{sku.item_name || "Unnamed SKU"}</strong>
                    <span>{sku.item_code || "-"}</span>
                    <div className="si-sku-card-actions" aria-label={`${sku.item_code} actions`}>
                      <button
                        className="si-sku-action-btn si-sku-action-danger"
                        type="button"
                        title="Delete SKU"
                        aria-label={`Delete ${sku.item_code}`}
                        onClick={() => {
                          setDeleteError("");
                          setDeleteTarget(sku);
                        }}
                      >
                        <HiTrash aria-hidden="true" />
                      </button>
                      <button
                        className="si-sku-action-btn"
                        type="button"
                        title="SKU details"
                        aria-label={`View details for ${sku.item_code}`}
                        onClick={() => openSkuDetails(sku)}
                      >
                        <HiInformationCircle aria-hidden="true" />
                      </button>
                      <button
                        className="si-sku-action-btn"
                        type="button"
                        title="Edit SKU"
                        aria-label={`Edit ${sku.item_code}`}
                        onClick={() => openEditForm(sku)}
                      >
                        <HiPencilSquare aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {formOpen && (
        <div className="si-modal-backdrop" role="presentation" onClick={closeSkuForm}>
          <section
            className="si-so-modal si-sku-add-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add SKU image"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="si-so-modal-head">
              <div>
                <span className="si-eyebrow">SKU Images</span>
                <h2>{formMode === "edit" ? "Edit SKU Image" : "Add SKU Image"}</h2>
                <p>
                  {formMode === "edit"
                    ? "Update the mapped item or replace the SKU image."
                    : "Upload an image and map it to an item code."}
                </p>
              </div>
              <button
                className="si-modal-icon-btn si-modal-icon-close"
                type="button"
                aria-label="Close"
                title="Close"
                onClick={closeSkuForm}
              >
                <HiXMark aria-hidden="true" />
              </button>
            </header>

            <div className="si-sku-add-body">
              <aside className="si-sku-picker-pane">
                <div className="si-sku-picker-title">
                  <span>Pending SKU Items</span>
                  <strong>{fgLoading ? "Loading..." : `${filteredFgItems.length} items`}</strong>
                </div>
                <input
                  className="si-search-input si-sku-picker-search"
                  value={fgQuery}
                  onChange={(event) => setFgQuery(event.target.value)}
                  placeholder="Search item name, code, brand or SKU"
                />
                {fgError && <div className="si-inline-error si-sku-form-message">{fgError}</div>}
                {fgLoading ? (
                  <div className="si-loader">Loading pending SKU items...</div>
                ) : filteredFgItems.length === 0 ? (
                  <div className="si-empty">No pending SKU items found.</div>
                ) : (
                  <div className="si-sku-picker-list" aria-label="Finished goods">
                    {filteredFgItems.map((item) => (
                      <button
                        className={`si-sku-picker-row${selectedItemCode === item.ItemCode ? " is-active" : ""}`}
                        type="button"
                        key={item.ItemCode}
                        onClick={() => setSelectedItemCode(item.ItemCode)}
                      >
                        <strong>{item.ItemName}</strong>
                        <span>{item.ItemCode}</span>
                      </button>
                    ))}
                  </div>
                )}
              </aside>

              <form className="si-sku-form si-sku-editor-form" onSubmit={saveSku}>
                {formError && <div className="si-inline-error si-sku-form-message">{formError}</div>}
                <div className="si-sku-editor-row">
                  <section className="si-sku-image-editor" aria-label="Image crop editor">
                    <label>
                      <span>{formMode === "edit" ? "Replace Image" : "Item Image"}</span>
                      <input type="file" accept="image/*" onChange={handleImageChange} />
                    </label>

                    {imagePreviewUrl ? (
                      <>
                        <div
                          className={`si-sku-crop-preview${cropDrag ? " is-dragging" : ""}`}
                          role="application"
                          aria-label="SKU image crop preview"
                          onPointerDown={startCropDrag}
                          onPointerMove={moveCropDrag}
                          onPointerUp={endCropDrag}
                          onPointerCancel={endCropDrag}
                        >
                          <img
                            src={imagePreviewUrl}
                            alt="Selected SKU crop preview"
                            style={{
                              objectPosition: `${50 + cropX / 2}% ${50 + cropY / 2}%`,
                              transform: `scale(${cropZoom})`,
                            }}
                          />
                          <span aria-hidden="true" />
                        </div>
                      </>
                    ) : existingEditImageUrl ? (
                      <div className="si-sku-current-image">
                        <img src={existingEditImageUrl} alt={editingSku?.item_name || editingSku?.item_code || "SKU image"} />
                        <span>Current image</span>
                      </div>
                    ) : (
                      <div className="si-sku-upload-placeholder">
                        <HiPhoto aria-hidden="true" />
                        <span>Upload an image to preview and crop it.</span>
                      </div>
                    )}
                  </section>

                  <div className="si-sku-form-side">
                    <div className="si-sku-form-details">
                      <div>
                        <span>Item Name</span>
                        <strong>{selectedItemName || "Select an item from the list"}</strong>
                      </div>
                      <div>
                        <span>Item Code</span>
                        <strong>{selectedItemCode || "-"}</strong>
                      </div>
                      <div>
                        <span>Brand</span>
                        <strong>{selectedItem?.U_Brand || "-"}</strong>
                      </div>
                    </div>
                    {imageCropping && <p className="si-sku-form-note">Applying square crop...</p>}
                    <div className="si-sku-form-actions">
                      <button
                        className="si-btn si-btn-outline"
                        type="button"
                        onClick={closeSkuForm}
                      >
                        Cancel
                      </button>
                      <button className="si-btn si-btn-primary" type="submit" disabled={saving || imageCropping}>
                        {saving
                          ? "Saving..."
                          : imageCropping
                            ? "Cropping..."
                            : formMode === "edit"
                              ? "Update SKU Image"
                              : "Save SKU Image"}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {detailOpen && (
        <div className="si-modal-backdrop" role="presentation" onClick={closeSkuDetails}>
          <section
            className="si-so-modal si-sku-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="SKU details"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="si-so-modal-head">
              <div>
                <span className="si-eyebrow">SKU Details</span>
                <h2>{detailSku?.item_code || "Item Details"}</h2>
                <p>{detailSku?.item_name || "Fresh SKU details from the item image API."}</p>
              </div>
              <button
                className="si-modal-icon-btn si-modal-icon-close"
                type="button"
                aria-label="Close"
                title="Close"
                onClick={closeSkuDetails}
              >
                <HiXMark aria-hidden="true" />
              </button>
            </header>

            {detailLoading ? (
              <div className="si-loader">Loading SKU details...</div>
            ) : detailError ? (
              <div className="si-inline-error si-sku-detail-error">{detailError}</div>
            ) : detailSku ? (
              <div className="si-sku-detail-body">
                <div className="si-sku-detail-image">
                  {getSkuImageUrl(detailSku.item_image) ? (
                    <img src={getSkuImageUrl(detailSku.item_image)} alt={detailSku.item_name || detailSku.item_code} />
                  ) : (
                    <HiPhoto aria-hidden="true" />
                  )}
                </div>
                <div className="si-sku-detail-fields">
                  <div>
                    <span>Item Name</span>
                    <strong>{detailSku.item_name || "-"}</strong>
                  </div>
                  <div>
                    <span>Item Code</span>
                    <strong>{detailSku.item_code || "-"}</strong>
                  </div>
                  <div>
                    <span>SKU ID</span>
                    <strong>{detailSku.id || "-"}</strong>
                  </div>
                  <div>
                    <span>Uploaded At</span>
                    <strong>{formatSkuDate(detailSku.uploaded_at)}</strong>
                  </div>
                  <div>
                    <span>Updated At</span>
                    <strong>{formatSkuDate(detailSku.updated_at)}</strong>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="si-modal-backdrop" role="presentation" onClick={closeDeleteSku}>
          <section
            className="si-so-modal si-sku-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete SKU image"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="si-so-modal-head">
              <div>
                <span className="si-eyebrow">Delete SKU</span>
                <h2>{deleteTarget.item_code}</h2>
                <p>{deleteTarget.item_name}</p>
              </div>
              <button
                className="si-modal-icon-btn si-modal-icon-close"
                type="button"
                aria-label="Close"
                title="Close"
                onClick={closeDeleteSku}
              >
                <HiXMark aria-hidden="true" />
              </button>
            </header>
            <div className="si-sku-delete-body">
              {deleteError && <div className="si-inline-error">{deleteError}</div>}
              <p>Delete this SKU image mapping?</p>
              <div className="si-sku-form-actions">
                <button
                  className="si-btn si-btn-outline"
                  type="button"
                  onClick={closeDeleteSku}
                >
                  Cancel
                </button>
                <button className="si-btn si-btn-danger" type="button" disabled={deleting} onClick={confirmDeleteSku}>
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
