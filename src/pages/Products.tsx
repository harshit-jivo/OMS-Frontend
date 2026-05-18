import { useEffect, useState } from "react";
import { sapService } from "../services/sapService";
import type { Product } from "../services/sapService";
import "../styles/Products.css";


export default function Products() {
const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      let data = await sapService.getProducts();
      setProducts(data);
    } catch (error) {
      console.log("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(
    (product) =>
      product.item_code?.toLowerCase().includes(search.toLowerCase()) ||
      product.item_name?.toLowerCase().includes(search.toLowerCase()) ||
      product.brand?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="pr-page">
      <div className="pr-toolbar">
        <span className="pr-count">Total: {filteredProducts.length}</span>
        <div className="pr-search-wrap">
          <input
            type="text"
            placeholder="Search by code, name or brand..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="pr-search"
          />
          <div className="pr-search-line" />
        </div>
      </div>

      {loading ? (
        <p className="pr-loading">Loading products...</p>
      ) : filteredProducts.length > 0 ? (
        <div className="pr-grid">
          {filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((product) => (
            <div className="pr-card" key={product.id}>
              <div className="pr-card-head">
                <span className="pr-code">{product.item_code}</span>
                {product.category && <span className="pr-badge">{product.category}</span>}
              </div>
              <div className="pr-card-name">{product.item_name}</div>
              <div className="pr-card-details">
                <span>Brand: {product.brand}</span>
                <span>Pack: {product.sal_pack_unit}</span>
                {product.variety && <span>Variety: {product.variety}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="pr-empry">No products found</p>
      )}

      {filteredProducts.length > itemsPerPage && (
        <div className="pr-pagination">
          <button className="pr-pg-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>← Prev</button>
          <span className="pr-pg-info">{currentPage} / {Math.ceil(filteredProducts.length / itemsPerPage)}</span>
          <button className="pr-pg-btn" disabled={currentPage === Math.ceil(filteredProducts.length / itemsPerPage)} onClick={() => setCurrentPage((p) => p + 1)}>Next →</button>
        </div>
    )}
    </div>
  );
}
