import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineInformationCircle,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi2";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
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
import { FilterBar, FilterSearch } from "@/components/ui/filter-bar";
import { Field, Input } from "@/components/ui/form";
import {
  Card,
  EmptyState,
  Notice,
  Page,
  PageHeader,
  SectionHeading,
} from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { API_ORIGIN } from "../../services/api";
import { apiDelete, apiFetch, apiUpload, resolveApiUrl } from "./useSalesInvoice";

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

type PendingSkuApiResponse =
  PendingSkuItem[] | { data?: PendingSkuItem[]; results?: PendingSkuItem[] };

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

const getSkuImageUrl = (imagePath?: string | null) => {
  const path = String(imagePath || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_ORIGIN}${normalizedPath}`;
};

const SKU_UPLOAD_URL = resolveApiUrl("/api/sku/upload/");
const skuResourcePath = (itemCode: string) =>
  resolveApiUrl(`/api/sku/${encodeURIComponent(itemCode)}/`);

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

const cropImageToSquare = async (
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
    const sourceX = Math.floor(
      (image.naturalWidth - sourceSize) / 2 + ((image.naturalWidth - sourceSize) / 2) * offsetX,
    );
    const sourceY = Math.floor(
      (image.naturalHeight - sourceSize) / 2 + ((image.naturalHeight - sourceSize) / 2) * offsetY,
    );
    const outputSize = Math.round(Math.min(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to crop selected image.");

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      outputSize,
      outputSize,
    );
    const outputType =
      imageFile.type === "image/png" || imageFile.type === "image/webp"
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
  return apiUpload<unknown>(SKU_UPLOAD_URL, formData, "POST");
}

async function updateSkuImage(
  originalItemCode: string,
  itemCode: string,
  itemName: string,
  imageFile?: File | null,
) {
  const formData = new FormData();
  formData.append("item_code", itemCode);
  formData.append("item_name", itemName);
  if (imageFile) formData.append("item_image", imageFile);
  return apiUpload<unknown>(skuResourcePath(originalItemCode), formData, "PATCH");
}

async function deleteSkuImage(itemCode: string) {
  return apiDelete<unknown>(skuResourcePath(itemCode));
}

/** Stable empties, so the gallery and picker memos settle. */
const NO_SKUS: SkuRecord[] = [];
const NO_FG_ITEMS: FinishedGoodItem[] = [];

export default function SkuGalleryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: skus = NO_SKUS,
    isPending: loading,
    isError: skusFailed,
  } = useQuery({
    queryKey: ["sku", "all"],
    queryFn: async () => unwrapSkuRecords(await apiFetch<SkuApiResponse>("/api/sku/all/")),
  });
  const error = skusFailed ? "Unable to load SKU images." : "";
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingSku, setEditingSku] = useState<SkuRecord | null>(null);
  /* The pending-SKU list, fetched only while the form is open. `enabled`
     replaces `useEffect(() => { if (formOpen) loadFinishedGoods() }, [formOpen])`.
     `fgLoading` is `enabled && isPending`, NOT `isPending` — a disabled v5 query
     reports pending forever, which would pin the picker on "Loading…". */
  const fgQueryResult = useQuery({
    queryKey: ["sku", "pending"],
    enabled: formOpen,
    queryFn: async () =>
      unwrapPendingSkuItems(await apiFetch<PendingSkuApiResponse>("/api/sku/pending/"))
        .map(normalizePendingSkuItem)
        .filter((item): item is FinishedGoodItem => Boolean(item))
        .sort((a, b) => a.ItemName.localeCompare(b.ItemName)),
  });
  const fgItems = fgQueryResult.data ?? NO_FG_ITEMS;
  const fgLoading = formOpen && fgQueryResult.isPending;
  const fgError = fgQueryResult.isError ? "Unable to load pending SKU items." : "";
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
  const selectedFormItem =
    selectedItem ||
    (formMode === "edit" && editingSku
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

  /** Re-read the gallery. Shared ["sku","all"] key. */
  const loadSkus = () => queryClient.invalidateQueries({ queryKey: ["sku", "all"] });

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
    setSuccess("");
    setFormOpen(true);
  };

  const closeSkuForm = () => {
    resetForm();
    setFormError("");
    setFormOpen(false);
  };


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
    const nextCropX =
      cropDrag.startCropX -
      ((event.clientX - cropDrag.startClientX) / Math.max(rect.width, 1)) * 200;
    const nextCropY =
      cropDrag.startCropY -
      ((event.clientY - cropDrag.startClientY) / Math.max(rect.height, 1)) * 200;
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
        await updateSkuImage(
          editingSku.item_code,
          selectedItemCode,
          selectedItemName,
          croppedImage,
        );
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
    <Page>
      {/* The breadcrumb is the way back, so the header does not need a "Back
          to Invoice" button as well — but it keeps one, because this page is
          reached from a button ON the invoice screen and returning to it is
          the expected end of the task, not navigation. */}
      <Breadcrumbs
        items={[
          { label: "Invoices" },
          { label: "Sales Invoice", onClick: () => navigate("/Sales_Invoice") },
          { label: "SKU Images" },
        ]}
      />

      <PageHeader
        eyebrow="SKU Images"
        title="Item Image Gallery"
        description={
          loading
            ? "Loading SKU cards..."
            : skus.length + " SKU " + (skus.length === 1 ? "card" : "cards")
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate("/Sales_Invoice")}>
              <HiOutlineArrowLeft aria-hidden="true" /> Back to invoice
            </Button>
            <Button variant="primary" onClick={openAddForm}>
              <HiOutlinePlus aria-hidden="true" /> Add SKU image
            </Button>
          </>
        }
      />

      {error && <Notice tone="bad">{error}</Notice>}
      {success && <Notice tone="ok">{success}</Notice>}

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton className="h-[210px] w-full" key={i} />
          ))}
        </div>
      ) : skus.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlinePhoto}
            title="No SKU images yet"
            hint="An image here is what the invoice lines show beside each item."
            action={
              <Button variant="primary" onClick={openAddForm}>
                <HiOutlinePlus aria-hidden="true" /> Add the first image
              </Button>
            }
          />
        </Card>
      ) : (
        <ul
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-0"
          aria-label="SKU image cards"
        >
          {skus.map((sku) => {
            const imageUrl = getSkuImageUrl(sku.item_image);
            return (
              <li
                className="flex flex-col overflow-hidden rounded-card border border-line bg-card"
                key={sku.id || sku.item_code}
              >
                <div className="grid aspect-square place-items-center overflow-hidden bg-surface">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={sku.item_name || sku.item_code}
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  ) : (
                    <HiOutlinePhoto aria-hidden="true" className="text-[28px] text-subtle" />
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <strong className="text-[13px] font-semibold leading-snug text-ink">
                    {sku.item_name || "Unnamed SKU"}
                  </strong>
                  <span className="font-mono text-[11px] text-subtle">
                    {sku.item_code || "-"}
                  </span>

                  <div
                    className="mt-auto flex justify-end gap-0.5 pt-1"
                    aria-label={sku.item_code + " actions"}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      title="SKU details"
                      aria-label={"View details for " + sku.item_code}
                      onClick={() => openSkuDetails(sku)}
                    >
                      <HiOutlineInformationCircle />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit SKU"
                      aria-label={"Edit " + sku.item_code}
                      onClick={() => openEditForm(sku)}
                    >
                      <HiOutlinePencilSquare />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete SKU"
                      aria-label={"Delete " + sku.item_code}
                      onClick={() => {
                        setDeleteError("");
                        setDeleteTarget(sku);
                      }}
                    >
                      <HiOutlineTrash />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* -- Add / edit -- */}
      <Dialog
        open={formOpen}
        onOpenChange={(next) => {
          if (!next) closeSkuForm();
        }}
      >
        {formOpen && (
          <DialogContent title="SKU image" size="xl">
            <DialogHeader className="items-start">
              <div className="min-w-0">
                <DialogTitle>
                  {formMode === "edit" ? "Edit SKU image" : "Add SKU image"}
                </DialogTitle>
                <DialogDescription>
                  {formMode === "edit"
                    ? "Update the mapped item or replace the SKU image."
                    : "Upload an image and map it to an item code."}
                </DialogDescription>
              </div>
            </DialogHeader>

            <form onSubmit={saveSku}>
              <DialogBody className="grid gap-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                {/* -- Which item -- */}
                <aside className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <SectionHeading>Pending SKU items</SectionHeading>
                    <span className="text-[11.5px] text-subtle">
                      {fgLoading ? "..." : filteredFgItems.length + " items"}
                    </span>
                  </div>

                  <FilterBar className="border-0 bg-transparent p-0">
                    <FilterSearch
                      value={fgQuery}
                      onChange={(event) => setFgQuery(event.target.value)}
                      placeholder="Item name, code, brand or SKU..."
                      fieldClassName="min-w-[200px]"
                    />
                  </FilterBar>

                  {fgError && <Notice tone="bad">{fgError}</Notice>}

                  {fgLoading ? (
                    <div className="space-y-1.5">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : filteredFgItems.length === 0 ? (
                    <p className="m-0 rounded-sm border border-line bg-surface px-3 py-4 text-center text-[12px] text-subtle">
                      No pending SKU items found.
                    </p>
                  ) : (
                    <ul className="m-0 max-h-[320px] list-none divide-y divide-line overflow-y-auto rounded-sm border border-line p-0">
                      {filteredFgItems.map((item) => {
                        const active = selectedItemCode === item.ItemCode;
                        return (
                          <li key={item.ItemCode}>
                            <button
                              type="button"
                              className={cn(
                                "flex w-full cursor-pointer appearance-none flex-col gap-0.5 border-0 px-3 py-2 text-left [font-family:inherit] text-[13px] transition-colors",
                                active
                                  ? "bg-brand-soft"
                                  : "bg-transparent hover:bg-surface",
                              )}
                              aria-current={active ? "true" : undefined}
                              onClick={() => setSelectedItemCode(item.ItemCode)}
                            >
                              <strong className="font-semibold text-ink">{item.ItemName}</strong>
                              <span className="font-mono text-[11px] text-subtle">
                                {item.ItemCode}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </aside>

                {/* -- The image, and what it maps to -- */}
                <div className="space-y-3">
                  {formError && <Notice tone="bad">{formError}</Notice>}

                  <Field
                    label={formMode === "edit" ? "Replace image" : "Item image"}
                    hint="Square crop. Drag the preview to reposition."
                  >
                    {(control) => (
                      <Input
                        {...control}
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="h-auto py-1.5 file:mr-2 file:rounded-sm file:border-0 file:bg-surface-strong file:px-2 file:py-1 file:text-[12px]"
                      />
                    )}
                  </Field>

                  {imagePreviewUrl ? (
                    <div
                      className={cn(
                        "relative aspect-square w-full max-w-[260px] overflow-hidden rounded-card border border-line bg-surface",
                        cropDrag ? "cursor-grabbing" : "cursor-grab",
                      )}
                      role="application"
                      aria-label="SKU image crop preview"
                      onPointerDown={startCropDrag}
                      onPointerMove={moveCropDrag}
                      onPointerUp={endCropDrag}
                      onPointerCancel={endCropDrag}
                    >
                      {/* cropX/cropY/cropZoom are continuous pointer-drag state
                          with no fixed set of values — stays inline. */}
                      <img
                        src={imagePreviewUrl}
                        alt="Selected SKU crop preview"
                        className="size-full object-cover"
                        style={{
                          objectPosition: 50 + cropX / 2 + "% " + (50 + cropY / 2) + "%",
                          transform: "scale(" + cropZoom + ")",
                        }}
                      />
                    </div>
                  ) : existingEditImageUrl ? (
                    <div className="w-full max-w-[260px] space-y-1">
                      <div className="aspect-square overflow-hidden rounded-card border border-line bg-surface">
                        <img
                          src={existingEditImageUrl}
                          alt={editingSku?.item_name || editingSku?.item_code || "SKU image"}
                          className="size-full object-contain"
                        />
                      </div>
                      <span className="text-[11.5px] text-subtle">Current image</span>
                    </div>
                  ) : (
                    <div className="grid aspect-square w-full max-w-[260px] place-items-center gap-2 rounded-card border border-dashed border-line bg-surface text-center">
                      <span className="flex flex-col items-center gap-1.5 px-4">
                        <HiOutlinePhoto aria-hidden="true" className="text-[26px] text-subtle" />
                        <span className="text-[12px] text-subtle">
                          Upload an image to preview and crop it.
                        </span>
                      </span>
                    </div>
                  )}

                  <dl className="m-0 space-y-1.5 rounded-sm border border-line bg-surface p-2.5 text-[12.5px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-subtle">Item name</dt>
                      <dd className="m-0 text-right font-semibold text-ink">
                        {selectedItemName || "Select an item from the list"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-subtle">Item code</dt>
                      <dd className="m-0 text-right font-mono text-ink">
                        {selectedItemCode || "-"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-subtle">Brand</dt>
                      <dd className="m-0 text-right text-ink">{selectedItem?.U_Brand || "-"}</dd>
                    </div>
                  </dl>

                  {imageCropping && (
                    <p className="m-0 text-[12px] text-subtle">Applying square crop...</p>
                  )}
                </div>
              </DialogBody>

              <DialogFooter>
                <Button type="button" onClick={closeSkuForm} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={saving || imageCropping}>
                  {saving
                    ? "Saving..."
                    : imageCropping
                      ? "Cropping..."
                      : formMode === "edit"
                        ? "Update SKU image"
                        : "Save SKU image"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      {/* -- Details -- */}
      <Dialog
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeSkuDetails();
        }}
      >
        {detailOpen && (
          <DialogContent title="SKU details" size="md">
            <DialogHeader className="items-start">
              <div className="min-w-0">
                <DialogTitle>{detailSku?.item_code || "Item details"}</DialogTitle>
                <DialogDescription>
                  {detailSku?.item_name || "Fresh SKU details from the item image API."}
                </DialogDescription>
              </div>
            </DialogHeader>

            <DialogBody>
              {detailLoading ? (
                <Skeleton className="h-40 w-full" aria-label="Loading SKU details" />
              ) : detailError ? (
                <Notice tone="bad">{detailError}</Notice>
              ) : detailSku ? (
                <div className="grid gap-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
                  <div className="grid aspect-square place-items-center overflow-hidden rounded-card border border-line bg-surface">
                    {getSkuImageUrl(detailSku.item_image) ? (
                      <img
                        src={getSkuImageUrl(detailSku.item_image)}
                        alt={detailSku.item_name || detailSku.item_code}
                        className="size-full object-contain"
                      />
                    ) : (
                      <HiOutlinePhoto aria-hidden="true" className="text-[28px] text-subtle" />
                    )}
                  </div>

                  <DetailFields
                    items={[
                      ["Item name", detailSku.item_name || "-"],
                      ["Item code", detailSku.item_code || "-"],
                      ["SKU ID", detailSku.id || "-"],
                      ["Uploaded at", formatSkuDate(detailSku.uploaded_at)],
                      ["Updated at", formatSkuDate(detailSku.updated_at)],
                    ]}
                  />
                </div>
              ) : null}
            </DialogBody>

            <DialogFooter>
              <Button variant="primary" onClick={closeSkuDetails}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* -- Delete -- */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next && !deleting) closeDeleteSku();
        }}
      >
        {deleteTarget && (
          <DialogContent title="Delete SKU image" size="sm">
            <DialogHeader>
              <DialogTitle>Delete the image for {deleteTarget.item_code}?</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              {deleteError && <Notice tone="bad">{deleteError}</Notice>}
              <Notice tone="hold">
                {deleteTarget.item_name} loses its picture on every invoice line that shows it.
                The item itself is untouched, and the image can be uploaded again.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={closeDeleteSku} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmDeleteSku} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete image"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
