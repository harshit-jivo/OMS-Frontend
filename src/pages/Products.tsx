import { useEffect, useMemo, useState } from "react";
import { HiArrowPath, HiCube, HiMagnifyingGlass, HiSwatch, HiTag } from "react-icons/hi2";
import { sapService } from "../services/sapService";
import type { Product } from "../services/sapService";
import "../styles/SapData.css";

const ITEMS_PER_PAGE = 15;

const dash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

const uniqueCount = (products: Product[], key: keyof Product) =>
  new Set(products.map((product) => String(product[key] || "").trim()).filter(Boolean)).size;

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const data = await sapService.getProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) =>
      [product.item_code, product.item_name, product.brand, product.category, product.variety]
        .some((field) => String(field || "").toLowerCase().includes(needle)),
    );
  }, [products, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const visible = filteredProducts.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const kpis = [
    { label: "Products", value: products.length, icon: HiCube },
    { label: "Categories", value: uniqueCount(products, "category"), icon: HiTag },
    { label: "Brands", value: uniqueCount(products, "brand"), icon: HiSwatch },
    { label: "Varieties", value: uniqueCount(products, "variety"), icon: HiSwatch },
  ];

  return (
    <div className="sd-page">
      <div className="sd-kpis">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article className="sd-kpi" key={kpi.label}>
              <span className="sd-kpi-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="sd-kpi-body">
                <span className="sd-kpi-value">{kpi.value.toLocaleString("en-IN")}</span>
                <span className="sd-kpi-label">{kpi.label}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="sd-toolbar">
        <div className="sd-search-wrap">
          <HiMagnifyingGlass className="sd-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="sd-search"
            placeholder="Search by code, name, brand, category or variety…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <button type="button" className="sd-btn" onClick={fetchProducts} disabled={loading}>
          <HiArrowPath className={loading ? "sd-spin" : ""} aria-hidden="true" />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="sd-table-card">
        <div className="sd-table-head">
          <h2 className="sd-table-title">Products</h2>
          <span className="sd-table-note">
            {filteredProducts.length.toLocaleString("en-IN")} row
            {filteredProducts.length === 1 ? "" : "s"}
            {search && ` · filtered from ${products.length.toLocaleString("en-IN")}`}
          </span>
        </div>

        {loading && products.length === 0 ? (
          <p className="sd-loading">Loading products…</p>
        ) : filteredProducts.length === 0 ? (
          <p className="sd-empty">No products found</p>
        ) : (
          <>
            <div className="sd-table-scroll">
              <table className="sd-table">
                <thead>
                  <tr>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Brand</th>
                    <th>Category</th>
                    <th>Variety</th>
                    <th>Type</th>
                    <th>Pack Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((product) => (
                    <tr key={product.id}>
                      <td className="sd-code">{dash(product.item_code)}</td>
                      <td className="sd-wrap-cell sd-strong">{dash(product.item_name)}</td>
                      <td>{dash(product.brand)}</td>
                      <td>
                        {product.category ? (
                          <span className="sd-badge sd-badge-info">{product.category}</span>
                        ) : (
                          <span className="sd-dim">—</span>
                        )}
                      </td>
                      <td>{dash(product.variety)}</td>
                      <td className="sd-dim">{dash(product.type)}</td>
                      <td className="sd-nowrap">{dash(product.sal_pack_unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredProducts.length > ITEMS_PER_PAGE && (
              <div className="sd-pagination">
                <button
                  type="button"
                  className="sd-pg-btn"
                  disabled={page === 1}
                  onClick={() => setCurrentPage(page - 1)}
                >
                  ← Prev
                </button>
                <span className="sd-pg-info">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="sd-pg-btn"
                  disabled={page === totalPages}
                  onClick={() => setCurrentPage(page + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
