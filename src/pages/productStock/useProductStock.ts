/**
 * All Product Stock state, effects and derived data — the two mount reads,
 * every dropdown filter, the party/product demand lookups, the order modal,
 * and the paginated, grouped `filteredProducts` list the table renders.
 *
 * Split out of `Product_Stock.tsx` (Phase 4 decomposition), following the
 * `useDashboard` / `useSalesOrderForm` convention: one hook owns everything,
 * `Product_Stock.tsx` and `components/*` just destructure the pieces they
 * render.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { startExcelExport, exportDateStamp } from "../../utils/excelExport";
import { sapService } from "../../services/sapService";
import type { Party, SapSalesOrder } from "../../services/sapService";

import {
  ITEMS_PER_PAGE,
  NO_PARTIES,
  NO_PRODUCTS,
  getDemandByItemFromOrders,
  getItemCodeFromStockKey,
  getLeftOverStock,
  getOrderLineItemCode,
  getOrderLineWarehouseCode,
  getPartyCode,
  getPartyName,
  getPartySearchText,
  getPendingRequiredQty,
  getProductGroupKey,
  getRequiredQtyLtrs,
  getSalesOrderKey,
  getStatusLabel,
  getStockKey,
  getStockStatus,
  getWarehouseQtyLtrs,
  getWarehouseStock,
  mergePartyDemand,
  normalizeProducts,
  normalizeText,
  toStockNumber,
} from "./productStockUtils";
import type {
  OrderModalState,
  PartyDemand,
  PartyDemandRow,
  ProductDemandRow,
  ProductOption,
  StockDisplayProduct,
  StockStatus,
} from "./types";

export function useProductStock() {
  const queryClient = useQueryClient();
  /* The two mount reads. `openParties` swallowed its error into a
     `console.error` and left an empty list, which on a filter dropdown is
     indistinguishable from "no parties have open orders". */
  const {
    data: products = NO_PRODUCTS,
    isPending: loading,
    isError: stockFailed,
  } = useQuery({
    queryKey: ["sap", "product-stock"],
    queryFn: async () => normalizeProducts(await sapService.getProductStock()),
  });
  const error = stockFailed ? "Unable to load stock data." : "";

  const { data: openParties = NO_PARTIES } = useQuery({
    queryKey: ["sap", "open-parties"],
    queryFn: () => sapService.getOpenParties(),
  });
  const [selectedPartyCodes, setSelectedPartyCodes] = useState<string[]>([]);
  const [partySearch, setPartySearch] = useState("");
  /*
   * The party picker is a DIALOG now, not a popover — clicking a party in it
   * does not set a value, it opens that party's open sales orders. A row that
   * looks like a checkbox but opens a modal is the kind of control that has to
   * be explained, so it is a list of parties in a dialog that says so.
   */
  const [partyPickerOpen, setPartyPickerOpen] = useState(false);
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
  const [typeFilter, setTypeFilter] = useState("all");
  const [warehouseFilters, setWarehouseFilters] = useState<string[]>([]);
  const [stockFilters, setStockFilters] = useState<StockStatus[]>([]);
  const [expandedDemandKey, setExpandedDemandKey] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchProducts = () =>
    queryClient.invalidateQueries({ queryKey: ["sap", "product-stock"] });

  /*
   * The five `…DropdownOpen` flags, their five refs and the one
   * `document.addEventListener("mousedown")` that closed all of them are gone.
   * Category and Type are native selects, Warehouse and Stock are
   * `FilterMultiSelect` (which owns its own open state, Escape and
   * outside-click — DESIGN_SYSTEM §5a), and Party is a dialog.
   */

  const fetchOpenParties = () =>
    queryClient.invalidateQueries({ queryKey: ["sap", "open-parties"] });

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
          selectedPartyCodes.map((partyCode) => sapService.getOpenSalesOrders(partyCode)),
        );

        const demand = partyOrderResponses.reduce<Record<string, PartyDemand>>(
          (current, orders, index) => {
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
          },
          {},
        );

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

  const types = useMemo(() => {
    const values = products
      .map((product) => product.type)
      .filter((value): value is string => Boolean(value && value.trim()));

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
      (first.item_name || first.item_code).localeCompare(second.item_name || second.item_code),
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
    if (openParties.length > 0 && selectedParties.length === openParties.length)
      return "All Parties";
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
    setPartyPickerOpen(false);
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
    const partyCode = String(
      order.CardCode || (orderModal ? getPartyCode(orderModal.party) : ""),
    ).trim();
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
        (selectedOrder) => String(selectedOrder.CardCode || "").trim() === partyCode,
      );
      setSelectedPartyCodes((currentParties) => {
        if (partyHasOrders) {
          return currentParties.includes(partyCode)
            ? currentParties
            : [...currentParties, partyCode];
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
      current.includes(partyCode) ? current : [...current, partyCode],
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
        .map((line) => ({ order, line })),
    );
  }, [productOrders, selectedProductCode]);

  const selectedProductRequiredQty = useMemo(
    () => productDemandRows.reduce((sum, row) => sum + toStockNumber(row.line.OpenQty), 0),
    [productDemandRows],
  );

  const selectedProductPartyCount = useMemo(
    () =>
      new Set(
        productDemandRows.map((row) => String(row.order.CardCode || "").trim()).filter(Boolean),
      ).size,
    [productDemandRows],
  );

  const getProductLineStock = (line: SapSalesOrder["lines"][number]) => {
    const stockRow = products.find(
      (product) =>
        String(product.item_code || "").trim() === getOrderLineItemCode(line) &&
        String(product.warehouse_code || "").trim() === getOrderLineWarehouseCode(line),
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
        Array.from(
          new Set(orders.map((order) => String(order.CardCode || "").trim()).filter(Boolean)),
        ),
      );
      setSelectedSalesOrders(
        orders.reduce<Record<string, SapSalesOrder>>((current, order) => {
          const partyCode = String(order.CardCode || "").trim();
          if (!partyCode) return current;
          current[getSalesOrderKey({ ...order, CardCode: partyCode })] = {
            ...order,
            CardCode: partyCode,
          };
          return current;
        }, {}),
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

    return orderModal.orders.filter(
      (order) =>
        normalizeText(order.DocNum).includes(search) ||
        normalizeText(order.DocEntry).includes(search) ||
        normalizeText(order.NumAtCard).includes(search),
    );
  }, [orderModal, orderSearch]);

  const selectedModalOrderCount = useMemo(() => {
    if (!orderModal) return 0;
    const partyCode = getPartyCode(orderModal.party);
    return Object.values(selectedSalesOrders).filter(
      (order) => String(order.CardCode || "").trim() === partyCode,
    ).length;
  }, [orderModal, selectedSalesOrders]);

  const toggleStockFilter = (status: StockStatus) => {
    setStockFilters((current) =>
      current.includes(status) ? current.filter((value) => value !== status) : [...current, status],
    );
  };

  const toggleWarehouseFilter = (warehouseCode: string) => {
    setWarehouseFilters((current) =>
      current.includes(warehouseCode)
        ? current.filter((code) => code !== warehouseCode)
        : [...current, warehouseCode],
    );
  };

  const getPartyDemandRows = (demand?: PartyDemand): PartyDemandRow[] => {
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
      .sort(
        (first, second) =>
          second.qty - first.qty || first.partyName.localeCompare(second.partyName),
      );
  };

  const filteredProducts = useMemo<StockDisplayProduct[]>(() => {
    const search = normalizeText(searchText);
    const hasSelectedOrderFilter = Object.keys(selectedSalesOrders).length > 0;
    const hasActiveDemandFilter = hasSelectedOrderFilter || selectedPartyCodes.length > 0;
    const shouldGroupWarehouses = hasSelectedOrderFilter || warehouseFilters.length !== 1;
    const selectedOrderDemandByItemCode = getDemandByItemFromOrders(
      Object.values(selectedSalesOrders),
    );
    const partyWideDemandByItemCode = Object.entries(partyOrderProducts).reduce<
      Record<string, PartyDemand>
    >((current, [stockKey, demand]) => {
      const itemCode = getItemCodeFromStockKey(stockKey);
      if (!itemCode) return current;
      current[itemCode] = mergePartyDemand(current[itemCode] || { qty: 0, parties: {} }, demand);
      return current;
    }, {});
    const demandByItemCode = hasSelectedOrderFilter
      ? selectedOrderDemandByItemCode
      : partyWideDemandByItemCode;

    const rowMatches = products.filter((product) => {
      const stock = getWarehouseStock(product);
      const productStockKey = getStockKey(product.item_code, product.warehouse_code);
      const partyRequiredQty = partyOrderProducts[productStockKey]?.qty;
      const itemDemand = demandByItemCode[String(product.item_code || "").trim()];
      const pendingQty = hasSelectedOrderFilter
        ? itemDemand?.qty
        : selectedPartyCodes.length > 0
          ? partyRequiredQty
          : getPendingRequiredQty(product);
      const leftOverStock = hasActiveDemandFilter
        ? stock - toStockNumber(pendingQty)
        : getLeftOverStock(product);
      const status = getStockStatus(stock, leftOverStock);
      const matchesPartyOrders =
        !hasActiveDemandFilter ||
        (hasSelectedOrderFilter
          ? itemDemand !== undefined
          : shouldGroupWarehouses
            ? itemDemand !== undefined
            : partyRequiredQty !== undefined);

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
      const matchesType = typeFilter === "all" || normalizeText(product.type) === typeFilter;
      const matchesWarehouse =
        warehouseFilters.length === 0 ||
        warehouseFilters.includes(String(product.warehouse_code || "").trim());
      const matchesStock =
        shouldGroupWarehouses || stockFilters.length === 0 || stockFilters.includes(status);

      return (
        matchesSearch &&
        matchesPartyOrders &&
        matchesCategory &&
        matchesType &&
        matchesWarehouse &&
        matchesStock
      );
    });

    const displayProducts = shouldGroupWarehouses
      ? Array.from(
          rowMatches
            .reduce<Map<string, StockDisplayProduct>>((current, product) => {
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
                existing.display_left_over_stock =
                  existing.display_stock - existing.display_required_qty;
                existing.display_party_demand = mergePartyDemand(
                  existing.display_party_demand || { qty: 0, parties: {} },
                  rowPartyDemand,
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
                display_left_over_stock:
                  stock - (hasActiveDemandFilter ? itemDemand?.qty || 0 : requiredQty),
                display_party_demand: hasActiveDemandFilter
                  ? itemDemand
                  : rowPartyDemand
                    ? mergePartyDemand({ qty: 0, parties: {} }, rowPartyDemand)
                    : undefined,
              });
              return current;
            }, new Map())
            .values(),
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
        if (firstLeftOverStock !== secondLeftOverStock)
          return firstLeftOverStock - secondLeftOverStock;
        if (firstStock !== secondStock) return firstStock - secondStock;

        return (first.item_name || first.item_code || "").localeCompare(
          second.item_name || second.item_code || "",
        );
      });
  }, [
    categoryFilter,
    typeFilter,
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
        current.pendingRequiredLtrs += getRequiredQtyLtrs(product);
        current.leftOverStock += leftOverStock;
        current[status] += 1;
        if (product.item_code) uniqueProducts.add(`${product.item_code}-${product.category ?? ""}`);
        return current;
      },
      {
        totalStock: 0,
        pendingRequired: 0,
        pendingRequiredLtrs: 0,
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
  }, [
    categoryFilter,
    typeFilter,
    searchText,
    selectedPartyCodes,
    selectedProductCode,
    stockFilters,
    warehouseFilters,
  ]);

  const hasSelectedSalesOrders = Object.keys(selectedSalesOrders).length > 0;

  const downloadSelectedOrdersExcel = () => {
    if (!hasSelectedSalesOrders || filteredProducts.length === 0) return;

    const excelData = filteredProducts.map((product) => {
      const stock = product.display_stock;
      const leftOverStock = product.display_left_over_stock;
      return {
        "Item Code": product.item_code || "",
        Product: product.item_name || "",
        Category: product.category || "",
        Type: product.type || "",
        Pack: product.sal_pack_unit ?? "",
        "Warehouse Stock": stock,
        "Warehouse Qty Ltrs": Math.round(getWarehouseQtyLtrs(product)),
        "Order Required Qty": product.display_required_qty,
        "Order Required Qty Ltrs": Math.round(getRequiredQtyLtrs(product)),
        "Left Over": leftOverStock,
        Status: getStatusLabel(getStockStatus(stock, leftOverStock)),
      };
    });

    startExcelExport(excelData, {
      fileName: `Selected_SO_Stock_${exportDateStamp()}.xlsx`,
      sheetName: "Selected SO Stock",
      totalsRow: {
        sum: ["Warehouse Stock", "Order Required Qty", "Order Required Qty Ltrs", "Left Over"],
        labelColumn: "Status",
        label: "TOTAL",
      },
    });
  };

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const pageStart = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageProducts = filteredProducts.slice(pageStart, pageStart + ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return {
    // Mount reads
    loading,
    error,
    openParties,

    // Party filter
    selectedPartyCodes,
    setSelectedPartyCodes,
    partySearch,
    setPartySearch,
    partyPickerOpen,
    setPartyPickerOpen,
    partyOrdersLoading,
    partyOrderProducts,
    setSelectedSalesOrders,
    selectedSalesOrders,
    filteredOpenParties,
    selectedParties,
    partyFilterLabel,
    handlePartyClick,

    // Order modal
    orderModal,
    setOrderModal,
    orderSearch,
    setOrderSearch,
    closeOrderModal,
    toggleSalesOrder,
    selectVisibleSalesOrders,
    clearModalPartyOrders,
    filteredModalOrders,
    selectedModalOrderCount,

    // Product demand panel
    selectedProductCode,
    productOrders,
    productOrdersLoading,
    productOrderError,
    selectedProduct,
    productDemandRows,
    selectedProductRequiredQty,
    selectedProductPartyCount,
    getProductLineStock,
    clearProductDemand,
    selectProductDemand,

    // Search + category/type/warehouse/stock filters
    searchText,
    setSearchText,
    categoryFilter,
    setCategoryFilter,
    categories,
    typeFilter,
    setTypeFilter,
    types,
    warehouseFilters,
    setWarehouseFilters,
    warehouses,
    toggleWarehouseFilter,
    stockFilters,
    setStockFilters,
    toggleStockFilter,

    // Table
    expandedDemandKey,
    setExpandedDemandKey,
    filteredProducts,
    summary,
    getPartyDemandRows,

    // Pagination
    currentPage,
    setCurrentPage,
    totalPages,
    pageStart,
    pageProducts,

    // Header actions
    hasSelectedSalesOrders,
    downloadSelectedOrdersExcel,
    fetchProducts,
    fetchOpenParties,
  };
}

export type ProductStockState = ReturnType<typeof useProductStock>;
