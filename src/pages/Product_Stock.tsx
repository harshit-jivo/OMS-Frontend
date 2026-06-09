import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  HiArrowPath,
  HiCube,
  HiDocumentText,
  HiExclamationTriangle,
  HiMagnifyingGlass,
  HiXMark,
} from "react-icons/hi2";
import { sapService } from "../services/sapService";
import type { Product } from "../services/sapService";
import type { Party, SapSalesOrder } from "../services/sapService";
import "../styles/Product_Stock.css";

const ITEMS_PER_PAGE = 15;
const LOW_STOCK_LIMIT = 10;

type StockStatus = "shortage" | "out" | "low" | "available";

const STOCK_OPTIONS: { value: StockStatus; label: string }[] = [
  { value: "shortage", label: "Shortage" },
  { value: "out", label: "Out of Stock" },
  { value: "low", label: "Low Stock" },
  { value: "available", label: "Available" },
];

type PartyDemand = {
  qty: number;
  parties: Record<string, number>;
};

type StockDisplayProduct = Product & {
  display_key: string;
  display_stock: number;
  display_required_qty: number;
  display_left_over_stock: number;
  display_party_demand?: PartyDemand;
};

type OrderModalState = {
  party: Party;
  orders: SapSalesOrder[];
  loading: boolean;
  error: string;
} | null;

type ProductOption = {
  item_code: string;
  item_name: string;
  category?: string;
  sal_pack_unit?: string | null;
};

type ProductDemandRow = {
  order: SapSalesOrder;
  line: SapSalesOrder["lines"][number];
};

const normalizeProducts = (data: unknown): Product[] => {
  if (Array.isArray(data)) return data as Product[];

  if (data && typeof data === "object") {
    const response = data as { data?: unknown; products?: unknown; results?: unknown };
    if (Array.isArray(response.data)) return response.data as Product[];
    if (Array.isArray(response.products)) return response.products as Product[];
    if (Array.isArray(response.results)) return response.results as Product[];
  }

  return [];
};

const toStockNumber = (value: Product["on_hand"]) => {
  const nextValue = Number(value ?? 0);
  return Number.isFinite(nextValue) ? nextValue : 0;
};

const getWarehouseStock = (product: Product) =>
  toStockNumber(product.warehouse_stock ?? product.on_hand);

const getPendingRequiredQty = (product: Product) =>
  toStockNumber(product.pending_required_qty ?? product.pendingRequiredQty);

const getLeftOverStock = (product: Product) => {
  if (product.left_over_stock !== undefined && product.left_over_stock !== null) {
    return toStockNumber(product.left_over_stock);
  }

  return getWarehouseStock(product) - getPendingRequiredQty(product);
};

const getStockStatus = (stock: number, leftOverStock = stock): StockStatus => {
  if (leftOverStock < 0) return "shortage";
  if (stock <= 0) return "out";
  if (leftOverStock <= LOW_STOCK_LIMIT) return "low";
  return "available";
};

const getStatusLabel = (status: StockStatus) => {
  if (status === "shortage") return "Shortage";
  if (status === "out") return "Out of Stock";
  if (status === "low") return "Low Stock";
  return "Available";
};

const formatQuantity = (value: number) =>
  value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });

const formatRoundedQuantity = (value: number) =>
  Math.round(value).toLocaleString("en-IN");

const getPackLtrs = (pack?: string | null) => {
  const text = String(pack || "").trim();
  const numericPack = Number(text);
  if (Number.isFinite(numericPack) && numericPack > 0) return numericPack;

  const match = text.match(/(\d+(?:\.\d+)?)\s*(LTR|L|ML)\b/i);
  if (!match) return 0;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;

  return match[2].toUpperCase() === "ML" ? value / 1000 : value;
};

const getWarehouseQtyLtrs = (product: StockDisplayProduct) =>
  product.display_stock * getPackLtrs(product.sal_pack_unit);

const formatOrderDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.split("T")[0] || value;

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();
const getPartyName = (party: Party) =>
  String(party.card_name || (party as unknown as { CardName?: string }).CardName || "").trim();
const getPartyCode = (party: Party) =>
  String(party.card_code || (party as unknown as { CardCode?: string }).CardCode || "").trim();
const getPartySearchText = (party: Party) =>
  normalizeText([
    getPartyName(party),
    getPartyCode(party),
    party.address,
    party.category,
    party.state,
    party.main_group,
    party.chain,
  ].filter(Boolean).join(" "));
const getOrderLineItemCode = (line: { ItemCode?: string }) => String(line.ItemCode || "").trim();
const getOrderLineWarehouseCode = (line: { WhsCode?: string | null }) => String(line.WhsCode || "").trim();
const getStockKey = (itemCode: string, warehouseCode?: string | null) =>
  `${String(itemCode || "").trim()}||${String(warehouseCode || "").trim()}`;
const getProductGroupKey = (product: Product) =>
  `${String(product.item_code || "").trim()}||${String(product.category || "").trim()}`;
const getItemCodeFromStockKey = (stockKey: string) => stockKey.split("||")[0] || "";
const getSalesOrderKey = (order: SapSalesOrder) =>
  `${String(order.CardCode || "").trim()}||${String(order.DocEntry || order.DocNum || "").trim()}`;
const getSalesOrderKeyForParty = (order: SapSalesOrder, partyCode: string) =>
  getSalesOrderKey({ ...order, CardCode: partyCode });

const mergePartyDemand = (target: PartyDemand, source?: PartyDemand) => {
  if (!source) return target;

  target.qty += source.qty;
  Object.entries(source.parties).forEach(([partyCode, qty]) => {
    target.parties[partyCode] = (target.parties[partyCode] || 0) + qty;
  });

  return target;
};

const getDemandByItemFromOrders = (orders: SapSalesOrder[]) => {
  const itemOrderDemand: Record<string, Record<string, { partyCode: string; qty: number }>> = {};

  orders.forEach((order) => {
    const partyCode = String(order.CardCode || "").trim();
    if (!partyCode) return;

    order.lines?.forEach((line) => {
      const itemCode = getOrderLineItemCode(line);
      if (!itemCode) return;

      const orderKey = getSalesOrderKeyForParty(order, partyCode);
      const openQty = toStockNumber(line.OpenQty);
      itemOrderDemand[itemCode] = itemOrderDemand[itemCode] || {};
      itemOrderDemand[itemCode][orderKey] = {
        partyCode,
        qty: Math.max(itemOrderDemand[itemCode][orderKey]?.qty || 0, openQty),
      };
    });
  });

  return Object.entries(itemOrderDemand).reduce<Record<string, PartyDemand>>(
    (current, [itemCode, orderDemand]) => {
      current[itemCode] = Object.values(orderDemand).reduce<PartyDemand>(
        (total, { partyCode, qty }) => {
          total.qty += qty;
          total.parties[partyCode] = (total.parties[partyCode] || 0) + qty;
          return total;
        },
        { qty: 0, parties: {} }
      );
      return current;
    },
    {}
  );
};

export default function Product_Stock() {
  const [products, setProducts] = useState<Product[]>([]);
  const [openParties, setOpenParties] = useState<Party[]>([]);
  const [selectedPartyCodes, setSelectedPartyCodes] = useState<string[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(false);
  const [partyOrdersLoading, setPartyOrdersLoading] = useState(false);
  const [partyOrderProducts, setPartyOrderProducts] = useState<Record<string, PartyDemand>>({});
  const [selectedSalesOrders, setSelectedSalesOrders] = useState<Record<string, SapSalesOrder>>({});
  const [orderModal, setOrderModal] = useState<OrderModalState>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedProductCode, setSelectedProductCode] = useState("");
  const [productOrders, setProductOrders] = useState<SapSalesOrder[]>([]);
  const [productOrdersLoading, setProductOrdersLoading] = useState(false);
  const [productOrderError, setProductOrderError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [warehouseFilters, setWarehouseFilters] = useState<string[]>([]);
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [warehouseDropdownOpen, setWarehouseDropdownOpen] = useState(false);
  const [stockFilters, setStockFilters] = useState<StockStatus[]>([]);
  const [stockDropdownOpen, setStockDropdownOpen] = useState(false);
  const [expandedDemandKey, setExpandedDemandKey] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const partyDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const warehouseDropdownRef = useRef<HTMLDivElement>(null);
  const stockDropdownRef = useRef<HTMLDivElement>(null);

  const fetchProducts = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await sapService.getProductStock();
      setProducts(normalizeProducts(data));
    } catch (err) {
      console.error("Error fetching product stock:", err);
      setProducts([]);
      setError("Unable to load stock data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProducts();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        partyDropdownRef.current &&
        !partyDropdownRef.current.contains(event.target as Node)
      ) {
        setPartyDropdownOpen(false);
      }
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setCategoryDropdownOpen(false);
      }
      if (
        warehouseDropdownRef.current &&
        !warehouseDropdownRef.current.contains(event.target as Node)
      ) {
        setWarehouseDropdownOpen(false);
      }
      if (
        stockDropdownRef.current &&
        !stockDropdownRef.current.contains(event.target as Node)
      ) {
        setStockDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchOpenParties = async () => {
    try {
      const data = await sapService.getOpenParties();
      setOpenParties(data);
    } catch (err) {
      console.error("Error fetching open parties:", err);
      setOpenParties([]);
    }
  };

  useEffect(() => {
    void fetchOpenParties();
  }, []);

  useEffect(() => {
    const fetchPartyOrders = async () => {
      if (Object.keys(selectedSalesOrders).length > 0) {
        setPartyOrderProducts({});
        setPartyOrdersLoading(false);
        return;
      }

      if (selectedPartyCodes.length === 0) {
        setPartyOrderProducts({});
        return;
      }

      setPartyOrdersLoading(true);
      try {
        const partyOrderResponses = await Promise.all(
          selectedPartyCodes.map((partyCode) => sapService.getOpenSalesOrders(partyCode))
        );

        const demand = partyOrderResponses.reduce<Record<string, PartyDemand>>((current, orders, index) => {
          const partyCode = selectedPartyCodes[index];
          (orders as SapSalesOrder[]).forEach((order) => {
            order.lines?.forEach((line) => {
              const itemCode = getOrderLineItemCode(line);
              if (!itemCode) return;

              const stockKey = getStockKey(itemCode, getOrderLineWarehouseCode(line));
              const openQty = toStockNumber(line.OpenQty);
              const existing = current[stockKey] || { qty: 0, parties: {} };
              existing.qty += openQty;
              existing.parties[partyCode] = (existing.parties[partyCode] || 0) + openQty;
              current[stockKey] = existing;
            });
          });
          return current;
        }, {});

        setPartyOrderProducts(demand);
      } catch (err) {
        console.error("Error fetching party open orders:", err);
        setPartyOrderProducts({});
      } finally {
        setPartyOrdersLoading(false);
      }
    };

    void fetchPartyOrders();
  }, [selectedPartyCodes, selectedSalesOrders]);

  const categories = useMemo(() => {
    const values = products
      .map((product) => product.category)
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set(values)).sort();
  }, [products]);

  const productOptions = useMemo<ProductOption[]>(() => {
    const optionMap = products.reduce<Map<string, ProductOption>>((current, product) => {
      const itemCode = String(product.item_code || "").trim();
      if (!itemCode || current.has(itemCode)) return current;

      current.set(itemCode, {
        item_code: itemCode,
        item_name: product.item_name || itemCode,
        category: product.category,
        sal_pack_unit: product.sal_pack_unit,
      });
      return current;
    }, new Map());

    return Array.from(optionMap.values()).sort((first, second) =>
      (first.item_name || first.item_code).localeCompare(second.item_name || second.item_code)
    );
  }, [products]);

  const selectedProduct = useMemo(
    () => productOptions.find((product) => product.item_code === selectedProductCode),
    [productOptions, selectedProductCode],
  );

  const warehouses = useMemo(() => {
    const values = products
      .map((product) => product.warehouse_code)
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set(values)).sort();
  }, [products]);

  const filteredWarehouses = useMemo(() => {
    const search = normalizeText(warehouseSearch);
    const matchingWarehouses = search
      ? warehouses.filter((warehouseCode) => normalizeText(warehouseCode).includes(search))
      : warehouses;

    return [...matchingWarehouses].sort((first, second) => {
      const firstSelected = warehouseFilters.includes(first) ? 0 : 1;
      const secondSelected = warehouseFilters.includes(second) ? 0 : 1;
      if (firstSelected !== secondSelected) return firstSelected - secondSelected;
      return first.localeCompare(second);
    });
  }, [warehouseFilters, warehouseSearch, warehouses]);

  const warehouseFilterLabel = useMemo(() => {
    if (warehouseFilters.length === 0 || warehouseFilters.length === warehouses.length) return "All Warehouses";
    if (warehouseFilters.length === 1) return warehouseFilters[0];
    return `${warehouseFilters.length} Warehouses Selected`;
  }, [warehouseFilters, warehouses.length]);

  const filteredOpenParties = useMemo(() => {
    const search = normalizeText(partySearch);
    if (!search) return openParties;
    const searchTokens = search.split(/\s+/).filter(Boolean);

    return openParties.filter((party) => {
      const partySearchText = getPartySearchText(party);
      return searchTokens.every((token) => partySearchText.includes(token));
    });
  }, [openParties, partySearch]);

  const selectedParties = useMemo(
    () => openParties.filter((party) => selectedPartyCodes.includes(getPartyCode(party))),
    [openParties, selectedPartyCodes],
  );

  const partyFilterLabel = useMemo(() => {
    if (selectedParties.length === 0) return "All Parties";
    if (openParties.length > 0 && selectedParties.length === openParties.length) return "All Parties";
    if (selectedParties.length === 1) {
      const party = selectedParties[0];
      return `${getPartyName(party) || getPartyCode(party)} (${getPartyCode(party)})`;
    }
    return `${selectedParties.length} Parties Selected`;
  }, [openParties.length, selectedParties]);

  const closeOrderModal = () => {
    setOrderModal(null);
    setOrderSearch("");
  };

  const clearPartyOrders = (partyCode: string) => {
    setSelectedSalesOrders((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (String(next[key].CardCode || "").trim() === partyCode) {
          delete next[key];
        }
      });
      return next;
    });
  };

  const openPartyOrderModal = async (party: Party) => {
    setPartyDropdownOpen(false);
    setPartySearch("");
    setOrderSearch("");
    setOrderModal({ party, orders: [], loading: true, error: "" });

    try {
      const orders = await sapService.getOpenSalesOrders(getPartyCode(party));
      setOrderModal({ party, orders, loading: false, error: "" });
    } catch (err) {
      console.error("Error fetching party open orders:", err);
      setOrderModal({
        party,
        orders: [],
        loading: false,
        error: "Unable to load open sales orders for this party.",
      });
    }
  };

  const handlePartyClick = (party: Party) => {
    void openPartyOrderModal(party);
  };

  const toggleSalesOrder = (order: SapSalesOrder) => {
    const partyCode = String(order.CardCode || (orderModal ? getPartyCode(orderModal.party) : "")).trim();
    if (!partyCode) return;
    const normalizedOrder = { ...order, CardCode: partyCode };
    const orderKey = getSalesOrderKey(normalizedOrder);

    setSelectedSalesOrders((current) => {
      const next = { ...current };
      if (next[orderKey]) {
        delete next[orderKey];
      } else {
        next[orderKey] = normalizedOrder;
      }
      const partyHasOrders = Object.values(next).some(
        (selectedOrder) => String(selectedOrder.CardCode || "").trim() === partyCode
      );
      setSelectedPartyCodes((currentParties) => {
        if (partyHasOrders) {
          return currentParties.includes(partyCode) ? currentParties : [...currentParties, partyCode];
        }
        return currentParties.filter((code) => code !== partyCode);
      });
      return next;
    });
  };

  const selectVisibleSalesOrders = () => {
    if (!orderModal) return;
    const partyCode = getPartyCode(orderModal.party);
    if (!partyCode) return;

    setSelectedPartyCodes((current) =>
      current.includes(partyCode) ? current : [...current, partyCode]
    );
    setSelectedSalesOrders((current) => {
      const next = { ...current };
      filteredModalOrders.forEach((order) => {
        const normalizedOrder = { ...order, CardCode: partyCode };
        next[getSalesOrderKey(normalizedOrder)] = normalizedOrder;
      });
      return next;
    });
  };

  const clearModalPartyOrders = () => {
    if (!orderModal) return;
    const partyCode = getPartyCode(orderModal.party);
    clearPartyOrders(partyCode);
    setSelectedPartyCodes((current) => current.filter((code) => code !== partyCode));
  };

  const productDemandRows = useMemo<ProductDemandRow[]>(() => {
    if (!selectedProductCode) return [];

    return productOrders.flatMap((order) =>
      (order.lines || [])
        .filter((line) => getOrderLineItemCode(line) === selectedProductCode)
        .map((line) => ({ order, line }))
    );
  }, [productOrders, selectedProductCode]);

  const selectedProductRequiredQty = useMemo(
    () => productDemandRows.reduce((sum, row) => sum + toStockNumber(row.line.OpenQty), 0),
    [productDemandRows],
  );

  const selectedProductPartyCount = useMemo(
    () => new Set(productDemandRows.map((row) => String(row.order.CardCode || "").trim()).filter(Boolean)).size,
    [productDemandRows],
  );

  const getProductLineStock = (line: SapSalesOrder["lines"][number]) => {
    const stockRow = products.find(
      (product) =>
        String(product.item_code || "").trim() === getOrderLineItemCode(line) &&
        String(product.warehouse_code || "").trim() === getOrderLineWarehouseCode(line)
    );

    return stockRow ? getWarehouseStock(stockRow) : 0;
  };

  const clearProductDemand = (resetSearch = true) => {
    const hasSelectedOrders = Object.keys(selectedSalesOrders).length > 0;

    setSelectedProductCode("");
    setProductOrders([]);
    setProductOrderError("");
    if (!hasSelectedOrders) {
      setSelectedPartyCodes([]);
      setSelectedSalesOrders({});
    }
    setExpandedDemandKey("");
    if (resetSearch) setSearchText("");
  };

  const selectProductDemand = async (product: ProductOption) => {
    const selectedOrders = Object.values(selectedSalesOrders);

    setSelectedProductCode(product.item_code);
    setProductOrderError("");
    setProductOrders([]);
    setSearchText(product.item_code);

    if (selectedOrders.length > 0) {
      setProductOrders(selectedOrders);
      setExpandedDemandKey(product.item_code);
      return;
    }

    setSelectedPartyCodes([]);
    setSelectedSalesOrders({});
    setProductOrdersLoading(true);

    try {
      const orders = await sapService.getOpenSalesOrdersByProduct(product.item_code);
      setProductOrders(orders);
      setSelectedPartyCodes(
        Array.from(new Set(orders.map((order) => String(order.CardCode || "").trim()).filter(Boolean)))
      );
      setSelectedSalesOrders(
        orders.reduce<Record<string, SapSalesOrder>>((current, order) => {
          const partyCode = String(order.CardCode || "").trim();
          if (!partyCode) return current;
          current[getSalesOrderKey({ ...order, CardCode: partyCode })] = { ...order, CardCode: partyCode };
          return current;
        }, {})
      );
    } catch (err) {
      console.error("Error fetching product open orders:", err);
      setProductOrderError("Unable to load parties and sales orders for this product.");
    } finally {
      setProductOrdersLoading(false);
    }
  };

  const filteredModalOrders = useMemo(() => {
    if (!orderModal) return [];
    const search = normalizeText(orderSearch);
    if (!search) return orderModal.orders;

    return orderModal.orders.filter((order) => (
      normalizeText(order.DocNum).includes(search) ||
      normalizeText(order.DocEntry).includes(search) ||
      normalizeText(order.NumAtCard).includes(search)
    ));
  }, [orderModal, orderSearch]);

  const selectedModalOrderCount = useMemo(() => {
    if (!orderModal) return 0;
    const partyCode = getPartyCode(orderModal.party);
    return Object.values(selectedSalesOrders).filter(
      (order) => String(order.CardCode || "").trim() === partyCode
    ).length;
  }, [orderModal, selectedSalesOrders]);

  const stockFilterLabel = useMemo(() => {
    if (stockFilters.length === 0 || stockFilters.length === STOCK_OPTIONS.length) return "All Stock";
    if (stockFilters.length === 1) {
      return STOCK_OPTIONS.find((option) => option.value === stockFilters[0])?.label || "All Stock";
    }
    return `${stockFilters.length} Statuses Selected`;
  }, [stockFilters]);

  const categoryFilterLabel = useMemo(() => {
    if (categoryFilter === "all") return "All Categories";
    return categories.find((category) => normalizeText(category) === categoryFilter) || "All Categories";
  }, [categories, categoryFilter]);

  const toggleStockFilter = (status: StockStatus) => {
    setStockFilters((current) =>
      current.includes(status)
        ? current.filter((value) => value !== status)
        : [...current, status]
    );
  };

  const toggleWarehouseFilter = (warehouseCode: string) => {
    setWarehouseFilters((current) =>
      current.includes(warehouseCode)
        ? current.filter((code) => code !== warehouseCode)
        : [...current, warehouseCode]
    );
  };

  const getPartyDemandRows = (demand?: PartyDemand) => {
    if (!demand) return [];

    return Object.entries(demand.parties)
      .map(([partyCode, qty]) => {
        const party = openParties.find((item) => item.card_code === partyCode);
        return {
          partyCode,
          partyName: party?.card_name || partyCode,
          qty,
        };
      })
      .sort((first, second) => second.qty - first.qty || first.partyName.localeCompare(second.partyName));
  };

  const filteredProducts = useMemo<StockDisplayProduct[]>(() => {
    const search = normalizeText(searchText);
    const hasSelectedOrderFilter = Object.keys(selectedSalesOrders).length > 0;
    const hasActiveDemandFilter = hasSelectedOrderFilter || selectedPartyCodes.length > 0;
    const shouldGroupWarehouses = hasSelectedOrderFilter || warehouseFilters.length !== 1;
    const selectedOrderDemandByItemCode = getDemandByItemFromOrders(Object.values(selectedSalesOrders));
    const partyWideDemandByItemCode = Object.entries(partyOrderProducts).reduce<Record<string, PartyDemand>>(
      (current, [stockKey, demand]) => {
        const itemCode = getItemCodeFromStockKey(stockKey);
        if (!itemCode) return current;
        current[itemCode] = mergePartyDemand(current[itemCode] || { qty: 0, parties: {} }, demand);
        return current;
      },
      {}
    );
    const demandByItemCode = hasSelectedOrderFilter
      ? selectedOrderDemandByItemCode
      : partyWideDemandByItemCode;

    const rowMatches = products
      .filter((product) => {
        const stock = getWarehouseStock(product);
        const productStockKey = getStockKey(product.item_code, product.warehouse_code);
        const partyRequiredQty = partyOrderProducts[productStockKey]?.qty;
        const itemDemand = demandByItemCode[String(product.item_code || "").trim()];
        const pendingQty = hasSelectedOrderFilter
          ? itemDemand?.qty
          : selectedPartyCodes.length > 0
            ? partyRequiredQty
            : getPendingRequiredQty(product);
        const leftOverStock = hasActiveDemandFilter ? stock - toStockNumber(pendingQty) : getLeftOverStock(product);
        const status = getStockStatus(stock, leftOverStock);
        const matchesPartyOrders = !hasActiveDemandFilter || (
          hasSelectedOrderFilter
            ? itemDemand !== undefined
            : shouldGroupWarehouses
              ? itemDemand !== undefined
              : partyRequiredQty !== undefined
        );

        const matchesSearch =
          !search ||
          normalizeText(product.item_code).includes(search) ||
          normalizeText(product.item_name).includes(search) ||
          normalizeText(product.variety).includes(search) ||
          normalizeText(product.sal_pack_unit).includes(search) ||
          normalizeText(product.category).includes(search) ||
          normalizeText(product.warehouse_code).includes(search);

        const matchesCategory =
          categoryFilter === "all" || normalizeText(product.category) === categoryFilter;
        const matchesWarehouse =
          warehouseFilters.length === 0 || warehouseFilters.includes(String(product.warehouse_code || "").trim());
        const matchesStock = shouldGroupWarehouses || stockFilters.length === 0 || stockFilters.includes(status);

        return matchesSearch && matchesPartyOrders && matchesCategory && matchesWarehouse && matchesStock;
      });

    const displayProducts = shouldGroupWarehouses
      ? Array.from(
          rowMatches.reduce<Map<string, StockDisplayProduct>>((current, product) => {
            const itemCode = String(product.item_code || "").trim();
            const groupKey = hasSelectedOrderFilter ? itemCode : getProductGroupKey(product);
            const stock = getWarehouseStock(product);
            const productStockKey = getStockKey(product.item_code, product.warehouse_code);
            const rowPartyDemand = partyOrderProducts[productStockKey];
            const itemDemand = demandByItemCode[itemCode];
            const requiredQty = hasActiveDemandFilter ? 0 : getPendingRequiredQty(product);
            const existing = current.get(groupKey);

            if (existing) {
              existing.display_stock += stock;
              existing.display_required_qty += requiredQty;
              existing.display_required_qty = hasActiveDemandFilter
                ? itemDemand?.qty || 0
                : existing.display_required_qty;
              existing.display_left_over_stock = existing.display_stock - existing.display_required_qty;
              existing.display_party_demand = mergePartyDemand(
                existing.display_party_demand || { qty: 0, parties: {} },
                rowPartyDemand
              );
              if (hasActiveDemandFilter) {
                existing.display_party_demand = itemDemand;
              }
              return current;
            }

            current.set(groupKey, {
              ...product,
              warehouse_code: "",
              display_key: groupKey,
              display_stock: stock,
              display_required_qty: hasActiveDemandFilter ? itemDemand?.qty || 0 : requiredQty,
              display_left_over_stock: stock - (hasActiveDemandFilter ? itemDemand?.qty || 0 : requiredQty),
              display_party_demand: hasActiveDemandFilter
                ? itemDemand
                : rowPartyDemand
                  ? mergePartyDemand({ qty: 0, parties: {} }, rowPartyDemand)
                  : undefined,
            });
            return current;
          }, new Map()).values()
        )
      : rowMatches.map((product) => {
          const stock = getWarehouseStock(product);
          const productStockKey = getStockKey(product.item_code, product.warehouse_code);
          const partyDemand = partyOrderProducts[productStockKey];
          const itemDemand = demandByItemCode[String(product.item_code || "").trim()];
          const requiredQty = hasSelectedOrderFilter
            ? itemDemand?.qty || 0
            : selectedPartyCodes.length > 0
              ? partyDemand?.qty || 0
            : getPendingRequiredQty(product);

          return {
            ...product,
            display_key: `${productStockKey}||${product.category ?? product.id}`,
            display_stock: stock,
            display_required_qty: requiredQty,
            display_left_over_stock: hasActiveDemandFilter
              ? stock - requiredQty
              : getLeftOverStock(product),
            display_party_demand: hasSelectedOrderFilter ? itemDemand : partyDemand,
          };
        });

    return displayProducts
      .filter((product) => {
        const status = getStockStatus(product.display_stock, product.display_left_over_stock);
        return stockFilters.length === 0 || stockFilters.includes(status);
      })
      .sort((first, second) => {
        const firstStock = first.display_stock;
        const secondStock = second.display_stock;
        const priority: Record<StockStatus, number> = {
          shortage: 0,
          out: 1,
          low: 2,
          available: 3,
        };
        const firstLeftOverStock = first.display_left_over_stock;
        const secondLeftOverStock = second.display_left_over_stock;
        const firstPriority = priority[getStockStatus(firstStock, firstLeftOverStock)];
        const secondPriority = priority[getStockStatus(secondStock, secondLeftOverStock)];

        if (firstPriority !== secondPriority) return firstPriority - secondPriority;
        if (firstLeftOverStock !== secondLeftOverStock) return firstLeftOverStock - secondLeftOverStock;
        if (firstStock !== secondStock) return firstStock - secondStock;

        return (first.item_name || first.item_code || "").localeCompare(
          second.item_name || second.item_code || "",
        );
      });
  }, [
    categoryFilter,
    partyOrderProducts,
    products,
    searchText,
    selectedPartyCodes,
    selectedSalesOrders,
    stockFilters,
    warehouseFilters,
  ]);

  const summary = useMemo(() => {
    const uniqueProducts = new Set<string>();

    const summaryData = filteredProducts.reduce(
      (current, product) => {
        const stock = product.display_stock;
        const pendingQty = product.display_required_qty;
        const leftOverStock = product.display_left_over_stock;
        const status = getStockStatus(stock, leftOverStock);

        current.totalStock += stock;
        current.pendingRequired += pendingQty;
        current.leftOverStock += leftOverStock;
        current[status] += 1;
        if (product.item_code) uniqueProducts.add(`${product.item_code}-${product.category ?? ""}`);
        return current;
      },
      {
        totalStock: 0,
        pendingRequired: 0,
        leftOverStock: 0,
        shortage: 0,
        out: 0,
        low: 0,
        available: 0,
      },
    );

    return {
      ...summaryData,
      totalProducts: uniqueProducts.size,
    };
  }, [filteredProducts]);

  useEffect(() => {
    setCurrentPage(1);
    setExpandedDemandKey("");
  }, [categoryFilter, searchText, selectedPartyCodes, selectedProductCode, stockFilters, warehouseFilters]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const pageStart = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageProducts = filteredProducts.slice(pageStart, pageStart + ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div className="ps-page">
      <div className="ps-header">
        <div>
          <span className="ps-kicker">Live Warehouse Inventory</span>
          <h1 className="ps-title">Product Stock</h1>
          <p className="ps-subtitle">HANA stock, open order demand, and left-over quantity by warehouse.</p>
        </div>

        <button
          className="ps-refresh"
          type="button"
          onClick={() => {
            void fetchProducts();
            void fetchOpenParties();
          }}
          disabled={loading || partyOrdersLoading || productOrdersLoading}
        >
          <HiArrowPath />
          {loading || partyOrdersLoading || productOrdersLoading ? "Refreshing" : "Refresh"}
        </button>
      </div>

      <section className="ps-summary">
        <div className="ps-card ps-card-products">
          <span>{selectedPartyCodes.length > 0 ? "Selected Party Items" : "Total Products"}</span>
          <strong>{summary.totalProducts}</strong>
          {selectedPartyCodes.length > 0 && (
            <small>{selectedPartyCodes.length} {selectedPartyCodes.length === 1 ? "party" : "parties"} selected</small>
          )}
        </div>
        <div className="ps-card ps-card-stock">
          <span>Total Stock</span>
          <strong>{formatQuantity(summary.totalStock)}</strong>
        </div>
        <div className="ps-card ps-card-required">
          <span>Order Required Qty</span>
          <strong>{formatQuantity(summary.pendingRequired)}</strong>
        </div>
        <div className="ps-card ps-card-danger">
          <span>Shortage</span>
          <strong>{summary.shortage}</strong>
        </div>
        <div className="ps-card ps-card-warning">
          <span>Low / Out</span>
          <strong>{summary.low + summary.out}</strong>
        </div>
      </section>

      <section className="ps-toolbar">
        <label className="ps-search">
          <HiMagnifyingGlass />
          <input
            type="text"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              if (selectedProductCode) clearProductDemand(false);
            }}
            placeholder="Search by product, warehouse code, variety or pack"
          />
        </label>

        <div
          className={`ps-warehouse-dropdown${partyDropdownOpen ? " open" : ""}`}
          ref={partyDropdownRef}
        >
          <button
            type="button"
            className="ps-warehouse-trigger"
            onClick={() => {
              setPartyDropdownOpen((open) => !open);
              setPartySearch("");
            }}
          >
            <span>{partyFilterLabel}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="#64748b"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {partyDropdownOpen && (
            <div className="ps-warehouse-menu ps-party-menu">
              <div className="ps-warehouse-search-wrap">
                <HiMagnifyingGlass />
                <input
                  type="text"
                  className="ps-warehouse-search-input"
                  placeholder="Search party..."
                  value={partySearch}
                  onChange={(event) => setPartySearch(event.target.value)}
                  autoFocus
                />
              </div>
              <div className="ps-warehouse-options">
                {openParties.length > 0 && (
                  <div className="ps-party-bulk-actions">
                    <button
                      type="button"
                      className="ps-party-bulk-btn"
                      onClick={() => {
                        setSelectedPartyCodes(openParties.map((party) => getPartyCode(party)).filter(Boolean));
                        setSelectedSalesOrders({});
                      }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="ps-party-bulk-btn"
                      onClick={() => {
                        setSelectedPartyCodes([]);
                        setSelectedSalesOrders({});
                        setPartySearch("");
                      }}
                    >
                      Deselect All
                    </button>
                  </div>
                )}
                {filteredOpenParties.length > 0 ? 
                  ([...filteredOpenParties]
                    .sort((a, b) => {
                      const aCode = getPartyCode(a);
                      const bCode = getPartyCode(b);
                      const aSel = selectedPartyCodes.includes(aCode) ? 0 : 1;
                      const bSel = selectedPartyCodes.includes(bCode) ? 0 : 1;
                      if (aSel !== bSel) return aSel - bSel;
                      const aName = (getPartyName(a) || aCode).toLowerCase();
                      const bName = (getPartyName(b) || bCode).toLowerCase();
                      return aName.localeCompare(bName);
                    })
                    .map((party) => {
                    const partyCode = getPartyCode(party);
                    const partyName = getPartyName(party);

                    return (
                    <button
                      type="button"
                      key={partyCode}
                      aria-pressed={selectedPartyCodes.includes(partyCode)}
                      className={`ps-party-option ps-warehouse-option${
                        selectedPartyCodes.includes(partyCode) ? " is-selected" : ""
                      }`}
                      onClick={() => handlePartyClick(party)}
                    >
                      <span className="ps-party-option-row">
                        <span
                          className={`ps-party-check${
                            selectedPartyCodes.includes(partyCode) ? " is-selected" : ""
                          }`}
                        />
                        <span className="ps-party-option-text">
                          <span className="ps-party-option-main">{partyName || partyCode}</span>
                          <span className="ps-party-option-meta">
                            {partyCode}
                            {party.open_sales_order_count !== undefined
                              ? ` | ${party.open_sales_order_count} open`
                              : ""}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })
                ) : (
                  <div className="ps-warehouse-empty">No party found</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          className={`ps-warehouse-dropdown${categoryDropdownOpen ? " open" : ""}`}
          ref={categoryDropdownRef}
        >
          <button
            type="button"
            className="ps-warehouse-trigger"
            onClick={() => setCategoryDropdownOpen((open) => !open)}
          >
            <span>{categoryFilterLabel}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="#64748b"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {categoryDropdownOpen && (
            <div className="ps-warehouse-menu">
              <div className="ps-warehouse-options">
                <button
                  type="button"
                  className={`ps-warehouse-option${categoryFilter === "all" ? " is-selected" : ""}`}
                  onClick={() => {
                    setCategoryFilter("all");
                    setCategoryDropdownOpen(false);
                  }}
                >
                  All Categories
                </button>
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <button
                      type="button"
                      key={category}
                      className={`ps-warehouse-option${
                        normalizeText(category) === categoryFilter ? " is-selected" : ""
                      }`}
                      onClick={() => {
                        setCategoryFilter(normalizeText(category));
                        setCategoryDropdownOpen(false);
                      }}
                    >
                      {category}
                    </button>
                  ))
                ) : (
                  <div className="ps-warehouse-empty">No category found</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          className={`ps-warehouse-dropdown${warehouseDropdownOpen ? " open" : ""}`}
          ref={warehouseDropdownRef}
        >
          <button
            type="button"
            className="ps-warehouse-trigger"
            onClick={() => {
              setWarehouseDropdownOpen((open) => !open);
              setWarehouseSearch("");
            }}
          >
            <span>{warehouseFilterLabel}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="#64748b"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {warehouseDropdownOpen && (
            <div className="ps-warehouse-menu">
              <div className="ps-warehouse-search-wrap">
                <HiMagnifyingGlass />
                <input
                  type="text"
                  className="ps-warehouse-search-input"
                  placeholder="Search warehouse code..."
                  value={warehouseSearch}
                  onChange={(event) => setWarehouseSearch(event.target.value)}
                  autoFocus
                />
              </div>
              <div className="ps-warehouse-options">
                {warehouses.length > 0 && (
                  <div className="ps-party-bulk-actions">
                    <button
                      type="button"
                      className="ps-party-bulk-btn"
                      onClick={() => {
                        setWarehouseFilters(warehouses);
                        setWarehouseSearch("");
                      }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="ps-party-bulk-btn"
                      onClick={() => {
                        setWarehouseFilters([]);
                        setWarehouseSearch("");
                      }}
                    >
                      Deselect All
                    </button>
                  </div>
                )}
                {filteredWarehouses.length > 0 ? (
                  filteredWarehouses.map((warehouseCode) => (
                    <button
                      type="button"
                      key={warehouseCode}
                      aria-pressed={warehouseFilters.includes(warehouseCode)}
                      className={`ps-party-option ps-warehouse-option${
                        warehouseFilters.includes(warehouseCode) ? " is-selected" : ""
                      }`}
                      onClick={() => {
                        toggleWarehouseFilter(warehouseCode);
                      }}
                    >
                      <span className="ps-party-option-row">
                        <span
                          className={`ps-party-check${
                            warehouseFilters.includes(warehouseCode) ? " is-selected" : ""
                          }`}
                        />
                        <span className="ps-party-option-main">{warehouseCode}</span>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="ps-warehouse-empty">No warehouse found</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          className={`ps-warehouse-dropdown${stockDropdownOpen ? " open" : ""}`}
          ref={stockDropdownRef}
        >
          <button
            type="button"
            className="ps-warehouse-trigger"
            onClick={() => setStockDropdownOpen((open) => !open)}
          >
            <span>{stockFilterLabel}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="#64748b"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {stockDropdownOpen && (
            <div className="ps-warehouse-menu">
              <div className="ps-warehouse-options">
                <div className="ps-party-bulk-actions">
                  <button
                    type="button"
                    className="ps-party-bulk-btn"
                    onClick={() => setStockFilters(STOCK_OPTIONS.map((option) => option.value))}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="ps-party-bulk-btn"
                    onClick={() => setStockFilters([])}
                  >
                    Deselect All
                  </button>
                </div>
                {STOCK_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    aria-pressed={stockFilters.includes(option.value)}
                    className={`ps-party-option ps-warehouse-option${
                      stockFilters.includes(option.value) ? " is-selected" : ""
                    }`}
                    onClick={() => toggleStockFilter(option.value)}
                  >
                    <span className="ps-party-option-row">
                      <span
                        className={`ps-party-check${
                          stockFilters.includes(option.value) ? " is-selected" : ""
                        }`}
                      />
                      <span className="ps-party-option-main">{option.label}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {selectedProductCode && (
        <section className="ps-product-demand-panel">
          <div className="ps-product-demand-head">
            <div>
              <span className="ps-order-modal-kicker">Product Demand</span>
              <h2>{selectedProduct?.item_name || selectedProductCode}</h2>
              <p>
                {selectedProductCode} | {selectedProductPartyCount} parties | Required{" "}
                {formatQuantity(selectedProductRequiredQty)}
              </p>
            </div>
            <button type="button" className="ps-order-action-btn" onClick={() => clearProductDemand()}>
              Clear
            </button>
          </div>

          {productOrdersLoading ? (
            <div className="ps-product-demand-state">
              <span className="ps-spinner" />
              Loading parties and sales orders...
            </div>
          ) : productOrderError ? (
            <div className="ps-product-demand-state ps-state-error">
              <HiExclamationTriangle />
              {productOrderError}
            </div>
          ) : productDemandRows.length === 0 ? (
            <div className="ps-product-demand-state">
              <HiDocumentText />
              No open sales order found for this product.
            </div>
          ) : (
            <div className="ps-product-demand-table-wrap">
              <table className="ps-order-table ps-product-demand-table">
                <thead>
                  <tr>
                    <th>Party</th>
                    <th>Sales Order</th>
                    <th>Due Date</th>
                    <th>Warehouse</th>
                    <th>Open Qty</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {productDemandRows.map((row) => {
                    const lineStock = getProductLineStock(row.line);
                    const openQty = toStockNumber(row.line.OpenQty);
                    const rowKey = `${row.order.CardCode}-${row.order.DocEntry}-${row.line.LineNum}`;

                    return (
                      <tr key={rowKey}>
                        <td>
                          <span className="ps-order-doc">{row.order.CardName || row.order.CardCode}</span>
                          <span className="ps-order-ref">{row.order.CardCode}</span>
                        </td>
                        <td>
                          <span className="ps-order-doc">SO #{row.order.DocNum || row.order.DocEntry}</span>
                          {row.order.NumAtCard && <span className="ps-order-ref">Ref: {row.order.NumAtCard}</span>}
                        </td>
                        <td>{formatOrderDate(row.order.DocDueDate)}</td>
                        <td>{getOrderLineWarehouseCode(row.line) || "-"}</td>
                        <td className="ps-order-qty">{formatQuantity(openQty)}</td>
                        <td className={`ps-order-qty ${lineStock - openQty < 0 ? "ps-stock-negative" : ""}`}>
                          {formatQuantity(lineStock)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="ps-table-card">
        {loading || partyOrdersLoading || productOrdersLoading ? (
          <div className="ps-state">
            <span className="ps-spinner" />
            {partyOrdersLoading || productOrdersLoading ? "Loading ordered products..." : "Loading stock..."}
          </div>
        ) : error ? (
          <div className="ps-state ps-state-error">
            <HiExclamationTriangle />
            {error}
          </div>
        ) : pageProducts.length === 0 ? (
          <div className="ps-state">
            <HiCube />
            No stock records found.
          </div>
        ) : (
          <div className="ps-table-wrap">
            <table className="ps-table">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Pack</th>
                  <th>Warehouse Stock</th>
                  <th>Warehouse Qty Ltrs</th>
                  <th>Order Required Qty</th>
                  <th>Left Over</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pageProducts.map((product) => {
                  const stock = product.display_stock;
                  const partyDemand = product.display_party_demand;
                  const pendingRequiredQty = product.display_required_qty;
                  const leftOverStock = product.display_left_over_stock;
                  const status = getStockStatus(stock, leftOverStock);
                  const partyDemandRows = getPartyDemandRows(partyDemand);
                  const canShowPartyDemand = selectedPartyCodes.length > 0 && partyDemandRows.length > 0;
                  const isDemandExpanded = expandedDemandKey === product.display_key;
                  const isProductDemandLoading =
                    productOrdersLoading && selectedProductCode === String(product.item_code || "").trim();
                  const warehouseQtyLtrs = getWarehouseQtyLtrs(product);

                  return (
                    <Fragment key={product.display_key}>
                    <tr
                      className={status === "shortage" || status === "out" ? "ps-row-out" : ""}
                    >
                      <td className="ps-code">{product.item_code || "-"}</td>
                      <td>
                        <button
                          type="button"
                          className={`ps-product-name-btn${product.item_code ? " has-demand" : ""}`}
                          onClick={() => {
                            if (!product.item_code) return;
                            if (!canShowPartyDemand || selectedProductCode !== product.item_code) {
                              void selectProductDemand(product);
                              return;
                            }
                            setExpandedDemandKey((current) =>
                              current === product.display_key ? "" : product.display_key
                            );
                          }}
                          disabled={isProductDemandLoading}
                        >
                          <span className="ps-product-name">{product.item_name || "-"}</span>
                          {product.item_code && (
                            <span className="ps-product-demand-hint">
                              {isProductDemandLoading
                                ? "Loading"
                                : canShowPartyDemand
                                  ? isDemandExpanded ? "Hide parties" : "View parties"
                                  : "Check parties"}
                            </span>
                          )}
                        </button>
                      </td>
                      <td>{product.category || "-"}</td>
                      <td>{product.sal_pack_unit || "-"}</td>
                      <td className="ps-stock">{formatQuantity(stock)}</td>
                      <td className="ps-stock">{formatRoundedQuantity(warehouseQtyLtrs)}</td>
                      <td className="ps-stock">
                        <span className="ps-required-qty">{formatQuantity(pendingRequiredQty)}</span>
                      </td>
                      <td className={`ps-stock ${leftOverStock < 0 ? "ps-stock-negative" : ""}`}>
                        {formatQuantity(leftOverStock)}
                      </td>
                      <td>
                        <span className={`ps-badge ps-badge-${status}`}>
                          {getStatusLabel(status)}
                        </span>
                      </td>
                    </tr>
                    {canShowPartyDemand && isDemandExpanded && (
                      <tr className="ps-demand-detail-row">
                        <td colSpan={9}>
                          <div className="ps-demand-detail-panel">
                            <div className="ps-demand-detail-title">Ordered by</div>
                            <div className="ps-demand-detail-list">
                              {partyDemandRows.map((row) => (
                                <span className="ps-demand-party-chip" key={row.partyCode}>
                                  <strong>{row.partyName}</strong>
                                  <small>{row.partyCode}</small>
                                  <em>{formatQuantity(row.qty)}</em>
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {filteredProducts.length > ITEMS_PER_PAGE && (
        <div className="ps-pagination">
          <span className="ps-page-count">
            Showing {pageStart + 1}-{Math.min(pageStart + ITEMS_PER_PAGE, filteredProducts.length)} of{" "}
            {filteredProducts.length}
          </span>
          <div className="ps-page-actions">
            <button
              className="ps-page-btn"
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => page - 1)}
            >
              Prev
            </button>
            <span className="ps-page-number">
              {currentPage} / {totalPages}
            </span>
            <button
              className="ps-page-btn"
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((page) => page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {orderModal && (
        <div className="ps-modal-overlay" role="presentation" onMouseDown={closeOrderModal}>
          <div
            className="ps-order-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ps-order-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ps-order-modal-head">
              <div>
                <span className="ps-order-modal-kicker">Open Sales Orders</span>
                <h2 id="ps-order-modal-title">{getPartyName(orderModal.party) || getPartyCode(orderModal.party)}</h2>
                <p>{getPartyCode(orderModal.party)}</p>
              </div>
              <button type="button" className="ps-modal-close" onClick={closeOrderModal} aria-label="Close">
                <HiXMark />
              </button>
            </div>

            <div className="ps-order-modal-body">
              {orderModal.loading ? (
                <div className="ps-state ps-order-modal-state">
                  <span className="ps-spinner" />
                  Loading open sales orders...
                </div>
              ) : orderModal.error ? (
                <div className="ps-state ps-state-error ps-order-modal-state">
                  <HiExclamationTriangle />
                  {orderModal.error}
                </div>
              ) : orderModal.orders.length === 0 ? (
                <div className="ps-state ps-order-modal-state">
                  <HiDocumentText />
                  No open sales orders found.
                </div>
              ) : (
                <>
                  <label className="ps-order-search">
                    <HiMagnifyingGlass />
                    <input
                      type="text"
                      value={orderSearch}
                      onChange={(event) => setOrderSearch(event.target.value)}
                      placeholder="Search SO number or reference"
                      autoFocus
                    />
                  </label>
                  <div className="ps-order-modal-actions">
                    <span>{selectedModalOrderCount} selected for this party</span>
                    <div>
                      <button
                        type="button"
                        className="ps-order-action-btn"
                        onClick={selectVisibleSalesOrders}
                        disabled={filteredModalOrders.length === 0}
                      >
                        Select Visible
                      </button>
                      <button
                        type="button"
                        className="ps-order-action-btn"
                        onClick={clearModalPartyOrders}
                        disabled={selectedModalOrderCount === 0}
                      >
                        Clear Party
                      </button>
                      <button type="button" className="ps-order-action-btn primary" onClick={closeOrderModal}>
                        Done
                      </button>
                    </div>
                  </div>
                  {filteredModalOrders.length === 0 ? (
                    <div className="ps-state ps-order-modal-state">
                      <HiDocumentText />
                      No sales order found for this search.
                    </div>
              ) : (
                <div className="ps-order-table-wrap">
                  <table className="ps-order-table">
                    <thead>
                      <tr>
                        <th>Sales Order</th>
                        <th>Order Date</th>
                        <th>Due Date</th>
                        <th>Items</th>
                        <th>Open Qty</th>
                        <th>Select</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredModalOrders.map((order) => {
                        const totalOpenQty = (order.lines || []).reduce(
                          (sum, line) => sum + toStockNumber(line.OpenQty),
                          0,
                        );
                        const uniqueItems = new Set(
                          (order.lines || [])
                            .map((line) => getOrderLineItemCode(line))
                            .filter(Boolean),
                        );
                        const modalPartyCode = getPartyCode(orderModal.party);
                        const isSelected = Boolean(
                          selectedSalesOrders[getSalesOrderKeyForParty(order, modalPartyCode)]
                        );

                        return (
                          <tr
                            className={isSelected ? "is-selected" : ""}
                            key={getSalesOrderKeyForParty(order, modalPartyCode)}
                          >
                            <td>
                              <span className="ps-order-doc">SO #{order.DocNum || order.DocEntry}</span>
                              {order.NumAtCard && <span className="ps-order-ref">Ref: {order.NumAtCard}</span>}
                            </td>
                            <td>{formatOrderDate(order.DocDate)}</td>
                            <td>{formatOrderDate(order.DocDueDate)}</td>
                            <td>
                              <span className="ps-order-pill">{uniqueItems.size}</span>
                            </td>
                            <td className="ps-order-qty">{formatQuantity(totalOpenQty)}</td>
                            <td>
                              <button
                                type="button"
                                className="ps-order-select-btn"
                                onClick={() => toggleSalesOrder(order)}
                              >
                                {isSelected ? "Remove" : "Add"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
