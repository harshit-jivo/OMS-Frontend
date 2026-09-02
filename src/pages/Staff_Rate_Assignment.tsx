import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ordersService } from "../services/ordersService";
import { sapService } from "../services/sapService";
import type { Product } from "../services/sapService";
import "../styles/Staff_Rate_Assignment.css";

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

  const getProductKey = (product: Product) => `${product.item_code}-${product.category || ""}`;

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
  const setCurrentPage = (next: number | ((page: number) => number)) =>
    setRawPage((page) => (typeof next === "function" ? next(Math.min(page, totalPages)) : next));

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

  const handleSave = async () => {
    // `removedProducts` is derived above now, so this local copy is gone —
    // kept commented rather than deleted, per the repo's standing rule:
    //
    // const selectedProductKeys = new Set(selectedProducts.map(getProductKey));
    // const removedProducts = products
    //   .filter((product) => assignedProductKeys.includes(getProductKey(product)))
    //   .filter((product) => !selectedProductKeys.has(getProductKey(product)))
    //   .map((product) => ({
    //     product_id: product.id,
    //     item_code: product.item_code,
    //     category: product.category || "",
    //   }));

    if (!selectedProducts.length && !removedProducts.length) {
      alert("Please select at least one product or remove an assigned product.");
      return;
    }

    const missingRate = selectedProducts.find((product) => {
      const rate = staffRates[getProductKey(product)];
      return rate === undefined || rate === "" || Number(rate) < 0;
    });

    if (missingRate) {
      alert(`Please enter a valid staff rate for ${missingRate.item_name}.`);
      return;
    }

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
      alert("Staff product rates saved successfully.");
    } catch (error) {
      console.error("Error saving staff product rates:", error);
      alert("Failed to save staff product rates.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="app-page">
      <div className="sra-card">
        <div className="sra-head">
          <h1 className="sra-title">Staff Rate Assignment</h1>
        </div>

        <div className="sra-toolbar">
          <input
            type="text"
            placeholder="Search products..." aria-label="Search products"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setRawPage(1);
            }}
            className="sra-input sra-search"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || (selectedProducts.length === 0 && removedProducts.length === 0)}
            className="sra-save"
          >
            {isSaving ? "Saving..." : `Save Selected (${selectedProducts.length})`}
          </button>
        </div>
      </div>

      <div className="sra-panel">
        {loading ? (
          <div className="sra-state">Loading products...</div>
        ) : filteredProducts.length > 0 ? (
          <div className="sra-grid">
            {paginatedProducts.map((product) => {
              const productKey = getProductKey(product);
              const isSelected = selectedProducts.some(
                (item) => getProductKey(item) === productKey,
              );

              return (
                <div
                  key={productKey}
                  className={`sra-product${isSelected ? " is-selected" : ""}`}
                  onClick={() => toggleProduct(product)}
                >
                  <input type="checkbox" checked={isSelected} readOnly className="sra-check" />
                  <div className="sra-product-body">
                    <div className="sra-product-name">{product.item_name}</div>
                    <div className="sra-product-meta">
                      {product.item_code} | {product.category || "-"}
                    </div>
                    {isSelected && (
                      <div className="sra-rate" onClick={(event) => event.stopPropagation()}>
                        <label className="sra-rate-label">Staff Rate</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          aria-label={`Staff rate for ${product.item_name}`}
                          value={staffRates[productKey] || ""}
                          onChange={(event) =>
                            setStaffRates((current) => ({
                              ...current,
                              [productKey]: event.target.value,
                            }))
                          }
                          className="sra-input"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="sra-pager">
              <span className="sra-pager-count">
                Showing {pageStart}-{pageEnd} of {filteredProducts.length} products
              </span>
              <div className="sra-pager-nav">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="sra-pager-btn"
                >
                  Prev
                </button>
                <span className="sra-pager-page">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="sra-pager-btn"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="sra-state">No products found.</div>
        )}
      </div>
    </div>
  );
}
