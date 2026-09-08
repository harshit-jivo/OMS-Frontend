/**
 * Staff Rate Assignment — which products staff may order, and at what rate.
 *
 * Ticking a product assigns it; the rate field appears once it is ticked.
 * Un-ticking one that WAS assigned removes it on save, which is why the save
 * accepts a removal-only change (see `removedProducts`).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlineCube } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/form";
import { Card, EmptyState, Page, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { showToast } from "@/lib/toastStore";
import { ordersService } from "../services/ordersService";
import { sapService } from "../services/sapService";
import type { Product } from "../services/sapService";

const itemsPerPage = 24;

/** Stable empty, so the filter memo settles. */
const NO_PRODUCTS: Product[] = [];

export default function Staff_Rate_Assignment() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [staffRates, setStaffRates] = useState<Record<string, string>>({});
  const [assignedProductKeys, setAssignedProductKeys] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [rawPage, setRawPage] = useState(1);

  const getProductKey = (product: Product) => product.item_code + "-" + (product.category || "");

  /*
   * The merge is the query; the three EDITABLE vars below are seeded from it.
   *
   * `selectedProducts`, `staffRates` and `assignedProductKeys` are server-seeded
   * and then user-edited, so they cannot be query data. They also must be
   * re-seeded whenever the query returns fresh data — `handleSave` relies on it
   * (it diffs `selectedProducts` against the `assignedProductKeys` snapshot to
   * work out deletions, so a dropped re-seed silently stops removals working).
   */
  const { data: merged, isPending: loading } = useQuery({
    queryKey: ["staff-rates", "merged"],
    queryFn: async () => {
      const [allProductsData, assignedProductsData] = await Promise.all([
        sapService.getProducts(),
        ordersService.getStaffProducts(),
      ]);

      const allProducts = Array.isArray(allProductsData) ? allProductsData : [];
      const assignedProducts = Array.isArray(assignedProductsData) ? assignedProductsData : [];
      const assignedById = new Map(assignedProducts.map((product) => [product.id, product]));
      const assignedByItemAndCategory = new Map(
        assignedProducts.map((product) => [getProductKey(product), product]),
      );
      const mergedProducts = allProducts.map((product) => {
        const assignedProduct =
          assignedById.get(product.id) || assignedByItemAndCategory.get(getProductKey(product));

        return assignedProduct ? { ...product, staff_rate: assignedProduct.staff_rate } : product;
      });
      const productKeys = new Set(mergedProducts.map(getProductKey));
      const missingAssignedProducts = assignedProducts.filter(
        (product) => !productKeys.has(getProductKey(product)),
      );
      const nextProducts: Product[] = [...mergedProducts, ...missingAssignedProducts];
      const nextSelectedProducts = nextProducts.filter((product) => {
        const staffRate = product.staff_rate;

        return staffRate !== undefined && staffRate !== null && staffRate !== "";
      });
      const nextStaffRates = nextSelectedProducts.reduce<Record<string, string>>(
        (rates, product) => ({
          ...rates,
          [getProductKey(product)]: String(product.staff_rate ?? ""),
        }),
        {},
      );

      return {
        products: nextProducts,
        selected: nextSelectedProducts,
        keys: nextSelectedProducts.map(getProductKey),
        rates: nextStaffRates,
      };
    },
  });

  const products = merged?.products ?? NO_PRODUCTS;

  /*
   * Re-seed when the query hands back a NEW result object. Setting state during
   * render is React's supported "adjust state when the input changes" pattern —
   * an effect here would be a `react-hooks/set-state-in-effect` violation, and
   * would also re-seed a render late, discarding a keystroke.
   */
  const [seededFrom, setSeededFrom] = useState<typeof merged>(undefined);
  if (merged && merged !== seededFrom) {
    setSeededFrom(merged);
    setSelectedProducts(merged.selected);
    setAssignedProductKeys(merged.keys);
    setStaffRates(merged.rates);
  }

  const fetchProducts = () => queryClient.invalidateQueries({ queryKey: ["staff-rates"] });

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;

    return products.filter((product) =>
      [product.item_name, product.item_code, product.category, product.brand, product.variety].some(
        (value) =>
          String(value || "")
            .toLowerCase()
            .includes(term),
      ),
    );
  }, [products, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));

  /* Both of these were effects: `setCurrentPage(1)` on `[search]`, and a clamp
     against `totalPages` derived from fetched data. Deriving the page during
     render does the same job with no setState in an effect at all. */
  const currentPage = Math.min(rawPage, totalPages);

  const paginatedProducts = useMemo(
    () => filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [currentPage, filteredProducts],
  );
  const pageStart = filteredProducts.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const pageEnd = Math.min(currentPage * itemsPerPage, filteredProducts.length);

  const toggleProduct = (product: Product) => {
    const productKey = getProductKey(product);
    const isSelected = selectedProducts.some((item) => getProductKey(item) === productKey);

    setSelectedProducts((current) =>
      isSelected
        ? current.filter((item) => getProductKey(item) !== productKey)
        : [...current, product],
    );
  };

  /**
   * Products that WERE assigned and are no longer ticked.
   *
   * Lifted out of `handleSave` because the Save button needs it too: the
   * button was disabled on `selectedProducts.length === 0`, while `handleSave`
   * has always supported a removal-only save and only refuses when BOTH lists
   * are empty. Un-ticking every product produced exactly that state — an
   * enabled-looking intent with a disabled button — so un-assigning a staff
   * member's last product was impossible from this screen.
   */
  const removedProducts = useMemo(() => {
    const selectedProductKeys = new Set(selectedProducts.map(getProductKey));
    return products
      .filter((product) => assignedProductKeys.includes(getProductKey(product)))
      .filter((product) => !selectedProductKeys.has(getProductKey(product)))
      .map((product) => ({
        product_id: product.id,
        item_code: product.item_code,
        category: product.category || "",
      }));
  }, [products, selectedProducts, assignedProductKeys]);

  /*
   * The first product missing a usable rate, and the reason Save is disabled.
   *
   * Both were `alert()` calls fired after the press — one for "select
   * something", one naming the first product with a bad rate. The button says
   * it instead, so a rate that is blank or negative is visible BEFORE
   * committing rather than after (DESIGN_SYSTEM §6).
   */
  const missingRate = useMemo(
    () =>
      selectedProducts.find((product) => {
        const rate = staffRates[getProductKey(product)];
        return rate === undefined || rate === "" || Number(rate) < 0;
      }),
    [selectedProducts, staffRates],
  );
  const nothingToSave = selectedProducts.length === 0 && removedProducts.length === 0;
  const blockedBecause = nothingToSave
    ? "Tick a product, or untick one that is currently assigned."
    : missingRate
      ? "Enter a rate of zero or more for " + missingRate.item_name + "."
      : undefined;

  const handleSave = async () => {
    if (blockedBecause || isSaving) return;

    const payload = selectedProducts.map((product) => ({
      product_id: product.id,
      item_code: product.item_code,
      category: product.category || "",
      rate: Number(staffRates[getProductKey(product)]),
    }));

    try {
      setIsSaving(true);
      await ordersService.saveStaffProductRates(payload, removedProducts);
      await fetchProducts();
      showToast({
        title: "Staff rates saved",
        message:
          payload.length +
          " product" +
          (payload.length === 1 ? "" : "s") +
          " assigned" +
          (removedProducts.length
            ? ", " + removedProducts.length + " removed"
            : "") +
          ".",
      });
    } catch (error) {
      console.error("Error saving staff product rates:", error);
      showToast({
        title: "Could not save the staff rates",
        message: "Nothing was changed. Check your connection and try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Orders" }, { label: "Staff Rate Assignment" }]} />

      <PageHeader
        eyebrow="Orders"
        title="Staff Rate Assignment"
        description="Which products staff may order, and the rate each is sold to them at."
        badges={
          selectedProducts.length > 0 ? (
            <Badge tone="info">{selectedProducts.length} assigned</Badge>
          ) : undefined
        }
        actions={
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            disabled={isSaving || Boolean(blockedBecause)}
            title={blockedBecause}
          >
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setRawPage(1);
          }}
          placeholder="Product name, code, category, brand or variety…"
          fieldClassName="min-w-[300px]"
        />
        <FilterCount>
          {filteredProducts.length > 0
            ? "Showing " + pageStart + "–" + pageEnd + " of " + filteredProducts.length
            : "No products"}
          {removedProducts.length > 0 ? " · " + removedProducts.length + " to remove" : ""}
        </FilterCount>
      </FilterBar>

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton className="h-20 w-full" key={i} />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineCube}
            title={search ? "No products match this search" : "No products loaded"}
            hint={search ? "Try the item code on its own." : undefined}
          />
        </Card>
      ) : (
        <>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5 p-0">
            {paginatedProducts.map((product) => {
              const productKey = getProductKey(product);
              const isSelected = selectedProducts.some(
                (item) => getProductKey(item) === productKey,
              );
              const rate = staffRates[productKey] ?? "";
              const rateBad = isSelected && (rate === "" || Number(rate) < 0);

              return (
                <li key={productKey}>
                  {/*
                    A label wrapping a real checkbox, not a div with an
                    `onClick` and a `readOnly` checkbox painted on it. That is
                    what makes the whole card clickable AND keyboard-operable,
                    which the div never was.
                  */}
                  <label
                    className={
                      "flex cursor-pointer items-start gap-2.5 rounded-sm border p-3 text-[13px] transition-colors " +
                      (isSelected
                        ? "border-brand-line bg-brand-soft"
                        : "border-line bg-card hover:border-line-strong hover:bg-surface")
                    }
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-3.5 shrink-0 accent-brand"
                      checked={isSelected}
                      onChange={() => toggleProduct(product)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-semibold text-ink">{product.item_name}</span>
                      <span className="text-[11.5px] text-subtle">
                        {product.item_code} · {product.category || "—"}
                      </span>

                      {isSelected && (
                        // Typing a rate must not toggle the checkbox the
                        // surrounding label is for.
                        <span
                          className="mt-1.5 flex items-center gap-2"
                          onClick={(event) => event.preventDefault()}
                        >
                          <span className="shrink-0 text-[11.5px] text-subtle">Rate ₹</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            aria-label={"Staff rate for " + product.item_name}
                            aria-invalid={rateBad || undefined}
                            value={rate}
                            onChange={(event) =>
                              setStaffRates((current) => ({
                                ...current,
                                [productKey]: event.target.value,
                              }))
                            }
                            className={
                              "h-control-sm w-28 text-right tabular-nums " +
                              (rateBad ? "border-bad" : "")
                            }
                          />
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setRawPage}
              summary={"Showing " + pageStart + "–" + pageEnd + " of " + filteredProducts.length}
            />
          )}
        </>
      )}
    </Page>
  );
}
