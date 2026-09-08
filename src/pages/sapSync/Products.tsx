/**
 * SAP Sync · Products — the item master as it landed locally.
 */
import { useMemo, useState } from "react";
import { HiArrowPath, HiCube, HiSwatch, HiTag } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterActions, FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { Card, CardHeader, CardTitle, EmptyState, Stat, StatRow } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Product } from "../../services/sapService";
import { useSapProducts } from "../../lib/sapQueries";
import { dash, num } from "./format";

const ITEMS_PER_PAGE = 15;

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

  return (
    <div className="space-y-4 sm:space-y-6">
      <StatRow>
        <Stat label="Products" value={num(products.length)} icon={HiCube} />
        <Stat label="Categories" value={num(uniqueCount(products, "category"))} icon={HiTag} />
        <Stat label="Brands" value={num(uniqueCount(products, "brand"))} icon={HiSwatch} />
        <Stat label="Varieties" value={num(uniqueCount(products, "variety"))} icon={HiSwatch} />
      </StatRow>

      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setCurrentPage(1);
          }}
          placeholder="Code, name, brand, category or variety…"
          fieldClassName="min-w-[280px]"
        />
        <FilterCount>
          {num(filteredProducts.length)} row{filteredProducts.length === 1 ? "" : "s"}
          {search ? " of " + num(products.length) : ""}
        </FilterCount>
        <FilterActions>
          <Button onClick={() => void fetchProducts()} disabled={isFetching}>
            <HiArrowPath className={isFetching ? "animate-spin" : ""} aria-hidden="true" />
            {isFetching ? "Loading…" : "Refresh"}
          </Button>
        </FilterActions>
      </FilterBar>

      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 px-4 py-3">
          <CardTitle>Products</CardTitle>
        </CardHeader>

        {loading && products.length === 0 ? (
          <TableSkeleton rows={8} columns={7} />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={HiCube}
            title={search ? "No products match this search" : "No products synced yet"}
            hint={
              search
                ? "Try a shorter code or part of the item name."
                : "Run a Products sync on the Status tab to pull the item master from SAP."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
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
                      <TableCell className="font-mono text-[12px] text-ink">
                        {dash(product.item_code)}
                      </TableCell>
                      <TableCell className="font-semibold text-ink">
                        {dash(product.item_name)}
                      </TableCell>
                      <TableCell>{dash(product.brand)}</TableCell>
                      <TableCell>
                        {product.category ? (
                          <Badge tone="info">{product.category}</Badge>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </TableCell>
                      <TableCell>{dash(product.variety)}</TableCell>
                      <TableCell className="text-subtle">{dash(product.type)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {dash(product.sal_pack_unit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredProducts.length > ITEMS_PER_PAGE && (
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                className="border-t border-line px-4 py-3"
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
