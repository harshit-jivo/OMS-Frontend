import { useMemo, useState } from "react";
import { HiArrowPath, HiCube, HiMagnifyingGlass, HiSwatch, HiTag } from "react-icons/hi2";
import type { Product } from "../services/sapService";

import { useSapProducts } from "../lib/sapQueries";
import "../styles/SapData.css";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 15;

const dash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

const uniqueCount = (products: Product[], key: keyof Product) =>
  new Set(products.map((product) => String(product[key] || "").trim()).filter(Boolean)).size;

export default function Products() {
  // `isLoading` is the FIRST load; `isFetching` also covers a Refresh. They
  // were one `loading` flag, so pressing Refresh replaced the table with the
  // word "Loading…" instead of leaving the data up while it reloaded.
  const {
    items: products,
    isLoading: loading,
    isFetching,
    refetch: fetchProducts,
  } = useSapProducts();
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) =>
      [product.item_code, product.item_name, product.brand, product.category, product.variety].some(
        (field) =>
          String(field || "")
            .toLowerCase()
            .includes(needle),
      ),
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
            placeholder="Search by code, name, brand, category or variety…" aria-label="Search by code, name, brand, category or variety"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <button type="button" className="sd-btn" onClick={fetchProducts} disabled={isFetching}>
          <HiArrowPath className={loading ? "sd-spin" : ""} aria-hidden="true" />
          {isFetching ? "Loading…" : "Refresh"}
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
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Variety</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Pack Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="sd-code">{dash(product.item_code)}</TableCell>
                      <TableCell className="sd-wrap-cell sd-strong">
                        {dash(product.item_name)}
                      </TableCell>
                      <TableCell>{dash(product.brand)}</TableCell>
                      <TableCell>
                        {product.category ? (
                          <Badge tone="info">{product.category}</Badge>
                        ) : (
                          <span className="sd-dim">—</span>
                        )}
                      </TableCell>
                      <TableCell>{dash(product.variety)}</TableCell>
                      <TableCell className="sd-dim">{dash(product.type)}</TableCell>
                      <TableCell className="sd-nowrap">{dash(product.sal_pack_unit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredProducts.length > ITEMS_PER_PAGE && (
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
