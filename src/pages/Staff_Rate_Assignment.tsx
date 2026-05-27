import { useCallback, useEffect, useMemo, useState } from "react";
import { ordersService } from "../services/ordersService";
import { sapService } from "../services/sapService";
import type { Product } from "../services/sapService";

const itemsPerPage = 24;

export default function Staff_Rate_Assignment() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [staffRates, setStaffRates] = useState<Record<string, string>>({});
  const [assignedProductKeys, setAssignedProductKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const getProductKey = (product: Product) =>
    `${product.item_code}-${product.category || ""}`;

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const [allProductsData, assignedProductsData] = await Promise.all([
        sapService.getProducts(),
        ordersService.getStaffProducts(),
      ]);

      const allProducts = Array.isArray(allProductsData) ? allProductsData : [];
      const assignedProducts = Array.isArray(assignedProductsData)
        ? assignedProductsData
        : [];
      const assignedById = new Map(
        assignedProducts.map((product) => [product.id, product]),
      );
      const assignedByItemAndCategory = new Map(
        assignedProducts.map((product) => [getProductKey(product), product]),
      );
      const mergedProducts = allProducts.map((product) => {
        const assignedProduct =
          assignedById.get(product.id) ||
          assignedByItemAndCategory.get(getProductKey(product));

        return assignedProduct
          ? { ...product, staff_rate: assignedProduct.staff_rate }
          : product;
      });
      const productKeys = new Set(mergedProducts.map(getProductKey));
      const missingAssignedProducts = assignedProducts.filter(
        (product) => !productKeys.has(getProductKey(product)),
      );
      const nextProducts = [...mergedProducts, ...missingAssignedProducts];
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

      setProducts(nextProducts);
      setSelectedProducts(nextSelectedProducts);
      setAssignedProductKeys(nextSelectedProducts.map(getProductKey));
      setStaffRates(nextStaffRates);
    } catch (error) {
      console.error("Error fetching products:", error);
      setProducts([]);
      setSelectedProducts([]);
      setAssignedProductKeys([]);
      setStaffRates({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;

    return products.filter((product) =>
      [
        product.item_name,
        product.item_code,
        product.category,
        product.brand,
        product.variety,
      ].some((value) => String(value || "").toLowerCase().includes(term)),
    );
  }, [products, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = useMemo(
    () =>
      filteredProducts.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage,
      ),
    [currentPage, filteredProducts],
  );
  const pageStart =
    filteredProducts.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const pageEnd = Math.min(currentPage * itemsPerPage, filteredProducts.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const toggleProduct = (product: Product) => {
    const productKey = getProductKey(product);
    const isSelected = selectedProducts.some(
      (item) => getProductKey(item) === productKey,
    );

    setSelectedProducts((current) =>
      isSelected
        ? current.filter((item) => getProductKey(item) !== productKey)
        : [...current, product],
    );
  };

  const handleSave = async () => {
    const selectedProductKeys = new Set(selectedProducts.map(getProductKey));
    const removedProducts = products
      .filter((product) => assignedProductKeys.includes(getProductKey(product)))
      .filter((product) => !selectedProductKeys.has(getProductKey(product)))
      .map((product) => ({
        product_id: product.id,
        item_code: product.item_code,
        category: product.category || "",
      }));

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
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          marginBottom: "24px",
        }}
      >
        <div style={{ marginBottom: "20px" }}>
          <h1
            style={{
              margin: "0 0 4px",
              fontSize: "24px",
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Staff Rate Assignment
          </h1>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{
              width: "100%",
              maxWidth: "520px",
              height: "var(--input-h, 40px)",
              padding: "0 12px",
              background: "rgba(248, 250, 252, 0.9)",
              border: "1px solid #cbd5e1",
              borderRadius: "var(--radius-sm, 8px)",
              fontSize: "var(--font-ui, 13px)",
              color: "#0f172a",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || selectedProducts.length === 0}
            style={{
              height: "var(--input-h, 40px)",
              padding: "0 16px",
              border: "1px solid #0f766e",
              borderRadius: "var(--radius-sm, 8px)",
              background: isSaving || selectedProducts.length === 0 ? "#94a3b8" : "#0f766e",
              color: "#fff",
              fontSize: "var(--font-ui, 13px)",
              fontWeight: 700,
              cursor: isSaving || selectedProducts.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? "Saving..." : `Save Selected (${selectedProducts.length})`}
          </button>
        </div>
      </div>

      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "16px",
        }}
      >
        {loading ? (
          <div style={{ padding: "24px", color: "#64748b" }}>Loading products...</div>
        ) : filteredProducts.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "12px",
            }}
          >
            {paginatedProducts.map((product) => {
              const productKey = getProductKey(product);
              const isSelected = selectedProducts.some(
                (item) => getProductKey(item) === productKey,
              );

              return (
                <div
                  key={productKey}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    padding: "12px",
                    border: `1px solid ${isSelected ? "#bfdbfe" : "#e2e8f0"}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    background: isSelected ? "#eff6ff" : "#fff",
                  }}
                  onClick={() => toggleProduct(product)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    style={{
                      marginTop: "4px",
                      marginRight: "12px",
                      width: "16px",
                      height: "16px",
                      accentColor: "#2563eb",
                      pointerEvents: "none",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0f172a" }}>
                      {product.item_name}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
                      {product.item_code} | {product.category || "-"}
                    </div>
                    {isSelected && (
                      <div style={{ marginTop: "12px" }} onClick={(event) => event.stopPropagation()}>
                        <label
                          style={{
                            fontSize: "0.75rem",
                            color: "#475569",
                            display: "block",
                            marginBottom: "4px",
                            fontWeight: 500,
                          }}
                        >
                          Staff Rate
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={staffRates[productKey] || ""}
                          onChange={(event) =>
                            setStaffRates((current) => ({
                              ...current,
                              [productKey]: event.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            height: "var(--input-h, 40px)",
                            padding: "0 12px",
                            background: "rgba(248, 250, 252, 0.9)",
                            border: "1px solid #cbd5e1",
                            borderRadius: "var(--radius-sm, 8px)",
                            fontSize: "var(--font-ui, 13px)",
                            color: "#0f172a",
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
                paddingTop: "8px",
              }}
            >
              <span style={{ color: "#64748b", fontSize: "0.8rem" }}>
                Showing {pageStart}-{pageEnd} of {filteredProducts.length} products
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  style={{
                    height: "32px",
                    padding: "0 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    background: currentPage === 1 ? "#f1f5f9" : "#fff",
                    color: currentPage === 1 ? "#94a3b8" : "#0f172a",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  Prev
                </button>
                <span style={{ color: "#475569", fontSize: "0.8rem", minWidth: "56px", textAlign: "center" }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    height: "32px",
                    padding: "0 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    background: currentPage === totalPages ? "#f1f5f9" : "#fff",
                    color: currentPage === totalPages ? "#94a3b8" : "#0f172a",
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "24px", color: "#64748b" }}>No products found.</div>
        )}
      </div>
    </div>
  );
}
