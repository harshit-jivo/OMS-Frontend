/**
 * The Excel shape of an order — one row per line item.
 *
 * Daily, PersonWise and Sales Report each carried a verbatim copy of
 * `buildOrderRows` and `ORDER_TOTALS`: ninety lines apiece, with the same
 * twenty-three column headings, which is twenty-three ways for the three
 * downloads to drift apart. One copy here; the three file names stay with
 * the pages, because that is the only thing that differed.
 *
 * Raw values only — `startExcelExport` infers the Excel type per column, so
 * dates stay dates and money stays numeric and summable.
 */
import type { Order, OrderItem } from "@/services/ordersService";
import {
  getOrderItemSchemeNames,
  getOrderItemSchemeQtyText,
  getOrderItemTotalLtrs,
} from "@/services/ordersService";
import { startExcelExport } from "@/utils/excelExport";

export function buildOrderRows(order: Order): Record<string, unknown>[] {
  if (!order.items || order.items.length === 0) {
    return [
      {
        "Order Number": order.order_number,
        "Card Code": order.card_code,
        "Card Name": order.card_name,
        "Created At": order.created_at,
        "Bill To": order.bill_to_address,
        "Ship To": order.ship_to_address,
        "Delivery Date": order.delivery_date,
        Status: order.status_display,
        FOC: Boolean(order.is_foc),
        // Item columns are held open so an order with no line items still
        // produces the same sheet layout as every other export.
        "Item Code": null,
        "Item Name": null,
        Scheme: null,
        "Scheme Qty": null,
        Qty: null,
        Boxes: null,
        Liters: null,
        "Total Ltrs": null,
        "Price List (Basic)": null,
        "Basic Price": null,
        "Tax Rate": null,
        "Total Amount": null,
        "Grand Total": null,
      },
    ];
  }

  return order.items.map((item: OrderItem) => {
    const total = Number(item.total || 0);
    const taxRate = Number(item.tax_rate || 0);
    return {
      "Order Number": order.order_number,
      "Card Code": order.card_code,
      "Card Name": order.card_name,
      "Created At": order.created_at,
      "Bill To": order.bill_to_address,
      "Ship To": order.ship_to_address,
      "Delivery Date": order.delivery_date,
      Status: order.status_display,
      FOC: Boolean(order.is_foc),
      "Item Code": item.item_code,
      "Item Name": item.item_name,
      Scheme: getOrderItemSchemeNames(item),
      "Scheme Qty": getOrderItemSchemeQtyText(item),
      Qty: item.qty,
      Boxes: item.boxes,
      Liters: item.ltrs,
      "Total Ltrs": getOrderItemTotalLtrs(item),
      "Price List (Basic)": item.price_list_basic,
      "Basic Price": item.basic_price,
      "Tax Rate": taxRate,
      "Total Amount": total,
      "Grand Total": total + (total * taxRate) / 100,
    };
  });
}

export const ORDER_TOTALS = {
  sum: ["Total Amount", "Grand Total"],
  labelColumn: "Tax Rate",
  label: "TOTAL",
};

/** One order to its own workbook. */
export function downloadOrderExcel(order: Order) {
  startExcelExport(buildOrderRows(order), {
    fileName: `Order_${order.order_number}.xlsx`,
    sheetName: "Order Details",
    totalsRow: ORDER_TOTALS,
  });
}

/** Every order in the current report, flattened to one sheet. */
export function downloadOrdersExcel(orders: Order[], fileName: string) {
  if (orders.length === 0) return;
  startExcelExport(orders.flatMap(buildOrderRows), {
    fileName,
    sheetName: "All Orders",
    totalsRow: ORDER_TOTALS,
  });
}
